/**
 * 全站展開：點擊只展開、不自動捲動跳頁。
 * 仍同步 scroll-padding，避免錨點連到固定頂欄後方。
 */
(function () {
  'use strict';

  const GAP = 12;
  const root = document.documentElement;

  function topBarHeight() {
    let h = 0;
    document.querySelectorAll('.app-chrome, .gc-top').forEach((el) => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
      h = Math.max(h, el.getBoundingClientRect().height);
    });
    return h;
  }

  function syncPadding() {
    const h = topBarHeight();
    root.style.scrollPaddingTop = `${Math.round(h + GAP)}px`;
    return h;
  }

  /** 相容舊呼叫；依全站規則不再自動捲動 */
  function reveal() { /* no-op */ }

  window.addEventListener('resize', syncPadding, { passive: true });
  document.addEventListener('DOMContentLoaded', syncPadding);
  syncPadding();

  window.Reveal = reveal;
})();
