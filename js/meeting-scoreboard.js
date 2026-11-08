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
    filter: { q: '', projectId: '', from: '', to: '' }
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
    const body = (list || []).map((e) =>
      `<tr>
        <td>${esc(fmtDate(e.scoreDate))}</td>
        <td>${esc(e.personName)}</td>
        <td>${esc(e.projectName)}${e.sessionLabel ? '<br><small>' + esc(e.sessionLabel) + '</small>' : ''}</td>
        <td>${esc(e.item)}</td>
        <td class="msb-score-cell">${scoreChip(e.score, { size: 'lg' })}</td>
        <td>${noteCell(e.note)}</td>
        <td>
          <button type="button" class="msb-linkish" data-msb-edit="${e.id}">編輯</button>
          <button type="button" class="msb-linkish is-danger" data-msb-del="${e.id}">刪除</button>
        </td>
      </tr>`
    ).join('');
    table.innerHTML = `<thead><tr>
      <th>計分日期</th><th>人員</th><th>專案／區塊</th><th>加減分項目</th><th>分數</th><th>當天備註</th><th>操作</th>
    </tr></thead><tbody>${body || '<tr><td colspan="7">尚無紀錄</td></tr>'}</tbody>`;
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
              `<div class="msb-list-item"><span>${esc(p.name)}</span>` +
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
    syncBoardTabs();
    fillSelects();
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
      const month = monthValue();
      const dash = await fetchList(month);
      state.people = dash.people || [];
      state.projects = dash.projects || [];
      state.entries = dash.entries || [];

      if (state.view === 'records') {
        const all = month == null ? dash : await fetchList(null);
        state.recordsEntries = all.entries || [];
        if (!state.people.length) state.people = all.people || state.people;
        if (!state.projects.length) state.projects = all.projects || state.projects;
      } else if (month == null) {
        state.recordsEntries = state.entries.slice();
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
        openModal(null);
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
        openModal(edit.getAttribute('data-msb-edit'));
        return;
      }
      const del = e.target.closest('[data-msb-del]');
      if (del) {
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
      if (e.key === 'Escape' && $('msb-modal') && !$('msb-modal').hidden) {
        closeModal(false);
      }
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
