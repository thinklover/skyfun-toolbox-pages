/**
 * 租賃管理部月報｜以原檔 PPT 為模板直接改字（不用白底蓋字）。
 * 依賴 JSZip（admin-deck／頁面需先載入 js/vendor/jszip.min.js）。
 */
(function (root) {
  'use strict';

  const TEMPLATE_URL = '../assets/rentmgr-report/template-09.pptx';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function replaceAll(xml, from, to) {
    if (!from || from === to) return xml;
    return String(xml).split(from).join(to);
  }

  /** 在 slide XML 的 <a:t> 文字節點內替換（保留其餘標記） */
  function patchSlideTexts(xml, pairs) {
    let out = xml;
    (pairs || []).forEach(function (p) {
      if (!p || !p.from) return;
      out = replaceAll(out, p.from, p.to == null ? '' : String(p.to));
    });
    return out;
  }

  function coverPatches(opts) {
    const year = Number(opts.year) || new Date().getFullYear();
    const month = Number(opts.month) || 1;
    const reporter = String(opts.reporter || '').trim() || '—';
    const reportDate = String(opts.reportDate || '').trim();
    const ymd = reportDate || (year + '/' + pad2(month) + '/' + pad2(new Date(year, month, 0).getDate()));
    return [
      /* 原檔封面誤為續約修繕部 → 改租賃管理部 */
      { from: '續約修繕部報告', to: '租賃管理部報告' },
      { from: '續約修繕部', to: '租賃管理部' },
      { from: '報告人: 邱奕棋', to: '報告人: ' + reporter },
      { from: '報告人：邱奕棋', to: '報告人：' + reporter },
      { from: '報告日期:2026/07/31', to: '報告日期:' + ymd },
      { from: '報告日期：2026/07/31', to: '報告日期：' + ymd },
      { from: '2026/07', to: year + '/' + pad2(month) },
      { from: '月/月報', to: '月月報' }
    ];
  }

  function ensureJSZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    return Promise.reject(new Error('JSZip 未載入'));
  }

  /**
   * 複製原檔模板，直接改封面文字後回傳 Blob。
   * @param {{year:number,month:number,reporter?:string,reportDate?:string}} opts
   */
  function buildFromTemplate(opts) {
    return ensureJSZip().then(function (JSZip) {
      return fetch(TEMPLATE_URL + '?v=20261026-tpl1', { credentials: 'omit' }).then(function (res) {
        if (!res.ok) throw new Error('無法載入月報原檔模板');
        return res.arrayBuffer();
      }).then(function (buf) {
        return JSZip.loadAsync(buf);
      }).then(function (zip) {
        const slidePath = 'ppt/slides/slide1.xml';
        const f = zip.file(slidePath);
        if (!f) throw new Error('模板缺少封面投影片');
        return f.async('string').then(function (xml) {
          const next = patchSlideTexts(xml, coverPatches(opts || {}));
          zip.file(slidePath, next);
          return zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          });
        });
      });
    });
  }

  root.RentmgrReportTemplate = {
    TEMPLATE_URL: TEMPLATE_URL,
    buildFromTemplate: buildFromTemplate,
    coverPatches: coverPatches
  };
})(typeof window !== 'undefined' ? window : globalThis);
