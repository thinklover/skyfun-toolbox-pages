/**
 * 行政點數表：星鴻審核時間紀錄、補助審核（Worker）＋人力明細／組長手填點數（Supabase）
 */
(function () {
  const Core = window.AdminPointsCore;
  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  const ITEMS = Core.AUTO_ITEMS;
  const MANUAL_KEYS = Core.MANUAL_ITEMS.map((i) => i.key);
  const $ = (id) => document.getElementById(id);

  const state = {
    inited: false,
    loading: false,
    monthKey: '',
    result: null,
    meta: null,
    tab: 'month',
    day: '',
    person: ''
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
      const [audit, expenses, sb] = await Promise.all([
        fetchWorker('/admin-points/audit-log', '審核時間紀錄', range, refresh),
        fetchWorker('/admin-points/expenses', '補助審核', range, refresh),
        fetchSupabase(range)
      ]);
      state.result = Core.compute(Core.rowsFromPayload(audit), {
        start: range.start,
        end: range.end,
        staff: sb.staff || [],
        manual: sb.manual || [],
        expenses: Core.rowsFromPayload(expenses)
      });
      state.meta = { range, fetchedAt: audit.fetchedAt, total: audit.total, staffCount: (sb.staff || []).length };
      const today = Core.isoDate(new Date());
      const days = dayList();
      if (!days.includes(state.day)) state.day = days.includes(today) ? today : days[days.length - 1] || '';
      if (state.person && !state.result.people.some((p) => p.name === state.person)) state.person = '';
      setMsg('');
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

  function manualTitle(t) {
    return MANUAL_KEYS.filter((k) => t.manualCounts[k]).map((k) => `${k} ${t.manualCounts[k]} 件`).join('、');
  }

  function tallyCells(t) {
    const cells = ITEMS.map((i) => `<td class="num">${t.counts[i.key] || ''}</td>`).join('');
    return (
      cells +
      `<td class="num">${t.qa || ''}</td>` +
      `<td class="num" title="${esc(manualTitle(t))}">${t.manual || ''}</td>`
    );
  }

  function headCells() {
    return (
      ITEMS.map((i) => `<th class="num">${esc(i.label)}<small>${i.points}點</small></th>`).join('') +
      '<th class="num">行政QA</th><th class="num">手填</th>'
    );
  }

  function progress(total) {
    const pct = Math.min(100, (total / Core.STAGE_2) * 100);
    const mark = (Core.STAGE_1 / Core.STAGE_2) * 100;
    return `<span class="apt-bar" title="第一階段 ${Core.STAGE_1}、第二階段 ${Core.STAGE_2}"><span style="width:${pct}%"></span><i style="left:${mark}%"></i></span>`;
  }

  const GROUPS = [
    { key: '行政', note: '人力明細在職人員' },
    { key: '非行政', note: '有審核紀錄、但不在人力明細' }
  ];

  function groupTitle(g, count, sum) {
    return `<h3 class="apt-group-title">${g.key}<small>${g.note} · ${count} 人 · ${sum} 點</small></h3>`;
  }

  function renderMonth() {
    return GROUPS.map((g) => {
      const people = state.result.people.filter((p) => p.group === g.key);
      if (g.key === '非行政' && !people.length) return '';
      const sum = people.reduce((s, p) => s + p.month.total, 0);
      return groupTitle(g, people.length, sum) + monthTable(people);
    }).join('');
  }

  function monthTable(list) {
    const rows = list
      .map(
        (p, idx) => `<tr>
          <td class="apt-rank">${idx + 1}</td>
          <td><button type="button" class="apt-name" data-person="${esc(p.name)}">${esc(p.name)}</button>${kindBadge(p.kind)}</td>
          ${tallyCells(p.month)}
          <td class="num apt-total">${p.month.total}</td>
          <td>${progress(p.month.total)} ${stageBadge(p.stage)}</td>
        </tr>`
      )
      .join('');
    return `<div class="apt-table-wrap"><table class="apt-table">
      <thead><tr><th>#</th><th>姓名</th>${headCells()}<th class="num">月累積</th><th>階段（${Core.STAGE_1}／${Core.STAGE_2}）</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${ITEMS.length + 6}" class="apt-empty">本業績月尚無點數</td></tr>`}</tbody>
    </table></div>`;
  }

  function renderDay() {
    const r = state.result;
    const days = dayList();
    const opts = days
      .slice()
      .reverse()
      .map((d) => `<option value="${d}"${d === state.day ? ' selected' : ''}>${d}</option>`)
      .join('');
    const all = r.people
      .map((p) => ({ p, t: p.days.get(state.day) }))
      .filter((x) => x.t && x.t.total > 0)
      .sort((a, b) => b.t.total - a.t.total);
    const sum = all.reduce((s, x) => s + x.t.total, 0);
    const sections = GROUPS.map((g) => {
      const people = all.filter((x) => x.p.group === g.key);
      if (g.key === '非行政' && !people.length) return '';
      const rows = people
        .map(
          ({ p, t }) => `<tr>
          <td><button type="button" class="apt-name" data-person="${esc(p.name)}">${esc(p.name)}</button>${kindBadge(p.kind)}</td>
          ${tallyCells(t)}
          <td class="num apt-total">${t.total}</td>
          <td class="num">${p.month.total}</td>
        </tr>`
        )
        .join('');
      return `${groupTitle(g, people.length, people.reduce((s, x) => s + x.t.total, 0))}
      <div class="apt-table-wrap"><table class="apt-table">
      <thead><tr><th>姓名</th>${headCells()}<th class="num">日點數</th><th class="num">月累積</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${ITEMS.length + 5}" class="apt-empty">這天沒有點數</td></tr>`}</tbody>
    </table></div>`;
    }).join('');
    return `<div class="apt-sub-bar"><label>日期 <select id="apt-day">${opts}</select></label><span class="apt-sub-note">當日合計 ${sum} 點 · ${all.length} 人</span></div>${sections}`;
  }

  function recordList(records) {
    const label = Object.fromEntries(ITEMS.map((i) => [i.key, i.label]));
    return `<div class="apt-records">${records
      .map(
        (x) => `<div class="apt-record"><b>${esc(label[x.item])}</b><span>${esc(x.no || x.name)}</span><small>${esc(x.status)}${x.time ? ` · ${esc(String(x.time).slice(11, 16))}` : ''}</small></div>`
      )
      .join('')}</div>`;
  }

  function renderPerson() {
    const r = state.result;
    const opts = GROUPS.map((g) => {
      const list = r.people.filter((p) => p.group === g.key);
      if (!list.length) return '';
      return `<optgroup label="${g.key}">${list
        .map((p) => `<option value="${esc(p.name)}"${p.name === state.person ? ' selected' : ''}>${esc(p.name)}（${p.month.total}）</option>`)
        .join('')}</optgroup>`;
    }).join('');
    const p = r.people.find((x) => x.name === state.person);
    let body = '<p class="apt-empty">請選擇人員</p>';
    if (p) {
      let run = 0;
      const rows = dayList()
        .map((d) => {
          const t = p.days.get(d);
          if (!t || !t.total) return '';
          run += t.total;
          const recs = p.records.filter((x) => x.date === d);
          return `<tr>
            <td>${recs.length ? `<button type="button" class="apt-day-toggle" data-day="${d}">${d.slice(5)} ▾</button>` : d.slice(5)}</td>
            ${tallyCells(t)}
            <td class="num apt-total">${t.total}</td>
            <td class="num">${run}</td>
          </tr>
          <tr class="apt-day-detail" data-day-detail="${d}" hidden><td colspan="${ITEMS.length + 5}">${recordList(recs)}</td></tr>`;
        })
        .join('');
      body = `<p class="apt-sub-note">月累積 <b>${p.month.total}</b> 點 ${stageBadge(p.stage)} · 自動 ${p.month.auto}、行政QA ${p.month.qa}、手填 ${p.month.manual}${manualTitle(p.month) ? `（${esc(manualTitle(p.month))}）` : ''}</p>
        <div class="apt-table-wrap"><table class="apt-table">
        <thead><tr><th>日期</th>${headCells()}<th class="num">日點數</th><th class="num">累積</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${ITEMS.length + 5}" class="apt-empty">尚無點數</td></tr>`}</tbody>
      </table></div><p class="apt-sub-note">點日期可展開當天認列的案件。</p>`;
    }
    return `<div class="apt-sub-bar"><label>人員 <select id="apt-person"><option value="">請選擇</option>${opts}</select></label></div>${body}`;
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
    document.querySelectorAll('.apt-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === state.tab));
    if (state.tab === 'day') box.innerHTML = renderDay();
    else if (state.tab === 'person') box.innerHTML = renderPerson();
    else box.innerHTML = renderMonth();
    $('apt-warnings').innerHTML = renderWarnings();
  }

  function bind() {
    const sel = $('apt-month');
    sel.innerHTML = monthOptions()
      .map((m) => `<option value="${m.year}-${m.month}">${m.year - 1911} 年 ${m.month} 月（${m.start.slice(5)}～${m.end.slice(5)}）</option>`)
      .join('');
    state.monthKey = sel.value;
    sel.addEventListener('change', () => {
      state.monthKey = sel.value;
      load(false);
    });
    $('apt-refresh').addEventListener('click', () => load(true));
    $('apt-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.apt-tab');
      if (!b) return;
      state.tab = b.dataset.tab;
      render();
    });
    $('apt-body').addEventListener('click', (e) => {
      const nameBtn = e.target.closest('.apt-name');
      if (nameBtn) {
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
    $('apt-body').addEventListener('change', (e) => {
      if (e.target.id === 'apt-day') state.day = e.target.value;
      else if (e.target.id === 'apt-person') state.person = e.target.value;
      else return;
      render();
    });
  }

  window.adminPointsInit = function () {
    if (!$('page-admin-points')) return;
    if (!state.inited) {
      state.inited = true;
      bind();
    }
    if (!state.result) load(false);
  };

  document.addEventListener('skyfun-auth-ready', () => {
    const page = $('page-admin-points');
    if (state.inited && !state.result && page && !page.classList.contains('hidden')) load(false);
  });
})();
