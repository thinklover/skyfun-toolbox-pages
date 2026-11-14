/**
 * AI婷婷 問答（行政／業務主管專區共用）
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

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('zh-TW', { hour12: false });
    } catch {
      return String(iso);
    }
  }

  function statusLabel(s) {
    if (s === 'answered') return '已回覆';
    if (s === 'failed') return '失敗';
    if (s === 'pending') return '回覆中';
    return s || '';
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

  async function api(body) {
    const { url, anonKey } = cfg();
    if (!url || !anonKey) throw new Error('尚未設定 Supabase');
    const t = token();
    if (!t && body.action !== 'answer') throw new Error('請先登入');
    const res = await fetch(url + FN_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: 'Bearer ' + t,
      },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok || !data?.ok) {
      throw new Error((data && data.error) || ('請求失敗（' + res.status + '）'));
    }
    return data;
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

  function renderHistory(items) {
    const list = $('ait-history');
    if (!list) return;
    list.textContent = '';
    if (!items || !items.length) {
      const empty = document.createElement('p');
      empty.className = 'ait-empty';
      empty.textContent = '尚無近期問答';
      list.appendChild(empty);
      return;
    }
    items.forEach(function (it) {
      const card = document.createElement('article');
      card.className = 'ait-item';
      card.dataset.id = it.id;

      const meta = document.createElement('div');
      meta.className = 'ait-item-meta';
      const badge = document.createElement('span');
      badge.className = 'ait-badge ait-badge--' + (it.status || 'pending');
      badge.textContent = statusLabel(it.status);
      const time = document.createElement('time');
      time.textContent = fmtDate(it.createdAt);
      meta.appendChild(badge);
      meta.appendChild(time);

      const qLabel = document.createElement('div');
      qLabel.className = 'ait-item-label';
      qLabel.textContent = '你的問題';
      const qBody = document.createElement('p');
      qBody.className = 'ait-item-q';
      qBody.textContent = it.question || '';

      const aLabel = document.createElement('div');
      aLabel.className = 'ait-item-label';
      aLabel.textContent = 'AI婷婷';
      const aBody = document.createElement('p');
      aBody.className = 'ait-item-a';
      if (it.status === 'answered') {
        aBody.textContent = it.answer || '（無內容）';
      } else if (it.status === 'failed') {
        aBody.textContent = '回覆失敗，請稍後再問或直接問行政。';
      } else {
        aBody.textContent = '回覆中…';
      }

      card.appendChild(meta);
      card.appendChild(qLabel);
      card.appendChild(qBody);
      card.appendChild(aLabel);
      card.appendChild(aBody);
      list.appendChild(card);
    });
  }

  async function refreshHistory() {
    const data = await api({ action: 'list' });
    renderHistory(data.items || []);
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
        setStatus('AI婷婷 已回覆', false);
        await refreshHistory();
        return;
      }
      if (data.status === 'failed') {
        clearPoll();
        setStatus('回覆失敗，請稍後再問或直接問行政', true);
        await refreshHistory();
      }
    } catch (e) {
      /* 輪詢短暫失敗不中斷 */
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
      setStatus('請輸入問題', true);
      return;
    }
    if (text.length > MAX_LEN) {
      setStatus('問題請勿超過 ' + MAX_LEN + ' 字', true);
      return;
    }
    if (!rateOk()) {
      setStatus('每分鐘最多提問 3 次，請稍後再試', true);
      return;
    }
    if (pendingId) {
      setStatus('請先等待目前這題回覆完成', true);
      return;
    }

    if (btn) btn.disabled = true;
    setStatus('送出中…', false);
    try {
      markAsk();
      const data = await api({
        action: 'ask',
        zone: zone(),
        question: text,
      });
      if (input) input.value = '';
      updateCount();
      startPoll(data.questionId);
      await refreshHistory();
    } catch (err) {
      setStatus(err?.message || '送出失敗', true);
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
      input.addEventListener('input', updateCount);
    }
  }

  async function onShow() {
    bind();
    syncAuthUi();
    updateCount();
    if (!token()) {
      setStatus('請先登入後再使用 AI婷婷', true);
      return;
    }
    setStatus('', false);
    try {
      await refreshHistory();
    } catch (e) {
      setStatus(e?.message || '無法載入紀錄', true);
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
      if (lastActivePageNameIsAi()) {
        void onShow();
      }
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
