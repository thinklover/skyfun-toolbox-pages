/**
 * PDF／fontkit／存證信函範本：用到時才載入，避免首頁一次塞進約 2MB 腳本。
 */
(function (global) {
  'use strict';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const abs = new URL(src, document.baseURI).href;
      const existed = document.querySelector('script[data-skyfun-lib="' + abs + '"]');
      if (existed) {
        if (existed.dataset.loaded === '1') return resolve();
        existed.addEventListener('load', () => resolve(), { once: true });
        existed.addEventListener('error', () => reject(new Error('無法載入：' + src)), { once: true });
        return;
      }
      if (
        (src.indexOf('pdf-lib') >= 0 && global.PDFLib) ||
        (src.indexOf('fontkit') >= 0 && global.fontkit) ||
        (src.indexOf('lal-template-b64') >= 0 && global.LAL_TEMPLATE_B64)
      ) {
        return resolve();
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.skyfunLib = abs;
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve();
      };
      s.onerror = () => reject(new Error('無法載入：' + src));
      document.head.appendChild(s);
    });
  }

  let pdfPromise = null;
  global.skyfunEnsurePdfLibs = function skyfunEnsurePdfLibs() {
    if (global.PDFLib && global.fontkit) return Promise.resolve();
    if (pdfPromise) return pdfPromise;
    pdfPromise = (async () => {
      if (!global.PDFLib) await loadScript('./js/vendor/pdf-lib.min.js');
      if (!global.fontkit) await loadScript('./js/vendor/fontkit.umd.js');
      if (!global.PDFLib || !global.fontkit) throw new Error('PDF 套件載入失敗');
    })().catch((err) => {
      pdfPromise = null;
      throw err;
    });
    return pdfPromise;
  };

  let tplPromise = null;
  global.skyfunEnsureLalTemplate = function skyfunEnsureLalTemplate() {
    if (global.LAL_TEMPLATE_B64) return Promise.resolve();
    if (tplPromise) return tplPromise;
    tplPromise = loadScript('./js/lal-template-b64.js').catch((err) => {
      tplPromise = null;
      throw err;
    });
    return tplPromise;
  };
})(typeof window !== 'undefined' ? window : globalThis);
