/**
 * 全站展開體驗：點開的內容自動捲進視野（只捲最少距離、標題永遠留在畫面上），
 * 並讓所有 scrollIntoView 都避開頂部固定導覽列。
 */
(function () {
  'use strict';

  const GAP = 12;
  const root = document.documentElement;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function scrollerOf(el) {
    for (let p = el.parentElement; p && p !== document.body && p !== root; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }

  /** 讓 el 盡量完整出現在畫面上；太高就對齊頂端。height 可傳入展開後的預估高度 */
  function reveal(el, opts = {}) {
    if (!el?.getBoundingClientRect) return;
    const box = scrollerOf(el);
    const r = el.getBoundingClientRect();
    const height = opts.height ?? r.height;
    let viewTop;
    let viewBottom;
    if (box) {
      const b = box.getBoundingClientRect();
      viewTop = b.top + GAP;
      viewBottom = b.bottom - GAP;
    } else {
      viewTop = syncPadding() + GAP;
      viewBottom = window.innerHeight - GAP;
    }
    let dy = 0;
    if (r.top < viewTop) dy = r.top - viewTop;
    else if (r.top + height > viewBottom) dy = Math.min(r.top + height - viewBottom, r.top - viewTop);
    if (Math.abs(dy) < 2) return;
    (box || window).scrollBy({ top: dy, left: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  let summaryClick = null;
  window.addEventListener(
    'click',
    (e) => {
      syncPadding();
      const summary = e.target.closest?.('summary');
      summaryClick = summary ? { details: summary.parentElement, at: Date.now() } : null;
    },
    true
  );

  document.addEventListener(
    'toggle',
    (e) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open) return;
      if (!summaryClick || summaryClick.details !== d || Date.now() - summaryClick.at > 1000) return;
      summaryClick = null;
      requestAnimationFrame(() => requestAnimationFrame(() => reveal(d)));
    },
    true
  );

  window.addEventListener('resize', syncPadding, { passive: true });
  document.addEventListener('DOMContentLoaded', syncPadding);

  window.Reveal = reveal;
})();
