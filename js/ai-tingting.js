/**
 * AI婷婷 問答（ChatGPT 式側欄歷史；本機多對話；行政／業務主管共用）
 */
(function () {
  'use strict';

  const MAX_LEN = 500;
  const RATE_LIMIT = 3;
  const RATE_WINDOW_MS = 60 * 1000;
  const POLL_MS = 5000;
  const POLL_MAX_MS = 5 * 60 * 1000;
  const FN_PATH = '/functions/v1/ai-tingting';
  const ZONE_KEY = 'ai-tingting-zone';
  const BACK_KEY = 'ai-tingting-back';
  const STORE_PREFIX = 'skyfun-ait-chats-v1:';

  let pollTimer = null;
  let pollStartedAt = 0;
  let pendingId = null;
  let pendingSessionId = null;
  let askTimes = [];
  let inited = false;
  let store = { activeId: '', sessions: [] };
  let searchQ = '';
  let migratedOnce = false;

  function $(id) {
    return document.getElementById(id);
  }

  function cfg() {
    const c = window.SKYFUN_SUPABASE || {};
    return {
      url: String(c.url || '').trim().replace(/\/$/, ''),
      anonKey: String(c.anonKey || c.anon_key || '').trim(),
    };
  }

  function token() {
    try {
      return window.skyfunAuth?.getToken?.() || '';
    } catch (_) {
      return '';
    }
  }

  function user() {
    try {
      return window.skyfunAuth?.getUser?.() || null;
    } catch (_) {
      return null;
    }
  }

  function userKey() {
    const u = user();
    const id = String((u && (u.account || u.username || u.name || u.id)) || 'guest').trim();
    return STORE_PREFIX + id;
  }

  function zone() {
    const z = sessionStorage.getItem(ZONE_KEY);
    return z === 'supervisor' ? 'supervisor' : 'admin';
  }

  function backPage() {
    const b = sessionStorage.getItem(BACK_KEY);
    if (b === 'biz-supervisor' || b === 'administration' || b === 'rentmanager') return b;
    return zone() === 'supervisor' ? 'biz-supervisor' : 'administration';
  }

  function setStatus(msg, isError) {
    const el = $('ait-status');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('hidden', !msg);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('zh-TW', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  }

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function titleFromText(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '新聊天';
    return t.length > 28 ? t.slice(0, 28) + '…' : t;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(userKey());
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.sessions)) {
        store = {
          activeId: String(parsed.activeId || ''),
          sessions: parsed.sessions.map(function (s) {
            return {
              id: String(s.id || uid()),
              title: String(s.title || '新聊天'),
              updatedAt: String(s.updatedAt || new Date().toISOString()),
              items: Array.isArray(s.items) ? s.items : [],
            };
          }),
        };
      } else {
        store = { activeId: '', sessions: [] };
      }
    } catch (_) {
      store = { activeId: '', sessions: [] };
    }
    if (!store.sessions.length) {
      const s = { id: uid(), title: '新聊天', updatedAt: new Date().toISOString(), items: [] };
      store.sessions = [s];
      store.activeId = s.id;
      saveStore();
    } else if (!store.activeId || !store.sessions.some(function (s) { return s.id === store.activeId; })) {
      store.activeId = store.sessions[0].id;
      saveStore();
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(userKey(), JSON.stringify(store));
    } catch (_) {
      /* ignore quota */
    }
  }

  function activeSession() {
    return store.sessions.find(function (s) { return s.id === store.activeId; }) || null;
  }

  function touchSession(session, patch) {
    if (!session) return;
    Object.assign(session, patch || {});
    session.updatedAt = new Date().toISOString();
    store.sessions = [session].concat(store.sessions.filter(function (s) { return s.id !== session.id; }));
    saveStore();
  }

  function clearPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    pendingId = null;
    pendingSessionId = null;
    pollStartedAt = 0;
  }

  function rateOk() {
    const now = Date.now();
    askTimes = askTimes.filter(function (t) { return now - t < RATE_WINDOW_MS; });
    return askTimes.length < RATE_LIMIT;
  }

  function markAsk() {
    askTimes.push(Date.now());
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function friendlyNetErr(err) {
    const m = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m) || (err && err.name === 'TypeError')) {
      return '連線失敗，請稍後再試（伺服器忙碌時重整即可）';
    }
    return m || '連線失敗';
  }

  function isNetErr(err) {
    const m = String((err && err.message) || err || '');
    return /Failed to fetch|NetworkError|Load failed/i.test(m) || (err && err.name === 'TypeError');
  }

  async function api(body) {
    const conf = cfg();
    if (!conf.url || !conf.anonKey) throw new Error('尚未設定 Supabase');
    const t = token();
    if (!t && body.action !== 'answer') throw new Error('請先登入');
    const payload = Object.assign({}, body);
    if (t) payload.token = t;

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(conf.url + FN_PATH, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: conf.anonKey,
            Authorization: 'Bearer ' + conf.anonKey,
          },
          body: JSON.stringify(payload),
        });
        let data = null;
        try {
          data = await res.json();
        } catch (_) {
          data = null;
        }
        if (res.status === 502 || res.status === 503) {
          lastErr = new Error((data && data.error) || ('請求失敗（' + res.status + '）'));
          if (attempt < 2) {
            await sleep(400 * (attempt + 1));
            continue;
          }
          throw new Error('連線失敗，請稍後再試（伺服器忙碌時重整即可）');
        }
        if (!res.ok || !data?.ok) {
          throw new Error((data && data.error) || ('請求失敗（' + res.status + '）'));
        }
        return data;
      } catch (err) {
        if (err instanceof Error && !isNetErr(err) && !/請求失敗（50[23]）/.test(err.message || '')) {
          throw err;
        }
        lastErr = err;
        if (attempt < 2 && (isNetErr(err) || /請求失敗（50[23]）/.test(String((err && err.message) || '')))) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw new Error(friendlyNetErr(err));
      }
    }
    throw new Error(friendlyNetErr(lastErr));
  }

  function syncAuthUi() {
    const loggedIn = !!token() && !!user();
    const gate = $('ait-login-gate');
    const main = $('ait-main');
    if (gate) gate.classList.toggle('hidden', loggedIn);
    if (main) main.classList.toggle('hidden', !loggedIn);
    const back = $('ait-back-btn');
    if (back) {
      const bp = backPage();
      back.textContent = bp === 'biz-supervisor'
        ? '← 返回業務主管專區'
        : (bp === 'rentmanager' ? '← 返回租管師專區' : '← 返回行政專區');
      back.onclick = function () {
        if (typeof showPage === 'function') showPage(bp);
      };
    }
  }

  function makeMsg(role, text, meta, opts) {
    const row = document.createElement('div');
    row.className = 'ait-msg ait-msg--' + role;
    if (opts && opts.id) row.dataset.id = opts.id;
    if (opts && opts.pending) row.dataset.pending = '1';

    const face = document.createElement('span');
    face.className = 'ait-msg-face';
    face.setAttribute('aria-hidden', 'true');
    face.textContent = role === 'user' ? '我' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'ait-bubble';

    if (opts && opts.typing) {
      const typing = document.createElement('span');
      typing.className = 'ait-typing';
      typing.setAttribute('aria-label', '輸入中');
      for (let i = 0; i < 3; i++) typing.appendChild(document.createElement('i'));
      bubble.appendChild(typing);
    } else {
      const body = document.createElement('div');
      body.className = 'ait-bubble-text';
      body.textContent = text || '';
      bubble.appendChild(body);
    }

    if (meta) {
      const m = document.createElement('div');
      m.className = 'ait-bubble-meta';
      m.textContent = meta;
      bubble.appendChild(m);
    }

    row.appendChild(face);
    row.appendChild(bubble);
    return row;
  }

  function scrollThreadBottom() {
    const thread = $('ait-thread');
    if (!thread) return;
    requestAnimationFrame(function () {
      thread.scrollTop = thread.scrollHeight;
    });
  }

  function renderChat(items, opts) {
    const thread = $('ait-thread');
    if (!thread) return;
    thread.textContent = '';
    const list = Array.isArray(items) ? items.slice() : [];
    list.sort(function (a, b) {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

    if (!list.length && !(opts && opts.showTyping)) {
      const empty = document.createElement('div');
      empty.className = 'ait-empty';
      empty.textContent = '跟 AI婷婷打聲招呼吧\n例如：進件期數怎麼算？獎金補助要帶哪些資料？';
      thread.appendChild(empty);
      return;
    }

    list.forEach(function (it) {
      thread.appendChild(
        makeMsg('user', it.question || '', fmtTime(it.createdAt), { id: it.id })
      );

      if (it.status === 'answered') {
        thread.appendChild(
          makeMsg('bot', it.answer || '（無內容）', 'AI婷婷 · ' + fmtTime(it.answeredAt || it.createdAt), {
            id: it.id + '-a',
          })
        );
        const staffAns = String(it.staffAnswer || '').trim();
        if (staffAns) {
          const who = String(it.staffRepliedBy || '人工').trim() || '人工';
          thread.appendChild(
            makeMsg('bot', staffAns, who + ' · ' + fmtTime(it.staffRepliedAt || it.answeredAt || it.createdAt), {
              id: it.id + '-staff',
            })
          );
        }
      } else if (it.status === 'failed') {
        thread.appendChild(
          makeMsg('bot', '回覆失敗，請稍後再問或直接問行政。', 'AI婷婷', { id: it.id + '-a' })
        );
      } else if (String(it.id) === String(pendingId) || it.status === 'pending') {
        thread.appendChild(
          makeMsg('bot', '', 'AI婷婷 回覆中…', { id: it.id + '-a', pending: true, typing: true })
        );
      }
    });

    if (opts && opts.showTyping && !pendingId) {
      thread.appendChild(makeMsg('bot', '', 'AI婷婷 回覆中…', { typing: true, pending: true }));
    }
    scrollThreadBottom();
  }

  function renderActiveThread() {
    const s = activeSession();
    renderChat(s ? s.items : []);
  }

  function renderHistList() {
    const box = $('ait-hist-list');
    if (!box) return;
    const q = String(searchQ || '').trim().toLowerCase();
    const list = store.sessions.filter(function (s) {
      if (!q) return true;
      const blob = [s.title].concat((s.items || []).map(function (it) {
        return String(it.question || '') + ' ' + String(it.answer || '');
      })).join(' ').toLowerCase();
      return blob.indexOf(q) >= 0;
    });
    box.textContent = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'ait-hist-empty';
      empty.textContent = q ? '找不到符合的對話' : '尚無歷史對話';
      box.appendChild(empty);
      return;
    }
    list.forEach(function (s) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ait-hist-item' + (s.id === store.activeId ? ' is-on' : '');
      btn.setAttribute('role', 'listitem');
      btn.dataset.sessionId = s.id;
      const title = document.createElement('span');
      title.className = 'ait-hist-title';
      title.textContent = s.title || '新聊天';
      const meta = document.createElement('span');
      meta.className = 'ait-hist-meta';
      meta.textContent = fmtTime(s.updatedAt) || '';
      btn.appendChild(title);
      btn.appendChild(meta);
      box.appendChild(btn);
    });
  }

  function newChat() {
    const blank = store.sessions.find(function (s) {
      return !(s.items && s.items.length) && s.title === '新聊天';
    });
    if (blank) {
      store.activeId = blank.id;
      touchSession(blank);
    } else {
      const s = { id: uid(), title: '新聊天', updatedAt: new Date().toISOString(), items: [] };
      store.sessions.unshift(s);
      store.activeId = s.id;
      saveStore();
    }
    setStatus('', false);
    renderHistList();
    renderActiveThread();
    const input = $('ait-input');
    if (input) {
      input.focus();
      updateCount();
      autoResize();
    }
    closeSideOnMobile();
  }

  function selectSession(id) {
    if (!id || !store.sessions.some(function (s) { return s.id === id; })) return;
    store.activeId = id;
    saveStore();
    setStatus('', false);
    renderHistList();
    renderActiveThread();
    closeSideOnMobile();
  }

  function closeSideOnMobile() {
    const zoneEl = $('ait-zone');
    const toggle = $('ait-side-toggle');
    if (zoneEl) zoneEl.classList.remove('is-side-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function upsertItemInSession(sessionId, item) {
    const session = store.sessions.find(function (s) { return s.id === sessionId; });
    if (!session) return null;
    const idx = (session.items || []).findIndex(function (it) { return String(it.id) === String(item.id); });
    if (idx >= 0) session.items[idx] = Object.assign({}, session.items[idx], item);
    else session.items = (session.items || []).concat([item]);
    if ((!session.title || session.title === '新聊天') && item.question) {
      session.title = titleFromText(item.question);
    }
    touchSession(session);
    return session;
  }

  async function migrateFromServerIfEmpty() {
    if (migratedOnce) return;
    migratedOnce = true;
    const hasLocalMsgs = store.sessions.some(function (s) { return s.items && s.items.length; });
    if (hasLocalMsgs) return;
    try {
      const data = await api({ action: 'list' });
      const items = Array.isArray(data.items) ? data.items.slice() : [];
      if (!items.length) return;
      items.sort(function (a, b) {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });
      const session = activeSession() || store.sessions[0];
      session.items = items.map(function (it) {
        return {
          id: it.id,
          question: it.question || '',
          answer: it.answer || '',
          staffAnswer: it.staffAnswer || '',
          staffRepliedBy: it.staffRepliedBy || '',
          staffRepliedAt: it.staffRepliedAt || null,
          status: it.status || 'answered',
          createdAt: it.createdAt,
          answeredAt: it.answeredAt,
        };
      });
      session.title = titleFromText(session.items[0] && session.items[0].question) || '先前對話';
      touchSession(session);
    } catch (_) {
      /* 首次遷移失敗就略過，仍用空白新聊天 */
    }
  }

  async function pollOnce() {
    if (!pendingId) return;
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
      const sid = pendingSessionId;
      const qid = pendingId;
      clearPoll();
      setStatus('目前忙線，請稍後再問或直接問行政', true);
      if (sid && qid) {
        upsertItemInSession(sid, { id: qid, status: 'failed' });
        if (store.activeId === sid) renderActiveThread();
        renderHistList();
      }
      return;
    }
    try {
      const data = await api({ action: 'get', questionId: pendingId });
      const sid = pendingSessionId;
      const qid = pendingId;
      if (data.status === 'answered') {
        clearPoll();
        setStatus('', false);
        upsertItemInSession(sid, {
          id: qid,
          question: data.question || undefined,
          answer: data.answer || '',
          staffAnswer: data.staffAnswer || '',
          staffRepliedBy: data.staffRepliedBy || '',
          staffRepliedAt: data.staffRepliedAt || null,
          status: 'answered',
          answeredAt: data.answeredAt || new Date().toISOString(),
        });
        if (store.activeId === sid) renderActiveThread();
        renderHistList();
        return;
      }
      if (data.status === 'failed') {
        clearPoll();
        setStatus('回覆失敗，請稍後再問或直接問行政', true);
        upsertItemInSession(sid, { id: qid, status: 'failed' });
        if (store.activeId === sid) renderActiveThread();
        renderHistList();
      }
    } catch (e) {
      console.warn('[ai-tingting] poll', e);
    }
  }

  function startPoll(questionId, sessionId) {
    clearPoll();
    pendingId = questionId;
    pendingSessionId = sessionId;
    pollStartedAt = Date.now();
    setStatus('AI婷婷 回覆中，約 1～2 分鐘', false);
    pollTimer = setInterval(function () {
      void pollOnce();
    }, POLL_MS);
    void pollOnce();
  }

  function autoResize() {
    const input = $('ait-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 128) + 'px';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!token()) {
      setStatus('請先登入', true);
      syncAuthUi();
      return;
    }
    const input = $('ait-input');
    const btn = $('ait-send');
    const text = String(input?.value || '').trim();
    if (!text) {
      setStatus('請輸入訊息', true);
      return;
    }
    if (text.length > MAX_LEN) {
      setStatus('訊息請勿超過 ' + MAX_LEN + ' 字', true);
      return;
    }
    if (!rateOk()) {
      setStatus('每分鐘最多提問 3 次，請稍後再試', true);
      return;
    }
    if (pendingId) {
      setStatus('請先等待目前這則回覆', true);
      return;
    }

    let session = activeSession();
    if (!session) {
      newChat();
      session = activeSession();
    }
    const sessionId = session.id;
    const localId = 'local-' + Date.now();

    if (btn) btn.disabled = true;
    setStatus('送出中…', false);
    try {
      markAsk();
      upsertItemInSession(sessionId, {
        id: localId,
        question: text,
        answer: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      store.activeId = sessionId;
      saveStore();
      renderHistList();
      renderActiveThread();
      if (input) {
        input.value = '';
        updateCount();
        autoResize();
      }
      const data = await api({
        action: 'ask',
        zone: zone(),
        question: text,
      });
      const qid = data.questionId;
      const sess = store.sessions.find(function (s) { return s.id === sessionId; });
      if (sess) {
        sess.items = (sess.items || []).map(function (it) {
          if (String(it.id) !== String(localId)) return it;
          return Object.assign({}, it, { id: qid, status: 'pending' });
        });
        touchSession(sess);
      }
      startPoll(qid, sessionId);
      renderHistList();
      if (store.activeId === sessionId) renderActiveThread();
    } catch (err) {
      setStatus(err?.message || '送出失敗', true);
      upsertItemInSession(sessionId, { id: localId, status: 'failed' });
      if (store.activeId === sessionId) renderActiveThread();
      renderHistList();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function updateCount() {
    const input = $('ait-input');
    const counter = $('ait-count');
    if (!input || !counter) return;
    const n = String(input.value || '').length;
    counter.textContent = n + ' / ' + MAX_LEN;
    counter.classList.toggle('is-over', n > MAX_LEN);
  }

  function bind() {
    const form = $('ait-form');
    if (form && !form.dataset.aitBound) {
      form.dataset.aitBound = '1';
      form.addEventListener('submit', onSubmit);
    }
    const input = $('ait-input');
    if (input && !input.dataset.aitBound) {
      input.dataset.aitBound = '1';
      input.addEventListener('input', function () {
        updateCount();
        autoResize();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (form) form.requestSubmit();
        }
      });
    }
    const neu = $('ait-new-chat');
    if (neu && !neu.dataset.aitBound) {
      neu.dataset.aitBound = '1';
      neu.addEventListener('click', function () {
        newChat();
      });
    }
    const search = $('ait-search');
    if (search && !search.dataset.aitBound) {
      search.dataset.aitBound = '1';
      search.addEventListener('input', function () {
        searchQ = String(search.value || '');
        renderHistList();
      });
    }
    const hist = $('ait-hist-list');
    if (hist && !hist.dataset.aitBound) {
      hist.dataset.aitBound = '1';
      hist.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-session-id]');
        if (!btn) return;
        selectSession(btn.getAttribute('data-session-id'));
      });
    }
    const toggle = $('ait-side-toggle');
    if (toggle && !toggle.dataset.aitBound) {
      toggle.dataset.aitBound = '1';
      toggle.addEventListener('click', function () {
        const zoneEl = $('ait-zone');
        if (!zoneEl) return;
        const open = zoneEl.classList.toggle('is-side-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
  }

  async function onShow() {
    bind();
    syncAuthUi();
    updateCount();
    autoResize();
    if (!token()) {
      setStatus('請先登入後再使用 AI婷婷', true);
      return;
    }
    setStatus('', false);
    loadStore();
    await migrateFromServerIfEmpty();
    /* 每次進入都開空白新聊天；歷史仍在側欄可點回去 */
    newChat();
  }

  function openFrom(zoneName) {
    const z = zoneName === 'supervisor' ? 'supervisor' : 'admin';
    sessionStorage.setItem(ZONE_KEY, z);
    sessionStorage.setItem(
      BACK_KEY,
      zoneName === 'supervisor' ? 'biz-supervisor'
        : (zoneName === 'rentmgr' ? 'rentmanager' : 'administration')
    );
    if (typeof showPage === 'function') showPage('ai-tingting');
  }

  function init() {
    if (inited) return;
    inited = true;
    bind();
    document.addEventListener('skyfun-auth-ready', function () {
      if (lastActivePageNameIsAi()) void onShow();
    });
  }

  function lastActivePageNameIsAi() {
    try {
      return typeof lastActivePageName !== 'undefined' && lastActivePageName === 'ai-tingting';
    } catch (_) {
      return false;
    }
  }

  window.aiTingtingOpen = openFrom;
  window.aiTingtingInit = function () {
    init();
    void onShow();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
