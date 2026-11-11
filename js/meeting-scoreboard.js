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
    viewerId: '',
    scoreMonth: '',
    serverScoped: false,
    q: '',
    bindPersonId: null,
    accountOptions: [],
    bound: false,
    peopleSort: { key: '', dir: 'desc' }
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
  function applyAccess() {
    document.querySelectorAll('#page-meeting-scoreboard .msb-edit-only').forEach((el) => {
      el.hidden = !state.canEdit;
    });
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
  function titleRank(p) {
    const t = personTitle(p);
    if (/營業區協理|區協理/.test(t)) return 1;
    if (/營業處經理|處經理/.test(t) && !/儲備/.test(t)) return 2;
    if (/儲備處經理|儲備營業處經理/.test(t)) return 3;
    if (/行政專員組長|組長/.test(t)) return 4;
    if (/經理|部長|協理|副理/.test(t)) return 5;
    return 9;
  }
  function officeRank(dept) {
    const d = String(dept || '').trim();
    const i = OFFICE_NS.indexOf(d);
    if (i >= 0) return i;
    const bi = BACK_OFFICE_DEPTS.indexOf(d);
    if (bi >= 0) return bi;
    return 800;
  }
  function sortPeopleList(list) {
    const { key, dir } = state.peopleSort || {};
    const mul = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      if (key === 'score' || key === 'bonus') {
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
    const { key, dir } = state.peopleSort || {};
    document.querySelectorAll('#page-meeting-scoreboard th[data-msb-sort]').forEach((th) => {
      const k = th.getAttribute('data-msb-sort');
      const on = k === key;
      th.classList.toggle('is-sorted', on);
      th.setAttribute('aria-sort', on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
      const mark = th.querySelector('.msb-sort-mark');
      if (mark) mark.textContent = on ? (dir === 'asc' ? ' ▲' : ' ▼') : '';
    });
  }
  function togglePeopleSort(key) {
    if (!key) return;
    if (state.peopleSort.key === key) {
      state.peopleSort.dir = state.peopleSort.dir === 'desc' ? 'asc' : 'desc';
    } else {
      state.peopleSort = { key, dir: 'desc' };
    }
    renderPeopleTable();
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
    return sortPeopleList(list);
  }
  function peopleRowHtml(p, edit) {
    const dept = personDept(p) || '—';
    const title = personTitle(p);
    const titleShow = title && title !== '其他' ? title : '—';
    const marks = [
      isMine(p) ? '<span class="msb-you">你</span>' : '',
      !personDept(p) ? '<span class="msb-chip">未填部別</span>' : ''
    ].filter(Boolean).join(' ');
    const acts = edit
      ? `<td class="act">
          <button type="button" class="msb-icon-btn is-plus" data-msb-add="${esc(p.id)}" title="加分">＋</button>
          <button type="button" class="msb-icon-btn is-minus" data-msb-add="${esc(p.id)}" data-msb-minus="1" title="減分">－</button>
        </td>`
      : '';
    return `<tr>
      <td>${esc(dept)}</td>
      <td class="msb-title-cell">${esc(titleShow)}</td>
      <td><span class="msb-name">${esc(p.name)}</span> ${marks}</td>
      <td class="num"><button type="button" class="msb-cell-btn" data-msb-score-person="${esc(p.id)}" ${edit ? '' : 'disabled'}>${scoreCellHtml(p.score)}</button></td>
      <td class="num"><button type="button" class="msb-cell-btn" data-msb-score-person="${esc(p.id)}" ${edit ? '' : 'disabled'}>${bonusCellHtml(p)}</button></td>
      ${acts}
    </tr>`;
  }
  function renderPeopleTable() {
    const officeBody = $('msb-people-body-office');
    const bizBody = $('msb-people-body-biz');
    const note = $('msb-score-month-note');
    const selfBox = $('msb-self');
    if (!officeBody || !bizBody) return;
    const month = state.scoreMonth || state.month || currentMonth();
    if (note) {
      const sortHint = state.peopleSort.key
        ? '可點欄位排序分數／獎金。'
        : '點「分數」「獎金」欄位可排序；預設職等 → 北到南。';
      note.textContent = '分數與獎金為 ' + month + ' 手動輸入；＋／－寫入加減分紀錄。' + sortHint;
    }
    if (selfBox) {
      selfBox.hidden = true;
      selfBox.innerHTML = '';
    }
    const list = filteredPeople();
    const edit = state.canEdit;
    const office = list.filter((p) => !isBizDept(personDept(p)));
    const biz = list.filter((p) => isBizDept(personDept(p)));
    officeBody.innerHTML = office.length
      ? office.map((p) => peopleRowHtml(p, edit)).join('')
      : '<tr><td colspan="6" class="msb-empty">尚無內勤人員</td></tr>';
    bizBody.innerHTML = biz.length
      ? biz.map((p) => peopleRowHtml(p, edit)).join('')
      : '<tr><td colspan="6" class="msb-empty">尚無業務人員</td></tr>';
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
      peopleBox.innerHTML = (state.people || []).length
        ? '<ul class="msb-plain-list">' + state.people.map((p) => {
          const title = personTitle(p);
          const titleBit = title && title !== '其他' ? ' · ' + esc(title) : '';
          return `<li><span>${esc(p.name)}${personDept(p) ? ' · ' + esc(personDept(p)) : ''}${titleBit}</span>
            <button type="button" class="msb-link" data-msb-bind="${esc(p.id)}">修改</button>
            <button type="button" class="msb-link msb-link--danger" data-msb-rm-person="${esc(p.id)}" data-msb-rm-name="${esc(p.name)}">移除</button></li>`;
        }).join('') + '</ul>'
        : '<p class="msb-empty">尚無人員</p>';
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
  async function fetchList(month) {
    const res = await rpc('msb_list', { p_token: token(), p_board: state.board, p_month: month });
    if (!res?.ok) throw new Error(res?.error || '載入失敗');
    return res;
  }
  async function reload() {
    if (!token()) { setMsg('請先登入工具箱', 'err'); return; }
    setMsg('載入中…');
    try {
      const month = state.month || currentMonth();
      const dash = await fetchList(month);
      state.serverScoped = Object.prototype.hasOwnProperty.call(dash, 'canViewAll');
      const me = window.skyfunAuth?.getUser?.() || {};
      state.canViewAll = state.serverScoped ? !!dash.canViewAll : !!window.skyfunAuth?.canViewAllScores?.(me);
      state.canEdit = state.serverScoped ? !!dash.canEdit : !!window.skyfunAuth?.canEditScores?.(me);
      state.viewerId = dash.viewerId || me.id || '';
      state.scoreMonth = dash.scoreMonth || month;
      state.people = dash.people || [];
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
      state.entries = dash.entries || [];
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
    if (!el) return;
    const depts = [...new Set((state.people || []).map(personDept).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    el.innerHTML = '<option value="">（未填）</option>' + depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    if (selected) {
      if (![...el.options].some((o) => o.value === selected)) {
        el.insertAdjacentHTML('beforeend', `<option value="${esc(selected)}">${esc(selected)}</option>`);
      }
      el.value = selected;
    }
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
  function bind() {
    if (state.bound) return;
    state.bound = true;
    state.month = currentMonth();
    if ($('msb-month')) $('msb-month').value = state.month;

    const onMsbClick = async (e) => {
      const sortTh = e.target.closest('th[data-msb-sort]');
      if (sortTh) {
        togglePeopleSort(sortTh.getAttribute('data-msb-sort'));
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
      await reload();
    });
    $('msb-staff-q')?.addEventListener('input', () => {
      state.q = $('msb-staff-q')?.value || '';
      renderPeopleTable();
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
