/**
 * 行政點數表：星鴻審核時間紀錄、補助審核（Worker）＋人力明細／組長手填點數（Supabase）
 */
(function () {
  const Core = window.AdminPointsCore;
  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  const ITEMS = Core.AUTO_ITEMS;
  const MANUAL_KEYS = Core.MANUAL_ITEMS.map((i) => i.key);
  const $ = (id) => document.getElementById(id);
  /** 個人明細先只在預覽站與本機開放，正式站隱藏 */
  const PERSON_OPEN = /(^|\.)pages\.dev$|^localhost$|^127\./.test(location.hostname);
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
    nonAdminOpen: false,
    year: null,
    yearCache: new Map(),
    week: '',
    leader: '',
    spot: null,
    durBy: 'all',
    durView: 'rank',
    durPerson: '',
    durCity: '',
    durSorts: {
      rank: { key: 'avg', dir: 1 },
      region: { key: 'name', dir: 1 },
      detail: { key: 'time', dir: -1 },
      weekly: { key: 'weekPoints', dir: -1 }
    },
    auditRows: [],
    sb: null,
    prev: null,
    pick: null,
    openPoint: '',
    lkpi: null
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
    return data;
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
      state.auditRows = Core.rowsFromPayload(audit);
      state.expenseRows = Core.rowsFromPayload(expenses);
      state.lkpi = null;
      state.result = Core.compute(state.auditRows, {
        start: range.start,
        end: range.end,
        staff: sb.staff || [],
        manual: sb.manual || [],
        opinions: sb.opinions || [],
        expenses: state.expenseRows,
        terminations: Core.rowsFromPayload(term)
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
      ? `<details class="apt-pd-group"><summary><b>自己填的公會意見</b>${opinions.length} 筆 · ${opinions.length} 點</summary>
          <div class="apt-table-wrap"><table class="apt-table apt-pd-table"><thead><tr><th>填寫日</th><th>類別</th><th>公會期數</th><th>媒合編號／清冊期數</th><th>公會意見內容</th></tr></thead>
          <tbody>${opinions.map((o) => `<tr><td>${esc(shortDate(o.date))}</td><td>${o.kind === 'case' ? '案件意見' : '清冊意見'}</td><td>${esc(o.guildPeriod)}</td><td>${esc(o.kind === 'case' ? o.caseNo : o.rosterPeriod)}</td><td class="apt-pd-left">${esc(o.content)}</td></tr>`).join('')}</tbody></table></div></details>`
      : '';
    return `${head}<div class="apt-pd-groups">${groups}${manualBox}${opinionBox}</div>
      <p class="apt-pd-foot">點上面的項目可以展開每一件。<button type="button" class="apt-pd-more" data-person="${esc(p.name)}">看完整個人明細（每日、耗時、評等）→</button></p>`;
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
            <span class="apt-tile-num"><b style="color:${t.tone}">${t.value}</b><small>${t.unit}</small></span>
            <span class="apt-tile-ring">${t.ring()}</span>
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

  function courseBlocks(pf, active) {
    courseCache.set(pf.name, { pf, active });
    const cs = Core.courseScores((key) => trainState(key, pf.name));
    const byKey = new Map(pf.training.map((s) => [s.key, s]));
    const g = Math.round(cs.generalScore);
    const weeks = cs.weeks
      .map((w) => {
        const label = `第${WEEK_CN[w.week - 1]}週`;
        const done = w.items.filter((c) => trainState(c.key, pf.name).done).length;
        return `<div class="apt-train-week">
          <div class="apt-train-week-head"><b>${label}</b><small>${w.items.map((c) => esc(c.label)).join('、')}</small><span>${done}／${w.items.length} 項通過</span></div>
          <div class="apt-skills apt-trains apt-trains--week">${w.items.map((c) => courseCard(pf, byKey.get(c.key), c, active, label)).join('')}</div>
        </div>`;
      })
      .join('');
    return `<div class="apt-course-wrap" data-course-of="${esc(pf.name)}">
        <div class="apt-course apt-course--general">
          <div class="apt-course-head">
            <div class="apt-course-name"><b>📘 行政教育訓練（五週課程）</b><small>每週 2～3 項，照週次完成；每一項比重相同。有影片的課程要看完影片、考試滿分、實作完成才算通過（各占 1／3 分數），執行要點依考試進度計分</small></div>
            <div class="apt-course-total"><span>訓練總分</span><strong style="color:${scoreColor(g)}">${g}</strong><small>／100</small></div>
            <span class="apt-course-bar"><i style="width:${g}%;background:${scoreColor(g)}"></i></span>
          </div>
          ${weeks}
        </div>
        <div class="apt-course apt-course--project">
          <div class="apt-course-head">
            <div class="apt-course-name"><b>🗂️ 專案課程</b><small>單獨科目，每一科各自 100 分，不併入訓練總分</small></div>
          </div>
          <div class="apt-skills apt-trains apt-trains--project">${cs.projects.map((c) => courseCard(pf, byKey.get(c.key), c, active, '獨立 100 分')).join('')}</div>
        </div>
      </div>`;
  }

  function trainCountText(pf) {
    const done = pf.training.filter((s) => trainState(s.key, pf.name).done).length;
    return `${done}／${pf.training.length} 項通過；點項目看各自的教育訓練`;
  }

  function trainingGrid(pf, active) {
    return `<h4 class="apt-sec-title">教育訓練<small data-train-count="${esc(pf.name)}">${trainCountText(pf)}</small></h4>
      ${courseBlocks(pf, active)}`;
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
          auditRows = Core.rowsFromPayload(audit);
          sb = sbData;
          result = Core.compute(auditRows, {
            start: mr.start,
            end: mr.end,
            staff: sb.staff || [],
            manual: sb.manual || [],
            opinions: sb.opinions || [],
            expenses: Core.rowsFromPayload(expenses),
            terminations: Core.rowsFromPayload(term)
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
      <details class="apt-board-fold">
        <summary class="apt-sec-title">所有落後與亮點</summary>
        ${weakStrong(pf, null)}
        <p class="apt-sub-note">件數少於 3 件的節點或項目不列入落後／亮點判斷。比較對象為人力明細在職正職（不含工讀生）。</p>
      </details>`;
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
    if (!m?.summary && !sections.length && !links.length && !tables.length && !videos.length) {
      return '<p class="apt-train-empty">教材準備中，內容上架後會顯示在這裡。</p>';
    }
    return `${m.summary ? `<p class="apt-train-summary">${esc(m.summary)}</p>` : ''}
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

  function profileTraining(ctx) {
    const { pf } = ctx;
    const fmt = Core.formatDuration;
    const yc = yearCounts(ctx.year);
    const s = pf.training.find((x) => x.key === state.trainNode) || pf.training[0];
    const year = yc?.get(s.key);
    const knows = s.count || s.reviews || year;
    const trainBox = trainBoxHtml(s.key, pf.name);
    if (s.general) {
      return `${trainingGrid(pf, s.key)}
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練</h4>
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
      </div>`;
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
      return `${trainingGrid(pf, s.key)}
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練</h4>
        <div class="apt-train-split">
          <div class="apt-train-col">
            ${status}
            <h5 class="apt-sec-title">線上考試</h5>
            <div id="course-exam-root" data-course="${s.key}" data-name="${esc(pf.name)}"></div>
            ${window.SimPractice ? `<h5 class="apt-sec-title">實作（模擬系統）</h5><div id="sim-practice-root" data-course="${s.key}" data-name="${esc(pf.name)}"></div>` : ''}
          </div>
          <div class="apt-train-col apt-train-col--material">
            <h5 class="apt-sec-title">教材</h5>
            ${trainingMaterial(s.key)}
          </div>
        </div>
      </div>`;
    }
    return `${trainingGrid(pf, s.key)}
      <div class="apt-train-page">
        <h4 class="apt-train-title">${esc(s.label)}　教育訓練</h4>
        ${status}
        <h5 class="apt-sec-title">教材</h5>
        ${trainingMaterial(s.key)}
      </div>`;
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
      const res = Core.compute(Core.rowsFromPayload(audit), {
        start: pr.start,
        end: pr.end,
        staff: sb.staff || [],
        manual: sb.manual || [],
        opinions: sb.opinions || [],
        expenses: Core.rowsFromPayload(expenses),
        terminations: Core.rowsFromPayload(term)
      });
      state.prev = { key, totals: new Map(res.people.map((p) => [p.name, p.month.total])) };
    } catch (err) {
      state.prev = { key, error: String(err.message || err) };
    }
    if (state.tab === 'weekly') render();
  }

  function money(n) {
    return n ? n.toLocaleString('en-US') : '0';
  }

  function renderWeekly() {
    const range = state.meta.range;
    const sb = state.sb || {};
    const weeks = Core.weeksOf(range);
    const week = weeks.find((w) => w.start === state.week) || weeks[0];
    const leaders = [...new Set((sb.staff || []).map((s) => s.leader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
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
      leader: state.leader
    });
    if (rep.rows.some((r) => r.bonusPending) && state.prev?.key !== prevKey) loadPrev(range);
    const prevErr = state.prev?.key === prevKey && state.prev.error;
    const short = (d) => d.slice(5).replace('-', '/');
    const weekOpts = weeks
      .map((w) => `<option value="${w.start}"${w.start === week.start ? ' selected' : ''}>${short(w.start)}～${short(w.end)}</option>`)
      .join('');
    const scopes = new Map(Core.leaderScopes(sb.staff || []).map((x) => [x.leader, x]));
    const areaText = (l) => scopes.get(l)?.areas.join('・') || '';
    const leaderOpts = ['', ...leaders]
      .map((l) => `<option value="${esc(l)}"${l === state.leader ? ' selected' : ''}>${l ? `${esc(l)}${areaText(l) ? `（${esc(areaText(l))}）` : ''}` : '全部組長'}</option>`)
      .join('');
    const s = rep.summary;
    const bonusCell = (r) => {
      if (r.bonusPending) return prevErr ? '<span title="上月點數讀取失敗，未套用八折判斷">?</span>' : '計算中…';
      return money(r.bonus);
    };
    const penaltyLevel = { 無: 0, 小過: 1, 大過: 2 };
    const cols = [
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
    const { sorted, ranks } = sortedRows('weekly', cols, rep.rows);
    const rows = sorted
      .map(
        (r, i) => `<tr class="${r.eligible ? '' : 'apt-row-muted'}">
          <td class="apt-rank">${ranks[i]}</td>
          ${cols.map((c) => c.cell(r)).join('')}
        </tr>`
      )
      .join('');
    return `<div class="apt-sub-bar">
        <label>週 <select id="apt-week">${weekOpts}</select></label>
        <label class="${state.leader ? 'apt-leader-picked' : ''}">組長 <select id="apt-leader">${leaderOpts}</select></label>
        <span class="apt-sub-note">本週總點數 <b>${s.weekPoints}</b> · 本週登錄人數 <b>${s.active}</b> · 本週審件良率 ${rateChip(s.rate) || '<b>-</b>'} · 本週客訴件數 <b>${s.complaints}</b></span>
      </div>
      ${leaderBanner(state.leader ? scopes.get(state.leader) || { leader: state.leader, members: rep.rows.length, regions: [], areas: [], cities: [] } : null, [...scopes.values()])}
      <div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>#</th>${sortHead('weekly', cols)}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols.length + 1}" class="apt-empty">沒有符合的人員</td></tr>`}</tbody>
      </table></div>
      <p class="apt-sub-note">點欄位標題就用那一欄排序，再點一次反過來；# 是目前排序的名次（同值同名次）。本週點數、審件抽查／正確／良率、客訴件數依所選週（週一～週日）加總；月累積點數、月度級距、預估個人獎金、本月懲處依業績月。不含工讀生。到職未滿一個月（以週結束日判斷）為「新人首月排除」，不發獎金。預估獎金：達 ${Core.STAGE_1} 點 2,000、達 ${Core.STAGE_2} 點 5,000，上個業績月未達 ${Core.STAGE_1} 點打八折；達 ${Core.STAGE_1} 點另加專案任務（清冊＋公會對接 3,000、實價登錄 2,000）。審件良率顏色：90% 以上綠、60%～未滿 90% 黃、未滿 60% 紅（同主管簡報）。${prevErr ? `<br><span class="apt-bad">上月點數讀取失敗：${esc(prevErr)}</span>` : ''}</p>
      ${leaderKpiSection(range, week, state.leader ? scopes.get(state.leader) || { leader: state.leader, cities: [] } : null)}
      ${guideBoardSection(state.leader ? `${state.leader} 組` : '全部組別')}`;
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

  async function fetchKpiPart(m, part) {
    let res;
    try {
      res = await fetch(`${RPA_BASE}/admin-points/kpi?year=${m.year}&month=${m.month}&part=${part}`, {
        headers: { 'X-Skyfun-Session': token() }
      });
    } catch {
      throw new Error('連不到星鴻資料服務（Worker）');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `表單04／07、媒合管理讀取失敗（HTTP ${res.status}）`);
    return data;
  }

  async function loadLeaderKpi(range) {
    const key = `${range.year}-${range.month}`;
    const g = prevGuild(range);
    const lk = { key, busy: true, guild: g.guild, takeup: null, tenant: null, quality: null };
    state.lkpi = lk;
    const [tc, quality] = await Promise.all([
      fetchWorker('/admin-points/tenant-cities', '房客地區', range).catch((e) => ({ rows: [], pending: 0, error: e.message })),
      Promise.all([
        fetchKpiPart(g, 'roster04'),
        fetchKpiPart(g, 'roster07'),
        fetchKpiPart(g, 'cases'),
        window.skyfunAuth.rpc('admin_points_kpi_opinions_view', { p_token: token(), p_guild_period: g.guild })
      ])
        .then(([r04, r07, cases, op]) => {
          if (!op?.ok) throw new Error(op?.error || '公會意見讀取失敗');
          return Core.kpiQuality(r04, r07, cases, op.opinions);
        })
        .catch((e) => ({ error: String(e.message || e) }))
    ]);
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
    lk.quality = quality;
    lk.busy = false;
    if (state.tab === 'weekly') render();
  }

  /** scope：選了組長＝該組管理縣市對到的 KPI 地區（加小計）；全部組長＝全區＋12 區 */
  function leaderKpiSection(range, week, scope) {
    const key = `${range.year}-${range.month}`;
    if (state.lkpi?.key !== key) loadLeaderKpi(range).catch((e) => console.warn('組長週報 KPI', e));
    const lk = state.lkpi;
    const regions = scope ? Core.kpiRegionsOfAreas(scope.areas) : ['全區', ...Core.KPI_REGIONS];
    const title = `<h4 class="apt-sec-title">${scope ? `${esc(scope.leader)} 組負責地區（${esc((scope.areas || []).join('・'))}）` : '各地區'}｜第一階段達成率・行政承接率・清冊／審件作業良率</h4>`;
    if (!regions.length) return `${title}<p class="apt-empty">這位組長的組員在人力明細沒有部別，對不到地區</p>`;
    const cols = scope && regions.length > 1 ? [...regions, '小計'] : regions;
    const partsOf = (g) => (g === '小計' ? regions : [g]);
    const short = (d) => d.slice(5).replace('-', '/');

    const stageEnd = week.end < range.end ? week.end : range.end;
    const stage = state.result ? Core.kpiStageReport(state.result, { staff: state.sb?.staff || [], weeks: [{ start: range.start, end: stageEnd }] }) : null;
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
    if (lk?.tenant?.error) notes.push(`房客地區暫時查不到（${lk.tenant.error}），房審只算在全區`);
    else if (lk?.tenant?.pending) notes.push(`還有 ${lk.tenant.pending} 位房客的地區在查詢中，稍後按「重新整理」會補上`);
    return `${title}
      <div class="apt-table-wrap"><table class="apt-table apt-kpi-table">
        <thead><tr><th>指標</th><th class="num">目標</th>${cols.map((g) => `<th class="apt-kpi-head">${esc(g)}</th>`).join('')}</tr></thead>
        <tbody>${rows
          .map((row) => `<tr><th class="apt-kpi-label">${row.label}<small>${esc(row.sub)}</small></th><td class="num">${Math.round(row.target * 100)}%</td>${cols.map((g) => cell(row, g)).join('')}</tr>`)
          .join('')}</tbody>
      </table></div>
      <p class="apt-sub-note">和後台「各地區KPI指標」同一套算法，地區依組長負責的北／中／南區列出。第一階段以上達成率＝在職正職行政中，業績月第一天累計到本週日（或業績月最後一天）點數達 ${Core.STAGE_1} 點的人數 ÷ 人數（依人力明細部別分區）。承接率＝行政審核件數 ÷ 總件數（案件依物件／合約縣市、房審依房客縣市分區）。清冊／審件作業良率＝（總件數 − 公會意見錯誤件數）÷ 總件數，依公會期數按月計算，採上個月（同主管簡報月報）。顏色：達目標綠、差 10% 以內黃、其餘紅。${notes.length ? `<br><span class="apt-bad">${esc(notes.join('；'))}</span>` : ''}</p>`;
  }

  const AREA_TONE = { 北區: 'north', 中區: 'mid', 南區: 'south', 東部及離島: 'east' };

  function areaPills(areas) {
    return areas.map((a) => `<i class="apt-area apt-area--${AREA_TONE[a] || 'east'}">${esc(a)}</i>`).join('');
  }

  /** 週報上方：選了組長→大卡顯示區域與管理縣市；全部組長→各組長一覽，點一下切換 */
  function leaderBanner(scope, all) {
    if (scope) {
      return `<div class="apt-leader-card">
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
        <span class="apt-leader-list-title">各組長負責區域<small>點一下只看該組</small></span>
        ${all
          .map(
            (x) => `<button type="button" class="apt-leader-chip" data-pick-leader="${esc(x.leader)}">
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
  const EXPENSE_TYPE = { 0: '修繕', 1: '保險費', 3: '房東公證費', 4: '房客公證費', 5: '業者公證費' };

  function spotCaseUrl(row) {
    if (row?.repair) return 'https://skyfunsystem.com/Audit/Audit_Expenses_Index';
    const id = row?.targetId;
    if (id == null || id === '') return '';
    const q = encodeURIComponent(id);
    if (row.type === 'object') return `https://skyfunsystem.com/Object/ObjectData?id=${q}`;
    if (row.type === 'tenant') return `https://skyfunsystem.com/Tenant/TenantData?id=${q}`;
    if (row.type === 'contract') return `https://skyfunsystem.com/Contrat/EditContrat?id=${q}&mode=view`;
    return '';
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
      .filter((s) => s.status === '在職' && s.kind !== '工讀生' && s.leader === state.leader)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }

  function spotLeaders() {
    const all = [...new Set((state.sb?.staff || []).map((s) => s.leader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return Core.spotLeadersFor(myName(), all);
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
   * 所選組長底下每位在職行政，各從「前一天」的物審／房客／預審／修繕審核抽一件。
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
      return { person, pool: [...audits, ...repairs] };
    });
    const day = pools.flatMap((p) => p.pool.map((r) => r.date)).sort().pop();
    if (!day) {
      setMsg('這組在這個業績月、今天以前沒有物審、房客、預審或修繕審核紀錄，沒有可以抽的案件（業績月第一天請切到上個業績月抽）。', 'warn');
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
      const kind = row.repair ? EXPENSE_TYPE[row.type] : '';
      items.push({
        key: `${row.repair ? 'e' : 'a'}:${row.id}`,
        date: row.date,
        name: person.name,
        node: row.repair ? SPOT_REPAIR : SPOT_NODE.get(Core.durationNode(row)),
        caseName: [kind && kind !== '修繕' ? kind : '', String(row.name || '').trim()].filter(Boolean).join(' · '),
        no: String(row.no || '').trim(),
        time: row.repair ? row.date.replace(/-/g, '/') : String(row.time || '').slice(0, 16),
        url: spotCaseUrl(row),
        search: row.repair
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
            .map(
              (s, i) => `<tr>
          <td><b>${esc(s.name)}</b></td>
          <td><span class="apt-spot-node">${esc(s.node)}</span></td>
          <td>${esc([s.no, s.caseName].filter(Boolean).join(' · ') || '沒有案件名稱')}</td>
          <td>${esc(String(s.time || '').replace(/-/g, '/'))}</td>
          <td>${s.url ? `<a class="apt-spot-go" href="${esc(s.url)}" data-spot-copy="${esc(s.url)}" draggable="true" title="點一下複製網址；也可以把按鈕拖到已登入的星鴻分頁">複製網址</a>${s.search && s.no ? `<small class="apt-spot-hint">用合約編號 ${esc(s.no)} 查</small>` : ''}` : '沒有案件編號'}</td>
          <td class="apt-spot-verdict">${spotVerdict(s, i)}</td>
        </tr>`
            )
            .join('') || `<tr><td colspan="6" class="apt-empty">這組沒有在職行政</td></tr>`;
    const days = [...new Set((drawn?.items || []).map((s) => s.date))];
    const spotDay = days.length === 1 ? days[0].replace(/-/g, '/') : '';
    const missing = drawn?.missing?.length
      ? `<p class="apt-sub-note">${spotDay ? `${esc(spotDay)} 沒有` : '沒有'}物審、房客、預審或修繕審核紀錄：${drawn.missing.map(esc).join('、')}</p>`
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
      <p class="apt-sub-note">抽前一天的案件：每位在職行政各從前一天審過的物審、房客、預審、修繕審核抽一件（前一天＝今天以前最近一個有審核紀錄的日子，週一會抽上週五）。按「複製網址」再貼到已登入的星鴻分頁；也可以把按鈕直接拖到那個分頁上。修繕審核沒有單件網址，會打開補助審核頁，再用合約編號查。看完按「通過」或「未通過」（要寫原因），結果算一件審件抽查，計入審件良率；同一件改判會覆蓋原本結果。判「未通過」會立刻用 LINE 通知該行政（他要先綁定 LINE），並顯示在他的工具箱首頁；改判通過會收起通知。</p>
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
    return (state.sb?.staff || []).filter((s) => s.status === '在職');
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
      const rep = Core.durationReport(Core.rowsFromPayload(audit), { start: pr.start, end: pr.end, staff: state.sb?.staff || [] });
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
    const leaders = [...new Set((sb.staff || []).map((s) => s.leader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
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
      ? new Set((sb.staff || []).filter((s) => s.leader === state.leader && s.status === '在職' && s.kind !== '工讀生').map((s) => s.name))
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
    $('page-admin-points')?.classList.toggle('apt-wide', state.tab === 'month');
    if (state.tab === 'person') box.innerHTML = renderPerson();
    else if (state.tab === 'weekly') box.innerHTML = renderWeekly();
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
      window.GuideExam.mountBoard({
        staff: activeStaff(),
        leader: state.tab === 'weekly' ? state.leader || '' : null,
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
  const ROSTER_PERIODS = ['三期', '3.1期', '四期', '五期'];

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

  function opinionRows(kind) {
    const list = myOpinions(kind);
    const isCase = kind === 'case';
    const head = `<th>填寫日</th><th>公會期數</th><th>縣市</th><th>${isCase ? '媒合編號' : '清冊期數'}</th><th>意見時間</th><th>公會意見內容</th>${isCase ? '' : '<th>行政檢討對策</th>'}<th></th>`;
    const rows = list
      .map(
        (o) => `<tr>
          <td>${esc(shortDate(o.date))}</td>
          <td>${esc(o.guildPeriod)}</td>
          <td>${o.region ? esc(o.region) : NIL}</td>
          <td>${esc(isCase ? o.caseNo : o.rosterPeriod)}</td>
          <td>${o.opinionDate ? esc(shortDate(o.opinionDate)) : NIL}</td>
          <td class="apt-op-text">${esc(o.content)}</td>
          ${isCase ? '' : `<td class="apt-op-text apt-op-measure">${esc(o.measure)}</td>`}
          <td><button type="button" class="apt-op-del" data-op-del="${o.id}">刪除</button></td>
        </tr>`
      )
      .join('');
    const range = state.meta?.range;
    return `<h4 class="apt-op-list-title">我在 ${range ? `${range.month} 月業績（${esc(range.start.slice(5))}～${esc(range.end.slice(5))}）` : '這個業績月'}填的${OPINION_FORMS[kind].title}<small>${list.length} 筆 · ${list.length} 點</small></h4>
      <div class="apt-table-wrap"><table class="apt-table apt-op-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${isCase ? 7 : 8}" class="apt-empty">還沒有填寫</td></tr>`}</tbody>
      </table></div>`;
  }

  function opinionFormHtml(kind) {
    const f = OPINION_FORMS[kind];
    const isCase = kind === 'case';
    const periods = guildPeriods().map((p) => `<option>${p}</option>`).join('');
    return `<div class="apt-op-modal" role="dialog" aria-modal="true" aria-label="填寫${f.title}">
        <header class="apt-op-head"><b>📝 填寫${f.title}</b><button type="button" class="apt-op-x" data-op-close aria-label="關閉">✕</button></header>
        <p class="apt-op-tip">每填一筆算 <b>1 點</b>，計入填寫當天所在業績月的「${f.item}」，點數算給填寫的人（${esc(myName() || '—')}）。</p>
        <form class="apt-op-form" data-op-kind="${kind}" novalidate>
          <label><span>公會期數 <em>*</em></span><select name="guildPeriod">${periods}</select></label>
          <label><span>縣市 <em>*</em>${isCase ? '<small class="apt-op-auto">依媒合編號自動帶入</small>' : ''}</span><select name="region"><option value="">請選擇</option>${Core.KPI_REGIONS.map((r) => `<option>${r}</option>`).join('')}</select></label>
          ${isCase
            ? '<label><span>媒合編號 <em>*</em></span><input name="caseNo" maxlength="60" placeholder="例如 星華AM…" autocomplete="off"></label>'
            : `<label><span>清冊期數 <em>*</em></span><input name="rosterPeriod" maxlength="20" list="apt-op-roster-periods" placeholder="選擇或輸入"><datalist id="apt-op-roster-periods">${ROSTER_PERIODS.map((p) => `<option value="${p}">`).join('')}</datalist></label>`}
          <label><span>意見時間</span><input type="date" name="opinionDate"></label>
          <label class="apt-op-wide"><span>公會意見內容 <em>*</em></span><textarea name="content" rows="3" maxlength="2000" placeholder="照公會回傳的意見填寫"></textarea></label>
          ${isCase ? '' : '<label class="apt-op-wide apt-op-measure-field"><span>行政檢討對策 <em>*</em></span><textarea name="measure" rows="3" maxlength="2000" placeholder="這個意見要怎麼改善、之後怎麼避免"></textarea></label>'}
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
    const form = mask.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveOpinion(kind, e.currentTarget);
    });
    if (kind === 'case') {
      const region = form.elements.region;
      region.addEventListener('change', () => {
        region.dataset.manual = region.value ? '1' : '';
      });
      form.elements.caseNo.addEventListener('input', (e) => {
        const r = Core.kpiRegionOfCaseNo(e.target.value);
        if (r && !region.dataset.manual) region.value = r;
      });
    }
    mask.querySelector(kind === 'case' ? '[name="caseNo"]' : '[name="rosterPeriod"]').focus();
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
    if (!data.region) return fail('請選縣市');
    if (kind === 'case' && !data.caseNo) return fail('請填媒合編號');
    if (kind === 'roster' && !data.rosterPeriod) return fail('請選清冊期數');
    if (!data.content) return fail('請填公會意見內容');
    if (kind === 'roster' && !data.measure) return fail('請填行政檢討對策');
    btn.disabled = true;
    msg.textContent = '送出中…';
    msg.className = 'apt-op-msg';
    try {
      const res = await window.skyfunAuth.rpc('admin_points_opinion_save', { p_token: token(), p_kind: kind, p_data: data });
      if (!res?.ok) throw new Error(res?.error || '送出失敗');
      ['caseNo', 'rosterPeriod', 'opinionDate', 'content', 'measure'].forEach((k) => {
        if (form.elements[k]) form.elements[k].value = '';
      });
      if (kind === 'case') {
        form.elements.region.value = '';
        form.elements.region.dataset.manual = '';
      }
      msg.textContent = '✓ 已送出，+1 點';
      msg.className = 'apt-op-msg is-ok';
      await refreshOpinionList(kind);
    } catch (err) {
      fail(String(err.message || err));
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteOpinion(kind, id, btn) {
    if (!id || !window.confirm('確定刪除這筆意見？刪除後會少 1 點。')) return;
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
      const pickEl = e.target.closest('[data-pick]');
      if (pickEl || e.target.closest('[data-pick-close]')) {
        const id = pickEl?.dataset.pick;
        const i = Number(pickEl?.dataset.pickI);
        state.pick = pickEl && picked(id) !== i ? { key: pickKey(), id, i } : null;
        render();
        if (state.pick) $('apt-pick-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const pviewBtn = e.target.closest('[data-pview]');
      if (pviewBtn) {
        state.personView = pviewBtn.dataset.pview;
        render();
        $('apt-body').querySelector('.apt-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const trainBtn = e.target.closest('[data-train-node]');
      if (trainBtn) {
        state.personView = 'training';
        state.trainNode = trainBtn.dataset.trainNode;
        render();
        $('apt-body').querySelector('.apt-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      const leaderBtn = e.target.closest('[data-pick-leader]');
      if (leaderBtn) {
        state.leader = leaderBtn.dataset.pickLeader;
        state.spot = null;
        render();
        return;
      }
      const pointBtn = e.target.closest('[data-point-person]');
      if (pointBtn) {
        const name = pointBtn.dataset.pointPerson;
        state.openPoint = state.openPoint === name ? '' : name;
        render();
        if (state.openPoint) $('apt-body').querySelector('.apt-pd-row')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      const nameBtn = e.target.closest('[data-person]');
      if (nameBtn) {
        if (!PERSON_OPEN) {
          setMsg('個人明細還沒開放，敬請期待。', 'warn');
          return;
        }
        if (!canSee(nameBtn.dataset.person)) {
          setMsg(`個人明細只能看自己${myName() ? '' : '（請先登入）'}；${nameBtn.dataset.person} 的明細沒有權限查看。`, 'warn');
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
      },
      true
    );
    $('apt-body').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-pick]')) {
        e.preventDefault();
        e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    $('apt-body').addEventListener('change', (e) => {
      if (e.target.id === 'apt-person') state.person = e.target.value;
      else if (e.target.id === 'apt-week') state.week = e.target.value;
      else if (e.target.id === 'apt-leader') {
        state.leader = e.target.value;
        state.spot = null;
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
    const result = Core.compute(Core.rowsFromPayload(audit), {
      start: range.start,
      end: range.end,
      staff: sb.staff || [],
      manual: sb.manual || [],
      opinions: sb.opinions || [],
      expenses: Core.rowsFromPayload(expenses),
      terminations: Core.rowsFromPayload(term)
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
          if (c) el.outerHTML = courseBlocks(c.pf, c.active);
        });
        document.querySelectorAll('[data-train-count]').forEach((el) => {
          const c = courseCache.get(el.dataset.trainCount);
          if (c) el.textContent = trainCountText(c.pf);
        });
        document.querySelectorAll('[data-train-box]').forEach((el) => {
          const [key, name] = el.dataset.trainBox.split('|');
          el.outerHTML = trainBoxHtml(key, name);
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
