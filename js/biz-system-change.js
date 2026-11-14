/**
 * 業務專區 › 系統欄位更改通報
 */
(function () {
  'use strict';

  const MAX_FILES = 5;
  const MAX_SIZE = 10 * 1024 * 1024;
  const RING_LEN = 2 * Math.PI * 42;
  const NODE_OPTIONS = ['物件', '安全檢核表', '房客', '合約'];
  const STATUS_LABEL = { pending: '處理中', done: '已完成', rejected: '已退回' };
  const LEVEL_LABEL = {
    manager: '待營業處經理',
    admin: '待行政協辦',
    super: '待管理員',
    author: '已退回・待你修改重送'
  };
  const TEAM_ORDER = [
    '北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '桃一處', '竹一處', '宜一處',
    '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '嘉一處', '南一處', '南二處', '高一處', '高二處'
  ];
  /** 依填寫人處別預設修改人（營業處經理）。名單裡找不到該人就不預選。 */
  const DEFAULT_MODIFIER_BY_TEAM = {
    '北四處': '侯思廷',
    '北五處': '侯思廷'
  };

  const state = {
    busy: false,
    files: [],
    rows: [],
    inbox: [],
    transferred: [],
    completed: [],
    managers: [],
    admins: [],
    msg: '',
    msgType: '',
    pendingPayload: null,
    xferId: null,
    xferFiles: [],
    xferMates: [],
    rejectId: null,
    editId: null,
    editRow: null,
    editKept: [],
    editNewFiles: [],
    detailKey: '', // sales: sent | returned | done｜handler: sent | pending | done | transferred
    search: '',
    role: { name: '', team: '', title: '', role: 'guest' }
  };

  const DETAIL_TITLE = {
    sent: '已送出案件明細',
    returned: '已退回案件明細（請修改後重新送出）',
    pending: '待處理案件明細（依層級指派給你）',
    done: '已完成案件明細',
    transferred: '已轉出案件明細（追蹤後續處理）'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function meUser() {
    return window.skyfunAuth?.getUser?.() || null;
  }

  function authorLabel() {
    const u = meUser();
    if (!u) return '';
    const name = String(u.name || u.username || '').trim();
    const team = String(u.team || '').trim();
    if (!name) return '';
    return team ? `${name}（${team}）` : name;
  }

  function sbClient() {
    const c = window.SKYFUN_SUPABASE || {};
    if (!window.supabase || !c.url || !c.anonKey) throw new Error('Supabase 未設定');
    return window.supabase.createClient(c.url, c.anonKey);
  }

  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
  }

  function setMsg(text, type) {
    state.msg = text || '';
    state.msgType = type || '';
    const el = $('bsc-msg');
    if (!el) return;
    el.textContent = state.msg;
    el.className = 'bsc-msg' + (type === 'err' ? ' is-err' : type === 'ok' ? ' is-ok' : '');
  }

  function lineNote(line, okText, failText) {
    const n = Number(line?.recipients || 0);
    if (n > 0) return okText;
    const err = String(line?.error || '').trim();
    if (err) return failText + '（' + err + '）';
    return failText;
  }

  function fileExt(name, type) {
    const m = String(name || '').match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
    if (/jpeg/.test(type || '')) return 'jpg';
    if (/png/.test(type || '')) return 'png';
    if (/gif/.test(type || '')) return 'gif';
    if (/webp/.test(type || '')) return 'webp';
    if (/pdf/.test(type || '')) return 'pdf';
    return '';
  }

  function isImageExt(ext) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(String(ext || '').toLowerCase());
  }

  function fillAuthor() {
    const el = $('bsc-author');
    if (!el) return;
    el.value = authorLabel() || (token() ? '帳號姓名讀取中…' : '請先登入工具箱');
  }

  function modValue(m) {
    return `${m.name || ''}|${m.team || ''}`;
  }

  function parseMod(val) {
    const s = String(val || '');
    const i = s.indexOf('|');
    if (i < 0) return { name: s.trim(), team: '' };
    return { name: s.slice(0, i).trim(), team: s.slice(i + 1).trim() };
  }

  function teamRank(team) {
    const t = String(team || '').trim();
    const i = TEAM_ORDER.indexOf(t);
    return i >= 0 ? i : 900 + t.charCodeAt(0);
  }

  function sortManagers(list) {
    return (list || []).slice().sort((a, b) => {
      const d = teamRank(a.team) - teamRank(b.team);
      if (d) return d;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    });
  }

  function preferredModifierValue() {
    const team = String(meUser()?.team || '').trim();
    const want = DEFAULT_MODIFIER_BY_TEAM[team];
    if (!want) return '';
    const hit = (state.managers || []).find((m) => String(m?.name || '').trim() === want);
    return hit ? modValue(hit) : '';
  }

  function myRoleKey() {
    return String(state.role?.role || 'guest');
  }

  /** 非處長／行政／管理員：三儀表板＝已送出／已退回／已完成 */
  function isSalesDash() {
    const role = myRoleKey();
    return role !== 'manager' && role !== 'admin' && role !== 'super';
  }

  function mySentInProgress() {
    return state.rows.filter((r) => r.status === 'pending' && levelOf(r) !== 'author');
  }

  function myReturnedRows() {
    return state.rows.filter((r) => r.status === 'pending' && levelOf(r) === 'author');
  }

  function myCompletedRows() {
    return state.rows.filter((r) => r.status === 'done');
  }

  function myDisplayName() {
    const u = meUser();
    return String(state.role?.name || u?.name || u?.username || '').trim();
  }

  function iHandled(r) {
    const n = myDisplayName();
    return !!(n && String(r.handledBy || '').trim() === n);
  }

  /** 處長／行政／管理員自己送出、尚未完成的案件（待處理／已轉出不重複列在已送出） */
  function handlerOpenRows() {
    const hide = new Set();
    (state.inbox || []).forEach((r) => { if (r && r.id != null) hide.add(String(r.id)); });
    (state.transferred || []).forEach((r) => { if (r && r.id != null) hide.add(String(r.id)); });
    return state.rows.filter((r) => r.status !== 'done' && !hide.has(String(r.id)));
  }

  /** 前台已完成：只顯示自己經手（handledBy＝本人）或自己送出且已完成；全員一覽僅後台 */
  function handlerDoneRows() {
    const me = myDisplayName();
    const map = new Map();
    const take = (r) => {
      if (!r || r.id == null) return;
      const mineDone = String(r.status) === 'done' && String(r.authorName || '').trim() === me;
      const iDid = iHandled(r);
      if (mineDone || iDid) map.set(String(r.id), r);
    };
    (state.completed || []).forEach(take);
    myCompletedRows().forEach(take);
    return Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.handledAt || a.createdAt || 0).getTime();
      const tb = new Date(b.handledAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
  }

  function renderManagers(keepValue) {
    const sel = $('bsc-modifier');
    if (!sel) return;
    const prev = keepValue != null ? keepValue : sel.value;
    const opts = ['<option value="">請選擇營業處經理</option>'].concat(
      state.managers.map((m) => {
        const label = m.team ? `${m.team}｜${m.name}` : m.name;
        return `<option value="${esc(modValue(m))}">${esc(label)}</option>`;
      })
    );
    sel.innerHTML = opts.join('');
    const pick = (prev && Array.from(sel.options).some((o) => o.value === prev))
      ? prev
      : preferredModifierValue();
    if (pick && Array.from(sel.options).some((o) => o.value === pick)) {
      sel.value = pick;
    }
  }

  function fillEditModifier(name, team) {
    const sel = $('bsc-edit-modifier');
    if (!sel) return;
    const opts = ['<option value="">請選擇營業處經理</option>'].concat(
      state.managers.map((m) => {
        const label = m.team ? `${m.team}｜${m.name}` : m.name;
        return `<option value="${esc(modValue(m))}">${esc(label)}</option>`;
      })
    );
    sel.innerHTML = opts.join('');
    const want = modValue({ name: name || '', team: team || '' });
    if (want && Array.from(sel.options).some((o) => o.value === want)) {
      sel.value = want;
      return;
    }
    const byName = state.managers.find((m) => String(m.name || '').trim() === String(name || '').trim());
    if (byName) sel.value = modValue(byName);
  }

  async function loadManagers() {
    if (!token() || !window.skyfunAuth?.rpc) {
      state.managers = [];
      renderManagers('');
      return;
    }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_managers', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '處長名單讀取失敗');
      state.managers = sortManagers(Array.isArray(res.managers) ? res.managers : []);
    } catch (e) {
      state.managers = [];
      setMsg('營業處經理名單讀取失敗：' + (e.message || e), 'err');
    }
    renderManagers();
  }

  function renderAdminSelect(keepValue) {
    const sel = $('bsc-xfer-admin');
    if (!sel) return;
    const prev = keepValue != null ? keepValue : sel.value;
    const opts = ['<option value="">請選擇行政</option>'].concat(
      state.admins.map((a) => {
        const label = a.title ? `${a.name}（${a.title}）` : a.name;
        return `<option value="${esc(a.name)}">${esc(label)}</option>`;
      })
    );
    sel.innerHTML = opts.join('');
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
    syncXferConfirm();
  }

  async function loadAdmins() {
    if (!token() || !window.skyfunAuth?.rpc) {
      state.admins = [];
      renderAdminSelect('');
      return;
    }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_admins', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '行政名單讀取失敗');
      const raw = Array.isArray(res.admins) ? res.admins : [];
      // 邱奕棋不列入「轉交行政」可選名單
      state.admins = raw.filter((a) => String(a?.name || '').trim() !== '邱奕棋');
    } catch (e) {
      state.admins = [];
      const hint = $('bsc-xfer-hint');
      if (hint) {
        hint.textContent = '行政名單讀取失敗：' + (e.message || e);
        hint.classList.add('is-err');
      }
    }
    renderAdminSelect();
  }

  function renderFiles() {
    const box = $('bsc-file-list');
    if (!box) return;
    if (!state.files.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = state.files.map((f, i) =>
      `<span class="bsc-file">${esc(f.name)}<button type="button" data-bsc-rm="${i}" aria-label="移除">×</button></span>`
    ).join('');
  }

  function attsHtml(atts) {
    const list = Array.isArray(atts) ? atts : [];
    if (!list.length) return '';
    return `<div class="bsc-atts">${list.map((a) => {
      const url = esc(a.url || '');
      const name = esc(a.name || '附件');
      if (a.kind === 'image' || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(a.url || '')) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${name}"></a>`;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">📎 ${name}</a>`;
    }).join('')}</div>`;
  }

  function gaugeHtml(key, label, count, total, tone, metaText) {
    const pct = total ? Math.max(0, Math.min(100, Math.round((count / total) * 100))) : (count > 0 ? 100 : 0);
    const dash = ((pct / 100) * RING_LEN).toFixed(1);
    const cls = [
      tone || (count > 0 ? (tone || 'is-doing') : ''),
      state.detailKey === key ? 'is-active' : ''
    ].filter(Boolean).join(' ');
    let meta = metaText || '請先登入';
    if (!metaText && token()) {
      if (key === 'pending') meta = count ? '點擊查看並可標記完成' : '目前沒有待處理案件';
      else if (key === 'transferred') meta = count ? '點擊查看後續進度' : '尚無轉出案件';
      else if (key === 'returned') meta = count ? '點擊查看並修改後重送' : '尚無退回案件';
      else if (key === 'done') {
        meta = count ? '點擊查看已完成案件' : '尚無已完成案件';
      } else meta = count ? '點擊查看明細' : '尚無送出紀錄';
    }
    return `<button type="button" class="bsc-gauge ${cls}" data-bsc-detail="${esc(key)}" title="${esc(label)}">
      <span class="bsc-gauge-ring" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle class="bsc-gauge-track" cx="50" cy="50" r="42"></circle>
          <circle class="bsc-gauge-bar" cx="50" cy="50" r="42" stroke-dasharray="${dash} ${RING_LEN.toFixed(1)}"></circle>
        </svg>
        <b><span class="bsc-gauge-n">${count}</span><small>件</small></b>
      </span>
      <span class="bsc-gauge-text">
        <span class="bsc-gauge-label">${esc(label)}</span>
        <span class="bsc-gauge-meta">${esc(meta)}</span>
      </span>
    </button>`;
  }

  function levelOf(r) {
    return String(r.handlerLevel || 'manager');
  }

  function isMyReturned(r) {
    if (levelOf(r) !== 'author' || r.status !== 'pending') return false;
    const u = meUser();
    const myId = String(u?.id || u?.userId || '');
    if (myId && String(r.userId || '') === myId) return true;
    const myName = String(u?.name || u?.username || '').trim();
    return !!(myName && String(r.authorName || '').trim() === myName);
  }

  function actionButtons(r) {
    if (r.status !== 'pending') return '';
    const level = levelOf(r);
    const role = myRoleKey();
    const btns = [];
    if (isMyReturned(r)) {
      btns.push(`<button type="button" class="bsc-done-btn" data-bsc-edit="${esc(r.id)}">修改並重新送出</button>`);
      return `<div class="bsc-item-actions">${btns.join('')}</div>`;
    }
    const me = myDisplayName();
    const assignedAdmin = String(r.handlerAdminName || '').trim();
    const isAssignedAdmin = !assignedAdmin || assignedAdmin === me;
    const isAssignedModifier = level === 'manager' && String(r.modifierName || '').trim() === me;
    const canFinish =
      isAssignedModifier ||
      (role === 'admin' && level === 'admin' && isAssignedAdmin) ||
      (role === 'super' && level === 'admin') ||
      (role === 'super' && level === 'super');
    if (canFinish) {
      btns.push(`<button type="button" class="bsc-done-btn" data-bsc-done="${esc(r.id)}">已修改完畢</button>`);
      btns.push(`<button type="button" class="bsc-reject-btn" data-bsc-reject="${esc(r.id)}">退回修改</button>`);
    }
    if (isAssignedModifier) {
      btns.push(`<button type="button" class="bsc-xfer-btn" data-bsc-xfer="admin" data-id="${esc(r.id)}">轉交行政</button>`);
    }
    if ((role === 'admin' && level === 'admin' && isAssignedAdmin) || (role === 'super' && level === 'admin')) {
      btns.push(`<button type="button" class="bsc-xfer-btn" data-bsc-xfer="super" data-id="${esc(r.id)}">轉交管理員</button>`);
    }
    if (!btns.length) return '';
    return `<div class="bsc-item-actions">${btns.join('')}</div>`;
  }

  function parseAdminNotes(note) {
    const raw = String(note || '').trim();
    if (!raw) return { reasons: [], rest: [] };
    const reasons = [];
    const rest = [];
    raw.split(/\n+/).forEach((line) => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^退回填寫人｜([^｜]+)｜([^｜]+)｜原因：([\s\S]+)$/);
      if (m) {
        reasons.push({ by: m[1], at: m[2], reason: m[3].trim() });
        return;
      }
      // 轉單只靠層級標籤顯示當前狀態，不重複列轉單歷程
      if (/^(處長轉行政｜|行政轉管理員｜|行政轉處長｜)/.test(t) || t === '修改人已標記完成') return;
      rest.push(t);
    });
    return { reasons, rest };
  }

  function notesHtml(note) {
    const { reasons, rest } = parseAdminNotes(note);
    const parts = [];
    reasons.forEach((x) => {
      parts.push(`<div class="bsc-reject-box">
        <div class="bsc-reject-label">退件原因</div>
        <div class="bsc-reject-reason">${esc(x.reason)}</div>
        <div class="bsc-reject-meta">${esc(x.by)}｜${esc(x.at)}</div>
      </div>`);
    });
    if (rest.length) {
      parts.push(`<div class="bsc-item-meta">備註：${esc(rest.join('／'))}</div>`);
    }
    return parts.join('');
  }

  function itemHtml(r, opts) {
    const st = STATUS_LABEL[r.status] || r.status;
    const level = levelOf(r);
    const mod = r.modifierName
      ? (r.modifierTeam ? `${r.modifierTeam}｜${r.modifierName}` : r.modifierName)
      : '';
    const showPending = !!(opts && opts.showDone);
    const showTransferred = !!(opts && opts.showTransferred);
    const showCompleted = !!(opts && opts.showCompleted);
    const tagText = showPending ? '待處理' : (showTransferred && r.status === 'pending' ? '已轉出' : st);
    const tagClass = showPending ? 'pending' : (showTransferred && r.status === 'pending' ? 'pending' : r.status);
    const doneAt = r.handledAt ? `｜${when(r.handledAt)}` : '';
    const levelText = (r.status === 'done' || (showCompleted && level === 'author'))
      ? (level === 'author'
        ? `已退回填寫人${doneAt}`
        : (iHandled(r)
          ? `已由我修改完畢${doneAt}`
          : `已由${String(r.handledBy || r.modifierName || '處長').trim()}完成${doneAt}`))
      : `${LEVEL_LABEL[level] || level}${level === 'admin' && r.handlerAdminName ? `｜${r.handlerAdminName}` : ''}`;
    const pendingTag = showPending
      ? (level === 'author' ? '待你修改' : '待處理')
      : tagText;
    const pendingClass = showPending
      ? (level === 'author' ? 'rejected' : 'pending')
      : tagClass;
    return `<article class="bsc-item">
      <div class="bsc-item-top">
        <div class="bsc-item-addr">${esc(r.address)}</div>
        <span class="bsc-tag bsc-tag--${esc(pendingClass)}">${esc(pendingTag)}</span>
      </div>
      <div class="bsc-item-meta">媒合編號 ${esc(r.matchNo)} · ${esc(when(r.createdAt))}${
        (showPending || showTransferred || showCompleted)
          ? ` · 填寫人 ${esc(r.authorName)}${r.team ? `（${esc(r.team)}）` : ''}`
          : (mod ? ` · 處長 ${esc(mod)}` : '')
      }</div>
      <div><span class="bsc-level bsc-level--${esc(showCompleted ? 'manager' : level)}">${esc(levelText)}</span></div>
      ${Array.isArray(r.nodes) && r.nodes.length ? `<div class="bsc-node-tags">${r.nodes.map((n) => `<span class="bsc-node-tag">${esc(n)}</span>`).join('')}</div>` : ''}
      <div class="bsc-item-body">${esc(r.content)}</div>
      ${attsHtml(r.attachments)}
      ${transferExtraHtml(r)}
      ${r.adminNote ? notesHtml(r.adminNote) : ''}
      ${showPending ? actionButtons(r) : ''}
    </article>`;
  }

  function detailRows(key) {
    if (isSalesDash()) {
      if (key === 'returned') return myReturnedRows();
      if (key === 'done') return myCompletedRows();
      if (key === 'sent') return mySentInProgress();
      return [];
    }
    if (key === 'pending') return state.inbox.slice();
    if (key === 'transferred') return state.transferred.slice();
    if (key === 'done') {
      if (canSeeHandlerDone()) return handlerDoneRows();
      return myCompletedRows();
    }
    return handlerOpenRows();
  }

  function searchableRows() {
    if (isSalesDash()) return state.rows.slice();
    const map = new Map();
    [state.rows, state.inbox, state.transferred, state.completed].forEach((list) => {
      (list || []).forEach((r) => {
        if (r && r.id != null) map.set(String(r.id), r);
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }

  function matchSearch(r, qRaw) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return true;
    const tokens = q.split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = [
      r.address, r.matchNo, r.content, r.authorName, r.team,
      r.modifierName, r.modifierTeam, r.handlerAdminName, r.adminNote, r.handledBy,
      ...(Array.isArray(r.nodes) ? r.nodes : [])
    ].map((x) => String(x || '')).join(' ').toLowerCase();
    return tokens.every((t) => hay.includes(t));
  }

  function applySearch(rows) {
    return (rows || []).filter((r) => matchSearch(r, state.search));
  }

  function syncSearchClear() {
    const clear = $('bsc-search-clear');
    if (clear) clear.hidden = !String(state.search || '').trim();
  }

  function renderDetail() {
    const wrap = $('bsc-detail');
    const title = $('bsc-detail-title');
    const list = $('bsc-detail-list');
    if (!wrap || !list) return;
    const q = String(state.search || '').trim();
    syncSearchClear();
    if (!state.detailKey && !q) {
      wrap.hidden = true;
      wrap.classList.add('hidden');
      return;
    }
    wrap.hidden = false;
    wrap.classList.remove('hidden');
    let detailTitle = DETAIL_TITLE[state.detailKey] || '明細';
    if (state.detailKey === 'done' && canSeeHandlerDone() && !isSalesDash()) {
      detailTitle = '已完成案件明細（完成／退件）';
    }
    if (state.detailKey === 'pending' && !isSalesDash()) {
      detailTitle = '待處理案件明細';
    }
    if (q && !state.detailKey) detailTitle = `搜尋結果「${q}」`;
    else if (q && state.detailKey) detailTitle = `${detailTitle}｜搜尋「${q}」`;
    if (title) title.textContent = detailTitle;
    if (!token()) {
      list.innerHTML = '<p class="bsc-hint">請先登入工具箱。</p>';
      return;
    }
    const base = state.detailKey ? detailRows(state.detailKey) : searchableRows();
    const rows = applySearch(base);
    if (!rows.length) {
      list.innerHTML = `<p class="bsc-hint">${
        q ? `找不到符合「${esc(q)}」的案件。`
          : state.detailKey === 'pending' ? '目前沒有待處理案件。'
          : state.detailKey === 'transferred' ? '尚無已轉出的案件。'
          : state.detailKey === 'returned' ? '尚無已退回的案件。'
          : state.detailKey === 'done'
            ? (isSalesDash()
              ? '尚無已完成案件。'
              : (canSeeHandlerDone() ? '尚無你處理過的案件（完成／退件）。' : '尚無已完成案件。'))
          : '尚無處理中的送出案件。'
      }</p>`;
      return;
    }
    list.innerHTML = rows.map((r) => itemHtml(r, {
      showDone: state.detailKey === 'pending' || state.detailKey === 'returned' || (!state.detailKey && isMyReturned(r)),
      showTransferred: state.detailKey === 'transferred',
      showCompleted: state.detailKey === 'done' && canSeeHandlerDone() && !isSalesDash()
    })).join('');
  }

  function canSeeTransferred() {
    const role = myRoleKey();
    return role === 'manager' || role === 'admin' || role === 'super';
  }

  function canSeeHandlerDone() {
    return canSeeTransferred();
  }

  function renderGauges() {
    const box = $('bsc-gauges');
    if (!box) return;
    box.classList.toggle('bsc-gauges--xfer', false);
    box.classList.toggle('bsc-gauges--sales', false);

    if (isSalesDash()) {
      const sent = mySentInProgress().length;
      const returned = myReturnedRows().length;
      const done = myCompletedRows().length;
      box.classList.add('bsc-gauges--sales');
      box.innerHTML = [
        gaugeHtml('sent', '已送出案件', sent, sent || 1, sent ? 'is-doing' : '',
          token() ? (sent ? '點擊查看明細' : '尚無送出紀錄') : '請先登入'),
        gaugeHtml('returned', '已退回案件', returned, returned || 1, returned ? 'is-doing' : '',
          token() ? (returned ? '點擊查看並修改後重送' : '尚無退回案件') : '請先登入'),
        gaugeHtml('done', '已完成案件', done, done || 1, done ? 'is-done' : '',
          token() ? (done ? '點擊查看明細' : '尚無已完成案件') : '請先登入')
      ].join('');
      return;
    }

    const sent = handlerOpenRows().length;
    const pending = state.inbox.length;
    const transferred = state.transferred.length;
    const done = handlerDoneRows().length;
    box.classList.add('bsc-gauges--xfer');
    box.innerHTML = [
      gaugeHtml('sent', '已送出案件', sent, sent || 1, sent ? 'is-done' : '',
        token() ? (sent ? '點擊查看明細' : '尚無送出紀錄') : '請先登入'),
      gaugeHtml('pending', '待處理案件', pending, pending || 1, pending ? 'is-doing' : '',
        token() ? (pending ? '點擊查看並可標記完成' : '目前沒有待處理案件') : '請先登入'),
      gaugeHtml('transferred', '已轉出案件', transferred, transferred || 1, transferred ? 'is-doing' : '',
        token() ? (transferred ? '點擊查看後續進度' : '尚無轉出案件') : '請先登入'),
      gaugeHtml('done', '已完成案件', done, done || 1, done ? 'is-done' : '',
        token() ? (done ? '點擊查看已完成／退件案件' : '尚無已完成案件') : '請先登入')
    ].join('');
  }

  function renderLists() {
    renderGauges();
    renderDetail();
  }

  async function loadMine() {
    if (!token() || !window.skyfunAuth?.rpc) {
      state.rows = [];
      renderLists();
      return;
    }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_mine', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.rows = res.rows || [];
    } catch (e) {
      state.rows = [];
      setMsg('自己的通報讀取失敗：' + (e.message || e), 'err');
    }
    renderLists();
  }

  async function loadInbox() {
    if (!token() || !window.skyfunAuth?.rpc) {
      state.inbox = [];
      state.transferred = [];
      state.completed = [];
      state.role = { name: '', team: '', title: '', role: 'guest' };
      renderLists();
      return;
    }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_for_me', { p_token: token() });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.inbox = res.rows || [];
      state.transferred = res.transferred || [];
      state.completed = res.completed || [];
      state.role = res.role || { name: '', team: '', title: '', role: 'guest' };
      if (isSalesDash()) {
        if (state.detailKey === 'pending') state.detailKey = 'returned';
        if (state.detailKey === 'transferred') state.detailKey = '';
      } else if (state.detailKey === 'transferred' && !canSeeTransferred()) {
        state.detailKey = '';
      } else if (state.detailKey === 'returned') {
        state.detailKey = 'pending';
      }
    } catch (e) {
      state.inbox = [];
      state.transferred = [];
      state.completed = [];
      state.role = { name: '', team: '', title: '', role: 'guest' };
      setMsg('待修改案件讀取失敗：' + (e.message || e), 'err');
    }
    renderLists();
  }

  async function markDone(id) {
    if (state.busy || !id) return;
    if (!confirm(myRoleKey() === 'super'
      ? '確認系統已改完？按了會標記為已完成，並 LINE 通知填寫人、承辦行政與處經理。'
      : '確認系統已改完？按了會標記為已完成，並 LINE 通知填寫人。')) return;
    state.busy = true;
    const btn = document.querySelector(`[data-bsc-done="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_mark_done', {
        p_token: token(),
        p_id: Number(id)
      });
      if (!res?.ok) throw new Error(res?.error || '標記失敗');
      setMsg(lineNote(
        res.line,
        myRoleKey() === 'super'
          ? '已標記完成，並已 LINE 通知填寫人、承辦行政與處經理'
          : '已標記完成，並已 LINE 通知填寫人',
        '已標記完成，但 LINE 未送出'
      ), 'ok');
      await Promise.all([loadInbox(), loadMine()]);
    } catch (e) {
      setMsg(e.message || String(e), 'err');
      if (btn) { btn.disabled = false; btn.textContent = '已修改完畢'; }
    } finally {
      state.busy = false;
    }
  }

  function syncRejectConfirm() {
    const confirm = $('bsc-reject-confirm');
    const reason = String($('bsc-reject-reason')?.value || '').trim();
    if (confirm) confirm.disabled = !reason || state.busy;
  }

  function openRejectModal(id) {
    state.rejectId = id;
    const modal = $('bsc-reject-modal');
    const reason = $('bsc-reject-reason');
    const hint = $('bsc-reject-hint');
    if (reason) reason.value = '';
    if (hint) {
      hint.textContent = myRoleKey() === 'super'
        ? '退件原因會寫入案件紀錄，並 LINE 通知填寫人、承辦行政與處經理'
        : '退件原因會寫入案件紀錄並通知填寫人';
      hint.classList.remove('is-err');
    }
    syncRejectConfirm();
    if (modal) {
      modal.hidden = false;
      modal.classList.remove('hidden');
    }
    reason?.focus();
  }

  function closeRejectModal() {
    state.rejectId = null;
    const modal = $('bsc-reject-modal');
    if (modal) {
      modal.hidden = true;
      modal.classList.add('hidden');
    }
  }

  function renderEditFiles() {
    const box = $('bsc-edit-file-list');
    if (!box) return;
    const kept = state.editKept.map((a, i) => {
      const name = esc(a.name || '附件');
      const url = esc(a.url || '');
      const thumb = (a.kind === 'image' || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(a.url || ''))
        ? `<img src="${url}" alt="${name}">`
        : `<span class="bsc-edit-file-name">📎 ${name}</span>`;
      return `<span class="bsc-edit-file is-kept">${thumb}<button type="button" data-bsc-edit-rm-kept="${i}" aria-label="移除">×</button></span>`;
    });
    const added = state.editNewFiles.map((f, i) =>
      `<span class="bsc-edit-file is-new"><span class="bsc-edit-file-name">${esc(f.name)}</span><button type="button" data-bsc-edit-rm-new="${i}" aria-label="移除">×</button></span>`
    );
    box.innerHTML = kept.concat(added).join('') || '<p class="bsc-hint">尚未選擇圖片／檔案</p>';
  }

  function openEditModal(id) {
    const row = state.inbox.find((r) => String(r.id) === String(id)) || state.rows.find((r) => String(r.id) === String(id));
    if (!row || !isMyReturned(row)) {
      setMsg('找不到可修改的退回案件', 'err');
      return;
    }
    state.editId = id;
    state.editRow = row;
    state.editKept = Array.isArray(row.attachments) ? row.attachments.slice() : [];
    state.editNewFiles = [];
    const modal = $('bsc-edit-modal');
    const addr = $('bsc-edit-address');
    const match = $('bsc-edit-match');
    const content = $('bsc-edit-content');
    const hint = $('bsc-edit-hint');
    const fileInput = $('bsc-edit-files');
    if (addr) addr.value = row.address || '';
    if (match) match.value = row.matchNo || '';
    if (content) content.value = row.content || '';
    if (fileInput) fileInput.value = '';
    const nodes = Array.isArray(row.nodes) ? row.nodes : [];
    document.querySelectorAll('#bsc-edit-modal input[name="bsc-edit-nodes"]').forEach((el) => {
      el.checked = nodes.includes(el.value);
    });
    if (hint) {
      hint.textContent = row.adminNote ? ('退回紀錄：' + row.adminNote) : '請依退回原因修改後重新送出';
      hint.classList.remove('is-err');
    }
    const showModifier = () => fillEditModifier(row.modifierName, row.modifierTeam);
    if (state.managers.length) showModifier();
    else loadManagers().then(showModifier);
    renderEditFiles();
    if (modal) {
      modal.hidden = false;
      modal.classList.remove('hidden');
    }
  }

  function closeEditModal() {
    state.editId = null;
    state.editRow = null;
    state.editKept = [];
    state.editNewFiles = [];
    const modal = $('bsc-edit-modal');
    const fileInput = $('bsc-edit-files');
    if (fileInput) fileInput.value = '';
    if (modal) {
      modal.hidden = true;
      modal.classList.add('hidden');
    }
  }

  function onEditPickFiles(input) {
    const picked = Array.from(input.files || []);
    input.value = '';
    const hint = $('bsc-edit-hint');
    const next = state.editNewFiles.slice();
    const totalNow = () => state.editKept.length + next.length;
    for (const f of picked) {
      if (totalNow() >= MAX_FILES) {
        if (hint) {
          hint.textContent = `最多上傳 ${MAX_FILES} 個檔案`;
          hint.classList.add('is-err');
        }
        break;
      }
      if (f.size > MAX_SIZE) {
        if (hint) {
          hint.textContent = `「${f.name}」超過 10MB`;
          hint.classList.add('is-err');
        }
        continue;
      }
      const ext = fileExt(f.name, f.type);
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)) {
        if (hint) {
          hint.textContent = `不支援「${f.name}」，請上傳圖片或 PDF`;
          hint.classList.add('is-err');
        }
        continue;
      }
      next.push(f);
    }
    state.editNewFiles = next;
    renderEditFiles();
  }

  async function confirmResubmit() {
    const id = state.editId;
    const row = state.editRow;
    if (!id || !row || state.busy) return;
    const address = String($('bsc-edit-address')?.value || '').trim();
    const matchNo = String($('bsc-edit-match')?.value || '').trim();
    const content = String($('bsc-edit-content')?.value || '').trim();
    const mod = parseMod($('bsc-edit-modifier')?.value);
    const nodes = Array.from(document.querySelectorAll('#bsc-edit-modal input[name="bsc-edit-nodes"]:checked'))
      .map((el) => el.value)
      .filter((v) => NODE_OPTIONS.includes(v));
    const hint = $('bsc-edit-hint');
    if (!mod.name) {
      if (hint) {
        hint.textContent = '請選擇營業處經理';
        hint.classList.add('is-err');
      }
      $('bsc-edit-modifier')?.focus();
      return;
    }
    if (!address || !matchNo || !content || !nodes.length) {
      if (hint) {
        hint.textContent = '請填完整地址、媒合編號、節點與修改內容';
        hint.classList.add('is-err');
      }
      return;
    }
    if (state.editKept.length + state.editNewFiles.length > MAX_FILES) {
      if (hint) {
        hint.textContent = `最多上傳 ${MAX_FILES} 個檔案`;
        hint.classList.add('is-err');
      }
      return;
    }
    state.busy = true;
    const btn = $('bsc-edit-confirm');
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    try {
      const uploaded = await uploadSelected(state.editNewFiles);
      const attachments = state.editKept.concat(uploaded).slice(0, MAX_FILES);
      const res = await window.skyfunAuth.rpc('biz_system_change_resubmit', {
        p_token: token(),
        p_id: Number(id),
        p_data: {
          address,
          matchNo,
          content,
          nodes,
          attachments,
          modifierName: mod.name,
          modifierTeam: mod.team
        }
      });
      if (!res?.ok) throw new Error(res?.error || '重新送出失敗');
      closeEditModal();
      {
        const who = String(res.notifyName || '').trim() || '退件處理人';
        setMsg(
          lineNote(res.line, `已重新送出，並已通知 ${who} 重新審核`, `已重新送出給 ${who}，但 LINE 未送出`),
          'ok'
        );
      }
      await Promise.all([loadInbox(), loadMine()]);
    } catch (e) {
      if (hint) {
        hint.textContent = e.message || String(e);
        hint.classList.add('is-err');
      }
      setMsg(e.message || String(e), 'err');
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '確認重新送出'; }
    }
  }

  async function confirmReject() {
    const id = state.rejectId;
    const reason = String($('bsc-reject-reason')?.value || '').trim();
    const hint = $('bsc-reject-hint');
    if (!id) return;
    if (!reason) {
      if (hint) {
        hint.textContent = '請填寫退件原因';
        hint.classList.add('is-err');
      }
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const confirmBtn = $('bsc-reject-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '退件中…'; }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_reject', {
        p_token: token(),
        p_id: Number(id),
        p_reason: reason
      });
      if (!res?.ok) throw new Error(res?.error || '退件失敗');
      closeRejectModal();
        setMsg(lineNote(
          res.line,
          myRoleKey() === 'super'
            ? '已退回填寫人，並已 LINE 通知填寫人、承辦行政與處經理'
            : '已退回填寫人，並已 LINE 通知',
          '已退回填寫人並記錄原因，但 LINE 未送出'
        ), 'ok');
      await Promise.all([loadInbox(), loadMine()]);
    } catch (e) {
      if (hint) {
        hint.textContent = e.message || String(e);
        hint.classList.add('is-err');
      }
      setMsg(e.message || String(e), 'err');
    } finally {
      state.busy = false;
      if (confirmBtn) confirmBtn.textContent = '確認退回';
      syncRejectConfirm();
    }
  }

  function transferExtraHtml(r) {
    const x = r && r.transferExtra ? r.transferExtra : {};
    if (!x.depositIssue && !x.robotIssue) return '';
    const tags = [];
    if (x.depositIssue) tags.push('<span class="bsc-node-tag">租押金問題</span>');
    if (x.robotIssue) tags.push('<span class="bsc-node-tag">機器人問題</span>');
    let body = '';
    if (x.robotIssue) {
      const mates = Array.isArray(x.roommates) ? x.roommates : [];
      body = `<div class="bsc-extra-line">物件地址：${esc(x.address || '')}</div>
        <div class="bsc-extra-line">房客：${esc(x.tenantName || '')}　身分證字號：${esc(x.tenantId || '')}</div>` +
        mates.map((m) => `<div class="bsc-extra-line">共住人：${esc(m.name || '')}　身分證字號：${esc(m.idNo || '')}</div>`).join('');
    }
    return `<div class="bsc-extra">${tags.join('')}${body}</div>`;
  }

  function findCase(id) {
    return searchableRows().find((r) => String(r.id) === String(id)) || null;
  }

  function readMates() {
    return Array.from(document.querySelectorAll('#bsc-xfer-mates .bsc-xfer-mate')).map((row) => ({
      name: String(row.querySelector('[data-mate-name]')?.value || '').trim(),
      idNo: String(row.querySelector('[data-mate-id]')?.value || '').trim()
    }));
  }

  function renderXferPhotos() {
    const box = $('bsc-xfer-photo-list');
    if (!box) return;
    box.innerHTML = state.xferFiles.map((f, i) =>
      `<span class="bsc-file">${esc(f.name)}<button type="button" data-bsc-xfer-rm="${i}" aria-label="移除">×</button></span>`
    ).join('');
  }

  function renderXferMates() {
    const box = $('bsc-xfer-mates');
    if (!box) return;
    box.innerHTML = state.xferMates.map((m, i) =>
      `<div class="bsc-xfer-mate">
        <input data-mate-name data-i="${i}" type="text" maxlength="40" placeholder="共住人姓名" value="${esc(m.name)}" autocomplete="off">
        <input data-mate-id data-i="${i}" type="text" maxlength="20" placeholder="身分證字號" value="${esc(m.idNo)}" autocomplete="off" spellcheck="false">
        <button type="button" class="btn btn-sm tone-slate-soft" data-bsc-mate-rm="${i}">移除</button>
      </div>`
    ).join('');
  }

  function syncRobotBox() {
    const on = !!$('bsc-xfer-robot')?.checked;
    const box = $('bsc-xfer-robot-box');
    if (box) box.hidden = !on;
  }

  function xferBlockReason() {
    if (!$('bsc-xfer-admin')?.value) return '請先選擇行政承辦人';
    if ($('bsc-xfer-deposit')?.checked && !state.xferFiles.length) return '租押金問題請上傳至少一張照片';
    if ($('bsc-xfer-robot')?.checked) {
      if (!$('bsc-xfer-address')?.value.trim()) return '機器人問題請填物件地址';
      if (!$('bsc-xfer-tenant')?.value.trim()) return '機器人問題請填房客姓名';
      if (!$('bsc-xfer-tenant-id')?.value.trim()) return '機器人問題請填房客身分證字號';
      if (readMates().some((m) => (m.name && !m.idNo) || (!m.name && m.idNo))) {
        return '共住人要同時填姓名與身分證字號';
      }
    }
    return '';
  }

  function syncXferConfirm() {
    const confirm = $('bsc-xfer-confirm');
    const hint = $('bsc-xfer-hint');
    const reason = xferBlockReason();
    if (confirm) confirm.disabled = !!reason || state.busy;
    if (hint && !hint.classList.contains('is-err')) {
      hint.textContent = reason || '選定後會 LINE 通知該行政';
    }
  }

  function resetXferExtra() {
    state.xferFiles = [];
    state.xferMates = [];
    const deposit = $('bsc-xfer-deposit');
    const robot = $('bsc-xfer-robot');
    const addr = $('bsc-xfer-address');
    const tenant = $('bsc-xfer-tenant');
    const tenantId = $('bsc-xfer-tenant-id');
    const photos = $('bsc-xfer-photos');
    if (deposit) deposit.checked = false;
    if (robot) robot.checked = false;
    if (photos) photos.value = '';
    const row = findCase(state.xferId);
    if (addr) addr.value = row?.address || '';
    if (tenant) tenant.value = '';
    if (tenantId) tenantId.value = '';
    renderXferPhotos();
    renderXferMates();
    syncRobotBox();
  }

  function openXferModal(id) {
    state.xferId = id;
    const modal = $('bsc-xfer-modal');
    const hint = $('bsc-xfer-hint');
    const sel = $('bsc-xfer-admin');
    if (hint) {
      hint.textContent = state.admins.length ? '選定後會 LINE 通知該行政' : '行政名單載入中…';
      hint.classList.remove('is-err');
    }
    if (sel) sel.value = '';
    resetXferExtra();
    syncXferConfirm();
    if (modal) {
      // 掛到 body，避免被專區捲動容器影響，固定出現在螢幕正中央
      if (modal.parentElement !== document.body) document.body.appendChild(modal);
      modal.hidden = false;
      modal.classList.remove('hidden');
      document.body.classList.add('bsc-modal-open');
    }
    if (!state.admins.length) loadAdmins();
    else renderAdminSelect('');
  }

  function closeXferModal() {
    state.xferId = null;
    const modal = $('bsc-xfer-modal');
    if (modal) {
      modal.hidden = true;
      modal.classList.add('hidden');
    }
    if (!$('bsc-reject-modal') || $('bsc-reject-modal').hidden) {
      if (!$('bsc-edit-modal') || $('bsc-edit-modal').hidden) {
        document.body.classList.remove('bsc-modal-open');
      }
    }
  }

  async function transferCase(id, to) {
    if (state.busy || !id || !to) return;
    if (to === 'admin') {
      openXferModal(id);
      return;
    }
    if (!confirm('確定轉交管理員黃怡婷？適用於預設租金、押金月份、押金金額等需進階權限的項目。')) return;
    state.busy = true;
    const btn = document.querySelector(`[data-bsc-xfer="${to}"][data-id="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '轉交中…'; }
    try {
      const res = await window.skyfunAuth.rpc('biz_system_change_transfer', {
        p_token: token(),
        p_id: Number(id),
        p_to: to,
        p_admin_name: null
      });
      if (!res?.ok) throw new Error(res?.error || '轉單失敗');
      setMsg(lineNote(res.line, '已轉交管理員黃怡婷，並已 LINE 通知', '已轉交管理員黃怡婷，但 LINE 未送出'), 'ok');
      await Promise.all([loadInbox(), loadMine()]);
    } catch (e) {
      setMsg(e.message || String(e), 'err');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '轉交管理員';
      }
    } finally {
      state.busy = false;
    }
  }

  async function confirmXferAdmin() {
    const id = state.xferId;
    const adminName = String($('bsc-xfer-admin')?.value || '').trim();
    const hint = $('bsc-xfer-hint');
    if (!id) return;
    const block = xferBlockReason();
    if (block) {
      if (hint) {
        hint.textContent = block;
        hint.classList.add('is-err');
      }
      syncXferConfirm();
      return;
    }
    if (state.busy) return;
    state.busy = true;
    const confirmBtn = $('bsc-xfer-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '轉交中…'; }
    try {
      const photos = await uploadSelected(state.xferFiles);
      const robot = !!$('bsc-xfer-robot')?.checked;
      const mates = readMates().filter((m) => m.name || m.idNo);
      const extra = {
        depositIssue: !!$('bsc-xfer-deposit')?.checked,
        robotIssue: robot,
        photos: photos.map((f) => ({ url: f.url, name: '轉交照片｜' + f.name, kind: 'image' }))
      };
      if (robot) {
        extra.address = $('bsc-xfer-address')?.value.trim() || '';
        extra.tenantName = $('bsc-xfer-tenant')?.value.trim() || '';
        extra.tenantId = $('bsc-xfer-tenant-id')?.value.trim() || '';
        extra.roommates = mates;
      }
      const res = await window.skyfunAuth.rpc('biz_system_change_transfer', {
        p_token: token(),
        p_id: Number(id),
        p_to: 'admin',
        p_admin_name: adminName,
        p_extra: extra
      });
      if (!res?.ok) throw new Error(res?.error || '轉單失敗');
      closeXferModal();
      setMsg(lineNote(res.line, `已轉交 ${adminName}，並已 LINE 通知`, `已轉交 ${adminName}，但 LINE 未送出`), 'ok');
      await Promise.all([loadInbox(), loadMine()]);
    } catch (e) {
      if (hint) {
        hint.textContent = e.message || String(e);
        hint.classList.add('is-err');
      }
      setMsg(e.message || String(e), 'err');
    } finally {
      state.busy = false;
      if (confirmBtn) confirmBtn.textContent = '確認轉交';
      syncXferConfirm();
    }
  }

  async function refreshPage() {
    fillAuthor();
    await Promise.all([loadManagers(), loadAdmins(), loadMine(), loadInbox()]);
  }

  async function uploadSelected(fileList) {
    const files = Array.isArray(fileList) ? fileList : state.files;
    if (!files.length) return [];
    const sb = sbClient();
    const out = [];
    for (const file of files) {
      const ext = fileExt(file.name, file.type);
      if (!ext) throw new Error(`不支援的檔案：${file.name || ''}`);
      const prep = await window.skyfunAuth.rpc('biz_system_change_prepare_upload', {
        p_token: token(),
        p_ext: ext
      });
      if (!prep?.ok) throw new Error(prep?.error || '無法準備上傳');
      const { error } = await sb.storage.from('biz-system-change').upload(prep.path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (error) throw new Error(error.message || '上傳失敗');
      out.push({
        url: prep.publicUrl,
        name: String(file.name || prep.path).slice(0, 120),
        kind: isImageExt(ext) ? 'image' : 'file'
      });
    }
    return out;
  }

  function openPolicyModal(payload) {
    state.pendingPayload = payload;
    const modal = $('bsc-policy-modal');
    const ack = $('bsc-policy-ack');
    const confirm = $('bsc-policy-confirm');
    if (ack) ack.checked = false;
    if (confirm) confirm.disabled = true;
    if (modal) {
      modal.hidden = false;
      modal.classList.remove('hidden');
    }
  }

  function closePolicyModal() {
    state.pendingPayload = null;
    const modal = $('bsc-policy-modal');
    const ack = $('bsc-policy-ack');
    if (ack) ack.checked = false;
    if (modal) {
      modal.hidden = true;
      modal.classList.add('hidden');
    }
  }

  function syncPolicyConfirm() {
    const ack = $('bsc-policy-ack');
    const confirm = $('bsc-policy-confirm');
    if (confirm) confirm.disabled = !(ack && ack.checked) || state.busy;
  }

  async function doSubmit(payload) {
    if (state.busy || !payload) return;
    state.busy = true;
    const btn = $('bsc-submit');
    const confirm = $('bsc-policy-confirm');
    if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
    if (confirm) { confirm.disabled = true; confirm.textContent = '送出中…'; }
    try {
      const attachments = await uploadSelected();
      const res = await window.skyfunAuth.rpc('biz_system_change_submit', {
        p_token: token(),
        p_data: Object.assign({}, payload, { attachments })
      });
      if (!res?.ok) throw new Error(res?.error || '送出失敗');
      const form = $('bsc-form');
      if (form) form.reset();
      state.files = [];
      renderFiles();
      fillAuthor();
      renderManagers('');
      closePolicyModal();
      setMsg(lineNote(res.line, '已送出通報，並已 LINE 通知修改人', '已送出通報，但修改人 LINE 未送出'), 'ok');
      await Promise.all([loadMine(), loadInbox()]);
    } catch (err) {
      setMsg(err.message || String(err), 'err');
      syncPolicyConfirm();
    } finally {
      state.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '提交'; }
      if (confirm) confirm.textContent = '確認送出';
      syncPolicyConfirm();
    }
  }

  function submit(e) {
    e.preventDefault();
    if (state.busy) return;
    setMsg('');
    if (!token()) {
      setMsg('請先登入工具箱再送出', 'err');
      return;
    }
    const form = $('bsc-form');
    const address = form.elements.address.value.trim();
    const matchNo = form.elements.matchNo.value.trim();
    const content = form.elements.content.value.trim();
    const mod = parseMod(form.elements.modifier.value);
    const nodes = Array.from(form.querySelectorAll('input[name="nodes"]:checked'))
      .map((el) => el.value)
      .filter((v) => NODE_OPTIONS.includes(v));
    if (!form.elements.modifier.value) {
      setMsg('請選擇營業處經理', 'err');
      form.elements.modifier.focus();
      return;
    }
    if (!mod.name) { setMsg('請選擇營業處經理', 'err'); form.elements.modifier.focus(); return; }
    if (!address) { setMsg('請填物件地址', 'err'); form.elements.address.focus(); return; }
    if (!matchNo) { setMsg('請填媒合編號', 'err'); form.elements.matchNo.focus(); return; }
    if (!nodes.length) { setMsg('請至少勾選一個需修改節點', 'err'); return; }
    if (!content) { setMsg('請輸入需修改內容', 'err'); form.elements.content.focus(); return; }

    openPolicyModal({
      address,
      matchNo,
      nodes,
      content,
      modifierName: mod.name,
      modifierTeam: mod.team
    });
  }

  function clearForm() {
    const form = $('bsc-form');
    if (form) form.reset();
    state.files = [];
    renderFiles();
    fillAuthor();
    renderManagers('');
    setMsg('');
  }

  function onPickFiles(input) {
    const picked = Array.from(input.files || []);
    input.value = '';
    const next = state.files.slice();
    for (const f of picked) {
      if (next.length >= MAX_FILES) {
        setMsg(`最多上傳 ${MAX_FILES} 個檔案`, 'err');
        break;
      }
      if (f.size > MAX_SIZE) {
        setMsg(`「${f.name}」超過 10MB`, 'err');
        continue;
      }
      const ext = fileExt(f.name, f.type);
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)) {
        setMsg(`不支援「${f.name}」，請上傳圖片或 PDF`, 'err');
        continue;
      }
      next.push(f);
    }
    state.files = next;
    renderFiles();
  }

  function bind() {
    const root = $('bsc-root');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';

    $('bsc-form')?.addEventListener('submit', submit);
    $('bsc-clear')?.addEventListener('click', clearForm);
    $('bsc-files')?.addEventListener('change', (e) => onPickFiles(e.target));
    $('bsc-file-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bsc-rm]');
      if (!btn) return;
      const i = Number(btn.getAttribute('data-bsc-rm'));
      if (!Number.isFinite(i)) return;
      state.files.splice(i, 1);
      renderFiles();
    });
    $('bsc-gauges')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bsc-detail]');
      if (!btn) return;
      const key = btn.getAttribute('data-bsc-detail') || '';
      state.detailKey = state.detailKey === key ? '' : key;
      renderLists();
    });
    $('bsc-search')?.addEventListener('input', (e) => {
      state.search = String(e.target.value || '');
      renderDetail();
    });
    $('bsc-search-clear')?.addEventListener('click', () => {
      state.search = '';
      const input = $('bsc-search');
      if (input) input.value = '';
      renderDetail();
      input?.focus();
    });
    $('bsc-detail-close')?.addEventListener('click', () => {
      state.detailKey = '';
      if (!String(state.search || '').trim()) renderLists();
      else renderDetail();
    });
    $('bsc-detail-list')?.addEventListener('click', (e) => {
      const xfer = e.target.closest('[data-bsc-xfer]');
      if (xfer) {
        transferCase(xfer.getAttribute('data-id'), xfer.getAttribute('data-bsc-xfer'));
        return;
      }
      const edit = e.target.closest('[data-bsc-edit]');
      if (edit) {
        openEditModal(edit.getAttribute('data-bsc-edit'));
        return;
      }
      const rej = e.target.closest('[data-bsc-reject]');
      if (rej) {
        openRejectModal(rej.getAttribute('data-bsc-reject'));
        return;
      }
      const btn = e.target.closest('[data-bsc-done]');
      if (!btn) return;
      markDone(btn.getAttribute('data-bsc-done'));
    });
    $('bsc-policy-ack')?.addEventListener('change', syncPolicyConfirm);
    $('bsc-policy-confirm')?.addEventListener('click', () => {
      if (!$('bsc-policy-ack')?.checked) return;
      doSubmit(state.pendingPayload);
    });
    $('bsc-policy-modal')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-bsc-policy-close]')) closePolicyModal();
    });
    $('bsc-xfer-admin')?.addEventListener('change', () => {
      $('bsc-xfer-hint')?.classList.remove('is-err');
      syncXferConfirm();
    });
    $('bsc-xfer-deposit')?.addEventListener('change', () => {
      $('bsc-xfer-hint')?.classList.remove('is-err');
      syncXferConfirm();
    });
    $('bsc-xfer-robot')?.addEventListener('change', () => {
      $('bsc-xfer-hint')?.classList.remove('is-err');
      syncRobotBox();
      syncXferConfirm();
    });
    ['bsc-xfer-address', 'bsc-xfer-tenant', 'bsc-xfer-tenant-id'].forEach((id) => {
      $(id)?.addEventListener('input', () => {
        $('bsc-xfer-hint')?.classList.remove('is-err');
        syncXferConfirm();
      });
    });
    $('bsc-xfer-photos')?.addEventListener('change', (e) => {
      const picked = Array.from(e.target.files || []);
      e.target.value = '';
      $('bsc-xfer-hint')?.classList.remove('is-err');
      const next = state.xferFiles.slice();
      for (const f of picked) {
        if (next.length >= MAX_FILES) {
          const hint = $('bsc-xfer-hint');
          if (hint) { hint.textContent = `最多上傳 ${MAX_FILES} 張照片`; hint.classList.add('is-err'); }
          break;
        }
        if (f.size > MAX_SIZE) {
          const hint = $('bsc-xfer-hint');
          if (hint) { hint.textContent = `「${f.name}」超過 10MB`; hint.classList.add('is-err'); }
          continue;
        }
        const ext = fileExt(f.name, f.type);
        if (!isImageExt(ext)) {
          const hint = $('bsc-xfer-hint');
          if (hint) { hint.textContent = `「${f.name}」不是照片`; hint.classList.add('is-err'); }
          continue;
        }
        next.push(f);
      }
      state.xferFiles = next;
      renderXferPhotos();
      syncXferConfirm();
    });
    $('bsc-xfer-photo-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bsc-xfer-rm]');
      if (!btn) return;
      const i = Number(btn.getAttribute('data-bsc-xfer-rm'));
      if (!Number.isFinite(i)) return;
      state.xferFiles.splice(i, 1);
      $('bsc-xfer-hint')?.classList.remove('is-err');
      renderXferPhotos();
      syncXferConfirm();
    });
    $('bsc-xfer-add-mate')?.addEventListener('click', () => {
      state.xferMates = readMates();
      if (state.xferMates.length >= 8) return;
      state.xferMates.push({ name: '', idNo: '' });
      renderXferMates();
      syncXferConfirm();
    });
    $('bsc-xfer-mates')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bsc-mate-rm]');
      if (!btn) return;
      const i = Number(btn.getAttribute('data-bsc-mate-rm'));
      state.xferMates = readMates();
      if (Number.isFinite(i)) state.xferMates.splice(i, 1);
      $('bsc-xfer-hint')?.classList.remove('is-err');
      renderXferMates();
      syncXferConfirm();
    });
    $('bsc-xfer-mates')?.addEventListener('input', () => {
      state.xferMates = readMates();
      $('bsc-xfer-hint')?.classList.remove('is-err');
      syncXferConfirm();
    });
    $('bsc-xfer-confirm')?.addEventListener('click', confirmXferAdmin);
    $('bsc-xfer-modal')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-bsc-xfer-close]')) closeXferModal();
    });
    $('bsc-reject-reason')?.addEventListener('input', syncRejectConfirm);
    $('bsc-reject-confirm')?.addEventListener('click', confirmReject);
    $('bsc-reject-modal')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-bsc-reject-close]')) closeRejectModal();
    });
    $('bsc-edit-confirm')?.addEventListener('click', confirmResubmit);
    $('bsc-edit-files')?.addEventListener('change', (e) => onEditPickFiles(e.target));
    $('bsc-edit-modal')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-bsc-edit-close]')) {
        closeEditModal();
        return;
      }
      const rmKept = e.target.closest('[data-bsc-edit-rm-kept]');
      if (rmKept) {
        const i = Number(rmKept.getAttribute('data-bsc-edit-rm-kept'));
        if (Number.isFinite(i)) {
          state.editKept.splice(i, 1);
          renderEditFiles();
        }
        return;
      }
      const rmNew = e.target.closest('[data-bsc-edit-rm-new]');
      if (rmNew) {
        const i = Number(rmNew.getAttribute('data-bsc-edit-rm-new'));
        if (Number.isFinite(i)) {
          state.editNewFiles.splice(i, 1);
          renderEditFiles();
        }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (state.editId) closeEditModal();
      else if (state.rejectId) closeRejectModal();
      else if (state.xferId) closeXferModal();
      else if (state.pendingPayload) closePolicyModal();
    });

    document.addEventListener('skyfun-auth-ready', refreshPage);
    const page = $('page-business-system-change');
    if (page) {
      new MutationObserver(() => {
        if (!page.classList.contains('hidden')) refreshPage();
      }).observe(page, { attributes: true, attributeFilter: ['class'] });
    }
    fillAuthor();
    renderLists();
    if (token()) refreshPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
