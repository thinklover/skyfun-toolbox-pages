/**
 * 欠租關懷通知單（家訪單）產生器 — 依《欠租關懷通知單_優化版》內容產生 PDF
 * 聯絡單位／電話：與聲請狀相同之分公司預設
 */
(function () {
  'use strict';

  const ASSET_BASE = (typeof window.CARE_VISIT_ASSET_BASE === 'string' && window.CARE_VISIT_ASSET_BASE)
    ? window.CARE_VISIT_ASSET_BASE.replace(/\/?$/, '/')
    : './';
  const FONT_PATHS = [
    ASSET_BASE + 'assets/lal/TW-Kai-98_1.ttf',
    ASSET_BASE + 'fonts/TW-Kai.ttf'
  ];
  const FONT_MANIFEST = ASSET_BASE + 'js/lal-font/manifest.js';
  const FONT_PART_PREFIX = ASSET_BASE + 'js/lal-font/part-';

  const COMPANY_BRANCH_PRESETS = {
    '星鴻股份有限公司': [
      { id: 'hq', name: '企業總部', phone: '(02) 7755-2669', addr: '108 台北市萬華區中華路一段106號' },
      { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
      { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '320 桃園市中壢區環北路400號13樓之6' },
      { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '406 台中市北屯區文心路四段698號6樓之1' },
      { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397', addr: '402 台中市南區忠明南路789號8樓之2' },
      { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '704 台南市北區成功路54號11樓之1' },
      { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '806 高雄市前鎮區一心一路239號11樓之2' },
      { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '302 新竹縣竹北市光明五街342號2樓' },
      { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '260 宜蘭縣宜蘭市舊城北路154號2樓' },
      { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '202 基隆市中正區義二路196號2樓' },
      { id: 'changhua', name: '彰化分公司', phone: '(04) 706-0725', addr: '' },
      { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '542 南投縣草屯鎮中正路755號7樓之1' }
    ],
    '星華股份有限公司': [
      { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
      { id: 'chiayi', name: '嘉義分公司', phone: '(05) 320-9119', addr: '600 嘉義市西區上海路175號2樓' }
    ]
  };

  let fontBytesPromise = null;
  let inited = false;

  function $(id) {
    return document.getElementById(id);
  }

  function val(id) {
    return String($(id)?.value || '').trim();
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveAssetUrl(rel) {
    try {
      return new URL(rel, document.baseURI || window.location.href).href;
    } catch {
      return rel;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('無法載入：' + src));
      document.head.appendChild(s);
    });
  }

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  /** 辨識 TTF／OTF／TTC；避免 404 被 Pages 回成 HTML 卻當成字型 */
  function isFontBytes(buf) {
    if (!buf || buf.byteLength < 4) return false;
    const u8 = new Uint8Array(buf);
    const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (tag === 'OTTO' || tag === 'ttcf' || tag === 'true') return true;
    return u8[0] === 0x00 && u8[1] === 0x01 && u8[2] === 0x00 && u8[3] === 0x00;
  }

  async function loadEmbeddedFontBytes() {
    const status = $('cvn-status');
    // 重新載入分片，避免先前不完整狀態
    window.LAL_FONT_PARTS = [];
    window.LAL_FONT_PART_COUNT = 0;
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=cvn'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (status) status.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=cvn'));
    }
    if (!Array.isArray(window.LAL_FONT_PARTS) || window.LAL_FONT_PARTS.length < total) {
      throw new Error('字型分片未載入完整');
    }
    const bytes = base64ToArrayBuffer(window.LAL_FONT_PARTS.join(''));
    if (!isFontBytes(bytes)) throw new Error('內嵌字型格式無效');
    return bytes;
  }

  async function fetchFontBytes(rel) {
    const r = await fetch(resolveAssetUrl(rel));
    if (!r.ok) return null;
    const ct = String(r.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return null;
    const buf = await r.arrayBuffer();
    return isFontBytes(buf) ? buf : null;
  }

  async function getFontBytes() {
    if (!fontBytesPromise) {
      fontBytesPromise = (async () => {
        for (const rel of FONT_PATHS) {
          try {
            const buf = await fetchFontBytes(rel);
            if (buf) return buf;
          } catch { /* try next */ }
        }
        return loadEmbeddedFontBytes();
      })().catch((err) => {
        fontBytesPromise = null;
        throw err;
      });
    }
    return fontBytesPromise;
  }

  function todayRocParts() {
    const d = new Date();
    return {
      y: d.getFullYear() - 1911,
      m: d.getMonth() + 1,
      day: d.getDate()
    };
  }

  function setStatus(text, isError) {
    const el = $('cvn-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-sm flex-1 ' + (isError ? 'text-rose-700 font-semibold' : 'text-slate-500');
    el.style.color = isError ? '#b91c1c' : '#64748b';
    el.style.fontWeight = isError ? '800' : '700';
  }

  function resetBranchSelect() {
    const branchSel = $('cvn-branch');
    if (!branchSel) return;
    branchSel.disabled = true;
    branchSel.innerHTML = '<option value="">－ 請先選公司別 －</option>';
  }

  function applyBranchPhone() {
    const company = val('cvn-company');
    const branchId = val('cvn-branch');
    const branches = COMPANY_BRANCH_PRESETS[company] || [];
    const hit = branches.find((b) => b.id === branchId);
    if (!hit) return;
    if ($('cvn-unit')) $('cvn-unit').value = hit.name;
    if ($('cvn-phone')) $('cvn-phone').value = hit.phone;
  }

  function collectData() {
    return {
      address: val('cvn-address'),
      company: val('cvn-company'),
      unit: val('cvn-unit'),
      staff: val('cvn-staff'),
      phone: val('cvn-phone'),
      visitY: val('cvn-visit-y'),
      visitM: val('cvn-visit-m'),
      visitD: val('cvn-visit-d'),
      flags: {
        noAnswer: !!$('cvn-flag-no-answer')?.checked,
        callMissed: !!$('cvn-flag-call-missed')?.checked,
        lineMissed: !!$('cvn-flag-line-missed')?.checked,
        other: !!$('cvn-flag-other')?.checked
      },
      otherNote: val('cvn-other-note')
    };
  }

  function validate(d) {
    const errors = [];
    if (!d.address) errors.push('房屋地址');
    if (!d.unit) errors.push('聯絡單位');
    if (!d.phone) errors.push('聯絡電話');
    if (!d.visitY || !d.visitM || !d.visitD) errors.push('訪視日期');
    return errors;
  }

  function wrapLines(font, text, size, maxW) {
    const s = String(text || '');
    if (!s) return [''];
    const lines = [];
    let line = '';
    for (const ch of s) {
      const next = line + ch;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function drawWrapped(page, font, text, x, y, size, maxW, lh, color) {
    const lines = wrapLines(font, text, size, maxW);
    let cy = y;
    for (const line of lines) {
      page.drawText(line, { x, y: cy, size, font, color });
      cy -= lh;
    }
    return cy;
  }

  function drawCheckRow(page, font, checked, label, x, y, size, maxW, lh, color) {
    const box = 13;
    page.drawRectangle({
      x,
      y: y - 1,
      width: box,
      height: box,
      borderWidth: 1.2,
      borderColor: color,
      color: undefined
    });
    if (checked) {
      page.drawText('V', {
        x: x + 2.4,
        y: y + 0.4,
        size: 11,
        font,
        color
      });
    }
    return drawWrapped(page, font, label, x + box + 8, y, size, maxW - box - 8, lh, color);
  }

  let previewUrl = null;
  let lastPdf = null; // { bytes, filename }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function ensurePreviewShell() {
    if ($('cvn-preview-wrap') && $('cvn-preview-frame')) {
      if (!$('cvn-preview-style')) injectPreviewStyle();
      return;
    }
    const status = $('cvn-status');
    const actions = status?.parentElement || $('cvn-btn-generate')?.parentElement;
    if (!actions) return;
    if (!$('cvn-btn-preview')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'cvn-btn-preview';
      btn.textContent = '預覽';
      if ($('cvn-btn-generate')?.className) {
        btn.className = $('cvn-btn-generate').className.replace('tone-rose', 'tone-indigo') || 'btn btn-sm tone-indigo font-bold';
      } else {
        btn.className = 'soft';
      }
      actions.insertBefore(btn, $('cvn-btn-generate') || status);
    }

    let wrap = $('cvn-preview-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'cvn-preview-wrap';
      wrap.className = 'cvn-preview-wrap';
      wrap.hidden = true;
      const foot = actions.nextElementSibling;
      if (foot) actions.parentElement.insertBefore(wrap, foot);
      else actions.parentElement.appendChild(wrap);
    }
    if (!$('cvn-preview-frame')) {
      wrap.innerHTML =
        '<div class="cvn-preview-bar">' +
          '<strong>📄 家訪單預覽</strong>' +
          '<span class="cvn-preview-actions">' +
            '<button type="button" id="cvn-btn-preview-tab" class="soft">另開分頁</button>' +
            '<button type="button" id="cvn-btn-preview-close" class="soft">關閉預覽</button>' +
          '</span>' +
        '</div>' +
        '<iframe id="cvn-preview-frame" title="家訪單預覽"></iframe>';
    }
    injectPreviewStyle();
  }

  function injectPreviewStyle() {
    if ($('cvn-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'cvn-preview-style';
    style.textContent =
      '.cvn-preview-wrap{margin-top:12px;border:2px solid #c9a227;border-radius:12px;overflow:hidden;background:#fff;}' +
      '.cvn-preview-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#fffbeb,#fff);border-bottom:1px solid #e2e8f0;}' +
      '.cvn-preview-bar strong{font-size:14px;font-weight:900;color:#192437;}' +
      '.cvn-preview-actions{display:flex;gap:8px;}' +
      '.cvn-preview-wrap iframe{display:block;width:100%;height:min(72vh,720px);border:0;background:#525659;}' +
      '#cvn-btn-preview-tab,#cvn-btn-preview-close{appearance:none;border:1.5px solid #cbd5e1;border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;background:#fff;color:#192437;}' +
      '#cvn-btn-preview{background:#1d4ed8!important;color:#fff!important;border-color:#1d4ed8!important;}';
    document.head.appendChild(style);
  }

  async function buildPdfBytes(d) {
    if (!window.PDFLib) throw new Error('PDF 套件未載入');
    if (!window.fontkit) throw new Error('字型引擎未載入');

    const { PDFDocument, rgb } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(window.fontkit);
    let fontBytes = await getFontBytes();
    let font;
    try {
      font = await pdfDoc.embedFont(fontBytes, { subset: true });
    } catch (fontErr) {
      fontBytesPromise = null;
      setStatus('字型重試中（載入內嵌標楷體）…');
      fontBytes = await loadEmbeddedFontBytes();
      font = await pdfDoc.embedFont(fontBytes, { subset: true });
    }

    const page = pdfDoc.addPage([595.28, 841.89]);
    const W = 595.28;
    const H = 841.89;
    const L = 50;
    const R = W - 50;
    const maxW = R - L;
    const ink = rgb(0.1, 0.12, 0.18);
    const muted = rgb(0.35, 0.38, 0.45);

    let y = H - 50;
    const title = '欠租關懷通知單';
    const titleSize = 26;
    const tw = font.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (W - tw) / 2, y, size: titleSize, font, color: ink });
    y -= 40;

    const bodySize = 14.5;
    const lh = 26;
    const paras = [
      '親愛的住戶您好：',
      '　　本公司近期已透過電話、簡訊、LINE及現場訪視等方式嘗試與您聯繫，但截至目前尚未取得回覆。',
      '　　經查目前租金可能有逾期未繳納情形，為避免影響您的租賃權益及後續相關作業，請您於看到本通知後儘速與本公司聯繫，以確認租金繳納情況及後續處理方式。',
      '　　若您近期因工作、出差、身體不適或其他特殊因素暫時無法配合，也請主動與本公司聯繫說明，本公司將協助您了解相關處理流程。'
    ];
    for (const p of paras) {
      y = drawWrapped(page, font, p, L, y, bodySize, maxW, lh, ink) - 8;
    }

    y -= 6;
    y = drawWrapped(page, font, '房屋地址：' + d.address, L, y, bodySize, maxW, lh, ink) - 12;

    const flagRows = [
      { on: d.flags.noAnswer, label: '本次已到訪但無人應門' },
      { on: d.flags.callMissed, label: '已撥打電話未接聽' },
      { on: d.flags.lineMissed, label: '已發送LINE／簡訊未回覆' },
      {
        on: d.flags.other,
        label: '其他：' + (d.flags.other && d.otherNote ? d.otherNote : '____________________________')
      }
    ];
    for (const row of flagRows) {
      y = drawCheckRow(page, font, row.on, row.label, L, y, bodySize, maxW, lh, ink) - 8;
    }

    y -= 14;
    const contactLines = [
      `聯絡單位：${d.unit}`,
      `聯絡人員：${d.staff || '____________________'}`,
      `聯絡電話：${d.phone}`,
      `訪視日期：${d.visitY}年${d.visitM}月${d.visitD}日`
    ];
    for (const line of contactLines) {
      page.drawText(line, { x: L, y, size: bodySize, font, color: ink });
      y -= 28;
    }

    const remindSize = 13.5;
    const remindLh = 22;
    const remindText = '如您已完成繳款、已與本公司聯繫或雙方已有約定處理方式，請忽略本通知。';
    y -= 10;
    page.drawText('※提醒：', { x: L, y, size: remindSize, font, color: muted });
    y -= 24;
    drawWrapped(page, font, remindText, L, y, remindSize, maxW, remindLh, muted);

    return pdfDoc.save();
  }

  async function makePdf(mode) {
    const d = collectData();
    const errors = validate(d);
    if (errors.length) {
      setStatus('請先填寫：' + errors.join('、'), true);
      return;
    }

    try {
      setStatus(mode === 'preview' ? '產生預覽中…' : '產生 PDF 中…');
      const bytes = await buildPdfBytes(d);
      const filename = `欠租關懷通知單_${d.address.replace(/[\\/:*?"<>|]/g, '_').slice(0, 24)}.pdf`;
      lastPdf = { bytes, filename };
      const blob = new Blob([bytes], { type: 'application/pdf' });

      if (mode === 'preview') {
        ensurePreviewShell();
        revokePreview();
        previewUrl = URL.createObjectURL(blob);
        const wrap = $('cvn-preview-wrap');
        const frame = $('cvn-preview-frame');
        if (wrap && frame) {
          wrap.hidden = false;
          wrap.classList.remove('hidden');
          frame.src = previewUrl;
        }
        setStatus('已產生預覽，確認無誤後再按「產生 PDF（下載列印）」。');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus('已下載 PDF。');
    } catch (e) {
      console.error(e);
      setStatus('產生失敗：' + (e.message || e), true);
    }
  }

  function clearForm() {
    ['cvn-address', 'cvn-unit', 'cvn-staff', 'cvn-phone', 'cvn-other-note'].forEach((id) => {
      if ($(id)) $(id).value = '';
    });
    if ($('cvn-company')) $('cvn-company').value = '';
    resetBranchSelect();
    ['cvn-flag-no-answer', 'cvn-flag-call-missed', 'cvn-flag-line-missed', 'cvn-flag-other'].forEach((id) => {
      if ($(id)) $(id).checked = false;
    });
    const t = todayRocParts();
    if ($('cvn-visit-y')) $('cvn-visit-y').value = String(t.y);
    if ($('cvn-visit-m')) $('cvn-visit-m').value = String(t.m);
    if ($('cvn-visit-d')) $('cvn-visit-d').value = String(t.day);
    lastPdf = null;
    revokePreview();
    const wrap = $('cvn-preview-wrap');
    const frame = $('cvn-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) {
      wrap.hidden = true;
      wrap.classList.add('hidden');
    }
    setStatus('');
  }

  function fillBranchOptions() {
    const company = val('cvn-company');
    const branchSel = $('cvn-branch');
    if (!branchSel) return;
    const branches = COMPANY_BRANCH_PRESETS[company] || [];
    if (!company || !branches.length) {
      resetBranchSelect();
      return;
    }
    const prev = branchSel.value;
    branchSel.disabled = false;
    branchSel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
      branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    if (prev && branches.some((b) => b.id === prev)) {
      branchSel.value = prev;
      applyBranchPhone();
    }
  }

  function bindEvents() {
    ensurePreviewShell();
    const root = $('cf-cvn');
    if (!root || root.getAttribute('data-cvn-bound') === '1') return;
    root.setAttribute('data-cvn-bound', '1');

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (!t || !root.contains(t)) return;
      if (t.id === 'cvn-company') fillBranchOptions();
      if (t.id === 'cvn-branch') applyBranchPhone();
    });

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !root.contains(btn)) return;
      if (btn.id === 'cvn-btn-preview') {
        e.preventDefault();
        e.stopPropagation();
        makePdf('preview');
        return;
      }
      if (btn.id === 'cvn-btn-generate') {
        e.preventDefault();
        e.stopPropagation();
        makePdf('download');
        return;
      }
      if (btn.id === 'cvn-btn-clear') {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('清除本頁所有欄位？')) return;
        clearForm();
        return;
      }
      if (btn.id === 'cvn-btn-preview-close') {
        e.preventDefault();
        e.stopPropagation();
        const wrap = $('cvn-preview-wrap');
        const frame = $('cvn-preview-frame');
        if (frame) frame.src = 'about:blank';
        if (wrap) {
          wrap.hidden = true;
          wrap.classList.add('hidden');
        }
        revokePreview();
        setStatus('');
        return;
      }
      if (btn.id === 'cvn-btn-preview-tab') {
        e.preventDefault();
        e.stopPropagation();
        if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
        else if (lastPdf) {
          const url = URL.createObjectURL(new Blob([lastPdf.bytes], { type: 'application/pdf' }));
          window.open(url, '_blank', 'noopener');
        }
      }
    });
  }

  function applyArrearsPrefill() {
    try {
      const raw = sessionStorage.getItem('skyfun_arrears_prefill');
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p.type !== 'visit') return;
      if ($('cvn-address') && p.address) $('cvn-address').value = p.address;
      if ($('cvn-staff') && p.staff) $('cvn-staff').value = p.staff;
      sessionStorage.removeItem('skyfun_arrears_prefill');
      setStatus('已自呆帳追蹤系統帶入地址與聯絡人員');
    } catch { /* ignore */ }
  }

  function initCareVisitNotice() {
    if (!$('cvn-company')) return;
    bindEvents();
    inited = true;
    ensurePreviewShell();
    const t = todayRocParts();
    if ($('cvn-visit-y') && !$('cvn-visit-y').value) $('cvn-visit-y').value = String(t.y);
    if ($('cvn-visit-m') && !$('cvn-visit-m').value) $('cvn-visit-m').value = String(t.m);
    if ($('cvn-visit-d') && !$('cvn-visit-d').value) $('cvn-visit-d').value = String(t.day);
    fillBranchOptions();
    applyArrearsPrefill();
  }

  window.initCareVisitNotice = initCareVisitNotice;
})();
