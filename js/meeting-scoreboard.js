/**
 * 會議計分中心｜總經理室（左側導覽＋儀表板／紀錄／設定＋加減分彈窗）
 */
(function () {
  'use strict';

  const BOARDS = {
    system: { key: 'system', label: '系統會議計分表' },
    monthly: { key: 'monthly', label: '月會主管計分表' }
  };

  const TITLE_ORDER = ['營業區協理', '營業處經理', '儲備處經理', '行政專員組長'];

  const SETTINGS_GATE_KEY = 'msb-settings-unlocked';

  const state = {
    view: 'dash',
    board: 'system',
    month: '',
    allMonths: false,
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
    viewerId: '',
    scoreMonth: '',
    serverScoped: false,
    staff: { q: '', dept: '', sort: 'score', list: true },
    batchRows: [],
    bindPersonId: null,
    accountOptions: []
  };

  function settingsUnlocked() {
    try { return sessionStorage.getItem(SETTINGS_GATE_KEY) === '1'; } catch (_) { return false; }
  }

  function setSettingsUnlocked(on) {
    try {
      if (on) sessionStorage.setItem(SETTINGS_GATE_KEY, '1');
      else sessionStorage.removeItem(SETTINGS_GATE_KEY);
    } catch (_) { /* ignore */ }
  }

  function syncSettingsGate() {
    const lock = $('msb-settings-lock');
    const body = $('msb-settings-body');
    const open = settingsUnlocked();
    if (lock) lock.hidden = !!open;
    if (body) body.hidden = !open;
    if (!open && $('msb-settings-pwd')) {
      $('msb-settings-pwd').value = '';
      if ($('msb-settings-gate-msg')) {
        $('msb-settings-gate-msg').textContent = '';
        $('msb-settings-gate-msg').className = 'msb-msg';
      }
    }
  }

  function $(id) { return document.getElementById(id); }

  function token() {
    try { return window.skyfunAuth?.getToken?.() || ''; } catch (_) { return ''; }
  }

  async function rpc(name, args) {
    if (!window.skyfunAuth?.rpc) throw new Error('請先登入工具箱');
    return window.skyfunAuth.rpc(name, args);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setMsg(text, kind, elId) {
    const el = $(elId || 'msb-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msb-msg' + (kind ? ' is-' + kind : '');
  }

  function monthValue() {
    if (state.allMonths) return null;
    return state.month || null;
  }

  function fmtDate(d) {
    const s = String(d || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
    return s.replace(/-/g, '/');
  }

  function fmtScore(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    const t = Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    return (v > 0 ? '+' : '') + t;
  }

  function scoreChip(n, opts) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '<span class="msb-score msb-score--zero">—</span>';
    const kind = v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero');
    const size = opts && opts.size ? ' msb-score--' + opts.size : '';
    return `<span class="msb-score msb-score--${kind}${size}">${fmtScore(v)}</span>`;
  }

  function todayStr() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function currentMonth() {
    return todayStr().slice(0, 7);
  }

  function listMonthArg() {
    const month = state.month || currentMonth();
    return state.allMonths ? month + '|all' : month;
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

  function bonusText(v) {
    const n = bonusAmount(v);
    if (n == null) return '—';
    return n.toLocaleString('zh-TW');
  }

  function bonusCellHtml(p) {
    const n = bonusAmount(p?.bonus);
    const status = String(p?.bonusStatus || '').trim();
    if (n == null) return '<span class="apt-nil">—</span>';
    const badge = (status === '待發放' || status === '已發放')
      ? ` <span class="apt-chip apt-chip--muted">${esc(status)}</span>`
      : '';
    return `<span class="msb-bonus-amt">${esc(n.toLocaleString('zh-TW'))}</span>${badge}`;
  }

  function scoreCellHtml(v) {
    const n = numOrNull(v);
    if (n == null) return '<span class="apt-nil">—</span>';
    return esc(manualScoreText(v));
  }

  function nameMarksHtml(p) {
    const bits = [];
    if (isMine(p)) bits.push('<span class="msb-you-mark">你</span>');
    if (!personDept(p)) bits.push('<span class="apt-chip apt-chip--muted msb-tiny-mark">未填部別</span>');
    if (!p.accountId) bits.push('<span class="apt-chip apt-chip--muted msb-tiny-mark">未對帳</span>');
    return bits.join(' ');
  }

  function isMine(p) {
    return !!(state.viewerId && p && p.accountId && String(p.accountId) === String(state.viewerId));
  }

  function personDept(p) {
    return String(p?.department || '').trim();
  }

  function applyAccess() {
    const all = !!state.canViewAll;
    const edit = !!state.canEdit;
    document.querySelectorAll('#page-meeting-scoreboard .msb-edit-only').forEach((el) => {
      el.hidden = !edit;
    });
    document.querySelectorAll('#page-meeting-scoreboard .msb-company-only').forEach((el) => {
      el.hidden = !all;
    });
    const tools = $('msb-staff-tools');
    if (tools) tools.hidden = !all;
    const self = $('msb-self');
    if (self) self.hidden = all;
    if (!edit && state.view === 'settings') setView('dash');
  }

  function boardLabel() {
    return (BOARDS[state.board] || BOARDS.system).label;
  }

  function personTitle(p) {
    return String(p?.title || p?.jobTitle || '').trim() || '其他';
  }

  function peopleGrouped() {
    const groups = {};
    (state.people || []).forEach((p) => {
      const t = personTitle(p);
      if (!groups[t]) groups[t] = [];
      groups[t].push(p);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = TITLE_ORDER.indexOf(a);
      const ib = TITLE_ORDER.indexOf(b);
      const ra = ia < 0 ? 99 : ia;
      const rb = ib < 0 ? 99 : ib;
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, 'zh-Hant');
    });
    return keys.map((title) => ({ title, people: groups[title] }));
  }

  function summarize(entries) {
    const list = entries || [];
    let total = 0;
    let plus = 0;
    let minus = 0;
    let plusN = 0;
    let minusN = 0;
    const people = new Set();
    const projects = new Set();
    const byPerson = {};
    const byProject = {};
    const matrix = {};

    list.forEach((e) => {
      const s = Number(e.score) || 0;
      total += s;
      if (s > 0) { plus += s; plusN += 1; }
      if (s < 0) { minus += s; minusN += 1; }
      people.add(e.personId);
      projects.add(e.projectId);
      byPerson[e.personId] = (byPerson[e.personId] || 0) + s;
      byProject[e.projectId] = {
        score: (byProject[e.projectId]?.score || 0) + s,
        count: (byProject[e.projectId]?.count || 0) + 1,
        name: e.projectName
      };
      if (!matrix[e.personId]) matrix[e.personId] = { name: e.personName, total: 0, by: {} };
      matrix[e.personId].total += s;
      matrix[e.personId].by[e.projectId] = (matrix[e.personId].by[e.projectId] || 0) + s;
      matrix[e.personId].name = e.personName;
    });

    const personRank = Object.keys(byPerson)
      .map((id) => ({
        id: Number(id),
        name: (state.people.find((p) => String(p.id) === String(id)) || {}).name
          || matrix[id]?.name || '—',
        score: byPerson[id]
      }))
      .sort((a, b) => b.score - a.score);

    const projectRank = Object.keys(byProject)
      .map((id) => ({
        id: Number(id),
        name: byProject[id].name,
        score: byProject[id].score,
        count: byProject[id].count
      }))
      .sort((a, b) => b.score - a.score);

    return {
      total, plus, minus, plusN, minusN,
      peopleN: people.size,
      projectsN: projects.size,
      personRank, projectRank, matrix
    };
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('#page-meeting-scoreboard .msb-side-link').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-msb-view') === view);
    });
    document.querySelectorAll('#page-meeting-scoreboard .msb-panel').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-msb-panel') !== view;
    });
    $('msb-app')?.classList.remove('is-nav-open');
    const toggle = $('msb-nav-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    if (view === 'settings') syncSettingsGate();
  }

  function fillSelects() {
    const personSel = $('msb-person');
    const projectSel = $('msb-project');
    if (personSel) {
      const groups = peopleGrouped();
      personSel.innerHTML = '<option value="">請選擇</option>' +
        groups.map((g) =>
          `<optgroup label="${esc(g.title)}">` +
          g.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('') +
          '</optgroup>'
        ).join('');
    }
    if (projectSel) {
      projectSel.innerHTML = '<option value="">請選擇</option>' +
        state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    }
    const monthPerson = $('msb-month-person');
    if (monthPerson) {
      const groups = peopleGrouped();
      const cur = monthPerson.value;
      monthPerson.innerHTML = '<option value="">請選擇</option>' +
        groups.map((g) =>
          `<optgroup label="${esc(g.title)}">` +
          g.people.map((p) => `<option value="${p.id}">${esc((personDept(p) ? personDept(p) + ' ' : '') + p.name)}</option>`).join('') +
          '</optgroup>'
        ).join('');
      if (cur) monthPerson.value = cur;
    }
    const filterProject = $('msb-filter-project');
    if (filterProject) {
      const cur = filterProject.value;
      filterProject.innerHTML = '<option value="">全部專案</option>' +
        state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      filterProject.value = cur || '';
    }
    const sessionWrap = $('msb-session-wrap');
    if (sessionWrap) sessionWrap.hidden = state.board !== 'monthly';
    if ($('msb-modal-board')) $('msb-modal-board').textContent = boardLabel();
  }

  function syncBoardTabs() {
    document.querySelectorAll('#page-meeting-scoreboard [data-msb-board]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.getAttribute('data-msb-board') === state.board);
    });
    const monthInput = $('msb-month');
    if (monthInput && state.month) monthInput.value = state.month;
    $('msb-all-period')?.classList.toggle('is-on', !!state.allMonths);
  }

  function renderDash() {
    const s = summarize(state.entries);
    const period = state.allMonths ? '全部期間' : (state.month || '本月');
    if ($('msb-kpi-total')) {
      $('msb-kpi-total').textContent = (Number.isInteger(s.total) ? s.total : Math.round(s.total * 100) / 100) + ' 分';
    }
    if ($('msb-kpi-total-sub')) $('msb-kpi-total-sub').textContent = period + '累計';
    if ($('msb-kpi-plus')) $('msb-kpi-plus').textContent = fmtScore(s.plus) + ' 分';
    if ($('msb-kpi-plus-sub')) $('msb-kpi-plus-sub').textContent = '共 ' + s.plusN + ' 筆加分紀錄';
    if ($('msb-kpi-minus')) $('msb-kpi-minus').textContent = (s.minus === 0 ? '0' : fmtScore(s.minus)) + ' 分';
    if ($('msb-kpi-minus-sub')) $('msb-kpi-minus-sub').textContent = '共 ' + s.minusN + ' 筆減分紀錄';
    if ($('msb-kpi-people')) $('msb-kpi-people').textContent = s.peopleN + ' 位';
    if ($('msb-kpi-people-sub')) $('msb-kpi-people-sub').textContent = s.projectsN + ' 個專案區塊參與計分';
    $('msb-kpi-plus')?.closest('.msb-kpi')?.classList.add('msb-kpi--plus');
    $('msb-kpi-minus')?.closest('.msb-kpi')?.classList.add('msb-kpi--minus');

    const maxP = Math.max(1, ...s.personRank.map((x) => Math.abs(x.score)), 0);
    if ($('msb-person-rank')) {
      $('msb-person-rank').innerHTML = s.personRank.length
        ? s.personRank.map((r, i) =>
            `<div class="msb-rank-row"><b>${String(i + 1).padStart(2, '0')}</b>` +
            `<div><div>${esc(r.name)}</div>` +
            `<small class="msb-dept">${esc(personDept(state.people.find((p) => String(p.id) === String(r.id))) || '')}</small>` +
            `<div class="msb-bar${r.score < 0 ? ' is-neg' : ''}"><i style="width:${Math.min(100, Math.abs(r.score) / maxP * 100)}%"></i></div></div>` +
            scoreChip(r.score, { size: 'lg' }) + '</div>'
          ).join('')
        : '<p class="msb-empty">尚無分數資料</p>';
    }

    const maxPr = Math.max(1, ...s.projectRank.map((x) => Math.abs(x.score)), 0);
    if ($('msb-project-rank')) {
      $('msb-project-rank').innerHTML = s.projectRank.length
        ? s.projectRank.map((r) =>
            `<div class="msb-rank-row"><b>·</b>` +
            `<div><div>${esc(r.name)} <small>（${r.count} 筆）</small></div>` +
            `<div class="msb-bar${r.score < 0 ? ' is-neg' : ''}"><i style="width:${Math.min(100, Math.abs(r.score) / maxPr * 100)}%"></i></div></div>` +
            scoreChip(r.score, { size: 'lg' }) + '</div>'
          ).join('')
        : '<p class="msb-empty">尚無專案資料</p>';
    }

    const projects = state.projects;
    let head = '<th>加分人員</th>' + projects.map((p) => `<th>${esc(p.name)}</th>`).join('') + '<th>總分</th>';
    const rows = Object.keys(s.matrix).map((pid) => {
      const m = s.matrix[pid];
      return `<tr><td>${esc(m.name)}</td>` +
        projects.map((p) => {
          const v = m.by[p.id];
          if (v == null) return '<td>—</td>';
          return `<td>${scoreChip(v)}</td>`;
        }).join('') +
        `<td>${scoreChip(m.total, { size: 'lg' })}</td></tr>`;
    }).join('');
    if ($('msb-matrix')) {
      $('msb-matrix').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows || '<tr><td colspan="' + (projects.length + 2) + '">尚無資料</td></tr>'}</tbody>`;
    }
    renderTable($('msb-recent-table'), (state.entries || []).slice(0, 8));
  }

  function filteredRecords() {
    const q = String(state.filter.q || '').trim().toLowerCase();
    const pid = String(state.filter.projectId || '');
    const from = String(state.filter.from || '');
    const to = String(state.filter.to || '');
    return (state.recordsEntries || []).filter((e) => {
      const date = String(e.scoreDate || '').slice(0, 10);
      if (pid && String(e.projectId) !== pid) return false;
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (!q) return true;
      const blob = [e.personName, e.item, e.note, e.projectName, e.sessionLabel].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }

  function noteCell(note) {
    const text = String(note || '').trim();
    if (!text) return '—';
    if (text.length <= 40) return esc(text);
    return `<div class="msb-note-cell" data-collapsed="1">${esc(text)}</div>` +
      `<button type="button" class="msb-note-more" data-msb-note-toggle="1">展開</button>`;
  }

  function renderTable(table, list) {
    if (!table) return;
    const edit = !!state.canEdit;
    const body = (list || []).map((e) =>
      `<tr>
        <td>${esc(fmtDate(e.scoreDate))}</td>
        <td>${esc(e.personName)}</td>
        <td>${esc(e.projectName)}${e.sessionLabel ? '<br><small>' + esc(e.sessionLabel) + '</small>' : ''}</td>
        <td>${esc(e.item)}</td>
        <td class="msb-score-cell">${scoreChip(e.score, { size: 'lg' })}</td>
        <td>${noteCell(e.note)}</td>
        ${edit ? `<td>
          <button type="button" class="msb-linkish" data-msb-edit="${e.id}">編輯</button>
          <button type="button" class="msb-linkish is-danger" data-msb-del="${e.id}">刪除</button>
        </td>` : ''}
      </tr>`
    ).join('');
    const cols = edit ? 7 : 6;
    table.innerHTML = `<thead><tr>
      <th>計分日期</th><th>人員</th><th>專案／區塊</th><th>加減分項目</th><th>分數</th><th>當天備註</th>${edit ? '<th>操作</th>' : ''}
    </tr></thead><tbody>${body || '<tr><td colspan="' + cols + '">尚無紀錄</td></tr>'}</tbody>`;
  }

  function staffRows() {
    const q = String(state.staff.q || '').trim().toLowerCase();
    const dept = String(state.staff.dept || '');
    let rows = (state.people || []).filter((p) => {
      if (dept && personDept(p) !== dept) return false;
      if (!q) return true;
      return (String(p.name || '') + ' ' + personDept(p)).toLowerCase().includes(q);
    });
    const sort = state.staff.sort || 'score';
    rows = rows.slice().sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
      if (sort === 'dept') {
        const d = personDept(a).localeCompare(personDept(b), 'zh-Hant');
        return d || String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
      }
      if (sort === 'bonus') {
        const ba = bonusAmount(a.bonus);
        const bb = bonusAmount(b.bonus);
        if (ba == null && bb == null) return 0;
        if (ba == null) return 1;
        if (bb == null) return -1;
        return bb - ba;
      }
      const sa = numOrNull(a.score);
      const sb = numOrNull(b.score);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
    return rows;
  }

  function scoreCard(p, large) {
    const mine = isMine(p);
    const dept = personDept(p);
    return `<article class="msb-person-card${mine ? ' is-mine' : ''}${large ? ' is-large' : ''}" ${state.canEdit ? `data-msb-score-person="${p.id}" tabindex="0"` : ''}>
      <div class="msb-person-meta">${dept ? esc(dept) : '<span class="apt-nil">—</span>'} ${nameMarksHtml(p)}</div>
      <div class="msb-person-name">${esc(p.name || '—')}</div>
      <div class="msb-person-score">${manualScoreText(p.score)}</div>
      <div class="msb-person-bonus">${bonusCellHtml(p)}</div>
    </article>`;
  }

  function staffRowHtml(p) {
    const dept = personDept(p);
    const deptCell = dept
      ? `<td class="apt-mt-dept"><span>${esc(dept)}</span></td>`
      : '<td class="apt-mt-dept"><span class="apt-nil">—</span></td>';
    const nameBtn = state.canEdit
      ? `<button type="button" class="apt-name" data-msb-score-person="${esc(p.id)}">${esc(p.name || '—')}</button>`
      : `<span class="apt-name">${esc(p.name || '—')}</span>`;
    const bindBtn = state.canEdit && (!dept || !p.accountId)
      ? ` <button type="button" class="msb-bind-link" data-msb-bind="${esc(p.id)}">補</button>`
      : '';
    return `<tr class="${isMine(p) ? 'is-mine' : ''}">
      ${deptCell}
      <td>${nameBtn} ${nameMarksHtml(p)}${bindBtn}</td>
      <td class="num">${scoreCellHtml(p.score)}</td>
      <td class="num">${bonusCellHtml(p)}</td>
    </tr>`;
  }

  function groupStaffByDept(rows) {
    const map = new Map();
    rows.forEach((p) => {
      const key = personDept(p) || '未填部別';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === '未填部別') return 1;
      if (b === '未填部別') return -1;
      return a.localeCompare(b, 'zh-Hant');
    });
    return keys.map((dept) => {
      const people = map.get(dept).slice().sort((a, b) => {
        const sa = numOrNull(a.score);
        const sb = numOrNull(b.score);
        if (sa == null && sb == null) return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
        if (sa == null) return 1;
        if (sb == null) return -1;
        if (sb !== sa) return sb - sa;
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
      });
      return { dept, people };
    });
  }

  function staffTableHtml(people) {
    const body = people.map(staffRowHtml).join('');
    const sort = state.staff.sort || 'score';
    const th = (key, label) =>
      `<th class="apt-sortable${sort === key ? ' is-sorted' : ''}" data-msb-sort="${key}">${label}</th>`;
    return `<div class="apt-table-wrap msb-dense-wrap"><table class="apt-table apt-month-table msb-dense-table">
      <thead><tr>
        ${th('dept', '部別')}${th('name', '姓名')}${th('score', '分數')}${th('bonus', '獎金')}
      </tr></thead>
      <tbody>${body || '<tr><td colspan="4" class="apt-empty">這個月還沒有可顯示的人員</td></tr>'}</tbody>
    </table></div>`;
  }

  function renderDeptChips() {
    const box = $('msb-dept-chips');
    if (!box) return;
    const depts = [];
    (state.people || []).forEach((p) => {
      const d = personDept(p);
      if (d && depts.indexOf(d) < 0) depts.push(d);
    });
    depts.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const cur = state.staff.dept || '';
    box.innerHTML = ['全部'].concat(depts).map((name) => {
      const value = name === '全部' ? '' : name;
      const on = value === cur ? ' is-on' : '';
      return `<button type="button" class="msb-chip${on}" data-msb-dept="${esc(value)}">${esc(name)}</button>`;
    }).join('');
  }

  function renderStaff() {
    const month = state.scoreMonth || state.month || currentMonth();
    const note = $('msb-score-month-note');
    if (note) {
      note.textContent = state.allMonths
        ? '全部期間只展開加減分。分數與獎金仍是 ' + month + '。'
        : '分數與獎金是 ' + month + ' 的手動輸入，不是加減分加總。';
    }
    const groupsEl = $('msb-staff-groups');
    const cards = $('msb-staff-cards');
    const wrap = $('msb-staff-table-wrap');
    if (!state.canViewAll) {
      const box = $('msb-self');
      const mine = (state.people || []).find(isMine) || null;
      if (box) {
        if (!mine) {
          box.innerHTML = '<p class="msb-empty">目前還沒有你的分數資料</p>';
        } else {
          const dept = personDept(mine);
          const ownEntries = (state.entries || []).slice(0, 8).map((e) =>
            `<li><span>${esc(fmtDate(e.scoreDate))}</span><span>${esc(e.item || '')}</span>${scoreChip(e.score)}</li>`
          ).join('');
          box.innerHTML = `<div class="msb-self-summary">
            <div class="msb-self-summary-row"><span>部別</span><b>${dept ? esc(dept) : '<span class="apt-nil">—</span>'}</b></div>
            <div class="msb-self-summary-row"><span>姓名</span><b>${esc(mine.name || '—')}</b></div>
            <div class="msb-self-summary-row"><span>分數</span><b>${scoreCellHtml(mine.score)}</b></div>
            <div class="msb-self-summary-row"><span>獎金</span><b>${bonusCellHtml(mine)}</b></div>
          </div>` +
            (ownEntries ? `<ul class="msb-self-entries">${ownEntries}</ul>` : '<p class="msb-empty">這個月沒有你的加減分紀錄</p>');
        }
      }
      if (groupsEl) groupsEl.innerHTML = '';
      if (cards) { cards.hidden = true; cards.innerHTML = ''; }
      if (wrap) wrap.hidden = true;
      return;
    }
    renderDeptChips();
    const rows = staffRows();
    const viewBtn = $('msb-staff-view');
    const showTable = !!state.staff.list;
    if (viewBtn) viewBtn.textContent = showTable ? '大卡檢視' : '表格式檢視';
    if (cards) {
      cards.hidden = showTable;
      cards.innerHTML = (!showTable && rows.length)
        ? rows.map((p) => scoreCard(p, false)).join('')
        : (!showTable ? '<p class="msb-empty">這個月還沒有可顯示的人員</p>' : '');
    }
    if (wrap) wrap.hidden = true;
    if (groupsEl) {
      groupsEl.hidden = !showTable;
      if (showTable) {
        if (!rows.length) {
          groupsEl.innerHTML = '<p class="msb-empty">這個月還沒有可顯示的人員</p>';
        } else if (state.staff.dept || state.staff.sort !== 'score') {
          groupsEl.innerHTML = staffTableHtml(rows);
        } else {
          const groups = groupStaffByDept(rows);
          groupsEl.innerHTML = groups.map((g) =>
            `<div class="apt-group-title">${esc(g.dept)} <small>${g.people.length} 人</small></div>` +
            staffTableHtml(g.people)
          ).join('');
        }
      } else {
        groupsEl.innerHTML = '';
      }
    }
  }

  function parseBatch(text) {
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = [];
    const unmatched = [];
    lines.forEach((line, index) => {
      const cells = line.split(/\t|,/).map((c) => c.trim());
      if (!cells.length) return;
      if (index === 0 && /姓名|分數|部別/.test(cells[0])) return;
      let name = cells[0];
      let score = cells[1] || '';
      let bonus = cells[2] || '';
      let status = cells[3] || '';
      let note = cells[4] || '';
      if (cells.length >= 6 || (cells[0] && cells[1] && !/^-?\d/.test(cells[1]) && /^-?\d/.test(cells[2] || ''))) {
        name = cells[1];
        score = cells[2] || '';
        bonus = cells[3] || '';
        status = cells[4] || '';
        note = cells[5] || '';
      }
      if (!name) return;
      const hits = (state.people || []).filter((p) => p.name === name);
      if (hits.length !== 1) {
        unmatched.push(name);
        return;
      }
      const person = hits[0];
      const hasExisting = numOrNull(person.score) != null || bonusAmount(person.bonus) != null || String(person.monthNote || '').trim();
      rows.push({
        personId: person.id,
        name: person.name,
        board: state.board,
        periodMonth: state.month || currentMonth(),
        score: score,
        bonus: bonus,
        bonusStatus: status,
        note: note,
        overwrite: !!hasExisting
      });
    });
    return { rows: rows, unmatched: unmatched };
  }

  function renderRecords() {
    const list = filteredRecords();
    if ($('msb-records-count')) {
      $('msb-records-count').textContent =
        '顯示 ' + list.length + '／全部 ' + (state.recordsEntries || []).length + ' 筆（目前計分表・全部期間）';
    }
    renderTable($('msb-all-table'), list);
  }

  function renderSettings() {
    const groups = peopleGrouped();
    if ($('msb-people-list')) {
      $('msb-people-list').innerHTML = groups.length
        ? groups.map((g) =>
            `<div class="msb-people-group"><div class="msb-people-group-title">${esc(g.title)}</div>` +
            g.people.map((p) =>
              `<div class="msb-list-item"><span>${esc(p.name)}${p.accountId ? '' : ' <span class="msb-badge">未對到帳號</span>'}${personDept(p) ? ' <small class="msb-dept">' + esc(personDept(p)) + '</small>' : ''}</span>` +
              `<button type="button" class="msb-linkish is-danger" data-msb-rm-person="${p.id}">移除</button></div>`
            ).join('') +
            '</div>'
          ).join('')
        : '<p class="msb-empty">尚未新增人員</p>';
    }
    if ($('msb-projects-list')) {
      $('msb-projects-list').innerHTML = state.projects.length
        ? state.projects.map((p) =>
            `<div class="msb-list-item"><span>${esc(p.name)}</span>` +
            `<button type="button" class="msb-linkish is-danger" data-msb-rm-project="${p.id}">移除</button></div>`
          ).join('')
        : '<p class="msb-empty">尚未新增專案</p>';
    }
  }

  function renderAll() {
    applyAccess();
    syncBoardTabs();
    fillSelects();
    renderStaff();
    renderDash();
    renderRecords();
    renderSettings();
  }

  async function fetchList(month) {
    const res = await rpc('msb_list', {
      p_token: token(),
      p_board: state.board,
      p_month: month
    });
    if (!res?.ok) throw new Error(res?.error || '載入失敗');
    return res;
  }

  async function reload() {
    if (!token()) {
      setMsg('請先登入工具箱', 'err');
      return;
    }
    setMsg('載入中…');
    try {
      const dash = await fetchList(listMonthArg());
      state.serverScoped = Object.prototype.hasOwnProperty.call(dash, 'canViewAll');
      const me = window.skyfunAuth?.getUser?.() || {};
      state.canViewAll = state.serverScoped ? !!dash.canViewAll : !!window.skyfunAuth?.canViewAllScores?.(me);
      state.canEdit = state.serverScoped ? !!dash.canEdit : !!window.skyfunAuth?.canEditScores?.(me);
      state.viewerId = dash.viewerId || me.id || '';
      state.scoreMonth = dash.scoreMonth || state.month || currentMonth();
      state.people = dash.people || [];
      state.projects = dash.projects || [];
      state.entries = dash.entries || [];
      if (!state.serverScoped && !state.canViewAll) {
        state.people = [];
        state.projects = [];
        state.entries = [];
      }

      if (state.view === 'records' && !state.allMonths) {
        const all = await fetchList((state.month || currentMonth()) + '|all');
        state.recordsEntries = (!state.serverScoped && !state.canViewAll) ? [] : (all.entries || []);
      } else {
        state.recordsEntries = state.entries.slice();
      }

      const scopeNote = $('msb-scope-note');
      if (!state.serverScoped) {
        if (scopeNote) {
          scopeNote.hidden = false;
          scopeNote.textContent = '權限 SQL 尚未套用（meeting-scoreboard-staff-month.sql）。有權限者仍可看名單；一般員工先不顯示。';
        }
        setMsg('');
      } else {
        if (scopeNote) {
          scopeNote.hidden = true;
          scopeNote.textContent = '';
        }
        setMsg('');
      }
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

  function markFormClean() {
    formBaseline = snapshotForm();
    state.formDirty = false;
  }

  function checkDirty() {
    state.formDirty = snapshotForm() !== formBaseline;
    return state.formDirty;
  }

  function openModal(editId) {
    const e = editId != null
      ? (state.recordsEntries.find((x) => String(x.id) === String(editId))
        || state.entries.find((x) => String(x.id) === String(editId)))
      : null;
    state.editId = e ? e.id : null;
    fillSelects();
    if (e) {
      if ($('msb-person')) $('msb-person').value = String(e.personId);
      if ($('msb-project')) $('msb-project').value = String(e.projectId);
      if ($('msb-date')) $('msb-date').value = String(e.scoreDate || '').slice(0, 10);
      if ($('msb-score')) $('msb-score').value = String(e.score);
      if ($('msb-item')) $('msb-item').value = e.item || '';
      if ($('msb-note')) $('msb-note').value = e.note || '';
      if ($('msb-session')) $('msb-session').value = e.sessionLabel || '';
      if ($('msb-form-title')) $('msb-form-title').textContent = '編輯加減分';
    } else {
      resetForm(false);
      if ($('msb-form-title')) $('msb-form-title').textContent = '新增加減分';
    }
    setMsg('', '', 'msb-form-msg');
    const modal = $('msb-modal');
    if (modal) modal.hidden = false;
    document.body.classList.add('msb-modal-open');
    markFormClean();
    setTimeout(() => $('msb-person')?.focus(), 30);
  }

  function closeModal(force) {
    if (!force && checkDirty()) {
      if (!window.confirm('尚未儲存，確定關閉？')) return false;
    }
    const modal = $('msb-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('msb-modal-open');
    state.editId = null;
    state.formDirty = false;
    setMsg('', '', 'msb-form-msg');
    return true;
  }

  function resetForm(mark) {
    state.editId = null;
    $('msb-entry-form')?.reset();
    if ($('msb-date')) $('msb-date').value = todayStr();
    if ($('msb-form-title')) $('msb-form-title').textContent = '新增加減分';
    fillSelects();
    if (mark !== false) markFormClean();
  }

  function exportCsv(list) {
    const rows = [['計分日期', '人員', '專案', '場次', '加減分項目', '分數', '備註']];
    (list || []).forEach((e) => {
      rows.push([
        fmtDate(e.scoreDate), e.personName, e.projectName, e.sessionLabel || '',
        e.item, e.score, e.note || ''
      ]);
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '會議計分_' + state.board + '_' + (state.view === 'records' ? 'all' : (state.month || 'all')) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openMonthModal(personId) {
    if (!state.canEdit) return;
    fillSelects();
    const person = (state.people || []).find((p) => String(p.id) === String(personId));
    if ($('msb-month-person')) $('msb-month-person').value = person ? String(person.id) : '';
    if ($('msb-month-period')) $('msb-month-period').value = state.scoreMonth || state.month || currentMonth();
    if ($('msb-month-score')) $('msb-month-score').value = person && numOrNull(person.score) != null ? String(person.score) : '';
    if ($('msb-month-bonus')) $('msb-month-bonus').value = person && bonusAmount(person.bonus) != null ? String(person.bonus) : '';
    if ($('msb-month-status')) $('msb-month-status').value = person ? (person.bonusStatus || '') : '';
    if ($('msb-month-note')) $('msb-month-note').value = person ? (person.monthNote || '') : '';
    setMsg('', '', 'msb-month-msg');
    const modal = $('msb-month-modal');
    if (modal) modal.hidden = false;
    document.body.classList.add('msb-modal-open');
  }

  function closeMonthModal() {
    const modal = $('msb-month-modal');
    if (modal) modal.hidden = true;
    if ($('msb-modal')?.hidden && $('msb-batch-modal')?.hidden && $('msb-bind-modal')?.hidden) {
      document.body.classList.remove('msb-modal-open');
    }
  }

  function closeBatchModal() {
    const modal = $('msb-batch-modal');
    if (modal) modal.hidden = true;
    state.batchRows = [];
    if ($('msb-batch-save')) $('msb-batch-save').disabled = true;
    if ($('msb-modal')?.hidden && $('msb-month-modal')?.hidden && $('msb-bind-modal')?.hidden) {
      document.body.classList.remove('msb-modal-open');
    }
  }

  function fillBindDept(selected) {
    const el = $('msb-bind-dept');
    if (!el) return;
    if (typeof window.buildSkyfunDepartmentSelectHtml === 'function') {
      el.innerHTML = window.buildSkyfunDepartmentSelectHtml(selected || '');
    } else {
      el.innerHTML = `<option value="">請選擇處別</option><option value="${esc(selected || '')}" selected>${esc(selected || '')}</option>`;
    }
  }

  function fillBindAccounts(selectedId) {
    const el = $('msb-bind-account');
    if (!el) return;
    const q = String($('msb-bind-account-q')?.value || '').trim().toLowerCase();
    const opts = (state.accountOptions || []).filter((a) => {
      if (!q) return true;
      return (String(a.name || '') + ' ' + String(a.username || '') + ' ' + String(a.team || '')).toLowerCase().includes(q);
    }).slice(0, 80);
    const cur = String(selectedId || el.value || '');
    el.innerHTML = '<option value="">（不改帳號）</option>' +
      (cur ? '' : '') +
      opts.map((a) => {
        const label = `${a.name || a.username || ''}${a.team ? '（' + a.team + '）' : ''}`;
        return `<option value="${esc(a.id)}"${String(a.id) === cur ? ' selected' : ''}>${esc(label)}</option>`;
      }).join('');
    if (cur && !opts.some((a) => String(a.id) === cur)) {
      el.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" selected>目前已綁定</option>`);
    }
  }

  async function openBindModal(personId) {
    if (!state.canEdit) return;
    const person = (state.people || []).find((p) => String(p.id) === String(personId));
    if (!person) return;
    state.bindPersonId = person.id;
    if ($('msb-bind-person-id')) $('msb-bind-person-id').value = String(person.id);
    if ($('msb-bind-person-label')) $('msb-bind-person-label').textContent = person.name || '人員';
    fillBindDept(personDept(person));
    if ($('msb-bind-account-q')) $('msb-bind-account-q').value = person.name || '';
    setMsg('', '', 'msb-bind-msg');
    try {
      if (!state.accountOptions.length) {
        const res = await rpc('msb_accounts_lookup', { p_token: token(), p_q: '' });
        if (!res?.ok) throw new Error(res?.error || '帳號名單載入失敗');
        state.accountOptions = res.accounts || [];
      }
    } catch (err) {
      setMsg(err.message || String(err), 'err', 'msb-bind-msg');
      state.accountOptions = state.accountOptions || [];
    }
    fillBindAccounts(person.accountId || '');
    const modal = $('msb-bind-modal');
    if (modal) modal.hidden = false;
    document.body.classList.add('msb-modal-open');
  }

  function closeBindModal() {
    const modal = $('msb-bind-modal');
    if (modal) modal.hidden = true;
    state.bindPersonId = null;
    if ($('msb-modal')?.hidden && $('msb-month-modal')?.hidden && $('msb-batch-modal')?.hidden) {
      document.body.classList.remove('msb-modal-open');
    }
  }

  function showBatchPreview() {
    const parsed = parseBatch($('msb-batch-text')?.value || '');
    state.batchRows = parsed.rows;
    const overwrite = parsed.rows.filter((r) => r.overwrite).length;
    const lines = [
      '可寫入 ' + parsed.rows.length + ' 筆，月份 ' + (state.month || currentMonth()) + '。',
      overwrite ? ('其中 ' + overwrite + ' 筆會覆寫這個月已有的分數或獎金。') : '沒有會覆寫的列。',
      parsed.unmatched.length ? ('對不到的人：' + parsed.unmatched.join('、')) : '人員都對得到。'
    ];
    if ($('msb-batch-preview')) $('msb-batch-preview').textContent = lines.join('\n');
    if ($('msb-batch-save')) $('msb-batch-save').disabled = !parsed.rows.length;
  }

  function bind() {
    const page = $('page-meeting-scoreboard');
    if (!page || page.dataset.msbBound) return;
    page.dataset.msbBound = '1';
    state.month = currentMonth();
    if ($('msb-month')) $('msb-month').value = state.month;

    $('msb-nav-toggle')?.addEventListener('click', () => {
      const app = $('msb-app');
      const open = !app?.classList.contains('is-nav-open');
      app?.classList.toggle('is-nav-open', open);
      $('msb-nav-toggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    page.addEventListener('click', async (e) => {
      const noteBtn = e.target.closest('[data-msb-note-toggle]');
      if (noteBtn) {
        const cell = noteBtn.previousElementSibling;
        if (cell?.classList.contains('msb-note-cell')) {
          const collapsed = cell.getAttribute('data-collapsed') === '1';
          cell.setAttribute('data-collapsed', collapsed ? '0' : '1');
          noteBtn.textContent = collapsed ? '收合' : '展開';
        }
        return;
      }

      const closer = e.target.closest('[data-msb-close]');
      if (closer) {
        closeModal(false);
        return;
      }

      const nav = e.target.closest('[data-msb-view]');
      if (nav) {
        const next = nav.getAttribute('data-msb-view');
        setView(next);
        if (next === 'records') await reload();
        else renderAll();
        return;
      }

      const boardBtn = e.target.closest('[data-msb-board]');
      if (boardBtn) {
        state.board = boardBtn.getAttribute('data-msb-board');
        await reload();
        return;
      }

      if (e.target.id === 'msb-all-period') {
        state.allMonths = !state.allMonths;
        await reload();
        return;
      }
      if (e.target.id === 'msb-export' || e.target.id === 'msb-export-records') {
        exportCsv(e.target.id === 'msb-export-records' ? filteredRecords() : state.entries);
        return;
      }
      if (e.target.id === 'msb-open-add' || e.target.id === 'msb-open-add-2') {
        if (!state.canEdit) return;
        openModal(null);
        return;
      }
      if (e.target.id === 'msb-open-month') {
        openMonthModal(null);
        return;
      }
      if (e.target.id === 'msb-open-batch') {
        if (!state.canEdit) return;
        state.batchRows = [];
        if ($('msb-batch-preview')) $('msb-batch-preview').textContent = '';
        if ($('msb-batch-save')) $('msb-batch-save').disabled = true;
        setMsg('', '', 'msb-batch-msg');
        const modal = $('msb-batch-modal');
        if (modal) modal.hidden = false;
        document.body.classList.add('msb-modal-open');
        return;
      }
      if (e.target.id === 'msb-staff-view') {
        state.staff.list = !state.staff.list;
        renderStaff();
        return;
      }
      if (e.target.id === 'msb-batch-check') {
        showBatchPreview();
        return;
      }
      const deptBtn = e.target.closest('[data-msb-dept]');
      if (deptBtn) {
        state.staff.dept = deptBtn.getAttribute('data-msb-dept') || '';
        renderStaff();
        return;
      }
      const sortHead = e.target.closest('[data-msb-sort]');
      if (sortHead) {
        state.staff.sort = sortHead.getAttribute('data-msb-sort') || 'score';
        if ($('msb-staff-sort')) $('msb-staff-sort').value = state.staff.sort;
        renderStaff();
        return;
      }
      const bindBtn = e.target.closest('[data-msb-bind]');
      if (bindBtn && state.canEdit) {
        e.preventDefault();
        await openBindModal(bindBtn.getAttribute('data-msb-bind'));
        return;
      }
      const scorePerson = e.target.closest('[data-msb-score-person]');
      if (scorePerson && state.canEdit) {
        openMonthModal(scorePerson.getAttribute('data-msb-score-person'));
        return;
      }
      if (e.target.closest('[data-msb-month-close]')) {
        closeMonthModal();
        return;
      }
      if (e.target.closest('[data-msb-batch-close]')) {
        closeBatchModal();
        return;
      }
      if (e.target.closest('[data-msb-bind-close]')) {
        closeBindModal();
        return;
      }
      if (e.target.id === 'msb-goto-records') {
        setView('records');
        await reload();
        return;
      }
      if (e.target.id === 'msb-goto-settings') {
        setView('settings');
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
      if (edit) {
        if (!state.canEdit) return;
        openModal(edit.getAttribute('data-msb-edit'));
        return;
      }
      const del = e.target.closest('[data-msb-del]');
      if (del) {
        if (!state.canEdit) return;
        if (!window.confirm('確定刪除此筆加減分紀錄？')) return;
        try {
          const res = await rpc('msb_entry_delete', { p_token: token(), p_id: Number(del.getAttribute('data-msb-del')) });
          if (!res?.ok) throw new Error(res?.error || '刪除失敗');
          setMsg('已刪除', 'ok');
          await reload();
        } catch (err) {
          setMsg(err.message || String(err), 'err');
        }
        return;
      }
      const rmP = e.target.closest('[data-msb-rm-person]');
      if (rmP) {
        if (!settingsUnlocked()) { setView('settings'); return; }
        if (!window.confirm('確定移除此人員？')) return;
        try {
          const res = await rpc('msb_person_remove', { p_token: token(), p_id: Number(rmP.getAttribute('data-msb-rm-person')) });
          if (!res?.ok) throw new Error(res?.error || '移除失敗');
          await reload();
        } catch (err) {
          setMsg(err.message || String(err), 'err');
        }
        return;
      }
      const rmPr = e.target.closest('[data-msb-rm-project]');
      if (rmPr) {
        if (!settingsUnlocked()) { setView('settings'); return; }
        if (!window.confirm('確定移除此專案？')) return;
        try {
          const res = await rpc('msb_project_remove', { p_token: token(), p_id: Number(rmPr.getAttribute('data-msb-rm-project')) });
          if (!res?.ok) throw new Error(res?.error || '移除失敗');
          await reload();
        } catch (err) {
          setMsg(err.message || String(err), 'err');
        }
      }
    });

    $('msb-month')?.addEventListener('change', async (e) => {
      state.month = e.target.value || currentMonth();
      state.allMonths = false;
      await reload();
    });

    $('msb-staff-q')?.addEventListener('input', () => {
      state.staff.q = $('msb-staff-q')?.value || '';
      renderStaff();
    });
    $('msb-staff-sort')?.addEventListener('change', () => {
      state.staff.sort = $('msb-staff-sort')?.value || 'score';
      renderStaff();
    });

    let bindSearchTimer = null;
    $('msb-bind-account-q')?.addEventListener('input', () => {
      clearTimeout(bindSearchTimer);
      bindSearchTimer = setTimeout(async () => {
        const q = String($('msb-bind-account-q')?.value || '').trim();
        try {
          const res = await rpc('msb_accounts_lookup', { p_token: token(), p_q: q });
          if (res?.ok) state.accountOptions = res.accounts || [];
        } catch (_) { /* keep previous options */ }
        fillBindAccounts($('msb-bind-account')?.value || '');
      }, 220);
    });

    $('msb-bind-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!state.canEdit || state.busy) return;
      const personId = Number($('msb-bind-person-id')?.value || state.bindPersonId || 0);
      if (!personId) return;
      state.busy = true;
      const btn = $('msb-bind-save');
      if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
      setMsg('', '', 'msb-bind-msg');
      try {
        const accountVal = String($('msb-bind-account')?.value || '').trim();
        const res = await rpc('msb_person_patch', {
          p_token: token(),
          p_id: personId,
          p_department: $('msb-bind-dept')?.value || '',
          p_account_id: accountVal || null
        });
        if (!res?.ok) throw new Error(res?.error || '儲存失敗');
        closeBindModal();
        setMsg('已更新部別／帳號', 'ok');
        await reload();
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
      setMsg('', '', 'msb-month-msg');
      try {
        const res = await rpc('msb_month_score_upsert', {
          p_token: token(),
          p_data: {
            board: state.board,
            personId: Number($('msb-month-person')?.value || 0) || null,
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
          state.allMonths = false;
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

    $('msb-batch-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!state.canEdit || state.busy || !state.batchRows.length) return;
      state.busy = true;
      const btn = $('msb-batch-save');
      if (btn) { btn.disabled = true; btn.textContent = '寫入中…'; }
      setMsg('', '', 'msb-batch-msg');
      try {
        const res = await rpc('msb_month_score_upsert_batch', {
          p_token: token(),
          p_rows: state.batchRows.map((row) => ({
            board: row.board,
            personId: row.personId,
            name: row.name,
            periodMonth: row.periodMonth,
            score: row.score,
            bonus: row.bonus,
            bonusStatus: row.bonusStatus,
            note: row.note
          }))
        });
        if (!res?.ok) throw new Error(res?.error || '寫入失敗');
        const errors = Array.isArray(res.errors) ? res.errors : [];
        if (errors.length) {
          setMsg('已寫入 ' + (res.saved || 0) + ' 筆。' + errors.slice(0, 5).join('、'), 'err', 'msb-batch-msg');
        } else {
          closeBatchModal();
          setMsg('已寫入 ' + (res.saved || 0) + ' 筆', 'ok');
        }
        await reload();
      } catch (err) {
        setMsg(err.message || String(err), 'err', 'msb-batch-msg');
      } finally {
        state.busy = false;
        if (btn) { btn.disabled = !state.batchRows.length; btn.textContent = '確認寫入'; }
      }
    });

    ['msb-q', 'msb-filter-project', 'msb-date-from', 'msb-date-to'].forEach((id) => {
      $(id)?.addEventListener('input', () => {
        state.filter.q = $('msb-q')?.value || '';
        state.filter.projectId = $('msb-filter-project')?.value || '';
        state.filter.from = $('msb-date-from')?.value || '';
        state.filter.to = $('msb-date-to')?.value || '';
        renderRecords();
      });
      $(id)?.addEventListener('change', () => {
        state.filter.q = $('msb-q')?.value || '';
        state.filter.projectId = $('msb-filter-project')?.value || '';
        state.filter.from = $('msb-date-from')?.value || '';
        state.filter.to = $('msb-date-to')?.value || '';
        renderRecords();
      });
    });

    $('msb-entry-form')?.addEventListener('input', () => { checkDirty(); });
    $('msb-entry-form')?.addEventListener('change', () => { checkDirty(); });

    $('msb-entry-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (state.busy) return;
      state.busy = true;
      const btn = $('msb-save');
      if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
      setMsg('', '', 'msb-form-msg');
      try {
        const res = await rpc('msb_entry_save', {
          p_token: token(),
          p_data: {
            id: state.editId,
            board: state.board,
            personId: Number($('msb-person')?.value || 0) || null,
            projectId: Number($('msb-project')?.value || 0) || null,
            scoreDate: $('msb-date')?.value || '',
            score: $('msb-score')?.value || '',
            item: $('msb-item')?.value || '',
            note: $('msb-note')?.value || '',
            sessionLabel: $('msb-session')?.value || ''
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

    $('msb-add-person')?.addEventListener('click', async () => {
      if (!settingsUnlocked()) { setView('settings'); return; }
      const name = ($('msb-new-person')?.value || '').trim();
      try {
        const res = await rpc('msb_person_add', { p_token: token(), p_board: state.board, p_name: name });
        if (!res?.ok) throw new Error(res?.error || '新增失敗');
        if ($('msb-new-person')) $('msb-new-person').value = '';
        await reload();
      } catch (err) {
        setMsg(err.message || String(err), 'err');
      }
    });

    $('msb-add-project')?.addEventListener('click', async () => {
      if (!settingsUnlocked()) { setView('settings'); return; }
      const name = ($('msb-new-project')?.value || '').trim();
      try {
        const res = await rpc('msb_project_add', { p_token: token(), p_board: state.board, p_name: name });
        if (!res?.ok) throw new Error(res?.error || '新增失敗');
        if ($('msb-new-project')) $('msb-new-project').value = '';
        await reload();
      } catch (err) {
        setMsg(err.message || String(err), 'err');
      }
    });

    $('msb-settings-gate')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('msb-settings-pwd');
      const msg = $('msb-settings-gate-msg');
      const Gate = window.SkyfunPolicyDocGate;
      if (msg) { msg.textContent = ''; msg.className = 'msb-msg'; }
      if (!Gate?.checkPassword) {
        if (msg) { msg.textContent = '密碼模組未載入'; msg.className = 'msb-msg is-err'; }
        return;
      }
      const ok = await Gate.checkPassword(input?.value || '');
      if (!ok) {
        if (msg) { msg.textContent = '密碼錯誤，請再試一次'; msg.className = 'msb-msg is-err'; }
        input?.select();
        return;
      }
      setSettingsUnlocked(true);
      try { Gate.setUnlocked?.(true); } catch (_) { /* ignore */ }
      syncSettingsGate();
      renderAll();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('msb-month-modal') && !$('msb-month-modal').hidden) closeMonthModal();
      else if ($('msb-batch-modal') && !$('msb-batch-modal').hidden) closeBatchModal();
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
