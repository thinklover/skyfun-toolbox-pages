/**
 * 行政點數表：星鴻審核時間紀錄、補助審核（Worker）＋人力明細／組長手填點數（Supabase）
 */
(function () {
  const Core = window.AdminPointsCore;
  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  /** 清冊總件數快照：true＝優先讀快照；false＝完全走舊即時路徑 */
  const USE_ROSTER_SNAPSHOT = true;
  const ITEMS = Core.AUTO_ITEMS;
  const MANUAL_KEYS = Core.MANUAL_ITEMS.map((i) => i.key);
  const $ = (id) => document.getElementById(id);
  /** 個人明細先只在預覽站與本機開放，正式站隱藏 */
  const PERSON_OPEN = true;
  if (!PERSON_OPEN) document.querySelector('.apt-tab[data-tab="person"]')?.setAttribute('hidden', '');

  const state = {
    inited: false,
    loading: false,
    monthKey: '',
    result: null,
    meta: null,
    tab: 'month',
    person: '',
    personView: 'home',
    trainNode: 'guide',
    trainWeeksOpen: {},
    nonAdminOpen: false,
    personErrOpen: false,
    year: null,
    yearCache: new Map(),
    week: '',
    leader: '',
    area: '',
    areaOffice: '',
    spot: null,
    durBy: 'all',
    durView: 'rank',
    durPerson: '',
    durCity: '',
    durSorts: {
      rank: { key: 'avg', dir: 1 },
      quality: { key: 'rate', dir: -1 },
      qualityCmp: { key: 'diff', dir: -1 },
      region: { key: 'name', dir: 1 },
      detail: { key: 'time', dir: -1 },
      weekly: { key: 'weekPoints', dir: -1 },
      areaOffice: { key: 'office', dir: 1 },
      areaStaff: { key: 'weekPoints', dir: -1 }
    },
    auditRows: [],
    sb: null,
    prev: null,
    pick: null,
    openPoint: '',
    lkpi: null,
    guildOpen: null,
    leaseFolded: false,
    courseOpen: {},
    trainShut: true,
    guildYear: null,
    guildSys: new Map(),
    guildOff: new Map(),
    rosterOff: new Map(),
    rosterSnap: new Map(),
    guildOffOpen: ''
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function fmtSnapTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    } catch {
      return String(iso);
    }
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function monthOptions() {
    const now = Core.perfMonthOf(new Date());
    const list = [];
    let { year, month } = now;
    for (let i = 0; i < 6; i++) {
      if (list.length && Core.beforeFirstPerf(year, month)) break;
      list.push(Core.perfMonthRange(year, month));
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    return list;
  }

  function setMsg(text, kind) {
    const el = $('apt-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'apt-msg' + (kind ? ' is-' + kind : '');
  }

  async function fetchWorker(path, label, range, refresh) {
    const q = new URLSearchParams({ start: range.start, end: range.end });
    if (refresh) q.set('refresh', '1');
    let res;
    try {
      res = await fetch(`${RPA_BASE}${path}?${q}`, {
        headers: { 'X-Skyfun-Session': token() }
      });
    } catch {
      throw new Error('連不到星鴻資料服務（Worker），可能尚未部署行政點數表端點或網路中斷');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `${label}讀取失敗（HTTP ${res.status}）`);
    }
    return data;
  }

  /** 解約讀取失敗不影響其他點數，只在畫面提示 */
  async function fetchTerminations(range, refresh) {
    try {
      return await fetchWorker('/admin-points/terminations', '解約', range, refresh);
    } catch (err) {
      return { ok: false, fields: [], rows: [], pending: 0, error: String(err.message || err) };
    }
  }

  function termNote(term) {
    if (!term) return '';
    if (term.error) return `解約資料暫時讀不到（${term.error}），解約點數先不計`;
    if (term.pending) return `解約還有 ${term.pending} 件審核記錄在補抓中，稍後重新整理會再增加`;
    return '';
  }

  async function fetchSupabase(range) {
    const data = await window.skyfunAuth.rpc('admin_points_view', {
      p_token: token(),
      p_start: range.start,
      p_end: range.end
    });
    if (!data?.ok) throw new Error(data?.error || '人力明細讀取失敗');
    const sb = Core.stripExcluded(data);
    sb.excluded.forEach((n) => excludedStaff.add(n));
    return sb;
  }

  /** 不列入任何統計的人（駐府人員），由 fetchSupabase 收集 */
  const excludedStaff = new Set();

  function auditRowsOf(payload) {
    return Core.dropExcludedRows(Core.rowsFromPayload(payload), excludedStaff);
  }

  async function load(refresh) {
    if (state.loading) return;
    if (!token()) {
      setMsg('請先登入工具箱', 'err');
      return;
    }
    const range = monthOptions().find((m) => `${m.year}-${m.month}` === state.monthKey) || monthOptions()[0];
    state.loading = true;
    $('apt-refresh')?.setAttribute('disabled', '');
    setMsg(`讀取 ${range.month} 月業績（${range.start}～${range.end}）…第一次約需 5～10 秒`);
    try {
      const [audit, expenses, term, sb] = await Promise.all([
        fetchWorker('/admin-points/audit-log', '審核時間紀錄', range, refresh),
        fetchWorker('/admin-points/expenses', '補助審核', range, refresh),
        fetchTerminations(range, refresh),
        fetchSupabase(range)
      ]);
      state.auditRows = auditRowsOf(audit);
      state.expenseRows = auditRowsOf(expenses);
      state.termRows = auditRowsOf(term);
      state.lkpi = null;
      state.lease = null;
      state.result = Core.compute(state.auditRows, {
        start: range.start,
        end: range.end,
        staff: sb.staff || [],
        exclude: sb.excluded,
        manual: sb.manual || [],
        opinions: sb.opinions || [],
        expenses: state.expenseRows,
        terminations: state.termRows
      });
      state.termNote = termNote(term);
      state.meta = { range, fetchedAt: audit.fetchedAt, total: audit.total, staffCount: (sb.staff || []).length };
      state.sb = sb;
      const today = Core.isoDate(new Date());
      const weeks = Core.weeksOf(range);
      if (!weeks.some((w) => w.start === state.week)) {
        const cur = weeks.filter((w) => w.start <= today);
        state.week = (cur[cur.length - 1] || weeks[0]).start;
      }
      if (state.person && (!state.result.people.some((p) => p.name === state.person) || !canSee(state.person))) state.person = '';
      if (!state.person && state.result.people.some((p) => p.name === myName())) state.person = myName();
      setMsg(state.termNote, state.termNote ? 'warn' : '');
      render();
      loadOpenOpinions();
    } catch (err) {
      setMsg(String(err.message || err), 'err');
    } finally {
      state.loading = false;
      $('apt-refresh')?.removeAttribute('disabled');
    }
  }

  function dayList() {
    const r = state.result;
    if (!r) return [];
    const today = Core.isoDate(new Date());
    const last = r.end < today ? r.end : today;
    const out = [];
    const d = new Date(r.start + 'T00:00:00');
    while (Core.isoDate(d) <= last) {
      out.push(Core.isoDate(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function stageBadge(stage) {
    if (stage === 2) return '<span class="apt-stage apt-stage--2">第二階段</span>';
    if (stage === 1) return '<span class="apt-stage apt-stage--1">第一階段</span>';
    return '';
  }

  function kindBadge(kind) {
    return kind === '工讀生' ? '<span class="apt-kind">工讀</span>' : '';
  }

  function adjustText(n) {
    return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
  }

  const OPINION_KEYS = new Set(Core.OPINION_ITEMS.map((i) => i.key));

  function manualTitle(t) {
    return MANUAL_KEYS.filter((k) => t.manualCounts[k] && !OPINION_KEYS.has(k)).map((k) => `${k} ${t.manualCounts[k]} 件`).join('、');
  }

  function tallyCells(t) {
    const cells = ITEMS.map((i) => `<td class="num">${t.counts[i.key] || NIL}</td>`).join('');
    const other = Core.otherManual(t);
    return (
      cells +
      `<td class="num">${t.qa || NIL}</td>` +
      Core.OPINION_ITEMS.map((i) => `<td class="num">${t.manualCounts?.[i.key] || NIL}</td>`).join('') +
      `<td class="num" title="${esc(manualTitle(t))}">${other || NIL}</td>`
    );
  }

  const TALLY_COLS = ITEMS.length + 2 + Core.OPINION_ITEMS.length;

  /** 四個字以上的表頭固定兩行：四期｜產編、行政｜QA；六個字上二下四：案件｜意見修正 */
  function headLabel(label) {
    const s = String(label);
    const cut = /QA$/.test(s) ? s.length - 2 : s.length >= 6 ? 2 : s.length >= 4 ? s.length - 2 : 0;
    return cut > 0 ? `${esc(s.slice(0, cut))}<br>${esc(s.slice(cut))}` : esc(s);
  }

  function headCells() {
    return (
      ITEMS.map((i) => `<th class="num">${headLabel(i.label)}<small>${esc(i.pointsText || `${i.points}點`)}</small></th>`).join('') +
      `<th class="num">${headLabel('行政QA')}<small>1-4點</small></th>` +
      Core.OPINION_ITEMS.map((i) => `<th class="num">${headLabel(i.label)}<small>1點</small></th>`).join('') +
      `<th class="num">${headLabel('人工計點')}</th>`
    );
  }

  function progress(total) {
    const pct = Math.min(100, (total / Core.STAGE_2) * 100);
    const mark = (Core.STAGE_1 / Core.STAGE_2) * 100;
    return `<span class="apt-bar" title="第一階段 ${Core.STAGE_1}、第二階段 ${Core.STAGE_2}"><span style="width:${pct}%"></span><i style="left:${mark}%"></i></span>`;
  }

  const GROUPS = [
    { key: '行政', note: '人力明細在職人員' },
    { key: '非行政', note: '有審核紀錄或教育訓練測試帳號、但不在人力明細' }
  ];

  function groupTitle(g, count, sum) {
    return `<h3 class="apt-group-title">${g.key}<small>${g.note} · ${count} 人 · ${sum} 點</small></h3>`;
  }

  /** 月累計名次底色：1–10 淡綠、11–20 白、21–30 淡黃、31 以後淡紅 */
  function rankBand(rank) {
    if (rank <= 10) return 'apt-band--green';
    if (rank <= 20) return 'apt-band--white';
    if (rank <= 30) return 'apt-band--yellow';
    return 'apt-band--red';
  }

  function renderMonth() {
    const legend = `<p class="apt-tone-legend">名次底色：
      <span class="apt-tone-chip apt-band--green">前 10 名</span>
      <span class="apt-tone-chip apt-band--white">11–20 名</span>
      <span class="apt-tone-chip apt-band--yellow">21–30 名</span>
      <span class="apt-tone-chip apt-band--red">31 名以後</span></p>`;
    const sheetNote = state.result.sheet
      ? `<p class="apt-sub-note apt-sheet-note">📋 本業績月的月累積以表單「${esc(state.result.sheet)}」為準；各項件數仍是系統爬取，跟表單的差額列為「表單校正」（月累積旁的 ± 數字）</p>`
      : '';
    return (
      legend +
      sheetNote +
      GROUPS.map((g) => {
        const people = state.result.people.filter((p) => p.group === g.key);
        if (g.key === '非行政' && !people.length) return '';
        const sum = people.reduce((s, p) => s + p.month.total, 0);
        if (g.key === '非行政') {
          return `<details class="apt-group-fold" data-fold="nonAdmin"${state.nonAdminOpen ? ' open' : ''}>
            <summary>${groupTitle(g, people.length, sum)}</summary>${monthTable(people)}</details>`;
        }
        return groupTitle(g, people.length, sum) + monthTable(people);
      }).join('')
    );
  }

  function monthTable(list) {
    const staff = new Map((state.sb?.staff || []).map((s) => [s.name, s]));
    const rows = list
      .map((p, idx) => {
        const s = staff.get(p.name) || {};
        const open = state.openPoint === p.name;
        return `<tr class="${rankBand(idx + 1)}${open ? ' apt-pd-on' : ''}">
          <td class="apt-rank">${idx < 3 ? `<i class="apt-rank-badge apt-rank-badge--${idx + 1}">${idx + 1}</i>` : `<span class="apt-rank-num">${idx + 1}</span>`}</td>
          <td><button type="button" class="apt-name" data-point-person="${esc(p.name)}" aria-expanded="${open}" title="看點數明細">${esc(p.name)} <span class="apt-pd-caret">${open ? '▴' : '▾'}</span></button>${kindBadge(p.kind)}</td>
          <td class="apt-mt-hire">${s.hireDate ? esc(hireShort(s.hireDate)) : NIL}</td>
          <td class="apt-mt-org">${esc(s.office || '') || NIL}</td>
          <td class="apt-mt-dept">${s.region ? `<span>${esc(s.region)}</span>` : NIL}</td>
          ${tallyCells(p.month)}
          <td class="num apt-total"${p.month.adjust ? ` title="系統爬取 ${p.month.total - p.month.adjust} 點，表單校正 ${adjustText(p.month.adjust)} 點"` : ''}><b class="apt-total-n">${p.month.total}</b>${p.month.adjust ? `<small class="apt-adjust">${adjustText(p.month.adjust)}</small>` : ''}</td>
          <td>${progress(p.month.total)} ${stageBadge(p.stage)}</td>
        </tr>${open ? `<tr class="apt-pd-row"><td colspan="${TALLY_COLS + 7}">${pointDetail(p)}</td></tr>` : ''}`;
      })
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table apt-month-table">
      <thead><tr><th>#</th><th>姓名</th><th>報到<small>年月</small></th><th>營業處</th><th>部別</th>${headCells()}<th class="num">月累積</th><th>階段<small>${Core.STAGE_1}／${Core.STAGE_2}</small></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${TALLY_COLS + 7}" class="apt-empty">本業績月尚無點數</td></tr>`}</tbody>
    </table></div>`;
  }

  function hireShort(d) {
    const m = /^(\d{4})-(\d{2})/.exec(String(d || ''));
    return m ? `${Number(m[1]) - 1911}/${m[2]}` : '';
  }

  /** 月累計點人名：各項件數 × 點數；有權限（本人、組長、處長）才列出每一件 */
  function pointDetail(p) {
    const t = p.month;
    const range = state.meta?.range || {};
    const inRange = (d) => d >= range.start && d <= range.end;
    const recs = p.records || [];
    const parts = ITEMS.filter((i) => t.counts[i.key]).map((i) => {
      const list = recs.filter((r) => r.item === i.key).sort((a, b) => (String(a.time || a.date) < String(b.time || b.date) ? -1 : 1));
      return { key: i.key, label: i.label, n: t.counts[i.key], pts: list.reduce((s, r) => s + (r.points || 0), 0), list };
    });
    const manual = (state.sb?.manual || []).filter((m) => m.name === p.name && inRange(m.date));
    const opinions = (state.sb?.opinions || []).filter((o) => o.name === p.name && inRange(o.date));
    if (t.qa) parts.push({ key: 'qa', label: '行政QA', n: manual.filter((m) => m.item === '行政QA').length, unit: '筆', pts: t.qa });
    Core.OPINION_ITEMS.forEach((i) => {
      if (t.manualCounts?.[i.key]) parts.push({ key: `op-${i.kind}`, label: i.label, n: t.manualCounts[i.key], pts: t.manualPoints?.[i.key] || 0 });
    });
    const other = Core.otherManual(t);
    if (other) parts.push({ key: 'other', label: '人工計點', n: manual.filter((m) => m.item !== '行政QA' && !OPINION_KEYS.has(m.item)).length, unit: '筆', pts: other });
    const chips = parts
      .map((x) => `<span class="apt-pd-chip"><b>${esc(x.label)}</b>${x.n} ${x.unit || '件'}<i>${x.pts} 點</i></span>`)
      .join('');
    const adjust = t.adjust ? `<span class="apt-pd-chip apt-pd-chip--adj"><b>表單校正</b><i>${adjustText(t.adjust)} 點</i></span>` : '';
    const head = `<div class="apt-pd-head"><b>${esc(p.name)} 的點數明細</b><span>${esc(range.month ? `${range.month} 月業績` : '')} · 合計 <strong>${t.total}</strong> 點</span>
      <button type="button" class="apt-pd-close" data-point-person="${esc(p.name)}">收合 ▴</button></div>
      <div class="apt-pd-chips">${chips || '<span class="apt-pd-empty">這個業績月還沒有點數</span>'}${adjust}</div>`;
    if (!canSee(p.name)) {
      return `${head}<p class="apt-pd-note">每一件的案件明細只有本人、所屬組長和處長看得到。</p>`;
    }
    const caseRows = (list) =>
      list
        .map(
          (r) => `<tr><td>${esc(shortDate(r.date))}${r.time && String(r.time).length > 11 ? ` <small>${esc(String(r.time).slice(11, 16))}</small>` : ''}</td>
            <td>${esc(r.no || NIL_TEXT)}</td><td class="apt-pd-left">${esc(r.name || '')}</td><td class="apt-pd-left">${esc(r.status || '')}</td><td class="num">${r.points}</td></tr>`
        )
        .join('');
    const groups = parts
      .filter((x) => x.list?.length)
      .map(
        (x) => `<details class="apt-pd-group"><summary><b>${esc(x.label)}</b>${x.n} 件 · ${x.pts} 點</summary>
          <div class="apt-table-wrap"><table class="apt-table apt-pd-table"><thead><tr><th>日期</th><th>編號</th><th>案名／姓名</th><th>狀態</th><th class="num">點數</th></tr></thead>
          <tbody>${caseRows(x.list)}</tbody></table></div></details>`
      )
      .join('');
    const manualBox = manual.length
      ? `<details class="apt-pd-group"><summary><b>組長登錄</b>${manual.length} 筆</summary>
          <div class="apt-table-wrap"><table class="apt-table apt-pd-table"><thead><tr><th>日期</th><th>項目</th><th class="num">件數</th><th class="num">點數</th><th>組長</th><th>備註</th></tr></thead>
          <tbody>${manual.map((m) => `<tr><td>${esc(shortDate(m.date))}</td><td>${esc(m.item)}</td><td class="num">${m.qty}</td><td class="num">${m.points}</td><td>${esc(m.leader || m.createdBy || '')}</td><td class="apt-pd-left">${esc(m.note || '')}</td></tr>`).join('')}</tbody></table></div></details>`
      : '';
    const opinionBox = opinions.length
      ? `<details class="apt-pd-group"><summary><b>自己填的公會意見</b>${opinions.length} 筆 · ${opinionPts(opinions)} 點</summary>
          <div class="apt-table-wrap"><table class="apt-table apt-pd-table"><thead><tr><th>填寫日</th><th>類別</th><th>公會期數</th><th>媒合編號／清冊期數</th><th>公會意見內容</th><th>行政檢討對策</th><th class="num">點數</th></tr></thead>
          <tbody>${opinions.map((o) => `<tr${o.noPoints ? ' class="apt-op-nopts"' : ''}><td>${esc(shortDate(o.date))}</td><td>${o.kind === 'case' ? '案件意見' : '清冊意見'}</td><td>${esc(o.guildPeriod)}</td><td>${esc(opinionRef(o))}</td><td class="apt-pd-left">${esc(o.content)}</td><td class="apt-pd-left">${esc(o.measure || '')}</td><td class="num">${o.noPoints ? noPointsTag(o) : 1}</td></tr>`).join('')}</tbody></table></div></details>`
      : '';
    return `${head}<div class="apt-pd-groups">${groups}${manualBox}${opinionBox}</div>
      <p class="apt-pd-foot">點上面的項目可以展開每一件。<button type="button" class="apt-pd-more" data-person="${esc(p.name)}">看完整個人績效（每日、耗時、評等）→</button></p>`;
  }

  const NIL_TEXT = '—';

  function recordList(records) {
    const label = Object.fromEntries(ITEMS.map((i) => [i.key, i.label]));
    return `<div class="apt-records">${records
      .map(
        (x) => `<div class="apt-record"><b>${esc(label[x.item])}</b><span>${esc(x.no || x.name)}</span><small>${esc(x.status)}${x.time ? ` · ${esc(String(x.time).slice(11, 16))}` : ''}</small></div>`
      )
      .join('')}</div>`;
  }

  function myName() {
    return String(window.skyfunAuth?.getUser?.()?.name || '').trim();
  }

  function canSee(name) {
    return Core.canViewPerson(myName(), name, state.sb?.staff || []);
  }

  function toneBetter(v, avg) {
    if (v == null || !avg) return '';
    const d = (v - avg) / avg;
    if (d >= 0.15) return 'apt-tone--green';
    if (d >= 0) return 'apt-tone--white';
    if (d > -0.15) return 'apt-tone--yellow';
    return 'apt-tone--red';
  }

  function diffText(d, slowerWord, fasterWord) {
    if (d == null) return NIL;
    if (Math.abs(d) < 0.005) return '持平';
    return `${d > 0 ? slowerWord : fasterWord} ${Math.round(Math.abs(d) * 100)}%`;
  }

  function num1(v) {
    return v == null ? NIL : Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function compareBar(mine, base, max) {
    if (mine == null || !max) return '';
    const w = (v) => `${Math.min(100, (v / max) * 100)}%`;
    return `<span class="apt-cmp"><span class="apt-cmp-me" style="width:${w(mine)}"></span>${base ? `<i style="left:${w(base)}" title="平均"></i>` : ''}</span>`;
  }

  const C_ME = '#6366f1';
  const C_AVG = '#f59e0b';
  const C_ALL = '#94a3b8';
  const C_STAGE1 = '#2563eb';
  const C_STAGE2 = '#db2777';
  const REVIEW_AREAS = ['審核速度', '審件品質'];

  function scoreColor(v) {
    if (v == null) return C_ALL;
    return v >= 70 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#dc2626';
  }

  /** 耗時差距：慢 15% 以上紅、慢 0–14% 黃、快 0–14% 白、快 15% 以上綠 */
  function diffTone(d) {
    if (d == null) return '';
    if (d >= 0.15) return 'apt-tone--red';
    if (d >= 0) return 'apt-tone--yellow';
    if (d > -0.15) return 'apt-tone--white';
    return 'apt-tone--green';
  }

  /** 速度分依同節點名次換算：70 以上綠、50–69 黃、50 以下紅 */
  function speedTone(v) {
    if (v == null) return '';
    return v >= 70 ? 'apt-tone--green' : v >= 50 ? 'apt-tone--yellow' : 'apt-tone--red';
  }

  function nodeScoreTag(n) {
    if (!n || n.score == null) return null;
    const s = Math.round(n.score);
    if (!n.scored) return { text: '不計分', tone: 'even' };
    return { text: `${s} 分`, tone: s >= 70 ? 'good' : s >= 50 ? 'even' : 'bad' };
  }

  const C_SLOW = '#ef4444';
  const C_FAST = '#16a34a';
  const SPEED_NOTE = '上條我、下條同仁中位數（排中間那位同仁的平均）；紅條＝比中位數慢 15% 以上、綠條＝比中位數快；右側為速度分與同節點名次（快到慢）';

  /** 各節點平均耗時：每列各自縮放，跟同仁中位數比，名次與速度分一致 */
  function speedBars(nodes, fmt, pick) {
    return window.AdminPointsCharts.hbars({
      rows: nodes.map((n) => ({ label: n.label, note: `${n.count} 件`, values: [n.avg, n.mid ?? n.base], node: n })),
      series: [
        { name: '我', color: C_ME },
        { name: '同仁中位數', color: C_ALL }
      ],
      rowScale: true,
      colorOf: (v, r, si) => {
        const m = r.node.mid;
        if (si !== 0 || v == null || !m) return null;
        return v > m * 1.15 ? C_SLOW : v < m ? C_FAST : null;
      },
      fmt,
      tagOf: (r) => nodeScoreTag(r.node),
      subTagOf: (r) => (r.node.rank ? { text: `${r.node.rank}/${r.node.n} 名`, tone: 'rank' } : null),
      pick
    });
  }

  function pct1(v) {
    return v == null ? NIL : `${(v * 100).toFixed(1)}%`;
  }

  function reviewScore(pf) {
    return Core.reviewScoreOf(pf.scores);
  }

  function profileHeader(pf) {
    const info = pf.info || {};
    const hm = String(info.hireDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const line = (parts) => parts.filter(Boolean).map(esc).join(' · ');
    const first = line([info.region, info.office, hm ? `${Number(hm[1]) - 1911}年${hm[2]}月${hm[3]}日報到` : '']);
    const second = info.name ? line([`組長 ${info.leader || '未設定'}`, `專案 ${info.project || '無'}`]) : '';
    const meta = first || second ? `${first}${first && second ? '<br>' : ''}${second}` : '';
    const range = state.meta?.range || {};
    const weak = [...new Set(pf.weak.map((w) => w.area))].slice(0, 3);
    state.planPf = pf;
    const plan = window.ImprovePlan
      ? `<div class="apt-plan-slot" id="apt-plan-root" data-name="${esc(pf.name)}" data-grade="${esc(pf.grade)}" data-score="${pf.score == null ? '' : pf.score.toFixed(1)}" data-year="${range.year || ''}" data-month="${range.month || ''}" data-weak="${esc(weak.join('、'))}"></div>`
      : '';
    return `<div class="apt-profile-head apt-profile-head--slim${plan ? ' apt-profile-head--plan' : ''}">
        <div class="apt-grade apt-grade--${pf.grade}"><b>${pf.grade}</b><span>${pf.label}</span></div>
        <div class="apt-profile-id">
          <h3>${esc(pf.name)}<small>綜合評等 ${pf.score == null ? '-' : Math.round(pf.score) + ' 分'}</small></h3>
          <p>${meta || '人力明細沒有這個人的資料'}</p>
          <p class="apt-sub-note">跟${pf.inGroup ? '' : '（不在比較名單內，僅供參考）'}行政正職 ${pf.groupSize} 人比較</p>
        </div>
        ${plan}
      </div>
      ${plan ? '<div id="apt-plan-panel"></div>' : ''}`;
  }

  /** 四大指標：首頁用卡片、點進去後變成上方分段列＋單一大卡 */
  function dimTiles(pf) {
    const CH = window.AdminPointsCharts;
    const fmt = Core.formatDuration;
    const pt = pf.points;
    const rs = reviewScore(pf);
    const q = pf.quality;
    const stageColor = pt.stage === 2 ? C_STAGE2 : pt.stage === 1 ? C_STAGE1 : C_ME;
    const ring = (value, color, text, sub) => CH.donut({ value, color, text: text ?? '', sub, marks: [] });
    return [
      {
        key: 'overall',
        label: '整體評分',
        share: '100%',
        value: pf.grade,
        unit: pf.score == null ? '資料不足' : `${Math.round(pf.score)} 分`,
        tone: scoreColor(pf.score),
        ring: (t, s) => ring(pf.score, scoreColor(pf.score), t, s),
        status: pf.label,
        meta: [`落後 ${pf.weak.length} 項 · 亮點 ${pf.strong.length} 項`, pf.weak[0] ? `最需改善：${esc(pf.weak[0].area)}` : '目前沒有明顯落後'],
        more: ['點數 80%＋審件 10%＋客訴紀律 10%', 'A 85↑ · B 70↑ · C 50↑ · D 50↓']
      },
      {
        key: 'points',
        label: '點數',
        share: '80%',
        value: num1(pt.total),
        unit: `／${Core.STAGE_2} 點`,
        tone: stageColor,
        ring: (t, s) => CH.donut({ value: (pt.total / Core.STAGE_2) * 100, color: stageColor, text: t ?? '', sub: s, marks: [(Core.STAGE_1 / Core.STAGE_2) * 100] }),
        status: Core.stageLabel(pt.stage),
        meta: [`第 ${pt.rank}／${pt.n} 名 · 行政平均 ${num1(pt.avg)} 點`, pt.nextLabel ? `距${pt.nextLabel}還差 <b>${num1(pt.toNext)}</b> 點` : '已達第二階段'],
        more: [`點數分數 ${Math.round(pf.scores.points)}／100`, `第一階段 ${Core.STAGE_1} 點、第二階段 ${Core.STAGE_2} 點`]
      },
      {
        key: 'review',
        label: '審件',
        share: '10%',
        value: rs == null ? '-' : String(Math.round(rs)),
        unit: '分',
        tone: scoreColor(rs),
        ring: (t, s) => ring(rs, scoreColor(rs), t, s),
        status: `平均耗時 ${fmt(pf.speed.avg) || '-'}`,
        meta: [
          pf.scores.speed == null ? '速度：本月沒有通識節點審核' : `速度 <i class="apt-tag ${speedTone(pf.scores.speed)}">${Math.round(pf.scores.speed)} 分</i> · 依各節點名次換算`,
          `審件良率 ${pct1(q.rate)}${q.checked ? `（抽查 ${q.checked} 件）` : ''}`
        ],
        more: [`審核 ${pf.speed.count} 筆`, '審件分數＝速度 80%＋品質 20%']
      },
      {
        key: 'conduct',
        label: '客訴紀律',
        share: '10%',
        value: String(Math.round(pf.scores.conduct)),
        unit: '分',
        tone: scoreColor(pf.scores.conduct),
        ring: (t, s) => ring(pf.scores.conduct, scoreColor(pf.scores.conduct), t, s),
        status: `客訴 ${q.complaints} 件 · 懲處 ${q.penalty}`,
        statusBad: !!(q.complaints || q.penalty !== '無'),
        meta: [`行政平均客訴 ${num1(q.avgComplaints)} 件`, '每件客訴扣 15、小過扣 40、大過扣 80'],
        more: []
      }
    ];
  }

  /** 個人主頁：整體評分放最右、稍寬，其餘三張同大小 */
  function dashCards(pf) {
    const tiles = dimTiles(pf);
    return `<div class="apt-tiles">${[...tiles.filter((t) => t.key !== 'overall'), ...tiles.filter((t) => t.key === 'overall')]
      .map(
        (t) => `<button type="button" class="apt-tile${t.key === 'overall' ? ' apt-tile--lead' : ''}" data-pview="${t.key}" style="--tile-tone:${t.tone}">
          <span class="apt-tile-head"><span class="apt-tile-label">${t.label}</span><span class="apt-tile-share">占整體 ${t.share}</span></span>
          <span class="apt-tile-main">
            <span class="apt-tile-ring">${t.ring()}</span>
            <span class="apt-tile-num"><b style="color:${t.tone}">${t.value}</b><small>${t.unit}</small></span>
          </span>
          <span class="apt-tile-status${t.statusBad ? ' is-bad' : ''}">${t.status}</span>
          ${t.meta.map((m) => `<span class="apt-tile-meta">${m}</span>`).join('')}
          <span class="apt-tile-more">${t.key === 'overall' ? '🧭 看評分與成長羅盤 ›' : '查看明細 ›'}</span>
        </button>`
      )
      .join('')}</div>`;
  }

  /** 明細頁上方：分段列（其他指標收成「名稱＋數字」），選中的指標展開成大卡 */
  function focusNav(pf, view) {
    const tiles = dimTiles(pf);
    const seg = (key, label, val, tone) => `<button type="button" class="apt-seg-item${key === view ? ' is-active' : ''}" data-pview="${key}">
        <span>${label}</span>${val == null ? '' : `<b style="color:${tone}">${val}</b>`}
      </button>`;
    const nav = `<div class="apt-seg" role="tablist">
        ${seg('home', '‹ 主頁')}
        ${[...tiles.filter((t) => t.key !== 'overall'), ...tiles.filter((t) => t.key === 'overall')]
          .map((t) => seg(t.key, t.key === 'overall' ? '🧭 整體評分・羅盤' : t.label, t.value, t.tone))
          .join('')}
        ${seg('training', '教育訓練')}
      </div>`;
    const t = tiles.find((x) => x.key === view);
    if (!t || view === 'overall') return nav;
    return `${nav}
      <div class="apt-focus">
        <div class="apt-focus-ring">${t.ring(t.value, t.unit)}</div>
        <div class="apt-focus-text">
          <div class="apt-focus-head"><h3>${t.label}</h3><span class="apt-tile-share">占整體 ${t.share}</span></div>
          <p class="apt-focus-status${t.statusBad ? ' is-bad' : ''}">${t.status}</p>
          <ul class="apt-focus-lines">${[...t.meta, ...t.more].map((m) => `<li>${m}</li>`).join('')}</ul>
        </div>
      </div>`;
  }

  function skillGrid(pf, yearCounts) {
    const fmt = Core.formatDuration;
    const known = pf.skills.filter((s) => s.count || s.reviews || yearCounts?.get(s.key)).length;
    const cards = pf.skills
      .map((s) => {
        const yc = yearCounts?.get(s.key) || 0;
        const on = s.count || s.reviews || yc;
        return `<div class="apt-skill${on ? ' is-on' : ''}">
          <b>${esc(s.label)}</b>
          <span class="apt-skill-state">${on ? '✔ 已會' : '未接觸'}</span>
          <small>本月 ${s.count} 件${s.rank ? `（第 ${s.rank}／${s.doers} 名）` : ''}${yearCounts ? ` · ${sinceText()} ${yc} 件` : ''}</small>
          ${s.reviews ? `<small>平均 ${fmt(s.avg)}${s.speedRank ? ` <i class="apt-tag ${speedTone(s.speedScore)}">第 ${s.speedRank}／${s.speedN} 名</i>` : ''}</small>` : ''}
        </div>`;
      })
      .join('');
    return `<h4 class="apt-sec-title">會哪些技能<small>${known}／${pf.skills.length} 個節點${yearCounts ? `（含${sinceText()}做過的）` : `（本業績月；打開點數或整體評分會載入${sinceText()}資料）`}</small></h4>
      <div class="apt-skills">${cards}</div>`;
  }

  function guideExamText(name) {
    const p = window.GuideExam?.progressOf(name);
    if (!p?.loaded) return '考試進度讀取中…';
    return `考試進度 ${p.total ? Math.round((p.passed / p.total) * 100) : 0}%（${p.passed}／${p.total} 題）`;
  }

  function courseExamText(course, name) {
    const p = window.CourseExam?.statusOf(course, name);
    if (!p?.loaded) return '影片與考試讀取中…';
    const video = p.video.done ? '影片 ✅ 看完' : `影片 ${p.video.pct}%`;
    if (p.passed) return `${video} · 考試 ✅ 100 分`;
    return `${video} · ${p.attempts ? `考試最高 ${p.best} 分` : '考試還沒考'}`;
  }

  function guideExamRate(name) {
    const p = window.GuideExam?.progressOf(name);
    return p?.loaded && p.total ? p.passed / p.total : null;
  }

  /** 某人某訓練項目是否通過：影片、考試進度由 CourseExam／GuideExam 讀取 */
  function trainState(key, name) {
    const c = window.CourseExam?.has(key) ? window.CourseExam.statusOf(key, name) : null;
    return Core.trainingState(key, {
      videoDone: c?.video?.done,
      examPassed: c?.passed,
      practiceDone: window.SimPractice?.statusOf(key, name)?.done,
      guideRate: key === 'guide' ? guideExamRate(name) : null
    });
  }

  function trainStateText(t) {
    if (t.done) return '✔ 已通過';
    if (!t.ready) return '課程準備中';
    return t.steps.length > 1 ? `尚未通過（${t.steps.filter((x) => x.ok).length}／${t.steps.length}）` : '尚未通過';
  }

  /** 考試、影片進度載入後重畫課程分數 */
  const courseCache = new Map();

  function courseCard(pf, s, c, active, weightText) {
    const t = trainState(s.key, pf.name);
    return `<button type="button" class="apt-skill apt-train${t.done ? ' is-trained' : ''}${active === s.key ? ' is-active' : ''}" data-train-node="${s.key}">
        <span class="apt-course-top"><b>${esc(s.label)}</b><i class="apt-course-w">${weightText}</i></span>
        <span class="apt-course-score"><strong style="color:${scoreColor(c.score)}">${c.score}</strong> 分</span>
        <span class="apt-skill-state">${trainStateText(t)}</span>
        ${s.key === 'guide' && window.GuideExam ? `<em class="apt-gx-prog" data-gx-prog="${esc(pf.name)}">${esc(guideExamText(pf.name))}</em>` : ''}
        ${window.CourseExam?.has(s.key) ? `<em class="apt-gx-prog" data-cx-prog="${s.key}|${esc(pf.name)}">${esc(courseExamText(s.key, pf.name))}</em>` : ''}
        <small>看${esc(s.label)}教育訓練 →</small>
      </button>`;
  }

  const WEEK_CN = ['一', '二', '三', '四', '五', '六'];

  /** detail：點開的課程教育訓練，排在該課程所在週（或專案課程）的卡片正下方 */
  function courseBlocks(pf, active, detail = '') {
    courseCache.set(pf.name, { pf, active });
    const cs = Core.courseScores((key) => trainState(key, pf.name));
    const byKey = new Map(pf.training.map((s) => [s.key, s]));
    const g = Math.round(cs.generalScore);
    const inProject = cs.projects.some((c) => c.key === active);
    const inWeek = (w) => w.items.some((c) => c.key === active);
    const slot = (here) => (here && active ? `<div class="apt-train-slot" data-train-slot>${detail}</div>` : '');
    const weeks = cs.weeks
      .map((w) => {
        const label = `第${WEEK_CN[w.week - 1]}週`;
        const done = w.items.filter((c) => trainState(c.key, pf.name).done).length;
        const open = state.trainWeeksOpen[w.week] ?? inWeek(w);
        return `<div class="apt-train-week${open ? ' is-open' : ''}${done === w.items.length ? ' is-done' : ''}">
          <button type="button" class="apt-train-week-head" data-train-week="${w.week}" aria-expanded="${open}"><b>${label}</b><small>${w.items.map((c) => esc(c.label)).join('、')}</small><span>${done}／${w.items.length} 項通過</span><i class="apt-train-week-caret" aria-hidden="true">▾</i></button>
          <div class="apt-skills apt-trains apt-trains--week">${w.items.map((c) => courseCard(pf, byKey.get(c.key), c, active, label)).join('')}</div>
          ${slot(inWeek(w))}
        </div>`;
      })
      .join('');
    const orphan = !inProject && !cs.weeks.some(inWeek);
    const generalItems = cs.weeks.flatMap((w) => w.items);
    const generalDone = generalItems.filter((c) => trainState(c.key, pf.name).done).length;
    const genOpen = state.courseOpen.general ?? !!(active && !inProject);
    const projOpen = state.courseOpen.project ?? !!(active && inProject);
    const caret = '<i class="apt-course-caret" aria-hidden="true"><span class="is-shut">展開 ▾</span><span class="is-open">收起 ▴</span></i>';
    const desc = (open, shut) => `<small class="apt-course-desc">${open}</small><small class="apt-course-sum">${shut}</small>`;
    return `<div class="apt-course-wrap" data-course-of="${esc(pf.name)}">
        <div class="apt-course apt-course--general${genOpen ? ' is-open' : ''}">
          <button type="button" class="apt-course-head" data-course-toggle="general" aria-expanded="${genOpen}">
            <span class="apt-course-name"><b>📘 行政教育訓練（五週課程）</b>${desc('每週 2～3 項，照週次完成；每一項比重相同。有影片的課程要看完影片、考試滿分、實作完成才算通過（各占 1／3 分數），執行要點依考試進度計分', `五週共 ${generalItems.length} 項，已通過 ${generalDone} 項 · 點一下展開各週課程`)}</span>
            <span class="apt-course-total"><span>訓練總分</span><strong style="color:${scoreColor(g)}">${g}</strong><small>／100</small></span>
            ${caret}
            <span class="apt-course-bar"><i style="width:${g}%;background:${scoreColor(g)}"></i></span>
          </button>
          ${weeks}
          ${slot(orphan)}
        </div>
        <div class="apt-course apt-course--project${projOpen ? ' is-open' : ''}">
          <button type="button" class="apt-course-head" data-course-toggle="project" aria-expanded="${projOpen}">
            <span class="apt-course-name"><b>🗂️ 專案課程</b>${desc('單獨科目，每一科各自 100 分，不併入訓練總分', `${cs.projects.map((c) => `${esc(c.label)} ${c.score} 分`).join('・')} · 點一下展開`)}</span>
            ${caret}
          </button>
          <div class="apt-skills apt-trains apt-trains--project">${cs.projects.map((c) => courseCard(pf, byKey.get(c.key), c, active, '獨立 100 分')).join('')}</div>
          ${slot(inProject)}
        </div>
      </div>`;
  }

  function trainCountText(pf) {
    const done = pf.training.filter((s) => trainState(s.key, pf.name).done).length;
    return `${done}／${pf.training.length} 項通過；點項目看各自的教育訓練`;
  }

  function trainingGrid(pf, active, detail) {
    return `<h4 class="apt-sec-title">教育訓練<small data-train-count="${esc(pf.name)}">${trainCountText(pf)}</small></h4>
      ${courseBlocks(pf, active, detail)}`;
  }

  function chartCard(title, note, body, view) {
    return `<div class="apt-chart${view ? ' is-link' : ''}"${view ? ` data-pview="${view}" title="點開看明細"` : ''}>
      <h5>${title}${note ? `<small>${note}</small>` : ''}</h5>${body}</div>`;
  }

  function weakStrong(pf, areas) {
    const pick = (list) => (areas ? list.filter((x) => areas.includes(x.area)) : list);
    const weakList = pick(pf.weak);
    const strongList = pick(pf.strong);
    const weak = weakList.length
      ? weakList.map((w) => `<li class="is-${w.level}"><em>${esc(w.area)}</em>${esc(w.text)}</li>`).join('')
      : '<li class="is-none">目前沒有明顯落後的環節</li>';
    const strong = strongList.length
      ? strongList.map((s) => `<li><em>${esc(s.area)}</em>${esc(s.text)}</li>`).join('')
      : '<li class="is-none">還沒有明顯領先的項目</li>';
    return `<div class="apt-profile-lists">
        <div class="apt-list apt-list--weak"><h4>落後大家的環節<small>紅：差距 15% 以上或違規；黃：略低</small></h4><ul>${weak}</ul></div>
        <div class="apt-list apt-list--strong"><h4>表現亮點</h4><ul>${strong}</ul></div>
      </div>`;
  }

  function dailySeries(pf, days) {
    const byName = new Map(state.result.people.map((x) => [x.name, x]));
    const dayTotal = (n, d) => byName.get(n)?.days.get(d)?.total || 0;
    const mine = days.map((d) => dayTotal(pf.name, d));
    const avg = days.map((d) => {
      const vals = pf.group.map((n) => dayTotal(n, d));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
    return { mine, avg };
  }

  /** 圖表點選：同一個人、同一個分頁、同一個業績月才沿用，換人或換頁就收起 */
  function pickKey() {
    const r = state.meta?.range;
    return `${state.person}|${state.personView}|${r?.year}-${r?.month}`;
  }

  function picked(id) {
    const p = state.pick;
    return p && p.key === pickKey() && p.id === id ? p.i : null;
  }

  function pickOf(id) {
    return { id, active: picked(id) };
  }

  /**
   * 可點的圖表卡。cfgs:{ id, list, title(x), body(x) }（可多個）。
   * 選中某一筆時，明細接在這張卡後面、占滿整列，把下面的卡往下推（.apt-charts 用 dense 補位，旁邊的卡不會空出來）
   */
  function pickCard(cfgs, title, note, body) {
    let panel = '';
    for (const c of [].concat(cfgs)) {
      const i = picked(c.id);
      const x = i == null ? null : c.list[i];
      if (!x) continue;
      panel = `<section class="apt-pick-panel" id="apt-pick-panel">
          <header><h4>📌 ${c.title(x)}</h4><button type="button" class="apt-pick-close" data-pick-close>▲ 點一下收起</button></header>
          ${c.body(x)}
          <button type="button" class="apt-pick-foot" data-pick-close>▲ 看完了，點一下收起（再點一次同一根長條也會收起）</button>
        </section>`;
      break;
    }
    return `<div class="apt-chart apt-chart--pick${panel ? ' is-picked' : ''}">
      <h5>${title}${note ? `<small>${note}</small>` : ''}</h5>${body}
      <p class="apt-card-hint">${panel ? '👇 明細在下方，點一下「收起」關閉' : '👆 點圖表看這一筆的明細'}</p></div>${panel}`;
  }

  function pickStats(cells) {
    return `<div class="apt-pick-stats">${cells
      .filter(Boolean)
      .map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ''}><span>${k}</span><b>${v}</b></div>`)
      .join('')}</div>`;
  }

  function shortDate(d) {
    return d.slice(5).replace('-', '/');
  }

  /** 某段日期內每天的點數（有全年資料時可跨業績月） */
  function personDays(name, from, to) {
    const results = state.year?.months ? state.year.months.map((m) => m.result) : [state.result];
    const days = [];
    for (const res of results) {
      const p = res.people.find((x) => x.name === name);
      if (!p) continue;
      for (const [d, t] of p.days) {
        if (d >= from && d <= to && t.total) days.push({ d, t, recs: p.records.filter((x) => x.date === d) });
      }
    }
    return days.sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  function dayRows(days, open) {
    const cols = TALLY_COLS + 2;
    const rows = days
      .map(
        ({ d, t, recs }) => `<tr>
          <td>${recs.length ? `<button type="button" class="apt-day-toggle" data-day="${d}">${shortDate(d)} ▾</button>` : shortDate(d)}</td>
          ${tallyCells(t)}
          <td class="num apt-total">${t.total}</td>
        </tr>${recs.length ? `<tr class="apt-day-detail" data-day-detail="${d}"${open ? '' : ' hidden'}><td colspan="${cols}">${recordList(recs)}</td></tr>` : ''}`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>日期</th>${headCells()}<th class="num">點數</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols}" class="apt-empty">這段期間沒有點數</td></tr>`}</tbody>
      </table></div>`;
  }

  function dayDetail(p, d, avg) {
    const days = personDays(p.name, d, d);
    const total = days[0]?.t.total || 0;
    let run = 0;
    for (const [k, t] of p.days) if (k <= d) run += t.total;
    return pickStats([
      ['當天點數', total, toneBetter(total, avg)],
      ['行政平均', num1(avg)],
      ['月累積到這天', run]
    ]) + dayRows(days, true);
  }

  function mdText(iso) {
    return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
  }

  function avgOf(vals) {
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function sumDays(p, from, to) {
    let s = 0;
    for (const [d, t] of p?.days || []) if (d >= from && d <= to) s += t.total;
    return s;
  }

  /** 業績月內每週（週一～週日，頭尾截在業績月內） */
  function monthWeeks(m, name, group) {
    const by = new Map(m.result.people.map((p) => [p.name, p]));
    const today = Core.isoDate(new Date());
    return Core.weeksOf(m.range)
      .map((w) => {
        const start = w.start < m.range.start ? m.range.start : w.start;
        const end = w.end > m.range.end ? m.range.end : w.end;
        if (start > today) return null;
        return {
          start,
          end,
          label: start === end ? mdText(start) : `${mdText(start)}–${mdText(end)}`,
          current: today >= start && today <= end,
          mine: sumDays(by.get(name), start, end),
          avg: avgOf(group.map((n) => sumDays(by.get(n), start, end)))
        };
      })
      .filter(Boolean);
  }

  function itemTable(items) {
    const itemMax = Math.max(1, ...items.map((i) => Math.max(i.mine, i.doersAvg || 0)));
    const rows = items
      .filter((i) => i.mine || i.doers)
      .map(
        (i) => `<tr>
          <td>${esc(i.label)}</td>
          <td class="num ${i.mine ? toneBetter(i.mine, i.doersAvg) : ''}"><b>${i.mine || NIL}</b></td>
          <td class="num">${num1(i.doersAvg)}<small>${i.doers} 人有做</small></td>
          <td class="num">${num1(i.avg)}</td>
          <td class="num">${i.rank ? `${i.rank}／${i.doers}` : NIL}</td>
          <td>${compareBar(i.mine, i.doersAvg, itemMax)}</td>
        </tr>`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>項目</th><th class="num">我的</th><th class="num">有做的人平均</th><th class="num">行政平均<small>含沒做的人</small></th><th class="num">名次</th><th>比較<small>藍條我、黑線平均</small></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="apt-empty">尚無點數</td></tr>'}</tbody>
      </table></div>`;
  }

  function pointMonthStats(r) {
    const pt = r.pf.points;
    return (
      pickStats([
        ['我的點數', pt.total, toneBetter(pt.total, pt.avg)],
        ['行政平均', num1(pt.avg)],
        ['名次', `${pt.rank}／${pt.n}`],
        ['階段', Core.stageLabel(pt.stage)],
        ['有點數天數', `${pt.days} 天`],
        ['綜合評等', `${r.pf.grade}${r.pf.score == null ? '' : `<small>${Math.round(r.pf.score)} 分</small>`}`]
      ]) +
      `<p class="apt-sub-note">自動 ${pt.auto}、行政QA ${pt.qa}、意見修正 ${pt.opinion}、人工計點 ${pt.manual} 點${pt.adjust ? `、表單校正 ${adjustText(pt.adjust)} 點（月合計依「${esc(Core.sheetTotals(r.range.start, r.range.end)?.source || '表單')}」，下方每週、每日是系統爬取）` : ''}</p>`
    );
  }

  function reviewRecords(recs, empty) {
    const fmt = Core.formatDuration;
    const nodeLabel = new Map(Core.DURATION_NODES.map((n) => [n.key, n.label]));
    const rows = recs
      .map(
        (r) => `<tr>
          <td>${esc(String(r.time).slice(5, 16))}</td>
          <td>${esc(nodeLabel.get(r.node) || r.node)}</td>
          <td>${esc(r.action)}</td>
          <td>${r.no ? esc(r.no) : NIL}</td>
          <td>${esc(r.name)}</td>
          <td class="num${r.sec >= 3600 ? ' apt-bad' : ''}"><b>${fmt(r.sec)}</b></td>
        </tr>`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>完成時間</th><th>節點</th><th>動作</th><th>編號</th><th>名稱</th><th class="num">耗時</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="apt-empty">${empty}</td></tr>`}</tbody>
      </table></div>`;
  }

  function reviewWeekDetail(w) {
    const fmt = Core.formatDuration;
    const recs = (w.recs || []).slice().sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
    return (
      pickStats([
        ['我審核筆數', w.count ?? NIL],
        ['行政每人平均', num1(w.perPerson)],
        ['我平均耗時', fmt(w.avg) || NIL, diffTone(w.diff)],
        ['行政平均耗時', fmt(w.base) || NIL],
        ['比較', diffText(w.diff, '慢', '快'), diffTone(w.diff)]
      ]) +
      `<p class="apt-sub-note">這週我審核的每一筆，新到舊；超過 1 小時紅字</p>` +
      reviewRecords(recs, '這週沒有審核紀錄')
    );
  }

  function nodeDetail(ctx, n) {
    const fmt = Core.formatDuration;
    const recs = (ctx.dur.people.find((x) => x.name === ctx.pf.name)?.records || []).filter((r) => r.node === n.key).sort((a, b) => b.sec - a.sec);
    return (
      pickStats([
        ['我的件數', n.count || NIL],
        ['我的平均', fmt(n.avg) || NIL],
        ['速度分', n.score == null ? NIL : n.scored ? `${Math.round(n.score)} 分` : '專案不計分', n.scored ? speedTone(n.score) : ''],
        ['名次（快到慢）', n.rank ? `${n.rank}／${n.n}（${Core.rankBand(n.rank, n.n)}）` : NIL, speedTone(n.score)],
        ['同仁中位數', fmt(n.mid) || NIL],
        ['全體平均（參考）', fmt(n.base) || NIL],
        ['最快', fmt(n.min) || NIL],
        ['最慢', fmt(n.max) || NIL],
        ['超過 1 小時', n.count ? `${n.long} 件` : NIL, n.long ? 'apt-tone--red' : '']
      ]) +
      '<h5 class="apt-pick-sub">這個節點最耗時的 5 筆</h5>' +
      reviewRecords(recs.slice(0, 5), '本月沒有這個節點的紀錄') +
      (n.count ? `<button type="button" class="apt-btn-lite apt-pick-more" data-goto-node="${n.key}">看這個節點的完整耗時明細 ›</button>` : '')
    );
  }

  function actionDetail(pf) {
    const sp = pf.speed;
    const keys = [...new Set([...Object.keys(sp.actions), ...Object.keys(sp.baseActions)])];
    const baseTotal = Object.values(sp.baseActions).reduce((a, b) => a + b, 0);
    const rows = keys
      .map((k) => {
        const mine = sp.actions[k] || 0;
        const share = sp.count ? mine / sp.count : null;
        const base = baseTotal ? (sp.baseActions[k] || 0) / baseTotal : null;
        return `<tr><td>${esc(k)}</td><td class="num"><b>${mine}</b></td><td class="num">${pct1(share)}</td><td class="num">${(sp.baseActions[k] || 0).toLocaleString('en-US')}</td><td class="num">${pct1(base)}</td></tr>`;
      })
      .join('');
    return `<p class="apt-sub-note">核准／退回／儲存都算一次審核</p>
      <div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>動作</th><th class="num">我的筆數</th><th class="num">我的占比</th><th class="num">全體筆數</th><th class="num">全體占比</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="apt-empty">沒有紀錄</td></tr>'}</tbody>
      </table></div>`;
  }

  function incidentTable(incidents) {
    const rows = incidents
      .map(
        (x) => `<tr>
          <td>${esc(shortDate(String(x.date)))}</td>
          <td class="num${x.complaints ? ' apt-bad' : ''}">${x.complaints || NIL}</td>
          <td>${x.penalty ? `<b class="apt-bad">${esc(x.penalty)}</b>` : NIL}</td>
          <td class="num">${x.compensation ? Number(x.compensation).toLocaleString('en-US') : NIL}</td>
          <td>${esc(x.note || '')}</td>
        </tr>`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>日期</th><th class="num">客訴</th><th>懲處</th><th class="num">賠償金額</th><th>備註</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="apt-empty">這個業績月沒有客訴或懲處</td></tr>'}</tbody>
      </table></div>`;
  }

  function conductMonthDetail(r) {
    const q = r.pf.quality;
    return (
      pickStats([
        ['客訴', `${q.complaints} 件`, q.complaints ? 'apt-tone--red' : ''],
        ['行政平均', num1(q.avgComplaints)],
        ['懲處', q.penalty, q.penalty === '無' ? '' : 'apt-tone--red'],
        ['紀律分數', Math.round(r.pf.scores.conduct)]
      ]) +
      '<p class="apt-sub-note">組長在後台登錄的客訴與懲處紀錄</p>' +
      incidentTable(q.incidents)
    );
  }

  function gradeMonthDetail(r) {
    const pf = r.pf;
    return (
      pickStats([
        ['綜合評等', `${pf.grade}${pf.score == null ? '' : `<small>${Math.round(pf.score)} 分</small>`}`],
        ...pf.dims.map((d) => [d.label, pf.scores[d.key] == null ? NIL : Math.round(pf.scores[d.key]), pf.scores[d.key] == null ? '' : pf.scores[d.key] >= 70 ? 'apt-tone--green' : pf.scores[d.key] >= 50 ? 'apt-tone--yellow' : 'apt-tone--red'])
      ]) + weakStrong(pf, null)
    );
  }

  /** 點數制度起算那一年只看起算月以後，標籤改成「9 月起」 */
  function sinceText() {
    const y = state.meta?.range?.year;
    const f = Core.FIRST_PERF_MONTH;
    return y === f.year ? `${f.month} 月起` : '今年';
  }

  function totalText() {
    return sinceText() === '今年' ? '全年合計' : `${sinceText()}合計`;
  }

  /** 全年各業績月：每月重算點數、耗時與綜合評等（Worker 有快取，第一次較慢） */
  async function loadYear() {
    const range = state.meta.range;
    const key = `${range.year}-${range.month}`;
    if (state.year?.key === key) return;
    const months = [];
    for (let m = 1; m <= range.month; m++) {
      if (m !== range.month && Core.beforeFirstPerf(range.year, m)) continue;
      months.push(Core.perfMonthRange(range.year, m));
    }
    state.year = { key, loading: true, done: 0, total: months.length };
    state.yearCache = new Map();
    const out = new Array(months.length);
    let next = 0;
    const pull = async () => {
      while (next < months.length) {
        const idx = next++;
        const mr = months[idx];
        let auditRows;
        let sb;
        let result;
        if (mr.month === range.month) {
          auditRows = state.auditRows;
          sb = state.sb;
          result = state.result;
        } else {
          const [audit, expenses, term, sbData] = await Promise.all([
            fetchWorker('/admin-points/audit-log', `${mr.month} 月審核時間紀錄`, mr, false),
            fetchWorker('/admin-points/expenses', `${mr.month} 月補助審核`, mr, false),
            fetchTerminations(mr, false),
            fetchSupabase(mr)
          ]);
          auditRows = auditRowsOf(audit);
          sb = sbData;
          result = Core.compute(auditRows, {
            start: mr.start,
            end: mr.end,
            staff: sb.staff || [],
            exclude: sb.excluded,
            manual: sb.manual || [],
            opinions: sb.opinions || [],
            expenses: auditRowsOf(expenses),
            terminations: auditRowsOf(term)
          });
        }
        const dur = Core.durationReport(auditRows, { start: mr.start, end: mr.end, staff: sb.staff || [] });
        out[idx] = { range: mr, sb, result, dur };
        if (state.year?.key !== key) return;
        state.year.done += 1;
        const el = $('apt-year-progress');
        if (el) el.textContent = `載入${sinceText()}資料 ${state.year.done}／${state.year.total} 個月…`;
      }
    };
    try {
      await Promise.all([pull(), pull(), pull()]);
      if (state.year?.key !== key) return;
      state.year = { key, months: out };
    } catch (err) {
      if (state.year?.key !== key) return;
      state.year = { key, error: String(err.message || err) };
    }
    if (state.tab === 'person') render();
  }

  function yearRows(name) {
    if (!state.year?.months) return null;
    if (state.yearCache.has(name)) return state.yearCache.get(name);
    const active = state.year.months.filter((m) => m.dur.all.count || m.result.people.some((x) => x.month.total));
    const hire = (state.sb?.staff || []).find((s) => s.name === name)?.hireDate || '';
    const rows = active.map((m) => {
      if (hire && m.range.end < hire) return { range: m.range, before: true, pf: null };
      const pf = Core.personProfile(m.result, m.dur, {
        name,
        staff: m.sb.staff || [],
        checks: m.sb.checks || [],
        incidents: m.sb.incidents || [],
        weeks: []
      });
      return { range: m.range, pf };
    });
    state.yearCache.set(name, rows);
    return rows;
  }

  function yearCounts(rows) {
    if (!rows) return null;
    const m = new Map();
    for (const r of rows) {
      if (r.before) continue;
      for (const s of r.pf.skills) m.set(s.key, (m.get(s.key) || 0) + s.count);
    }
    return m;
  }

  function yearStatus() {
    if (!state.year) return '';
    if (state.year.error) return `<p class="apt-sub-note apt-bad">歷月資料讀取失敗：${esc(state.year.error)}</p>`;
    if (state.year.loading) return `<p class="apt-sub-note apt-loading" id="apt-year-progress">載入${sinceText()}資料 ${state.year.done}／${state.year.total} 個月…（第一次約需 30 秒）</p>`;
    return '';
  }

  function profileHome(ctx) {
    const CH = window.AdminPointsCharts;
    const { pf, days } = ctx;
    const fmt = Core.formatDuration;
    const ds = dailySeries(pf, days);
    const nodes = pf.nodes.filter((n) => n.count);
    const dayItems = days.map((d, i) => ({ d, avg: ds.avg[i] }));
    const zone = (kind, html) => `<section class="apt-block apt-block--${kind}">${html}</section>`;
    return `${zone('dims', `<h4 class="apt-sec-title">本月四大指標<small>點卡片看各項明細</small></h4>${dashCards(pf)}`)}
      ${zone('quality', personGauges(ctx.range, pf.name))}
      ${zone('train', trainingGrid(pf, ''))}
      ${zone('skill', skillGrid(pf, yearCounts(ctx.year)))}
      <section class="apt-block apt-block--charts">
      <h4 class="apt-sec-title">指標圖表<small>點長條看明細；點雷達圖進入整體評分</small></h4>
      <div class="apt-charts">
        ${pickCard(
          { id: 'hd', list: dayItems, title: (x) => `${shortDate(x.d)} 當天點數明細`, body: (x) => dayDetail(ctx.p, x.d, x.avg) },
          '點數｜本月每日點數',
          '藍柱我、橘線行政平均',
          CH.columns({
            labels: days.map((d) => d.slice(8)),
            bars: [{ name: '我', values: ds.mine, color: C_ME }],
            lines: [{ name: '行政平均', values: ds.avg, color: C_AVG, dash: true }],
            pick: pickOf('hd')
          })
        )}
        ${pickCard(
          { id: 'hn', list: nodes, title: (n) => `${esc(n.label)}｜本月審核耗時明細`, body: (n) => nodeDetail(ctx, n) },
          '審件｜各節點平均耗時',
          SPEED_NOTE,
          speedBars(nodes, fmt, pickOf('hn'))
        )}
        ${chartCard(
          '整體評分｜四大分項',
          '0–100 分',
          CH.radar({ axes: pf.dims.map((d) => ({ label: d.label, value: pf.scores[d.key] })) }),
          'overall'
        )}
      </div>
      </section>`;
  }

  function pointScoreBox(pf) {
    const CH = window.AdminPointsCharts;
    const pt = pf.points;
    const color = pt.stage === 2 ? C_STAGE2 : pt.stage === 1 ? C_STAGE1 : C_ME;
    return `<div class="apt-quality-box">
        ${CH.donut({ value: (pt.total / Core.STAGE_2) * 100, text: num1(pt.total), sub: `／${Core.STAGE_2} 點`, color, marks: [(Core.STAGE_1 / Core.STAGE_2) * 100] })}
        <ul>
          <li><b>${Core.stageLabel(pt.stage)}</b>${pt.nextLabel ? `，距${pt.nextLabel}還差 <b>${num1(pt.toNext)}</b> 點` : ''}</li>
          <li>第 <b>${pt.rank}／${pt.n}</b> 名 · 行政平均 ${num1(pt.avg)} 點</li>
          <li>點數分數 <b>${Math.round(pf.scores.points)}</b> 分：依點數在行政同仁中的名次換算（越前面越高），占整體 80%</li>
          <li>自動 ${pt.auto}、行政QA ${pt.qa}、意見修正 ${pt.opinion}、人工計點 ${pt.manual} 點${pt.adjust ? `、表單校正 ${adjustText(pt.adjust)} 點` : ''}</li>
        </ul>
      </div>`;
  }

  function itemDetail(p, it) {
    const recs = (p?.records || []).filter((r) => r.item === it.key).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const rows = recs
      .map((r) => `<tr><td>${shortDate(r.date)}</td><td>${r.no ? esc(r.no) : NIL}</td><td>${esc(r.name || '')}</td><td>${esc(r.status || '')}</td></tr>`)
      .join('');
    const empty = it.key === 'qa' || it.key === 'manual' ? '這項是點數合計，沒有逐件紀錄' : '本月沒有這項的案件';
    return (
      pickStats([
        ['我的', it.mine || NIL, it.mine ? toneBetter(it.mine, it.doersAvg) : ''],
        ['有做的人平均', num1(it.doersAvg)],
        ['有做的人數', `${it.doers} 人`],
        ['行政平均', num1(it.avg)],
        ['名次', it.rank ? `${it.rank}／${it.doers}` : NIL]
      ]) +
      `<div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>日期</th><th>編號</th><th>名稱</th><th>狀態</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="apt-empty">${empty}</td></tr>`}</tbody>
      </table></div>`
    );
  }

  function profilePoints(ctx) {
    const CH = window.AdminPointsCharts;
    const { pf, range } = ctx;
    const yr = ctx.year;
    const pt = pf.points;
    const weeks = monthWeeks({ result: state.result, range }, pf.name, pf.group);
    const items = pf.items.filter((i) => i.mine || i.doers);
    const crawled = pt.adjust ? '；月合計依表單校正，每週是系統爬取' : '';
    const itemTag = (r) => {
      if (!r.values[0] || !r.values[1]) return null;
      const d = (r.values[0] - r.values[1]) / r.values[1];
      return { text: diffText(d, '多', '少'), tone: d >= 0.15 ? 'good' : d <= -0.15 ? 'bad' : 'even' };
    };
    const monthChart = yr
      ? pickCard(
          { id: 'pm', list: yr, title: (r) => `${r.range.month} 月點數明細<small>${shortDate(r.range.start)}～${shortDate(r.range.end)}</small>`, body: (r) => (r.before ? '<p class="apt-sub-note">報到前，沒有點數</p>' : `${pointMonthStats(r)}${itemTable(r.pf.items)}`) },
          `${sinceText()}｜每月點數`,
          `藍柱我、橘線行政平均、虛線 ${Core.STAGE_1}／${Core.STAGE_2}`,
          CH.columns({
            labels: yr.map((r) => `${r.range.month}月`),
            bars: [{ name: '我', values: yr.map((r) => (r.before ? null : r.pf.points.total)), color: C_ME }],
            lines: [{ name: '行政平均', values: yr.map((r) => (r.before ? null : r.pf.points.avg)), color: C_AVG, dash: true }],
            refs: [
              { value: Core.STAGE_1, label: `${Core.STAGE_1}`, color: C_STAGE1 },
              { value: Core.STAGE_2, label: `${Core.STAGE_2}`, color: C_STAGE2 }
            ],
            pick: pickOf('pm')
          })
        )
      : chartCard(`${sinceText()}｜每月點數`, '', yearStatus() || `<p class="apt-sub-note">準備載入${sinceText()}資料…</p>`);
    return `<div class="apt-charts">
        ${chartCard('點數｜怎麼算', `本月 ${shortDate(range.start)}～${shortDate(range.end)}，占整體 80%`, pointScoreBox(pf))}
        ${monthChart}
        ${pickCard(
          {
            id: 'pw',
            list: weeks,
            title: (w) => `${w.label} 週點數明細${w.current ? ' <i class="apt-tag">本週</i>' : ''}`,
            body: (w) =>
              pickStats([
                ['我的點數', w.mine, toneBetter(w.mine, w.avg)],
                ['行政平均', num1(w.avg)],
                ['跟平均比', w.avg ? diffText((w.mine - w.avg) / w.avg, '多', '少') : NIL]
              ]) + dayRows(personDays(pf.name, w.start, w.end), false)
          },
          `本月｜每週點數`,
          `週一～週日，藍柱我、橘線行政平均${crawled}`,
          CH.columns({
            labels: weeks.map((w) => w.label),
            bars: [{ name: '我', values: weeks.map((w) => w.mine), color: C_ME }],
            lines: [{ name: '行政平均', values: weeks.map((w) => w.avg), color: C_AVG, dash: true }],
            pick: pickOf('pw')
          })
        )}
        ${pickCard(
          { id: 'pi', list: items, title: (it) => `${esc(it.label)}｜本月明細`, body: (it) => itemDetail(ctx.p, it) },
          '各項目｜我 vs 有做的人平均',
          '上條我、下條有做這項的人平均；右側多 15% 以上綠、少 15% 以上紅',
          CH.hbars({
            rows: items.map((i) => ({ label: i.label, note: `${i.doers} 人有做`, values: [i.mine, i.doersAvg] })),
            series: [
              { name: '我', color: C_ME },
              { name: '有做的人平均', color: C_ALL }
            ],
            fmt: (v) => num1(Math.round(v * 10) / 10),
            tagOf: itemTag,
            pick: pickOf('pi')
          })
        )}
      </div>
      <h4 class="apt-sec-title">點數的落後與亮點</h4>
      ${weakStrong(pf, ['點數產出'])}`;
  }

  const RECENT_WEEKS = 8;

  function shiftDay(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return Core.isoDate(d);
  }

  function mondayOf(iso) {
    return shiftDay(iso, -((new Date(iso + 'T00:00:00').getDay() + 6) % 7));
  }

  /** 近 N 週（週一起算）的週區間；有全年資料時可往前跨月 */
  function recentWeeks(range, hire) {
    const today = Core.isoDate(new Date());
    const anchor = mondayOf(range.end < today ? range.end : today);
    const thisWeek = mondayOf(today);
    const dataStart = state.year?.months ? state.year.months[0].range.start : range.start;
    const out = [];
    for (let i = RECENT_WEEKS - 1; i >= 0; i--) {
      const start = shiftDay(anchor, -7 * i);
      const end = shiftDay(start, 6);
      if (end < dataStart) continue;
      out.push({ start, end, label: `${Number(start.slice(5, 7))}/${Number(start.slice(8))}`, current: start === thisWeek, before: !!hire && end < hire });
    }
    return out;
  }

  /** 近 N 週的審核筆數與平均耗時；有全年資料時可跨月 */
  function reviewWeeks(pf, dur, range) {
    const durs = state.year?.months ? state.year.months.map((m) => m.dur) : [dur];
    const weeks = new Map(recentWeeks(range, pf.info?.hireDate).map((w) => [w.start, { ...w, n: 0, sec: 0, allN: 0, allSec: 0, people: new Set(), recs: [] }]));
    const group = new Set(pf.group);
    for (const d of durs) {
      for (const p of d.people) {
        const me = p.name === pf.name;
        if (!me && !group.has(p.name)) continue;
        for (const r of p.records) {
          const w = weeks.get(mondayOf(r.date));
          if (!w) continue;
          if (me) {
            w.n += 1;
            w.sec += r.sec;
            w.recs.push(r);
          }
          if (group.has(p.name)) {
            w.allN += 1;
            w.allSec += r.sec;
            w.people.add(p.name);
          }
        }
      }
    }
    return [...weeks.values()].map((w) => {
      if (w.before) {
        return { label: w.label, start: w.start, end: w.end, current: w.current, before: true, count: null, perPerson: null, avg: null, base: null, diff: null };
      }
      const avg = w.n ? w.sec / w.n : null;
      const base = w.allN ? w.allSec / w.allN : null;
      return {
        label: w.label,
        start: w.start,
        end: w.end,
        current: w.current,
        recs: w.recs,
        count: w.n,
        perPerson: w.people.size ? w.allN / w.people.size : 0,
        avg,
        base,
        diff: avg != null && base ? avg / base - 1 : null
      };
    });
  }

  function reviewScoreBox(pf) {
    const CH = window.AdminPointsCharts;
    const rs = reviewScore(pf);
    const sp = pf.scores.speed;
    const qs = pf.scores.quality;
    const pts = (v) => (v == null ? '<b>-</b>' : `<b>${Math.round(v)}</b> 分`);
    return `<div class="apt-quality-box">
        ${CH.donut({ value: rs, text: rs == null ? '-' : Math.round(rs), sub: '審件分數', color: scoreColor(rs) })}
        <ul>
          <li><b>審件分數 ＝ 審核速度 80% ＋ 審件品質 20%</b>${qs == null ? '（本月沒抽查，只看速度）' : ''}</li>
          <li>速度 ${pts(sp)}：各節點依同仁名次換算（越快越高），再平均（實價登錄不算）</li>
          <li>品質 ${pts(qs)}：抽查良率 100%＝100 分，80% 以下＝0 分</li>
        </ul>
      </div>`;
  }

  function profileReview(ctx) {
    const CH = window.AdminPointsCharts;
    const { pf, dur, range } = ctx;
    const fmt = Core.formatDuration;
    const q = pf.quality;
    const sp = pf.speed;
    const weeks = reviewWeeks(pf, dur, range);
    const nodes = pf.nodes.filter((n) => n.count);
    const actionColors = { 核准: '#16a34a', 退回: '#ef4444', 儲存: '#f59e0b' };
    const actionParts = (m) => Object.keys({ ...sp.baseActions, ...sp.actions }).map((k) => ({ label: k, value: m[k] || 0, color: actionColors[k] || C_ALL }));
    const actionRows = [
      { label: '我', parts: actionParts(sp.actions) },
      { label: '全體', parts: actionParts(sp.baseActions) }
    ];
    const qualityBody = `<div class="apt-quality-box">
        ${CH.donut({ value: q.rate == null ? null : q.rate * 100, text: q.rate == null ? '-' : `${(q.rate * 100).toFixed(1)}%`, sub: '審件良率', color: q.rate == null ? C_ALL : q.rate < 0.9 ? '#dc2626' : '#16a34a', marks: [90] })}
        <ul>
          <li>抽查 <b>${q.checked}</b> 件，正確 <b>${q.correct}</b> 件</li>
          <li>行政整體良率 <b>${q.baseRate == null ? '-' : (q.baseRate * 100).toFixed(1) + '%'}</b>${q.rank ? `，我第 ${q.rank}／${q.n} 名` : ''}</li>
          <li>低於 90% 列為落後</li>
        </ul>
      </div>`;
    return `<div class="apt-charts">
        ${chartCard('審件分數｜怎麼算', '速度 80%＋品質 20%，占整體 10%', reviewScoreBox(pf))}
        ${pickCard(
          {
            id: 'rw',
            list: weeks,
            title: (w) => `${shortDate(w.start)}～${shortDate(w.end)} 週審件明細${w.current ? ' <i class="apt-tag">本週</i>' : ''}`,
            body: reviewWeekDetail
          },
          `近 ${weeks.length} 週｜審核筆數`,
          '藍柱我、橘線行政每人平均',
          CH.columns({
            labels: weeks.map((w) => w.label),
            bars: [{ name: '我', values: weeks.map((w) => w.count), color: C_ME }],
            lines: [{ name: '行政每人平均', values: weeks.map((w) => w.perPerson), color: C_AVG, dash: true }],
            pick: pickOf('rw')
          })
        )}
        ${pickCard(
          { id: 'rn', list: nodes, title: (n) => `${esc(n.label)}｜本月審核耗時明細`, body: (n) => nodeDetail(ctx, n) },
          '速度｜各節點平均耗時',
          `${SPEED_NOTE}；實價登錄是專案不計分`,
          speedBars(nodes, fmt, pickOf('rn'))
        )}
        ${chartCard('品質｜審件良率', '黑線＝90% 門檻', qualityBody)}
        ${pickCard(
          { id: 'ra', list: actionRows, title: () => '審核動作明細', body: () => actionDetail(pf) },
          '審核動作｜占比',
          '核准綠、退回紅、儲存黃',
          CH.stack({ rows: actionRows, pick: pickOf('ra') })
        )}
      </div>
      <h4 class="apt-sec-title">審件的落後與亮點</h4>
      ${weakStrong(pf, REVIEW_AREAS)}`;
  }

  function profileOverall(ctx) {
    const CH = window.AdminPointsCharts;
    const { pf } = ctx;
    const yr = ctx.year;
    const weights = pf.weights || Core.scoreWeights(pf.scores);
    const used = pf.dims.filter((d) => pf.scores[d.key] != null && weights[d.key]);
    const dimColors = { points: C_ME, speed: '#0ea5e9', quality: '#16a34a', conduct: '#f59e0b' };
    const contrib = (d) => ((pf.scores[d.key] ?? 0) * weights[d.key]) / 100;
    const basis = {
      points: `月累積 ${pf.points.total} 點，第 ${pf.points.rank}／${pf.points.n} 名（行政平均 ${num1(pf.points.avg)}）`,
      speed: pf.speed.count
        ? pf.nodes
            .filter((n) => n.count && n.scored)
            .map((n) => `${n.label} ${Math.round(n.score)}`)
            .join('、') || '本月沒有通識節點審核'
        : '本月沒有審核紀錄',
      quality: pf.quality.rate == null ? '本月還沒有抽查' : `良率 ${(pf.quality.rate * 100).toFixed(1)}%（抽查 ${pf.quality.checked} 件）`,
      conduct: `客訴 ${pf.quality.complaints} 件、懲處 ${pf.quality.penalty}`
    };
    const rule = {
      points: '依點數在行政同仁中的名次換算',
      speed: '通識節點各自依同仁名次換算，做過的節點等權平均（實價登錄不計）',
      quality: '良率 100% 得 100、90% 得 50、80% 以下 0',
      conduct: '滿分 100，每件客訴扣 15、小過扣 40、大過扣 80'
    };
    const scoreTone = (v) => (v == null ? '' : v >= 70 ? 'apt-tone--green' : v >= 50 ? 'apt-tone--yellow' : 'apt-tone--red');
    const dimDetail = (d) =>
      pickStats([
        ['分數', pf.scores[d.key] == null ? NIL : Math.round(pf.scores[d.key]), scoreTone(pf.scores[d.key])],
        ['權重', `${weights[d.key]}%`],
        ['貢獻總分', weights[d.key] ? contrib(d).toFixed(1) : '0']
      ]) +
      `<ul class="apt-pick-list"><li><em>計分方式</em>${rule[d.key]}</li><li><em>本月依據</em>${esc(basis[d.key])}</li></ul>`;
    const trend = yr
      ? CH.columns({
          labels: yr.map((r) => `${r.range.month}月`),
          bars: [{ name: '綜合評等', values: yr.map((r) => (r.before || r.pf.score == null ? null : Math.round(r.pf.score))), color: (v) => scoreColor(v) }],
          refs: [
            { value: 85, label: 'A', color: '#16a34a' },
            { value: 70, label: 'B', color: '#2563eb' },
            { value: 50, label: 'C', color: '#d97706' }
          ],
          max: 100,
          pick: pickOf('om')
        })
      : yearStatus() || `<p class="apt-sub-note">準備載入${sinceText()}資料…</p>`;
    return `${window.GrowthCompass ? profileCompass(ctx) : ''}
      <h4 class="apt-sec-title">📊 評分圖表<small>綜合評等怎麼算出來、各分項分數與每月變化；點圖表看明細</small></h4>
      <div class="apt-charts">
        ${chartCard('四大分項雷達圖', '0–100 分，越外圈越好', CH.radar({ axes: pf.dims.map((d) => ({ label: d.label, value: pf.scores[d.key] })) }))}
        ${pickCard(
          { id: 'od', list: pf.dims, title: (d) => `${d.label}｜本月評分明細`, body: dimDetail },
          '總分組成',
          `總分 ${pf.score == null ? '-' : Math.round(pf.score)}／100，各分項依權重貢獻；點分項看怎麼算`,
          CH.stack({
            rows: [
              {
                label: '總分',
                parts: [...used.map((d) => ({ label: d.label, value: Math.round(contrib(d) * 10) / 10, color: dimColors[d.key] })), { label: '未得分', value: Math.round((100 - (pf.score || 0)) * 10) / 10, color: '#e2e8f0' }]
              }
            ]
          }) +
            CH.hbars({
              rows: pf.dims.map((d) => ({ label: d.label, note: `占 ${weights[d.key]}%`, values: [pf.scores[d.key]] })),
              series: [{ name: '分數', color: C_ME }],
              fmt: (v) => String(Math.round(v)),
              colorOf: (v) => scoreColor(v),
              pick: pickOf('od')
            })
        )}
        ${(yr ? pickCard : (c, ...a) => chartCard(...a))(
          { id: 'om', list: yr || [], title: (r) => `${r.range.month} 月評等明細<small>${shortDate(r.range.start)}～${shortDate(r.range.end)}</small>`, body: gradeMonthDetail },
          `${sinceText()}｜每月綜合評等`,
          '虛線 A 85、B 70、C 50',
          trend
        )}
      </div>
      <p class="apt-sub-note">綜合評等 ${pf.score == null ? '-' : Math.round(pf.score)} 分（${pf.grade} ${pf.label}）：A 85 分以上、B 70 分以上、C 50 分以上、D 50 分以下；點數 80%、審件 10%（速度 8%＋品質 2%）、客訴紀律 10% 固定不變；本月沒抽查時審件 10% 全看速度，沒有審核紀錄時審件 10% 以 0 分計</p>
      <h4 class="apt-sec-title">所有落後與亮點</h4>
      ${weakStrong(pf, null)}
      <p class="apt-sub-note">件數少於 3 件的節點或項目不列入落後／亮點判斷。比較對象為人力明細在職正職（不含工讀生）。</p>`;
  }

  function profileConduct(ctx) {
    const CH = window.AdminPointsCharts;
    const { pf } = ctx;
    const yr = ctx.year;
    const q = pf.quality;
    const box = `<div class="apt-quality-box">
        ${CH.donut({ value: pf.scores.conduct, text: Math.round(pf.scores.conduct), sub: '紀律分數', color: scoreColor(pf.scores.conduct) })}
        <ul>
          <li class="${q.complaints ? 'apt-bad' : ''}">本月客訴 <b>${q.complaints}</b> 件（行政平均 ${num1(q.avgComplaints)}）</li>
          <li class="${q.penalty === '無' ? '' : 'apt-bad'}">本月懲處 <b>${q.penalty}</b></li>
          <li>滿分 100，每件客訴扣 15、小過扣 40、大過扣 80</li>
        </ul>
      </div>`;
    const trend = yr
      ? CH.columns({
          labels: yr.map((r) => `${r.range.month}月`),
          bars: [{ name: '我的客訴', values: yr.map((r) => (r.before ? null : r.pf.quality.complaints)), color: '#ef4444' }],
          lines: [{ name: '行政平均', values: yr.map((r) => (r.before ? null : r.pf.quality.avgComplaints)), color: C_AVG, dash: true }],
          pick: pickOf('cm')
        })
      : yearStatus() || `<p class="apt-sub-note">準備載入${sinceText()}資料…</p>`;
    const act = (yr || []).filter((r) => !r.before);
    const yearNote = yr ? ` · ${totalText()} ${act.reduce((s, r) => s + r.pf.quality.complaints, 0)} 件、${act.filter((r) => r.pf.quality.penalty !== '無').length} 個月有懲處` : '';
    return `<div class="apt-charts">
        ${chartCard('本月｜客訴紀律', '紀律分數 0–100', box)}
        ${(yr ? pickCard : (c, ...a) => chartCard(...a))(
          { id: 'cm', list: yr || [], title: (r) => `${r.range.month} 月客訴紀律明細<small>${shortDate(r.range.start)}～${shortDate(r.range.end)}</small>`, body: conductMonthDetail },
          `${sinceText()}｜每月客訴件數`,
          `紅柱我、橘線行政平均${yearNote}`,
          trend
        )}
      </div>
      <h4 class="apt-sec-title">客訴紀律的落後與亮點</h4>
      ${weakStrong(pf, ['客訴紀律'])}`;
  }

  /** Google 雲端硬碟分享連結 → 內嵌播放網址 */
  function driveEmbed(url) {
    const id = String(url || '').match(/\/file\/d\/([\w-]+)/)?.[1] || String(url || '').match(/[?&]id=([\w-]+)/)?.[1];
    return id ? `https://drive.google.com/file/d/${id}/preview` : '';
  }

  function trainingVideo(v) {
    const src = driveEmbed(v.url);
    return `<section class="apt-train-sec apt-train-video">
        <h5>🎬 ${esc(v.title)}${v.length ? `<small>${esc(v.length)}</small>` : ''}</h5>
        ${
          v.course && window.CourseExam
            ? `<div id="course-video-root" data-course="${esc(v.course)}"><p class="apt-train-empty">影片載入中…</p></div>`
            : src
            ? `<div class="apt-video-frame"><iframe src="${esc(src)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="${esc(v.title)}"></iframe></div>
          <a class="apt-video-open" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">在新分頁開啟影片 ↗</a>`
            : '<p class="apt-train-empty">影片上架中，連結設定好後會直接在這裡播放。</p>'
        }
      </section>`;
  }

  function trainingMaterial(key) {
    const m = window.AdminTrainingContent?.[key];
    const sections = m?.sections || [];
    const links = m?.links || [];
    const tables = m?.tables || [];
    const videos = m?.videos || [];
    if (!m?.summary && !sections.length && !links.length && !tables.length && !videos.length && !m?.flow) {
      return '<p class="apt-train-empty">教材準備中，內容上架後會顯示在這裡。</p>';
    }
    return `${m.summary ? `<p class="apt-train-summary">${esc(m.summary)}</p>` : ''}
      ${(m.alerts || []).map(trainingAlert).join('')}
      ${m.flow ? trainingFlow(key, m.flow) : ''}
      ${m.checklist ? trainingChecklist(key, m.checklist) : ''}
      ${videos.map(trainingVideo).join('')}
      ${tables
        .map(
          (t) => `<section class="apt-train-sec">${t.title ? `<h5>${esc(t.title)}</h5>` : ''}<div class="apt-table-wrap"><table class="apt-table apt-train-table">
            <thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody>
          </table></div></section>`
        )
        .join('')}
      ${sections
        .map(
          (s) => `<section class="apt-train-sec"><h5>${esc(s.title)}</h5>${
            s.items?.length ? `<ol>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''
          }</section>`
        )
        .join('')}
      ${links.length ? `<div class="apt-train-links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}`;
  }

  /** 教材文字：==重點== 標成螢光 */
  const hl = (s) => esc(s).replace(/==(.+?)==/g, '<mark class="apt-hl">$1</mark>');

  function trainingAlert(a) {
    return `<section class="apt-flow-alert">
        <h5>⚠️ ${esc(a.title)}</h5>
        <ul>${a.items.map((x) => `<li>${hl(x)}</li>`).join('')}</ul>
      </section>`;
  }

  function trainingFlow(key, flow) {
    return `<section class="apt-flow" data-flow="${esc(key)}">
        <div class="apt-flow-head">
          <h5>${esc(flow.title || '操作流程')}</h5>
          <button type="button" class="apt-flow-all" data-flow-all>全部展開</button>
        </div>
        <ol class="apt-flow-line">${flow.steps
          .map(
            (s, i) => `<li class="apt-flow-node">
            <button type="button" class="apt-flow-toggle" data-flow-toggle aria-expanded="false">
              <b class="apt-flow-no">${i + 1}</b>
              <span class="apt-flow-name">${esc(s.title)}</span>
              <i class="apt-flow-caret" aria-hidden="true">▾</i>
            </button>
            <div class="apt-flow-panel"><div class="apt-flow-body">
              <ul>${s.items.map((x) => `<li>${hl(x)}</li>`).join('')}</ul>
              ${s.warn ? `<p class="apt-flow-warn">⚠️ ${hl(s.warn)}</p>` : ''}
              ${s.tip ? `<p class="apt-flow-tip">💡 ${hl(s.tip)}</p>` : ''}
            </div></div>
          </li>`
          )
          .join('')}</ol>
      </section>`;
  }

  function setFlowNode(node, open) {
    node.classList.toggle('is-open', open);
    node.querySelector('[data-flow-toggle]').setAttribute('aria-expanded', String(open));
  }

  const checkStore = (key) => `apt-checklist-${key}`;
  function checkedOf(key) {
    try {
      return new Set(JSON.parse(localStorage.getItem(checkStore(key)) || '[]'));
    } catch {
      return new Set();
    }
  }
  const checkProgress = (done, total) => (done === total ? `✅ ${total} 項全部核對完成` : `已核對 ${done}／${total} 項`);

  function trainingChecklist(key, c) {
    const done = checkedOf(key);
    const n = c.items.filter((_, i) => done.has(i)).length;
    return `<section class="apt-check" data-checklist="${esc(key)}">
        <div class="apt-flow-head">
          <h5>☑️ ${esc(c.title)}</h5>
          <span class="apt-check-progress${n === c.items.length ? ' is-done' : ''}">${checkProgress(n, c.items.length)}</span>
        </div>
        ${c.intro ? `<p class="apt-check-intro">${hl(c.intro)}</p>` : ''}
        <ul class="apt-check-list">${c.items
          .map(
            (it, i) => `<li><label${done.has(i) ? ' class="is-checked"' : ''}><input type="checkbox" data-check="${i}"${done.has(i) ? ' checked' : ''}>
              <span><b>${esc(it.title)}</b>${hl(it.desc)}</span></label></li>`
          )
          .join('')}</ul>
        ${(c.notes || []).length ? `<ul class="apt-check-notes">${c.notes.map((x) => `<li>${hl(x)}</li>`).join('')}</ul>` : ''}
        <button type="button" class="apt-check-reset" data-check-reset>清除勾選，核對下一件</button>
      </section>`;
  }

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-flow-toggle]');
    if (toggle) {
      const node = toggle.closest('.apt-flow-node');
      const open = !node.classList.contains('is-open');
      setFlowNode(node, open);
      if (open) window.Reveal?.(node, { height: toggle.offsetHeight + node.querySelector('.apt-flow-body').scrollHeight });
      const flow = node.closest('.apt-flow');
      const nodes = [...flow.querySelectorAll('.apt-flow-node')];
      flow.querySelector('[data-flow-all]').textContent = nodes.every((n) => n.classList.contains('is-open')) ? '全部收合' : '全部展開';
      return;
    }
    const all = e.target.closest('[data-flow-all]');
    if (all) {
      const nodes = [...all.closest('.apt-flow').querySelectorAll('.apt-flow-node')];
      const open = nodes.some((n) => !n.classList.contains('is-open'));
      nodes.forEach((n) => setFlowNode(n, open));
      all.textContent = open ? '全部收合' : '全部展開';
      return;
    }
    const reset = e.target.closest('[data-check-reset]');
    if (reset) {
      const box = reset.closest('[data-checklist]');
      localStorage.removeItem(checkStore(box.dataset.checklist));
      box.querySelectorAll('input[data-check]').forEach((x) => (x.checked = false));
      syncChecklist(box);
    }
  });
  document.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-check]');
    const box = input?.closest('[data-checklist]');
    if (box) syncChecklist(box);
  });
  function syncChecklist(box) {
    const inputs = [...box.querySelectorAll('input[data-check]')];
    const done = inputs.filter((x) => x.checked).map((x) => Number(x.dataset.check));
    try {
      localStorage.setItem(checkStore(box.dataset.checklist), JSON.stringify(done));
    } catch {
      /* 無痕模式存不了就只保留畫面勾選 */
    }
    inputs.forEach((x) => x.closest('label').classList.toggle('is-checked', x.checked));
    const progress = box.querySelector('.apt-check-progress');
    progress.textContent = checkProgress(done.length, inputs.length);
    progress.classList.toggle('is-done', done.length === inputs.length);
  }

  function trainStepText(key, name, step) {
    if (step.pending) return '實作：模擬系統準備中';
    if (step.key === 'practice') {
      const p = window.SimPractice?.statusOf(key, name);
      return `${step.label} ${step.ok ? '✅' : p?.loaded ? `${p.passes}／${p.target} 題` : '⬜'}`;
    }
    if (step.key === 'video') {
      const v = window.CourseExam?.statusOf(key, name)?.video;
      return `${step.label} ${step.ok ? '✅' : v?.loaded ? `${v.pct}%` : '⬜'}`;
    }
    if (key === 'guide') {
      const p = window.GuideExam?.progressOf(name);
      return `${step.label} ${step.ok ? '✅' : p?.loaded ? `${p.passed}／${p.total} 題` : '⬜'}`;
    }
    return `${step.label} ${step.ok ? '✅' : '⬜'}`;
  }

  function trainBoxHtml(key, name) {
    const t = trainState(key, name);
    const note = !t.ready ? '這一項的教學影片與考試還在準備' : t.steps.map((x) => trainStepText(key, name, x)).join(' · ');
    return `<div class="${t.done ? 'is-ok' : 'is-no'}" data-train-box="${key}|${esc(name)}">
            <span>教育訓練</span>
            <b>${trainStateText(t)}</b>
            <small>${esc(note)}</small>
          </div>`;
  }

  const RING_LEN = 2 * Math.PI * 42;

  function dashGauge(id, icon, label, g) {
    const pct = Math.max(0, Math.min(100, Math.round(g.pct || 0)));
    const tone = g.done ? 'is-done' : pct > 0 ? 'is-doing' : 'is-todo';
    const open = state.dashOpen === id;
    return `<button type="button" class="apt-tg ${tone}${open ? ' is-open' : ''}" data-dash-open="${id}" aria-expanded="${open}">
        <span class="apt-tg-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="apt-tg-track" cx="50" cy="50" r="42"></circle>
            <circle class="apt-tg-bar" cx="50" cy="50" r="42" stroke-dasharray="${((pct / 100) * RING_LEN).toFixed(1)} ${RING_LEN.toFixed(1)}"></circle>
          </svg>
          <b>${esc(g.value)}</b>
        </span>
        <span class="apt-tg-name">${icon} ${label}</span>
        <small>${esc(g.note)}</small>
        <i class="apt-tg-more">${open ? '收合 ▴' : '展開 ▾'}</i>
      </button>`;
  }

  /** 教材影片／線上考試／模擬實作 三個進度儀表；資料載入後由 refreshTraining 重畫 */
  function trainDashHtml(key, name) {
    const c = window.CourseExam?.statusOf(key, name);
    const sp = window.SimPractice?.statusOf(key, name);
    const wait = { pct: 0, value: '…', note: '讀取中' };
    const video = !c?.loaded
      ? wait
      : c.video.done
        ? { pct: 100, done: true, value: '✓', note: '已看完' }
        : { pct: c.video.pct, value: `${c.video.pct}%`, note: '看過 95% 以上算看完' };
    const exam = !c?.loaded
      ? wait
      : c.passed
        ? { pct: 100, done: true, value: '100', note: '滿分通過' }
        : c.attempts
          ? { pct: c.best || 0, value: `${c.best ?? 0}`, note: `最高 ${c.best ?? 0} 分 · 考 ${c.attempts} 次，要 100 分` }
          : { pct: 0, value: '—', note: '還沒考，要 100 分才通過' };
    const practice = !sp?.ready
      ? { pct: 0, value: '—', note: '模擬系統準備中' }
      : !sp.loaded
        ? wait
        : { pct: (sp.passes / (sp.target || 1)) * 100, done: sp.done, value: `${Math.min(sp.passes, sp.target)}/${sp.target}`, note: sp.done ? '實作完成' : `通過 ${sp.passes}／${sp.target} 題` };
    return `<div class="apt-dash-gauges" data-train-dash="${key}|${esc(name)}">
        ${dashGauge('video', '🎬', '教材影片', video)}
        ${dashGauge('exam', '📝', '線上考試', exam)}
        ${window.SimPractice ? dashGauge('practice', '🧪', '模擬實作', practice) : ''}
      </div>`;
  }

  function setDashOpen(dash, id) {
    state.dashOpen = id;
    dash.querySelectorAll('[data-dash-open]').forEach((b) => {
      const on = b.dataset.dashOpen === id;
      b.classList.toggle('is-open', on);
      b.setAttribute('aria-expanded', String(on));
      b.querySelector('.apt-tg-more').textContent = on ? '收合 ▴' : '展開 ▾';
    });
    dash.querySelectorAll('[data-dash-panel]').forEach((p) => {
      const on = p.dataset.dashPanel === id;
      p.classList.toggle('is-open', on);
      if (!on) p.querySelectorAll('video').forEach((v) => v.pause());
    });
    const panel = id && dash.querySelector(`[data-dash-panel="${id}"]`);
    if (panel) window.Reveal?.(panel, { height: panel.querySelector('.apt-dash-body').scrollHeight });
  }

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-dash-open]');
    if (!g) return;
    const id = g.dataset.dashOpen;
    setDashOpen(g.closest('.apt-dash'), state.dashOpen === id ? null : id);
  });

  function profileTraining(ctx) {
    const { pf } = ctx;
    const fmt = Core.formatDuration;
    const yc = yearCounts(ctx.year);
    if (state.trainShut) return trainingGrid(pf, '', '');
    const s = pf.training.find((x) => x.key === state.trainNode) || pf.training[0];
    const year = yc?.get(s.key);
    const knows = s.count || s.reviews || year;
    const trainBox = trainBoxHtml(s.key, pf.name);
    if (s.general) {
      return trainingGrid(pf, s.key, `
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練<button type="button" class="apt-fold-btn apt-train-close" data-train-close title="收起這門課">收起 ▴</button></h4>
        <div class="apt-train-split">
          <div class="apt-train-col">
            <div class="apt-train-status is-single">${trainBox}</div>
            ${s.key === 'guide' && window.GuideExam ? `<h5 class="apt-sec-title">線上考試</h5><div id="guide-exam-root" data-name="${esc(pf.name)}"></div>` : ''}
          </div>
          <div class="apt-train-col apt-train-col--material">
            <h5 class="apt-sec-title">教材</h5>
            ${trainingMaterial(s.key)}
          </div>
        </div>
        ${s.key === 'guide' && window.GuideExam ? guideBoardSection('所有在職行政') : ''}
      </div>`);
    }
    const status = `<div class="apt-train-status">
          ${trainBox}
          <div class="${knows ? 'is-ok' : 'is-no'}">
            <span>實務</span>
            <b>${knows ? '✔ 已會' : '還沒做過'}</b>
            <small>本月 ${s.count} 件${s.rank ? `（第 ${s.rank}／${s.doers} 名）` : ''}${yc ? ` · ${sinceText()} ${year || 0} 件` : ''}</small>
          </div>
          <div>
            <span>審核速度</span>
            <b>${s.reviews ? fmt(s.avg) : NIL}</b>
            <small>${s.reviews ? (s.speedRank ? `同節點第 <i class="apt-tag ${speedTone(s.speedScore)}">${s.speedRank}／${s.speedN}</i> 名（${Core.rankBand(s.speedRank, s.speedN)}）` : '') : '本月沒有審核紀錄'}</small>
          </div>
        </div>`;
    if (window.CourseExam?.has(s.key)) {
      const panel = (id, body) => `<section class="apt-dash-panel${state.dashOpen === id ? ' is-open' : ''}" data-dash-panel="${id}">
            <div class="apt-dash-inner"><div class="apt-dash-body">${body}</div></div>
          </section>`;
      return trainingGrid(pf, s.key, `
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練<button type="button" class="apt-fold-btn apt-train-close" data-train-close title="收起這門課">收起 ▴</button></h4>
        ${status}
        <div class="apt-dash">
          ${trainDashHtml(s.key, pf.name)}
          ${panel('video', trainingMaterial(s.key))}
          ${panel('exam', `<div id="course-exam-root" data-course="${s.key}" data-name="${esc(pf.name)}"></div>`)}
          ${window.SimPractice ? panel('practice', `<div id="sim-practice-root" data-course="${s.key}" data-name="${esc(pf.name)}"></div>`) : ''}
        </div>
      </div>`);
    }
    return trainingGrid(pf, s.key, `
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練<button type="button" class="apt-fold-btn apt-train-close" data-train-close title="收起這門課">收起 ▴</button></h4>
        ${status}
        <h5 class="apt-sec-title">教材</h5>
        ${trainingMaterial(s.key)}
      </div>`);
  }

  function profileCompass(ctx) {
    if (!window.GrowthCompass) return '<p class="apt-empty">成長羅盤載入失敗，請重新整理頁面</p>';
    return `<div id="apt-compass-root" data-name="${esc(ctx.pf.name)}" data-year="${ctx.range.year}" data-month="${ctx.range.month}"></div>`;
  }

  function renderPerson() {
    const r = state.result;
    if (state.person && !canSee(state.person)) state.person = '';
    if (!state.person && r.people.some((p) => p.name === myName())) state.person = myName();
    const opts = GROUPS.map((g) => {
      const list = r.people.filter((p) => p.group === g.key && canSee(p.name));
      if (!list.length) return '';
      return `<optgroup label="${g.key}">${list
        .map((p) => `<option value="${esc(p.name)}"${p.name === state.person ? ' selected' : ''}>${esc(p.name)}（${p.month.total}）</option>`)
        .join('')}</optgroup>`;
    }).join('');
    const p = r.people.find((x) => x.name === state.person);
    const me = myName();
    const meBtn = me && me !== state.person && r.people.some((x) => x.name === me) ? `<button type="button" class="apt-btn-lite" data-person="${esc(me)}">看我自己</button>` : '';
    let body = '<p class="apt-empty">請選擇人員</p>';
    if (p) {
      const range = state.meta.range;
      const dur = Core.durationReport(state.auditRows, { start: range.start, end: range.end, staff: state.sb?.staff || [] });
      const today = Core.isoDate(new Date());
      const pf = Core.personProfile(r, dur, {
        name: p.name,
        staff: state.sb?.staff || [],
        checks: state.sb?.checks || [],
        incidents: state.sb?.incidents || [],
        weeks: Core.weeksOf(range).filter((w) => w.start <= today)
      });
      if (state.personView === 'compass') state.personView = 'overall';
      const view = state.personView;
      if (['points', 'review', 'conduct', 'overall'].includes(view) && state.year?.key !== `${range.year}-${range.month}`) loadYear();
      const ctx = { p, pf, dur, range, days: dayList(), year: yearRows(p.name) };
      const views = { points: profilePoints, review: profileReview, conduct: profileConduct, overall: profileOverall, training: profileTraining };
      const inner = (views[view] || profileHome)(ctx);
      body = `<div class="apt-profile">
          ${profileHeader(pf)}
          ${view === 'home' ? '' : focusNav(pf, view)}
          ${view !== 'home' && state.year?.loading ? yearStatus() : ''}
          ${inner}
        </div>`;
    }
    return `<div class="apt-sub-bar"><label>人員 <select id="apt-person"><option value="">請選擇</option>${opts}</select></label>${meBtn}</div>${body}`;
  }

  function prevRange(range) {
    let { year, month } = range;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    return Core.perfMonthRange(year, month);
  }

  /** 預估獎金要看上個業績月是否達 250 點；只有本月有人達 250 點時才去抓上個月 */
  async function loadPrev(range) {
    const key = `${range.year}-${range.month}`;
    if (state.prev?.key === key) return;
    state.prev = { key, loading: true };
    const pr = prevRange(range);
    try {
      const [audit, expenses, term, sb] = await Promise.all([
        fetchWorker('/admin-points/audit-log', '上月審核時間紀錄', pr, false),
        fetchWorker('/admin-points/expenses', '上月補助審核', pr, false),
        fetchTerminations(pr, false),
        fetchSupabase(pr)
      ]);
      const res = Core.compute(auditRowsOf(audit), {
        start: pr.start,
        end: pr.end,
        staff: sb.staff || [],
        exclude: sb.excluded,
        manual: sb.manual || [],
        opinions: sb.opinions || [],
        expenses: auditRowsOf(expenses),
        terminations: auditRowsOf(term)
      });
      state.prev = { key, totals: new Map(res.people.map((p) => [p.name, p.month.total])) };
    } catch (err) {
      state.prev = { key, error: String(err.message || err) };
    }
    if (isWeeklyTab()) render();
  }

  /** 組長週月報、區主管週月報共用同一批資料（上月點數、KPI、應繳件數） */
  function isWeeklyTab() {
    return state.tab === 'weekly' || state.tab === 'area';
  }

  function money(n) {
    return n ? n.toLocaleString('en-US') : '0';
  }

  /** 週報共用：所選週、本週報表列（filter 傳給 weeklyReport 的 leader／names），需要時去抓上月點數 */
  function weeklyData(filter) {
    const range = state.meta.range;
    const sb = state.sb || {};
    const weeks = Core.weeksOf(range);
    const week = weeks.find((w) => w.start === state.week) || weeks[0];
    const prevKey = `${range.year}-${range.month}`;
    const pr = prevRange(range);
    const prevTotals = Core.beforeFirstPerf(pr.year, pr.month)
      ? new Map()
      : state.prev?.key === prevKey
        ? state.prev.totals || null
        : null;
    const rep = Core.weeklyReport(state.result, {
      staff: sb.staff || [],
      checks: sb.checks || [],
      incidents: sb.incidents || [],
      week,
      perf: range,
      prevTotals,
      ...filter
    });
    if (rep.rows.some((r) => r.bonusPending) && state.prev?.key !== prevKey) loadPrev(range);
    const prevErr = state.prev?.key === prevKey && state.prev.error;
    return { range, sb, week, rep, prevErr };
  }

  function bonusCellOf(prevErr) {
    return (r) => {
      if (r.bonusPending) return prevErr ? '<span title="上月點數讀取失敗，未套用八折判斷">?</span>' : '計算中…';
      return money(r.bonus);
    };
  }

  const blockZone = (kind, html) => `<section class="apt-block apt-block--${kind}">${html}</section>`;

  const WEEKLY_NOTE = () =>
    `點欄位標題就用那一欄排序，再點一次反過來；# 是目前排序的名次（同值同名次）。本週點數、審件抽查／正確／良率、客訴件數依所選週（週一～週日）加總；月累積點數、月度級距、預估個人獎金、本月懲處依業績月。不含工讀生。到職未滿一個月（以週結束日判斷）為「新人首月排除」，不發獎金。預估獎金：達 ${Core.STAGE_1} 點 2,000、達 ${Core.STAGE_2} 點 5,000，上個業績月未達 ${Core.STAGE_1} 點打八折；達 ${Core.STAGE_1} 點另加專案任務（清冊＋公會對接 3,000、實價登錄 2,000）。審件良率顏色：90% 以上綠、60%～未滿 90% 黃、未滿 60% 紅（同主管簡報）。`;

  /** 組員點數表欄位（組長週月報、區主管週月報共用） */
  function staffCols(prevErr) {
    const bonusCell = bonusCellOf(prevErr);
    const penaltyLevel = { 無: 0, 小過: 1, 大過: 2 };
    return [
      { key: 'name', label: '姓名', dir: 1, value: (r) => r.name, cell: (r) => `<td><button type="button" class="apt-name" data-person="${esc(r.name)}">${esc(r.name)}</button></td>` },
      { key: 'region', label: '部別', dir: 1, value: (r) => (r.region ? Core.regionRank(r.region) : null), cell: (r) => `<td>${esc(r.region)}</td>` },
      { key: 'office', label: '營業處', dir: 1, value: (r) => r.office || null, cell: (r) => `<td>${esc(r.office)}</td>` },
      { key: 'hire', label: '報到年月', dir: 1, value: (r) => r.hire || null, cell: (r) => `<td>${esc(r.hire)}</td>` },
      {
        key: 'project',
        label: '專案任務',
        dir: 1,
        value: (r) => r.project || null,
        cell: (r) => `<td>${r.project ? `<span class="apt-proj${/清冊/.test(r.project) ? ' apt-proj--list' : ''}">${esc(r.project)}</span>` : ''}</td>`
      },
      { key: 'weekPoints', label: '本週點數', num: true, dir: -1, value: (r) => r.weekPoints, cell: (r) => `<td class="num">${r.weekPoints}</td>` },
      { key: 'points', label: '月累積點數', num: true, dir: -1, value: (r) => r.points, cell: (r) => `<td class="num apt-total">${r.points}</td>` },
      { key: 'stage', label: '月度級距', dir: -1, value: (r) => r.stage, cell: (r) => `<td><span class="apt-level apt-level--${r.stage}">${r.stageLabel}</span></td>` },
      { key: 'toNext', label: '距下一級', num: true, dir: 1, value: (r) => r.toNext, cell: (r) => `<td class="num">${r.toNext}</td>` },
      { key: 'bonus', label: '預估個人獎金', num: true, dir: -1, value: (r) => (r.bonusPending ? null : r.bonus), cell: (r) => `<td class="num">${bonusCell(r)}</td>` },
      { key: 'checked', label: '審件抽查', num: true, dir: -1, value: (r) => r.checked, cell: (r) => `<td class="num">${r.checked}</td>` },
      { key: 'correct', label: '審件正確', num: true, dir: -1, value: (r) => r.correct, cell: (r) => `<td class="num">${r.correct}</td>` },
      {
        key: 'rate',
        label: '審件良率',
        num: true,
        dir: -1,
        value: (r) => (r.rate == null ? null : r.rate * 1000),
        cell: (r) => `<td class="num">${rateChip(r.rate) || NIL}</td>`
      },
      { key: 'complaints', label: '客訴件數', num: true, dir: 1, value: (r) => r.complaints, cell: (r) => `<td class="num">${r.complaints}</td>` },
      {
        key: 'penalty',
        label: '本月懲處',
        dir: 1,
        value: (r) => penaltyLevel[r.penalty] ?? 0,
        cell: (r) => `<td>${r.penalty === '無' ? '無' : `<b class="apt-bad">${r.penalty}</b>`}</td>`
      },
      { key: 'eligible', label: '考核資格', dir: 1, value: (r) => r.eligibleLabel, cell: (r) => `<td>${r.eligibleLabel}</td>` }
    ];
  }

  function staffTable(table, cols, list) {
    const { sorted, ranks } = sortedRows(table, cols, list);
    const rows = sorted
      .map(
        (r, i) => `<tr class="${r.eligible ? '' : 'apt-row-muted'}">
          <td class="apt-rank">${ranks[i]}</td>
          ${cols.map((c) => c.cell(r)).join('')}
        </tr>`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>#</th>${sortHead(table, cols)}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length + 1}" class="apt-empty">沒有符合的人員</td></tr>`}</tbody>
      </table></div>`;
  }

  function renderWeekly() {
    const { range, sb, week, rep, prevErr } = weeklyData({ leader: state.leader });
    const leaders = leaderOrder(sb.staff);
    const scopes = new Map(Core.leaderScopes(sb.staff || []).map((x) => [x.leader, x]));
    const areaText = (l) => scopes.get(l)?.areas.join('・') || '';
    const leaderOpts = ['', ...leaders]
      .map((l) => `<option value="${esc(l)}"${l === state.leader ? ' selected' : ''}>${l ? `${esc(l)}${areaText(l) ? `（${esc(areaText(l))}）` : ''}` : '全部組長'}</option>`)
      .join('');
    const s = rep.summary;
    const zone = blockZone;
    const leaseScope = state.leader ? scopes.get(state.leader) || { leader: state.leader, areas: [] } : null;
    const cols = staffCols(prevErr);
    return `<div class="apt-sub-bar">
        <label class="${state.leader ? 'apt-leader-picked' : ''}">組長 <select id="apt-leader">${leaderOpts}</select></label>
        <span class="apt-sub-note">本週總點數 <b>${s.weekPoints}</b> · 本週登錄人數 <b>${s.active}</b> · 本週審件良率 ${rateChip(s.rate) || '<b>-</b>'} · 本週客訴件數 <b>${s.complaints}</b></span>
      </div>
      ${zone('leader', `<h4 class="apt-sec-title">${state.leader ? '組長與負責區域' : '各組長負責區域'}<small>${state.leader ? '按「看全部組長」回到全區' : '點一下只看該組'}</small></h4>
        ${leaderBanner(state.leader ? scopes.get(state.leader) || { leader: state.leader, members: rep.rows.length, regions: [], areas: [], cities: [] } : null, [...scopes.values()])}`)}
      ${zone('quality', leaderGauges(range, state.leader ? scopes.get(state.leader) || { leader: state.leader, areas: [] } : null))}
      ${state.leaseFolded
        ? leaseFoldedStrip(range, leaseScope)
        : leaseScope
          ? leasePair(range, leaseScope)
          : `<div class="apt-block-pair apt-block-pair--due-wide">${zone('lease', leaseSection(range, null))}${zone('due', leaseDueSection(range, null))}</div>`}
      ${zone('charts', leaderKpiSection(range, week, state.leader ? scopes.get(state.leader) || { leader: state.leader, cities: [] } : null))}
      <section class="apt-block apt-block--points">
      <h4 class="apt-sec-title">組員點數<small>本週點數、月累積與預估獎金</small></h4>
      ${staffTable('weekly', cols, rep.rows)}
      <p class="apt-sub-note">${WEEKLY_NOTE()}${prevErr ? `<br><span class="apt-bad">上月點數讀取失敗：${esc(prevErr)}</span>` : ''}</p>
      </section>
      ${guideBoardSection(state.leader ? `${state.leader} 組` : '全部組別')}`;
  }

  function scrollerOf(el) {
    for (let p = el?.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  /** 點地區／營業處卡片：被點的卡片留在原位，明細從卡片下方展開、把後面的卡片往下推；收起時反過來 */
  function toggleLeaseRegion(key) {
    const closing = state.leaseRegion === key;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tileOf = () =>
      [...$('apt-body').querySelectorAll('.apt-lease-rg [data-lease-region]')].find((b) => b.dataset.leaseRegion === key)?.closest('.apt-lease-rg');
    const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const swap = () => {
      const before = tileOf()?.getBoundingClientRect().top;
      state.leaseRegion = closing ? '' : key;
      render();
      const tile = tileOf();
      if (!tile || before == null) return;
      const scroller = scrollerOf(tile);
      const want = before < 0 ? 88 : before;
      scroller.scrollTop += tile.getBoundingClientRect().top - want;
      const panel = closing ? null : $('apt-body').querySelector('.apt-lease-inline');
      if (!panel) return;
      if (!reduce) {
        panel.style.overflow = 'hidden';
        const anim = panel.animate([{ height: '0px', opacity: 0 }, { height: `${panel.offsetHeight}px`, opacity: 1 }], { duration: 300, easing: ease });
        const done = () => {
          if (anim.playState !== 'finished') anim.cancel();
          panel.style.overflow = '';
        };
        anim.finished.then(done, done);
        setTimeout(done, 450);
      }
      if (tile.getBoundingClientRect().bottom > window.innerHeight - 160) {
        scroller.scrollBy({ top: tile.getBoundingClientRect().top - 88, behavior: reduce ? 'auto' : 'smooth' });
      }
    };
    const old = $('apt-body').querySelector('.apt-lease-inline');
    const tileTop = tileOf()?.getBoundingClientRect().top ?? -1;
    if (closing && old && !reduce && tileTop >= 0) {
      old.style.overflow = 'hidden';
      let swapped = false;
      const once = () => {
        if (!swapped) (swapped = true), swap();
      };
      old.animate([{ height: `${old.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.then(once, once);
      setTimeout(once, 320);
    } else swap();
  }

  /** 應繳件數左＋清冊進度右；點開地區／營業處明細時改上下排，明細才有整排寬 */
  function leasePair(range, scope) {
    const stack = state.leaseRegion ? ' apt-block-pair--stack' : '';
    return `<div class="apt-block-pair${stack}">${blockZone('lease', leaseSection(range, scope))}${blockZone('due', rosterProgressSection(range, scope))}</div>`;
  }

  /* ---------- 區主管週月報：同組長週月報，範圍改成區主管轄下的營業處（依人力明細行政的營業處） ---------- */

  /** 給共用區塊（品質良率、應繳件數、KPI）用的範圍：KPI 地區直接指定，人員用名單 */
  function areaScope(a) {
    return { leader: a.manager, label: `${a.area}（${a.manager}）`, short: a.area, areas: [], kpiRegions: a.regions, names: a.names, cities: a.cities, members: a.members, offices: areaOffices(a) };
  }

  /** 區主管轄下的營業處：同應繳件數，這個月有應繳案件的代管營業處；應繳案件還沒讀到先用媒合管理的處別清單，再沒有用人力明細（一人兼兩處的拆開） */
  function areaOffices(a, range) {
    const lz = state.lease;
    if (range && lz && !lz.loading && !lz.error && lz.key === `${range.year}-${range.month}` && lz.rows.some((r) => r.office)) {
      const m = leaseMonth(range);
      const rows = lz.rows.filter((r) => r.leaseStart >= m.start && r.leaseStart <= m.end && a.regions.includes(r.region));
      return [...new Set(areaOwnRows(rows, a.manager).map((r) => leaseOfficeKey(r, a.manager)))].sort((x, y) => leaseOfficeRank(x) - leaseOfficeRank(y));
    }
    const opts = lz?.offices || [];
    const list = opts.length ? opts.map(Core.officeName) : a.offices.flatMap((o) => o.split('・'));
    return [...new Set(list)].filter((o) => o && Core.officeArea(o)?.manager === a.manager).sort((x, y) => Core.officeRank(x) - Core.officeRank(y));
  }

  function scopeRegions(scope) {
    return scope.kpiRegions || Core.kpiRegionsOfAreas(scope.areas);
  }

  function scopeLabel(scope) {
    return scope.label || (scope.areas || []).join('・') || `${scope.leader} 組`;
  }

  function currentArea(all) {
    const cur = all.find((a) => a.manager === state.area) || null;
    if (!cur) state.area = '';
    return cur;
  }

  /** 目前區主管範圍內的行政（全部區主管＝四區合計，營業處對不到區的不算） */
  function areaStaffNames() {
    const all = Core.areaScopes(state.sb?.staff || []);
    const cur = currentArea(all);
    return new Set(cur ? cur.names : all.flatMap((a) => a.names));
  }

  /** 營業處依區主管分組（應繳件數右邊的繳交日用） */
  function areaDueGroups() {
    const byArea = new Map();
    for (const m of Core.AREA_MANAGERS) byArea.set(m.area, [...new Set([...(byArea.get(m.area) || []), ...m.regions])]);
    return [...byArea].map(([area, list]) => ({ area, list }));
  }

  /** 區主管卡片：點卡片選該區（選中的放大、其他縮小），再點一次回到全部 */
  function areaBanner(cur, all, range) {
    const officeChips = (list) =>
      list.length ? `<span class="apt-area-offices">${list.map((o) => `<i>${esc(o)}</i>`).join('')}</span>` : '<span class="apt-area-offices"><em class="apt-area-none">這個月沒有應繳的營業處</em></span>';
    const cols = all.map((a) => (!cur ? 'minmax(0, 1fr)' : a === cur ? 'minmax(0, 3fr)' : 'minmax(0, 0.9fr)')).join(' ');
    return `<div class="apt-leader-list apt-area-cards${cur ? ' has-pick' : ''}" style="grid-template-columns:${cols}">
        ${all
          .map((a) => {
            const on = a === cur;
            const dim = cur && !on;
            const offices = areaOffices(a, range);
            return `<button type="button" class="apt-leader-chip apt-area-card apt-leader-chip--${AREA_TONE[a.area] || 'none'}${on ? ' is-picked' : dim ? ' is-dim' : ''}" data-pick-area="${on ? '' : esc(a.manager)}" aria-pressed="${on}" aria-label="${on ? '回到全部區主管' : `只看${esc(a.manager)}（${esc(a.area)}）`}">
              <span class="apt-area-top">
                <span class="apt-area-avatar" aria-hidden="true">${esc(a.manager.slice(0, 1))}</span>
                <span class="apt-area-id"><b>${esc(a.manager)}</b>${areaPills([a.area])}</span>
                <span class="apt-area-stat"><strong>${offices.length}</strong><small>代管營業處</small></span>
              </span>
              ${dim ? '' : officeChips(offices)}
              ${dim
                ? ''
                : `<span class="apt-area-foot">
                    <span class="apt-area-regions" title="KPI 地區：${a.regions.map(esc).join('・')}">📍 ${a.regions.map(esc).join('・') || '—'}</span>
                    ${on ? '<span class="apt-area-back">✕ 看全部</span>' : ''}
                  </span>`}
            </button>`;
          })
          .join('')}
      </div>`;
  }

  function renderArea() {
    const sb = state.sb || {};
    const all = Core.areaScopes(sb.staff || []);
    const cur = currentArea(all);
    const { range, week, rep, prevErr } = weeklyData({ names: areaStaffNames() });
    const offices = Core.officeReport(rep.rows);
    if (state.areaOffice && !offices.some((o) => o.office === state.areaOffice)) state.areaOffice = '';
    const scope = cur ? areaScope(cur) : null;
    const zone = blockZone;
    const s = rep.summary;
    const staffRows = state.areaOffice ? rep.rows.filter((r) => Core.officeName(r.office) === state.areaOffice) : rep.rows;
    const staffTitle = state.areaOffice || (cur ? `${cur.area}（${cur.manager}）` : '全部營業處');
    return `<div class="apt-sub-bar">
        <span class="apt-sub-note">${cur ? `<b>${esc(cur.manager)}（${esc(cur.area)}）</b> · ` : ''}本週總點數 <b>${s.weekPoints}</b> · 本週登錄人數 <b>${s.active}</b> · 營業處 <b>${offices.length}</b> 處 · 本週審件良率 ${rateChip(s.rate) || '<b>-</b>'} · 本週客訴件數 <b>${s.complaints}</b></span>
      </div>
      ${zone('leader', `<h4 class="apt-sec-title">各區主管負責營業處<small>${cur ? '再點一次選中的卡片回到全部區主管' : '點卡片只看該區'}</small></h4>
        ${areaBanner(cur, all, range)}`)}
      ${zone('quality', leaderGauges(range, scope))}
      ${state.leaseFolded
        ? leaseFoldedStrip(range, scope)
        : scope
          ? leasePair(range, scope)
          : `<div class="apt-block-pair apt-block-pair--due-wide">${zone('lease', leaseSection(range, null))}${zone('due', leaseDueSection(range, null, areaDueGroups()))}</div>`}
      ${zone('charts', leaderKpiSection(range, week, scope))}
      <section class="apt-block apt-block--points">
      <h4 class="apt-sec-title">${esc(staffTitle)}｜行政點數<small>本週點數、月累積與預估獎金</small></h4>
      ${offices.length > 1 ? `<div class="apt-office-filter" role="group" aria-label="只看某一處的行政">
        <button type="button" class="apt-office-pill${state.areaOffice ? '' : ' is-on'}" data-pick-office="" aria-pressed="${!state.areaOffice}">全部營業處</button>
        ${offices.map((o) => `<button type="button" class="apt-office-pill${o.office === state.areaOffice ? ' is-on' : ''}" data-pick-office="${esc(o.office)}" aria-pressed="${o.office === state.areaOffice}">${esc(o.office)}<small>${o.members} 人</small></button>`).join('')}
      </div>` : ''}
      ${staffTable('areaStaff', staffCols(prevErr), staffRows)}
      <p class="apt-sub-note">${WEEKLY_NOTE()}${prevErr ? `<br><span class="apt-bad">上月點數讀取失敗：${esc(prevErr)}</span>` : ''}</p>
      </section>
      ${guideBoardSection(cur ? `${cur.area}（${cur.manager}）` : '全部營業處')}`;
  }

  /** 審件良率色塊：門檻同主管簡報（90% 以上綠、60% 以上黃、其餘紅） */
  function rateChip(rate) {
    if (rate == null) return '';
    const tone = rate >= 0.9 ? 'g' : rate >= 0.6 ? 'y' : 'r';
    return `<span class="apt-rate apt-rate--${tone}">${(rate * 100).toFixed(1)}%</span>`;
  }

  /* ---------- 組長週報：負責地區的承接率與清冊／審件作業良率（同「各地區KPI指標」） ---------- */

  /** 清冊／審件良率依公會期數，採上個月（同主管簡報月報） */
  function prevGuild(range) {
    const year = range.month === 1 ? range.year - 1 : range.year;
    const month = range.month === 1 ? 12 : range.month - 1;
    return { year: year - 1911, month, guild: `${year - 1911}/${String(month).padStart(2, '0')}` };
  }

  async function fetchKpiPart(m, part, refresh) {
    let res;
    try {
      const q = `year=${m.year}&month=${m.month}&part=${part}${refresh ? '&refresh=1' : ''}`;
      res = await fetch(`${RPA_BASE}/admin-points/kpi?${q}`, {
        headers: { 'X-Skyfun-Session': token() }
      });
    } catch {
      throw new Error('連不到星鴻資料服務（Worker）');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `表單04／09、媒合管理讀取失敗（HTTP ${res.status}）`);
    return data;
  }

  const ROSTER_SNAP_LS = 'apt-roster-snap-v1';
  const ROSTER_SNAP_LITE_LS = 'apt-roster-snap-lite-v1';

  function readRosterSnapLocal(period) {
    try {
      const raw = JSON.parse(localStorage.getItem(`${ROSTER_SNAP_LS}:${period}`) || 'null');
      if (!raw?.builtAt || !raw?.ok) return null;
      return raw;
    } catch {
      return null;
    }
  }

  function writeRosterSnapLocal(period, snap) {
    try {
      localStorage.setItem(`${ROSTER_SNAP_LS}:${period}`, JSON.stringify(snap));
    } catch {
      /* quota */
    }
  }

  function readRosterSnapLiteLocal(period) {
    try {
      const raw = JSON.parse(localStorage.getItem(`${ROSTER_SNAP_LITE_LS}:${period}`) || 'null');
      if (!raw?.builtAt || !raw?.ok || !raw?.totals) return null;
      return raw;
    } catch {
      return null;
    }
  }

  function writeRosterSnapLiteLocal(period, snap) {
    try {
      const lite = {
        ok: true,
        period: snap.period || period,
        year: snap.year,
        month: snap.month,
        builtAt: snap.builtAt,
        casesUpdatedAt: snap.casesUpdatedAt || '',
        partial: snap.partial || undefined,
        source: snap.source || null,
        totals: snap.totals || null,
        unresolved: snap.unresolved || null,
        cases: snap.cases
          ? {
              total: snap.cases.total || 0,
              contracts: snap.cases.contracts || 0,
              sameAddress: snap.cases.sameAddress || 0,
              rows: snap.cases.rows || [],
              fetchedAt: snap.cases.fetchedAt || ''
            }
          : null,
        lite: true
      };
      localStorage.setItem(`${ROSTER_SNAP_LITE_LS}:${period}`, JSON.stringify(lite));
    } catch {
      /* quota */
    }
  }

  async function fetchRosterSnapshot(g, { lite } = {}) {
    const period = g.guild || `${g.year}/${String(g.month).padStart(2, '0')}`;
    if (!lite && state.rosterSnap.has(period)) {
      const hit = state.rosterSnap.get(period);
      if (hit?.ok && hit.rows) return hit;
    }
    if (lite) {
      const liteLocal = readRosterSnapLiteLocal(period);
      if (liteLocal) return { ...liteLocal, cached: true, fromLocal: true };
      const fullLocal = readRosterSnapLocal(period);
      if (fullLocal?.ok && fullLocal.totals) {
        writeRosterSnapLiteLocal(period, fullLocal);
        return { ...fullLocal, rows: undefined, lite: true, cached: true, fromLocal: true };
      }
    } else {
      const local = readRosterSnapLocal(period);
      /* 補齊中的快照不要死抓本機舊檔，否則畫面會停在第一次寫入 */
      if (local?.ok && Array.isArray(local.rows) && !local.enriching && !local.partial) {
        state.rosterSnap.set(period, local);
        return { ...local, cached: true, fromLocal: true };
      }
    }
    let res;
    try {
      const q = `year=${g.year}&month=${g.month}${lite ? '&lite=1' : ''}`;
      res = await fetch(`${RPA_BASE}/admin-points/roster-snapshot?${q}`, {
        headers: { 'X-Skyfun-Session': token() },
        signal: AbortSignal.timeout(20000)
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error('清冊月結逾時，請稍後按重新抓取');
      throw new Error('連不到星鴻資料服務（Worker）');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `清冊快照讀取失敗（HTTP ${res.status}）`);
    if (data.ok && (data.rows || data.totals) && !data.missing && !data.building) {
      if (Array.isArray(data.rows)) {
        state.rosterSnap.set(period, data);
        writeRosterSnapLocal(period, data);
      }
      if (data.totals) writeRosterSnapLiteLocal(period, data);
    }
    return data;
  }

  async function rebuildRosterSnapshot(g) {
    let res;
    try {
      res = await fetch(`${RPA_BASE}/admin-points/roster-snapshot/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Skyfun-Session': token() },
        body: JSON.stringify({ year: g.year, month: g.month })
      });
    } catch {
      throw new Error('連不到星鴻資料服務（Worker）');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `清冊快照重建失敗（HTTP ${res.status}）`);
    return data;
  }

  /** 開著報表時連打 step，把複審人補齊速度拉快（不必等 cron） */
  async function burstRosterSnapshotEnrich(g) {
    const period = g.guild || `${g.year}/${String(g.month).padStart(2, '0')}`;
    if (!state.rosterBurst) state.rosterBurst = new Set();
    if (state.rosterBurst.has(period)) return;
    state.rosterBurst.add(period);
    const refreshUi = () => {
      state.rosterSnap.delete(period);
      try {
        localStorage.removeItem(`${ROSTER_SNAP_LS}:${period}`);
        localStorage.removeItem(`${ROSTER_SNAP_LITE_LS}:${period}`);
      } catch {
        /* ignore */
      }
      state.rosterOff.delete(period);
      loadRosterOffices(period, false);
      const range = state.range;
      if (range) {
        const prev = prevGuild(range);
        if (prev.guild === period) {
          state.lkpi = null;
          loadLeaderKpi(range).catch(() => {});
        }
      }
    };
    try {
      for (let i = 0; i < 150; i++) {
        let res;
        try {
          res = await fetch(`${RPA_BASE}/admin-points/roster-snapshot/step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Skyfun-Session': token() },
            body: JSON.stringify({ year: g.year, month: g.month, continue: true })
          });
        } catch {
          break;
        }
        const r = await res.json().catch(() => null);
        if (!res.ok || !r?.ok) break;
        if (r.done || r.skipped) break;
        if (r.phase && r.phase !== 'reviewers' && r.phase !== 'finalize') break;
        if (i % 4 === 3) refreshUi();
        await new Promise((ok) => setTimeout(ok, 900));
      }
    } finally {
      state.rosterBurst.delete(period);
      refreshUi();
    }
  }

  async function loadQualityViaSnapshot(g) {
    const [snap, op] = await Promise.all([
      fetchRosterSnapshot(g, { lite: true }),
      window.skyfunAuth.rpc('admin_points_kpi_opinions_view', { p_token: token(), p_guild_period: g.guild })
    ]);
    if (!op?.ok) throw new Error(op?.error || '公會意見讀取失敗');
    /* 不走即時清冊：有合計就能算良率；複審人可背景補 */
    if (snap?.missing || (snap?.building && !snap?.totals)) {
      const status = snap.building
        ? `清冊月結建立中（${snap.phase || ''} ${snap.progress?.done || 0}/${snap.progress?.total || '?'}）`
        : '清冊月結尚未建立（背景每 5 分鐘推進）';
      const q = Core.kpiQualityFromSnapshot({ ok: true, totals: { all: { total: 0 }, region: {} }, cases: null }, op.opinions, null);
      q.snapStatus = status;
      q.snapPending = true;
      return q;
    }
    if (!snap?.totals && !snap?.rows) throw new Error('清冊快照格式錯誤');
    const q = Core.kpiQualityFromSnapshot(snap, op.opinions, null);
    if (snap.enriching || (snap.partial && snap.unresolved?.noRev)) {
      const n = snap.unresolved?.noRev || 0;
      const p = snap.progress ? `${snap.progress.done || 0}/${snap.progress.total || '?'}` : '';
      q.snapStatus = n
        ? `總件數已就緒；複審人加速補齊中${p ? `（${p}）` : ''}，剩 ${n} 件（開著此頁會加快）`
        : '總件數已就緒（營業處歸戶補齊中）';
      burstRosterSnapshotEnrich(g);
    } else if (snap.partial) {
      q.snapStatus = '快照部分完成';
    } else {
      q.snapStatus = snap.fromLocal ? '本機快取（月結）' : '';
    }
    return q;
  }

  async function loadLeaderKpi(range) {
    const key = `${range.year}-${range.month}`;
    const g = prevGuild(range);
    const lk = { key, busy: true, guild: g.guild, takeup: null, tenant: null, quality: null };
    state.lkpi = lk;
    const paint = () => {
      if (state.lkpi === lk && (isWeeklyTab() || state.tab === 'person')) render();
    };
    /* 良率不要等房客縣市；房客縣市要重抓整月審核紀錄，會把兩張公會圓環一直停在讀取中 */
    const qualityPromise = (
      USE_ROSTER_SNAPSHOT
        ? loadQualityViaSnapshot(g)
        : Promise.all([
            fetchKpiPart(g, 'roster04'),
            fetchKpiPart(g, 'roster09'),
            fetchKpiPart(g, 'cases'),
            window.skyfunAuth.rpc('admin_points_kpi_opinions_view', { p_token: token(), p_guild_period: g.guild })
          ]).then(([r04, r09, cases, op]) => {
            if (!op?.ok) throw new Error(op?.error || '公會意見讀取失敗');
            return Core.kpiQuality(r04, r09, cases, op.opinions);
          })
    ).catch((e) => ({ error: String(e.message || e) }));
    const tcPromise = fetchWorker('/admin-points/tenant-cities', '房客地區', range).catch((e) => ({ rows: [], pending: 0, error: e.message }));
    const quality = await qualityPromise;
    if (state.lkpi !== lk) return;
    lk.quality = quality;
    lk.busy = false;
    paint();
    const tc = await tcPromise;
    if (state.lkpi !== lk) return;
    lk.tenant = { pending: Number(tc.pending) || 0, error: tc.error || '' };
    lk.takeup = Core.takeupReport(state.auditRows, {
      start: range.start,
      end: range.end,
      staff: state.sb?.staff || [],
      expenses: state.expenseRows || [],
      tenantCities: new Map((tc.rows || []).map(([id, city]) => [String(id), city])),
      regionOf: Core.kpiRegionOfCity
    });
    paint();
  }

  /** scope：選了組長＝該組管理縣市對到的 KPI 地區（加小計）；全部組長＝全區＋12 區 */
  function leaderKpiSection(range, week, scope) {
    const key = `${range.year}-${range.month}`;
    if (state.lkpi?.key !== key) loadLeaderKpi(range).catch((e) => console.warn('組長週報 KPI', e));
    const lk = state.lkpi;
    const regions = scope ? scopeRegions(scope) : ['全區', ...Core.KPI_REGIONS];
    const title = `<h4 class="apt-sec-title">${scope ? esc(scopeLabel(scope)) : '各地區'}｜第一階段達成率・行政承接率・清冊／審件作業良率</h4>`;
    if (!regions.length) return `${title}<p class="apt-empty">這位組長的組員在人力明細沒有部別，對不到地區</p>`;
    const cols = scope && regions.length > 1 ? [...regions, '小計'] : regions;
    const partsOf = (g) => (g === '小計' ? regions : [g]);
    const short = (d) => d.slice(5).replace('-', '/');

    const stageEnd = week.end < range.end ? week.end : range.end;
    const areaNames = state.tab === 'area' ? areaStaffNames() : null;
    const stageStaff = (state.sb?.staff || []).filter((s) => !areaNames || areaNames.has(s.name));
    const stage = state.result ? Core.kpiStageReport(state.result, { staff: stageStaff, weeks: [{ start: range.start, end: stageEnd }] }) : null;
    const stageX = (g) => {
      if (!stage) return null;
      let hit = 0;
      let total = 0;
      for (const r of partsOf(g)) {
        const x = stage.get(r, 0);
        if (x) {
          hit += x.hit;
          total += x.total;
        }
      }
      return { rate: total ? hit / total : null, text: `達標${hit}／${total}人` };
    };

    const takeupX = (g, col) => {
      if (!lk?.takeup || col < 0) return null;
      let local = 0;
      let total = 0;
      for (const r of partsOf(g)) {
        const x = lk.takeup.get(r, 'total', col);
        if (x) {
          local += x.local;
          total += x.total;
        }
      }
      return { rate: total ? local / total : null, text: `行${local}／總${total}` };
    };
    const qualityX = (kind, g) => {
      const q = lk?.quality;
      if (!q || q.error) return null;
      const x = partsOf(g).reduce((s, r) => ({ total: s.total + (q[kind][r]?.total || 0), err: s.err + (q[kind][r]?.err || 0) }), { total: 0, err: 0 });
      return { rate: Core.kpiErrRate(x), text: `錯${x.err}／總${x.total}` };
    };
    const rows = [
      { label: '第一階段以上達成率', sub: `業績月累計到 ${short(stageEnd)}`, target: 0.8, get: stageX, empty: '無正職行政' },
      { label: '行政承接率', sub: '本業績月累計', target: 0.8, get: (g) => takeupX(g, 'all'), loading: !lk?.takeup },
      { label: '清冊作業良率', sub: `公會期數 ${lk?.guild || prevGuild(range).guild}`, target: 0.9, get: (g) => qualityX('roster', g), loading: !lk?.quality },
      { label: '審件作業良率', sub: `公會期數 ${lk?.guild || prevGuild(range).guild}`, target: 0.9, get: (g) => qualityX('audit', g), loading: !lk?.quality }
    ];
    const cell = (row, g) => {
      if (row.loading) return '<td class="apt-kpi-cell apt-kpi--none">讀取中…</td>';
      const x = row.get(g);
      if (!x || x.rate == null) return `<td class="apt-kpi-cell apt-kpi--none">—<small>${row.label.includes('良率') && lk?.quality?.error ? '讀取失敗' : row.empty || '無件數'}</small></td>`;
      const tone = x.rate >= row.target ? 'g' : x.rate >= row.target - 0.1 ? 'y' : 'r';
      return `<td class="apt-kpi-cell apt-kpi--${tone}${g === '小計' ? ' apt-kpi-sum' : ''}"><b>${(x.rate * 100).toFixed(1)}%</b><small>${x.text}</small></td>`;
    };
    const notes = [];
    if (lk?.quality?.error) notes.push(`清冊／審件良率讀取失敗：${lk.quality.error}`);
    if (lk?.quality?.snapPending) notes.push(lk.quality.snapStatus || '清冊月結建立中');
    else if (lk?.quality?.snapStatus) notes.push(lk.quality.snapStatus);
    if (lk?.tenant?.error) notes.push(`房客地區暫時查不到（${lk.tenant.error}），房審只算在全區`);
    else if (lk?.tenant?.pending) notes.push(`還有 ${lk.tenant.pending} 位房客的地區在查詢中，稍後按「重新整理」會補上`);
    return `${title}
      <div class="apt-table-wrap"><table class="apt-table apt-kpi-table">
        <thead><tr><th>指標</th><th class="num">目標</th>${cols.map((g) => `<th class="apt-kpi-head">${esc(g)}</th>`).join('')}</tr></thead>
        <tbody>${rows
          .map((row) => `<tr><th class="apt-kpi-label">${row.label}<small>${esc(row.sub)}</small></th><td class="num">${Math.round(row.target * 100)}%</td>${cols.map((g) => cell(row, g)).join('')}</tr>`)
          .join('')}</tbody>
      </table></div>
      <p class="apt-sub-note">和後台「各地區KPI指標」同一套算法，${areaNames ? '地區依區主管負責的北區／中區／南區／高雄列出' : '地區依組長負責的北／中／南區列出'}。第一階段以上達成率＝在職正職行政中，業績月第一天累計到本週日（或業績月最後一天）點數達 ${Core.STAGE_1} 點的人數 ÷ 人數（依人力明細部別分區${areaNames ? '，只算營業處的行政，不含租賃管理部' : ''}）。承接率＝行政審核件數 ÷ 總件數（案件依物件／合約縣市、房審依房客縣市分區）。清冊／審件作業良率＝（總件數 − 公會意見錯誤件數）÷ 總件數，依公會期數按月計算，採上個月（同主管簡報月報）。顏色：達目標綠、差 10% 以內黃、其餘紅。${notes.length ? `<br><span class="apt-bad">${esc(notes.join('；'))}</span>` : ''}</p>`;
  }

  /* ---------- 品質儀表板：內部審件良率（本業績月抽查）、公會審件／清冊良率（公會意見，採上個月公會期數） ---------- */

  function internalQuality(names) {
    const only = names ? new Set(names) : null;
    let checked = 0;
    let correct = 0;
    for (const c of state.sb?.checks || []) {
      if (only && !only.has(c.name)) continue;
      checked += Number(c.checked) || 0;
      correct += Number(c.correct) || 0;
    }
    return { rate: checked ? correct / checked : null, checked, correct };
  }

  function guildQuality(lk, kind, regions) {
    const q = lk?.quality;
    if (!q || q.error) return null;
    const x = regions.reduce((s, r) => ({ total: s.total + (q[kind][r]?.total || 0), err: s.err + (q[kind][r]?.err || 0) }), { total: 0, err: 0 });
    return { rate: Core.kpiErrRate(x), ...x };
  }

  /** 90% 以上綠、80% 以上黃、其餘紅 */
  const gaugeColor = (rate) => (rate == null ? C_ALL : rate >= 0.9 ? '#16a34a' : rate >= 0.8 ? '#f59e0b' : '#dc2626');

  /** o：{ names：內部良率的人員（null＝全部）, regions：公會良率的 KPI 地區, regionText, noCityBoard：每月趨勢不列各縣市／各營業處良率 } */
  function qualityGauges(range, o) {
    const CH = window.AdminPointsCharts;
    if (state.lkpi?.key !== `${range.year}-${range.month}`) loadLeaderKpi(range).catch((e) => console.warn('品質儀表板', e));
    const lk = state.lkpi;
    const guild = lk?.guild || prevGuild(range).guild;
    const pct = (rate) => (rate >= 1 ? '100%' : `${(rate * 100).toFixed(1)}%`);
    const card = (label, rate, meta, note, kind) => {
      const on = kind && state.guildOpen?.kind === kind;
      const attrs = kind ? ` data-guild-kind="${kind}" role="button" tabindex="0" aria-expanded="${on ? 'true' : 'false'}" title="點一下看每月良率（本期 vs 同期）與缺失類別"` : '';
      return `<div class="apt-gauge${kind ? ' apt-gauge--pick' : ''}${on ? ' is-on' : ''}"${attrs}>
        <span class="apt-gauge-ring">${CH.donut({ value: rate == null ? null : rate * 100, text: rate == null ? '-' : pct(rate), sub: '目標 90%', color: gaugeColor(rate), marks: [90] })}</span>
        <span class="apt-gauge-text">
          <span class="apt-gauge-label">${label}</span>
          <span class="apt-gauge-meta">${meta}</span>
          <small>${note}</small>
          ${kind ? `<em class="apt-gauge-more">${on ? '▲ 收起每月趨勢' : '📈 點看每月趨勢・缺失類別'}</em>` : ''}
        </span>
      </div>`;
    };
    const inQ = internalQuality(o.names);
    const guildCard = (label, kind) => {
      const note = `公會期數 ${esc(guild)}${o.regionText ? ` · ${esc(o.regionText)}` : ''}`;
      if (!o.regions.length) return card(label, null, '人力明細沒有部別，對不到地區', note, kind);
      if (!lk?.quality) return card(label, null, '讀取中…', note, kind);
      if (lk.quality.error) return card(label, null, `<span class="apt-bad">讀取失敗：${esc(lk.quality.error)}</span>`, note, kind);
      if (lk.quality.snapPending) return card(label, null, esc(lk.quality.snapStatus || '清冊月結建立中'), note, kind);
      const x = guildQuality(lk, kind, o.regions);
      return card(label, x.rate, x.total ? `錯 <b>${x.err}</b> 件／總 <b>${x.total}</b> 件` : '這期沒有件數', note, kind);
    };
    return `<div class="apt-gauges">
        ${card('內部審件良率', inQ.rate, inQ.checked ? `抽查 <b>${inQ.checked}</b> 件・正確 <b>${inQ.correct}</b> 件` : '本業績月還沒有抽查', '本業績月・組長抽查')}
        ${guildCard('公會審件良率', 'audit')}
        ${guildCard('公會清冊良率', 'roster')}
      </div>
      ${guildDetail(range, o)}`;
  }

  /* ---------- 公會審件／清冊良率：年度每月（本期 vs 同期）＋缺失類別 ---------- */

  /** 公會意見從這一期開始有逐筆資料；更早的月份只能用後台匯入的公會月報 */
  const GUILD_SYS_START = '115/09';
  const GUILD_KIND = {
    audit: { label: '公會審件良率', op: 'case', short: '審件', errText: '退件', goal: 0.9 },
    roster: { label: '公會清冊良率', op: 'roster', short: '清冊', errText: '下意見', goal: 0.95 }
  };
  const guildPeriodOf = (year, month) => `${year}/${String(month).padStart(2, '0')}`;

  /** 系統算某公會期數的件數與意見（同組長週報），快取在 state.guildSys */
  function guildSysPeriod(period) {
    const hit = state.guildSys.get(period);
    if (hit) return hit.promise;
    const [year, month] = period.split('/').map(Number);
    const g = { year, month, guild: period };
    const entry = { data: null, promise: null };
    entry.promise = (USE_ROSTER_SNAPSHOT
      ? loadQualityViaSnapshot(g)
      : Promise.all([
          fetchKpiPart(g, 'roster04'),
          fetchKpiPart(g, 'roster09'),
          fetchKpiPart(g, 'cases'),
          window.skyfunAuth.rpc('admin_points_kpi_opinions_view', { p_token: token(), p_guild_period: period })
        ]).then(([r04, r09, cases, op]) => {
          if (!op?.ok) throw new Error(op?.error || '公會意見讀取失敗');
          return Core.kpiQuality(r04, r09, cases, op.opinions);
        })
    )
      .catch((e) => ({ error: String(e.message || e) }))
      .then((d) => {
        entry.data = d;
        if (d.error) state.guildSys.delete(period);
        return d;
      });
    state.guildSys.set(period, entry);
    return entry.promise;
  }

  async function loadGuildYear(range) {
    const cur = prevGuild(range);
    const gy = { key: cur.guild, cur, busy: true, rows: [], error: '', sysErr: '' };
    state.guildYear = gy;
    const lk = state.lkpi;
    if (lk?.guild === cur.guild && lk.quality && !lk.quality.error && !state.guildSys.has(cur.guild)) {
      state.guildSys.set(cur.guild, { data: lk.quality, promise: Promise.resolve(lk.quality) });
    }
    const periods = [];
    for (const y of [cur.year - 1, cur.year]) {
      for (let m = 1; m <= 12; m++) {
        const p = guildPeriodOf(y, m);
        if (p >= GUILD_SYS_START && p <= cur.guild) periods.push(p);
      }
    }
    const [res, ...sys] = await Promise.all([
      window.skyfunAuth
        .rpc('admin_points_guild_monthly_view', { p_token: token(), p_from: guildPeriodOf(cur.year - 1, 1), p_to: guildPeriodOf(cur.year, 12) })
        .catch((e) => ({ ok: false, error: String(e.message || e) })),
      ...periods.map(guildSysPeriod)
    ]);
    if (state.guildYear !== gy) return;
    gy.busy = false;
    if (res?.ok) gy.rows = res.rows || [];
    else gy.error = res?.error || '公會月報讀取失敗';
    gy.sysErr = sys.find((d) => d?.error)?.error || '';
    if (state.guildOpen && (isWeeklyTab() || state.tab === 'person')) render();
  }

  /** 某月件數：後台匯入的月報（範圍內每個地區都有填）為準，否則用系統算的 */
  function guildMonthValue(gy, kind, period, regions) {
    const tKey = kind === 'audit' ? 'auditTotal' : 'rosterTotal';
    const eKey = kind === 'audit' ? 'auditErr' : 'rosterErr';
    const rows = regions.map((r) => gy.rows.find((x) => x.period === period && x.region === r && x[tKey] != null && x[eKey] != null));
    if (rows.length && rows.every(Boolean)) {
      const x = rows.reduce((s, r) => ({ total: s.total + r[tKey], err: s.err + r[eKey] }), { total: 0, err: 0 });
      return x.total ? { ...x, rate: Core.kpiErrRate(x), src: 'import' } : null;
    }
    const q = state.guildSys.get(period)?.data;
    if (!q || q.error) return null;
    const x = regions.reduce((s, r) => ({ total: s.total + (q[kind][r]?.total || 0), err: s.err + (q[kind][r]?.err || 0) }), { total: 0, err: 0 });
    return x.total ? { ...x, rate: Core.kpiErrRate(x), src: 'system' } : null;
  }

  /** 缺失類別件數（只有系統逐筆意見才有類別） */
  function guildCats(kind, periods, regions) {
    const opKind = GUILD_KIND[kind].op;
    const everywhere = regions.includes('全區');
    const want = new Set(regions);
    const counts = new Map(Core.OPINION_CATEGORIES[opKind].map((c) => [c, 0]));
    let total = 0;
    let months = 0;
    for (const p of periods) {
      const q = state.guildSys.get(p)?.data;
      if (!q || q.error) continue;
      months += 1;
      for (const o of q.errors || []) {
        if (o.kind !== opKind || (!everywhere && !want.has(o.area))) continue;
        const c = o.category || '未分類';
        counts.set(c, (counts.get(c) || 0) + 1);
        total += 1;
      }
    }
    return { counts, total, months };
  }

  /** 缺失類別配色：依件數多寡排序後套用，最多的用最深的顏色 */
  const GCAT_COLORS = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f59e0b', '#f43f5e', '#a855f7', '#22c55e', '#f97316', '#ec4899', '#64748b', '#94a3b8', '#cbd5e1'];

  /** opt.compact：並排的窄欄版（清單單欄、預設只列前幾項）；opt.all：展開全部 */
  function guildCatsHtml(kind, cats, opt = {}) {
    if (!cats.total) return '<p class="apt-gpie-none">這段期間沒有缺失 🎉</p>';
    const CH = window.AdminPointsCharts;
    const parts = [...cats.counts.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: GCAT_COLORS[i % GCAT_COLORS.length] }));
    const zero = [...cats.counts.entries()].filter(([c, n]) => !n && c !== '未分類').map(([c]) => c);
    const pct = (n) => `${((n / cats.total) * 100).toFixed(1)}%`;
    const top = parts[0];
    const top3 = parts.slice(0, 3).reduce((s, p) => s + p.value, 0);
    const LIMIT = 5;
    const shown = opt.compact && !opt.all ? parts.slice(0, LIMIT) : parts;
    const hidden = parts.length - shown.length;
    const more = opt.compact && (hidden > 0 || (opt.all && parts.length > LIMIT) || (zero.length && !opt.all))
      ? `<button type="button" class="apt-gpie-more" data-guild-cats-all aria-expanded="${!!opt.all}">${opt.all ? '收合 ▴' : hidden > 0 ? `展開其餘 ${hidden} 項${zero.length ? `＋沒出現的 ${zero.length} 項` : ''} ▾` : `看沒出現的 ${zero.length} 項 ▾`}</button>`
      : '';
    return `<div class="apt-gpie apt-gpie--${kind}${opt.compact ? ' apt-gpie--compact' : ''}">
        <div class="apt-gpie-chart">${CH.pie({ parts, center: cats.total, sub: '件缺失' })}</div>
        <div class="apt-gpie-side">
          <div class="apt-gpie-hl">
            <p><span>最多的缺失</span><b style="color:${top.color}">${esc(top.label)}</b><em>${top.value} 件・占 ${pct(top.value)}</em></p>
            ${parts.length > 3 ? `<p><span>前 3 大合計</span><b>${pct(top3)}</b><em>先改善這三項最有感</em></p>` : ''}
          </div>
        </div>
        <div class="apt-gpie-body">
          <ul class="apt-gpie-list" style="--rows:${Math.ceil(shown.length / 2)}">${shown
            .map(
              (p, i) => `<li${i < 3 ? ' class="is-top"' : ''}>
                <i style="background:${p.color}"></i><span title="${esc(p.label)}">${esc(p.label)}</span>
                <b>${p.value}</b><em>${pct(p.value)}</em>
                <s><u style="width:${(p.value / top.value) * 100}%;background:${p.color}"></u></s>
              </li>`
            )
            .join('')}</ul>
          ${zero.length && (!opt.compact || opt.all) ? `<p class="apt-gpie-zero">✓ 沒出現：${zero.map(esc).join('、')}</p>` : ''}
          ${more}
        </div>
      </div>`;
  }

  /** 趨勢圖與下方數字表共用的版面（viewBox 寬 1000），月份欄上下對齊 */
  const GUILD_GEO = { width: 1000, padL: 112, padR: 196 };
  /** 折線圖與缺失類別並排時的窄版（累計摘要改放卡片上方） */
  const GUILD_GEO_DUO = { width: 680, padL: 84, padR: 14 };

  /** 各縣市良率排行（選取的月份或今年累計）：組合計置頂，其餘依良率高到低；點一列切換下方趨勢圖 */
  function guildCityBoard(gy, kind, k, cur, sel, regions, groupName, city, sum) {
    const isYear = sel === 'year';
    const upTo = Array.from({ length: cur.month }, (_, i) => i + 1);
    const selYear = isYear ? cur.year : Number(sel.slice(0, 3));
    const selMonth = isYear ? 0 : Number(sel.slice(4));
    const valOf = (list, year) =>
      isYear ? sum(upTo.map((m) => guildMonthValue(gy, kind, guildPeriodOf(year, m), list))) : guildMonthValue(gy, kind, guildPeriodOf(year, selMonth), list);
    const LO = 50;
    const pos = (rate) => Math.max(0, Math.min(100, ((rate * 100 - LO) / (100 - LO)) * 100));
    const rowOf = (key, label, list) => {
      const v = valOf(list, selYear);
      const p = valOf(list, selYear - 1);
      return { key, label, v, p, d: v && p ? (v.rate - p.rate) * 100 : null };
    };
    const total = rowOf('', groupName, regions);
    const cities = regions.map((r) => rowOf(r, r, [r])).sort((a, b) => (b.v ? b.v.rate : -9) - (a.v ? a.v.rate : -9));
    const hit = cities.filter((r) => r.v && r.v.rate >= k.goal).length;
    const row = (r, rank) => {
      const on = r.key === city;
      const tone = !r.v ? 'na' : r.v.rate >= k.goal ? 'g' : r.v.rate >= k.goal - 0.1 ? 'y' : 'r';
      const diff = r.d == null ? '' : Math.abs(r.d) < 0.05 ? '<span class="apt-gcity-diff">持平</span>' : `<span class="apt-gcity-diff ${r.d > 0 ? 'is-up' : 'is-down'}">${r.d > 0 ? '▲' : '▼'}${Math.abs(r.d).toFixed(1)}</span>`;
      return `<button type="button" class="apt-gcity${r.key ? '' : ' is-total'}${on ? ' is-on' : ''}" data-guild-city="${esc(r.key)}" aria-pressed="${on}" title="${r.key ? `看${esc(r.label)}的每月趨勢` : `看${esc(groupName)}的每月趨勢`}">
          <span class="apt-gcity-rank">${r.key ? rank : '合'}</span>
          <span class="apt-gcity-name">${esc(r.label)}<small>${r.v ? `${k.errText} ${r.v.err}／${r.v.total} 件` : '沒有件數'}</small></span>
          <span class="apt-gcity-track">
            ${r.v ? `<i class="apt-gcity-fill apt-gcity-fill--${tone}" style="width:${Math.max(2, pos(r.v.rate)).toFixed(1)}%"></i>` : ''}
            <em class="apt-gcity-goal" style="left:${pos(k.goal).toFixed(1)}%"></em>
            ${r.p ? `<b class="apt-gcity-prev" style="left:${pos(r.p.rate).toFixed(1)}%" title="同期 ${(r.p.rate * 100).toFixed(1)}%"></b>` : ''}
          </span>
          <span class="apt-gcity-rate">${r.v ? `<span class="apt-gchip apt-gchip--${tone}">${(r.v.rate * 100).toFixed(1)}%</span>` : '<span class="apt-gt-na">-</span>'}</span>
          <span class="apt-gcity-vs">${r.p ? `<small>同期 ${(r.p.rate * 100).toFixed(1)}%</small>${diff}` : '<small>同期 -</small>'}</span>
        </button>`;
    };
    return `<div class="apt-gcities">
        <div class="apt-guild-cats-head">
          <h5>🏙️ 各縣市${k.short}良率<small>${isYear ? `1～${cur.month} 月累計` : `${selMonth} 月（公會期數 ${esc(sel)}）`} · 達標 ${hit}／${cities.length} 個縣市 · 點縣市看它的每月趨勢</small></h5>
          <span class="apt-guild-cats-tabs">
            <button type="button" class="${isYear ? '' : 'is-on'}" data-guild-month="${isYear ? cur.guild : esc(sel)}">單月</button>
            <button type="button" class="${isYear ? 'is-on' : ''}" data-guild-month="year">今年累計</button>
          </span>
        </div>
        <div class="apt-gcity-scale"><span></span><span class="apt-gcity-ticks">${[50, 60, 70, 80, 90, 100].map((t) => `<i style="left:${pos(t / 100)}%">${t}%</i>`).join('')}</span><span class="apt-gcity-keys"><em></em>目標 ${Math.round(k.goal * 100)}%　<b></b>同期</span><span></span></div>
        ${regions.length > 1 ? row(total, 0) : ''}
        ${cities.map((r, i) => row(r, i + 1)).join('')}
        ${kind === 'audit' ? guildOfficePanel(sel, city ? [city] : regions, city || groupName.replace(/合計$/, '')) : ''}
      </div>`;
  }

  /* ---------- 公會審件良率：各營業處（案件依複審人在人力明細的營業處；退件依媒合編號對回案件） ---------- */
  /* 媒合編號儲存不帶縣市（星鴻F2M…）；縣市看 region 欄，比對用後段代碼 */

  const REV_STATUS = '複審中 → 複審通過';
  /** 審核紀錄查詢區間：起租月最後一天往前、往後各約 4 個月（往後不超過今天；複審可能在起租後才做），Worker 每次最多 62 天 */
  const REV_LOOKBACK = [[0, 61], [62, 123]];
  const REV_LOOKAHEAD = [[1, 62], [63, 124]];
  const STEP_LABEL = { '預審中 → 預審通過': '預審', '待產編 → 已生效': '產編', '已生效 → 已生效': '實價登錄' };
  const OFF_NO_REV = '查不到複審紀錄';
  const OFF_NOT_STAFF = '非行政或已離職行政';
  const OFF_LEADER = '小組長';
  /** 小組長複審的件數另外拉一列，不歸各營業處、也不算進非行政 */
  const ROSTER_LEADERS = new Set(['侯思廷', '黃怡婷', '李芷琳']);
  const OFF_NO_CASE = '退件對不到起租案件';
  /** 不在人力明細的複審人（主管等）所屬營業處，只用在審件良率分處，不影響點數與獎金 */
  const REVIEWER_OFFICE = {
    黃岳澤: '中一處',
    蕭湘芩: '彰一處',
    吳震: '中三處',
    童翊桓: '中五處',
    吳清蓮: '中四處',
    賴重丞: '中二處',
    蘇睿雅: '中六處',
    陳智凱: '中四處'
  };

  /** 媒合編號比對一律用後段代碼（星鴻F2M…、星鴻高雄F2M… 與只打 F2M… 都算同一件） */
  const caseNoKey = (s) => Core.opinionCaseCode(s) || String(s || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  /** 地址比對：全形轉半形、去空白、臺→台，去掉郵遞區號與縣市（審核紀錄與媒合管理的寫法可能差在縣市） */
  const addrKey = (s) =>
    String(s || '')
      .normalize('NFKC')
      .replace(/\s+/g, '')
      .replace(/臺/g, '台')
      .replace(/^\d+/, '')
      .replace(/^.{2}[市縣]/, '');

  function guildPeriodMonth(period) {
    const [ry, m] = period.split('/').map(Number);
    const y = ry + 1911;
    return { start: Core.isoDate(new Date(y, m - 1, 1)), end: Core.isoDate(new Date(y, m, 0)) };
  }

  /** 複審紀錄索引：合約 id、地址 → 最後一次複審通過的紀錄；查不到複審時，other 存最後一筆其他審核（預審、產編…）當參考 */
  function revIndex(rows) {
    const byId = new Map();
    const byAddr = new Map();
    const otherById = new Map();
    const otherByAddr = new Map();
    let first = '';
    const put = (map, k, r) => {
      if (!k) return;
      const cur = map.get(k);
      if (!cur || String(cur.time) < String(r.time)) map.set(k, r);
    };
    for (const r of rows) {
      if (r.time && (!first || String(r.time) < first)) first = String(r.time);
      if (r.type !== 'contract') continue;
      const rev = String(r.status || '').replace(/\s+/g, ' ').trim() === REV_STATUS;
      put(rev ? byId : otherById, String(r.targetId), r);
      put(rev ? byAddr : otherByAddr, addrKey(r.name), r);
    }
    return { byId, byAddr, otherById, otherByAddr, first: first.slice(0, 10) };
  }

  /** 該公會期數（起租月）的已生效合約＋往前約 4 個月的審核紀錄，快取在 state.guildOff */
  function loadGuildOffices(period) {
    if (state.guildOff.has(period)) return;
    const entry = { busy: true };
    state.guildOff.set(period, entry);
    const m = guildPeriodMonth(period);
    const back = (n) => Core.isoDate(new Date(new Date(`${m.end}T00:00:00`).getTime() - n * 86400000));
    const today = Core.isoDate(new Date());
    const windows = [
      ...REV_LOOKBACK.map(([a, b]) => ({ start: back(b), end: back(a) })),
      ...REV_LOOKAHEAD.map(([a, b]) => ({ start: back(-a), end: back(-b) < today ? back(-b) : today })).filter((w) => w.start <= w.end)
    ];
    Promise.all([fetchWorker('/admin-points/lease-starts', '起租案件', m), ...windows.map((w) => fetchWorker('/admin-points/audit-log', '審核時間紀錄', w))])
      .then(([lease, ...logs]) => {
        entry.cases = Core.rowsFromPayload(lease);
        entry.rev = revIndex(logs.flatMap((l) => Core.rowsFromPayload(l)));
        entry.from = windows[REV_LOOKBACK.length - 1].start;
        entry.to = windows[windows.length - 1].end;
        entry.detail = new Map();
      })
      .catch((e) => {
        entry.error = String(e.message || e);
      })
      .then(() => {
        entry.busy = false;
        if (!entry.error) loadGuildDetailReviewers(entry);
        guildRerender();
      });
  }

  /** 營業處／個人的公會良率資料分批讀到時，只在看得到的頁面重畫 */
  function guildRerender() {
    if (state.guildOpen || state.tab === 'person' || (state.tab === 'duration' && String(state.durView).startsWith('quality'))) render();
  }

  const LEASE_COMPANY = '公司';

  /** 案件在區主管範圍內的營業處：這一區的處照原名；業務支援管理部等不是「○○處」的歸「公司」；別區的處、沒填的回空字串 */
  function leaseOfficeKey(r, manager) {
    const name = Core.officeName(r.office);
    if (!name) return '';
    if (!/處$/.test(name)) return LEASE_COMPANY;
    return Core.officeArea(name)?.manager === manager ? name : '';
  }

  function leaseOfficeRank(o) {
    return o === LEASE_COMPANY ? 1e9 : Core.officeRank(o);
  }

  /** 區主管：只算這一區的處和公司的案件 */
  function areaOwnRows(rows, manager) {
    return rows.filter((r) => leaseOfficeKey(r, manager));
  }

  /** 應繳案件依合約的「代管營業處」（媒合管理）分組；只列這一區、有應繳的營業處 */
  function leaseOfficeGroups(rows, manager) {
    if (rows.length && !rows.some((r) => r.office)) return { error: '應繳案件還沒有代管營業處資料，請按「重新抓取星鴻資料」' };
    const own = areaOwnRows(rows, manager);
    const by = new Map();
    for (const row of own) {
      const key = leaseOfficeKey(row, manager);
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(row);
    }
    const groups = [...by].map(([key, list]) => ({ key, rows: list })).sort((a, b) => leaseOfficeRank(a.key) - leaseOfficeRank(b.key));
    return { groups, rows: own };
  }

  /** 同地址（包租／轉租）的合約歸成一件 */
  function caseGroups(cases) {
    const groups = new Map();
    for (const c of cases) {
      const a = String(c.address || '').normalize('NFKC').replace(/\s+/g, '').replace(/臺/g, '台');
      const k = a ? `${String(c.city || '').replace(/臺/g, '台')}|${a}` : `#${c.id}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    return [...groups.values()];
  }

  function revOfCase(entry, c) {
    const r = entry.rev.byId.get(String(c.id)) || entry.rev.byAddr.get(addrKey(c.address));
    if (r) return r;
    const d = entry.detail?.get(String(c.id));
    return d?.auditor ? d : null;
  }

  const CONTRACT_REV_CHUNK = 200;

  /** 審核時間紀錄查不到複審的案件，改到媒合管理合約明細補抓（分批；Worker 先回快取再查缺的） */
  async function loadGuildDetailReviewers(entry) {
    let ids = caseGroups(entry.cases)
      .filter((list) => !list.some((c) => revOfCase(entry, c)))
      .flatMap((list) => list.map((c) => String(c.id)));
    entry.detailTodo = ids.length;
    entry.detailBusy = ids.length > 0;
    entry.detailError = '';
    while (ids.length) {
      const chunk = ids.slice(0, CONTRACT_REV_CHUNK);
      let data;
      try {
        const res = await fetch(`${RPA_BASE}/admin-points/contract-reviewers?ids=${chunk.join(',')}`, {
          headers: { 'X-Skyfun-Session': token() }
        });
        data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `合約明細審核紀錄讀取失敗（HTTP ${res.status}）`);
      } catch (e) {
        entry.detailError = String(e.message || e);
        break;
      }
      const before = entry.detail.size;
      for (const [id, auditor, time] of data.rows || []) {
        entry.detail.set(String(id), { auditor, time: String(time || '').replace(/-/g, '/'), fromDetail: true });
      }
      const pending = new Set((data.pending || []).map(String));
      const rest = [...ids.slice(CONTRACT_REV_CHUNK), ...chunk.filter((id) => pending.has(id) && !entry.detail.has(id))];
      if (!rest.length) break;
      if (rest.length >= ids.length && entry.detail.size === before) break;
      ids = rest;
      guildRerender();
    }
    entry.detailBusy = false;
    guildRerender();
  }

  /**
   * 各營業處審件件數與退件：案件（同地址的包租／轉租只算一件，同 Worker）依複審人歸處；
   * 公會案件意見依媒合編號找回案件，算在該案的營業處。
   */
  function guildOfficeRows(entry, regions, errors) {
    const want = new Set(regions);
    const everywhere = want.has('全區');
    const staffBy = new Map((state.sb?.staff || []).map((s) => [s.name, s]));
    const revOf = (c) => revOfCase(entry, c);
    const buckets = new Map();
    const bucket = (office, staffOffice) => {
      if (!buckets.has(office)) buckets.set(office, { office, area: Core.officeArea(staffOffice || office), total: 0, err: 0, cases: [] });
      return buckets.get(office);
    };
    const byNo = new Map();
    for (const list of caseGroups(entry.cases)) {
      const pick = list.find(revOf) || list[0];
      const r = revOf(pick);
      const s = r ? staffBy.get(r.auditor) || (REVIEWER_OFFICE[r.auditor] ? { office: REVIEWER_OFFICE[r.auditor] } : null) : null;
      const office = !r ? OFF_NO_REV : !s ? OFF_NOT_STAFF : Core.officeName(s.office) || '人力明細沒有營業處';
      const other = r
        ? null
        : list
            .flatMap((c) => [entry.rev.otherById.get(String(c.id)), entry.rev.otherByAddr.get(addrKey(c.address))])
            .filter(Boolean)
            .sort((x, y) => String(y.time).localeCompare(String(x.time)))[0];
      const hint = other ? `${STEP_LABEL[String(other.status || '').replace(/\s+/g, ' ').trim()] || '其他審核'}：${other.auditor || '—'}（${String(other.time).slice(5, 10)}）` : '';
      const item = { no: pick.no || '', others: list.filter((c) => c !== pick).map((c) => c.no).filter(Boolean), city: pick.city || '', region: pick.region || '', auditor: r?.auditor || '', fromDetail: !!r?.fromDetail, hint, revAt: r ? String(r.time).slice(0, 10) : '', office, errs: [] };
      for (const c of list) if (c.no) byNo.set(caseNoKey(c.no), item);
      if (!everywhere && !want.has(item.region)) continue;
      item.inScope = true;
      const b = bucket(office, s?.office);
      b.total += 1;
      b.cases.push(item);
    }
    for (const o of errors || []) {
      if (o.kind !== 'case' || (!everywhere && !want.has(o.area))) continue;
      const item = byNo.get(caseNoKey(o.caseNo));
      if (item?.inScope) {
        item.errs.push(o.category || '未分類');
        buckets.get(item.office).err += 1;
      } else {
        const b = bucket(OFF_NO_CASE);
        b.err += 1;
        b.cases.push({ no: o.caseNo || '', others: [], city: o.region || o.area || '', region: o.area || '', auditor: '', revAt: '', office: OFF_NO_CASE, errs: [o.category || '未分類'] });
      }
    }
    const special = [OFF_NOT_STAFF, OFF_NO_REV, OFF_NO_CASE];
    const rank = (o) => (special.includes(o) ? 2e6 + special.indexOf(o) : Core.officeRank(o));
    return [...buckets.values()]
      .map((b) => ({ ...b, rate: b.total ? Core.kpiErrRate(b) : null }))
      .sort((a, b) => rank(a.office) - rank(b.office) || a.office.localeCompare(b.office, 'zh-Hant'));
  }

  function guildOfficePanel(sel, regions, label) {
    const head = `<h5 class="apt-goff-title">🏢 ${esc(label)}｜各營業處審件良率<small>案件依「複審人」在人力明細的營業處；點營業處看逐件媒合編號與複審人</small></h5>`;
    if (sel === 'year') return `<div class="apt-goff">${head}<p class="apt-sub-note">各營業處明細要看單月，請按右上角「單月」。</p></div>`;
    if (sel < GUILD_SYS_START) return `<div class="apt-goff">${head}<p class="apt-sub-note">${esc(sel)} 是管報匯入的月報，只有總數，沒有逐件案件可以分營業處（${GUILD_SYS_START} 起才有）。</p></div>`;
    loadGuildOffices(sel);
    const entry = state.guildOff.get(sel);
    if (!entry || entry.busy) return `<div class="apt-goff">${head}<p class="apt-sub-note apt-loading">讀取 ${esc(sel)} 起租案件與複審紀錄中…（第一次約需 10～20 秒）</p></div>`;
    if (entry.error) {
      return `<div class="apt-goff">${head}<p class="apt-bad">讀取失敗：${esc(entry.error)} <button type="button" class="apt-btn-lite" data-guild-off-retry="${esc(sel)}">重試</button></p></div>`;
    }
    const errors = state.guildSys.get(sel)?.data?.errors || [];
    const rows = guildOfficeRows(entry, regions, errors);
    const open = state.guildOffOpen;
    const tone = (rate) => (rate == null ? 'na' : rate >= 0.9 ? 'g' : rate >= 0.8 ? 'y' : 'r');
    const caseTable = (b) => `<tr class="apt-goff-cases"><td colspan="5">
        <table class="apt-table apt-goff-case-table">
          <thead><tr><th>媒合編號</th><th>縣市</th><th>複審人</th><th>複審日期</th><th>公會意見</th></tr></thead>
          <tbody>${b.cases
            .slice()
            .sort((x, y) => y.errs.length - x.errs.length || x.no.localeCompare(y.no))
            .map(
              (c) => `<tr class="${c.errs.length ? 'is-err' : ''}">
                <td>${esc(c.no) || NIL}${c.others.length ? `<small class="apt-lease-same" title="同地址的其他合約（包租／轉租），只算一件">＋${esc(c.others.join('、'))}</small>` : ''}</td>
                <td>${esc(c.city) || NIL}</td>
                <td>${c.auditor ? `${esc(c.auditor)}${c.fromDetail ? '<small title="審核時間紀錄沒有，這是從媒合管理合約明細的審核紀錄抓的複審通過審核者">（合約明細）</small>' : ''}` : (c.hint ? `<small class="apt-goff-hint" title="查不到複審紀錄，這是同一件最後一筆其他審核的審核人，僅供參考">無複審紀錄・${esc(c.hint)}</small>` : c.office === OFF_NO_REV ? '<small class="apt-goff-hint">審核紀錄裡沒有這件</small>' : NIL)}</td>
                <td>${esc(c.revAt.replace(/\//g, '-')) || NIL}</td>
                <td>${c.errs.length ? `<b class="apt-bad">退件 ${c.errs.length}</b> <small>${esc(c.errs.join('、'))}</small>` : '通過'}</td>
              </tr>`
            )
            .join('')}</tbody>
        </table>
      </td></tr>`;
    const body = rows
      .map((b) => {
        const on = open === b.office;
        const area = b.area ? `<i class="apt-area apt-area--${AREA_TONE[b.area.area] || 'east'}">${esc(b.area.area)}</i> ${esc(b.area.manager)}` : '';
        return `<tr class="${on ? 'is-picked' : ''}">
            <td><button type="button" class="apt-name" data-guild-office="${esc(b.office)}" aria-expanded="${on}">${on ? '▾' : '▸'} ${esc(b.office)}</button></td>
            <td>${area}</td>
            <td class="num">${b.total}</td>
            <td class="num">${b.err ? `<b class="apt-bad">${b.err}</b>` : 0}</td>
            <td class="num">${b.rate == null ? NIL : `<span class="apt-gchip apt-gchip--${tone(b.rate)}">${(b.rate * 100).toFixed(1)}%</span>`}</td>
          </tr>${on ? caseTable(b) : ''}`;
      })
      .join('');
    const total = rows.reduce((s, b) => ({ total: s.total + b.total, err: s.err + b.err }), { total: 0, err: 0 });
    const detailNote = entry.detailBusy
      ? `<p class="apt-sub-note apt-loading">審核時間紀錄缺複審的 ${entry.detailTodo} 張，正在補抓（已帶入 ${entry.detail.size}／${entry.detailTodo}；已查過的在 Worker 有快取，會一次帶回）…</p>`
        : entry.detailError
        ? `<p class="apt-bad">合約明細補抓複審人失敗：${esc(entry.detailError)} <button type="button" class="apt-btn-lite" data-guild-off-retry="${esc(sel)}">重試</button></p>`
        : '';
    return `<div class="apt-goff">${head}${detailNote}
        <div class="apt-table-wrap"><table class="apt-table apt-goff-table">
          <thead><tr><th>營業處</th><th>區主管</th><th class="num">案件數</th><th class="num">退件</th><th class="num">審件良率</th></tr></thead>
          <tbody>${body || '<tr><td colspan="5" class="apt-empty">這個月沒有起租案件</td></tr>'}
            <tr class="apt-sum-row"><th>合計</th><td></td><td class="num">${total.total}</td><td class="num">${total.err}</td><td class="num">${total.total ? `${(Core.kpiErrRate(total) * 100).toFixed(1)}%` : NIL}</td></tr>
          </tbody>
        </table></div>
        <p class="apt-sub-note">案件＝公會期數 ${esc(sel)}（起租日在該月）的已生效合約，包租案件的包租、轉租兩張合約同地址只算一件；複審人取審核時間紀錄「複審中 → 複審通過」最後一次（查 ${esc(entry.from)}～${esc(entry.to)}），先用合約對，對不到再用地址對；${
          entry.rev.first ? `星鴻審核時間紀錄最早只有 ${esc(entry.rev.first)} 起的資料，` : ''
        }還是查不到的，改到媒合管理合約明細的審核紀錄抓「複審通過」的審核者（標「合約明細」）。仍抓不到的列在「${OFF_NO_REV}」，明細改列這件找得到的其他審核人供參考。退件＝公會案件意見，依媒合編號找回案件。合計會和上方系統計算的件數相同；上方若採管報匯入的月報，數字可能略有差異。</p>
      </div>`;
  }

  /* ---------- 公會清冊良率：各營業處（清冊每一列依媒合編號找合約「複審通過」的審核者歸處；清冊意見依媒合編號） ---------- */

  const OFF_REV_WAIT = '複審人查詢中';
  const OFF_NO_ROW = '意見對不到清冊';

  /** 該公會期數的表單04／09（每列媒合編號），複審人分批向 Worker 查，快取在 state.rosterOff */
  function loadRosterOffices(period, refresh) {
    if (!refresh && state.rosterOff.has(period)) return;
    const [year, month] = period.split('/').map(Number);
    const g = { year, month, guild: period };
    const entry = { busy: true, rev: new Map(), focus: [], snapBuiltAt: '', snapStatus: '' };
    state.rosterOff.set(period, entry);

    const applySnapshot = (snap) => {
      entry.rows = (snap.rows || []).map(([form, region, company, per, no, reviewer, revTime, flag]) => ({
        form,
        region,
        company,
        period: per,
        no: String(no || '').trim()
      }));
      entry.rev = new Map();
      for (const [form, region, company, per, no, reviewer, revTime, flag] of snap.rows || []) {
        const key = String(no || '').trim();
        if (!key) continue;
        entry.rev.set(key, {
          auditor: reviewer || '',
          time: String(revTime || '').replace(/-/g, '/'),
          flag: flag || ''
        });
      }
      entry.detailBusy = false;
      entry.detailTodo = entry.rev.size;
      entry.snapBuiltAt = snap.updatedAt || snap.builtAt || '';
      entry.snapStatus = snap.partial
        ? `有 ${snap.unresolved?.noRev || 0} 件複審人待補`
        : '';
      entry.fromSnapshot = true;
    };

    const runLive = () =>
      Promise.all([fetchKpiPart(g, 'roster04', refresh), fetchKpiPart(g, 'roster09', refresh), guildSysPeriod(period)])
        .then(([a, b]) => {
          if (![a, b].every((d) => (d.rows || []).every((r) => Array.isArray(r[4])))) {
            throw new Error('清冊資料沒有媒合編號，請按重試或重新整理（Ctrl＋F5）後再試');
          }
          entry.rows = [];
          for (const [form, d] of [
            ['04', a],
            ['09', b]
          ]) {
            for (const [region, company, per, , nos] of d.rows || []) {
              for (const no of nos) entry.rows.push({ form, region, company, period: per, no: String(no || '').trim() });
            }
          }
          entry.ids = { ...(a.ids || {}), ...(b.ids || {}) };
          entry.fromSnapshot = false;
        });

    const boot = USE_ROSTER_SNAPSHOT
      ? fetchRosterSnapshot(g, { lite: false })
          .then((snap) => {
            /* 有逐件 rows 就立刻顯示（複審人可邊補邊更新） */
            if (Array.isArray(snap?.rows) && snap.rows.length) {
              applySnapshot(snap);
              if (snap.enriching || snap.partial) {
                const n = snap.unresolved?.noRev || 0;
                const p = snap.progress ? `${snap.progress.done || 0}/${snap.progress.total || '?'}` : '';
                entry.snapStatus = n
                  ? `複審人加速補齊中${p ? ` ${p}` : ''}，尚有 ${n} 件未對到（開著此頁會加快；畫面約數十秒刷新）`
                  : '清冊已載入；營業處歸戶補齊中';
                entry.snapPending = true;
                burstRosterSnapshotEnrich(g);
              }
              return guildSysPeriod(period);
            }
            if (snap?.missing || snap?.building) {
              entry.snapStatus = snap.building
                ? `清冊月結建立中（${snap.phase || ''} ${snap.progress?.done || 0}/${snap.progress?.total || '?'}）…`
                : '清冊月結尚未建立。背景會自動建置，或按「強制更新」。';
              entry.rows = [];
              entry.fromSnapshot = false;
              entry.snapPending = true;
              setTimeout(() => {
                const cur = state.rosterOff.get(period);
                if (cur === entry && entry.snapPending) {
                  state.rosterOff.delete(period);
                  loadRosterOffices(period, false);
                }
              }, 20000);
              return guildSysPeriod(period);
            }
            throw new Error('清冊快照沒有逐件資料');
          })
          .catch((e) => {
            entry.snapStatus = `清冊月結讀取失敗：${e.message || e}（可按強制更新）`;
            console.warn('roster snapshot', e);
            entry.rows = [];
            entry.fromSnapshot = false;
            return guildSysPeriod(period);
          })
      : runLive();

    boot
      .catch((e) => {
        entry.error = String(e.message || e);
      })
      .then(() => {
        entry.busy = false;
        /* 快照模式：複審人已在月結內；僅關閉快照時才即時查複審人 */
        if (!entry.error && !entry.fromSnapshot && !USE_ROSTER_SNAPSHOT) loadRosterReviewers(entry, period);
        guildRerender();
      });
  }

  const ROSTER_REV_LS = 'apt-roster-rev-v2';
  const ROSTER_REV_CHUNK = 250;
  const ROSTER_REV_TTL_MS = 12 * 3600 * 1000;

  function readRosterRevLocal(period) {
    try {
      const raw = JSON.parse(localStorage.getItem(`${ROSTER_REV_LS}:${period}`) || 'null');
      if (!raw?.at || Date.now() - raw.at > ROSTER_REV_TTL_MS || !Array.isArray(raw.rows)) return null;
      return new Map(
        raw.rows.map(([no, auditor, time, flag]) => [
          String(no),
          { auditor: auditor || '', time: String(time || '').replace(/-/g, '/'), flag: flag || '' }
        ])
      );
    } catch {
      return null;
    }
  }

  function writeRosterRevLocal(period, map) {
    try {
      const rows = [...map.entries()].map(([no, v]) => [no, v.auditor || '', v.time || '', v.flag || '']);
      localStorage.setItem(`${ROSTER_REV_LS}:${period}`, JSON.stringify({ at: Date.now(), rows }));
    } catch {
      /* quota */
    }
  }

  /** Worker 每次只查一部分；瀏覽器會記住進度，重開頁面先帶入本機快取再補缺 */
  async function loadRosterReviewers(entry, period) {
    const errNos = (state.guildSys.get(period)?.data?.errors || []).filter((o) => o.kind === 'roster').map((o) => String(o.caseNo || '').trim());
    const all = [...new Set([...entry.rows.map((r) => r.no), ...errNos].filter(Boolean))];
    const regionOf = new Map(entry.rows.map((r) => [r.no, r.region]));
    entry.detailTodo = all.length;
    entry.detailBusy = true;
    entry.detailError = '';
    const local = readRosterRevLocal(period);
    if (local?.size) {
      for (const [no, v] of local) if (all.includes(no) && !entry.rev.has(no)) entry.rev.set(no, v);
      guildRerender();
    }
    for (let round = 0; round < 800; round++) {
      const want = all.filter((no) => !entry.rev.has(no));
      if (!want.length) break;
      const focus = new Set(entry.focus || []);
      if (!focus.has('全區')) want.sort((x, y) => Number(focus.has(regionOf.get(y))) - Number(focus.has(regionOf.get(x))));
      const chunk = want.slice(0, ROSTER_REV_CHUNK);
      const ids = {};
      for (const no of chunk) if (entry.ids?.[no]) ids[no] = entry.ids[no];
      let data;
      try {
        const res = await fetch(`${RPA_BASE}/admin-points/roster-reviewers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Skyfun-Session': token() },
          body: JSON.stringify({ nos: chunk, ids })
        });
        data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `清冊複審人讀取失敗（HTTP ${res.status}）`);
      } catch (e) {
        entry.detailError = String(e.message || e);
        break;
      }
      const before = entry.rev.size;
      for (const [no, auditor, time, flag] of data.rows || []) {
        entry.rev.set(String(no), { auditor: auditor || '', time: String(time || '').replace(/-/g, '/'), flag: flag || '' });
      }
      if (entry.rev.size > before) writeRosterRevLocal(period, entry.rev);
      if (entry.rev.size === before) break;
      guildRerender();
    }
    if (!entry.detailError) writeRosterRevLocal(period, entry.rev);
    entry.detailBusy = false;
    guildRerender();
  }

  /**
   * 各營業處清冊件數與意見：清冊每一列（表單04、09 各算一件，同 KPI）依媒合編號的複審人歸處，
   * 公會清冊意見依媒合編號找回清冊那一件。
   */
  function rosterOfficeRows(entry, regions, errors, opts = {}) {
    const want = new Set(regions);
    const everywhere = want.has('全區');
    const staffBy = new Map((state.sb?.staff || []).map((s) => [s.name, s]));
    const buckets = new Map();
    const bucket = (office, staffOffice) => {
      if (!buckets.has(office)) buckets.set(office, { office, area: Core.officeArea(staffOffice || office), total: 0, err: 0, cases: [] });
      return buckets.get(office);
    };
    const whoOf = (no) => {
      const r = no ? entry.rev.get(no) : null;
      if (!r) return { office: no && (entry.detailBusy || entry.snapPending) ? OFF_REV_WAIT : OFF_NO_REV, r: null, s: null };
      if (!r.auditor) {
        if (r.flag === 'nc') return { office: OFF_NO_REV, r, s: null };
        return { office: entry.snapPending || entry.detailBusy ? OFF_REV_WAIT : OFF_NO_REV, r, s: null };
      }
      if (ROSTER_LEADERS.has(r.auditor)) return { office: OFF_LEADER, r, s: staffBy.get(r.auditor) || null };
      const s = staffBy.get(r.auditor) || (REVIEWER_OFFICE[r.auditor] ? { office: REVIEWER_OFFICE[r.auditor] } : null);
      return { office: !s ? OFF_NOT_STAFF : Core.officeName(s.office) || '人力明細沒有營業處', r, s };
    };
    const itemOf = (no, w, extra) => ({
      no,
      forms: [],
      region: '',
      company: '',
      auditor: w.r?.auditor || '',
      revAt: w.r ? String(w.r.time).slice(0, 10) : '',
      noContract: w.r?.flag === 'nc',
      office: w.office,
      errs: [],
      n: 0,
      ...extra
    });
    const items = new Map();
    for (const row of entry.rows) {
      if (opts.form04Only && row.form !== '04') continue;
      if (!everywhere && !want.has(row.region)) continue;
      const k = row.no ? caseNoKey(row.no) : `#${items.size}`;
      let it = items.get(k);
      if (!it) {
        const w = whoOf(row.no);
        it = itemOf(row.no, w, { region: row.region, company: row.company });
        items.set(k, it);
        bucket(w.office, w.s?.office).cases.push(it);
      }
      it.n += 1;
      it.forms.push(row.form);
      buckets.get(it.office).total += 1;
    }
    for (const o of errors || []) {
      if (o.kind !== 'roster' || (!everywhere && !want.has(o.area))) continue;
      const no = String(o.caseNo || '').trim();
      const what = o.category || '未分類';
      const it = items.get(caseNoKey(no));
      if (it) {
        it.errs.push(what);
        buckets.get(it.office).err += 1;
      } else if (opts.form04Only) {
        continue;
      } else {
        const b = bucket(OFF_NO_ROW);
        b.err += 1;
        b.cases.push({ ...itemOf(no, whoOf(no), { region: o.area || o.region || '' }), office: OFF_NO_ROW, errs: [what] });
      }
    }
    const special = [OFF_LEADER, OFF_NOT_STAFF, OFF_NO_REV, OFF_REV_WAIT, OFF_NO_ROW];
    const rank = (o) => (special.includes(o) ? 2e6 + special.indexOf(o) : Core.officeRank(o));
    return [...buckets.values()]
      .map((b) => ({ ...b, rate: b.total ? Core.kpiErrRate(b) : null }))
      .sort((a, b) => rank(a.office) - rank(b.office) || a.office.localeCompare(b.office, 'zh-Hant'));
  }

  const formsText = (forms) =>
    ['04', '09']
      .map((f) => [f, forms.filter((x) => x === f).length])
      .filter(([, n]) => n)
      .map(([f, n]) => `表${f}${n > 1 ? `×${n}` : ''}`)
      .join('、');

  function rosterOfficePanel(sel, regions, label) {
    const forceBtn = USE_ROSTER_SNAPSHOT
      ? ` <button type="button" class="apt-btn-lite" data-roster-snap-rebuild="${esc(sel)}">強制更新</button>`
      : '';
    const head = `<h5 class="apt-goff-title">🏢 ${esc(label)}｜各營業處清冊良率<small>清冊每一列依媒合編號找合約「複審通過」的審核者，算到他在人力明細的營業處；點營業處看逐件</small>${forceBtn}</h5>`;
    if (sel === 'year') return `<div class="apt-goff">${head}<p class="apt-sub-note">各營業處明細要看單月，請按右上角「單月」。</p></div>`;
    if (sel < GUILD_SYS_START) return `<div class="apt-goff">${head}<p class="apt-sub-note">${esc(sel)} 是管報匯入的月報，只有總數，沒有逐件清冊可以分營業處（${GUILD_SYS_START} 起才有）。</p></div>`;
    loadRosterOffices(sel);
    const entry = state.rosterOff.get(sel);
    entry.focus = regions;
    if (entry.busy) return `<div class="apt-goff">${head}<p class="apt-sub-note apt-loading">讀取 ${esc(sel)} 清冊中…${entry.snapStatus ? `（${esc(entry.snapStatus)}）` : ''}</p></div>`;
    if (entry.error) {
      return `<div class="apt-goff">${head}<p class="apt-bad">讀取失敗：${esc(entry.error)} <button type="button" class="apt-btn-lite" data-roster-off-retry="${esc(sel)}">重試</button></p></div>`;
    }
    const errors = state.guildSys.get(sel)?.data?.errors || [];
    const rows = rosterOfficeRows(entry, regions, errors);
    const open = state.guildOffOpen;
    const tone = (rate) => (rate == null ? 'na' : rate >= 0.95 ? 'g' : rate >= 0.85 ? 'y' : 'r');
    const whoCell = (c) =>
      c.auditor
        ? esc(c.auditor)
        : c.noContract
          ? '<small class="apt-goff-hint">媒合管理查不到這個媒合編號</small>'
          : entry.rev.has(c.no)
            ? '<small class="apt-goff-hint">合約明細沒有複審通過紀錄</small>'
            : entry.detailBusy && c.no
              ? '<small class="apt-goff-hint">查詢中…</small>'
              : NIL;
    const caseTable = (b) => `<tr class="apt-goff-cases"><td colspan="5">
        <table class="apt-table apt-goff-case-table">
          <thead><tr><th>媒合編號</th><th>清冊</th><th>地區</th><th>複審人</th><th>複審日期</th><th>公會意見</th></tr></thead>
          <tbody>${b.cases
            .slice()
            .sort((x, y) => y.errs.length - x.errs.length || x.no.localeCompare(y.no))
            .slice(0, 400)
            .map(
              (c) => `<tr class="${c.errs.length ? 'is-err' : ''}">
                <td>${esc(c.no) || NIL}</td>
                <td>${c.forms.length ? esc(formsText(c.forms)) : '<small class="apt-goff-hint">不在本期清冊</small>'}</td>
                <td>${esc(c.region) || NIL}${c.company ? `<small class="apt-lease-same">${esc(c.company)}</small>` : ''}</td>
                <td>${whoCell(c)}</td>
                <td>${esc(c.revAt.replace(/\//g, '-')) || NIL}</td>
                <td>${c.errs.length ? `<b class="apt-bad">意見 ${c.errs.length}</b> <small>${esc(c.errs.join('、'))}</small>` : '無'}</td>
              </tr>`
            )
            .join('')}${b.cases.length > 400 ? `<tr><td colspan="6" class="apt-empty">共 ${b.cases.length} 件，只列有意見的與前 400 件</td></tr>` : ''}</tbody>
        </table>
      </td></tr>`;
    const body = rows
      .map((b) => {
        const on = open === b.office;
        const area = b.area ? `<i class="apt-area apt-area--${AREA_TONE[b.area.area] || 'east'}">${esc(b.area.area)}</i> ${esc(b.area.manager)}` : '';
        return `<tr class="${on ? 'is-picked' : ''}">
            <td><button type="button" class="apt-name" data-guild-office="${esc(b.office)}" aria-expanded="${on}">${on ? '▾' : '▸'} ${esc(b.office)}</button></td>
            <td>${area}</td>
            <td class="num">${b.total}</td>
            <td class="num">${b.err ? `<b class="apt-bad">${b.err}</b>` : 0}</td>
            <td class="num">${b.rate == null ? NIL : `<span class="apt-gchip apt-gchip--${tone(b.rate)}">${(b.rate * 100).toFixed(1)}%</span>`}</td>
          </tr>${on ? caseTable(b) : ''}`;
      })
      .join('');
    const total = rows.reduce((s, b) => ({ total: s.total + b.total, err: s.err + b.err }), { total: 0, err: 0 });
    const snapNote = entry.fromSnapshot
      ? `<p class="apt-sub-note">清冊快照：${entry.snapBuiltAt ? esc(fmtSnapTime(entry.snapBuiltAt)) : '已載入'}　公會意見：即時${entry.snapStatus ? `　（${esc(entry.snapStatus)}）` : ''}</p>`
      : entry.snapStatus
        ? `<p class="apt-sub-note">${esc(entry.snapStatus)}</p>`
        : '';
    const detailNote = entry.fromSnapshot
      ? ''
      : entry.detailBusy
        ? `<p class="apt-sub-note apt-loading">正在補齊清冊複審人（已有 ${entry.rev.size}／${entry.detailTodo}）。本機有進度快取，重開會先帶入；缺的才跟 Worker 補…</p>`
        : entry.detailError
          ? `<p class="apt-bad">清冊複審人查詢失敗：${esc(entry.detailError)} <button type="button" class="apt-btn-lite" data-roster-off-retry="${esc(sel)}">重試</button></p>`
          : entry.rev.size
            ? `<p class="apt-sub-note">清冊複審人已齊（${entry.rev.size} 筆），本機與雲端皆有快取。</p>`
            : '';
    return `<div class="apt-goff">${head}${snapNote}${detailNote}
        <div class="apt-table-wrap"><table class="apt-table apt-goff-table">
          <thead><tr><th>營業處</th><th>區主管</th><th class="num">清冊件數</th><th class="num">公會意見</th><th class="num">清冊良率</th></tr></thead>
          <tbody>${body || '<tr><td colspan="5" class="apt-empty">這個月沒有清冊</td></tr>'}
            <tr class="apt-sum-row"><th>合計</th><td></td><td class="num">${total.total}</td><td class="num">${total.err}</td><td class="num">${total.total ? `${(Core.kpiErrRate(total) * 100).toFixed(1)}%` : NIL}</td></tr>
          </tbody>
        </table></div>
        <p class="apt-sub-note">清冊件數＝公會期數 ${esc(sel)} 表單04＋表單09（同上方系統計算，表04、表09 各算一件）；每件依媒合編號找到合約，取合約明細審核紀錄最後一次「複審通過」的審核者，算到他在人力明細的營業處（不在人力明細的主管依對照表）。公會意見＝清冊意見，依媒合編號找回清冊那一件；對不到本期清冊的列在「${OFF_NO_ROW}」。顏色：95% 以上綠、85% 以上黃、其餘紅。</p>
      </div>`;
  }

  /** 個人的公會審件／清冊：審件＝我複審的起租案件，清冊＝只算表單04 裡我複審的合約；意見依媒合編號算到我 */
  function personGuildStats(name, period) {
    if (!state.guildSys.has(period)) guildSysPeriod(period).then(guildRerender);
    loadGuildOffices(period);
    loadRosterOffices(period);
    const errors = state.guildSys.get(period)?.data?.errors;
    const pick = (entry, rowsOf) => {
      if (!entry || entry.busy || !errors) return { loading: true };
      if (entry.error) return { error: entry.error };
      const mine = rowsOf(entry, ['全區'], errors)
        .flatMap((b) => b.cases)
        .filter((c) => c.auditor === name);
      return { mine, busy: !!entry.detailBusy };
    };
    const audit = pick(state.guildOff.get(period), guildOfficeRows);
    if (audit.mine) {
      audit.total = audit.mine.filter((c) => c.office !== OFF_NO_CASE).length;
      audit.err = audit.mine.reduce((s, c) => s + c.errs.length, 0);
    }
    const roster = pick(state.rosterOff.get(period), (e, r, errs) => rosterOfficeRows(e, r, errs, { form04Only: true }));
    if (roster.mine) {
      roster.total = roster.mine.reduce((s, c) => s + c.n, 0);
      roster.err = roster.mine.reduce((s, c) => s + c.errs.length, 0);
    }
    for (const x of [audit, roster]) if (x.mine) x.rate = x.total ? Core.kpiErrRate(x) : null;
    return { audit, roster };
  }

  /** 個人績效的品質良率：內部審件（自己的抽查）＋公會審件／清冊（依複審人算到自己），下方列出被退件／下意見的案件 */
  function personQuality(range, name, region) {
    const CH = window.AdminPointsCharts;
    if (state.lkpi?.key !== `${range.year}-${range.month}`) loadLeaderKpi(range).catch((e) => console.warn('品質儀表板', e));
    const period = prevGuild(range).guild;
    const card = (label, rate, goal, meta, note) => `<div class="apt-gauge">
        <span class="apt-gauge-ring">${CH.donut({ value: rate == null ? null : rate * 100, text: rate == null ? '-' : rate >= 1 ? '100%' : `${(rate * 100).toFixed(1)}%`, sub: `目標 ${Math.round(goal * 100)}%`, color: rate == null ? C_ALL : rate >= goal ? '#16a34a' : rate >= goal - 0.1 ? '#f59e0b' : '#dc2626', marks: [goal * 100] })}</span>
        <span class="apt-gauge-text">
          <span class="apt-gauge-label">${label}</span>
          <span class="apt-gauge-meta">${meta}</span>
          <small>${note}</small>
        </span>
      </div>`;
    const inQ = internalQuality([name]);
    const internal = card('內部審件良率', inQ.rate, 0.9, inQ.checked ? `抽查 <b>${inQ.checked}</b> 件・正確 <b>${inQ.correct}</b> 件` : '本業績月還沒有抽查', '本業績月・組長抽查');
    if (period < GUILD_SYS_START) {
      const na = (label) => card(label, null, 0.9, `公會期數 ${GUILD_SYS_START} 起才有逐筆案件`, `公會期數 ${esc(period)}`);
      return `<div class="apt-gauges">${internal}${na('我的公會審件良率')}${na('我的公會清冊良率')}</div>`;
    }
    const st = personGuildStats(name, period);
    const areaRate = (kind) => {
      const x = region ? guildQuality(state.lkpi, kind, [region]) : null;
      return x?.total ? ` · ${esc(region)}地區整體 ${(x.rate * 100).toFixed(1)}%` : '';
    };
    const guildCard = (label, kind, x) => {
      const k = GUILD_KIND[kind];
      const meta = x.loading
        ? '讀取中…'
        : x.error
          ? `<span class="apt-bad">讀取失敗：${esc(x.error)}</span>`
          : x.total || x.err
            ? `${k.errText} <b>${x.err}</b> 件／${kind === 'audit' ? '複審' : '清冊'} <b>${x.total}</b> 件${kind === 'roster' ? '（個人只算表單04）' : ''}`
            : '這期沒有我複審的件數';
      const note = `公會期數 ${esc(period)}${areaRate(kind)}${x.busy ? ' · 複審人還在查詢中，數字會再增加' : ''}`;
      return card(label, x.rate ?? null, k.goal, meta, note);
    };
    const errRows = [
      ...(st.audit.mine || []).filter((c) => c.errs.length).map((c) => ({ kind: '審件', c })),
      ...(st.roster.mine || []).filter((c) => c.errs.length).map((c) => ({ kind: '清冊', c }))
    ];
    const auditErrs = errRows.filter((x) => x.kind === '審件').length;
    const list = errRows.length
      ? `<details class="apt-pd-group apt-person-errs" data-fold="personErr"${state.personErrOpen ? ' open' : ''}>
        <summary><b>公會退件／意見明細</b>審件退件 ${auditErrs} 件 · 清冊意見 ${errRows.length - auditErrs} 件</summary>
        <div class="apt-table-wrap"><table class="apt-table apt-goff-case-table">
          <thead><tr><th>種類</th><th>媒合編號</th><th>地區</th><th>複審日期</th><th>公會意見</th></tr></thead>
          <tbody>${errRows
            .map(
              ({ kind, c }) => `<tr class="is-err">
                <td>${kind}</td>
                <td>${esc(c.no) || NIL}</td>
                <td>${esc(c.city || c.region) || NIL}</td>
                <td>${esc(String(c.revAt || '').replace(/\//g, '-')) || NIL}</td>
                <td><b class="apt-bad">${kind === '審件' ? '退件' : '意見'} ${c.errs.length}</b> <small>${esc(c.errs.join('、'))}</small></td>
              </tr>`
            )
            .join('')}</tbody>
        </table></div></details>`
      : '';
    return `<div class="apt-gauges">${internal}${guildCard('我的公會審件良率', 'audit', st.audit)}${guildCard('我的公會清冊良率', 'roster', st.roster)}</div>${list}`;
  }

  function guildDetail(range, o) {
    const open = state.guildOpen;
    const k = open && GUILD_KIND[open.kind];
    if (!k) return '';
    const CH = window.AdminPointsCharts;
    const cur = prevGuild(range);
    if (state.guildYear?.key !== cur.guild) loadGuildYear(range).catch((e) => console.warn('公會良率年度', e));
    const gy = state.guildYear;
    const multi = o.regions.length > 1;
    const city = multi && !o.noCityBoard && o.regions.includes(open.city) ? open.city : '';
    const regions = city ? [city] : o.regions;
    const groupName = `${o.scopeName || '本組'}合計`;
    const scopeText = city ? `${city}（${groupName.replace('合計', '')}）` : o.regionText || '全區';
    const wrap = (body) => `<section class="apt-guild apt-guild--${open.kind}" aria-label="${k.label}每月趨勢">
        <header class="apt-guild-head">
          <h4>📈 ${k.label}｜每月趨勢<small>本期 ${cur.year} 年 vs 同期 ${cur.year - 1} 年 · ${esc(scopeText)}</small></h4>
          <button type="button" class="apt-btn-lite" data-guild-close>收起</button>
        </header>${body}</section>`;
    if (!o.regions.length) return wrap('<p class="apt-empty">人力明細沒有部別，對不到地區</p>');
    if (!gy || gy.busy) return wrap('<p class="apt-empty">讀取每月資料中…（公會期數 115/09 起要向星鴻系統逐月查詢，約需數秒）</p>');
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const curVals = months.map((m) => (m <= cur.month ? guildMonthValue(gy, open.kind, guildPeriodOf(cur.year, m), regions) : null));
    const prevVals = months.map((m) => guildMonthValue(gy, open.kind, guildPeriodOf(cur.year - 1, m), regions));
    const pctOf = (v) => (v ? v.rate * 100 : null);
    const sel = open.period === 'year' ? 'year' : open.period && open.period <= cur.guild ? open.period : cur.guild;
    const selIdx = sel !== 'year' && sel.startsWith(`${cur.year}/`) ? Number(sel.slice(4)) - 1 : -1;
    const sum = (vals) => {
      const x = vals.filter(Boolean).reduce((s, v) => ({ total: s.total + v.total, err: s.err + v.err }), { total: 0, err: 0 });
      return x.total ? { ...x, rate: Core.kpiErrRate(x) } : null;
    };
    const single = !multi && o.scopeName && o.regions.length === 1 && o.regions[0] !== '全區';
    const cityBoard = (multi || single) && !o.noCityBoard ? guildCityBoard(gy, open.kind, k, cur, sel, o.regions, groupName, single ? o.regions[0] : city, sum) : '';
    const curSum = sum(curVals);
    const prevSum = sum(prevVals.slice(0, cur.month));
    const prevYear = sum(prevVals);
    const C_CUR = '#3b5bdb';
    const C_PREV = '#5c940d';
    const diffPt = (a, b) => (a && b ? (a.rate - b.rate) * 100 : null);
    const diffText = (d) => (d == null ? '' : Math.abs(d) < 0.05 ? '持平' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)} pt`);
    const sumDiff = diffPt(curSum, prevSum);
    const hasData = [...curVals, ...prevVals].some(Boolean);
    const wide = state.guildWide === 'trend' || state.guildWide === 'cats' ? state.guildWide : '';
    const geo = GUILD_GEO;
    const gwPct = ((geo.width - geo.padL - geo.padR) / 12 / geo.width) * 100;
    const chart = hasData
      ? CH.trend({
          id: `guild-${open.kind}`,
          labels: months.map((m) => `${m}月`),
          lines: [
            { name: `本期 ${cur.year}`, values: curVals.map(pctOf), color: C_CUR, area: true },
            { name: `同期 ${cur.year - 1}`, values: prevVals.map(pctOf), color: C_PREV }
          ],
          target: { value: k.goal * 100, name: '目標' },
          fmt: (v) => `${Math.round(v)}%`,
          height: wide ? 300 : 320,
          ...(wide ? geo : GUILD_GEO_DUO),
          side: wide && {
            title: `1～${cur.month} 月累計`,
            items: [
              { label: `本期 ${cur.year}`, value: pctOf(curSum), color: C_CUR },
              { label: `同期 ${cur.year - 1}`, value: pctOf(prevSum), color: C_PREV }
            ],
            tag: sumDiff == null ? null : { text: `較同期 ${diffText(sumDiff)}`, color: sumDiff >= 0 ? '#15803d' : '#dc2626', bg: sumDiff >= 0 ? '#dcfce7' : '#fee2e2' }
          },
          pick: { id: 'guild-month', active: selIdx }
        })
      : '';
    const toneOf = (v) => (v.rate >= k.goal ? 'g' : v.rate >= k.goal - 0.1 ? 'y' : 'r');
    const onCls = (i) => (i === selIdx ? ' is-on' : '');
    const rateCell = (v, period, i) => {
      if (!v) return `<td class="apt-gt-na${onCls(i)}">${NIL}</td>`;
      const pickable = period && period >= `${cur.year}/01`;
      return `<td class="apt-gt-rate${onCls(i)}"${pickable ? ` data-guild-month="${period}" role="button" tabindex="0"` : ''} title="${v.src === 'import' ? '管報匯入的公會月報' : v.src === 'system' ? '系統計算（表單04/09、案件、公會意見）' : ''}"><span class="apt-gchip apt-gchip--${toneOf(v)}">${(v.rate * 100).toFixed(1)}%</span></td>`;
    };
    const cntCell = (v, i) => (v ? `<td class="apt-gt-cnt${onCls(i)}"><b>${v.err}</b><small>／${v.total}</small></td>` : `<td class="apt-gt-na${onCls(i)}"></td>`);
    const diffCell = (a, b, i) => {
      const d = diffPt(a, b);
      return d == null
        ? `<td class="apt-gt-na${onCls(i)}"></td>`
        : `<td class="apt-gt-diff ${d > 0.05 ? 'is-up' : d < -0.05 ? 'is-down' : ''}${onCls(i)}">${diffText(d).replace(' pt', '').replace(' ', '')}</td>`;
    };
    const table = `<table class="apt-gt">
        <colgroup><col style="width:${((geo.padL / geo.width) * 100).toFixed(2)}%">${months.map(() => `<col style="width:${gwPct.toFixed(3)}%">`).join('')}<col style="width:${((geo.padR / 2 / geo.width) * 100).toFixed(2)}%"><col style="width:${((geo.padR / 2 / geo.width) * 100).toFixed(2)}%"></colgroup>
        <thead><tr><th></th>${months
          .map((m, i) => {
            const p = guildPeriodOf(cur.year, m);
            const can = m <= cur.month;
            return `<th class="apt-gt-m${onCls(i)}"${can ? ` data-guild-month="${p}" role="button" tabindex="0"` : ''}>${m}月</th>`;
          })
          .join('')}<th class="apt-gt-sum">1～${cur.month} 月<br>累計</th><th class="apt-gt-sum">全年</th></tr></thead>
        <tbody>
          <tr class="apt-gt-cur"><th><i style="background:${C_CUR}"></i>本期 ${cur.year}<small>${k.short}良率</small></th>${months.map((m, i) => rateCell(curVals[i], guildPeriodOf(cur.year, m), i)).join('')}${rateCell(curSum)}${rateCell(curSum)}</tr>
          <tr class="apt-gt-cur apt-gt-sub"><th><small>${k.errText}／總件數</small></th>${months.map((m, i) => cntCell(curVals[i], i)).join('')}${cntCell(curSum)}${cntCell(curSum)}</tr>
          <tr class="apt-gt-prev"><th><i style="background:${C_PREV}"></i>同期 ${cur.year - 1}<small>${k.short}良率</small></th>${months.map((m, i) => rateCell(prevVals[i], guildPeriodOf(cur.year - 1, m), i)).join('')}${rateCell(prevSum)}${rateCell(prevYear)}</tr>
          <tr class="apt-gt-prev apt-gt-sub"><th><small>${k.errText}／總件數</small></th>${months.map((m, i) => cntCell(prevVals[i], i)).join('')}${cntCell(prevSum)}${cntCell(prevYear)}</tr>
          <tr class="apt-gt-vs"><th>較同期<small>百分點</small></th>${months.map((m, i) => diffCell(curVals[i], prevVals[i], i)).join('')}${diffCell(curSum, prevSum)}<td class="apt-gt-na"></td></tr>
        </tbody>
      </table>`;
    const zoomBtn = (which) =>
      `<button type="button" class="apt-guild-zoom${wide ? ' is-on' : ''}" data-guild-wide="${wide ? '' : which}" title="${wide ? '折線圖與缺失類別左右並排' : '放大成整列寬（另一張排到下面）'}">${wide ? '⇆ 改回並排' : '⤢ 放大'}</button>`;
    const sumChips = `<span class="apt-guild-sum"><small>1～${cur.month} 月累計</small>
        <b style="color:${C_CUR}">本期 ${curSum ? `${(curSum.rate * 100).toFixed(1)}%` : '-'}</b>
        <b style="color:${C_PREV}">同期 ${prevSum ? `${(prevSum.rate * 100).toFixed(1)}%` : '-'}</b>
        ${sumDiff == null ? '' : `<em class="${sumDiff >= 0 ? 'is-up' : 'is-down'}">${diffText(sumDiff)}</em>`}</span>`;
    const plot = hasData
      ? `<div class="apt-guild-card">
          <div class="apt-guild-bar">
            <span class="apt-guild-pill">${k.short}良率</span>
            ${multi ? `<span class="apt-guild-scope${city ? ' is-city' : ''}">${esc(city || groupName)}${city ? `<button type="button" data-guild-city="${esc(city)}" title="回到${esc(groupName)}">✕ 回到${esc(groupName)}</button>` : ''}</span>` : ''}
            <span class="apt-guild-keys">
              <span><i class="is-goal"></i>目標 ${Math.round(k.goal * 100)}%</span>
              <span><i class="is-line" style="background:${C_CUR}"></i>本期 ${cur.year}</span>
              <span><i class="is-line is-thin" style="background:${C_PREV}"></i>同期 ${cur.year - 1}</span>
            </span>
            ${wide ? '<small>點月份看該月缺失類別</small>' : sumChips}
            ${zoomBtn('trend')}
          </div>
          <div class="apt-guild-plot${wide ? '' : ' is-duo'}"><div class="apt-guild-plot-in">${chart}${wide ? table : ''}</div></div>
          ${wide ? '' : '<p class="apt-guild-hint">點圖上的月份，右邊的缺失類別會換成那個月</p>'}
        </div>`
      : '<p class="apt-empty">今年和去年都還沒有資料，請到後台「公會意見」頁匯入公會月報</p>';
    const tableOpen = !!state.guildTableOpen;
    const tableBox = hasData && !wide
      ? `<div class="apt-guild-tbl${tableOpen ? ' is-open' : ''}">
          <button type="button" class="apt-guild-tbl-btn" data-guild-table aria-expanded="${tableOpen}">
            <span>📊 每月數字表</span><small>每月良率、${k.errText}／總件數、較同期</small><b>${tableOpen ? '收合 ▴' : '展開 ▾'}</b>
          </button>
          ${tableOpen ? `<div class="apt-guild-plot"><div class="apt-guild-plot-in">${table}</div></div>` : ''}
        </div>`
      : '';
    const yearPeriods = months.map((m) => guildPeriodOf(cur.year, m)).filter((p) => p >= GUILD_SYS_START && p <= cur.guild);
    const catPeriods = sel === 'year' ? yearPeriods : [sel];
    const cats = guildCats(open.kind, catPeriods, regions);
    const selText = sel === 'year' ? `${cur.year} 年累計（${GUILD_SYS_START} 起）` : `公會期數 ${sel}`;
    const catBody = cats.months
      ? guildCatsHtml(open.kind, cats, { compact: !wide, all: !!state.guildCatsAll })
      : `<p class="apt-gpie-none">${sel !== 'year' && sel < GUILD_SYS_START ? `${esc(sel)} 是管報匯入的月報，只有總數，沒有逐筆意見可以分類（缺失類別從 ${GUILD_SYS_START} 起才有）` : '這段期間還沒有公會意見資料'}</p>`;
    const catCard = `<div class="apt-guild-cats">
        <div class="apt-guild-cats-head">
          <h5>🧩 ${k.short}缺失類別<small>${esc(selText)}</small></h5>
          <span class="apt-guild-cats-tools">
            <span class="apt-guild-cats-tabs">
              <button type="button" class="${sel !== 'year' ? 'is-on' : ''}" data-guild-month="${sel !== 'year' ? sel : cur.guild}">單月</button>
              <button type="button" class="${sel === 'year' ? 'is-on' : ''}" data-guild-month="year">今年累計</button>
            </span>
            ${hasData ? zoomBtn('cats') : ''}
          </span>
        </div>
        ${catBody}
      </div>`;
    const notes = [];
    if (gy.error) notes.push(`公會月報讀取失敗：${gy.error}`);
    if (gy.sysErr) notes.push(`部分月份系統資料讀取失敗：${gy.sysErr}`);
    const duo = hasData
      ? `<div class="apt-guild-duo${wide ? ' is-wide' : ''}">${wide === 'cats' ? `${catCard}${plot}` : `${plot}${catCard}`}</div>${tableBox}`
      : `${plot}${catCard}`;
    return wrap(`${cityBoard}${duo}
      <p class="apt-sub-note">良率＝（總件數 − ${k.errText}件數）÷ 總件數，目標 ${Math.round(k.goal * 100)}%；${k.op === 'case' ? '審件總件數＝起租已生效案件，包租案件的包租、轉租兩張合約同地址只算一件；' : ''}${GUILD_SYS_START} 起由系統計算（同上方卡片），更早的月份與同期取自管報「各都良率總表」（全台與各縣市，後台「公會意見」頁匯入；新竹、嘉義含市與縣），兩者都有時以匯入的為準。滑鼠停在良率上可看資料來源。${notes.length ? `<br><span class="apt-bad">${esc(notes.join('；'))}</span>` : ''}</p>`);
  }

  /** 組長週報：全部組長＝全區；選了組長＝該組組員與負責地區 */
  function leaderGauges(range, scope) {
    const inScope = (s) => (scope.names ? scope.names.includes(s.name) : s.leader === scope.leader);
    const staff = (state.sb?.staff || []).filter((s) => Core.isOnDuty(s) && s.kind !== '工讀生' && (!scope || inScope(s)));
    const regions = scope ? scopeRegions(scope) : ['全區'];
    const who = !scope ? '全區' : scope.label ? esc(scope.label) : `${esc(scope.leader)} 組${scope.areas?.length ? `（${esc(scope.areas.join('・'))}）` : ''}`;
    const boss = state.tab === 'area' ? '區主管' : '組長';
    return `<h4 class="apt-sec-title">本月品質良率<small>${who} · ${scope ? `點上方「看全部${boss}」回到全區` : `點上方${boss}看該區`}</small></h4>
      ${qualityGauges(range, { names: scope ? staff.map((s) => s.name) : null, regions, regionText: scope ? regions.join('・') : '', scopeName: scope ? scope.short || scopeLabel(scope) : '', noCityBoard: state.tab === 'weekly' })}`;
  }

  /* ---------- 案件繳交稽核：應繳＝起租日在該週（週五～週四）的已生效合約；行政逐件打勾＝已繳 ---------- */

  /** 繳交以日曆月計（不是業績月） */
  function leaseMonth(range) {
    const last = new Date(range.year, range.month, 0).getDate();
    const ym = `${range.year}-${String(range.month).padStart(2, '0')}`;
    return { start: `${ym}-01`, end: `${ym}-${last}` };
  }

  function leaseMonthKey(range) {
    return `${range.year}-${String(range.month).padStart(2, '0')}`;
  }

  function setLeaseDues(lz, list) {
    lz.dues = new Map(
      (list || []).map((d) => [d.region, { due: String(d.due || '').slice(0, 10), caseDue: String(d.caseDue || '').slice(0, 10), by: d.by || '', at: d.at || '' }])
    );
  }

  /** due＝清冊繳交日、caseDue＝案件繳交日 */
  const LEASE_DUE_KINDS = [
    { key: 'due', label: '清冊', icon: '📋' },
    { key: 'caseDue', label: '案件', icon: '📁' }
  ];

  async function saveLeaseDue(range, cellKey, value) {
    const lz = state.lease;
    if (!lz || lz.dueSaving) return;
    const [g, k] = cellKey.split('|');
    const cur = lz.dues.get(g) || {};
    if ((cur[k] || '') === (value || '')) {
      state.leaseDueCell = null;
      render();
      return;
    }
    const kind = LEASE_DUE_KINDS.find((x) => x.key === k);
    const dues = [{ region: g, due: k === 'due' ? value : cur.due || '', caseDue: k === 'caseDue' ? value : cur.caseDue || '' }];
    lz.dueSaving = cellKey;
    render();
    try {
      const res = await window.skyfunAuth.rpc('admin_points_lease_due_set', { p_token: token(), p_month: leaseMonthKey(range), p_dues: dues });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      setLeaseDues(lz, res.dues);
      lz.dueError = '';
      state.leaseDueCell = null;
      setMsg(`${g} ${range.month} 月${kind?.label || ''}繳交日${value ? '已儲存' : '已清除'}。`, 'ok');
    } catch (e) {
      setMsg(`繳交日沒有存到：${e.message || e}`, 'err');
    }
    lz.dueSaving = false;
    render();
  }

  /** 清冊進度：每月各地區要完成的表單（key 與資料庫 admin_points_roster_progress.item 相同） */
  const ROSTER_ITEMS = [
    { key: 'f4', label: '表4' },
    { key: 'f7', label: '表7' },
    { key: 'f9', label: '表9' },
    { key: 'f8', label: '表8' },
    { key: 'f10', label: '表10' },
    { key: 'f11', label: '表11' },
    { key: 'f12', label: '表12' },
    { key: 'f13', label: '表13' },
    { key: 'escrow', label: '租押金專戶' },
    { key: 'att6', label: '附表單6 教育訓練' }
  ];

  const CHECKLIST_PERIODS = [
    { key: '4', label: '4期' },
    { key: '4-1', label: '4-1期' },
    { key: '5', label: '5期' }
  ];

  /** progress 的 key：地區|期別|表單 */
  function setRosterProgress(lz, list) {
    lz.progress = new Map((list || []).map((p) => [`${p.region}|${p.period}|${p.item}`, { by: p.by || '', at: p.at || '' }]));
    lz.progError = '';
  }

  const rosterDone = (lz, g, period) => ROSTER_ITEMS.filter((it) => lz.progress.has(`${g}|${period}|${it.key}`)).length;

  async function saveRosterProgress(range, cellKey, done) {
    const lz = state.lease;
    if (!lz || lz.progSaving) return;
    const [region, period, item] = cellKey.split('|');
    lz.progSaving = cellKey;
    render();
    try {
      const res = await window.skyfunAuth.rpc('admin_points_roster_progress_set', { p_token: token(), p_month: leaseMonthKey(range), p_region: region, p_period: period, p_item: item, p_done: done });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      setRosterProgress(lz, res.items);
      setMsg('');
    } catch (e) {
      setMsg(`清冊進度沒有存到：${e.message || e}`, 'err');
    }
    lz.progSaving = '';
    render();
  }

  /** 繳交日格子（點了改成日期輸入框）：清冊／案件繳交日共用 */
  function leaseDueCellHtml(lz, g, k, label) {
    const key = `${g}|${k}`;
    const value = lz.dues.get(g)?.[k] || '';
    const name = `${g}${label}繳交日`;
    if (lz.dueSaving === key) return '<span class="apt-lease-due-none">儲存中…</span>';
    if (state.leaseDueCell === key) {
      return `<span class="apt-lease-due-editing">
          <input type="date" data-lease-due-input="${esc(key)}" value="${esc(value)}" aria-label="${esc(name)}" />
          ${value ? `<button type="button" class="apt-lease-due-clear" data-lease-due-clear="${esc(key)}" title="清除" aria-label="清除${esc(name)}">✕</button>` : ''}
        </span>`;
    }
    let shown = '<span class="apt-lease-due-none">未填</span>';
    if (value) {
      const wd = '日一二三四五六'[new Date(`${value}T00:00:00`).getDay()];
      shown = `<b class="${value < Core.isoDate(new Date()) ? 'is-past' : ''}">${value.slice(5).replace('-', '/')}（${wd}）</b>`;
    }
    return `<button type="button" class="apt-lease-due-cell" data-lease-due-cell="${esc(key)}" title="點擊修改${esc(name)}"${lz.dueSaving ? ' disabled' : ''}>${shown}<i aria-hidden="true">✏️</i></button>`;
  }

  function openLeaseDueCell(cellKey) {
    state.leaseDueCell = cellKey;
    render();
    const input = document.querySelector(`[data-lease-due-input="${CSS.escape(cellKey)}"]`);
    if (!input) return;
    input.focus();
    try { input.showPicker?.(); } catch { /* 部分瀏覽器需使用者手勢才可開啟 */ }
  }

  /** 包租案件有包租、轉租兩張合約：同縣市同租賃地址只算一件（已打勾的那張優先），其他張的媒合編號記在 sameAddr */
  function dedupeLeaseRows(rows, checks) {
    const keyOf = (r) => {
      const a = String(r.address || '').normalize('NFKC').replace(/\s+/g, '').replace(/臺/g, '台');
      return a ? `${String(r.city || '').replace(/臺/g, '台')}|${a}` : `#${r.id}`;
    };
    const out = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = out.get(k);
      if (!cur) out.set(k, { ...r, sameAddr: [] });
      else if (checks.has(String(r.id)) && !checks.has(String(cur.id))) out.set(k, { ...r, sameAddr: [...cur.sameAddr, cur.no || ''] });
      else cur.sameAddr.push(r.no || '');
    }
    return [...out.values()];
  }

  async function loadLease(range) {
    const lz = { key: `${range.year}-${range.month}`, loading: true, rows: [], checks: new Map(), saving: '', dues: new Map(), dueSaving: false, progress: new Map(), progSaving: '' };
    state.lease = lz;
    const { start, end } = leaseMonth(range);
    try {
      const [data, ck, dues, prog] = await Promise.all([
        fetchWorker('/admin-points/lease-starts', '應繳案件', { start, end }),
        window.skyfunAuth.rpc('admin_points_lease_checks', { p_token: token(), p_start: start, p_end: end }),
        window.skyfunAuth.rpc('admin_points_lease_dues', { p_token: token(), p_month: leaseMonthKey(range) }).catch((e) => ({ ok: false, error: String(e.message || e) })),
        window.skyfunAuth.rpc('admin_points_roster_progress', { p_token: token(), p_month: leaseMonthKey(range) }).catch((e) => ({ ok: false, error: String(e.message || e) }))
      ]);
      if (!ck?.ok) throw new Error(ck?.error || '繳交打勾紀錄讀取失敗');
      if (dues?.ok) setLeaseDues(lz, dues.dues);
      else lz.dueError = dues?.error || '繳交日讀取失敗';
      if (prog?.ok) setRosterProgress(lz, prog.items);
      else lz.progError = prog?.error || '清冊進度讀取失敗';
      lz.checks = new Map((ck.checks || []).map((c) => [String(c.id), c]));
      lz.offices = data.offices || [];
      lz.rows = dedupeLeaseRows(Core.rowsFromPayload(data), lz.checks).sort((a, b) => (a.leaseStart < b.leaseStart ? -1 : a.leaseStart > b.leaseStart ? 1 : 0));
    } catch (e) {
      lz.error = String(e.message || e);
    }
    lz.loading = false;
    if (state.lease === lz && isWeeklyTab()) render();
  }

  async function putLeaseCheck(lz, row, checked) {
    const id = String(row.id);
    const res = await window.skyfunAuth.rpc('admin_points_lease_check', {
      p_token: token(),
      p_id: id,
      p_no: row.no || '',
      p_region: row.region || '',
      p_lease_start: row.leaseStart || null,
      p_checked: checked
    });
    if (!res?.ok) throw new Error(res?.error || '儲存失敗');
    if (checked) lz.checks.set(id, { id, by: res.by, at: res.at });
    else lz.checks.delete(id);
  }

  async function saveLeaseCheck(id, checked) {
    const lz = state.lease;
    const row = lz?.rows.find((r) => String(r.id) === id);
    if (!row || lz.saving) return;
    lz.saving = id;
    render();
    try {
      await putLeaseCheck(lz, row, checked);
      setMsg('');
    } catch (e) {
      setMsg(`繳交打勾沒有存到：${e.message || e}`, 'err');
    }
    lz.saving = '';
    render();
  }

  /** 一鍵打勾／一鍵取消：逐件存（同單件打勾），中途失敗就停，已存的保留 */
  async function saveLeaseCheckAll(ids, checked = true) {
    const lz = state.lease;
    if (!lz || lz.saving) return;
    const rows = ids.map((id) => lz.rows.find((r) => String(r.id) === id)).filter((r) => r && lz.checks.has(String(r.id)) !== checked);
    if (!rows.length) return;
    const verb = checked ? '打勾' : '取消打勾';
    if (!window.confirm(checked ? `把這 ${rows.length} 件全部打勾為「已繳」？會記錄你是打勾人員。` : `把這 ${rows.length} 件全部取消打勾、改回「未繳」？原本的打勾人員與時間會清掉。`)) return;
    let done = 0;
    let err = '';
    lz.bulkMode = checked ? 'check' : 'clear';
    for (const row of rows) {
      lz.saving = String(row.id);
      lz.bulk = `${done}／${rows.length}`;
      render();
      try {
        await putLeaseCheck(lz, row, checked);
        done++;
      } catch (e) {
        err = String(e.message || e);
        break;
      }
    }
    lz.saving = '';
    lz.bulk = '';
    lz.bulkMode = '';
    if (err) setMsg(`一鍵${verb}只存到 ${done}／${rows.length} 件：${err}`, 'err');
    else setMsg(checked ? `已把 ${done} 件打勾為已繳。` : `已把 ${done} 件取消打勾，改回未繳。`, 'ok');
    render();
  }

  /** 全部組長＝本業績月全區；選了組長＝可選週次，各地區一個圓環，點地區打勾（明細插在該列卡片下方） */
  function leaseSection(range, scope) {
    const CH = window.AdminPointsCharts;
    const regions = scope ? scopeRegions(scope) : ['全區'];
    if (state.lease?.key !== `${range.year}-${range.month}`) loadLease(range).catch((e) => console.warn('應繳件數', e));
    const lz = state.lease;
    const short = (d) => d.slice(5).replace('-', '/');
    const period = leaseMonth(range);
    const periodText = `${range.month} 月 ${short(period.start)}～${short(period.end)}`;
    const inPeriod = (r) => period && r.leaseStart >= period.start && r.leaseStart <= period.end;
    const rowsOf = (list) => (lz?.rows || []).filter((r) => inPeriod(r) && (!list || list.includes(r.region)));
    const stat = (rows) => {
      const paid = rows.filter((r) => lz.checks.has(String(r.id))).length;
      return { due: rows.length, paid, rate: rows.length ? paid / rows.length : null };
    };
    const tone = (rate) => (rate == null ? C_ALL : rate >= 1 ? '#16a34a' : rate >= 0.9 ? '#f59e0b' : '#dc2626');
    const ring = (x) =>
      CH.donut({ value: x.rate == null ? null : x.rate * 100, text: x.rate == null ? '-' : x.rate >= 1 ? '100%' : `${(x.rate * 100).toFixed(1)}%`, sub: '目標 100%', color: tone(x.rate) });
    const metaOf = (x) => (x.due ? `已繳 <b>${x.paid}</b>／應繳 <b>${x.due}</b> 件${x.due > x.paid ? `・未繳 <b class="apt-bad">${x.due - x.paid}</b>` : ''}` : '這段期間沒有應繳案件');
    const card = (label, x, note, attrs, active) => `<${attrs ? 'button type="button"' : 'div'} class="apt-gauge${attrs ? ' apt-gauge--pick' : ' apt-gauge--wide'}${active ? ' is-active' : ''}"${attrs || ''}>
        <span class="apt-gauge-ring">${ring(x)}</span>
        <span class="apt-gauge-text">
          <span class="apt-gauge-label">${label}</span>
          <span class="apt-gauge-meta">${metaOf(x)}</span>
          <small>${note}</small>
        </span>
      </${attrs ? 'button' : 'div'}>`;
    const areaName = scope ? scopeLabel(scope) : '';
    const byOffice = !!(scope && state.tab === 'area' && scope.offices);
    const unit = byOffice ? '營業處' : '地區';
    const title = `<h4 class="apt-sec-title">應繳件數・繳交率<small>${scope ? `${esc(areaName)} · ${range.month} 月整月，點${unit}看明細並打勾` : `全區 · 點上方${state.tab === 'area' ? '區主管' : '組長'}可看各${state.tab === 'area' ? '營業處' : '地區'}明細並打勾`}</small>${LEASE_FOLD_BTN}</h4>`;
    const notes = `<p class="apt-sub-note">應繳＝起租日落在當月的已生效合約，依物件縣市分區；包租案件的包租、轉租兩張合約同地址，只算一件。${byOffice ? `營業處＝該案在媒合管理的「代管營業處」，不是審核人的營業處；只算這一區的營業處，業務支援管理部等公司部門合併為「公司」，沒有應繳的營業處不列。` : ''}繳交率＝已打勾件數 ÷ 應繳件數。以日曆月計（1 號～月底，不是業績月）。</p>`;
    if (!lz || lz.loading) return `${title}<p class="apt-sub-note apt-loading">讀取應繳案件中…</p>`;
    if (lz.error) return `${title}<p class="apt-bad">應繳案件讀取失敗：${esc(lz.error)}</p>`;
    if (!scope) return `${title}<div class="apt-gauges">${card(`全區 ${range.month} 月應繳件數`, stat(rowsOf(null)), periodText)}</div>${notes}`;

    const dueOf = (g, k) => lz.dues.get(g)?.[k] || '';
    const dueCell = (g) =>
      LEASE_DUE_KINDS.filter((k) => k.key === 'caseDue')
        .map((k) => `<span class="apt-lease-rg-due apt-lease-rg-due--${k.key}"><small>${k.icon} ${k.label}繳交日</small>${leaseDueCellHtml(lz, g, k.key, k.label)}</span>`)
        .join('');
    const og = byOffice ? leaseOfficeGroups(rowsOf(regions), scope.leader) : null;
    const groups = og?.groups || regions.map((g) => ({ key: g, rows: rowsOf([g]) }));
    if (state.leaseRegion && !groups.some((g) => g.key === state.leaseRegion)) state.leaseRegion = '';
    const open = state.leaseRegion;
    const openGroup = groups.find((g) => g.key === open);
    const cols = Math.max(1, groups.length <= 4 ? groups.length : Math.ceil(groups.length / 2));
    const tileList = groups.map(
        (g) => `<div class="apt-lease-rg${open === g.key ? ' is-active' : ''}">
          <button type="button" class="apt-lease-rg-pick" data-lease-region="${esc(g.key)}" aria-expanded="${open === g.key}">
            <span class="apt-lease-rg-ring">${ring(stat(g.rows))}</span><b>${esc(g.key)}</b>
            ${byOffice ? `<small class="apt-lease-rg-count">應繳 ${g.rows.length} 件</small>` : ''}
            <i class="apt-lease-rg-chev" aria-hidden="true"></i>
          </button>
          ${byOffice ? '' : `<span class="apt-lease-rg-dues">${dueCell(g.key)}</span>`}
        </div>`
      );
    const officeNote = og?.error ? `<p class="apt-bad">讀不到代管營業處，先依縣市顯示：${esc(og.error)}</p>` : '';
    const dueStrip = byOffice
      ? `<div class="apt-lease-duestrip">${regions.map((g) => `<div class="apt-lease-duestrip-item"><b>${esc(g)}</b>${dueCell(g)}</div>`).join('')}</div>`
      : '';
    const total = stat(og?.rows || rowsOf(regions));
    const detailMeta = (g) =>
      `${metaOf(stat(g.rows))}${byOffice ? '' : LEASE_DUE_KINDS.map((k) => `・${k.label}繳交日 ${dueOf(g.key, k.key) ? `<b>${short(dueOf(g.key, k.key))}</b>` : '未填'}`).join('')}`;
    if (openGroup) {
      const i = groups.indexOf(openGroup);
      const rowEnd = Math.min(groups.length, (Math.floor(i / cols) + 1) * cols);
      const caret = (((i % cols) + 0.5) / cols) * 100;
      tileList.splice(
        rowEnd,
        0,
        `<div class="apt-lease-inline" style="--caret:${caret.toFixed(2)}%">${leaseDetail(openGroup.key, openGroup.rows, periodText, detailMeta(openGroup))}</div>`
      );
    }
    const regionTiles = tileList.join('') || `<p class="apt-empty">${byOffice ? '這個月沒有應繳案件' : '沒有營業處'}</p>`;
    const html = `${title}
      <div class="apt-lease-total">
        <div class="apt-lease-total-row">
        <div class="apt-gauge apt-lease-total-head">
          <span class="apt-gauge-ring">${ring(total)}</span>
          <span class="apt-gauge-text">
            <span class="apt-gauge-label">${esc(areaName || `${scope.leader} 組`)}合計</span>
            <span class="apt-gauge-meta">${metaOf(total)}</span>
            <small>${periodText} · 含 ${esc(regions.join('・'))}</small>
          </span>
        </div>
        <div class="apt-lease-regions${byOffice ? ' apt-lease-regions--office' : ''}" data-lease-grid style="grid-template-columns:repeat(${cols}, minmax(0, 1fr))">${regionTiles}</div>
        </div>
        ${officeNote}${dueStrip}
      </div>
      ${notes}`;
    return html;
  }

  const LEASE_FOLD_BTN = '<button type="button" class="apt-fold-btn" data-lease-fold aria-expanded="true" title="收起應繳件數與繳交日">收起 ▴</button>';

  /** 應繳件數＋繳交日收起時：一行摘要（整月） */
  function leaseFoldedStrip(range, scope) {
    if (state.lease?.key !== `${range.year}-${range.month}`) loadLease(range).catch((e) => console.warn('應繳件數', e));
    const lz = state.lease;
    let chips = '<span class="apt-fold-chip">讀取中…</span>';
    if (lz && !lz.loading && !lz.error) {
      const regions = scope ? scopeRegions(scope) : null;
      const m = leaseMonth(range);
      let rows = (lz.rows || []).filter((r) => r.leaseStart >= m.start && r.leaseStart <= m.end && (!regions || regions.includes(r.region)));
      if (scope && state.tab === 'area' && scope.offices && rows.some((r) => r.office)) rows = areaOwnRows(rows, scope.leader);
      const paid = rows.filter((r) => lz.checks.has(String(r.id))).length;
      const rate = rows.length ? paid / rows.length : null;
      const dueRegions = regions || Core.kpiRegionsOfAreas(['北區', '中區', '南區']);
      chips = `<span class="apt-fold-chip">📮 繳交率 <b class="${rate == null ? '' : rate >= 1 ? 'is-good' : 'is-bad'}">${rate == null ? '-' : `${(rate * 100).toFixed(1)}%`}</b>（已繳 ${paid}／應繳 ${rows.length}）</span>
        ${LEASE_DUE_KINDS.map((k) => {
          const filled = dueRegions.filter((g) => lz.dues.get(g)?.[k.key]).length;
          return `<span class="apt-fold-chip">${k.icon} ${k.label}繳交日 已填 <b class="${filled === dueRegions.length ? 'is-good' : 'is-bad'}">${filled}／${dueRegions.length}</b></span>`;
        }).join('')}`;
      if (regions) {
        const all = regions.length * ROSTER_ITEMS.length * CHECKLIST_PERIODS.length;
        const done = regions.reduce((s, g) => s + CHECKLIST_PERIODS.reduce((t, p) => t + rosterDone(lz, g, p.key), 0), 0);
        chips += `<span class="apt-fold-chip">✅ 清冊進度 <b class="${done === all ? 'is-good' : 'is-bad'}">${done}／${all}</b></span>`;
      }
    }
    return `<section class="apt-block apt-block--lease apt-block--folded">
        <h4 class="apt-sec-title">應繳件數・繳交日<small>${scope ? esc(scopeLabel(scope)) : '全區'} · ${range.month} 月</small>
          <span class="apt-fold-chips">${chips}</span>
          <button type="button" class="apt-fold-btn" data-lease-fold aria-expanded="false">展開 ▾</button></h4>
      </section>`;
  }

  /** 應繳件數右邊：各地區本月的清冊／案件繳交日（行政手填）；scope＝null 為全區，依北中南分組（areaGroups 可改分組） */
  function leaseDueSection(range, scope, areaGroups) {
    const groups = (scope
      ? [{ area: '', list: scopeRegions(scope) }]
      : areaGroups || ['北區', '中區', '南區'].map((a) => ({ area: a, list: Core.kpiRegionsOfAreas([a]) }))
    ).filter((x) => x.list.length);
    const regions = groups.flatMap((x) => x.list);
    const lz = state.lease;
    const title = `<h4 class="apt-sec-title">清冊／案件繳交日<small>${scope ? '' : '全區 · '}${range.month} 月 · 各地區行政手填</small>${LEASE_FOLD_BTN}</h4>`;
    if (!lz || lz.loading) return `${title}<p class="apt-sub-note apt-loading">讀取中…</p>`;
    if (!regions.length) return `${title}<p class="apt-empty">這組對不到地區</p>`;
    lz.dueRegions = regions;
    const dueOf = (g, k) => lz.dues.get(g)?.[k] || '';
    const cell = (g, k, label) => leaseDueCellHtml(lz, g, k, label);
    const kind = LEASE_DUE_KINDS.find((k) => k.key === state.leaseDueKind) || LEASE_DUE_KINDS[0];
    const kinds = `<div class="apt-lease-due-kinds" role="tablist" aria-label="繳交日種類">${LEASE_DUE_KINDS.map((k) => {
      const on = k.key === kind.key;
      const filled = regions.filter((g) => dueOf(g, k.key)).length;
      return `<button type="button" role="tab" class="apt-lease-due-kind apt-lease-due-kind--${k.key}${on ? ' is-on' : ''}" data-lease-due-kind="${k.key}" aria-selected="${on}">${k.icon} ${k.label}繳交日<small>已填 ${filled}／${regions.length}</small></button>`;
    }).join('')}</div>`;
    const item = (g) => `<li${state.leaseRegion === g ? ' class="is-active"' : ''}><b>${esc(g)}</b>${cell(g, kind.key, kind.label)}</li>`;
    /** 各區排成同樣列數（地區多的區分成多欄），三區高度一致、不留白 */
    const rowsPer = scope ? Math.ceil(regions.length / (regions.length > 4 ? 2 : 1)) : Math.max(1, Math.ceil(Math.max(...groups.map((x) => x.list.length)) / 2));
    const colsOf = (n) => Math.max(1, Math.ceil(n / rowsPer));
    const listOf = (list, rows = rowsPer) =>
      `<ul class="apt-lease-due-list" style="--cols:${colsOf(list.length)};--rows:${rows}">${list.map(item).join('')}</ul>`;
    /** 只有一兩個地區的區（南區、高雄）疊在同一欄，其他區的欄位才夠寬 */
    const stacks = [];
    for (const x of groups) {
      const last = stacks[stacks.length - 1];
      const single = (y) => colsOf(y.list.length) === 1;
      if (last && single(x) && last.every(single) && last.reduce((s, y) => s + y.list.length, 0) + x.list.length <= rowsPer) last.push(x);
      else stacks.push([x]);
    }
    const areaCard = (x, rows) =>
      `<div class="apt-lease-due-area apt-lease-due-group--${AREA_TONE[x.area] || 'none'}"><h5>${esc(x.area)}<small>${x.list.length} 區</small></h5>${listOf(x.list, rows)}</div>`;
    const tables = scope
      ? listOf(regions)
      : `<div class="apt-lease-due-areas" style="grid-template-columns:${stacks.map((st) => `minmax(0, ${Math.max(...st.map((x) => colsOf(x.list.length)))}fr)`).join(' ')}">${stacks
          .map((st) => (st.length === 1 ? areaCard(st[0], rowsPer) : `<div class="apt-lease-due-stack">${st.map((x) => areaCard(x, x.list.length)).join('')}</div>`))
          .join('')}</div>`;
    const lastSet = [...lz.dues.values()].filter((d) => d.by).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    return `${title}
      ${kinds}
      <div class="apt-lease-due-box apt-lease-due-box--${kind.key}${state.leaseDueCell ? ' is-editing' : ''}">
        <div class="apt-lease-due-body" role="tabpanel">${tables}</div>
        <div class="apt-lease-due-foot">
          <small>點日期即可修改，選好自動儲存（Esc 取消）。${lastSet ? `最後由 ${esc(lastSet.by)} 更新` : '還沒有人填寫'}</small>
        </div>
        ${lz.dueError ? `<p class="apt-bad">繳交日讀取失敗：${esc(lz.dueError)}</p>` : ''}
      </div>`;
  }

  /**
   * 選了組長／區主管時，應繳件數右邊改成清冊進度：先看各地區圓環（三期合計）＋清冊繳交日，
   * 點地區再看該地區各期的圓環與表單打勾（表單 × 期別）
   */
  function rosterProgressSection(range, scope) {
    const CH = window.AdminPointsCharts;
    const regions = scopeRegions(scope);
    const lz = state.lease;
    const title = `<h4 class="apt-sec-title">清冊進度<small>${range.month} 月 · ${state.rosterRegion ? '完成請在後面打勾' : '點地區看各期並打勾'}</small>${LEASE_FOLD_BTN}</h4>`;
    if (!lz || lz.loading) return `${title}<p class="apt-sub-note apt-loading">讀取中…</p>`;
    if (!regions.length) return `${title}<p class="apt-empty">這組對不到地區</p>`;
    if (state.rosterRegion && !regions.includes(state.rosterRegion)) state.rosterRegion = '';
    const when = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${Core.isoDate(d).slice(5).replace('-', '/')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    };
    const per = ROSTER_ITEMS.length;
    const allOf = CHECKLIST_PERIODS.length * per;
    const doneAll = (g) => CHECKLIST_PERIODS.reduce((s, p) => s + rosterDone(lz, g, p.key), 0);
    const tone = (rate) => (rate >= 1 ? '#16a34a' : rate >= 0.5 ? '#0d9488' : rate > 0 ? '#f59e0b' : C_ALL);
    const ring = (done, all, sub) => CH.donut({ value: (done / all) * 100, text: `${done}／${all}`, sub, color: tone(done / all) });
    const dueCell = (g) => `<span class="apt-lease-rg-due apt-lease-rg-due--due"><small>📋 清冊繳交日</small>${leaseDueCellHtml(lz, g, 'due', '清冊')}</span>`;
    const lastOf = (list) => [...lz.progress.entries()].filter(([k]) => list.includes(k.split('|')[0])).map(([, v]) => v).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    const err = lz.progError ? `<p class="apt-bad">清冊進度讀取失敗：${esc(lz.progError)}</p>` : '';
    const g = state.rosterRegion;

    if (!g) {
      const tiles = regions
        .map((r) => {
          const n = doneAll(r);
          return `<div class="apt-lease-rg apt-roster-rg">
            <button type="button" class="apt-lease-rg-pick" data-roster-region="${esc(r)}" title="看${esc(r)}各期清冊進度並打勾">
              <span class="apt-lease-rg-ring">${ring(n, allOf, '完成')}</span><b>${esc(r)}</b>
              <span class="apt-roster-rg-pers">${CHECKLIST_PERIODS.map((p) => {
                const d = rosterDone(lz, r, p.key);
                return `<i class="${d === per ? 'is-good' : ''}">${p.label} ${d}／${per}</i>`;
              }).join('')}</span>
            </button>
            <span class="apt-lease-rg-dues">${dueCell(r)}</span>
          </div>`;
        })
        .join('');
      const done = regions.reduce((s, r) => s + doneAll(r), 0);
      const last = lastOf(regions);
      return `${title}
        <div class="apt-lease-due-box apt-roster-box">
          <div class="apt-lease-regions apt-roster-regions" style="grid-template-columns:repeat(${regions.length <= 4 ? regions.length : Math.ceil(regions.length / 2)}, minmax(0, 1fr))">${tiles}</div>
          <div class="apt-lease-due-foot">
            <small>圓環＝4期、4-1期、5期合計完成項數；共完成 <b>${done}／${regions.length * allOf}</b>。點地區看各期並打勾，清冊繳交日點日期即可修改。${last ? `最後由 ${esc(last.by)} 更新` : '還沒有人打勾'}</small>
          </div>
          ${err}
        </div>`;
    }

    const head = CHECKLIST_PERIODS.map((p) => {
      const d = rosterDone(lz, g, p.key);
      return `<div class="apt-roster-per${d === per ? ' is-good' : ''}"><span class="apt-roster-per-ring">${ring(d, per, '完成')}</span><b>${esc(p.label)}</b></div>`;
    }).join('');
    const body = ROSTER_ITEMS.map((it) => {
      const cells = CHECKLIST_PERIODS.map((p) => {
        const key = `${g}|${p.key}|${it.key}`;
        const x = lz.progress.get(key);
        const busy = lz.progSaving === key;
        const tip = x ? `${x.by || ''} ${when(x.at)} 打勾` : `${g} ${p.label} ${it.label} 未完成`;
        return `<td class="${x ? 'is-done' : ''}"><label class="apt-roster-tick" title="${esc(tip)}"><input type="checkbox" data-roster-check="${esc(key)}"${x ? ' checked' : ''}${lz.progSaving ? ' disabled' : ''} aria-label="${esc(`${g} ${p.label} ${it.label}`)}" />${busy ? '<small>儲存中…</small>' : ''}</label></td>`;
      }).join('');
      return `<tr><th>${esc(it.label)}</th>${cells}</tr>`;
    }).join('');
    const last = lastOf([g]);
    return `${title}
      <div class="apt-lease-due-box apt-roster-box">
        <div class="apt-roster-detail-head">
          <button type="button" class="apt-btn-lite" data-roster-region="">← 全部地區</button>
          <b>${esc(g)}</b><small>三期合計 ${doneAll(g)}／${allOf}</small>
          ${dueCell(g)}
        </div>
        <div class="apt-roster-pers">${head}</div>
        <div class="apt-table-wrap"><table class="apt-roster-table">
          <thead><tr><th>表單</th>${CHECKLIST_PERIODS.map((p) => `<th><b>${esc(p.label)}</b><small class="${rosterDone(lz, g, p.key) === per ? 'is-good' : ''}">${rosterDone(lz, g, p.key)}／${per}</small></th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table></div>
        <div class="apt-lease-due-foot">
          <small>勾選即自動儲存，會記錄打勾人與時間（游標移到勾選框可看）。${last ? `最後由 ${esc(last.by)} 更新` : '還沒有人打勾'}</small>
        </div>
        ${err}
      </div>`;
  }

  function leaseDetail(region, rows, periodText, meta) {
    const lz = state.lease;
    const when = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return `${Core.isoDate(d).replace(/-/g, '/')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    };
    const body = rows
      .map((r) => {
        const id = String(r.id);
        const c = lz.checks.get(id);
        const busy = lz.saving === id;
        return `<tr class="${c ? 'is-paid' : ''}">
          <td><label class="apt-lease-tick"><input type="checkbox" data-lease-check="${esc(id)}"${c ? ' checked' : ''}${lz.saving ? ' disabled' : ''} />${busy ? '儲存中…' : c ? '已繳' : '未繳'}</label></td>
          <td>${esc(r.no || '')}${r.sameAddr?.length ? `<small class="apt-lease-same" title="同地址的其他合約（包租／轉租），只算一件">＋${esc(r.sameAddr.filter(Boolean).join('、') || `${r.sameAddr.length} 張`)}</small>` : ''}</td>
          <td class="apt-lease-addr">${esc(r.address || '')}</td>
          <td>${esc((r.leaseStart || '').replace(/-/g, '/'))}</td>
          <td>${c ? esc(c.by || '') : ''}</td>
          <td>${c ? esc(when(c.at)) : ''}</td>
        </tr>`;
      })
      .join('');
    const unpaid = rows.map((r) => String(r.id)).filter((id) => !lz.checks.has(id));
    const paid = rows.map((r) => String(r.id)).filter((id) => lz.checks.has(id));
    const tickBtn = unpaid.length
      ? `<button type="button" class="apt-lease-all" data-lease-all="${esc(unpaid.join(','))}"${lz.saving ? ' disabled' : ''}>${lz.bulk && lz.bulkMode === 'check' ? `打勾中 ${lz.bulk}…` : `✓ 一鍵全部打勾（${unpaid.length} 件未繳）`}</button>`
      : rows.length
        ? '<span class="apt-lease-alldone">✓ 全部已繳</span>'
        : '';
    const clearBtn = rows.length
      ? `<button type="button" class="apt-lease-clear" data-lease-clear="${esc(paid.join(','))}"${lz.saving || !paid.length ? ' disabled' : ''}${paid.length ? '' : ' title="還沒有打勾的案件"'}>${lz.bulk && lz.bulkMode === 'clear' ? `取消中 ${lz.bulk}…` : `✕ 一鍵全部取消（${paid.length} 件已繳）`}</button>`
      : '';
    const allBtn = tickBtn + clearBtn;
    const closeBtn = (cls) =>
      `<button type="button" class="${cls}" data-lease-region="${esc(region)}" aria-label="收起${esc(region)}明細">收起<i class="apt-lease-rg-chev is-up" aria-hidden="true"></i></button>`;
    return `<div class="apt-lease-detail">
        <div class="apt-lease-dhead">
          <div class="apt-lease-dtitle">
            <b>${esc(region)}</b>
            <span class="apt-lease-detail-meta">${meta || ''}</span>
            <small>${periodText} · 打勾＝已繳交，會記錄打勾人員與時間</small>
          </div>
          <div class="apt-lease-dactions">${allBtn}${closeBtn('apt-lease-close')}</div>
        </div>
        <div class="apt-table-wrap"><table class="apt-table apt-lease-table">
          <thead><tr><th>繳交</th><th>媒合編號</th><th>地址</th><th>起租日</th><th>打勾人員</th><th>打勾日期</th></tr></thead>
          <tbody>${body || '<tr><td colspan="6" class="apt-empty">這段期間沒有應繳案件</td></tr>'}</tbody>
        </table></div>
        ${rows.length > 8 ? `<div class="apt-lease-dfoot">${closeBtn('apt-lease-close apt-lease-close--foot')}</div>` : ''}
      </div>`;
  }

  /** 個人績效：內部良率看自己的抽查；公會審件／清冊依合約「複審通過」的審核者算到個人 */
  function personGauges(range, name) {
    const st = (state.sb?.staff || []).find((s) => s.name === name);
    const region = Core.kpiRegionOfStaff(st?.region);
    return `<h4 class="apt-sec-title">本月品質良率<small>內部審件良率是自己的抽查結果；公會審件／清冊良率依合約「複審通過」的審核者算到個人（審件＝我複審的起租案件，清冊＝表單04／09 裡我複審過的合約，退件／意見依媒合編號算）</small></h4>
      ${personQuality(range, name, region)}`;
  }

  const AREA_TONE = { 北區: 'north', 中區: 'mid', 南區: 'south', 高雄: 'kh', 東部及離島: 'east' };

  function areaPills(areas) {
    return areas.map((a) => `<i class="apt-area apt-area--${AREA_TONE[a] || 'east'}">${esc(a)}</i>`).join('');
  }

  /** 週報上方：選了組長→大卡顯示區域與管理縣市；全部組長→各組長一覽，點一下切換 */
  function leaderBanner(scope, all) {
    if (scope) {
      return `<div class="apt-leader-card apt-leader-card--${AREA_TONE[scope.areas?.[0]] || 'none'}">
          <div class="apt-leader-who">
            <span class="apt-leader-kicker">目前檢視組長</span>
            <b>${esc(scope.leader)}</b>
            <small>組員 ${scope.members} 人（在職、不含工讀生）</small>
          </div>
          <div class="apt-leader-scope">
            <div class="apt-leader-line"><span>負責區域</span>${scope.areas.length ? areaPills(scope.areas) : '<em>人力明細沒有部別</em>'}${scope.regions.length ? `<small>部別：${scope.regions.map(esc).join('、')}</small>` : ''}</div>
            <div class="apt-leader-line"><span>管理縣市</span><span class="apt-leader-cities">${scope.cities.length ? scope.cities.map((c) => `<i>${esc(c)}</i>`).join('') : '<em>-</em>'}</span></div>
          </div>
          <button type="button" class="apt-btn-lite" data-pick-leader="">看全部組長</button>
        </div>`;
    }
    if (!all.length) return '';
    return `<div class="apt-leader-list" style="--n:${all.length}">
        ${all
          .map(
            (x) => `<button type="button" class="apt-leader-chip apt-leader-chip--${AREA_TONE[x.areas[0]] || 'none'}" data-pick-leader="${esc(x.leader)}">
              <b>${esc(x.leader)}</b>${areaPills(x.areas)}<small>${x.cities.length ? x.cities.map(esc).join('、') : '未設定部別'}</small>
            </button>`
          )
          .join('')}
      </div>`;
  }

  const SPOT_NODES = [
    { key: 'obj', label: '物審' },
    { key: 'tenant', label: '房客' },
    { key: 'pre', label: '預審' }
  ];
  const SPOT_NODE = new Map(SPOT_NODES.map((n) => [n.key, n.label]));
  const SPOT_REPAIR = '修繕審核';
  const SPOT_TERM = '解約審核';
  const EXPENSE_TYPE = { 0: '修繕', 1: '保險費', 3: '房東公證費', 4: '房客公證費', 5: '業者公證費' };

  /** 星鴻審核單件網址（抽查用）：物件／房客走審核頁，修繕走補助申請檢視頁 */
  function spotCaseUrl(row) {
    if (row?.repair) {
      const id = row.id;
      if (id == null || id === '') return '';
      return `https://skyfunsystem.com/Expenses/ExpensesApplication?id=${encodeURIComponent(id)}&mode=view`;
    }
    const id = row?.targetId;
    if (id == null || id === '') return '';
    const q = encodeURIComponent(id);
    if (row.type === 'object') return `https://skyfunsystem.com/Audit/Audit_Object?id=${q}`;
    if (row.type === 'tenant') return `https://skyfunsystem.com/Audit/Audit_Tenant?id=${q}`;
    if (row.type === 'contract') return `https://skyfunsystem.com/Audit/Audit_Contrat?id=${q}`;
    return '';
  }

  /** 已存名單也可能是舊網址；依 key／節點重算，讓「複製網址」一定指到審核頁 */
  function spotItemUrl(item) {
    if (!item) return '';
    const key = String(item.key || '');
    const m = key.match(/^([eat]):(.+)$/);
    if (m) {
      const kind = m[1];
      const id = encodeURIComponent(m[2]);
      if (kind === 'e') return `https://skyfunsystem.com/Expenses/ExpensesApplication?id=${id}&mode=view`;
      if (kind === 't') return `https://skyfunsystem.com/Audit/Audit_Contrat?id=${id}`;
      const node = String(item.node || '');
      if (node === '物審') return `https://skyfunsystem.com/Audit/Audit_Object?id=${id}`;
      if (node === '房客') return `https://skyfunsystem.com/Audit/Audit_Tenant?id=${id}`;
      if (node === '預審' || node === SPOT_TERM || node.includes('解約')) {
        return `https://skyfunsystem.com/Audit/Audit_Contrat?id=${id}`;
      }
    }
    let u = String(item.url || '');
    if (!u) return '';
    u = u.replace('/Object/ObjectData?id=', '/Audit/Audit_Object?id=');
    u = u.replace('/Tenant/TenantData?id=', '/Audit/Audit_Tenant?id=');
    if (/\/Audit\/Audit_Expenses_Index\/?$/.test(u) && m) {
      return `https://skyfunsystem.com/Expenses/ExpensesApplication?id=${encodeURIComponent(m[2])}&mode=view`;
    }
    return u;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function randIndex(n) {
    if (window.crypto?.getRandomValues) {
      const a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function spotStaff() {
    return (state.sb?.staff || [])
      .filter((s) => Core.isOnDuty(s) && s.kind !== '工讀生' && s.leader === state.leader)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function spotLeaders() {
    return Core.spotLeadersFor(myName(), leaderOrder(state.sb?.staff));
  }

  /** 組長下拉順序：北→中→南（同 leaderScopes），沒有在職組員的組長排最後 */
  function leaderOrder(staff) {
    const byArea = Core.leaderScopes(staff || []).map((x) => x.leader);
    const rest = [...new Set((staff || []).map((s) => s.leader).filter(Boolean))]
      .filter((l) => !byArea.includes(l))
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return [...byArea, ...rest];
  }

  /** 今天已存的抽查名單（每天每組每個業績月一份，存在 Supabase） */
  async function loadSpotDraws() {
    const day = Core.isoDate(new Date());
    if (state.spotDraws?.day === day) return;
    state.spotDraws = { day, loading: true, list: [] };
    try {
      const res = await window.skyfunAuth.rpc('admin_points_spot_draws', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.spotDraws = { day, list: res.draws || [] };
    } catch (e) {
      state.spotDraws = { day, list: [], error: String(e.message || e) };
    }
    if (state.tab === 'spot') render();
  }

  /** 抽查日（每週固定兩天，後台可改）與每位組長本週進度 */
  async function loadSpotWeek() {
    const day = Core.isoDate(new Date());
    if (state.spotWeek?.day === day) return;
    state.spotWeek = { day, loading: true };
    try {
      const res = await window.skyfunAuth.rpc('admin_points_spot_week', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.spotWeek = { day, days: res.days || [], leaders: res.leaders || [] };
    } catch (e) {
      state.spotWeek = { day, error: String(e.message || e) };
    }
    if (state.tab === 'spot') render();
  }

  function spotWeekNote() {
    const w = state.spotWeek;
    if (!w || w.loading || w.error || !w.days?.length) return '';
    const names = ['一', '二', '三', '四', '五', '六', '日'];
    const dow = ((new Date().getDay() + 6) % 7) + 1;
    const dayText = w.days.map((d) => `週${names[d - 1]}`).join('、');
    const me = (w.leaders || []).find((x) => x.leader === state.leader);
    if (!me) return `<p class="apt-spot-week">每週抽查 ${w.days.length} 次：${esc(dayText)}。沒做完的組長每天 09:30 會收到 LINE 提醒。</p>`;
    const today = w.days.includes(dow) && !me.drawnToday;
    const behind = me.done < me.due;
    const tone = today || behind || me.unjudged ? 'is-todo' : 'is-done';
    const bits = [
      `本週已抽 <b>${me.done}</b> 次／到今天應抽 <b>${me.due}</b> 次`,
      today ? '<b>今天是抽查日</b>' : '',
      me.unjudged ? `還有 <b>${me.unjudged}</b> 件沒判定` : ''
    ].filter(Boolean);
    return `<p class="apt-spot-week ${tone}">每週抽查 ${w.days.length} 次（${esc(dayText)}）· ${bits.join(' · ')}${tone === 'is-done' ? ' · 本週進度 ✓' : ''}<small>沒做完每天 09:30 會用 LINE 提醒組長</small></p>`;
  }

  function currentSpot() {
    if (state.spot && state.spot.leader === state.leader) return state.spot;
    const d = (state.spotDraws?.list || []).find((x) => x.leader === state.leader && x.month === state.monthKey);
    return d ? { leader: d.leader, items: d.items || [], missing: d.missing || [], createdBy: d.createdBy, createdAt: d.createdAt, saved: true } : null;
  }

  /**
   * 所選組長底下每位在職行政，各從「前一天」的物審／房客／預審／修繕審核／解約審核抽一件。
   * 前一天＝今天以前、這組最近一個有審核紀錄的日子（週一沒有週日紀錄時就是上週五）。
   */
  async function drawSpot() {
    if (!state.leader) {
      setMsg('請先選組長。', 'warn');
      return;
    }
    if (currentSpot()?.saved && !window.confirm('今天這組已經抽過了，重新抽會換掉今天的名單（已判定的結果仍會留在抽查紀錄）。確定要重抽？')) return;
    const range = state.meta?.range;
    const today = Core.isoDate(new Date());
    const inRange = (r) => range && r.date >= range.start && r.date <= range.end && r.date < today;
    const team = spotStaff();
    const pools = team.map((person) => {
      const mine = (r) => String(r.auditor || '').trim() === person.name;
      const audits = (state.auditRows || []).filter((r) => inRange(r) && mine(r) && SPOT_NODE.has(Core.durationNode(r)));
      const repairs = (state.expenseRows || []).filter((r) => inRange(r) && mine(r)).map((r) => ({ ...r, repair: true }));
      const terms = (state.termRows || []).filter((r) => inRange(r) && mine(r)).map((r) => ({ ...r, type: 'contract', targetId: r.id, term: true }));
      return { person, pool: [...audits, ...repairs, ...terms] };
    });
    const day = pools.flatMap((p) => p.pool.map((r) => r.date)).sort().pop();
    if (!day) {
      setMsg('這組在這個業績月、今天以前沒有物審、房客、預審、修繕審核或解約審核紀錄，沒有可以抽的案件（業績月第一天請切到上個業績月抽）。', 'warn');
      return;
    }
    const items = [];
    const missing = [];
    pools.forEach(({ person, pool: all }) => {
      const pool = all.filter((r) => r.date === day);
      if (!pool.length) {
        missing.push(person.name);
        return;
      }
      const row = pool[randIndex(pool.length)];
      const kind = row.repair ? EXPENSE_TYPE[row.type] : row.term ? `${String(row.contractType || '').trim()}解約` : '';
      items.push({
        key: `${row.repair ? 'e' : row.term ? 't' : 'a'}:${row.id}`,
        date: row.date,
        name: person.name,
        node: row.repair ? SPOT_REPAIR : row.term ? SPOT_TERM : SPOT_NODE.get(Core.durationNode(row)),
        caseName: [kind && kind !== '修繕' ? kind : '', String(row.name || '').trim()].filter(Boolean).join(' · '),
        no: String(row.no || '').trim(),
        time: row.repair ? row.date.replace(/-/g, '/') : String(row.time || '').replace('T', ' ').slice(0, 16),
        url: spotCaseUrl(row),
        search: false
      });
    });
    const leader = state.leader;
    const month = state.monthKey;
    state.spot = { leader, items, missing, saving: true };
    state.spotEdit = {};
    render();
    try {
      const res = await window.skyfunAuth.rpc('admin_points_spot_draw_save', {
        p_token: token(),
        p_month: month,
        p_leader: leader,
        p_items: items,
        p_missing: missing
      });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      const list = (state.spotDraws?.list || []).filter((x) => !(x.leader === leader && x.month === month));
      list.push({ month, leader, items, missing, createdBy: res.createdBy, createdAt: res.createdAt });
      state.spotDraws = { ...(state.spotDraws || {}), day: Core.isoDate(new Date()), list };
      if (state.spot?.leader === leader) state.spot = null;
      state.spotWeek = null;
      setMsg('');
    } catch (e) {
      if (state.spot?.leader === leader) state.spot = { leader, items, missing, unsaved: true };
      setMsg(`抽查名單沒有存到，關掉頁面後會不見：${e.message || e}`, 'err');
    }
    render();
  }

  function canJudgeSpot() {
    const me = myName();
    return !!me && (Core.isSupervisor(me) || me === state.leader);
  }

  function spotResult(key) {
    return (state.sb?.checks || []).find((c) => c.spotKey === key) || null;
  }

  function spotReason(note) {
    const m = String(note || '').match(/未通過：(.*)$/);
    return m ? m[1] : '';
  }

  function spotVerdict(s, i) {
    const saved = spotResult(s.key);
    const mode = state.spotEdit?.[i];
    if (saved && !mode) {
      const pass = saved.correct > 0;
      return `<span class="apt-spot-res ${pass ? 'is-pass' : 'is-fail'}">${pass ? '✅ 通過' : `❌ 未通過：${esc(spotReason(saved.note))}`}</span>${
        canJudgeSpot() ? ` <button type="button" class="apt-btn-lite" data-spot-redo="${i}">改判</button>` : ''
      }`;
    }
    if (!canJudgeSpot()) return '<span class="apt-sub-note">只有組長可以判定</span>';
    if (mode === 'fail') {
      return `<span class="apt-spot-fail">
          <input type="text" id="apt-spot-reason-${i}" maxlength="150" placeholder="未通過原因（必填）" />
          <button type="button" class="apt-btn" data-spot-send="${i}">送出</button>
          <button type="button" class="apt-btn-lite" data-spot-cancel="${i}">取消</button>
        </span>`;
    }
    return `<button type="button" class="apt-spot-pass" data-spot-pass="${i}">通過</button>
      <button type="button" class="apt-spot-nopass" data-spot-fail="${i}">未通過</button>`;
  }

  async function saveSpot(i, passed, reason) {
    const s = currentSpot()?.items?.[i];
    if (!s) return;
    try {
      const res = await window.skyfunAuth.rpc('admin_points_spot_check', {
        p_token: token(),
        p_name: s.name,
        p_date: s.date,
        p_key: s.key,
        p_node: s.node,
        p_case: [s.no, s.caseName].filter(Boolean).join(' '),
        p_passed: passed,
        p_reason: reason || ''
      });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      const checks = (state.sb.checks || []).filter((c) => c.spotKey !== s.key);
      checks.push({ id: res.id, date: s.date, name: s.name, checked: 1, correct: passed ? 1 : 0, note: res.note, spotKey: s.key, spotNode: s.node, createdBy: myName() });
      state.sb.checks = checks;
      state.spotWeek = null;
      delete state.spotEdit[i];
      const n = res.notice;
      if (n?.kind === 'fail') {
        if (n.recipients > 0) setMsg(`已用 LINE 通知 ${s.name}，他的工具箱首頁也會顯示這件未通過。`, 'ok');
        else setMsg(`${s.name}${n.error === 'LINE 尚未設定' ? '：LINE 尚未設定' : ' 還沒綁定 LINE'}，這次沒有推 LINE；未通過通知只會顯示在他的工具箱首頁。`, 'warn');
      } else if (n?.kind === 'cleared') {
        setMsg(`已改判通過，${s.name} 首頁的未通過通知已收起${n.recipients > 0 ? '，也用 LINE 補通知了' : ''}。`, 'ok');
      } else setMsg('');
    } catch (e) {
      setMsg(`抽查結果沒有存到：${e.message || e}`, 'err');
    }
    render();
  }

  function spotLog() {
    const names = new Set(spotStaff().map((s) => s.name));
    const list = (state.sb?.checks || []).filter((c) => c.spotKey && names.has(c.name));
    if (!list.length) return '';
    const fail = list.filter((c) => !(c.correct > 0)).length;
    return `<h4 class="apt-sec-title">本業績月抽查紀錄<small>共 ${list.length} 件 · 未通過 ${fail} 件 · 已計入審件良率</small></h4>
      <div class="apt-table-wrap"><table class="apt-table apt-spot-table">
        <thead><tr><th>案件日期</th><th>姓名</th><th>結果</th><th>登錄人</th></tr></thead>
        <tbody>${list
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          .map(
            (c) => `<tr><td>${esc(c.date)}</td><td>${esc(c.name)}</td><td>${esc(String(c.note || '').replace(/^小組長抽查｜/, ''))}</td><td>${esc(c.createdBy)}</td></tr>`
          )
          .join('')}</tbody>
      </table></div>`;
  }

  function renderSpot() {
    if (!Core.canSpotCheck(myName())) return '<p class="apt-empty">小組長抽查只開放給處長與組長使用。</p>';
    const sb = state.sb || {};
    const leaders = spotLeaders();
    if (leaders.length === 1 && state.leader !== leaders[0]) state.leader = leaders[0];
    else if (state.leader && !leaders.includes(state.leader)) state.leader = '';
    if (state.spotDraws?.day !== Core.isoDate(new Date())) loadSpotDraws();
    if (state.spotWeek?.day !== Core.isoDate(new Date())) loadSpotWeek();
    const scopes = new Map(Core.leaderScopes(sb.staff || []).map((x) => [x.leader, x]));
    const leaderOpts = (leaders.length === 1 ? leaders : ['', ...leaders])
      .map((l) => {
        const area = scopes.get(l)?.areas.join('・') || '';
        return `<option value="${esc(l)}"${l === state.leader ? ' selected' : ''}>${l ? `${esc(l)}${area ? `（${esc(area)}）` : ''}` : '請選組長'}</option>`;
      })
      .join('');
    const drawn = currentSpot();
    const rows = !drawn
      ? ''
      : (drawn.items || [])
            .map((s, i) => {
              const url = spotItemUrl(s);
              return `<tr>
          <td><b>${esc(s.name)}</b></td>
          <td><span class="apt-spot-node">${esc(s.node)}</span></td>
          <td>${esc([s.no, s.caseName].filter(Boolean).join(' · ') || '沒有案件名稱')}</td>
          <td>${esc(String(s.time || '').replace(/-/g, '/'))}</td>
          <td>${url ? `<a class="apt-spot-go" href="${esc(url)}" data-spot-copy="${esc(url)}" draggable="true" title="點一下複製網址；也可以把按鈕拖到已登入的星鴻分頁">複製網址</a>` : '沒有案件編號'}</td>
          <td class="apt-spot-verdict">${spotVerdict(s, i)}</td>
        </tr>`;
            })
            .join('') || `<tr><td colspan="6" class="apt-empty">這組沒有在職行政</td></tr>`;
    const days = [...new Set((drawn?.items || []).map((s) => s.date))];
    const spotDay = days.length === 1 ? days[0].replace(/-/g, '/') : '';
    const missing = drawn?.missing?.length
      ? `<p class="apt-sub-note">${spotDay ? `${esc(spotDay)} 沒有` : '沒有'}物審、房客、預審、修繕審核或解約審核紀錄：${drawn.missing.map(esc).join('、')}</p>`
      : '';
    const sd = state.spotDraws;
    const when = (iso) => (iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');
    const status = !state.leader
      ? ''
      : drawn?.saving
        ? '<span class="apt-sub-note">儲存抽查名單中…</span>'
        : drawn?.unsaved
          ? '<span class="apt-bad">⚠ 這份名單沒有存到，關掉頁面會不見</span>'
          : drawn?.saved
            ? `<span class="apt-spot-saved">✓ 今天 ${esc(when(drawn.createdAt))} 由 ${esc(drawn.createdBy || '')} 抽出，已儲存，今天內打開都是這份</span>`
            : sd?.loading
              ? '<span class="apt-sub-note">讀取今天的抽查名單中…</span>'
              : sd?.error
                ? `<span class="apt-bad">今天的抽查名單讀取失敗：${esc(sd.error)}</span>`
                : '';
    const busy = sd?.loading || drawn?.saving;
    return `<div class="apt-sub-bar">
        <label class="${state.leader ? 'apt-leader-picked' : ''}">組長 <select id="apt-leader">${leaderOpts}</select></label>
        <button type="button" class="apt-btn" id="apt-spot"${busy ? ' disabled' : ''}>${drawn?.saved ? '重新抽查' : '抽查全部組員'}</button>
        ${spotDay ? `<span class="apt-spot-day">抽查日 ${esc(spotDay)}</span>` : ''}
        ${status}
      </div>
      ${state.leader ? spotWeekNote() : ''}
      <p class="apt-sub-note">抽前一天的案件：每位在職行政各從前一天審過的物審、房客、預審、修繕審核、解約審核抽一件（前一天＝今天以前最近一個有審核紀錄的日子，週一會抽上週五）。按「複製網址」再貼到已登入的星鴻分頁；也可以把按鈕直接拖到那個分頁上。物審→物件審核、房客→房客審核、修繕→該筆補助申請。看完按「通過」或「未通過」（要寫原因），結果算一件審件抽查，計入審件良率；同一件改判會覆蓋原本結果。判「未通過」會立刻用 LINE 通知該行政（他要先綁定 LINE），並顯示在他的工具箱首頁；改判通過會收起通知。</p>
      ${drawn ? `<div class="apt-table-wrap"><table class="apt-table apt-spot-table">
        <thead><tr><th>姓名</th><th>節點</th><th>案件</th><th>審核時間</th><th></th><th>抽查結果</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>${missing}` : ''}
      ${state.leader ? spotLog() : ''}`;
  }

  function guideBoardSection(note) {
    if (!window.GuideExam) return '';
    return `<details class="apt-board-fold" data-apt-board-fold${state.examBoardOpen ? ' open' : ''}>
        <summary class="apt-sec-title">執行要點考試成績<small>${esc(note)}；處長、組長可在這裡追蹤每個人的進度</small></summary>
        <div id="guide-exam-board"></div>
      </details>`;
  }

  function activeStaff() {
    return (state.sb?.staff || []).filter((s) => Core.isOnDuty(s));
  }

  const NIL = '<span class="apt-nil">-</span>';
  const DURATION_DETAIL_LIMIT = 1000;
  const DURATION_LONG_SEC = 3600;

  function durationViewBar(view) {
    return `<div class="apt-sub-tabs apt-dur-tabs">
      <button type="button" class="apt-sub-tab${view === 'rank' ? ' is-active' : ''}" data-dur-view="rank">🏆 排名</button>
      <button type="button" class="apt-sub-tab${view === 'region' ? ' is-active' : ''}" data-dur-view="region">🗺️ 地區</button>
      <button type="button" class="apt-sub-tab${view === 'detail' ? ' is-active' : ''}" data-dur-view="detail">📋 耗時明細</button>
      <button type="button" class="apt-sub-tab${view === 'compare' ? ' is-active' : ''}" data-dur-view="compare">📈 與上月比較</button>
    </div>`;
  }

  function hms(t) {
    return String(t || '').slice(11, 19);
  }

  /** 欄位定義：value 回傳排序用的值（null 一律排最後）；dir 為第一次點擊的方向（1 由小到大），排序狀態 dir 為 0 時採用 */
  function sortedRows(table, cols, rows) {
    const s = state.durSorts[table];
    const col = cols.find((c) => c.key === s.key) || cols[0];
    if (s.key === col.key && !s.dir) s.dir = col.dir;
    const dir = s.key === col.key ? s.dir : col.dir;
    const val = (r) => col.value(r);
    const sorted = rows.slice().sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y, 'zh-Hant') * dir;
      return (x - y) * dir;
    });
    let rank = 0;
    let prev;
    const ranks = sorted.map((r, i) => {
      const v = val(r);
      if (v == null) return '-';
      const key = typeof v === 'number' ? Math.round(v * 10) : v;
      if (key !== prev) rank = i + 1;
      prev = key;
      return rank;
    });
    return { sorted, ranks, col, dir };
  }

  function sortHead(table, cols, extraClass) {
    const s = state.durSorts[table];
    return cols
      .map((c) => {
        const active = s.key === c.key;
        const marks = c.marks || ['▲', '▼'];
        const arrow = active ? ` ${s.dir === 1 ? marks[0] : marks[1]}` : '';
        const cls = [c.num ? 'num' : '', 'apt-sortable', active ? 'is-sorted' : '', extraClass?.(c) || ''].filter(Boolean).join(' ');
        return `<th class="${cls}" data-dur-sort="${table}:${c.key}" title="點擊排序">${c.label}${arrow}${c.sub ? `<small>${c.sub}</small>` : ''}</th>`;
      })
      .join('');
  }

  /** tone：跟平均比，高 15% 以上紅、高 0–14% 黃、低 0–14% 白、低 15% 以上綠 */
  function statCols(nodes, fmt) {
    return [
      { key: 'avg', label: '平均耗時', sub: '全部節點', num: true, dir: 1, tone: true, cls: 'apt-total', value: (r) => r.avg, html: (r) => fmt(r.avg) || NIL },
      { key: 'count', label: '審核件數', num: true, dir: -1, value: (r) => r.count || null, html: (r) => String(r.count) },
      ...nodes.map((n) => ({
        key: n.key,
        label: n.label,
        sub: '平均／件數',
        num: true,
        dir: 1,
        tone: true,
        value: (r) => r.nodes[n.key].avg,
        html: (r) => {
          const x = r.nodes[n.key];
          return x.count ? `${fmt(x.avg)}<small>${x.count} 件</small>` : NIL;
        }
      }))
    ];
  }

  function toneClass(v, avg) {
    if (v == null || !avg) return '';
    const d = (v - avg) / avg;
    if (d >= 0.15) return 'apt-tone--red';
    if (d >= 0) return 'apt-tone--yellow';
    if (d > -0.15) return 'apt-tone--white';
    return 'apt-tone--green';
  }

  function statCell(col, r, base, focusKey) {
    const cls = ['num', col.cls, col.key === focusKey ? 'apt-col-focus' : '', base && col.tone ? toneClass(col.value(r), col.value(base)) : ''];
    return `<td class="${cls.filter(Boolean).join(' ')}"><span class="apt-cell">${col.html(r)}</span></td>`;
  }

  function rankBadge(rank) {
    if (typeof rank !== 'number') return rank;
    return rank <= 3 ? `<i class="apt-rank-badge apt-rank-badge--${rank}">${rank}</i>` : `<span class="apt-rank-num">${rank}</span>`;
  }

  /** 耗時數字粗體、單位縮小：「11 分 25 秒」 */
  function durFmt(sec) {
    const t = Core.formatDuration(sec);
    return t ? `<span class="apt-dur-v">${t.replace(/(\d+) (時|分|秒)/g, '<em>$1</em><u>$2</u>')}</span>` : '';
  }

  function toneRow(v, avg) {
    const t = toneClass(v, avg);
    return t ? ` class="apt-dur-row ${t.replace('apt-tone--', 'apt-dur-row--')}"` : ' class="apt-dur-row"';
  }

  function toneLegend(baseLabel) {
    return `<div class="apt-tone-legend">顏色跟「${baseLabel}」比：
      <span class="apt-tone-chip apt-tone--red">高 15% 以上</span>
      <span class="apt-tone-chip apt-tone--yellow">高 0–14%</span>
      <span class="apt-tone-chip apt-tone--white">低 0–14%</span>
      <span class="apt-tone-chip apt-tone--green">低 15% 以上</span>
    </div>`;
  }

  function renderDurationRank(rep, nodes) {
    const fmt = durFmt;
    const staff = new Map((state.sb?.staff || []).map((s) => [s.name, s]));
    const cols = [
      { key: 'name', label: '姓名', dir: 1, value: (r) => r.name },
      { key: 'region', label: '部別', dir: 1, value: (r) => staff.get(r.name)?.region || null },
      ...statCols(nodes, fmt)
    ];
    const focus = state.durSorts.rank.key;
    const fc = (key) => (key === focus ? ' class="apt-col-focus"' : '');
    const sections = GROUPS.map((g) => {
      const list = rep.people.filter((p) => p.group === g.key);
      if (g.key === '非行政' && !list.length) return '';
      const { sorted, ranks } = sortedRows('rank', cols, list);
      const rows = sorted
        .map(
          (p, i) => `<tr${toneRow(p.avg, rep.all.avg)}>
          <td class="apt-rank">${rankBadge(ranks[i])}</td>
          <td${fc('name')}><button type="button" class="apt-name" data-dur-person="${esc(p.name)}" title="看耗時明細">${esc(p.name)}</button></td>
          <td${fc('region')}>${staff.get(p.name)?.region ? `<span class="apt-dur-org">${esc(staff.get(p.name).region)}</span>` : ''}</td>
          ${cols.slice(2).map((c) => statCell(c, p, rep.all, focus)).join('')}
        </tr>`
        )
        .join('');
      return `<div class="apt-group-title">${g.key}<small>${list.length} 人</small></div>
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>#</th>${sortHead('rank', cols)}</tr></thead>
        <tbody>
          <tr class="apt-dur-all"><td></td><td${fc('name')}>全體平均<small>比較基準</small></td><td${fc('region')}></td>${cols.slice(2).map((c) => statCell(c, rep.all, null, focus)).join('')}</tr>
          ${rows || `<tr><td colspan="${cols.length + 1}" class="apt-empty">本業績月沒有審核紀錄</td></tr>`}
        </tbody>
      </table></div>`;
    }).join('');
    const missing = rep.missing ? ` · ${rep.missing} 筆系統沒有耗時，未計入` : '';
    return `${durationViewBar('rank')}
      <div class="apt-sub-bar"><span class="apt-sub-note">點欄位標題就用那一欄排序，再點一次反過來；# 是目前排序的名次（同值同名次）；點姓名看耗時明細${missing}</span></div>
      ${toneLegend('全體平均')}
      ${sections}
      <p class="apt-sub-note">耗時取星鴻「審核時間紀錄」的耗時（開始審核到按下核准／退回／儲存）。節點依審核前狀態分：物審＝物件送審中；房客＝房客審核；預審＝預審中；複審＝複審中；產編＝待產編，依合約編號期別分四期（04、41）與五期（05）；實價登錄＝已生效 → 已生效。退回、儲存也各算一次審核。</p>`;
  }

  function renderDurationRegion(rep, nodes) {
    const fmt = durFmt;
    const cols = [
      {
        key: 'name',
        label: '地區',
        dir: 1,
        marks: ['北→南', '南→北'],
        value: (r) => (r.name === '地址不明' ? null : Core.cityRank(r.name))
      },
      ...statCols(nodes.filter((n) => n.key !== 'tenant'), fmt)
    ];
    const { sorted, ranks } = sortedRows('region', cols, rep.cities);
    const focus = state.durSorts.region.key;
    const fc = (key) => (key === focus ? ' class="apt-col-focus"' : '');
    const total = { count: 0, sec: 0, avg: null, nodes: {} };
    for (const n of nodes) total.nodes[n.key] = { count: 0, sec: 0, avg: null };
    for (const c of rep.cities) {
      total.count += c.count;
      total.sec += c.sec;
      for (const n of nodes) {
        total.nodes[n.key].count += c.nodes[n.key].count;
        total.nodes[n.key].sec += c.nodes[n.key].sec;
      }
    }
    total.avg = total.count ? total.sec / total.count : null;
    for (const n of Object.values(total.nodes)) n.avg = n.count ? n.sec / n.count : null;
    const rows = sorted
      .map(
        (c, i) => `<tr${toneRow(c.avg, total.avg)}>
          <td class="apt-rank">${rankBadge(ranks[i])}</td>
          <td${fc('name')}><button type="button" class="apt-name" data-dur-city="${esc(c.name)}" title="看這個地區的耗時明細">${esc(c.name)}</button></td>
          ${cols.slice(1).map((col) => statCell(col, c, total, focus)).join('')}
        </tr>`
      )
      .join('');
    return `${durationViewBar('region')}
      <div class="apt-sub-bar"><span class="apt-sub-note">依物件／合約地址的縣市，計算所有審核人審這個地區案件的平均耗時；點欄位標題排序，再點一次反過來；點地區看明細</span></div>
      ${toneLegend('全部地區')}
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>#</th>${sortHead('region', cols)}</tr></thead>
        <tbody>
          <tr class="apt-dur-all"><td></td><td${fc('name')}>全部地區<small>比較基準</small></td>${cols.slice(1).map((col) => statCell(col, total, null, focus)).join('')}</tr>
          ${rows || `<tr><td colspan="${cols.length + 1}" class="apt-empty">本業績月沒有審核紀錄</td></tr>`}
        </tbody>
      </table></div>
      <p class="apt-sub-note">點「地區」可切換北→南、南→北（東部與離島排在最後）。房客審核只有房客姓名、沒有物件地址，不列入地區統計。地址抓不到縣市的歸在「地址不明」。</p>`;
  }

  function renderDurationDetail(rep, nodes) {
    const fmt = Core.formatDuration;
    const label = new Map(nodes.map((n) => [n.key, n.label]));
    const by = state.durBy;
    const who = state.durPerson;
    const city = state.durCity;
    const people = rep.people.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const personOpts = [`<option value=""${who ? '' : ' selected'}>全部人員</option>`]
      .concat(
        GROUPS.map((g) => {
          const list = people.filter((p) => p.group === g.key);
          if (!list.length) return '';
          return `<optgroup label="${g.key}">${list
            .map((p) => `<option value="${esc(p.name)}"${p.name === who ? ' selected' : ''}>${esc(p.name)}（${p.records.length}）</option>`)
            .join('')}</optgroup>`;
        })
      )
      .join('');
    const nodeOpts = [{ key: 'all', label: '全部節點' }, ...nodes]
      .map((n) => `<option value="${n.key}"${n.key === by ? ' selected' : ''}>${n.label}</option>`)
      .join('');
    const cityOpts = [`<option value=""${city ? '' : ' selected'}>全部地區</option>`]
      .concat(
        rep.cities
          .slice()
          .sort((a, b) => Core.cityRank(a.name) - Core.cityRank(b.name))
          .map((c) => `<option value="${esc(c.name)}"${c.name === city ? ' selected' : ''}>${esc(c.name)}（${c.count}）</option>`)
      )
      .join('');
    const records = people
      .filter((p) => !who || p.name === who)
      .flatMap((p) => p.records)
      .filter((r) => (by === 'all' || r.node === by) && (!city || r.city === city));
    const cols = [
      { key: 'time', label: '日期', dir: -1, value: (r) => String(r.time) },
      ...(who ? [] : [{ key: 'auditor', label: '審核人', dir: 1, value: (r) => r.auditor }]),
      { key: 'node', label: '節點', dir: 1, value: (r) => label.get(r.node) || r.node },
      { key: 'action', label: '動作', dir: 1, value: (r) => r.action },
      { key: 'status', label: '狀態', dir: 1, value: (r) => r.status },
      { key: 'no', label: '編號', dir: 1, value: (r) => r.no || null },
      { key: 'addr', label: '名稱', dir: 1, value: (r) => r.name || null },
      { key: 'start', label: '開始', num: true, dir: 1, value: (r) => r.start || null },
      { key: 'end', label: '完成', num: true, dir: 1, value: (r) => String(r.time) },
      { key: 'dur', label: '耗時', num: true, dir: -1, value: (r) => r.sec }
    ];
    const { sorted } = sortedRows('detail', cols, records);
    const secs = records.map((r) => r.sec);
    const stats = records.length
      ? `${records.length} 筆 · 平均 ${fmt(secs.reduce((a, b) => a + b, 0) / records.length)} · 最長 ${fmt(Math.max(...secs))} · 最短 ${fmt(Math.min(...secs))}`
      : '沒有紀錄';
    const shown = sorted.slice(0, DURATION_DETAIL_LIMIT);
    const rows = shown
      .map((r) => {
        const sameDay = String(r.start).slice(0, 10) === String(r.time).slice(0, 10);
        return `<tr>
          <td>${esc(String(r.time).slice(5, 10))}</td>
          ${who ? '' : `<td>${esc(r.auditor)}</td>`}
          <td>${esc(label.get(r.node) || r.node)}</td>
          <td>${esc(r.action)}</td>
          <td>${esc(r.status)}</td>
          <td>${r.no ? esc(r.no) : NIL}</td>
          <td>${esc(r.name)}</td>
          <td class="num">${r.start ? esc(sameDay ? hms(r.start) : String(r.start).slice(5, 16)) : NIL}</td>
          <td class="num">${esc(hms(r.time))}</td>
          <td class="num${r.sec >= DURATION_LONG_SEC ? ' apt-bad' : ''}">${durFmt(r.sec)}</td>
        </tr>`;
      })
      .join('');
    const more = sorted.length > shown.length ? `<p class="apt-sub-note">只顯示前 ${DURATION_DETAIL_LIMIT} 筆，請選人員、節點或地區縮小範圍。</p>` : '';
    return `${durationViewBar('detail')}
      <div class="apt-sub-bar">
        <label>人員 <select id="apt-dur-person">${personOpts}</select></label>
        <label>節點 <select id="apt-dur-by">${nodeOpts}</select></label>
        <label>地區 <select id="apt-dur-city">${cityOpts}</select></label>
        <span class="apt-sub-note">${stats}</span>
      </div>
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table apt-dur-detail">
        <thead><tr>${sortHead('detail', cols)}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length}" class="apt-empty">沒有符合的紀錄</td></tr>`}</tbody>
      </table></div>${more}
      <p class="apt-sub-note">點欄位標題排序，再點一次反過來。耗時超過 1 小時以紅字標示，多半是開著案件沒有馬上送出。開始時間若不在同一天會顯示日期。</p>`;
  }

  const prevPeriodOf = (period) => {
    const [y, m] = String(period).split('/').map(Number);
    return guildPeriodOf(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
  };

  /** 良率排名共用列：每人的案件良率（個人績效同算法）＋本業績月耗時 */
  function qualityRows(rep, period) {
    const staff = new Map((state.sb?.staff || []).map((s) => [s.name, s]));
    return rep.people.map((p) => {
      const q = personGuildStats(p.name, period).audit;
      return {
        name: p.name,
        group: p.group,
        region: staff.get(p.name)?.region || '',
        avg: p.avg,
        count: p.count || 0,
        rate: q?.rate ?? null,
        total: q?.total ?? null,
        err: q?.err ?? null,
        loading: !!q?.loading,
        error: q?.error || '',
        busy: !!q?.busy
      };
    });
  }

  const qualityChip = (rate) => (rate == null ? NIL : `<span class="apt-gchip apt-gchip--${rate >= 0.9 ? 'g' : rate >= 0.8 ? 'y' : 'r'}">${(rate * 100).toFixed(1)}%</span>`);

  /** 審件品質排名：個人績效的公會審件良率（案件良率）＋本業績月耗時，一張表同時看 */
  function renderDurationQuality(rep) {
    const range = state.meta.range;
    const period = prevGuild(range).guild;
    const bar = durationViewBar('quality');
    if (period < GUILD_SYS_START) {
      return `${bar}<p class="apt-sub-note">公會期數 ${GUILD_SYS_START} 起才有逐筆案件可以算個人案件良率（目前看的公會期數 ${esc(period)}）。</p>`;
    }
    const rows = qualityRows(rep, period);
    if (rows.some((r) => r.loading)) {
      return `${bar}<p class="apt-sub-note apt-loading">讀取公會期數 ${esc(period)} 的個人案件良率中…（要先對完複審人，約需數秒）</p>`;
    }
    const errRow = rows.find((r) => r.error);
    if (errRow) return `${bar}<p class="apt-bad">案件良率讀取失敗：${esc(errRow.error)}</p>`;
    const cols = [
      { key: 'name', label: '姓名', dir: 1, value: (r) => r.name },
      { key: 'region', label: '部別', dir: 1, value: (r) => r.region || null },
      { key: 'rate', label: '案件良率', sub: `公會期數 ${period}`, num: true, dir: -1, value: (r) => r.rate, html: (r) => (r.rate == null ? NIL : `<span class="apt-gchip apt-gchip--${r.rate >= 0.9 ? 'g' : r.rate >= 0.8 ? 'y' : 'r'}">${(r.rate * 100).toFixed(1)}%</span>`) },
      { key: 'total', label: '複審件數', num: true, dir: -1, value: (r) => r.total, html: (r) => (r.total == null ? NIL : String(r.total)) },
      { key: 'err', label: '被退件', num: true, dir: 1, value: (r) => r.err, html: (r) => (r.err == null ? NIL : r.err ? `<b class="apt-bad">${r.err}</b>` : '0') },
      { key: 'avg', label: '平均耗時', sub: '本業績月', num: true, dir: 1, value: (r) => r.avg, html: (r) => durFmt(r.avg) || NIL },
      { key: 'count', label: '審核件數', sub: '本業績月', num: true, dir: -1, value: (r) => r.count || null, html: (r) => String(r.count) }
    ];
    const focus = state.durSorts.quality.key;
    const fc = (key) => (key === focus ? ' class="apt-col-focus"' : '');
    const sections = GROUPS.map((g) => {
      const list = rows.filter((p) => p.group === g.key);
      if (g.key === '非行政' && !list.length) return '';
      const { sorted, ranks } = sortedRows('quality', cols, list);
      const body = sorted
        .map(
          (p, i) => `<tr>
          <td class="apt-rank">${rankBadge(ranks[i])}</td>
          <td${fc('name')}><button type="button" class="apt-name" data-dur-person="${esc(p.name)}" title="看耗時明細">${esc(p.name)}</button></td>
          <td${fc('region')}>${p.region ? `<span class="apt-dur-org">${esc(p.region)}</span>` : ''}</td>
          ${cols.slice(2).map((c) => `<td class="num${c.key === focus ? ' apt-col-focus' : ''}"><span class="apt-cell">${c.html(p)}</span></td>`).join('')}
        </tr>`
        )
        .join('');
      return `<div class="apt-group-title">${g.key}<small>${list.length} 人</small></div>
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>#</th>${sortHead('quality', cols)}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols.length + 1}" class="apt-empty">本業績月沒有審核紀錄</td></tr>`}</tbody>
      </table></div>`;
    }).join('');
    const busy = rows.some((r) => r.busy) ? '複審人還在查詢中，數字會再增加；' : '';
    return `${bar}
      <div class="apt-sub-bar"><span class="apt-sub-note">案件良率＝個人績效「我的公會審件良率」同一套算法；點欄位標題排序，再點一次反過來；點姓名看耗時明細</span></div>
      ${sections}
      <p class="apt-sub-note">案件良率：公會期數 ${esc(period)}（上個月），我複審的起租案件中沒被公會退件的比例，退件依媒合編號去重只算第一筆，目標 90%。平均耗時與審核件數是本業績月的審核時間紀錄，跟良率的月份不同。${busy}</p>`;
  }

  /** 案件良率・地區：各地區（部別）的良率、件數與平均耗時 */
  function renderDurationQualityRegion(rep) {
    const range = state.meta.range;
    const period = prevGuild(range).guild;
    const bar = durationViewBar('quality-region');
    if (period < GUILD_SYS_START) return `${bar}<p class="apt-sub-note">公會期數 ${GUILD_SYS_START} 起才有逐筆案件（目前 ${esc(period)}）。</p>`;
    const sys = state.guildSys.get(period)?.data;
    if (!sys) {
      guildSysPeriod(period).then(() => guildRerender());
      return `${bar}<p class="apt-sub-note apt-loading">讀取公會期數 ${esc(period)} 的地區良率中…</p>`;
    }
    if (sys.error) return `${bar}<p class="apt-bad">讀取失敗：${esc(sys.error)}</p>`;
    const rows = qualityRows(rep, period);
    const regions = Object.keys(sys.audit || {}).filter((g) => g !== '全區');
    const avgDur = (region) => {
      const list = rows.filter((r) => (region === '全區' ? true : r.region === region) && r.count);
      const sec = list.reduce((s, r) => s + (r.avg || 0) * r.count, 0);
      const n = list.reduce((s, r) => s + r.count, 0);
      return n ? sec / n : null;
    };
    const people = (region) => rows.filter((r) => region === '全區' || r.region === region).length;
    const tr = (g) => {
      const x = sys.audit[g];
      const rate = x?.total ? Core.kpiErrRate(x) : null;
      return `<tr${g === '全區' ? ' class="apt-dur-all"' : ''}>
        <td><b>${esc(g)}</b></td>
        <td class="num">${qualityChip(rate)}</td>
        <td class="num">${x?.total ?? 0}</td>
        <td class="num">${x?.err ? `<b class="apt-bad">${x.err}</b>` : 0}</td>
        <td class="num">${durFmt(avgDur(g)) || NIL}</td>
        <td class="num">${people(g)} 人</td>
      </tr>`;
    };
    return `${bar}
      <div class="apt-sub-bar"><span class="apt-sub-note">各地區案件良率（公會期數 ${esc(period)}），平均耗時為本業績月同地區人員的加權平均</span></div>
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>地區</th><th class="num">案件良率</th><th class="num">複審件數</th><th class="num">被退件</th><th class="num">平均耗時</th><th class="num">人數</th></tr></thead>
        <tbody>${tr('全區')}${regions.map(tr).join('')}</tbody>
      </table></div>
      <p class="apt-sub-note">地區依案件縣市分（同各地區 KPI）；退件依媒合編號去重只算第一筆，目標 90%。</p>`;
  }

  /** 案件良率・與上月比較：本期（上月公會期數）vs 上期（上上月）逐人比較 */
  function renderDurationQualityCompare(rep) {
    const range = state.meta.range;
    const period = prevGuild(range).guild;
    const prev = prevPeriodOf(period);
    const bar = durationViewBar('quality-compare');
    if (period < GUILD_SYS_START) return `${bar}<p class="apt-sub-note">公會期數 ${GUILD_SYS_START} 起才有逐筆案件（目前 ${esc(period)}）。</p>`;
    const cur = qualityRows(rep, period);
    if (cur.some((r) => r.loading)) return `${bar}<p class="apt-sub-note apt-loading">讀取公會期數 ${esc(period)} 的個人案件良率中…</p>`;
    const prevRows = prev >= GUILD_SYS_START ? qualityRows(rep, prev) : [];
    if (prevRows.some((r) => r.loading)) return `${bar}<p class="apt-sub-note apt-loading">讀取公會期數 ${esc(prev)} 的個人案件良率中…</p>`;
    const prevBy = new Map(prevRows.map((r) => [r.name, r]));
    const rows = cur.map((r) => {
      const p = prevBy.get(r.name);
      return { ...r, prevRate: p?.rate ?? null, prevTotal: p?.total ?? null, prevErr: p?.err ?? null, diff: r.rate != null && p?.rate != null ? (r.rate - p.rate) * 100 : null };
    });
    const cols = [
      { key: 'name', label: '姓名', dir: 1, value: (r) => r.name },
      { key: 'region', label: '部別', dir: 1, value: (r) => r.region || null },
      { key: 'rate', label: '本期良率', sub: period, num: true, dir: -1, value: (r) => r.rate, html: (r) => qualityChip(r.rate) },
      { key: 'prevRate', label: '上期良率', sub: prev, num: true, dir: -1, value: (r) => r.prevRate, html: (r) => qualityChip(r.prevRate) },
      { key: 'diff', label: '變化', sub: '百分點', num: true, dir: -1, value: (r) => r.diff, html: (r) => (r.diff == null ? NIL : Math.abs(r.diff) < 0.05 ? '<span class="apt-gcity-diff">持平</span>' : `<span class="apt-gcity-diff ${r.diff > 0 ? 'is-up' : 'is-down'}">${r.diff > 0 ? '▲' : '▼'} ${Math.abs(r.diff).toFixed(1)}</span>`) },
      { key: 'total', label: '本期複審', num: true, dir: -1, value: (r) => r.total, html: (r) => (r.total == null ? NIL : String(r.total)) },
      { key: 'prevTotal', label: '上期複審', num: true, dir: -1, value: (r) => r.prevTotal, html: (r) => (r.prevTotal == null ? NIL : String(r.prevTotal)) },
      { key: 'avg', label: '平均耗時', sub: '本業績月', num: true, dir: 1, value: (r) => r.avg, html: (r) => durFmt(r.avg) || NIL }
    ];
    const focus = state.durSorts.qualityCmp.key;
    const fc = (key) => (key === focus ? ' class="apt-col-focus"' : '');
    const sections = GROUPS.map((g) => {
      const list = rows.filter((p) => p.group === g.key);
      if (g.key === '非行政' && !list.length) return '';
      const { sorted, ranks } = sortedRows('qualityCmp', cols, list);
      const body = sorted
        .map(
          (p, i) => `<tr>
          <td class="apt-rank">${rankBadge(ranks[i])}</td>
          <td${fc('name')}><button type="button" class="apt-name" data-dur-person="${esc(p.name)}" title="看耗時明細">${esc(p.name)}</button></td>
          <td${fc('region')}>${p.region ? `<span class="apt-dur-org">${esc(p.region)}</span>` : ''}</td>
          ${cols.slice(2).map((c) => `<td class="num${c.key === focus ? ' apt-col-focus' : ''}"><span class="apt-cell">${c.html(p)}</span></td>`).join('')}
        </tr>`
        )
        .join('');
      return `<div class="apt-group-title">${g.key}<small>${list.length} 人</small></div>
      <div class="apt-table-wrap"><table class="apt-table apt-dur-table">
        <thead><tr><th>#</th>${sortHead('qualityCmp', cols)}</tr></thead>
        <tbody>${body || `<tr><td colspan="${cols.length + 1}" class="apt-empty">沒有資料</td></tr>`}</tbody>
      </table></div>`;
    }).join('');
    return `${bar}
      <div class="apt-sub-bar"><span class="apt-sub-note">本期＝公會期數 ${esc(period)}、上期＝${esc(prev)}；預設照進步幅度排，點欄位標題可改排序；綠色＝比上期好（進步），紅色＝退步</span></div>
      ${sections}
      <p class="apt-sub-note">變化是良率百分點（本期 − 上期）。只有兩期都有複審件數的人才算得出變化；上期在 ${GUILD_SYS_START} 之前的只顯示本期。</p>`;
  }

  function renderDuration() {
    const range = state.meta.range;
    const rep = Core.durationReport(state.auditRows, {
      start: range.start,
      end: range.end,
      staff: state.sb?.staff || []
    });
    const nodes = Core.DURATION_NODES.filter((n) => n.key !== 'px' || rep.all.nodes.px.count);
    if (state.durBy !== 'all' && !nodes.some((n) => n.key === state.durBy)) state.durBy = 'all';
    const views = { detail: renderDurationDetail, region: renderDurationRegion, compare: renderDurationCompare };
    const view = views[state.durView] || renderDurationRank;
    return `${durationHero(rep, nodes)}${view(rep, nodes)}`;
  }

  /* ---------- 耗時：與上月比較 ---------- */

  /** 速度比較只看通識節點；實價登錄是專案，件數多又只有少數人做 */
  const CMP_NODES = Core.DURATION_NODES.filter((n) => n.key !== 'lvr');
  const CMP_MIN = 5;

  async function loadDurPrev(range) {
    const key = `${range.year}-${range.month}`;
    if (state.durPrev?.key === key) return;
    const pr = prevRange(range);
    state.durPrev = { key, loading: true, range: pr };
    try {
      const audit = await fetchWorker('/admin-points/audit-log', `${pr.month} 月審核時間紀錄`, pr, false);
      if (state.durPrev?.key !== key) return;
      const rep = Core.durationReport(auditRowsOf(audit), { start: pr.start, end: pr.end, staff: state.sb?.staff || [] });
      state.durPrev = { key, range: pr, rep };
    } catch (err) {
      if (state.durPrev?.key !== key) return;
      state.durPrev = { key, range: pr, error: String(err.message || err) };
    }
    if (state.tab === 'duration' && state.durView === 'compare') render();
  }

  function cmpAgg(records) {
    const recs = records.filter((r) => CMP_NODES.some((n) => n.key === r.node));
    const out = { count: recs.length, sec: 0, long: 0, avg: null, median: null, nodes: {} };
    for (const n of CMP_NODES) out.nodes[n.key] = { count: 0, sec: 0, avg: null };
    for (const r of recs) {
      out.sec += r.sec;
      if (r.sec >= DURATION_LONG_SEC) out.long += 1;
      out.nodes[r.node].count += 1;
      out.nodes[r.node].sec += r.sec;
    }
    out.avg = out.count ? out.sec / out.count : null;
    if (out.count) {
      const s = recs.map((r) => r.sec).sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      out.median = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    for (const n of Object.values(out.nodes)) n.avg = n.count ? n.sec / n.count : null;
    return out;
  }

  function cmpRecords(rep, names) {
    return rep.people.filter((p) => p.group === '行政' && (!names || names.has(p.name))).flatMap((p) => p.records);
  }

  /** 變化率：負數＝變快 */
  function cmpChange(cur, prev) {
    return cur != null && prev ? (cur - prev) / prev : null;
  }

  function cmpTag(ch, words = ['快', '慢']) {
    if (ch == null) return '<em class="apt-cmp-tag">—</em>';
    const p = Math.round(Math.abs(ch) * 100);
    if (p < 1) return '<em class="apt-cmp-tag is-even">持平</em>';
    return ch < 0 ? `<em class="apt-cmp-tag is-good">▼ ${words[0]} ${p}%</em>` : `<em class="apt-cmp-tag is-bad">▲ ${words[1]} ${p}%</em>`;
  }

  /**
   * 同一人兩個月做的節點組合可能不同（例如本月多做預審），直接比平均會失真。
   * 用本月各節點件數當權重：上月若以同樣件數組合審核，預估要花多少時間，再跟本月實際比。
   */
  function cmpPerson(cur, prev) {
    let actual = 0;
    let expected = 0;
    let n = 0;
    for (const node of CMP_NODES) {
      const c = cur.nodes[node.key];
      const p = prev.nodes[node.key];
      if (!c.count || !p.count) continue;
      actual += c.sec;
      expected += c.count * p.avg;
      n += c.count;
    }
    return n >= CMP_MIN && expected ? { change: (actual - expected) / expected, n } : null;
  }

  /** words：[變好的字, 變差的字]；null 表示只是參考數字，不分好壞 */
  function cmpKpi(label, cur, prev, fmt, words, note = '') {
    const ch = cmpChange(cur, prev);
    const p = ch == null ? 0 : Math.round(Math.abs(ch) * 100);
    const tag = words || ch == null
      ? cmpTag(ch, words || undefined)
      : `<em class="apt-cmp-tag">${p < 1 ? '持平' : `${ch > 0 ? '▲ 多' : '▼ 少'} ${p}%`}</em>`;
    return `<div class="apt-cmp-kpi">
        <span>${label}</span>
        <b>${cur == null ? '-' : fmt(cur)}</b>
        <small>上月 ${prev == null ? '-' : fmt(prev)}</small>
        ${tag}
        ${note ? `<small class="apt-cmp-note">${note}</small>` : ''}
      </div>`;
  }

  /** 每個節點兩條長條：上月灰、本月（變快綠／變慢紅）；長條越短越快，右上直接寫快了或慢了多久 */
  function cmpNodeBars(cur, prev, prevLabel, curLabel) {
    const fmt = Core.formatDuration;
    const rows = CMP_NODES.filter((n) => cur.nodes[n.key].count || prev.nodes[n.key].count);
    if (!rows.length) return '<p class="apt-empty">兩個月都沒有審核紀錄</p>';
    const max = Math.max(...rows.flatMap((n) => [cur.nodes[n.key].avg || 0, prev.nodes[n.key].avg || 0])) || 1;
    const w = (v) => `${Math.max(1.5, (v / max) * 100)}%`;
    let faster = 0;
    let slower = 0;
    const body = rows
      .map((n) => {
        const c = cur.nodes[n.key];
        const p = prev.nodes[n.key];
        const ch = cmpChange(c.avg, p.avg);
        const pct = ch == null ? 0 : Math.round(Math.abs(ch) * 100);
        const tone = ch == null || pct < 1 ? 'is-even' : ch < 0 ? 'is-good' : 'is-bad';
        if (tone === 'is-good') faster += 1;
        if (tone === 'is-bad') slower += 1;
        const verdict =
          ch == null
            ? '<em class="apt-nb-verdict">只有一個月有資料</em>'
            : pct < 1
              ? '<em class="apt-nb-verdict is-even">持平</em>'
              : `<em class="apt-nb-verdict ${tone}">${ch < 0 ? '👍 快了' : '⚠ 慢了'} ${esc(fmt(Math.abs(c.avg - p.avg)))}（${pct}%）</em>`;
        const bar = (label, a, cls) => `<div class="apt-nb-line">
            <span class="apt-nb-month">${esc(label)}</span>
            <span class="apt-nb-track">${a.avg != null ? `<i class="${cls}" style="width:${w(a.avg)}"></i>` : ''}</span>
            <span class="apt-nb-val">${a.avg != null ? `<b>${esc(fmt(a.avg))}</b>` : '-'}<small>${a.count} 件</small></span>
          </div>`;
        return `<div class="apt-nb-row">
          <div class="apt-nb-head"><b>${esc(n.label)}</b>${verdict}</div>
          ${bar(prevLabel, p, 'is-prev')}
          ${bar(curLabel, c, tone)}
        </div>`;
      })
      .join('');
    return `<p class="apt-nb-sum">${rows.length} 個節點：<b class="is-good">${faster} 個變快</b>、<b class="is-bad">${slower} 個變慢</b>${rows.length - faster - slower ? `、${rows.length - faster - slower} 個持平或無法比較` : ''}</p>
      <div class="apt-nb">${body}</div>`;
  }

  function cmpPeople(curRep, prevRep, names) {
    const prevBy = new Map(prevRep.people.map((p) => [p.name, cmpAgg(p.records)]));
    const list = curRep.people
      .filter((p) => p.group === '行政' && (!names || names.has(p.name)))
      .map((p) => {
        const prev = prevBy.get(p.name);
        const r = prev ? cmpPerson(cmpAgg(p.records), prev) : null;
        return { name: p.name, ...(r || {}) };
      });
    const rated = list.filter((x) => x.change != null).sort((a, b) => a.change - b.change);
    const skipped = list.filter((x) => x.change == null).map((x) => x.name);
    if (!rated.length) return `<p class="apt-empty">兩個月都有足夠審核紀錄（同節點至少 ${CMP_MIN} 件）的人還不夠，暫時無法比較。</p>`;
    const span = Math.min(1, Math.max(0.1, ...rated.map((x) => Math.abs(x.change))));
    const body = rated
      .map((x) => {
        const w = `${(Math.min(Math.abs(x.change), span) / span) * 50}%`;
        const good = x.change < 0;
        const p = Math.round(Math.abs(x.change) * 100);
        return `<div class="apt-dv-row">
          <button type="button" class="apt-name apt-dv-name" data-dur-person="${esc(x.name)}" title="看耗時明細">${esc(x.name)}<small>${x.n} 件</small></button>
          <span class="apt-dv-track"><i class="apt-dv-mid"></i><i class="apt-dv-bar ${good ? 'is-good' : 'is-bad'}" style="${good ? `right:50%` : `left:50%`};width:${w}"></i></span>
          <span class="apt-dv-val ${p < 1 ? '' : good ? 'is-good' : 'is-bad'}">${p < 1 ? '持平' : `${good ? '快' : '慢'} ${p}%`}</span>
        </div>`;
      })
      .join('');
    const improved = rated.filter((x) => x.change < -0.005).length;
    return `<p class="apt-cmp-sum">可比較 ${rated.length} 人：<b class="is-good">${improved} 人變快</b>、<b class="is-bad">${rated.length - improved} 人持平或變慢</b></p>
      <div class="apt-dv"><div class="apt-dv-axis"><span>◀ 變快（改善）</span><span>變慢 ▶</span></div>${body}</div>
      ${skipped.length ? `<p class="apt-sub-note">審核件數不足、無法比較：${skipped.map(esc).join('、')}</p>` : ''}`;
  }

  function cmpWeekly(curRecs, prevRecs, range, pr) {
    const weeks = (r, recs) =>
      Core.weeksOf(r).map((w) => {
        const a = cmpAgg(recs.filter((x) => x.date >= w.start && x.date <= w.end));
        const s = w.start < r.start ? r.start : w.start;
        return { label: `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`, avg: a.count ? a.avg / 60 : null };
      });
    const pw = weeks(pr, prevRecs);
    const cw = weeks(range, curRecs);
    const labels = [...pw, ...cw].map((w) => w.label);
    const prevAvg = cmpAgg(prevRecs).avg;
    return window.AdminPointsCharts.columns({
      labels,
      lines: [
        { name: `${pr.month} 月每週平均`, values: [...pw.map((w) => w.avg), ...cw.map(() => null)], color: '#94a3b8' },
        { name: `${range.month} 月每週平均`, values: [...pw.map(() => null), ...cw.map((w) => w.avg)], color: '#4f46e5' }
      ],
      refs: prevAvg ? [{ value: prevAvg / 60, label: '上月平均', color: '#f59e0b' }] : [],
      fmt: (v) => `${Math.round(v * 10) / 10}分`,
      height: 240
    });
  }

  function renderDurationCompare(rep) {
    const range = state.meta.range;
    const dp = state.durPrev;
    if (dp?.key !== `${range.year}-${range.month}`) loadDurPrev(range);
    const sb = state.sb || {};
    const leaders = leaderOrder(sb.staff);
    const leaderOpts = ['', ...leaders].map((l) => `<option value="${esc(l)}"${l === state.leader ? ' selected' : ''}>${l ? esc(l) : '全部行政'}</option>`).join('');
    const bar = `${durationViewBar('compare')}
      <div class="apt-sub-bar">
        <label class="${state.leader ? 'apt-leader-picked' : ''}">範圍 <select id="apt-leader">${leaderOpts}</select></label>
        <span class="apt-sub-note">耗時越短越好：綠色＝比上月快（改善），紅色＝比上月慢。實價登錄不列入。</span>
      </div>`;
    if (!dp?.rep) {
      return `${bar}<p class="apt-empty">${dp?.error ? `上月資料讀取失敗：${esc(dp.error)}` : '讀取上個業績月的審核紀錄中…第一次約需 5～10 秒'}</p>`;
    }
    const pr = dp.range;
    const names = state.leader
      ? new Set((sb.staff || []).filter((s) => s.leader === state.leader && Core.isOnDuty(s) && s.kind !== '工讀生').map((s) => s.name))
      : null;
    const curRecs = cmpRecords(rep, names);
    const prevRecs = cmpRecords(dp.rep, names);
    const cur = cmpAgg(curRecs);
    const prev = cmpAgg(prevRecs);
    const fmt = Core.formatDuration;
    const prevLabel = `${pr.month} 月`;
    const curLabel = `${range.month} 月`;
    const pct = (v) => `${Math.round(v * 1000) / 10}%`;
    const longRate = (a) => (a.count ? a.long / a.count : null);
    return `${bar}
      <div class="apt-cmp-kpis">
        ${cmpKpi('平均耗時', cur.avg, prev.avg, fmt, ['快', '慢'])}
        ${cmpKpi('中位數耗時', cur.median, prev.median, fmt, ['快', '慢'], '一半的案件在這個時間內完成，不受少數超長案件影響')}
        ${cmpKpi('超過 1 小時的比例', longRate(cur), longRate(prev), pct, ['少', '多'], `本月 ${cur.long} 件、上月 ${prev.long} 件；多半是開著案件沒送出`)}
        ${cmpKpi('審核件數', cur.count, prev.count, String, null, '本月還沒結束時件數會比較少，只供參考')}
      </div>
      <div class="apt-charts apt-cmp-charts">
        ${chartCard(`各節點平均審一件要多久｜${prevLabel} vs ${curLabel}`, '灰色是上月、彩色是本月；長條越短代表審得越快，綠色＝比上月快、紅色＝比上月慢', cmpNodeBars(cur, prev, prevLabel, curLabel))}
        ${chartCard('每週平均耗時趨勢', `灰線 ${prevLabel}、藍線 ${curLabel}、橘色虛線是上月平均；藍線落在橘線下方就是比上月快`, cmpWeekly(curRecs, prevRecs, range, pr))}
      </div>
      <h4 class="apt-sec-title">每人改善幅度<small>以本月做的節點與件數，跟同一人上月同節點的平均耗時比；排越上面進步越多。點姓名看明細</small></h4>
      ${cmpPeople(rep, dp.rep, names)}
      <p class="apt-sub-note">${prevLabel}：${esc(pr.start)}～${esc(pr.end)}；${curLabel}：${esc(range.start)}～${esc(range.end)}${range.end > Core.isoDate(new Date()) ? '（本月還沒結束，數字會隨審核更新）' : ''}。每人比較時，如果本月多做了比較費時的節點，不會因此被算成變慢。</p>`;
  }

  const DUR_NODE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#14b8a6'];

  function durationHero(rep, nodes) {
    const shown = nodes.filter((n) => rep.all.nodes[n.key].count);
    const max = Math.max(1, ...shown.map((n) => rep.all.nodes[n.key].avg || 0));
    const cards = shown
      .map((n, i) => {
        const x = rep.all.nodes[n.key];
        const w = Math.max(4, Math.round(((x.avg || 0) / max) * 100));
        return `<div class="apt-dur-node" style="--c:${DUR_NODE_COLORS[i % DUR_NODE_COLORS.length]}">
          <span>${esc(n.label)}</span><b>${durFmt(x.avg)}</b>
          <i class="apt-dur-node-bar"><s style="width:${w}%"></s></i>
          <small>${x.count.toLocaleString('en-US')} 筆</small></div>`;
      })
      .join('');
    return `<div class="apt-dur-hero">
        <div class="apt-dur-hero-main">
          <span class="apt-dur-hero-k">⏱️ 本業績月全體平均耗時</span>
          <b>${durFmt(rep.all.avg) || '-'}</b>
          <div class="apt-dur-hero-meta"><span><em>${rep.all.count.toLocaleString('en-US')}</em> 筆審核</span><span><em>${rep.people.length}</em> 位審核人</span></div>
        </div>
        <div class="apt-dur-nodes">${cards}</div>
      </div>`;
  }

  function renderWarnings() {
    const r = state.result;
    const out = [];
    if (!r.rosterReady) {
      out.push('<li class="is-warn">人力明細尚未建立，暫時把所有審核人列為行政。請組長到後台建立「在職」名單後，才會分出行政／非行政。</li>');
    }
    if (r.resigned.length) {
      out.push(`<li>離職人員不計點：${r.resigned.map(([n, c]) => `${esc(n)}（${c}）`).join('、')}</li>`);
    }
    if (r.unknownCodes.length) {
      out.push(
        `<li class="is-warn">產編無法從合約編號判斷四期／五期，未計點：${r.unknownCodes.map((x) => esc(x.no || x.name)).join('、')}</li>`
      );
    }
    if (r.duplicates.length) {
      out.push(`<li>同案件同工作項目重複紀錄已排除 ${r.duplicates.length} 筆（只認列第一次）。</li>`);
    }
    return `<ul class="apt-warn">${out.join('')}</ul>`;
  }

  function render() {
    const r = state.result;
    const box = $('apt-body');
    if (!box || !r) return;
    const admin = r.people.filter((p) => p.group === '行政');
    const total = admin.reduce((s, p) => s + p.month.total, 0);
    const otherTotal = r.people.filter((p) => p.group === '非行政').reduce((s, p) => s + p.month.total, 0);
    const s1 = admin.filter((p) => p.stage === 1).length;
    const s2 = admin.filter((p) => p.stage === 2).length;
    const fetched = state.meta?.fetchedAt ? new Date(state.meta.fetchedAt).toLocaleString('zh-TW', { hour12: false }) : '';
    $('apt-summary').innerHTML = `
      <span class="apt-chip"><strong>${total}</strong>行政總點數</span>
      <span class="apt-chip"><strong>${admin.filter((p) => p.month.total > 0).length}</strong>行政有點數人數</span>
      <span class="apt-chip"><strong>${otherTotal}</strong>非行政總點數</span>
      <span class="apt-chip"><strong>${s1}</strong>第一階段</span>
      <span class="apt-chip"><strong>${s2}</strong>第二階段</span>
      <span class="apt-chip apt-chip--muted">${esc(state.meta.range.start)}～${esc(state.meta.range.end)} · 系統資料時間 ${esc(fetched)}</span>`;
    const personTab = document.querySelector('.apt-tab[data-tab="person"]');
    if (personTab) personTab.hidden = !PERSON_OPEN;
    if (state.tab === 'person' && !PERSON_OPEN) state.tab = 'month';
    const spotOk = Core.canSpotCheck(myName());
    const spotTab = document.querySelector('.apt-tab[data-tab="spot"]');
    if (spotTab) spotTab.hidden = !spotOk;
    if (state.tab === 'spot' && !spotOk) state.tab = 'month';
    document.querySelectorAll('.apt-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
    // 點數月累計不再加 apt-wide，維持與其他頁籤相同寬度（max-w-6xl）
    $('page-admin-points')?.classList.remove('apt-wide');
    if (state.tab === 'person') box.innerHTML = renderPerson();
    else if (state.tab === 'weekly') box.innerHTML = renderWeekly();
    else if (state.tab === 'area') box.innerHTML = renderArea();
    else if (state.tab === 'duration') box.innerHTML = renderDuration();
    else if (state.tab === 'spot') box.innerHTML = renderSpot();
    else box.innerHTML = renderMonth();
    $('apt-warnings').innerHTML = renderWarnings();
    if (state.tab === 'person' && window.GuideExam) {
      window.GuideExam.loadOverview();
      const gx = $('guide-exam-root');
      if (gx) window.GuideExam.mount({ self: gx.dataset.name === myName(), name: gx.dataset.name });
    }
    if (state.tab === 'person' && window.CourseExam) {
      window.CourseExam.loadOverview();
      const cx = $('course-exam-root');
      if (cx) window.CourseExam.mount({ course: cx.dataset.course, self: cx.dataset.name === myName(), name: cx.dataset.name });
    }
    if (state.tab === 'person' && window.SimPractice) {
      window.SimPractice.loadOverview();
      const sp = $('sim-practice-root');
      if (sp) window.SimPractice.mount({ course: sp.dataset.course, self: sp.dataset.name === myName(), name: sp.dataset.name });
    }
    if ($('guide-exam-board') && window.GuideExam) {
      const areaNames = state.tab === 'area' ? areaStaffNames() : null;
      window.GuideExam.mountBoard({
        staff: areaNames ? activeStaff().filter((s) => areaNames.has(s.name)) : activeStaff(),
        leader: state.tab === 'weekly' ? state.leader || '' : areaNames ? '' : null,
        scoped: !!areaNames,
        highlight: state.tab === 'person' ? state.person : ''
      });
    }
    const gc = $('apt-compass-root');
    if (gc && window.GrowthCompass) {
      window.GrowthCompass.mount(gc, { person: gc.dataset.name, year: Number(gc.dataset.year), month: Number(gc.dataset.month) });
    }
    if ($('apt-plan-root') && window.ImprovePlan) {
      window.ImprovePlan.mount({ self: $('apt-plan-root').dataset.name === myName(), pf: state.planPf, end: state.meta?.range?.end || '' });
    }
  }

  /* ---------- 行政自己填寫公會意見：案件意見／清冊意見，每筆 1 點 ---------- */
  const OPINION_FORMS = {
    case: { title: '案件意見', item: '案件意見修正' },
    roster: { title: '清冊意見', item: '清冊意見修正' }
  };
  /** 清冊期數 → 星鴻「社會住宅期數」代碼（增辦四期＝4-1期） */
  const ROSTER_PERIODS = [['三期', 30], ['3-1期', 31], ['四期', 40], ['增辦四期', 41], ['五期', 50]];
  const ROSTER_FORMS = { '04': '表單04 出租人補助', '09': '表單09 業者服務補助' };
  const rosterItemCache = new Map();
  const opinionRef = (o) => (o.kind === 'case' ? o.caseNo : [o.rosterPeriod, o.caseNo].filter(Boolean).join('・')) || '';
  const opinionPts = (list) => list.filter((o) => !o.noPoints).length;
  const noPointsTag = (o) =>
    `<span class="apt-op-nopts-tag"${o.noPointsReason ? ` title="${esc(o.noPointsReason)}"` : ''}>不給點</span>${o.noPointsReason ? `<small class="apt-op-nopts-why">${esc(o.noPointsReason)}</small>` : ''}`;
  const normNo = (v) => String(v || '').replace(/\s+/g, '').replace(/臺/g, '台').toUpperCase();
  /** 表單04／09 一筆的摘要（存進意見、也用在選案件卡片） */
  function rosterItemText(it) {
    const parts = [`表單${it.form}`];
    if (it.form === '04') {
      if (it.who) parts.push(`出租人 ${it.who}`);
      parts.push(`實際 ${money(it.actual)}・申請 ${money(it.apply)}`);
      if (it.addr) parts.push(it.addr);
    } else {
      if (it.who) parts.push(`承租人 ${it.who}`);
      if (it.rent) parts.push(`租金 ${money(it.rent)}`);
      const fees = Object.entries(it.fees || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${money(v)}`);
      if (fees.length) parts.push(fees.join('、'));
      if (it.start) parts.push(`${it.start}～${it.end || ''}`);
    }
    parts.push([it.phase === '1' ? '期別一' : it.phase === '2' ? '期別二' : '', it.status].filter(Boolean).join('・'));
    return parts.filter(Boolean).join('｜');
  }

  function rosterItemCard(it, on) {
    const fees = it.form === '09' ? Object.entries(it.fees || {}).filter(([, v]) => v) : [];
    const lines = it.form === '04'
      ? [it.who && `出租人 <b>${esc(it.who)}</b>`, `實際 <b>${money(it.actual)}</b>・申請 <b>${money(it.apply)}</b> 元`, it.addr && esc(it.addr)]
      : [
          it.who && `承租人 <b>${esc(it.who)}</b>`,
          it.rent && `租金 <b>${money(it.rent)}</b> 元`,
          fees.length && fees.map(([k, v]) => `${esc(k)} <b>${money(v)}</b>`).join('、'),
          it.oneTime && '一次性費用',
          it.start && `租期 ${esc(it.start)}～${esc(it.end || '')}`
        ];
    return `<button type="button" class="apt-op-item${on ? ' is-on' : ''}" data-op-item="${esc(it.key)}" aria-pressed="${on}">
        <span class="apt-op-item-form apt-op-item-form--${it.form}">${esc(ROSTER_FORMS[it.form] || `表單${it.form}`)}</span>
        ${lines.filter(Boolean).map((l) => `<span>${l}</span>`).join('')}
        <small>${esc([it.company, it.phase === '1' ? '期別一' : it.phase === '2' ? '期別二' : '', it.status].filter(Boolean).join('・'))}${it.remark ? `｜備註：${esc(it.remark)}` : ''}</small>
        <i aria-hidden="true">${on ? '✓ 錯的是這件' : '點選'}</i>
      </button>`;
  }

  async function fetchRosterItems(region, code, guildPeriod) {
    const [y, m] = String(guildPeriod).split('/').map(Number);
    const key = `${region}|${code}|${y}|${m}`;
    if (!rosterItemCache.has(key)) {
      const q = new URLSearchParams({ region, period: String(code), year: String(y), month: String(m) });
      const job = fetch(`${RPA_BASE}/admin-points/roster-items?${q}`, { headers: { 'X-Skyfun-Session': token() } })
        .catch(() => {
          throw new Error('連不到星鴻資料服務');
        })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) throw new Error(data?.error || `清冊明細讀取失敗（HTTP ${res.status}）`);
          return data.items || [];
        });
      rosterItemCache.set(key, job);
      job.catch(() => rosterItemCache.delete(key));
    }
    return rosterItemCache.get(key);
  }

  /** 清冊意見：選縣市＋清冊期數後列出表單04／09 的媒合編號；同一編號多件時點選是哪一件 */
  function bindRosterPicker(form) {
    const el = form.elements;
    const hint = form.querySelector('.apt-op-roster-hint');
    const list = form.querySelector('#apt-op-roster-nos');
    const box = form.querySelector('.apt-op-items');
    const rp = { key: '', items: [], loaded: false, pick: '' };
    form._roster = rp;
    const matches = () => {
      const code = Core.opinionCaseCode(el.caseNo.value);
      if (!code) return [];
      return rp.items.filter((it) => Core.opinionCaseCode(it.no) === code);
    };
    const renderPick = () => {
      const hits = matches();
      if (hits.length && el.company) el.company.value = String(hits[0].no || '').includes('星華') ? '星華' : '星鴻';
      if (hits.length === 1) rp.pick = hits[0].key;
      else if (!hits.some((it) => it.key === rp.pick)) rp.pick = '';
      if (!el.caseNo.value.trim() || !rp.loaded) {
        box.hidden = true;
        box.innerHTML = '';
        return;
      }
      box.hidden = false;
      if (!hits.length) {
        box.innerHTML = '<p class="apt-op-items-note is-warn">這期清冊找不到這個媒合編號；確認沒打錯的話可以直接送出。</p>';
        return;
      }
      box.innerHTML = `<p class="apt-op-items-note">${hits.length > 1 ? `這個媒合編號在清冊有 <b>${hits.length} 件</b>，請點選是哪一件有錯 <em>*</em>` : '清冊裡的這一件：'}</p>
        <div class="apt-op-item-grid">${hits.map((it) => rosterItemCard(it, it.key === rp.pick)).join('')}</div>`;
    };
    const load = async () => {
      const region = el.region.value;
      const code = (ROSTER_PERIODS.find(([p]) => p === el.rosterPeriod.value) || [])[1];
      const gp = el.guildPeriod.value;
      if (!region || !code || !gp) {
        rp.key = '';
        rp.items = [];
        rp.loaded = false;
        list.innerHTML = '';
        hint.textContent = '先選縣市與清冊期數，會列出這期表單04、表單09的媒合編號';
        renderPick();
        return;
      }
      const key = `${region}|${code}|${gp}`;
      if (key === rp.key) return;
      rp.key = key;
      rp.loaded = false;
      list.innerHTML = '';
      renderPick();
      hint.textContent = `讀取 ${region} ${el.rosterPeriod.value}（${gp}）的表單04、表單09…第一次約 5～15 秒`;
      try {
        const items = await fetchRosterItems(region, code, gp);
        if (rp.key !== key) return;
        rp.items = items;
        rp.loaded = true;
        const byNo = new Map();
        for (const it of items) {
          if (!byNo.has(it.no)) byNo.set(it.no, []);
          byNo.get(it.no).push(it);
        }
        list.innerHTML = [...byNo].map(([no, arr]) => {
          const forms = ['04', '09'].map((f) => [f, arr.filter((x) => x.form === f).length]).filter(([, n]) => n).map(([f, n]) => `表單${f}${n > 1 ? `×${n}` : ''}`);
          const who = arr.find((x) => x.who)?.who || '';
          /* 下拉帶入的值先拿掉縣市（星鴻高雄F2M… → 星鴻F2M…），存檔也不帶縣市 */
          const clean = Core.canonicalOpinionCaseNo(no, region, '')?.value || no;
          return `<option value="${esc(clean)}" label="${esc([forms.join('、'), who].filter(Boolean).join('｜'))}">`;
        }).join('');
        const n04 = items.filter((x) => x.form === '04').length;
        hint.textContent = items.length
          ? `${byNo.size} 個媒合編號（表單04 ${n04} 筆、表單09 ${items.length - n04} 筆），可下拉選或直接輸入`
          : `${region} ${el.rosterPeriod.value} 在 ${gp} 沒有表單04／09 資料，請直接輸入媒合編號`;
        renderPick();
      } catch (err) {
        if (rp.key !== key) return;
        rp.key = '';
        hint.textContent = `清冊明細讀取失敗（${err.message}），請直接輸入媒合編號`;
      }
    };
    ['guildPeriod', 'region', 'rosterPeriod'].forEach((n) => el[n].addEventListener('change', load));
    el.caseNo.addEventListener('input', renderPick);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-op-item]');
      if (!b) return;
      rp.pick = b.dataset.opItem;
      renderPick();
      const msg = form.querySelector('.apt-op-msg');
      if (msg?.classList.contains('is-err')) {
        msg.textContent = '';
        msg.className = 'apt-op-msg';
      }
    });
    rp.reset = () => {
      rp.pick = '';
      renderPick();
    };
    rp.check = () => {
      const hits = matches();
      if (hits.length > 1 && !rp.pick) return `這個媒合編號在清冊有 ${hits.length} 件，請點選是哪一件有錯`;
      return '';
    };
    rp.matchNo = () => matches()[0]?.no || '';
    rp.itemText = () => {
      const it = matches().find((x) => x.key === rp.pick);
      return it ? rosterItemText(it) : '';
    };
    load();
  }

  function guildPeriods() {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear() - 1911}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }

  function myOpinions(kind) {
    const me = myName();
    return (state.sb?.opinions || []).filter((o) => o.kind === kind && o.name === me).slice().reverse();
  }

  /** 這天之後填的案件意見，填寫滿一天沒勾「已修正」會發 LINE 提醒（同 admin_points_opinion_remind_from） */
  const OP_REMIND_FROM = Date.parse('2026-10-15T00:00:00+08:00');
  const OP_FIX_MS = 864e5;

  function opDeadline(o) {
    const t = Date.parse(o.createdAt);
    return t >= OP_REMIND_FROM ? t + OP_FIX_MS : null;
  }

  function opLate(o) {
    const due = opDeadline(o);
    return !o.fixedAt && due != null && Date.now() > due;
  }

  function mdHm(ms) {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function opFixCell(o) {
    const due = opDeadline(o);
    const late = opLate(o);
    const note = o.fixedAt
      ? `${mdHm(Date.parse(o.fixedAt))} 勾選`
      : late
        ? `超過一天未修正${o.remindCount ? `・已提醒 ${o.remindCount} 次` : ''}`
        : due
          ? `${mdHm(due)} 前要勾`
          : '';
    return `<td class="apt-op-fix"><label class="apt-op-fixbox${o.fixedAt ? ' is-done' : late ? ' is-late' : ''}">
        <input type="checkbox" data-op-fixed="${o.id}"${o.fixedAt ? ' checked' : ''}><span>已修正</span></label>${note ? `<small>${note}</small>` : ''}</td>`;
  }

  /** 自己還沒勾「已修正」的案件意見（含其他業績月） */
  async function loadOpenOpinions() {
    if (!token()) return;
    try {
      const res = await window.skyfunAuth.rpc('admin_points_opinion_open', { p_token: token() });
      if (res?.ok) state.opOpen = res.opinions || [];
    } catch {
      /* 讀不到時只列本業績月 */
    }
    opBadge();
  }

  function opBadge() {
    for (const btn of document.querySelectorAll('[data-op-open]')) {
      const kind = btn.dataset.opOpen;
      const late = (state.opOpen || []).filter((o) => o.kind === kind && opLate(o)).length;
      let b = btn.querySelector('.apt-op-badge');
      if (!late) {
        b?.remove();
        continue;
      }
      if (!b) {
        b = document.createElement('span');
        b.className = 'apt-op-badge';
        btn.append(b);
      }
      b.textContent = `${late} 筆未修正`;
    }
  }

  async function setOpinionFixed(kind, box) {
    const id = Number(box.dataset.opFixed);
    const fixed = box.checked;
    box.disabled = true;
    try {
      const res = await window.skyfunAuth.rpc('admin_points_opinion_fix', { p_token: token(), p_id: id, p_fixed: fixed });
      if (!res?.ok) throw new Error(res?.error || '更新失敗');
      for (const o of [...(state.sb?.opinions || []), ...(state.opOpen || [])]) if (o.id === id) Object.assign(o, res.opinion);
      opBadge();
      const list = document.querySelector('#apt-op-mask .apt-op-list');
      if (list) list.innerHTML = opinionRows(kind);
    } catch (err) {
      box.checked = !fixed;
      box.disabled = false;
      window.alert(String(err.message || err));
    }
  }

  function opinionRows(kind) {
    const list = myOpinions(kind);
    const isCase = kind === 'case';
    const ids = new Set(list.map((o) => o.id));
    const others = (state.opOpen || []).filter((o) => o.kind === kind && !ids.has(o.id) && o.name === myName()).slice().reverse();
    const canEditOp = (o) => !!o?.id && (Core.isSupervisor(myName()) || o.name === myName());
    const guildCell = (o) => {
      if (!canEditOp(o)) return esc(o.guildPeriod);
      const cur = o.guildPeriod || '';
      const opts = [...new Set([...guildPeriods(), cur].filter(Boolean))].sort((a, b) => b.localeCompare(a));
      return `<select class="apt-op-edit-cat" data-op-edit="${o.id}" data-op-field="guildPeriod" aria-label="公會期數">${opts.map((p) => `<option${p === cur ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>`;
    };
    const dateCell = (o) =>
      canEditOp(o)
        ? `<input type="date" class="apt-op-edit-cat" data-op-edit="${o.id}" data-op-field="opinionDate" value="${esc(o.opinionDate || '')}" aria-label="意見時間">`
        : o.opinionDate
          ? esc(shortDate(o.opinionDate))
          : NIL;
    const catCell = (o) =>
      canEditOp(o)
        ? `<select class="apt-op-edit-cat" data-op-edit="${o.id}" data-op-field="category" aria-label="缺失類別">
            <option value="">（未分類）</option>
            ${(Core.OPINION_CATEGORIES[kind] || []).map((c) => `<option${c === o.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          </select>`
        : o.category
          ? esc(o.category)
          : NIL;
    const textCell = (o, field) =>
      canEditOp(o)
        ? `<textarea class="apt-op-edit-text" data-op-edit="${o.id}" data-op-field="${field}" rows="2">${esc(o[field] || '')}</textarea>`
        : o[field]
          ? esc(o[field])
          : NIL;
    const head = `<th>填寫日</th><th>公會期數</th><th>縣市</th>${isCase ? '<th>媒合編號</th>' : '<th>清冊期數</th><th>媒合編號</th>'}<th>意見時間</th><th>缺失類別</th><th>公會意見內容</th><th>行政檢討對策</th><th>已修正</th><th>點數</th><th></th>`;
    const rowCls = (o) => [o.noPoints && 'apt-op-nopts', opLate(o) && 'apt-op-late', ids.has(o.id) || 'apt-op-other'].filter((c) => typeof c === 'string');
    const rows = [...others, ...list]
      .map(
        (o) => `<tr${rowCls(o).length ? ` class="${rowCls(o).join(' ')}"` : ''}>
          <td>${esc(shortDate(o.date))}${ids.has(o.id) ? '' : '<small class="apt-op-other-tag">其他業績月</small>'}</td>
          <td>${guildCell(o)}</td>
          <td>${o.region ? esc(o.region) : NIL}</td>
          ${isCase
            ? `<td>${esc(o.caseNo)}</td>`
            : `<td>${esc(o.rosterPeriod)}</td><td>${o.caseNo ? esc(o.caseNo) : NIL}${o.rosterItem ? `<small class="apt-op-item-note">${esc(o.rosterItem)}</small>` : ''}</td>`}
          <td>${dateCell(o)}</td>
          <td>${catCell(o)}</td>
          <td class="apt-op-text">${textCell(o, 'content')}</td>
          <td class="apt-op-text apt-op-measure">${textCell(o, 'measure')}</td>
          ${opFixCell(o)}
          <td class="num">${o.noPoints ? noPointsTag(o) : 1}</td>
          <td>${ids.has(o.id) ? `<button type="button" class="apt-op-del" data-op-del="${o.id}">刪除</button>` : ''}</td>
        </tr>`
      )
      .join('');
    const range = state.meta?.range;
    const late = [...others, ...list].filter(opLate).length;
    return `<h4 class="apt-op-list-title">我在 ${range ? `${range.month} 月業績（${esc(range.start.slice(5))}～${esc(range.end.slice(5))}）` : '這個業績月'}填的${OPINION_FORMS[kind].title}<small>${list.length} 筆 · ${opinionPts(list)} 點</small></h4>
      <p class="apt-op-fix-tip${late ? ' is-late' : ''}">${late ? `⚠️ 有 <b>${late}</b> 筆超過一天還沒勾「已修正」，請盡快修正。` : '修正完成後請勾「已修正」。'}填寫滿一天還沒勾，會用 LINE 提醒填寫的人（每天最多一次）。${others.length ? '其他業績月還沒勾的也列在最上面。' : ''}</p>
      <div class="apt-table-wrap"><table class="apt-table apt-op-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${isCase ? 11 : 12}" class="apt-empty">還沒有填寫</td></tr>`}</tbody>
      </table></div>`;
  }

  function opinionFormHtml(kind) {
    const f = OPINION_FORMS[kind];
    const isCase = kind === 'case';
    const periods = guildPeriods().map((p) => `<option>${p}</option>`).join('');
    return `<div class="apt-op-modal" role="dialog" aria-modal="true" aria-label="填寫${f.title}">
        <header class="apt-op-head"><b>📝 填寫${f.title}</b><button type="button" class="apt-op-x" data-op-close aria-label="關閉">✕</button></header>
        <p class="apt-op-tip">每填一筆算 <b>1 點</b>，計入填寫當天所在業績月的「${f.item}」，點數算給填寫的人（${esc(myName() || '—')}）。媒合編號固定存成「星鴻／星華＋編號」（例：星鴻F2M10500502），<b>不帶縣市</b>（貼上「星鴻高雄F2M…」會自動拿掉高雄；縣市欄可不選、不防呆，期數不同編號格式不一照常送出）；同一媒合編號有多筆意見時，<b>只認列第一筆 1 點</b>，後面的筆數照常列入公會意見、但 0 點。若把有給點的那筆刪掉，點數會改算到剩下最早的一筆。</p>
        <form class="apt-op-form" data-op-kind="${kind}" novalidate>
          <label><span>公會期數 <em>*</em></span><select name="guildPeriod">${periods}</select></label>
          <label><span>縣市<small class="apt-op-auto">可不選，不防呆</small></span><select name="region"><option value="">（不選）</option>${Core.KPI_REGIONS.map((r) => `<option>${r}</option>`).join('')}</select></label>
          <label><span>公司 <em>*</em><small class="apt-op-auto">只打編號時用</small></span><select name="company"><option>星鴻</option><option>星華</option></select></label>
          ${isCase
            ? '<label><span>媒合編號 <em>*</em><small class="apt-op-auto">只打 F2M… 也會自動補齊，不帶縣市</small></span><input name="caseNo" maxlength="60" placeholder="例如 星鴻F2M10500502" autocomplete="off"></label>'
            : `<label><span>清冊期數 <em>*</em></span><select name="rosterPeriod"><option value="">請選擇</option>${ROSTER_PERIODS.map(([p]) => `<option>${p}</option>`).join('')}</select></label>`}
          <label><span>意見時間 <em>*</em></span><input type="date" name="opinionDate" required></label>
          ${isCase ? '' : `<div class="apt-op-wide apt-op-roster">
            <label><span>媒合編號 <em>*</em><small class="apt-op-auto apt-op-roster-hint">有選縣市與清冊期數會列出這期表單04、表單09的媒合編號，也可以直接輸入</small></span>
              <input name="caseNo" maxlength="60" list="apt-op-roster-nos" placeholder="下拉選擇或直接輸入，例如 星鴻F2M10500502（不帶縣市）" autocomplete="off"><datalist id="apt-op-roster-nos"></datalist></label>
            <div class="apt-op-items" hidden></div>
          </div>`}
          <label class="apt-op-wide"><span>缺失類別 <em>*</em><small class="apt-op-auto">同公會月報的${isCase ? '審件' : '清冊'}缺失分類，一筆意見選最主要的一項</small></span><select name="category" required><option value="">請選擇</option>${Core.OPINION_CATEGORIES[kind].map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          <label class="apt-op-wide"><span>公會意見內容 <em>*</em></span><textarea name="content" rows="3" maxlength="2000" placeholder="照公會回傳的意見填寫"></textarea></label>
          <label class="apt-op-wide apt-op-measure-field"><span>行政檢討對策 <em>*</em></span><textarea name="measure" rows="3" maxlength="2000" placeholder="這個意見要怎麼改善、之後怎麼避免"></textarea></label>
          <div class="apt-op-actions apt-op-wide"><button type="submit" class="apt-op-save">送出</button><span class="apt-op-msg" role="status" aria-live="polite"></span></div>
        </form>
        <div class="apt-op-list">${opinionRows(kind)}</div>
      </div>`;
  }

  function closeOpinion() {
    $('apt-op-mask')?.remove();
    document.removeEventListener('keydown', opinionKey);
  }

  function opinionKey(e) {
    if (e.key === 'Escape') closeOpinion();
  }

  function openOpinion(kind) {
    if (!OPINION_FORMS[kind]) return;
    closeOpinion();
    if (!token() || !myName()) {
      setMsg('請先登入工具箱才能填寫意見', 'err');
      return;
    }
    const mask = document.createElement('div');
    mask.id = 'apt-op-mask';
    mask.className = 'apt-op-mask';
    mask.innerHTML = opinionFormHtml(kind);
    document.body.appendChild(mask);
    document.addEventListener('keydown', opinionKey);
    mask.addEventListener('click', (e) => {
      if (e.target === mask || e.target.closest('[data-op-close]')) closeOpinion();
      const del = e.target.closest('[data-op-del]');
      if (del) deleteOpinion(kind, Number(del.dataset.opDel), del);
    });
    mask.addEventListener('change', (e) => {
      const box = e.target.closest('[data-op-fixed]');
      if (box) setOpinionFixed(kind, box);
      const edit = e.target.closest('[data-op-edit][data-op-field="category"], [data-op-edit][data-op-field="guildPeriod"], [data-op-edit][data-op-field="opinionDate"]');
      if (edit) saveOpinionFields(kind, edit);
    });
    mask.addEventListener('focusout', (e) => {
      const edit = e.target.closest('[data-op-edit][data-op-field="content"], [data-op-edit][data-op-field="measure"]');
      if (edit) saveOpinionFields(kind, edit);
    });
    const form = mask.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveOpinion(kind, e.currentTarget);
    });
    loadOpenOpinions().then(() => {
      const box = mask.isConnected && mask.querySelector('.apt-op-list');
      if (box) box.innerHTML = opinionRows(kind);
    });
    if (kind === 'case') {
      const region = form.elements.region;
      region.addEventListener('change', () => {
        region.dataset.manual = region.value ? '1' : '';
      });
      form.elements.caseNo.addEventListener('input', (e) => {
        const r = Core.kpiRegionOfCaseNo(e.target.value);
        if (r && !region.dataset.manual) region.value = r;
        if (e.target.value.includes('星華')) form.elements.company.value = '星華';
        else if (e.target.value.includes('星鴻') || e.target.value.includes('星鸿')) form.elements.company.value = '星鴻';
      });
      form.elements.caseNo.addEventListener('change', (e) => {
        const canon = Core.canonicalOpinionCaseNo(e.target.value, region.value, form.elements.company.value);
        if (canon) {
          e.target.value = canon.value;
          form.elements.company.value = canon.company;
        }
      });
    } else {
      bindRosterPicker(form);
      /* 清冊意見同樣防呆：貼上帶縣市的原始編號，離開欄位就拿掉縣市 */
      form.elements.caseNo.addEventListener('change', (e) => {
        const canon = Core.canonicalOpinionCaseNo(e.target.value, form.elements.region.value, form.elements.company.value);
        if (canon) {
          e.target.value = canon.value;
          form.elements.company.value = canon.company;
        }
      });
    }
    mask.querySelector(kind === 'case' ? '[name="caseNo"]' : '[name="region"]').focus();
  }

  async function saveOpinionFields(kind, el) {
    const id = Number(el.dataset.opEdit);
    const field = el.dataset.opField;
    if (!id || !field) return;
    const lists = [...myOpinions(kind), ...(state.opOpen || [])];
    const o = lists.find((x) => Number(x.id) === id);
    if (!o) return;
    const next = String(el.value || '');
    const prev = String(o[field] || '');
    if (next === prev) return;
    el.disabled = true;
    try {
      const patch = {
        p_token: token(),
        p_id: id,
        p_category: null,
        p_content: null,
        p_measure: null,
        p_guild_period: null,
        p_opinion_date: null
      };
      if (field === 'category') patch.p_category = next;
      if (field === 'content') patch.p_content = next;
      if (field === 'measure') patch.p_measure = next;
      if (field === 'guildPeriod') patch.p_guild_period = next;
      if (field === 'opinionDate') patch.p_opinion_date = next;
      const res = await window.skyfunAuth.rpc('admin_points_opinion_update', patch);
      if (!res?.ok) throw new Error(res?.error || '更新失敗');
      for (const row of [...(state.sb?.opinions || []), ...(state.opOpen || [])]) {
        if (Number(row.id) === id && res.opinion) Object.assign(row, res.opinion);
      }
    } catch (err) {
      el.value = prev;
      window.alert(String(err.message || err));
    } finally {
      el.disabled = false;
    }
  }

  async function refreshOpinionList(kind) {
    await load(false);
    const box = document.querySelector('#apt-op-mask .apt-op-list');
    if (box) box.innerHTML = opinionRows(kind);
  }

  async function saveOpinion(kind, form) {
    const msg = form.querySelector('.apt-op-msg');
    const btn = form.querySelector('.apt-op-save');
    const fd = new FormData(form);
    const data = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
    const fail = (t) => {
      msg.textContent = t;
      msg.className = 'apt-op-msg is-err';
    };
    if (kind === 'case' && !data.caseNo) return fail('請填媒合編號');
    if (kind === 'roster' && !data.rosterPeriod) return fail('請選清冊期數');
    if (kind === 'roster') {
      if (!data.caseNo) {
        form.elements.caseNo.focus();
        return fail('請填媒合編號');
      }
      const pickErr = form._roster?.check() || '';
      if (pickErr) return fail(pickErr);
      data.rosterItem = form._roster?.itemText() || '';
      data.caseNo = form._roster?.matchNo() || data.caseNo;
    }
    const canon = Core.canonicalOpinionCaseNo(data.caseNo, data.region, data.company);
    if (!canon) {
      form.elements.caseNo.focus();
      return fail('媒合編號格式不正確：請填後段編號（例如 F2M10500502），系統會組成「星鴻F2M10500502」（不帶縣市）');
    }
    /* 縣市不防呆：期數不同，有的編號有縣市、有的沒有，不比對也不擋 */
    data.caseNo = canon.value;
    data.region = data.region || canon.region || '';
    if (!data.opinionDate) {
      form.elements.opinionDate.focus();
      return fail('請填意見時間');
    }
    if (!data.category) {
      form.elements.category.focus();
      return fail('請選缺失類別');
    }
    if (!data.content) return fail('請填公會意見內容');
    if (!data.measure) {
      form.elements.measure?.focus();
      return fail('請填行政檢討對策');
    }
    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'apt-op-msg';
    try {
      const res = await window.skyfunAuth.rpc('admin_points_opinion_save', { p_token: token(), p_kind: kind, p_data: data });
      if (!res?.ok) throw new Error(res?.error || '送出失敗');
      ['caseNo', 'opinionDate', 'category', 'content', 'measure'].concat(kind === 'case' ? ['rosterPeriod'] : []).forEach((k) => {
        if (form.elements[k]) form.elements[k].value = '';
      });
      form._roster?.reset();
      if (kind === 'case') {
        form.elements.region.value = '';
        form.elements.region.dataset.manual = '';
      }
      if (form.elements.company) form.elements.company.value = '星鴻';
      msg.textContent = res.duplicate
        ? '✓ 已送出；這個媒合編號已有意見，只認列第一筆 1 點，本筆 0 點'
        : '✓ 已送出，+1 點';
      msg.className = 'apt-op-msg is-ok';
      await refreshOpinionList(kind);
    } catch (err) {
      fail(String(err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteOpinion(kind, id, btn) {
    if (!id) return;
    const o = [...myOpinions(kind), ...(state.opOpen || [])].find((x) => Number(x.id) === id);
    const msg = o?.noPoints
      ? '確定刪除這筆意見？這筆本來就是 0 點。'
      : '確定刪除這筆意見？若同一個媒合編號還有別筆，點數會改算到剩下最早的一筆；沒有的話就少 1 點。';
    if (!window.confirm(msg)) return;
    btn.disabled = true;
    try {
      const res = await window.skyfunAuth.rpc('admin_points_opinion_delete', { p_token: token(), p_id: id });
      if (!res?.ok) throw new Error(res?.error || '刪除失敗');
      await refreshOpinionList(kind);
    } catch (err) {
      btn.disabled = false;
      window.alert(String(err.message || err));
    }
  }

  function bind() {
    const sel = $('apt-month');
    sel.innerHTML = monthOptions()
      .map((m) => `<option value="${m.year}-${m.month}">${m.year - 1911} 年 ${m.month} 月（${m.start.slice(5)}～${m.end.slice(5)}）</option>`)
      .join('');
    state.monthKey = sel.value;
    sel.addEventListener('change', () => {
      state.monthKey = sel.value;
      state.spot = null;
      load(false);
    });
    $('apt-refresh').addEventListener('click', () => load(true));
    $('apt-tabs').addEventListener('click', (e) => {
      const op = e.target.closest('[data-op-open]');
      if (op) {
        openOpinion(op.dataset.opOpen);
        return;
      }
      const b = e.target.closest('.apt-tab');
      if (!b) return;
      state.tab = b.dataset.tab;
      render();
    });
    $('apt-body').addEventListener('toggle', (e) => {
      if (e.target.matches?.('[data-apt-board-fold]')) state.examBoardOpen = e.target.open;
    }, true);
    $('apt-body').addEventListener('click', (e) => {
      if (state.leaseDueCell && !state.lease?.dueSaving && !e.target.closest('.apt-lease-due-editing, [data-lease-due-cell]')) {
        state.leaseDueCell = null;
        render();
      }
      const sortTh = e.target.closest('[data-dur-sort]');
      if (sortTh) {
        const [table, key] = sortTh.dataset.durSort.split(':');
        const cur = state.durSorts[table];
        state.durSorts[table] = cur.key === key ? { key, dir: -cur.dir } : { key, dir: 0 };
        render();
        return;
      }
      const durBtn = e.target.closest('[data-dur-person]');
      const cityBtn = e.target.closest('[data-dur-city]');
      const viewBtn = e.target.closest('[data-dur-view]');
      if (durBtn || cityBtn) {
        state.durPerson = durBtn ? durBtn.dataset.durPerson : '';
        state.durCity = cityBtn ? cityBtn.dataset.durCity : '';
        state.durView = 'detail';
        render();
        return;
      }
      if (viewBtn) {
        state.durView = viewBtn.dataset.durView;
        render();
        return;
      }
      const guildCardEl = e.target.closest('[data-guild-kind]');
      if (guildCardEl) {
        const kind = guildCardEl.dataset.guildKind;
        state.guildOpen = state.guildOpen?.kind === kind ? null : { kind, period: '', city: state.guildOpen?.city || '' };
        render();
        return;
      }
      if (e.target.closest('[data-guild-close]')) {
        state.guildOpen = null;
        render();
        return;
      }
      const guildWideEl = e.target.closest('[data-guild-wide]');
      if (guildWideEl) {
        state.guildWide = guildWideEl.dataset.guildWide;
        render();
        return;
      }
      if (e.target.closest('[data-guild-table]')) {
        state.guildTableOpen = !state.guildTableOpen;
        render();
        return;
      }
      if (e.target.closest('[data-guild-cats-all]')) {
        state.guildCatsAll = !state.guildCatsAll;
        render();
        return;
      }
      const guildOffEl = e.target.closest('[data-guild-office]');
      if (guildOffEl) {
        state.guildOffOpen = state.guildOffOpen === guildOffEl.dataset.guildOffice ? '' : guildOffEl.dataset.guildOffice;
        render();
        return;
      }
      const guildOffRetry = e.target.closest('[data-guild-off-retry]');
      if (guildOffRetry) {
        state.guildOff.delete(guildOffRetry.dataset.guildOffRetry);
        render();
        return;
      }
      const snapRebuild = e.target.closest('[data-roster-snap-rebuild]');
      if (snapRebuild) {
        const p = snapRebuild.dataset.rosterSnapRebuild;
        const [year, month] = p.split('/').map(Number);
        const g = { year, month, guild: p };
        snapRebuild.disabled = true;
        snapRebuild.textContent = '建置中…';
        (async () => {
          try {
            let r = await rebuildRosterSnapshot(g);
            for (let i = 0; i < 80 && r && !r.done && !r.skipped; i++) {
              snapRebuild.textContent = `建置 ${r.progress?.done || 0}/${r.progress?.total || '?'}…`;
              await new Promise((ok) => setTimeout(ok, 3500));
              const res = await fetch(`${RPA_BASE}/admin-points/roster-snapshot/step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Skyfun-Session': token() },
                body: JSON.stringify({ year, month, continue: true })
              });
              r = await res.json().catch(() => null);
              if (!res.ok || !r?.ok) throw new Error(r?.error || '推進失敗');
            }
            state.rosterSnap.delete(p);
            try {
              localStorage.removeItem(`${ROSTER_SNAP_LS}:${p}`);
              localStorage.removeItem(`${ROSTER_SNAP_LITE_LS}:${p}`);
            } catch {
              /* ignore */
            }
            state.rosterOff.delete(p);
            state.guildSys.delete(p);
            loadRosterOffices(p, true);
            guildSysPeriod(p).then(guildRerender);
          } catch (err) {
            alert(String(err.message || err));
          } finally {
            snapRebuild.disabled = false;
            snapRebuild.textContent = '強制更新';
            guildRerender();
          }
        })();
        return;
      }
      const rosterOffRetry = e.target.closest('[data-roster-off-retry]');
      if (rosterOffRetry) {
        const p = rosterOffRetry.dataset.rosterOffRetry;
        try {
          localStorage.removeItem(`${ROSTER_REV_LS}:${p}`);
        } catch {
          /* ignore */
        }
        state.rosterOff.delete(p);
        loadRosterOffices(p, true);
        render();
        return;
      }
      const guildCityEl = e.target.closest('[data-guild-city]');
      if (guildCityEl && state.guildOpen) {
        const city = guildCityEl.dataset.guildCity;
        state.guildOpen.city = state.guildOpen.city === city ? '' : city;
        render();
        return;
      }
      const guildMonthEl = e.target.closest('[data-guild-month], [data-pick="guild-month"]');
      if (guildMonthEl && state.guildOpen) {
        const cur = state.guildYear?.cur;
        const period = guildMonthEl.dataset.guildMonth || (cur ? guildPeriodOf(cur.year, Number(guildMonthEl.dataset.pickI) + 1) : '');
        if (period !== 'year' && cur && period > cur.guild) {
          setMsg(`公會期數 ${period} 還沒有資料，目前最新是 ${cur.guild}。`, 'warn');
          return;
        }
        state.guildOpen.period = period;
        render();
        return;
      }
      const pickEl = e.target.closest('[data-pick]');
      if (pickEl || e.target.closest('[data-pick-close]')) {
        const id = pickEl?.dataset.pick;
        const i = Number(pickEl?.dataset.pickI);
        state.pick = pickEl && picked(id) !== i ? { key: pickKey(), id, i } : null;
        render();
        return;
      }
      const pviewBtn = e.target.closest('[data-pview]');
      if (pviewBtn) {
        state.personView = pviewBtn.dataset.pview;
        render();
        return;
      }
      const weekBtn = e.target.closest('[data-train-week]');
      if (weekBtn) {
        const box = weekBtn.closest('.apt-train-week');
        const open = !box.classList.contains('is-open');
        state.trainWeeksOpen[weekBtn.dataset.trainWeek] = open;
        box.classList.toggle('is-open', open);
        weekBtn.setAttribute('aria-expanded', String(open));
        return;
      }
      const courseToggle = e.target.closest('[data-course-toggle]');
      if (courseToggle) {
        const box = courseToggle.closest('.apt-course');
        const open = !box.classList.contains('is-open');
        state.courseOpen[courseToggle.dataset.courseToggle] = open;
        box.classList.toggle('is-open', open);
        courseToggle.setAttribute('aria-expanded', String(open));
        return;
      }
      if (e.target.closest('[data-train-close]')) {
        state.trainShut = true;
        render();
        return;
      }
      if (e.target.closest('[data-lease-fold]')) {
        state.leaseFolded = !state.leaseFolded;
        render();
        return;
      }
      const trainBtn = e.target.closest('[data-train-node]');
      if (trainBtn) {
        state.personView = 'training';
        const key = trainBtn.dataset.trainNode;
        if (!state.trainShut && state.trainNode === key && trainBtn.classList.contains('is-active')) {
          state.trainShut = true;
          render();
          return;
        }
        state.trainNode = key;
        state.trainShut = false;
        render();
        return;
      }
      const nodeRow = e.target.closest('[data-goto-node]');
      if (nodeRow) {
        state.tab = 'duration';
        state.durView = 'detail';
        state.durPerson = state.person;
        state.durBy = nodeRow.dataset.gotoNode;
        state.durCity = '';
        render();
        return;
      }
      const spotIdx = (attr) => {
        const el = e.target.closest(`[${attr}]`);
        return el ? Number(el.getAttribute(attr)) : null;
      };
      const passIdx = spotIdx('data-spot-pass');
      if (passIdx != null) {
        saveSpot(passIdx, true, '');
        return;
      }
      const failIdx = spotIdx('data-spot-fail');
      const redoIdx = spotIdx('data-spot-redo');
      if (failIdx != null || redoIdx != null) {
        state.spotEdit = state.spotEdit || {};
        state.spotEdit[failIdx ?? redoIdx] = failIdx != null ? 'fail' : 'choose';
        render();
        if (failIdx != null) $(`apt-spot-reason-${failIdx}`)?.focus();
        return;
      }
      const cancelIdx = spotIdx('data-spot-cancel');
      if (cancelIdx != null) {
        delete state.spotEdit[cancelIdx];
        render();
        return;
      }
      const sendIdx = spotIdx('data-spot-send');
      if (sendIdx != null) {
        const reason = String($(`apt-spot-reason-${sendIdx}`)?.value || '').trim();
        if (!reason) {
          setMsg('未通過請填寫原因', 'warn');
          $(`apt-spot-reason-${sendIdx}`)?.focus();
          return;
        }
        saveSpot(sendIdx, false, reason);
        return;
      }
      const spotCopy = e.target.closest('[data-spot-copy]');
      if (spotCopy) {
        e.preventDefault();
        copyText(spotCopy.dataset.spotCopy).then((ok) => {
          spotCopy.textContent = ok ? '已複製 ✓' : '複製失敗';
          spotCopy.classList.toggle('is-done', ok);
        });
        return;
      }
      if (e.target.closest('#apt-spot')) {
        drawSpot();
        return;
      }
      const rosterRegion = e.target.closest('[data-roster-region]');
      if (rosterRegion) {
        state.rosterRegion = rosterRegion.dataset.rosterRegion;
        render();
        return;
      }
      const dueKind = e.target.closest('[data-lease-due-kind]');
      if (dueKind) {
        state.leaseDueKind = dueKind.dataset.leaseDueKind;
        state.leaseDueCell = null;
        render();
        return;
      }
      const dueCell = e.target.closest('[data-lease-due-cell]');
      if (dueCell) {
        openLeaseDueCell(dueCell.dataset.leaseDueCell);
        return;
      }
      const dueClear = e.target.closest('[data-lease-due-clear]');
      if (dueClear) {
        if (state.meta?.range) saveLeaseDue(state.meta.range, dueClear.dataset.leaseDueClear, '');
        return;
      }
      const leaseAll = e.target.closest('[data-lease-all]');
      if (leaseAll) {
        saveLeaseCheckAll(leaseAll.dataset.leaseAll.split(',').filter(Boolean));
        return;
      }
      const leaseClear = e.target.closest('[data-lease-clear]');
      if (leaseClear) {
        saveLeaseCheckAll(leaseClear.dataset.leaseClear.split(',').filter(Boolean), false);
        return;
      }
      const leaseBtn = e.target.closest('[data-lease-region]');
      if (leaseBtn) {
        toggleLeaseRegion(leaseBtn.dataset.leaseRegion);
        return;
      }
      const leaderBtn = e.target.closest('[data-pick-leader]');
      if (leaderBtn) {
        state.leader = leaderBtn.dataset.pickLeader;
        state.spot = null;
        render();
        return;
      }
      const areaBtn = e.target.closest('[data-pick-area]');
      if (areaBtn) {
        state.area = areaBtn.dataset.pickArea;
        state.areaOffice = '';
        render();
        return;
      }
      const officeBtn = e.target.closest('[data-pick-office]');
      if (officeBtn) {
        const o = officeBtn.dataset.pickOffice;
        state.areaOffice = state.areaOffice === o ? '' : o;
        render();
        return;
      }
      const pointBtn = e.target.closest('[data-point-person]');
      if (pointBtn) {
        const name = pointBtn.dataset.pointPerson;
        state.openPoint = state.openPoint === name ? '' : name;
        render();
        return;
      }
      const nameBtn = e.target.closest('[data-person]');
      if (nameBtn) {
        if (!PERSON_OPEN) {
          setMsg('個人績效還沒開放，敬請期待。', 'warn');
          return;
        }
        if (!canSee(nameBtn.dataset.person)) {
          setMsg(`個人績效只能看自己${myName() ? '' : '（請先登入）'}；${nameBtn.dataset.person} 的明細沒有權限查看。`, 'warn');
          return;
        }
        state.person = nameBtn.dataset.person;
        state.tab = 'person';
        render();
        return;
      }
      const dayBtn = e.target.closest('.apt-day-toggle');
      if (dayBtn) {
        const row = $('apt-body').querySelector(`[data-day-detail="${dayBtn.dataset.day}"]`);
        if (row) row.hidden = !row.hidden;
      }
    });
    $('apt-body').addEventListener(
      'toggle',
      (e) => {
        if (e.target.dataset?.fold === 'nonAdmin') state.nonAdminOpen = e.target.open;
        if (e.target.dataset?.fold === 'personErr') state.personErrOpen = e.target.open;
      },
      true
    );
    $('apt-body').addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.target.dataset?.leaseDueInput && !state.lease?.dueSaving) {
        state.leaseDueCell = null;
        render();
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-pick], [data-guild-kind], td[data-guild-month]')) {
        e.preventDefault();
        e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    $('apt-body').addEventListener('change', (e) => {
      if (e.target.dataset?.leaseCheck) {
        saveLeaseCheck(e.target.dataset.leaseCheck, e.target.checked);
        return;
      }
      if (e.target.dataset?.rosterCheck) {
        if (state.meta?.range) saveRosterProgress(state.meta.range, e.target.dataset.rosterCheck, e.target.checked);
        return;
      }
      if (e.target.dataset?.leaseDueInput) {
        const v = e.target.value;
        if (state.meta?.range && (!v || Number(v.slice(0, 4)) >= 2000)) saveLeaseDue(state.meta.range, e.target.dataset.leaseDueInput, v);
        return;
      }
      if (e.target.id === 'apt-person') state.person = e.target.value;
      else if (e.target.id === 'apt-leader') {
        state.leader = e.target.value;
        state.spot = null;
      } else if (e.target.id === 'apt-area') {
        state.area = e.target.value;
        state.areaOffice = '';
      }
      else if (e.target.id === 'apt-dur-by') state.durBy = e.target.value;
      else if (e.target.id === 'apt-dur-person') state.durPerson = e.target.value;
      else if (e.target.id === 'apt-dur-city') state.durCity = e.target.value;
      else return;
      render();
    });
  }

  /** 行政專區的「成長羅盤」入口：直接開個人明細的羅盤分頁（預設看自己） */
  window.adminPointsOpenCompass = function () {
    if (!PERSON_OPEN) return;
    state.tab = 'person';
    state.personView = 'overall';
    if (typeof window.showPage === 'function') window.showPage('admin-points');
    if (state.result) render();
  };

  /** 行政專區「行政績效中心」卡片：本業績月點數前三名（Worker 有快取，不強制重抓；同一分頁 10 分鐘內沿用） */
  const TOP_KEY = 'skyfun-apt-top3-v1';
  let topLoading = null;

  async function currentTop3() {
    const range = monthOptions()[0];
    const key = `${range.start}:${range.end}`;
    if (state.result && state.meta?.range?.start === range.start) {
      return state.result.people.filter((p) => p.month.total > 0).slice(0, 3).map((p) => ({ name: p.name, points: p.month.total }));
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOP_KEY) || 'null');
      if (saved?.key === key && Date.now() - saved.at < 10 * 60 * 1000) return saved.top;
    } catch { /* 沒存過就重算 */ }
    const [audit, expenses, term, sb] = await Promise.all([
      fetchWorker('/admin-points/audit-log', '審核時間紀錄', range, false),
      fetchWorker('/admin-points/expenses', '補助審核', range, false),
      fetchTerminations(range, false),
      fetchSupabase(range)
    ]);
    const result = Core.compute(auditRowsOf(audit), {
      start: range.start,
      end: range.end,
      staff: sb.staff || [],
      exclude: sb.excluded,
      manual: sb.manual || [],
      opinions: sb.opinions || [],
      expenses: auditRowsOf(expenses),
      terminations: auditRowsOf(term)
    });
    const top = result.people.filter((p) => p.month.total > 0).slice(0, 3).map((p) => ({ name: p.name, points: p.month.total }));
    try { sessionStorage.setItem(TOP_KEY, JSON.stringify({ key, at: Date.now(), top })); } catch { /* 存不了就算了 */ }
    return top;
  }

  window.adminPointsCardTop = async function () {
    const el = $('apt-card-top');
    if (!el || !token() || topLoading) return;
    if (!el.innerHTML) el.innerHTML = '<span class="adz-top-empty">前三名讀取中…</span>';
    topLoading = currentTop3();
    try {
      const top = await topLoading;
      const medals = ['🥇', '🥈', '🥉'];
      el.innerHTML = top.length
        ? top.map((p, i) => `<span class="adz-top-item"><i>${medals[i]}</i><span>${esc(p.name)}</span><b>${num1(Math.round(p.points * 10) / 10)}<small>點</small></b></span>`).join('')
        : '<span class="adz-top-empty">本月還沒有點數</span>';
    } catch {
      el.innerHTML = '';
    } finally {
      topLoading = null;
    }
  };

  window.adminPointsInit = function () {
    if (!$('page-admin-points')) return;
    if (!state.inited) {
      state.inited = true;
      bind();
      const refreshTraining = () => {
        document.querySelectorAll('[data-course-of]').forEach((el) => {
          const c = courseCache.get(el.dataset.courseOf);
          if (!c) return;
          const opened = el.querySelector('[data-train-slot]');
          const keep = opened ? [...opened.childNodes] : [];
          const tpl = document.createElement('template');
          tpl.innerHTML = courseBlocks(c.pf, c.active).trim();
          const fresh = tpl.content.firstElementChild;
          el.replaceWith(fresh);
          if (keep.length) fresh.querySelector('[data-train-slot]')?.append(...keep);
        });
        document.querySelectorAll('[data-train-count]').forEach((el) => {
          const c = courseCache.get(el.dataset.trainCount);
          if (c) el.textContent = trainCountText(c.pf);
        });
        document.querySelectorAll('[data-train-box]').forEach((el) => {
          const [key, name] = el.dataset.trainBox.split('|');
          el.outerHTML = trainBoxHtml(key, name);
        });
        document.querySelectorAll('[data-train-dash]').forEach((el) => {
          const [key, name] = el.dataset.trainDash.split('|');
          el.outerHTML = trainDashHtml(key, name);
        });
      };
      window.GuideExam?.onChange(() => {
        refreshTraining();
        document.querySelectorAll('[data-gx-prog]').forEach((el) => {
          el.textContent = guideExamText(el.dataset.gxProg);
        });
      });
      window.CourseExam?.onChange(() => {
        refreshTraining();
        document.querySelectorAll('[data-cx-prog]').forEach((el) => {
          const [course, name] = el.dataset.cxProg.split('|');
          el.textContent = courseExamText(course, name);
        });
      });
      window.SimPractice?.onChange(refreshTraining);
    }
    if (!state.result) load(false);
  };

  document.addEventListener('skyfun-auth-ready', () => {
    const page = $('page-admin-points');
    if (state.inited && !state.result && page && !page.classList.contains('hidden')) load(false);
  });
})();
