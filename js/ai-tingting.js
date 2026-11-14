/**
 * AI婷婷 問答（聊天介面；行政／業務主管專區共用）
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

  let pollTimer = null;
  let pollStartedAt = 0;
  let pendingId = null;
  let askTimes = [];
  let inited = false;
  let chatItems = [];

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

  function zone() {
    const z = sessionStorage.getItem(ZONE_KEY);
    return z === 'supervisor' ? 'supervisor' : 'admin';
  }

  function backPage() {
    const b = sessionStorage.getItem(BACK_KEY);
    if (b === 'biz-supervisor' || b === 'administration') return b;
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

  function clearPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    pendingId = null;
    pollStartedAt = 0;
  }

  function rateOk() {
    const now = Date.now();
    askTimes = askTimes.filter((t) => now - t < RATE_WINDOW_MS);
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
    const { url, anonKey } = cfg();
    if (!url || !anonKey) throw new Error('尚未設定 Supabase');
    const t = token();
    if (!t && body.action !== 'answer') throw new Error('請先登入');
    const payload = Object.assign({}, body);
    if (t) payload.token = t;

    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url + FN_PATH, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            // 與其他 Edge Function 相同：gateway 用 anon JWT；工具箱 session 放 body.token
            Authorization: 'Bearer ' + anonKey,
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
        // 業務錯誤（已有 HTTP 回應）直接拋出，不重試、不改寫訊息
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
      back.textContent = bp === 'biz-supervisor' ? '← 返回業務主管專區' : '← 返回行政專區';
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
    // 聊天：由舊到新
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

  async function refreshHistory() {
    const data = await api({ action: 'list' });
    chatItems = data.items || [];
    renderChat(chatItems);
  }

  async function pollOnce() {
    if (!pendingId) return;
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
      clearPoll();
      setStatus('目前忙線，請稍後再問或直接問行政', true);
      try {
        await refreshHistory();
      } catch (_) {
        /* ignore */
      }
      return;
    }
    try {
      const data = await api({ action: 'get', questionId: pendingId });
      if (data.status === 'answered') {
        clearPoll();
        setStatus('', false);
        await refreshHistory();
        return;
      }
      if (data.status === 'failed') {
        clearPoll();
        setStatus('回覆失敗，請稍後再問或直接問行政', true);
        await refreshHistory();
      }
    } catch (e) {
      console.warn('[ai-tingting] poll', e);
    }
  }

  function startPoll(questionId) {
    clearPoll();
    pendingId = questionId;
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

    if (btn) btn.disabled = true;
    setStatus('送出中…', false);
    try {
      markAsk();
      // 先樂觀顯示自己的訊息
      chatItems = chatItems.concat([{
        id: 'local-' + Date.now(),
        question: text,
        answer: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      }]);
      renderChat(chatItems);
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
      startPoll(data.questionId);
      await refreshHistory();
    } catch (err) {
      setStatus(err?.message || '送出失敗', true);
      try {
        await refreshHistory();
      } catch (_) {
        /* ignore */
      }
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
    try {
      await refreshHistory();
    } catch (e) {
      setStatus(e?.message || '無法載入對話', true);
    }
  }

  function openFrom(zoneName) {
    const z = zoneName === 'supervisor' ? 'supervisor' : 'admin';
    sessionStorage.setItem(ZONE_KEY, z);
    sessionStorage.setItem(BACK_KEY, z === 'supervisor' ? 'biz-supervisor' : 'administration');
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
