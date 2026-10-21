/**
 * 調解委任書套版（公司名義＋法定代理人）
 * 委任人：星鴻股份有限公司／法定代理人吳宗霖固定；
 * 身分證、出生年月日列印留白手填；住所／電話依營業處帶入；
 * 受任人＝業務（姓名必填，其餘可手填）。
 */
(function () {
  'use strict';

  const ASSET_BASE = (typeof window.NOTE_PETITION_ASSET_BASE === 'string' && window.NOTE_PETITION_ASSET_BASE)
    ? window.NOTE_PETITION_ASSET_BASE.replace(/\/?$/, '/')
    : '';
  const FONT_PATHS = [
    ASSET_BASE + 'assets/lal/TW-Kai-98_1.ttf',
    ASSET_BASE + 'fonts/TW-Kai.ttf'
  ];
  const FONT_MANIFEST = ASSET_BASE + 'js/lal-font/manifest.js';
  const FONT_PART_PREFIX = ASSET_BASE + 'js/lal-font/part-';

  const FIXED_COMPANY = '星鴻股份有限公司';
  const FIXED_REP = '吳宗霖';
  const FIXED_TAX = '85103034';
  const BLANK_DOCX = ASSET_BASE + 'docs/mediation/租賃糾紛_調解委任書.docx';

  const BRANCHES = [
    { id: 'hq', name: '企業總部', phone: '(02) 7755-2669', addr: '台北市萬華區中華路一段106號' },
    { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '台北市大同區重慶北路一段26巷9弄1號4樓' },
    { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '桃園市中壢區環北路400號13樓之6' },
    { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '台中市北屯區文心路四段698號6樓之1' },
    { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397', addr: '台中市南區忠明南路789號8樓之2' },
    { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '台南市北區成功路54號11樓之1' },
    { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '高雄市前鎮區一心一路239號11樓之2' },
    { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '新竹縣竹北市光明五街342號2樓' },
    { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '宜蘭縣宜蘭市舊城北路154號2樓' },
    { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '基隆市中正區義二路196號2樓' },
    { id: 'changhua', name: '彰化分公司', phone: '(04) 706-0725', addr: '' },
    { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '南投縣草屯鎮中正路755號7樓之1' }
  ];

  let fontBytesPromise = null;
  let previewUrl = null;

  function $(id) { return document.getElementById(id); }
  function val(id) { return String($(id)?.value || '').trim(); }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveAssetUrl(rel) {
    if (/^https?:\/\//i.test(rel)) return rel;
    return new URL(rel.replace(/^\.\//, ''), document.baseURI).href;
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

  function isFontBytes(buf) {
    if (!buf || buf.byteLength < 4) return false;
    const u8 = new Uint8Array(buf);
    const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
    if (tag === 'OTTO' || tag === 'ttcf' || tag === 'true') return true;
    return u8[0] === 0x00 && u8[1] === 0x01 && u8[2] === 0x00 && u8[3] === 0x00;
  }

  async function loadEmbeddedFontBytes(statusEl) {
    window.LAL_FONT_PARTS = [];
    window.LAL_FONT_PART_COUNT = 0;
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=mpoa'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=mpoa'));
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

  async function getFontBytes(statusEl) {
    if (!fontBytesPromise) {
      fontBytesPromise = (async () => {
        for (const rel of FONT_PATHS) {
          try {
            const buf = await fetchFontBytes(rel);
            if (buf) return buf;
          } catch { /* next */ }
        }
        return loadEmbeddedFontBytes(statusEl);
      })().catch((err) => {
        fontBytesPromise = null;
        throw err;
      });
    }
    return fontBytesPromise;
  }

  function todayRocParts() {
    const d = new Date();
    return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, day: d.getDate() };
  }

  function selectedBranch() {
    const id = val('mpoa-branch');
    return BRANCHES.find((b) => b.id === id) || null;
  }

  function collectData() {
    const br = selectedBranch();
    return {
      branchId: br?.id || '',
      branchName: br?.name || '',
      addr: br?.addr || '',
      phone: br?.phone || '',
      agent: val('mpoa-agent'),
      agentPhone: val('mpoa-agent-phone'),
      opponent: val('mpoa-opponent'),
      matter: val('mpoa-matter') || '房屋租賃欠租',
      committee: val('mpoa-committee'),
      caseY: val('mpoa-case-y'),
      caseNo: val('mpoa-case-no'),
      y: val('mpoa-y'),
      m: val('mpoa-m'),
      d: val('mpoa-d')
    };
  }

  function validate(d) {
    const miss = [];
    if (!d.branchId) miss.push('營業處');
    if (!d.addr) miss.push('營業處住所（該處未建檔地址請改選其他處或聯絡行政）');
    if (!d.agent) miss.push('受任人（業務）姓名');
    if (!d.committee) miss.push('調解委員會');
    if (!d.opponent) miss.push('對造姓名');
    if (!d.y || !d.m || !d.d) miss.push('委任日期');
    return miss;
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function closePreview() {
    revokePreview();
    const wrap = $('mpoa-preview-wrap');
    const frame = $('mpoa-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) wrap.hidden = true;
  }

  function showPreview(bytes) {
    revokePreview();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewUrl = URL.createObjectURL(blob);
    const wrap = $('mpoa-preview-wrap');
    const frame = $('mpoa-preview-frame');
    if (frame) frame.src = previewUrl;
    if (wrap) wrap.hidden = false;
  }

  function downloadPdf(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  async function buildPdf(fontBytes, d) {
    const PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error('PDF 函式庫未載入');
    if (!window.fontkit) throw new Error('字型引擎未載入');

    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const page = doc.addPage([595.28, 841.89]);
    const W = 595.28;
    const H = 841.89;
    const ink = PDFLib.rgb(0.05, 0.07, 0.12);
    const muted = PDFLib.rgb(0.35, 0.38, 0.45);

    /* 官方「租賃糾紛_調解委任書.docx」欄寬（twip→pt）；無「連絡電話」欄 */
    const TW = 20;
    const grid = [815, 2008, 545, 1034, 1371, 545, 4200].map((n) => n / TW);
    const tableW = grid.reduce((a, b) => a + b, 0);
    const L = (W - tableW) / 2;
    const R = L + tableW;
    const colX = [L];
    for (let i = 0; i < grid.length; i++) colX.push(colX[i] + grid[i]);

    const hPad = 170 / TW;
    const hTitle = 765 / TW;
    const hCol = 765 / TW;
    const hParty = 1247 / TW;
    const hBody = 624 / TW;
    const hShort = 454 / TW;
    const hSig = 765 / TW;
    /* 表尾：此致 + 調解會 + 委任人 + 受任人 + 日期（與官方 Word 列數一致） */
    const tableH = hPad + hTitle + hCol + hParty * 2 + hBody * 4 + hShort + hSig * 4;
    const top = H - 36;

    const draw = (text, x, y, size, color) => {
      page.drawText(String(text || ''), { x, y, size, font, color: color || ink });
    };
    const hLine = (y) => page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.9, color: ink });
    const vLine = (x, y1, y2) => page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.9, color: ink });

    const fillCell = (text, x, topY, w, h, size, opt) => {
      const pad = (opt && opt.pad != null) ? opt.pad : 3;
      const align = (opt && opt.align) || 'left';
      const lines = String(text || '').split('\n');
      const wrapped = [];
      for (const ln of lines) {
        wrapLines(font, ln, size, w - pad * 2).forEach((x2) => wrapped.push(x2));
      }
      const lh = size + 1.8;
      const maxLines = Math.max(1, Math.floor((h - pad * 2) / lh));
      let ty = topY - pad - size;
      for (const line of wrapped.slice(0, maxLines)) {
        let tx = x + pad;
        if (align === 'center') tx = x + Math.max(pad, (w - font.widthOfTextAtSize(line, size)) / 2);
        draw(line, tx, ty, size);
        ty -= lh;
      }
    };

    page.drawRectangle({
      x: L, y: top - tableH, width: tableW, height: tableH,
      borderWidth: 1.1, borderColor: ink
    });

    let y = top;
    const next = (h) => { const t = y; y -= h; hLine(y); return t; };

    /* 頂部空白列（官方用紙留白） */
    next(hPad);

    /* 標題列：委任書 ｜ 年 調字第 號 */
    const yTitle = next(hTitle);
    vLine(colX[4], y, yTitle);
    fillCell('委　　　任　　　書', L, yTitle, colX[4] - L, hTitle, 18, { align: 'center', pad: 10 });
    const caseY = d.caseY || '　　';
    const caseNo = d.caseNo || '　　　　';
    fillCell(caseY + '　年　　調字第　' + caseNo + '　號', colX[4], yTitle, R - colX[4], hTitle, 11, { pad: 10 });

    /* 欄位標題（7 欄，與官方 Word 一致） */
    const yCol = next(hCol);
    for (let i = 1; i < 7; i++) vLine(colX[i], y, yCol);
    const heads = ['稱謂', '姓名〈或名稱〉', '性別', '出生日期', '國民身分證\n統一編號', '職業', '住所或居所〈事務所或營業所〉'];
    for (let i = 0; i < 7; i++) {
      fillCell(heads[i], colX[i], yCol, grid[i], hCol, 8.5, { align: 'center', pad: 2 });
    }

    /* 與官方 Word 一致：姓名僅公司名；統編在身分證欄；住所不含電話 */
    const parties = [
      { role: '委\n任\n人', name: FIXED_COMPANY, id: FIXED_TAX, addr: d.addr || '' },
      { role: '受\n任\n人', name: d.agent || '', id: '', addr: '同上' }
    ];
    for (const p of parties) {
      const yt = next(hParty);
      for (let i = 1; i < 7; i++) vLine(colX[i], y, yt);
      fillCell(p.role, colX[0], yt, grid[0], hParty, 11, { align: 'center', pad: 6 });
      fillCell(p.name, colX[1], yt, grid[1], hParty, 11, { pad: 4 });
      fillCell('', colX[2], yt, grid[2], hParty, 10);
      fillCell('', colX[3], yt, grid[3], hParty, 10);
      fillCell(p.id, colX[4], yt, grid[4], hParty, 10, { align: 'center', pad: 4 });
      fillCell('', colX[5], yt, grid[5], hParty, 10);
      fillCell(p.addr, colX[6], yt, grid[6], hParty, 10, { pad: 4 });
    }

    const bodyLines = [
      '　　　茲因與　' + (d.opponent || '') + '　間　' + (d.matter || '') + '　調解事件，',
      '委任　' + (d.agent || '') + '　為代理人，有代為一切調解行為之權，',
      '並有同意調解條件、撤回、捨棄、領取所爭物或選任代理人等特別代',
      '理權。'
    ];
    for (const line of bodyLines) {
      const yt = next(hBody);
      fillCell(line, L, yt, tableW, hBody, 12, { pad: 8 });
    }

    fillCell('此致', L, next(hShort), tableW, hShort, 12, { pad: 8 });
    fillCell('　　　　' + (d.committee || '　　　縣〈市〉　　　　鄉〈鎮市區〉調解委員會'), L, next(hSig), tableW, hSig, 12, { pad: 10 });
    /* 官方簽名列僅委任人／受任人（無另列法定代理人） */
    fillCell('　　　　　　委任人：' + FIXED_COMPANY + '　　〈簽名或蓋章〉', L, next(hSig), tableW, hSig, 11, { pad: 10 });
    fillCell('　　　　　　受任人：' + (d.agent || '') + '　　〈簽名或蓋章〉', L, next(hSig), tableW, hSig, 11, { pad: 10 });
    fillCell('中華民國　　' + d.y + '　　年　　' + d.m + '　　月　　' + d.d + '　　日', L, next(hSig), tableW, hSig, 11, { pad: 10 });

    return new Uint8Array(await doc.save());
  }

  async function makeDocx() {
    const status = $('mpoa-status');
    const d = collectData();
    const miss = validate(d);
    if (miss.length) {
      if (status) {
        status.textContent = '請先填寫：' + miss.join('、');
        status.style.color = '#b91c1c';
      }
      return;
    }
    if (!window.mediationDocxFill?.fillPoaDocx) {
      if (status) {
        status.textContent = 'Word 套版模組未載入，請重新整理頁面';
        status.style.color = '#b91c1c';
      }
      return;
    }
    try {
      if (status) {
        status.textContent = '正在套官方 Word…';
        status.style.color = '#64748b';
      }
      await window.mediationDocxFill.fillPoaDocx({
        company: FIXED_COMPANY,
        agent: d.agent,
        opponent: d.opponent,
        matter: d.matter,
        addr: d.addr,
        committee: d.committee,
        y: d.y,
        m: d.m,
        d: d.d,
        caseY: d.caseY,
        caseNo: d.caseNo
      });
      if (status) {
        status.textContent = '已下載官方格式 Word。請用 Word 開啟列印，蓋公司大章＋負責人小章。';
        status.style.color = '#047857';
      }
    } catch (e) {
      if (status) {
        status.textContent = 'Word 產出失敗：' + (e.message || e);
        status.style.color = '#b91c1c';
      }
    }
  }

  async function makePdf(mode) {
    const status = $('mpoa-status');
    const btnGen = $('mpoa-btn-generate');
    const btnPrev = $('mpoa-btn-preview');
    const d = collectData();
    const miss = validate(d);
    if (miss.length) {
      if (status) {
        status.textContent = '請先填寫：' + miss.join('、');
        status.style.color = '#b91c1c';
      }
      return;
    }
    try {
      if (status) {
        status.textContent = mode === 'preview' ? '產生預覽中…' : '載入字型中…';
        status.style.color = '#64748b';
      }
      if (btnGen) btnGen.disabled = true;
      if (btnPrev) btnPrev.disabled = true;
      const fontBytes = await getFontBytes(status);
      if (status) status.textContent = '繪製委任書中…';
      const bytes = await buildPdf(fontBytes, d);
      if (mode === 'preview') {
        showPreview(bytes);
        if (status) status.textContent = 'PDF 預覽（畫面用）。正式送件請按「下載 Word 官方格式」。';
        return;
      }
      const fn = `調解委任書_${d.agent}_${d.y}${String(d.m).padStart(2, '0')}${String(d.d).padStart(2, '0')}.pdf`;
      downloadPdf(bytes, fn);
      if (status) status.textContent = '已下載 PDF。正式送件建議改用「下載 Word 官方格式」列印。';
    } catch (e) {
      console.error(e);
      if (status) {
        status.textContent = '產生失敗：' + (e.message || e);
        status.style.color = '#b91c1c';
      }
    } finally {
      if (btnGen) btnGen.disabled = false;
      if (btnPrev) btnPrev.disabled = false;
    }
  }

  function fillBranchOptions() {
    const sel = $('mpoa-branch');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
      BRANCHES.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('');
    if (prev && BRANCHES.some((b) => b.id === prev)) sel.value = prev;
    applyBranch();
  }

  function applyBranch() {
    const br = selectedBranch();
    const addrOut = $('mpoa-addr-out');
    const phoneOut = $('mpoa-phone-out');
    if (addrOut) addrOut.textContent = br?.addr || '選營業處後帶入住所';
    if (phoneOut) phoneOut.textContent = br?.phone || '選營業處後帶入電話';
  }

  function fillDateDefaults() {
    const t = todayRocParts();
    if ($('mpoa-y') && !$('mpoa-y').value) $('mpoa-y').value = String(t.y);
    if ($('mpoa-m') && !$('mpoa-m').value) $('mpoa-m').value = String(t.m);
    if ($('mpoa-d') && !$('mpoa-d').value) $('mpoa-d').value = String(t.day);
    if ($('mpoa-case-y') && !$('mpoa-case-y').value) $('mpoa-case-y').value = String(t.y);
    if ($('mpoa-matter') && !$('mpoa-matter').value) $('mpoa-matter').value = '房屋租賃欠租';
  }

  function bindBox(box) {
    if (!box || box.getAttribute('data-bound') === '1') return;
    box.setAttribute('data-bound', '1');
    box.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'mpoa-branch') applyBranch();
    });
    box.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || !box.contains(t)) return;
      e.preventDefault();
      e.stopPropagation();
      if (t.id === 'mpoa-btn-preview') makePdf('preview');
      else if (t.id === 'mpoa-btn-docx') makeDocx();
      else if (t.id === 'mpoa-btn-generate') makePdf('download');
      else if (t.id === 'mpoa-btn-preview-tab') {
        if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
      } else if (t.id === 'mpoa-btn-preview-close') closePreview();
      else if (t.id === 'mpoa-btn-clear') {
        ['mpoa-agent', 'mpoa-agent-phone', 'mpoa-opponent', 'mpoa-committee', 'mpoa-case-no'].forEach((id) => {
          if ($(id)) $(id).value = '';
        });
        if ($('mpoa-branch')) $('mpoa-branch').value = '';
        if ($('mpoa-matter')) $('mpoa-matter').value = '房屋租賃欠租';
        applyBranch();
        fillDateDefaults();
        closePreview();
        if ($('mpoa-status')) {
          $('mpoa-status').textContent = '';
          $('mpoa-status').style.color = '';
        }
      }
    });
  }

  window.initMediationPoa = function () {
    const box = $('mpoa-box');
    if (!box) return;
    bindBox(box);
    fillBranchOptions();
    fillDateDefaults();
  };

  window.mediationPoaFormHtml = function () {
    return '' +
      '<div class="nrpbox" id="mpoa-box">' +
        '<h3>📄 調解委任書套版產生器</h3>' +
        '<p class="nrp-tip">正式送件請按<b>「下載 Word 官方格式」</b>（直接套你提供的原檔，版式一模一樣）。委任人固定<b>星鴻／統編 ' + esc(FIXED_TAX) + '</b>；住所依營業處；性別／生日／身分證留白手填。' +
          '　<a href="' + esc(resolveAssetUrl(BLANK_DOCX)) + '" download>空白原檔 ↘</a></p>' +
        '<div class="nrp-sec">' +
          '<h4>委任人（固定）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>公司名稱</span><input type="text" value="' + esc(FIXED_COMPANY) + '" readonly /></label>' +
            '<label class="nrp-field"><span>法定代理人</span><input type="text" value="' + esc(FIXED_REP) + '" readonly /></label>' +
            '<label class="nrp-field"><span>營業處<span class="req">*</span></span>' +
              '<select id="mpoa-branch"><option value="">－ 請選擇營業處 －</option></select></label>' +
            '<label class="nrp-field"><span>帶入住所</span><span id="mpoa-addr-out" class="nrp-tip" style="margin:0;display:block;padding:8px 0">選營業處後帶入住所</span></label>' +
            '<label class="nrp-field span2"><span>帶入電話</span><span id="mpoa-phone-out" class="nrp-tip" style="margin:0;display:block;padding:8px 0">選營業處後帶入電話</span></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>受任人（業務）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>業務姓名<span class="req">*</span></span><input id="mpoa-agent" type="text" placeholder="出席調解的業務姓名" /></label>' +
            '<label class="nrp-field"><span>業務電話</span><input id="mpoa-agent-phone" type="tel" placeholder="選填；空白則列印後手填" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>調解案件</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>對造姓名<span class="req">*</span></span><input id="mpoa-opponent" type="text" placeholder="房客姓名" /></label>' +
            '<label class="nrp-field"><span>案由</span><input id="mpoa-matter" type="text" placeholder="房屋租賃欠租" /></label>' +
            '<label class="nrp-field span2"><span>調解委員會<span class="req">*</span></span><input id="mpoa-committee" type="text" placeholder="例：新北市新店區調解委員會" /></label>' +
            '<label class="nrp-field"><span>案號民國年</span><input id="mpoa-case-y" type="number" placeholder="可空白" /></label>' +
            '<label class="nrp-field"><span>民調字號</span><input id="mpoa-case-no" type="text" placeholder="尚無案號可空白" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>委任日期</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>民國年<span class="req">*</span></span><input id="mpoa-y" type="number" /></label>' +
            '<label class="nrp-field"><span>月<span class="req">*</span></span><input id="mpoa-m" type="number" min="1" max="12" /></label>' +
            '<label class="nrp-field"><span>日<span class="req">*</span></span><input id="mpoa-d" type="number" min="1" max="31" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-actions">' +
          '<button type="button" id="mpoa-btn-docx">下載 Word 官方格式</button>' +
          '<button type="button" id="mpoa-btn-preview">PDF 預覽</button>' +
          '<button type="button" class="soft" id="mpoa-btn-generate">下載 PDF</button>' +
          '<button type="button" class="soft" id="mpoa-btn-clear">清除欄位</button>' +
          '<p id="mpoa-status"></p>' +
        '</div>' +
        '<div id="mpoa-preview-wrap" class="nrp-preview-wrap" hidden>' +
          '<div class="nrp-preview-bar">' +
            '<strong>📄 調解委任書預覽</strong>' +
            '<span class="nrp-preview-actions">' +
              '<button type="button" id="mpoa-btn-preview-tab" class="soft">另開分頁</button>' +
              '<button type="button" id="mpoa-btn-preview-close" class="soft">關閉預覽</button>' +
            '</span>' +
          '</div>' +
          '<iframe id="mpoa-preview-frame" title="調解委任書預覽"></iframe>' +
        '</div>' +
        '<p class="nrp-foot">※ 正式送件用 Word 官方格式列印後蓋章。PDF 僅供畫面預覽對稿。</p>' +
      '</div>';
  };
})();
