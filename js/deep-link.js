/**
 * 深連結：?page=<頁面代號>#<錨點>
 * - 等工具箱登入（skyfun-auth-ready）後才切頁，避免權限頁在登入前被彈回首頁
 * - 錨點只接受英數、底線、連字號；若在收合的 <details> 內會自動展開
 */
(function () {
  'use strict';

  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  const page = String(params.get('page') || '').trim();
  let anchor = '';
  try { anchor = decodeURIComponent(String(location.hash || '').replace(/^#/, '')); } catch (e) { anchor = ''; }
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(anchor)) anchor = '';

  const state = { pending: !!page, page: page, anchor: anchor };
  window.skyfunDeepLink = state;
  if (!page) return;

  function authReady() {
    const a = window.skyfunAuth;
    if (!a || typeof a.isReady !== 'function') return true;
    return !!a.isReady();
  }

  function openDetailsAncestors(el) {
    let p = el.parentElement;
    while (p) {
      if (p.tagName === 'DETAILS' && !p.open) p.open = true;
      p = p.parentElement;
    }
  }

  function scrollToAnchor(id, triesLeft) {
    const el = document.getElementById(id);
    if (el) {
      openDetailsAncestors(el);
      if (el.offsetParent !== null || el.getClientRects().length) {
        const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 72);
        window.scrollTo({ top: top, left: 0, behavior: 'auto' });
        el.classList.add('deep-link-hit');
        setTimeout(function () { el.classList.remove('deep-link-hit'); }, 2200);
        return;
      }
    }
    if (triesLeft > 0) setTimeout(function () { scrollToAnchor(id, triesLeft - 1); }, 150);
  }

  function run() {
    if (!state.pending) return;
    if (!authReady() || typeof window.showPage !== 'function') return;
    state.pending = false;
    window.showPage(state.page);
    if (state.anchor) {
      try {
        const u = new URL(location.href);
        if (u.searchParams.get('page') === state.page) {
          u.hash = state.anchor;
          history.replaceState(history.state, '', u.pathname + u.search + u.hash);
        }
      } catch (e) { /* ignore */ }
      /* 等 showPage 的平滑捲動結束再定位 */
      setTimeout(function () { scrollToAnchor(state.anchor, 12); }, 450);
    }
  }

  state.run = run;
  document.addEventListener('skyfun-auth-ready', function () { setTimeout(run, 0); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 0); });
  } else {
    setTimeout(run, 0);
  }
})();
