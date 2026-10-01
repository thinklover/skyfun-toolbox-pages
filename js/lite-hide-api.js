/**
 * GitHub Pages 靜態版：隱藏需 Express API 的功能
 */
(function () {
  'use strict';

  const HIDE_PAGE_IDS = [
    'collection-dial',
    'retell',
    'business-qa',
    'business-qa-chat',
    'newbie-quest'
  ];

  const HIDE_TEXT = [
    '業績任務板',
    '任務板',
    'AI 催收',
    '催收撥號',
    'Retell',
    '業務問答',
    'AI 問答'
  ];

  const HIDE_SELECTORS = ['#bqa-fab', '#bqa-root', '#business-qa-root', '[data-api-only="1"]'];

  function hideEl(el) {
    if (!el) return;
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('pages-lite-hidden');
  }

  function run() {
    document.body.classList.add('toolbox-pages-lite', 'toolbox-pages-static');

    HIDE_PAGE_IDS.forEach((id) => {
      hideEl(document.getElementById(`page-${id}`));
      hideEl(document.getElementById(id));
      document.querySelectorAll(`[onclick*="showPage('${id}')"], [onclick*='showPage("${id}")']`).forEach(hideEl);
      document.querySelectorAll(`a[href="#${id}"]`).forEach(hideEl);
    });

    HIDE_SELECTORS.forEach((sel) => document.querySelectorAll(sel).forEach(hideEl));

    document.querySelectorAll('button, a, .card, .menu-item, .tool-card, .nb-hub-tile, .practice-hub-card').forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (HIDE_TEXT.some((k) => t.includes(k))) hideEl(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
