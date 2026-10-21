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

  /** 展開／收合前後鎖住捲動位置，避免瀏覽器把焦點或 details 捲到畫面外 */
  function preserveScrollAround(fn) {
    const y = window.scrollY;
    const x = window.scrollX;
    try {
      if (typeof fn === 'function') fn();
    } finally {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (Math.abs(window.scrollY - y) > 1 || Math.abs(window.scrollX - x) > 1) {
            window.scrollTo({ top: y, left: x, behavior: 'auto' });
          }
        });
      });
    }
  }

  /** 相容舊呼叫；依全站規則不再自動捲動 */
  function reveal() { /* no-op */ }

  document.addEventListener(
    'toggle',
    (e) => {
      if (!(e.target instanceof HTMLDetailsElement)) return;
      const y = window.scrollY;
      const x = window.scrollX;
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - y) > 1 || Math.abs(window.scrollX - x) > 1) {
          window.scrollTo({ top: y, left: x, behavior: 'auto' });
        }
      });
    },
    true
  );

  window.addEventListener('resize', syncPadding, { passive: true });
  document.addEventListener('DOMContentLoaded', syncPadding);
  syncPadding();

  window.Reveal = reveal;
  window.skyfunPreserveScroll = preserveScrollAround;
})();
