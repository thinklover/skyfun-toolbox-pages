/**
 * AI婷婷 問答（ChatGPT 式側欄歷史；本機多對話；行政／業務主管共用）
 */
(function () {
  'use strict';

  const MAX_LEN = 500;
  const MAX_IMAGES = 4;
  const RATE_LIMIT = 3;
  const RATE_WINDOW_MS = 60 * 1000;
  const POLL_MS = 5000;
  const POLL_MAX_MS = 5 * 60 * 1000;
  const FN_PATH = '/functions/v1/ai-tingting';
  const ZONE_KEY = 'ai-tingting-zone';
  const BACK_KEY = 'ai-tingting-back';
  const STORE_PREFIX = 'skyfun-ait-chats-v1:';
  const IMG_URL_RE = /^https:\/\/line-bridge-tingting\.dahwork123\.workers\.dev\/img\/[A-Za-z0-9_-]{32,64}(?:_p)?\.(?:jpg|jpeg|png)$/;

  let pollTimer = null;
  let pollStartedAt = 0;
  let pendingId = null;
  let pendingSessionId = null;
  let askTimes = [];
  let inited = false;
  let store = { activeId: '', sessions: [] };
  let searchQ = '';
  let migratedOnce = false;
  let lbEl = null;
  let lbState = { images: [], index: 0, zoomed: false, returnFocus: null };

  /* 安全 linkify：以 DOM 組裝，只把 https:// 網址轉成連結，其餘一律當純文字 */
  const LINK_RE = /https:\/\/[^\s<>"'`\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]+/g;
  const LINK_TRAIL_RE = /[.,;:!?)\]}'"]+$/;
  function appendLinkified(parent, text) {
    const s = String(text == null ? '' : text);
    let last = 0;
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(s))) {
      let url = m[0];
      const trail = url.match(LINK_TRAIL_RE);
      if (trail) url = url.slice(0, url.length - trail[0].length);
      let ok = false;
      try { ok = url.length > 8 && new URL(url).protocol === 'https:'; } catch (e) { ok = false; }
      if (!ok) continue;
      if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'ait-link';
      a.textContent = url;
      parent.appendChild(a);
      last = m.index + url.length;
      LINK_RE.lastIndex = last;
    }
    if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last)));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function normalizeImages(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i++) {
      const it = raw[i];
      if (!it || typeof it !== 'object') continue;
      const url = String(it.url || '').trim();
      if (!IMG_URL_RE.test(url)) continue;
      const prevRaw = String(it.previewUrl || '').trim();
      const previewUrl = prevRaw && IMG_URL_RE.test(prevRaw) ? prevRaw : url;
      const alt = String(it.alt || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
      out.push({ url: url, previewUrl: previewUrl, alt: alt });
      if (out.length >= MAX_IMAGES) break;
    }
    return out;
  }

  function imagesEqual(a, b) {
    const la = normalizeImages(a);
    const lb = normalizeImages(b);
    if (la.length !== lb.length) return false;
    for (let i = 0; i < la.length; i++) {
      if (la[i].url !== lb[i].url || la[i].previewUrl !== lb[i].previewUrl || la[i].alt !== lb[i].alt) {
        return false;
      }
    }
    return true;
  }

  function ensureLightbox() {
    if (lbEl && document.body.contains(lbEl)) return lbEl;
    const root = document.createElement('div');
    root.className = 'ait-lightbox hidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '圖片放大檢視');

    const bar = document.createElement('div');
    bar.className = 'ait-lb-bar';

    const meta = document.createElement('div');
    meta.className = 'ait-lb-meta';
    const counter = document.createElement('span');
    counter.className = 'ait-lb-count';
    const cap = document.createElement('span');
    cap.className = 'ait-lb-cap';
    meta.appendChild(counter);
    meta.appendChild(cap);

    const actions = document.createElement('div');
    actions.className = 'ait-lb-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'ait-lb-btn ait-lb-zoom';
    zoomBtn.textContent = '放大原尺寸';

    const origLink = document.createElement('a');
    origLink.className = 'ait-lb-btn ait-lb-orig';
    origLink.target = '_blank';
    origLink.rel = 'noopener noreferrer';
    origLink.textContent = '開新分頁看原圖';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ait-lb-btn ait-lb-close';
    closeBtn.setAttribute('aria-label', '關閉圖片檢視');
    closeBtn.textContent = '✕ 關閉';

    actions.appendChild(zoomBtn);
    actions.appendChild(origLink);
    actions.appendChild(closeBtn);
    bar.appendChild(meta);
    bar.appendChild(actions);

    const stage = document.createElement('div');
    stage.className = 'ait-lb-stage';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'ait-lb-nav ait-lb-prev';
    prevBtn.setAttribute('aria-label', '上一張');
    prevBtn.textContent = '‹';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'ait-lb-nav ait-lb-next';
    nextBtn.setAttribute('aria-label', '下一張');
    nextBtn.textContent = '›';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'ait-lb-img-wrap';

    const img = document.createElement('img');
    img.className = 'ait-lb-img';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    imgWrap.appendChild(img);

    stage.appendChild(prevBtn);
    stage.appendChild(imgWrap);
    stage.appendChild(nextBtn);

    root.appendChild(bar);
    root.appendChild(stage);

    function toggleZoom() {
      lbState.zoomed = !lbState.zoomed;
      imgWrap.classList.toggle('is-zoomed', lbState.zoomed);
      zoomBtn.textContent = lbState.zoomed ? '符合視窗' : '放大原尺寸';
    }

    zoomBtn.addEventListener('click', toggleZoom);
    img.addEventListener('click', toggleZoom);
    closeBtn.addEventListener('click', closeLightbox);
    prevBtn.addEventListener('click', function () {
      if (lbState.images.length <= 1) return;
      lbState.index = (lbState.index - 1 + lbState.images.length) % lbState.images.length;
      renderLightbox();
    });
    nextBtn.addEventListener('click', function () {
      if (lbState.images.length <= 1) return;
      lbState.index = (lbState.index + 1) % lbState.images.length;
      renderLightbox();
    });
    stage.addEventListener('click', function (e) {
      if (e.target === stage || e.target === imgWrap) closeLightbox();
    });
    root.addEventListener('click', function (e) {
      if (e.target === root) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (!lbEl || lbEl.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowLeft' && lbState.images.length > 1) {
        e.preventDefault();
        lbState.index = (lbState.index - 1 + lbState.images.length) % lbState.images.length;
        renderLightbox();
      } else if (e.key === 'ArrowRight' && lbState.images.length > 1) {
        e.preventDefault();
        lbState.index = (lbState.index + 1) % lbState.images.length;
        renderLightbox();
      }
    });

    document.body.appendChild(root);
    lbEl = root;
    return lbEl;
  }

  function renderLightbox() {
    if (!lbEl || !lbState.images.length) return;
    const item = lbState.images[lbState.index] || lbState.images[0];
    const img = lbEl.querySelector('.ait-lb-img');
    const imgWrap = lbEl.querySelector('.ait-lb-img-wrap');
    const zoomBtn = lbEl.querySelector('.ait-lb-zoom');
    const origLink = lbEl.querySelector('.ait-lb-orig');
    const counter = lbEl.querySelector('.ait-lb-count');
    const cap = lbEl.querySelector('.ait-lb-cap');
    const prevBtn = lbEl.querySelector('.ait-lb-prev');
    const nextBtn = lbEl.querySelector('.ait-lb-next');

    lbState.zoomed = false;
    if (imgWrap) {
      imgWrap.classList.remove('is-zoomed');
      imgWrap.scrollTop = 0;
      imgWrap.scrollLeft = 0;
    }
    if (zoomBtn) zoomBtn.textContent = '放大原尺寸';
    if (img) {
      img.src = item.url;
      img.alt = item.alt || 'AI婷婷附圖';
    }
    if (origLink) origLink.href = item.url;
    if (counter) {
      counter.textContent = lbState.images.length > 1
        ? ((lbState.index + 1) + ' / ' + lbState.images.length)
        : '';
      counter.classList.toggle('hidden', lbState.images.length <= 1);
    }
    if (cap) cap.textContent = item.alt || '';
    const multi = lbState.images.length > 1;
    if (prevBtn) prevBtn.classList.toggle('hidden', !multi);
    if (nextBtn) nextBtn.classList.toggle('hidden', !multi);
  }

  function openLightbox(images, startIndex) {
    const safe = normalizeImages(images);
    if (!safe.length) return;
    const el = ensureLightbox();
    lbState.images = safe;
    lbState.index = Math.max(0, Math.min(startIndex || 0, safe.length - 1));
    lbState.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    renderLightbox();
    el.classList.remove('hidden');
    document.body.classList.add('ait-lb-open');
    const closeBtn = el.querySelector('.ait-lb-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!lbEl) return;
    lbEl.classList.add('hidden');
    document.body.classList.remove('ait-lb-open');
    const rf = lbState.returnFocus;
    lbState.returnFocus = null;
    if (rf && document.body.contains(rf)) {
      try { rf.focus(); } catch (_) {}
    }
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

  function buildImagesNode(images) {
    const safe = normalizeImages(images);
    if (!safe.length) return null;
    const grid = document.createElement('div');
    grid.className = 'ait-bubble-images';
    grid.dataset.count = safe.length === 1 ? '1' : 'multi';

    safe.forEach(function (item, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ait-img-btn';
      btn.setAttribute('aria-label', item.alt ? ('放大檢視圖片：' + item.alt) : '放大檢視圖片');

      const frame = document.createElement('span');
      frame.className = 'ait-img-frame';

      const img = document.createElement('img');
      img.className = 'ait-img-thumb';
      img.src = item.previewUrl || item.url;
      img.alt = item.alt || 'AI婷婷附圖';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';

      img.addEventListener('load', function () {
        const t = $('ait-thread');
        if (t && (t.scrollHeight - t.scrollTop - t.clientHeight) < 360) {
          scrollThreadBottom();
        }
      });

      let triedFallback = img.src === item.url;
      img.addEventListener('error', function () {
        if (!triedFallback && item.url) {
          triedFallback = true;
          img.src = item.url;
          return;
        }
        btn.classList.add('is-err');
        if (!frame.querySelector('.ait-img-err')) {
          const errNote = document.createElement('span');
          errNote.className = 'ait-img-err';
          errNote.textContent = '圖片載入失敗，點擊查看原圖';
          frame.appendChild(errNote);
        }
      });

      const hint = document.createElement('span');
      hint.className = 'ait-img-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '點擊放大';

      frame.appendChild(img);
      frame.appendChild(hint);
      btn.appendChild(frame);

      if (item.alt) {
        const cap = document.createElement('span');
        cap.className = 'ait-img-cap';
        cap.textContent = item.alt;
        btn.appendChild(cap);
      }

      btn.addEventListener('click', function () {
        openLightbox(safe, idx);
      });

      grid.appendChild(btn);
    });

    return grid;
  }

  function makeMsg(role, text, meta, opts) {
    const row = document.createElement('div');
    row.className = 'ait-msg ait-msg--' + role + (opts && opts.staff ? ' ait-msg--staff' : '');
    if (opts && opts.id) row.dataset.id = opts.id;
    if (opts && opts.pending) row.dataset.pending = '1';

    const face = document.createElement('span');
    face.className = 'ait-msg-face';
    face.setAttribute('aria-hidden', 'true');
    face.textContent = role === 'user' ? '我' : (opts && opts.staff ? '👤' : '🤖');

    const bubble = document.createElement('div');
    bubble.className = 'ait-bubble';

    if (opts && opts.typing) {
      const typing = document.createElement('span');
      typing.className = 'ait-typing';
      typing.setAttribute('aria-label', '輸入中');
      for (let i = 0; i < 3; i++) typing.appendChild(document.createElement('i'));
      bubble.appendChild(typing);
    } else {
      const imagesNode = (role === 'bot' && !(opts && opts.staff) && opts && opts.images)
        ? buildImagesNode(opts.images)
        : null;
      const bodyText = String(text || '');
      if (bodyText || !imagesNode) {
        const body = document.createElement('div');
        body.className = 'ait-bubble-text';
        appendLinkified(body, bodyText);
        bubble.appendChild(body);
      }
      if (imagesNode) {
        bubble.appendChild(imagesNode);
      }
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
        const imgs = normalizeImages(it.images);
        const answerText = it.answer || (imgs.length ? '' : '（無內容）');
        thread.appendChild(
          makeMsg('bot', answerText, 'AI婷婷 · ' + fmtTime(it.answeredAt || it.createdAt), {
            id: it.id + '-a',
            images: imgs,
          })
        );
        const staffAns = String(it.staffAnswer || '').trim();
        if (staffAns) {
          const who = String(it.staffRepliedBy || '人工').trim() || '人工';
          thread.appendChild(
            makeMsg('bot', staffAns, '人工回覆｜' + who + ' · ' + fmtTime(it.staffRepliedAt || it.answeredAt || it.createdAt), {
              id: it.id + '-staff',
              staff: true,
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
        const imgAlts = normalizeImages(it.images).map(function (im) { return im.alt; }).join(' ');
        return String(it.question || '') + ' ' + String(it.answer || '') + ' ' + imgAlts + ' ' + String(it.staffAnswer || '');
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

  function mapServerItem(it) {
    return {
      id: it.id,
      question: it.question || '',
      answer: it.answer || '',
      images: normalizeImages(it.images),
      staffAnswer: it.staffAnswer || '',
      staffRepliedBy: it.staffRepliedBy || '',
      staffRepliedAt: it.staffRepliedAt || null,
      status: it.status || 'answered',
      createdAt: it.createdAt,
      answeredAt: it.answeredAt,
    };
  }

  /** 把伺服器最新的 AI／附圖／人工回覆併回本機對話（人工回覆多半是事後補上） */
  function mergeServerItems(serverItems) {
    const byId = new Map();
    (serverItems || []).forEach(function (it) {
      if (it && it.id != null) byId.set(String(it.id), mapServerItem(it));
    });
    if (!byId.size) return false;
    let changed = false;
    store.sessions.forEach(function (session) {
      (session.items || []).forEach(function (local, idx) {
        const remote = byId.get(String(local.id));
        if (!remote) return;
        const next = Object.assign({}, local, {
          question: remote.question || local.question,
          answer: remote.answer || local.answer,
          images: remote.images,
          staffAnswer: remote.staffAnswer || '',
          staffRepliedBy: remote.staffRepliedBy || '',
          staffRepliedAt: remote.staffRepliedAt || null,
          status: remote.status || local.status,
          answeredAt: remote.answeredAt || local.answeredAt,
        });
        if (
          next.answer !== local.answer ||
          !imagesEqual(next.images, local.images) ||
          next.staffAnswer !== (local.staffAnswer || '') ||
          next.staffRepliedBy !== (local.staffRepliedBy || '') ||
          String(next.staffRepliedAt || '') !== String(local.staffRepliedAt || '') ||
          next.status !== local.status
        ) {
          session.items[idx] = next;
          changed = true;
        }
        byId.delete(String(local.id));
      });
    });
    // 本機完全沒有對話時，把伺服器紀錄一次灌進目前／新聊天
    const hasLocalMsgs = store.sessions.some(function (s) { return s.items && s.items.length; });
    if (!hasLocalMsgs && byId.size) {
      const items = Array.from(byId.values()).sort(function (a, b) {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      });
      const session = activeSession() || store.sessions[0];
      if (session) {
        session.items = items;
        session.title = titleFromText(items[0] && items[0].question) || '先前對話';
        touchSession(session);
        return true;
      }
    }
    if (changed) saveStore();
    return changed;
  }

  async function syncFromServer() {
    try {
      const data = await api({ action: 'list' });
      const items = Array.isArray(data.items) ? data.items.slice() : [];
      if (!items.length) return false;
      return mergeServerItems(items);
    } catch (_) {
      return false;
    }
  }

  async function migrateFromServerIfEmpty() {
    if (migratedOnce) return;
    migratedOnce = true;
    await syncFromServer();
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
          images: normalizeImages(data.images),
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
        images: [],
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
    await syncFromServer();
    renderHistList();
    /* 每次進入都開空白新聊天；歷史仍在側欄可點回去（點進去會看到已同步的人工回覆） */
    newChat();
  }

  function openFrom(zoneName) {
    /* 後端 zone 僅 admin／supervisor；租管師入口仍走 admin 知識庫，返回鍵回租管師專區 */
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
