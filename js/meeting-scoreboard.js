/**
 * 會議計分中心｜一頁總表（分數／獎金＋快捷加減分）
 */
(function () {
  'use strict';

  /** 單一總表（不再分系統會議／月會主管） */
  const TOTAL_BOARD = 'all';
  const WRITE_BOARD = 'system';
  const OFFICE_NS = [
    '北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '宜一處',
    '桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '投一處', '嘉一處', '南一處', '南二處', '高一處', '高二處'
  ];
  const BACK_OFFICE_DEPTS = ['總經理室', '行政管理部', '財務部', '租賃管理部', '人資部', '資訊部'];
  const OFFICE_DEPT_ORDER = [
    '總經理室', '行政管理部', '商辦部', '電服部', '財務部', '整租部',
    '法務部', '客服部', '租賃管理部', '人資部', '資訊部', '星耀'
  ];
  /** 桃一／竹一／嘉一算中區；南區僅南一南二；高雄高一高二 */
  const BIZ_ZONES = [
    { id: 'north', label: '北區', re: /^(北[一二三四五]處|基一處|宜一處)$/ },
    { id: 'central', label: '中區', re: /^(桃一處|竹一處|中[一二三四五六]處|彰一處|投一處|嘉一處)$/ },
    { id: 'south', label: '南區', re: /^(南[一二]處)$/ },
    { id: 'kh', label: '高雄', re: /^(高[一二]處)$/ }
  ];

  const state = {
    view: 'dash',
    board: TOTAL_BOARD,
    month: '',
    people: [],
    projects: [],
    entries: [],
    recordsEntries: [],
    editId: null,
    busy: false,
    formDirty: false,
    filter: { q: '', projectId: '', from: '', to: '' },
    canViewAll: false,
    canEdit: false,
    canManage: false,
    editors: [],
    editorQuery: '',
    viewerId: '',
    scoreMonth: '',
    span: 'month',
    year: '',
    serverScoped: false,
    q: '',
    bindPersonId: null,
    accountOptions: [],
    bound: false,
    expandedPersonId: '',
    peopleSort: {
      office: { key: '', dir: 'desc' },
      'biz-north': { key: '', dir: 'desc' },
      'biz-central': { key: '', dir: 'desc' },
      'biz-south': { key: '', dir: 'desc' },
      'biz-kh': { key: '', dir: 'desc' }
    }
  };

  function $(id) { return document.getElementById(id); }
  function token() {
    try { return window.skyfunAuth?.getToken?.() || ''; } catch (_) { return ''; }
  }
  async function rpc(name, args) {
    if (!window.skyfunAuth?.rpc) throw new Error('請先登入工具箱');
    return window.skyfunAuth.rpc(name, args);
  }
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function setMsg(text, kind, elId) {
    const el = $(elId || 'msb-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msb-msg' + (kind ? ' is-' + kind : '');
  }
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function currentMonth() { return todayStr().slice(0, 7); }
  function fmtDate(d) {
    const s = String(d || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '/') : (s || '—');
  }
  function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function manualScoreText(v) {
    const n = numOrNull(v);
    if (n == null) return '—';
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }
  function bonusAmount(v) {
    const n = numOrNull(v);
    if (n == null || n === 0) return null;
    return n;
  }
  function bonusCellHtml(p) {
    const n = bonusAmount(p?.bonus);
    const status = String(p?.bonusStatus || '').trim();
    if (n == null) return '<span class="msb-nil">—</span>';
    const badge = (status === '待發放' || status === '已發放')
      ? ` <span class="msb-chip">${esc(status)}</span>` : '';
    return `<span class="msb-bonus">${esc(n.toLocaleString('zh-TW'))}</span>${badge}`;
  }
  function scoreCellHtml(v) {
    const n = numOrNull(v);
    if (n == null) return '<span class="msb-nil">—</span>';
    return esc(manualScoreText(v));
  }
  function personDept(p) { return String(p?.department || '').trim(); }
  function personTitle(p) { return String(p?.title || p?.jobTitle || '').trim(); }
  function isMine(p) {
    return !!(state.viewerId && p && p.accountId && String(p.accountId) === String(state.viewerId));
  }
  const EDITOR_MANAGERS = ['簡為倢', '邱奕棋', '蘇崇瑋'];
  function canManageEditors() {
    const u = window.skyfunAuth?.getUser?.() || {};
    const name = String(u.name || '').replace(/\s+/g, '').trim();
    return EDITOR_MANAGERS.indexOf(name) >= 0;
  }
  function applyAccess() {
    state.canManage = canManageEditors();
    document.querySelectorAll('#page-meeting-scoreboard .msb-edit-only').forEach((el) => {
      el.hidden = !state.canEdit;
    });
    const settingsBtn = document.querySelector('#page-meeting-scoreboard [data-msb-view="settings"]');
    if (settingsBtn) settingsBtn.hidden = !(state.canEdit || state.canManage);
  }
  function personBoard(p) {
    const b = String(p?.board || '').trim();
    return b === 'monthly' || b === 'system' ? b : WRITE_BOARD;
  }
  function writeBoardForPersonId(personId) {
    const p = (state.people || []).find((x) => String(x.id) === String(personId));
    return p ? personBoard(p) : WRITE_BOARD;
  }
  function isBizDept(dept) {
    const d = String(dept || '').trim();
    if (!d) return false;
    if (BACK_OFFICE_DEPTS.includes(d)) return false;
    if (OFFICE_NS.includes(d)) return true;
    return /處$/.test(d);
  }
  /** 職等：室長 > 特助 > 協理 > 經理 > 副理 > 組長 > 儲備主管（數字越小越高） */
  function titleRankOne(raw) {
    const t = String(raw || '').trim();
    if (!t || t === '其他' || t === '—') return 90;
    if (/室長/.test(t)) return 1;
    if (/特助|總助/.test(t)) return 2;
    if (/協理/.test(t)) return 3;
    if (/儲備/.test(t)) return 7;
    if (/經理|部長/.test(t)) return 4;
    if (/副理/.test(t)) return 5;
    if (/組長/.test(t)) return 6;
    return 80;
  }
  function titleRank(p) {
    const t = personTitle(p);
    if (!t) return 90;
    const parts = t.split(/[／\/、]/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return titleRankOne(t);
    let best = 90;
    parts.forEach((part) => {
      const r = titleRankOne(part);
      if (r < best) best = r;
    });
    return best;
  }
  function officeRank(dept) {
    const d = String(dept || '').trim();
    const i = OFFICE_NS.indexOf(d);
    if (i >= 0) return i;
    const bi = BACK_OFFICE_DEPTS.indexOf(d);
    if (bi >= 0) return bi;
    return 800;
  }
  function peopleSortState(side) {
    const key = side || 'office';
    if (!state.peopleSort[key]) state.peopleSort[key] = { key: '', dir: 'desc' };
    return state.peopleSort[key];
  }
  function bizZoneId(dept) {
    const d = String(dept || '').trim();
    const hit = BIZ_ZONES.find((z) => z.re.test(d));
    return hit ? hit.id : 'central';
  }
  function sortPeopleList(list, sortState) {
    const { key, dir } = sortState || {};
    const mul = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      if (key === 'dept') {
        const da = personDept(a);
        const db = personDept(b);
        if (!da && !db) { /* fall through */ }
        else if (!da) return 1;
        else if (!db) return -1;
        else {
          const or = (officeRank(da) - officeRank(db)) * mul;
          if (or) return or;
          const cmp = da.localeCompare(db, 'zh-Hant') * mul;
          if (cmp) return cmp;
        }
      } else if (key === 'title') {
        const tr = (titleRank(a) - titleRank(b)) * mul;
        if (tr) return tr;
        const ta = personTitle(a);
        const tb = personTitle(b);
        if (ta || tb) {
          if (!ta) return 1;
          if (!tb) return -1;
          const cmp = ta.localeCompare(tb, 'zh-Hant') * mul;
          if (cmp) return cmp;
        }
      } else if (key === 'name') {
        const cmp = String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant') * mul;
        if (cmp) return cmp;
      } else if (key === 'score' || key === 'bonus') {
        const av = key === 'score' ? numOrNull(a.score) : bonusAmount(a.bonus);
        const bv = key === 'score' ? numOrNull(b.score) : bonusAmount(b.bonus);
        const aEmpty = av == null;
        const bEmpty = bv == null;
        if (aEmpty && bEmpty) { /* fall through */ }
        else if (aEmpty) return 1;
        else if (bEmpty) return -1;
        else if (av !== bv) return (av - bv) * mul;
      }
      const tr = titleRank(a) - titleRank(b);
      if (tr) return tr;
      const or = officeRank(personDept(a)) - officeRank(personDept(b));
      if (or) return or;
      const da = personDept(a) || '未填部別';
      const db = personDept(b) || '未填部別';
      if (da !== db) return da.localeCompare(db, 'zh-Hant');
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    });
  }
  function syncPeopleSortHeaders() {
    document.querySelectorAll('#page-meeting-scoreboard th[data-msb-sort]').forEach((th) => {
      const side = th.getAttribute('data-msb-sort-side') || 'office';
      const { key, dir } = peopleSortState(side) || {};
      const k = th.getAttribute('data-msb-sort');
      const on = k === key;
      th.classList.toggle('is-sorted', on);
      th.setAttribute('aria-sort', on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
      const mark = th.querySelector('.msb-sort-mark');
      if (mark) mark.textContent = on ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
    });
  }
  function togglePeopleSort(key, side) {
    if (!key) return;
    const sideKey = side || 'office';
    const cur = peopleSortState(sideKey);
    if (cur.key === key) {
      cur.dir = cur.dir === 'desc' ? 'asc' : 'desc';
    } else {
      const numeric = key === 'score' || key === 'bonus';
      state.peopleSort[sideKey] = { key, dir: numeric ? 'desc' : 'asc' };
    }
    renderPeopleTable();
  }
  function personEntries(personId) {
    const id = String(personId || '');
    const yearMode = state.span === 'year';
    const year = state.year || currentMonth().slice(0, 4);
    const month = state.scoreMonth || state.month || currentMonth();
    const src = (state.entries && state.entries.length) ? state.entries : (state.recordsEntries || []);
    return src.filter((e) => {
      if (String(e.personId) !== id) return false;
      const d = String(e.scoreDate || '');
      if (yearMode) return d.slice(0, 4) === year;
      return !month || d.slice(0, 7) === month;
    }).sort((a, b) => String(b.scoreDate || '').localeCompare(String(a.scoreDate || '')));
  }
  function detailRowHtml(p, cols) {
    const list = personEntries(p.id);
    const body = list.length
      ? `<ul class="msb-detail-list">${list.map((e) => {
          const score = Number(e.score);
          const cls = score > 0 ? 'pos' : (score < 0 ? 'neg' : '');
          return `<li>
            <span class="msb-detail-date">${esc(fmtDate(e.scoreDate))}</span>
            <span class="msb-detail-item">${esc(e.item || e.projectName || '加減分')}</span>
            <span class="msb-detail-score ${cls}">${esc(manualScoreText(e.score))}</span>
            <span class="msb-detail-note">${esc(e.note || '')}</span>
          </li>`;
        }).join('')}</ul>`
      : `<p class="msb-detail-empty">${state.span === 'year' ? '本年度尚無加減分明細' : '本月尚無加減分明細'}</p>`;
    return `<tr class="msb-detail-row" data-msb-detail-for="${esc(p.id)}">
      <td colspan="${cols || 6}"><div class="msb-detail-sheet">${body}</div></td>
    </tr>`;
  }
  function mountModal(el) {
    if (!el || !document.body) return;
    if (el.parentElement !== document.body) document.body.appendChild(el);
  }
  function defaultProjectId() {
    const list = state.projects || [];
    if (!list.length) return '';
    const hit = list.find((p) => /一般|加減分|會議/.test(String(p.name || ''))) || list[0];
    return hit ? String(hit.id) : '';
  }
  function setView(view) {
    state.view = view;
    document.querySelectorAll('#page-meeting-scoreboard [data-msb-view]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-msb-view') === view);
    });
    document.querySelectorAll('#page-meeting-scoreboard [data-msb-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-msb-panel') !== view;
    });
    if (view === 'settings') void loadEditors();
  }
  function fillSelects(preferPersonId) {
    const peopleOpts = (state.people || []).map((p) =>
      `<option value="${esc(p.id)}">${esc(p.name)}${personDept(p) ? '（' + esc(personDept(p)) + '）' : ''}</option>`
    ).join('');
    const projectOpts = (state.projects || []).map((p) =>
      `<option value="${esc(p.id)}">${esc(p.name)}</option>`
    ).join('');
    ['msb-person', 'msb-month-person'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const keep = preferPersonId != null ? String(preferPersonId) : el.value;
      el.innerHTML = '<option value="">請選擇</option>' + peopleOpts;
      if (keep && [...el.options].some((o) => o.value === keep)) el.value = keep;
    });
    if ($('msb-project')) {
      const keep = String($('msb-project').value || '').trim();
      const next = keep || defaultProjectId();
      $('msb-project').value = next;
    }
    if ($('msb-filter-project')) {
      const keep = $('msb-filter-project').value;
      $('msb-filter-project').innerHTML = '<option value="">全部專案</option>' + projectOpts;
      if (keep) $('msb-filter-project').value = keep;
    }
  }
  function filteredPeople() {
    const q = String(state.q || '').trim().toLowerCase();
    let list = (state.people || []).slice();
    /* 全員分數／獎金公開可見；編輯仍看 canEdit */
    if (q) {
      list = list.filter((p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        personDept(p).toLowerCase().includes(q) ||
        personTitle(p).toLowerCase().includes(q)
      );
    }
    return list;
  }
  function peopleRowsHtml(p, edit, hideDept) {
    const dept = personDept(p) || '—';
    const title = personTitle(p);
    const titleShow = title && title !== '其他' ? title : '—';
    const open = String(state.expandedPersonId) === String(p.id);
    const yearMode = state.span === 'year';
    const marks = [
      isMine(p) ? '<span class="msb-you">你</span>' : '',
      !hideDept && !personDept(p) ? '<span class="msb-chip">未填部別</span>' : '',
      open ? '<span class="msb-chip msb-chip--on">明細</span>' : ''
    ].filter(Boolean).join(' ');
    const acts = `<td class="act">
          <button type="button" class="msb-act-btn is-plus" data-msb-add="${esc(p.id)}">加分</button>
          <button type="button" class="msb-act-btn is-minus" data-msb-add="${esc(p.id)}" data-msb-minus="1">減分</button>
        </td>`;
    const scoreCell = yearMode
      ? scoreCellHtml(p.score)
      : `<button type="button" class="msb-cell-btn" data-msb-score-person="${esc(p.id)}" ${edit ? '' : 'disabled'}>${scoreCellHtml(p.score)}</button>`;
    const bonusCell = yearMode
      ? bonusCellHtml(p)
      : `<button type="button" class="msb-cell-btn" data-msb-score-person="${esc(p.id)}" ${edit ? '' : 'disabled'}>${bonusCellHtml(p)}</button>`;
    const main = `<tr class="msb-person-row${open ? ' is-open' : ''}" data-msb-expand="${esc(p.id)}" tabindex="0">
      ${hideDept ? '' : `<td>${esc(dept)}</td>`}
      <td class="msb-title-cell">${esc(titleShow)}</td>
      <td><span class="msb-name">${esc(p.name)}</span> ${marks}</td>
      <td class="num">${scoreCell}</td>
      <td class="num">${bonusCell}</td>
      ${acts}
    </tr>`;
    return open ? main + detailRowHtml(p, hideDept ? 5 : 6) : main;
  }
  function fillPeopleBody(el, list, edit) {
    if (!el) return;
    el.innerHTML = list.length
      ? list.map((p) => peopleRowsHtml(p, edit)).join('')
      : '<tr><td colspan="6" class="msb-empty">尚無人員</td></tr>';
  }
  function settingsDeptOrder(people) {
    const names = new Set(people.map((p) => personDept(p) || '未填部別'));
    const out = [];
    const push = (d) => { if (names.has(d) && out.indexOf(d) < 0) out.push(d); };
    OFFICE_DEPT_ORDER.forEach(push);
    OFFICE_NS.forEach(push);
    Array.from(names).filter((d) => out.indexOf(d) < 0 && d !== '未填部別')
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .forEach(push);
    push('未填部別');
    return out;
  }
  function settingsGroups(people) {
    const biz = BIZ_ZONES.map((z) => ({
      title: z.label,
      rows: people.filter((p) => isBizDept(personDept(p)) && bizZoneId(personDept(p)) === z.id)
    })).filter((g) => g.rows.length);
    const officePeople = people.filter((p) => !isBizDept(personDept(p)));
    const office = settingsDeptOrder(officePeople).map((dept) => ({
      title: dept,
      rows: officePeople.filter((p) => (personDept(p) || '未填部別') === dept)
    }));
    return { biz, office };
  }
  function officeDeptList(people) {
    const names = new Set(people.map((p) => personDept(p) || '未填部別'));
    const known = OFFICE_DEPT_ORDER.filter((d) => names.has(d));
    const rest = Array.from(names).filter((d) => d !== '未填部別' && OFFICE_DEPT_ORDER.indexOf(d) < 0)
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const out = known.concat(rest);
    if (names.has('未填部別')) out.push('未填部別');
    return out;
  }
  function sortHead(label, key, side, extra) {
    return `<th class="${extra || ''} msb-th-sort" data-msb-sort="${key}" data-msb-sort-side="${esc(side)}" role="columnheader" tabindex="0" title="點擊排序${label}">${label}<span class="msb-sort-mark" aria-hidden="true"></span></th>`;
  }
  function peopleTableHtml(side, rows, hideDept) {
    const cols = hideDept
      ? `<colgroup><col class="msb-col-title"><col class="msb-col-name"><col class="msb-col-score"><col class="msb-col-bonus"><col class="msb-col-act"></colgroup>`
      : `<colgroup><col class="msb-col-dept"><col class="msb-col-title"><col class="msb-col-name"><col class="msb-col-score"><col class="msb-col-bonus"><col class="msb-col-act"></colgroup>`;
    const head = `<tr>${hideDept ? '' : sortHead('部別', 'dept', side, '')}${sortHead('職別', 'title', side, '')}${sortHead('姓名', 'name', side, '')}${sortHead('分數', 'score', side, 'num')}${sortHead('獎金', 'bonus', side, 'num')}<th class="act">操作</th></tr>`;
    const body = rows.length
      ? rows.map((p) => peopleRowsHtml(p, state.canEdit, hideDept)).join('')
      : `<tr><td colspan="${hideDept ? 5 : 6}" class="msb-empty">尚無人員</td></tr>`;
    return `<div class="msb-table-panel"><div class="msb-table-head"><table class="msb-table msb-table--people">${cols}<thead>${head}</thead></table></div><div class="msb-table-wrap msb-table-wrap--zone-sm"><table class="msb-table msb-table--people">${cols}<tbody>${body}</tbody></table></div></div>`;
  }
  function renderPeopleTable() {
    const officeHost = $('msb-office-zones');
    const note = $('msb-score-month-note');
    const selfBox = $('msb-self');
    if (!officeHost) return;
    const month = state.scoreMonth || state.month || currentMonth();
    if (note) {
      note.textContent = state.span === 'year'
        ? ('分數與獎金為 ' + (state.year || month.slice(0, 4)) + ' 年各月加總。沒有輸入的月份不計入。點列可展開該年加減分明細。')
        : ('分數與獎金為 ' + month + ' 手動輸入。點列可展開加減分明細；業務分北／中／南／高雄，內勤依部別分區。');
    }
    if (selfBox) {
      selfBox.hidden = true;
      selfBox.innerHTML = '';
    }
    const list = filteredPeople();
    const yearMode = state.span === 'year';
    const monthDual = $('msb-people-dual');
    const yearDual = $('msb-year-dual');
    if (monthDual) monthDual.hidden = yearMode;
    if (yearDual) yearDual.hidden = !yearMode;
    if (yearMode) {
      const yearSort = (side) => {
        const cur = peopleSortState(side);
        return cur.key ? cur : { key: 'dept', dir: 'asc' };
      };
      const officePeople = sortPeopleList(list.filter((p) => !isBizDept(personDept(p))), yearSort('year-office'));
      const bizPeople = sortPeopleList(list.filter((p) => isBizDept(personDept(p))), yearSort('year-biz'));
      const officeBox = $('msb-year-office');
      const bizBox = $('msb-year-biz');
      if (officeBox) officeBox.innerHTML = peopleTableHtml('year-office', officePeople, false);
      if (bizBox) bizBox.innerHTML = peopleTableHtml('year-biz', bizPeople, false);
      syncPeopleSortHeaders();
      return;
    }
    const officePeople = list.filter((p) => !isBizDept(personDept(p)));
    const depts = officeDeptList(officePeople);
    officeHost.innerHTML = depts.length ? depts.map((dept) => {
      const side = 'off-' + dept;
      const rows = sortPeopleList(
        officePeople.filter((p) => (personDept(p) || '未填部別') === dept),
        peopleSortState(side)
      );
      return `<div class="msb-zone msb-zone--office" data-msb-zone="office">
        <div class="msb-zone-head"><h4 class="msb-zone-title">${esc(dept)}</h4><span class="msb-zone-kicker">部別</span><span class="msb-zone-meta">${rows.length} 人</span></div>
        ${peopleTableHtml(side, rows, true)}
      </div>`;
    }).join('') : '<p class="msb-empty">尚無內勤人員</p>';
    const edit = state.canEdit;
    BIZ_ZONES.forEach((z) => {
      const body = $('msb-people-body-biz-' + z.id);
      const zoneList = sortPeopleList(
        list.filter((p) => isBizDept(personDept(p)) && bizZoneId(personDept(p)) === z.id),
        peopleSortState('biz-' + z.id)
      );
      fillPeopleBody(body, zoneList, edit);
    });
    syncPeopleSortHeaders();
  }
  function filteredRecords() {
    const q = String(state.filter.q || '').trim().toLowerCase();
    return (state.recordsEntries || []).filter((e) => {
      if (state.filter.projectId && String(e.projectId) !== String(state.filter.projectId)) return false;
      if (state.filter.from && String(e.scoreDate || '').slice(0, 10) < state.filter.from) return false;
      if (state.filter.to && String(e.scoreDate || '').slice(0, 10) > state.filter.to) return false;
      if (!q) return true;
      const blob = [e.personName, e.projectName, e.item, e.note, e.sessionLabel].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }
  function renderRecords() {
    const table = $('msb-all-table');
    if (!table) return;
    const list = filteredRecords();
    if ($('msb-records-count')) $('msb-records-count').textContent = '共 ' + list.length + ' 筆';
    const edit = state.canEdit;
    table.innerHTML = `<thead><tr>
      <th>日期</th><th>人員</th><th>專案</th><th>項目</th><th class="num">分數</th><th>備註</th>${edit ? '<th></th>' : ''}
    </tr></thead><tbody>` + (list.length ? list.map((e) => {
      const score = Number(e.score);
      const cls = score > 0 ? 'pos' : (score < 0 ? 'neg' : '');
      return `<tr>
        <td>${esc(fmtDate(e.scoreDate))}</td>
        <td>${esc(e.personName)}</td>
        <td>${esc(e.projectName)}</td>
        <td>${esc(e.item)}</td>
        <td class="num ${cls}">${esc(manualScoreText(e.score))}</td>
        <td>${esc(e.note || '')}</td>
        ${edit ? `<td class="act"><button type="button" class="msb-link" data-msb-edit="${esc(e.id)}">編</button> <button type="button" class="msb-link" data-msb-del="${esc(e.id)}">刪</button></td>` : ''}
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="msb-empty">尚無紀錄</td></tr>') + '</tbody>';
  }
  function renderSettings() {
    const peopleBox = $('msb-people-list');
    if (peopleBox) {
      const people = state.people || [];
      if (!people.length) {
        peopleBox.innerHTML = '<p class="msb-empty">尚無人員</p>';
      } else {
        const groups = settingsGroups(people);
        const block = (title, list) => `<section class="msb-org-block">
          <h4 class="msb-org-block-title">${title}</h4>
          ${list.length ? `<div class="msb-org-groups">${list.map((g) => {
            const rows = g.rows.slice().sort((a, b) => titleRank(a) - titleRank(b) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
            return `<section class="msb-org-group">
              <header class="msb-org-head">${esc(g.title)}</header>
              <div class="msb-org-stats">現有 <b>${rows.length}</b> 人</div>
              <div class="msb-org-table-wrap"><table class="msb-org-table">
                <thead><tr><th>狀態</th><th>姓名／職稱</th><th>部別</th><th>營業處</th><th></th></tr></thead>
                <tbody>${rows.map((p) => {
                  const titleText = personTitle(p);
                  const titleShow = titleText && titleText !== '其他' ? titleText : '';
                  const dept = personDept(p);
                  const biz = isBizDept(dept);
                  const area = biz ? (BIZ_ZONES.find((z) => z.id === bizZoneId(dept)) || {}).label || '—' : (dept || '—');
                  const office = biz ? dept : '—';
                  return `<tr>
                    <td class="msb-org-st">在職</td>
                    <td class="msb-org-name"><b>${esc(p.name)}</b>${titleShow ? `<small>${esc(titleShow)}</small>` : ''}</td>
                    <td>${esc(area)}</td>
                    <td>${esc(office)}</td>
                    <td class="msb-org-act"><button type="button" class="msb-link" data-msb-bind="${esc(p.id)}">修改</button><button type="button" class="msb-link msb-link--danger" data-msb-rm-person="${esc(p.id)}" data-msb-rm-name="${esc(p.name)}">移除</button></td>
                  </tr>`;
                }).join('')}</tbody>
              </table></div>
            </section>`;
          }).join('')}</div>` : '<p class="msb-empty">尚無人員</p>'}
        </section>`;
        peopleBox.innerHTML = block('業務單位', groups.biz) + block('內勤單位', groups.office);
      }
    }
    renderEditors();
  }
  function editorRows() {
    const q = String(state.editorQuery || '').trim().toLowerCase();
    const all = (state.editors || []).filter((a) => String(a.name || '').replace(/\s+/g, '') !== '許子緯');
    if (!q) return all.filter((a) => a.on);
    return all.filter((a) => [a.name, a.team, a.title].join(' ').toLowerCase().includes(q));
  }
  function renderEditors() {
    const box = $('msb-editors');
    if (!box) return;
    box.hidden = !state.canManage;
    const list = $('msb-editors-list');
    if (!list || !state.canManage) return;
    const q = String(state.editorQuery || '').trim();
    const rows = editorRows();
    if (!rows.length) {
      list.innerHTML = '<p class="msb-empty">' + (q ? '沒有符合的帳號' : '目前沒有人有加減分權限。搜尋姓名後勾選，才會開啟。') + '</p>';
      return;
    }
    list.innerHTML = rows.map((a) => `<label class="msb-editor-row">
          <input type="checkbox" data-msb-editor="${esc(a.id)}" ${a.on ? 'checked' : ''}>
          <span><b>${esc(a.name || '未命名')}</b><small>${esc([a.team, a.title].filter(Boolean).join(' · ') || '未填單位')}</small></span>
        </label>`).join('');
  }
  async function loadEditors() {
    if (!state.canManage) return;
    try {
      const res = await rpc('msb_editors_list', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '權限名單讀不到');
      state.editors = res.accounts || [];
    } catch (err) {
      state.editors = [];
      setMsg(err.message || String(err), 'err');
    }
    renderEditors();
  }
  async function toggleEditor(accountId, on, input) {
    if (!state.canManage || !accountId) return;
    if (input) input.disabled = true;
    try {
      const res = await rpc('msb_editors_set', { p_token: token(), p_account_id: accountId, p_on: !!on });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      const row = state.editors.find((a) => String(a.id) === String(accountId));
      if (row) row.on = !!on;
    } catch (err) {
      if (input) input.checked = !on;
      setMsg(err.message || String(err), 'err');
    } finally {
      if (input) input.disabled = false;
    }
  }
  async function removePerson(personId, personName) {
    if (!state.canEdit) {
      setMsg('沒有權限移除人員', 'err');
      return;
    }
    const label = personName || '這位人員';
    if (!window.confirm('確定移除「' + label + '」？移除後總表不會再顯示。')) return;
    setMsg('移除中…');
    try {
      const res = await rpc('msb_person_remove', {
        p_token: token(),
        p_id: Number(personId)
      });
      if (!res?.ok) throw new Error(res?.error || '移除失敗');
      const rid = String(personId);
      const rname = String(res.name || personName || '').trim();
      state.people = (state.people || []).filter((p) => {
        if (String(p.id) === rid) return false;
        if (rname && normName(p.name) === normName(rname)) return false;
        return true;
      });
      renderSettings();
      renderPeopleTable();
      fillSelects();
      setMsg('已移除「' + (rname || label) + '」', 'ok');
      await reload();
      if (state.view === 'settings') setView('settings');
      setMsg('已移除「' + (rname || label) + '」', 'ok');
    } catch (err) {
      setMsg(err.message || String(err), 'err');
    }
  }
  function normName(s) {
    return String(s || '').replace(/\s+/g, '').trim();
  }
  function renderAll() {
    applyAccess();
    fillSelects();
    renderPeopleTable();
    renderRecords();
    renderSettings();
  }
  async function loadYearEntries(year) {
    try {
      const all = await fetchList(year + '-01|all');
      if (state.span !== 'year' || state.year !== year) return;
      state.entries = (all.entries || []).filter((e) => String(e.scoreDate || '').slice(0, 4) === year);
      if (state.view !== 'records') state.recordsEntries = state.entries.slice();
      if (state.expandedPersonId) renderPeopleTable();
    } catch (_) { /* 年度總表先顯示，明細晚一點補上 */ }
  }
  async function fetchList(month) {
    const res = await rpc('msb_list', { p_token: token(), p_board: state.board, p_month: month });
    if (!res?.ok) throw new Error(res?.error || '載入失敗');
    return res;
  }
  async function reload() {
    if (!token()) { setMsg('請先登入工具箱', 'err'); return; }
    setMsg('載入中…');
    try {
      const yearMode = state.span === 'year';
      const year = state.year || currentMonth().slice(0, 4);
      const month = yearMode ? (year + '-01') : (state.month || currentMonth());
      const dash = await fetchList(month);
      state.serverScoped = Object.prototype.hasOwnProperty.call(dash, 'canViewAll');
      const me = window.skyfunAuth?.getUser?.() || {};
      state.canViewAll = state.serverScoped ? !!dash.canViewAll : !!window.skyfunAuth?.canViewAllScores?.(me);
      state.canEdit = state.serverScoped ? !!dash.canEdit : !!window.skyfunAuth?.canEditScores?.(me);
      state.viewerId = dash.viewerId || me.id || '';
      state.scoreMonth = yearMode ? year : (dash.scoreMonth || month);
      state.people = dash.people || [];
      if (yearMode) {
        const yr = await rpc('msb_year_scores', { p_token: token(), p_board: state.board, p_year: year });
        if (!yr?.ok) throw new Error(yr?.error || '年度分數讀不到');
        const byId = new Map((yr.people || []).map((row) => [String(row.id), row]));
        state.people = state.people.map((p) => {
          const hit = byId.get(String(p.id));
          return Object.assign({}, p, {
            score: hit && hit.score != null ? hit.score : null,
            bonus: hit && hit.bonus != null ? hit.bonus : null,
            bonusStatus: ''
          });
        });
      }
      /* 專案以 system 為主，同名只留一筆，避免總表加減分對不到 */
      {
        const map = new Map();
        (dash.projects || []).forEach((row) => {
          const key = String(row.name || '');
          const prev = map.get(key);
          if (!prev || row.board === WRITE_BOARD) map.set(key, row);
        });
        state.projects = [...map.values()];
      }
      state.entries = yearMode ? [] : (dash.entries || []);
      if (yearMode) void loadYearEntries(year);
      if (!state.serverScoped && !state.canViewAll) {
        state.people = [];
        state.projects = [];
        state.entries = [];
      }
      if (state.view === 'records') {
        const all = await fetchList(month + '|all');
        state.recordsEntries = (!state.serverScoped && !state.canViewAll) ? [] : (all.entries || []);
      } else {
        state.recordsEntries = state.entries.slice();
      }
      const scopeNote = $('msb-scope-note');
      if (scopeNote) {
        if (!state.serverScoped) {
          scopeNote.hidden = false;
          scopeNote.textContent = '權限 SQL 尚未套用時：有權限者仍可看名單；一般員工先不顯示。';
        } else {
          scopeNote.hidden = true;
          scopeNote.textContent = '';
        }
      }
      setMsg('');
      renderAll();
    } catch (err) {
      setMsg(err.message || String(err), 'err');
    }
  }
  function snapshotForm() {
    return JSON.stringify({
      person: $('msb-person')?.value || '',
      project: $('msb-project')?.value || '',
      date: $('msb-date')?.value || '',
      score: $('msb-score')?.value || '',
      item: $('msb-item')?.value || '',
      note: $('msb-note')?.value || '',
      session: $('msb-session')?.value || '',
      editId: state.editId
    });
  }
  let formBaseline = '';
  function markFormClean() { formBaseline = snapshotForm(); state.formDirty = false; }
  function checkDirty() { state.formDirty = snapshotForm() !== formBaseline; return state.formDirty; }
  function openModal(editId, personId, asMinus) {
    const e = editId != null
      ? (state.recordsEntries.find((x) => String(x.id) === String(editId))
        || state.entries.find((x) => String(x.id) === String(editId)))
      : null;
    state.editId = e ? e.id : null;
    fillSelects(personId || (e && e.personId));
    if (e) {
      if ($('msb-person')) $('msb-person').value = String(e.personId);
      if ($('msb-project')) $('msb-project').value = String(e.projectId || defaultProjectId());
      if ($('msb-date')) $('msb-date').value = String(e.scoreDate || '').slice(0, 10);
      if ($('msb-score')) $('msb-score').value = String(e.score);
      if ($('msb-item')) $('msb-item').value = e.item || '加減分';
      if ($('msb-note')) $('msb-note').value = e.note || '';
      if ($('msb-session')) $('msb-session').value = '';
      if ($('msb-form-title')) $('msb-form-title').textContent = '編輯加減分';
    } else {
      $('msb-entry-form')?.reset();
      if ($('msb-date')) $('msb-date').value = todayStr();
      if ($('msb-project')) $('msb-project').value = defaultProjectId();
      if ($('msb-item')) $('msb-item').value = asMinus ? '減分' : '加分';
      if ($('msb-session')) $('msb-session').value = '';
      if (personId && $('msb-person')) $('msb-person').value = String(personId);
      if (asMinus && $('msb-score')) $('msb-score').value = '-';
      if ($('msb-form-title')) $('msb-form-title').textContent = asMinus ? '減分' : '加分';
      fillSelects(personId);
      if (personId && $('msb-person')) $('msb-person').value = String(personId);
      if ($('msb-project')) $('msb-project').value = defaultProjectId();
      if ($('msb-item')) $('msb-item').value = asMinus ? '減分' : '加分';
    }
    setMsg('', '', 'msb-form-msg');
    const modal = $('msb-modal');
    if (modal) {
      mountModal(modal);
      modal.hidden = false;
    }
    document.body.classList.add('msb-modal-open');
    markFormClean();
  }
  function closeModal(force) {
    if (!force && checkDirty() && !window.confirm('尚未儲存，確定關閉？')) return false;
    if ($('msb-modal')) $('msb-modal').hidden = true;
    document.body.classList.remove('msb-modal-open');
    state.editId = null;
    state.formDirty = false;
    return true;
  }
  function openMonthModal(personId) {
    if (!state.canEdit) return;
    fillSelects(personId);
    const person = (state.people || []).find((p) => String(p.id) === String(personId));
    if ($('msb-month-person')) $('msb-month-person').value = person ? String(person.id) : '';
    if ($('msb-month-period')) $('msb-month-period').value = state.scoreMonth || state.month || currentMonth();
    if ($('msb-month-score')) $('msb-month-score').value = person && numOrNull(person.score) != null ? String(person.score) : '';
    if ($('msb-month-bonus')) $('msb-month-bonus').value = person && bonusAmount(person.bonus) != null ? String(person.bonus) : '';
    if ($('msb-month-status')) $('msb-month-status').value = person ? (person.bonusStatus || '') : '';
    if ($('msb-month-note')) $('msb-month-note').value = person ? (person.monthNote || '') : '';
    setMsg('', '', 'msb-month-msg');
    const modal = $('msb-month-modal');
    if (modal) {
      mountModal(modal);
      modal.hidden = false;
    }
    document.body.classList.add('msb-modal-open');
  }
  function closeMonthModal() {
    if ($('msb-month-modal')) $('msb-month-modal').hidden = true;
    if ($('msb-modal')?.hidden && $('msb-bind-modal')?.hidden) document.body.classList.remove('msb-modal-open');
  }
  function fillBindDept(selected) {
    const el = $('msb-bind-dept');
    const list = $('msb-bind-dept-list');
    if (!el) return;
    const fromPeople = (state.people || []).map(personDept).filter(Boolean);
    const depts = [...new Set([...BACK_OFFICE_DEPTS, ...OFFICE_NS, ...fromPeople])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    if (list) {
      list.innerHTML = depts.map((d) => `<option value="${esc(d)}"></option>`).join('');
    }
    el.value = selected || '';
  }
  function fillBindAccounts(selected) {
    const el = $('msb-bind-account');
    if (!el) return;
    const opts = (state.accountOptions || []).map((a) =>
      `<option value="${esc(a.id)}">${esc(a.name || '')}${a.username ? '（' + esc(a.username) + '）' : ''}</option>`
    ).join('');
    el.innerHTML = '<option value="">（不改帳號）</option>' + opts;
    if (selected && [...el.options].some((o) => o.value === selected)) el.value = selected;
  }
  function selectedBindAccount() {
    const id = String($('msb-bind-account')?.value || '').trim();
    if (!id) return null;
    return (state.accountOptions || []).find((a) => String(a.id) === id) || null;
  }
  /** 對到帳號後，總表顯示姓名跟著帳號走 */
  function syncBindNameFromAccount(acc) {
    if (!acc) return;
    const name = String(acc.name || '').trim();
    if (!name) return;
    if ($('msb-bind-name')) $('msb-bind-name').value = name;
    if ($('msb-bind-person-label')) $('msb-bind-person-label').textContent = name;
  }
  async function openBindModal(personId) {
    if (!state.canEdit) return;
    const person = (state.people || []).find((p) => String(p.id) === String(personId));
    if (!person) return;
    state.bindPersonId = person.id;
    if ($('msb-bind-person-id')) $('msb-bind-person-id').value = String(person.id);
    if ($('msb-bind-person-label')) $('msb-bind-person-label').textContent = person.name || '';
    if ($('msb-bind-name')) $('msb-bind-name').value = person.name || '';
    fillBindDept(personDept(person));
    {
      const t = personTitle(person);
      if ($('msb-bind-job-title')) $('msb-bind-job-title').value = t && t !== '其他' ? t : '';
    }
    if ($('msb-bind-account-q')) $('msb-bind-account-q').value = person.name || '';
    try {
      const res = await rpc('msb_accounts_lookup', { p_token: token(), p_q: person.name || '' });
      if (res?.ok) state.accountOptions = res.accounts || [];
    } catch (_) { state.accountOptions = []; }
    fillBindAccounts(person.accountId || '');
    setMsg('', '', 'msb-bind-msg');
    const modal = $('msb-bind-modal');
    if (modal) {
      mountModal(modal);
      modal.hidden = false;
    }
    document.body.classList.add('msb-modal-open');
  }
  function closeBindModal() {
    if ($('msb-bind-modal')) $('msb-bind-modal').hidden = true;
    if ($('msb-modal')?.hidden && $('msb-month-modal')?.hidden) document.body.classList.remove('msb-modal-open');
  }
  function exportCsv(list) {
    const rows = [['計分日期', '人員', '專案', '場次', '加減分項目', '分數', '備註']];
    (list || []).forEach((e) => {
      rows.push([fmtDate(e.scoreDate), e.personName, e.projectName, e.sessionLabel || '', e.item, e.score, e.note || '']);
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '會議計分_' + state.board + '_' + (state.month || 'all') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function syncSpanUi() {
    const span = state.span === 'year' ? 'year' : 'month';
    document.querySelectorAll('#page-meeting-scoreboard [data-msb-span]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-msb-span') === span);
    });
    const monthEl = $('msb-month');
    const yearEl = $('msb-year');
    if (monthEl) monthEl.hidden = span === 'year';
    if (yearEl) {
      yearEl.hidden = span !== 'year';
      if (state.year) yearEl.value = state.year;
    }
  }
  function bind() {
    if (state.bound) return;
    state.bound = true;
    state.month = currentMonth();
    state.year = state.month.slice(0, 4);
    if ($('msb-month')) $('msb-month').value = state.month;
    if ($('msb-year')) $('msb-year').value = state.year;
    syncSpanUi();

    const onMsbClick = async (e) => {
      const sortTh = e.target.closest('th[data-msb-sort]');
      if (sortTh) {
        togglePeopleSort(
          sortTh.getAttribute('data-msb-sort'),
          sortTh.getAttribute('data-msb-sort-side') || 'office'
        );
        return;
      }
      const spanBtn = e.target.closest('[data-msb-span]');
      if (spanBtn) {
        state.span = spanBtn.getAttribute('data-msb-span') === 'year' ? 'year' : 'month';
        if (state.span === 'year') {
          state.year = String($('msb-year')?.value || state.month || currentMonth()).slice(0, 4);
        }
        syncSpanUi();
        await reload();
        return;
      }
      const viewBtn = e.target.closest('[data-msb-view]');
      if (viewBtn) {
        setView(viewBtn.getAttribute('data-msb-view'));
        await reload();
        return;
      }
      if (e.target.closest('[data-msb-close]')) { closeModal(false); return; }
      if (e.target.closest('[data-msb-month-close]')) { closeMonthModal(); return; }
      if (e.target.closest('[data-msb-bind-close]')) { closeBindModal(); return; }
      if (e.target.id === 'msb-open-add' || e.target.id === 'msb-open-add-2') {
        if (!state.canEdit) return;
        openModal(null, null, false);
        return;
      }
      const addBtn = e.target.closest('[data-msb-add]');
      if (addBtn) {
        if (!state.canEdit) return;
        openModal(null, addBtn.getAttribute('data-msb-add'), addBtn.hasAttribute('data-msb-minus'));
        return;
      }
      const scorePerson = e.target.closest('[data-msb-score-person]');
      if (scorePerson && state.canEdit) {
        openMonthModal(scorePerson.getAttribute('data-msb-score-person'));
        return;
      }
      const expandRow = e.target.closest('tr[data-msb-expand]');
      if (expandRow && !e.target.closest('button, a, input, select, textarea, label')) {
        const pid = expandRow.getAttribute('data-msb-expand') || '';
        state.expandedPersonId = String(state.expandedPersonId) === String(pid) ? '' : pid;
        renderPeopleTable();
        return;
      }
      const bindBtn = e.target.closest('[data-msb-bind]');
      if (bindBtn) { await openBindModal(bindBtn.getAttribute('data-msb-bind')); return; }
      if (e.target.id === 'msb-export') {
        exportCsv(state.entries);
        return;
      }
      if (e.target.id === 'msb-export-records') {
        exportCsv(filteredRecords());
        return;
      }
      if (e.target.id === 'msb-filter-clear') {
        state.filter = { q: '', projectId: '', from: '', to: '' };
        if ($('msb-q')) $('msb-q').value = '';
        if ($('msb-filter-project')) $('msb-filter-project').value = '';
        if ($('msb-date-from')) $('msb-date-from').value = '';
        if ($('msb-date-to')) $('msb-date-to').value = '';
        renderRecords();
        return;
      }
      const edit = e.target.closest('[data-msb-edit]');
      if (edit) { if (state.canEdit) openModal(edit.getAttribute('data-msb-edit')); return; }
      const del = e.target.closest('[data-msb-del]');
      if (del) {
        if (!state.canEdit) return;
        if (!window.confirm('確定刪除此筆？')) return;
        try {
          const res = await rpc('msb_entry_delete', { p_token: token(), p_id: Number(del.getAttribute('data-msb-del')) });
          if (!res?.ok) throw new Error(res?.error || '刪除失敗');
          setMsg('已刪除', 'ok');
          await reload();
        } catch (err) { setMsg(err.message || String(err), 'err'); }
        return;
      }
      const rmP = e.target.closest('[data-msb-rm-person]');
      if (rmP) {
        e.preventDefault();
        e.stopPropagation();
        await removePerson(
          rmP.getAttribute('data-msb-rm-person'),
          rmP.getAttribute('data-msb-rm-name') || ''
        );
        return;
      }
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#page-meeting-scoreboard, .msb-modal')) return;
      onMsbClick(e);
    });

    $('msb-month')?.addEventListener('change', async (e) => {
      state.month = e.target.value || currentMonth();
      state.year = state.month.slice(0, 4);
      if ($('msb-year')) $('msb-year').value = state.year;
      await reload();
    });
    $('msb-year')?.addEventListener('change', async (e) => {
      const y = String(e.target.value || '').trim();
      if (!/^\d{4}$/.test(y)) return;
      state.year = y;
      await reload();
    });
    let staffSearchTimer = null;
    $('msb-staff-q')?.addEventListener('input', () => {
      state.q = $('msb-staff-q')?.value || '';
      clearTimeout(staffSearchTimer);
      staffSearchTimer = setTimeout(renderPeopleTable, 160);
    });
    let bindSearchTimer = null;
    $('msb-bind-account-q')?.addEventListener('input', () => {
      clearTimeout(bindSearchTimer);
      bindSearchTimer = setTimeout(async () => {
        const q = String($('msb-bind-account-q')?.value || '').trim();
        try {
          const res = await rpc('msb_accounts_lookup', { p_token: token(), p_q: q });
          if (res?.ok) state.accountOptions = res.accounts || [];
        } catch (_) { /* keep */ }
        fillBindAccounts($('msb-bind-account')?.value || '');
      }, 220);
    });
    $('msb-bind-account')?.addEventListener('change', () => {
      syncBindNameFromAccount(selectedBindAccount());
    });
    $('msb-bind-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!state.canEdit) {
        setMsg('沒有權限修改', 'err', 'msb-bind-msg');
        return;
      }
      if (state.busy) {
        setMsg('儲存中，請稍候…', 'err', 'msb-bind-msg');
        return;
      }
      const personId = Number($('msb-bind-person-id')?.value || state.bindPersonId || 0);
      if (!personId) {
        setMsg('找不到人員編號，請關閉後重開', 'err', 'msb-bind-msg');
        return;
      }
      const accountVal = String($('msb-bind-account')?.value || '').trim();
      const acc = accountVal ? selectedBindAccount() : null;
      if (acc) syncBindNameFromAccount(acc);
      const newName = String($('msb-bind-name')?.value || '').trim() || String(acc?.name || '').trim();
      if (!newName) {
        setMsg('請填姓名，或先對到帳號', 'err', 'msb-bind-msg');
        return;
      }
      state.busy = true;
      const btn = $('msb-bind-save');
      if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
      try {
        const payload = {
          p_token: token(),
          p_id: personId,
          p_name: newName,
          p_department: $('msb-bind-dept')?.value || '',
          p_job_title: String($('msb-bind-job-title')?.value || '').trim()
        };
        if (accountVal) payload.p_account_id = accountVal;
        const res = await rpc('msb_person_patch', payload);
        if (!res?.ok) throw new Error(res?.error || '儲存失敗');
        closeBindModal();
        setMsg('已更新「' + newName + '」', 'ok');
        await reload();
        if (state.view === 'settings') setView('settings');
        setMsg('已更新「' + newName + '」', 'ok');
      } catch (err) {
        setMsg(err.message || String(err), 'err', 'msb-bind-msg');
      } finally {
        state.busy = false;
        if (btn) { btn.disabled = false; btn.textContent = '儲存'; }
      }
    });
    $('msb-month-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!state.canEdit || state.busy) return;
      state.busy = true;
      const btn = $('msb-month-save');
      if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
      try {
        const monthPersonId = Number($('msb-month-person')?.value || 0) || null;
        const res = await rpc('msb_month_score_upsert', {
          p_token: token(),
          p_data: {
            board: writeBoardForPersonId(monthPersonId),
            personId: monthPersonId,
            periodMonth: $('msb-month-period')?.value || state.month,
            score: $('msb-month-score')?.value || '',
            bonus: $('msb-month-bonus')?.value || '',
            bonusStatus: $('msb-month-status')?.value || '',
            note: $('msb-month-note')?.value || ''
          }
        });
        if (!res?.ok) throw new Error(res?.error || '儲存失敗');
        closeMonthModal();
        if ($('msb-month-period')?.value && $('msb-month-period').value !== state.month) {
          state.month = $('msb-month-period').value;
          if ($('msb-month')) $('msb-month').value = state.month;
        }
        setMsg('已儲存這個月的分數', 'ok');
        await reload();
      } catch (err) {
        setMsg(err.message || String(err), 'err', 'msb-month-msg');
      } finally {
        state.busy = false;
        if (btn) { btn.disabled = false; btn.textContent = '儲存'; }
      }
    });
    ['msb-q', 'msb-filter-project', 'msb-date-from', 'msb-date-to'].forEach((id) => {
      const sync = () => {
        state.filter.q = $('msb-q')?.value || '';
        state.filter.projectId = $('msb-filter-project')?.value || '';
        state.filter.from = $('msb-date-from')?.value || '';
        state.filter.to = $('msb-date-to')?.value || '';
        renderRecords();
      };
      $(id)?.addEventListener('input', sync);
      $(id)?.addEventListener('change', sync);
    });
    $('msb-entry-form')?.addEventListener('input', () => { checkDirty(); });
    $('msb-entry-form')?.addEventListener('change', () => { checkDirty(); });
    $('msb-entry-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (state.busy) return;
      state.busy = true;
      const btn = $('msb-save');
      if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
      try {
        const entryPersonId = Number($('msb-person')?.value || 0) || null;
        const projectId = Number($('msb-project')?.value || defaultProjectId() || 0) || null;
        const item = String($('msb-item')?.value || $('msb-note')?.value || '加減分').trim() || '加減分';
        if (!projectId) throw new Error('尚無可寫入的專案，請稍後再試或通知管理員');
        const res = await rpc('msb_entry_save', {
          p_token: token(),
          p_data: {
            id: state.editId,
            board: writeBoardForPersonId(entryPersonId),
            personId: entryPersonId,
            projectId,
            scoreDate: $('msb-date')?.value || '',
            score: $('msb-score')?.value || '',
            item,
            note: $('msb-note')?.value || '',
            sessionLabel: ''
          }
        });
        if (!res?.ok) throw new Error(res?.error || '儲存失敗');
        const wasEdit = !!state.editId;
        markFormClean();
        closeModal(true);
        setMsg(wasEdit ? '已更新' : '已新增', 'ok');
        await reload();
      } catch (err) {
        setMsg(err.message || String(err), 'err', 'msb-form-msg');
      } finally {
        state.busy = false;
        if (btn) { btn.disabled = false; btn.textContent = '儲存'; }
      }
    });
    $('msb-editor-q')?.addEventListener('input', (e) => {
      state.editorQuery = e.target.value || '';
      renderEditors();
    });
    document.addEventListener('change', (e) => {
      const box = e.target.closest?.('[data-msb-editor]');
      if (!box) return;
      toggleEditor(box.getAttribute('data-msb-editor'), box.checked, box);
    });
    $('msb-add-person')?.addEventListener('click', async () => {
      const name = ($('msb-new-person')?.value || '').trim();
      try {
        const res = await rpc('msb_person_add', { p_token: token(), p_board: WRITE_BOARD, p_name: name });
        if (!res?.ok) throw new Error(res?.error || '新增失敗');
        if ($('msb-new-person')) $('msb-new-person').value = '';
        await reload();
      } catch (err) { setMsg(err.message || String(err), 'err'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('msb-month-modal') && !$('msb-month-modal').hidden) closeMonthModal();
      else if ($('msb-bind-modal') && !$('msb-bind-modal').hidden) closeBindModal();
      else if ($('msb-modal') && !$('msb-modal').hidden) closeModal(false);
    });
    setView('dash');
  }

  window.MeetingScoreboard = {
    onShow() {
      bind();
      setView('dash');
      reload();
    }
  };
})();
