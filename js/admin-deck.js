/**
 * 投影片／表格版面：同一份資料同時畫成網頁預覽與 PowerPoint（PptxGenJS）。
 * 單位：英吋（16:9 寬螢幕 13.333 × 7.5）；字級：pt；顏色：不含 # 的 6 碼色號。
 *
 * 表格 { colW:[比例或英吋], rowH?: 英吋或陣列, size?: pt, border?: 色號, rows:[[cell]] }
 *   cell 可以是字串／數字，或 { v, sub, fill, color, bold, cs, rs, size, subSize, align, valign, nw }
 *   合併儲存格（cs/rs）覆蓋到的格子不要放進 rows（同 HTML）。
 * 投影片 { bg?: 圖片網址, blocks:[...] }
 *   { type:'table', x, y, w, table }
 *   { type:'text', x, y, w, h, text, size, color, bold, align, valign, fill, spacing }
 *   { type:'rect', x, y, w, h, fill, line, radius }
 *   { type:'line', x, y, w, color, width }
 *   { type:'image', src, x, y, w, h }
 */
(function (root, factory) {
  root.AdminDeck = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const W = 13.333;
  const H = 7.5;
  const PX = 96;
  const PT = 96 / 72;
  const FONT = 'Microsoft JhengHei';
  const BORDER = 'B7C0CE';
  const PPTX_SRC = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const br = (s) => esc(s).replace(/\n/g, '<br>');
  const norm = (c) => (c && typeof c === 'object' ? c : { v: c });
  const sum = (a) => a.reduce((s, x) => s + x, 0);

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('dk-css')) return;
    const st = document.createElement('style');
    st.id = 'dk-css';
    st.textContent = `
      .dk-deck { display: grid; gap: 1rem; }
      .dk-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 6px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18); background: #fff; }
      .dk-slide { position: absolute; left: 0; top: 0; width: ${W * PX}px; height: ${H * PX}px; transform-origin: 0 0; transform: scale(var(--dk-s, 1)); font-family: '${FONT}', 'Noto Sans TC', sans-serif; color: #1f2937; }
      .dk-slide > * { position: absolute; }
      .dk-bg { left: 0; top: 0; width: 100%; height: 100%; }
      .dk-no { position: absolute; right: 8px; bottom: 6px; font-size: 11px; color: #94a3b8; background: rgba(255,255,255,0.85); padding: 0 6px; border-radius: 999px; }
      .dk-text { display: flex; flex-direction: column; white-space: pre-wrap; line-height: 1.25; box-sizing: border-box; }
      table.dk-table { border-collapse: collapse; table-layout: fixed; font-family: '${FONT}', 'Noto Sans TC', sans-serif; background: #fff; }
      table.dk-table td { box-sizing: border-box; border: 1px solid #${BORDER}; padding: 1px 3px; text-align: center; vertical-align: middle; line-height: 1.15; overflow: hidden; white-space: normal; word-break: break-all; color: #1f2937; }
      table.dk-table td small { display: block; font-weight: 400; line-height: 1.1; }
      table.dk-flow { width: 100%; }
      table.dk-flow td { padding: 3px 5px; }
    `;
    document.head.appendChild(st);
  }

  /* ---------- 網頁 ---------- */

  function cellHtml(raw, size, h) {
    const c = norm(raw);
    const css = [];
    if (c.fill) css.push(`background:#${c.fill}`);
    if (c.color) css.push(`color:#${c.color}`);
    css.push(`font-weight:${c.bold ? 700 : 400}`);
    css.push(`font-size:${((c.size || size) * PT).toFixed(1)}px`);
    if (c.align && c.align !== 'center') css.push(`text-align:${c.align}`);
    if (c.valign) css.push(`vertical-align:${c.valign === 'top' ? 'top' : c.valign === 'bottom' ? 'bottom' : 'middle'}`);
    if (c.nw) css.push('white-space:nowrap');
    if (h) css.push(`height:${h}px`);
    const span = `${c.cs > 1 ? ` colspan="${c.cs}"` : ''}${c.rs > 1 ? ` rowspan="${c.rs}"` : ''}`;
    const sub = c.sub != null && c.sub !== '' ? `<small style="font-size:${((c.subSize || (c.size || size) * 0.72) * PT).toFixed(1)}px">${br(c.sub)}</small>` : '';
    return `<td${span} style="${css.join(';')}">${br(c.v)}${sub}</td>`;
  }

  function rowHeight(t, i) {
    if (Array.isArray(t.rowH)) return t.rowH[i] ?? t.rowH[t.rowH.length - 1];
    return t.rowH;
  }

  /** pos 有值：投影片內絕對定位；沒有：一般網頁表格（寬 100%） */
  function tableHtml(t, pos) {
    injectCss();
    const size = t.size || 9;
    const total = sum(t.colW);
    const cols = t.colW.map((w) => (pos ? `<col style="width:${((w / total) * pos.w * PX).toFixed(2)}px">` : `<col style="width:${((w / total) * 100).toFixed(3)}%">`)).join('');
    const style = pos ? `left:${pos.x * PX}px;top:${pos.y * PX}px;width:${pos.w * PX}px` : '';
    const rows = t.rows
      .map((r, i) => {
        const h = pos && rowHeight(t, i) ? Math.round(rowHeight(t, i) * PX) : 0;
        return `<tr>${r.map((c) => cellHtml(c, size, h)).join('')}</tr>`;
      })
      .join('');
    return `<table class="dk-table${pos ? '' : ' dk-flow'}"${style ? ` style="${style}"` : ''}><colgroup>${cols}</colgroup><tbody>${rows}</tbody></table>`;
  }

  function blockHtml(b) {
    const box = `left:${b.x * PX}px;top:${b.y * PX}px;width:${b.w * PX}px`;
    if (b.type === 'table') return tableHtml(b.table, b);
    if (b.type === 'image') return `<img src="${esc(b.src)}" alt="" style="${box};height:${b.h * PX}px">`;
    if (b.type === 'line') return `<div style="${box};height:0;border-top:${(b.width || 1) * PT}px solid #${b.color || BORDER}"></div>`;
    if (b.type === 'rect') {
      const css = [box, `height:${b.h * PX}px`];
      if (b.fill) css.push(`background:#${b.fill}`);
      if (b.line) css.push(`border:${(b.lineWidth || 1) * PT}px solid #${b.line}`);
      if (b.radius) css.push(`border-radius:${b.radius * PX}px`);
      css.push('box-sizing:border-box');
      return `<div style="${css.join(';')}"></div>`;
    }
    const css = [box, `height:${b.h * PX}px`, `font-size:${((b.size || 12) * PT).toFixed(1)}px`, `font-weight:${b.bold ? 700 : 400}`];
    if (b.color) css.push(`color:#${b.color}`);
    if (b.fill) css.push(`background:#${b.fill}`);
    if (b.spacing) css.push(`letter-spacing:${(b.spacing * PT).toFixed(1)}px`);
    css.push(`text-align:${b.align || 'left'}`);
    css.push(`justify-content:${b.valign === 'top' ? 'flex-start' : b.valign === 'bottom' ? 'flex-end' : 'center'}`);
    if (b.pad) css.push(`padding:0 ${b.pad * PX}px`);
    return `<div class="dk-text" style="${css.join(';')}">${br(b.text)}</div>`;
  }

  function slidesHtml(slides) {
    injectCss();
    return `<div class="dk-deck">${slides
      .map(
        (s, i) => `<div class="dk-frame"><div class="dk-slide">${s.bg ? `<img class="dk-bg" src="${esc(s.bg)}" alt="">` : ''}${s.blocks
          .map(blockHtml)
          .join('')}</div><span class="dk-no">${i + 1} / ${slides.length}</span></div>`
      )
      .join('')}</div>`;
  }

  /** 把投影片畫進 el，並依寬度縮放 */
  function mount(el, slides) {
    el.innerHTML = slidesHtml(slides);
    const fit = () => {
      const f = el.querySelector('.dk-frame');
      if (f) el.style.setProperty('--dk-s', String(f.clientWidth / (W * PX)));
    };
    fit();
    if (!el._dkObserver && typeof ResizeObserver !== 'undefined') {
      el._dkObserver = new ResizeObserver(fit);
      el._dkObserver.observe(el);
    }
  }

  /* ---------- PowerPoint ---------- */

  function loadLib() {
    if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PPTX_SRC;
      s.onload = () => (window.PptxGenJS ? resolve(window.PptxGenJS) : reject(new Error('PPT 元件載入失敗')));
      s.onerror = () => reject(new Error('PPT 元件載入失敗，請檢查網路'));
      document.head.appendChild(s);
    });
  }

  const imgCache = new Map();
  function dataUrl(src) {
    if (typeof src === 'string' && /^data:/i.test(src)) return Promise.resolve(src);
    if (!imgCache.has(src)) {
      imgCache.set(
        src,
        fetch(src)
          .then((r) => {
            if (!r.ok) throw new Error(`圖片讀取失敗：${src}`);
            return r.blob();
          })
          .then(
            (blob) =>
              new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = () => reject(new Error('圖片轉換失敗'));
                fr.readAsDataURL(blob);
              })
          )
      );
    }
    return imgCache.get(src);
  }

  function pptxCell(raw, size, border) {
    const c = norm(raw);
    const fs = c.size || size;
    const opts = {
      bold: !!c.bold,
      fontSize: fs,
      align: c.align || 'center',
      valign: c.valign === 'top' ? 'top' : c.valign === 'bottom' ? 'bottom' : 'middle',
      border: [border, border, border, border],
      margin: [0.02, 0.03, 0.02, 0.03]
    };
    if (c.color) opts.color = c.color;
    if (c.fill) opts.fill = { color: c.fill };
    if (c.cs > 1) opts.colspan = c.cs;
    if (c.rs > 1) opts.rowspan = c.rs;
    const main = String(c.v ?? '');
    if (c.sub != null && c.sub !== '') {
      return {
        text: [
          { text: main, options: { bold: !!c.bold, fontSize: fs, color: c.color, breakLine: true } },
          { text: String(c.sub), options: { bold: false, fontSize: c.subSize || Math.max(5, Math.round(fs * 0.72)), color: c.color } }
        ],
        options: opts
      };
    }
    return { text: main, options: opts };
  }

  async function pptx(slides, fileName) {
    const P = await loadLib();
    const pres = new P();
    pres.layout = 'LAYOUT_WIDE';
    pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
    for (const s of slides) {
      const sl = pres.addSlide();
      if (s.bg) sl.addImage({ data: await dataUrl(s.bg), x: 0, y: 0, w: W, h: H });
      for (const b of s.blocks) {
        if (b.type === 'image') sl.addImage({ data: await dataUrl(b.src), x: b.x, y: b.y, w: b.w, h: b.h });
        else if (b.type === 'line') sl.addShape(pres.ShapeType.line, { x: b.x, y: b.y, w: b.w, h: 0, line: { color: b.color || BORDER, width: b.width || 1 } });
        else if (b.type === 'rect') {
          sl.addShape(b.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            fill: b.fill ? { color: b.fill } : { type: 'none' },
            line: b.line ? { color: b.line, width: b.lineWidth || 1 } : { type: 'none' },
            rectRadius: b.radius ? Math.min(0.5, b.radius / Math.min(b.w, b.h)) : undefined
          });
        } else if (b.type === 'table') {
          const t = b.table;
          const size = t.size || 9;
          const total = sum(t.colW);
          const border = { type: 'solid', pt: 0.5, color: t.border || BORDER };
          const rowH = Array.isArray(t.rowH) ? t.rows.map((_, i) => rowHeight(t, i)) : t.rowH;
          sl.addTable(
            t.rows.map((r) => r.map((c) => pptxCell(c, size, border))),
            {
              x: b.x,
              y: b.y,
              w: b.w,
              colW: t.colW.map((w) => (w / total) * b.w),
              rowH,
              fontFace: FONT,
              fontSize: size,
              autoPage: false
            }
          );
        } else {
          sl.addText(String(b.text ?? ''), {
            x: b.x,
            y: b.y,
            w: b.w,
            h: b.h,
            fontFace: FONT,
            fontSize: b.size || 12,
            bold: !!b.bold,
            color: b.color || '1F2937',
            align: b.align || 'left',
            valign: b.valign === 'top' ? 'top' : b.valign === 'bottom' ? 'bottom' : 'middle',
            fill: b.fill ? { color: b.fill } : undefined,
            charSpacing: b.spacing || undefined,
            margin: b.pad ? b.pad * 72 : 0,
            fit: 'shrink'
          });
        }
      }
    }
    await pres.writeFile({ fileName, compression: true });
  }

  return { W, H, tableHtml, slidesHtml, mount, pptx };
});
