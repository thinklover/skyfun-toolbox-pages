/**
 * 租賃糾紛調解聲請書套版（對照官方「聲請調解書」表單）
 * 聲請人固定星鴻股份有限公司／統一編號 85103034；住所電話依營業處帶入。
 * 事件概要可呼叫 petition-ai／api/mediation-summary/polish 潤飾。
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
  const BLANK_DOCX = ASSET_BASE + 'docs/mediation/租賃糾紛_調解聲請書.docx';

  const FIXED_COMPANY = '星鴻股份有限公司';
  const FIXED_TAX = '85103034';
  const FIXED_REP = '吳宗霖';
  const AI_URL = () => String(window.SKYFUN_PETITION_AI_URL || 'https://skyfun-petition-ai.onrender.com').replace(/\/$/, '') + '/api/mediation-summary/polish';

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
  const aiState = { original: null, busy: false };

  function $(id) { return document.getElementById(id); }
  function val(id) { return String($(id)?.value || '').trim(); }
  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';

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
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=mpet'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=mpet'));
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
    const id = val('mpet-branch');
    return BRANCHES.find((b) => b.id === id) || null;
  }

  function collectData() {
    const br = selectedBranch();
    return {
      branchId: br?.id || '',
      addr: br?.addr || '',
      phone: br?.phone || '',
      agent: val('mpet-agent'),
      opponent: val('mpet-opponent'),
      opponentAddr: val('mpet-opponent-addr'),
      opponentPhone: val('mpet-opponent-phone'),
      opponent2: val('mpet-opponent2'),
      opponent2Addr: val('mpet-opponent2-addr'),
      opponent2Phone: val('mpet-opponent2-phone'),
      matter: val('mpet-matter') || '租賃事件',
      summary: val('mpet-summary'),
      evidence: val('mpet-evidence'),
      investigate: val('mpet-investigate'),
      city: val('mpet-city'),
      town: val('mpet-town'),
      y: val('mpet-y'),
      m: val('mpet-m'),
      d: val('mpet-d')
    };
  }

  function validate(d) {
    const miss = [];
    if (!d.branchId) miss.push('營業處');
    if (!d.addr) miss.push('營業處住所（該處未建檔地址請改選其他處）');
    if (!d.opponent) miss.push('對造姓名');
    if (!d.opponentAddr) miss.push('對造住所（調解管轄依對造住所地）');
    if (!d.summary) miss.push('事件概要');
    if (!d.city) miss.push('縣（市）');
    if (!d.town) miss.push('鄉（鎮、市、區）');
    if (!d.y || !d.m || !d.d) miss.push('聲請日期');
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
    const wrap = $('mpet-preview-wrap');
    const frame = $('mpet-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) wrap.hidden = true;
  }

  function showPreview(bytes) {
    revokePreview();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewUrl = URL.createObjectURL(blob);
    const wrap = $('mpet-preview-wrap');
    const frame = $('mpet-preview-frame');
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
      if (ch === '\n') {
        lines.push(line);
        line = '';
        continue;
      }
      const next = line + ch;
      if (font.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line);
        line = ch;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  async function ensurePdfLibs() {
    if (!window.PDFLib) await loadScript(resolveAssetUrl(ASSET_BASE + 'js/vendor/pdf-lib.min.js'));
    if (!window.fontkit) await loadScript(resolveAssetUrl(ASSET_BASE + 'js/vendor/fontkit.umd.js'));
  }

  async function buildPdf(fontBytes, d) {
    await ensurePdfLibs();
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
    const muted = PDFLib.rgb(0.32, 0.35, 0.4);
    /* 官方 Word 欄寬（twip→pt） */
    const TW = 20;
    const grid = [1868, 1569, 901, 1185, 1388, 696, 1805, 1360].map((n) => n / TW);
    const tableW = grid.reduce((a, b) => a + b, 0);
    const L = (W - tableW) / 2;
    const R = L + tableW;
    const colX = [L];
    for (let i = 0; i < grid.length; i++) colX.push(colX[i] + grid[i]);

    const hHdr = 351 / TW;
    const hCol = 567 / TW;
    const hParty = 1247 / TW;
    const hLead = 454 / TW;
    const hSum = 3402 / TW;
    const hCourt = 369 / TW;
    const hEv = 482 / TW;
    const hFoot = 1191 / TW;
    const tableH = hHdr * 2 + hCol + hParty * 3 + hLead + hSum + hCourt + hEv * 2 + hFoot;
    const top = H - 28;

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
      const lh = size + 1.5;
      const maxLines = Math.max(1, Math.floor((h - pad * 2) / lh));
      let ty = topY - pad - size;
      for (const line of wrapped.slice(0, maxLines)) {
        if (!line && wrapped.length === 1) break;
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

    /* R1–R2：左合併標題＋右收件資訊 */
    const y1 = top;
    const y2 = top - hHdr;
    const y3 = top - hHdr * 2;
    hLine(y2);
    hLine(y3);
    vLine(colX[2], y3, y1);
    fillCell('聲請調解書', L, y1, colX[2] - L, hHdr * 2, 16, { align: 'center', pad: 8 });
    fillCell('收件日期：　　　年　　月　　日　　時　　分　　　全 1 頁', colX[2], y1, R - colX[2], hHdr, 9, { pad: 5 });
    fillCell('收件編號：　　　　　　　　案號：　　　年　　調字第　　　　號', colX[2], y2, R - colX[2], hHdr, 9, { pad: 5 });

    /* R3：欄位標題（8 欄） */
    let y = y3;
    const next = (h) => { const t = y; y -= h; hLine(y); return t; };
    const yCol = next(hCol);
    for (let i = 1; i < 8; i++) vLine(colX[i], y, yCol);
    const heads = ['稱　　謂', '姓名(或名稱)', '性別', '出生日期', '國民身分證\n統一編號', '職業', '住所或居所', '連絡電話'];
    for (let i = 0; i < 8; i++) {
      fillCell(heads[i], colX[i], yCol, grid[i], hCol, 8.5, { align: 'center', pad: 2 });
    }

    const roleLabel = '聲　請　人\n(法定代理人)\n(委任代理人)';
    const oppLabel = '對　造　人\n(法定代理人)\n(委任代理人)';
    const applicantName = FIXED_COMPANY
      + '\n法定代理人 ' + FIXED_REP
      + (d.agent ? '\n委任代理人 ' + d.agent : '');

    const parties = [
      { role: roleLabel, name: applicantName, id: FIXED_TAX, addr: d.addr || '', tel: d.phone || '' },
      { role: oppLabel, name: d.opponent || '', id: '', addr: d.opponentAddr || '', tel: d.opponentPhone || '' },
      { role: oppLabel, name: d.opponent2 || '', id: '', addr: d.opponent2Addr || '', tel: d.opponent2Phone || '' }
    ];
    for (const p of parties) {
      const yt = next(hParty);
      for (let i = 1; i < 8; i++) vLine(colX[i], y, yt);
      fillCell(p.role, colX[0], yt, grid[0], hParty, 9, { align: 'center', pad: 4 });
      fillCell(p.name, colX[1], yt, grid[1], hParty, 9.5, { pad: 3 });
      fillCell('', colX[2], yt, grid[2], hParty, 9);
      fillCell('', colX[3], yt, grid[3], hParty, 9);
      fillCell(p.id, colX[4], yt, grid[4], hParty, 9.5, { align: 'center', pad: 3 });
      fillCell('', colX[5], yt, grid[5], hParty, 9);
      fillCell(p.addr, colX[6], yt, grid[6], hParty, 9, { pad: 3 });
      fillCell(p.tel, colX[7], yt, grid[7], hParty, 9, { pad: 3 });
    }

    /* 事件概要導言 */
    const yLead = next(hLead);
    const matterPad = Math.max(2, 18 - String(d.matter || '').length);
    const lead = '上當事人間　' + (d.matter || '租賃事件') + '　'.repeat(Math.min(matterPad, 8))
      + '　事件聲請調解，事件概要(與願接受之調解條件)如下：';
    fillCell(lead, L, yLead, tableW, hLead, 10, { pad: 5 });

    /* 概要大框 */
    const ySum = next(hSum);
    fillCell(d.summary || '', L, ySum, tableW, hSum, 10.5, { pad: 6 });

    /* 偵查審理註記（空白） */
    const yCourt = next(hCourt);
    fillCell('(本件現正在　　　　地方法院／檢察署偵查審理中，案號如右：　　　　　　　　　　　　　　)', L, yCourt, tableW, hCourt, 8.5, { pad: 4 });

    /* 證物／調查證據 */
    const yEv = next(hEv);
    vLine(colX[1], y, yEv);
    fillCell('證物名稱及件數', colX[0], yEv, grid[0], hEv, 9, { align: 'center', pad: 3 });
    fillCell(d.evidence || '', colX[1], yEv, R - colX[1], hEv, 9.5, { pad: 4 });

    const yInv = next(hEv);
    vLine(colX[1], y, yInv);
    fillCell('聲請調查證據', colX[0], yInv, grid[0], hEv, 9, { align: 'center', pad: 3 });
    fillCell(d.investigate || '', colX[1], yInv, R - colX[1], hEv, 9.5, { pad: 4 });

    /* 此致／日期／簽名 */
    const yFoot = next(hFoot);
    /* 最後一列底線已是外框，不必再畫 */
    let fy = yFoot - 12;
    draw('此致　' + d.city + d.town + '調解委員會', L + 8, fy, 11);
    fy -= 16;
    draw('中華民國　　' + d.y + '　　年　　' + d.m + '　　月　　' + d.d + '　　日', L + 8, fy, 10.5);
    fy -= 16;
    draw('聲請人：' + FIXED_COMPANY + '　　（公司大章）', L + 20, fy, 10.5);
    fy -= 14;
    draw('法定代理人：' + FIXED_REP + '　　（負責人小章／簽名）', L + 20, fy, 10.5);
    if (d.agent) {
      fy -= 14;
      draw('委任代理人：' + d.agent + '　　（簽名或蓋章）', L + 20, fy, 10.5);
    }

    /* 附註（表外） */
    let ny = top - tableH - 12;
    const notes = [
      '附註：1.提出聲請調解書時，應按對造人提出繕本。',
      '2.聲請人或對造人為無行為能力或限制行為能力者，應記明其法定代理人。',
      '3.當事人如有「法定代理人」或「委任代理人」應於「稱謂」一欄下記明之；如兼有兩者，均應記明。',
      '4.「事件概要」應摘要記明兩造爭議情形；如該事件在地院審理或檢察署偵查中，並應記明案號及最近情形。',
      '5.聲請調查證據時，應將證物名稱、證人姓名及住居所等記明於「聲請調查證據」欄。',
      '6.蓋公司大章＋負責人小章；有委任代理人時一併簽名。'
    ];
    for (const n of notes) {
      for (const line of wrapLines(font, n, 7.5, tableW)) {
        draw(line, L, ny, 7.5, muted);
        ny -= 10;
      }
    }

    return new Uint8Array(await doc.save());
  }

  function fillBranchOptions() {
    const sel = $('mpet-branch');
    if (!sel || sel.options.length > 1) return;
    BRANCHES.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name + (b.addr ? '' : '（無地址）');
      sel.appendChild(opt);
    });
  }

  function fillDateDefaults() {
    const t = todayRocParts();
    if ($('mpet-y') && !$('mpet-y').value) $('mpet-y').value = String(t.y);
    if ($('mpet-m') && !$('mpet-m').value) $('mpet-m').value = String(t.m);
    if ($('mpet-d') && !$('mpet-d').value) $('mpet-d').value = String(t.day);
  }

  function syncBranchOut() {
    const br = selectedBranch();
    if ($('mpet-addr-out')) $('mpet-addr-out').textContent = br?.addr || '選營業處後帶入住所';
    if ($('mpet-phone-out')) $('mpet-phone-out').textContent = br?.phone || '選營業處後帶入電話';
  }

  function aiMsg(text, kind) {
    const el = $('mpet-ai-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'nrp-ai-msg' + (kind ? ' is-' + kind : '');
  }

  function aiReset() {
    aiState.original = null;
    const undo = $('mpet-ai-undo');
    if (undo) undo.hidden = true;
    aiMsg('');
  }

  async function runAiPolish() {
    const ta = $('mpet-summary');
    if (!ta || aiState.busy) return;
    const text = String(ta.value || '').trim();
    if (!token()) {
      aiMsg('請先登入工具箱', 'err');
      return;
    }
    if (Array.from(text.replace(/\s+/g, '')).length < 5) {
      aiMsg('請先用自己的話寫幾句事件概要，再按 AI 潤飾', 'err');
      ta.focus();
      return;
    }
    aiState.busy = true;
    const btn = $('mpet-btn-ai');
    if (btn) { btn.disabled = true; btn.textContent = '✨ 潤飾中…'; }
    aiMsg('大約 5～20 秒；若 AI 服務剛醒來，第一次可能要等 30～60 秒…');
    try {
      const res = await fetch(AI_URL(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token(), text }),
        signal: AbortSignal.timeout(150000)
      });
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!data?.ok) throw new Error(data?.error || ('AI 暫時無法使用（' + res.status + '）'));
      if (aiState.original == null) aiState.original = ta.value;
      ta.value = data.text || '';
      const undo = $('mpet-ai-undo');
      if (undo) undo.hidden = false;
      aiMsg('已潤飾完成，請核對事實與金額後再產生 PDF', 'ok');
    } catch (e) {
      const msg = e.name === 'TimeoutError' ? 'AI 潤飾逾時，請再按一次'
        : e.message === 'Failed to fetch' ? '連不上 AI 服務，請稍後再試'
        : e.message;
      aiMsg(msg, 'err');
    } finally {
      aiState.busy = false;
      if (btn) { btn.disabled = false; btn.textContent = '✨ AI 潤飾'; }
    }
  }

  function runAiUndo() {
    const ta = $('mpet-summary');
    if (!ta || aiState.original == null) return;
    ta.value = aiState.original;
    aiReset();
    aiMsg('已復原成潤飾前的內容');
  }

  async function runDocx() {
    const status = $('mpet-status');
    const d = collectData();
    const miss = validate(d);
    if (miss.length) {
      if (status) {
        status.textContent = '請補上：' + miss.join('、');
        status.style.color = '#b91c1c';
      }
      return;
    }
    if (!window.mediationDocxFill?.fillPetitionDocx) {
      if (status) {
        status.textContent = 'Word 套版模組未載入，請重新整理頁面';
        status.style.color = '#b91c1c';
      }
      return;
    }
    try {
      if (status) {
        status.textContent = '正在套官方 Word…';
        status.style.color = '';
      }
      await window.mediationDocxFill.fillPetitionDocx({
        company: FIXED_COMPANY,
        rep: FIXED_REP,
        tax: FIXED_TAX,
        agent: d.agent,
        addr: d.addr,
        phone: d.phone,
        opponent: d.opponent,
        opponentAddr: d.opponentAddr,
        opponentPhone: d.opponentPhone,
        opponent2: d.opponent2,
        opponent2Addr: d.opponent2Addr,
        matter: d.matter,
        summary: d.summary,
        evidence: d.evidence,
        city: d.city,
        town: d.town,
        y: d.y,
        m: d.m,
        d: d.d
      });
      if (status) {
        status.textContent = '已下載官方格式 Word。請用 Word 開啟列印蓋章。';
        status.style.color = '#047857';
      }
    } catch (err) {
      if (status) {
        status.textContent = 'Word 產出失敗：' + (err?.message || err);
        status.style.color = '#b91c1c';
      }
    }
  }

  async function run(kind) {
    const status = $('mpet-status');
    const d = collectData();
    const miss = validate(d);
    if (miss.length) {
      if (status) {
        status.textContent = '請補上：' + miss.join('、');
        status.style.color = '#b91c1c';
      }
      return;
    }
    try {
      if (status) {
        status.textContent = '產生中…';
        status.style.color = '';
      }
      const fontBytes = await getFontBytes(status);
      const bytes = await buildPdf(fontBytes, d);
      if (kind === 'preview') showPreview(bytes);
      else {
        downloadPdf(bytes, '調解聲請書_' + d.opponent + '.pdf');
        closePreview();
      }
      if (status) {
        status.textContent = kind === 'preview'
          ? 'PDF 預覽（畫面用）。正式送件請按「下載 Word 官方格式」。'
          : '已下載 PDF。正式送件建議改用「下載 Word 官方格式」列印。';
        status.style.color = '#047857';
      }
    } catch (err) {
      if (status) {
        status.textContent = err?.message || String(err);
        status.style.color = '#b91c1c';
      }
    }
  }

  function bindBox(box) {
    if (box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    box.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'mpet-branch') syncBranchOut();
    });
    box.addEventListener('click', (e) => {
      const id = e.target?.id;
      if (id === 'mpet-btn-preview') run('preview');
      else if (id === 'mpet-btn-docx') runDocx();
      else if (id === 'mpet-btn-generate') run('download');
      else if (id === 'mpet-btn-preview-close') closePreview();
      else if (id === 'mpet-btn-preview-tab') {
        if (previewUrl) window.open(previewUrl, '_blank');
      } else if (id === 'mpet-btn-ai') runAiPolish();
      else if (id === 'mpet-ai-undo') runAiUndo();
      else if (id === 'mpet-btn-clear') {
        box.querySelectorAll('input, textarea, select').forEach((el) => {
          if (el.readOnly) return;
          if (el.tagName === 'SELECT') el.selectedIndex = 0;
          else el.value = '';
        });
        if ($('mpet-matter')) $('mpet-matter').value = '租賃事件';
        fillDateDefaults();
        syncBranchOut();
        closePreview();
        aiReset();
        if ($('mpet-status')) {
          $('mpet-status').textContent = '';
          $('mpet-status').style.color = '';
        }
      }
    });
  }

  window.initMediationPetition = function () {
    const box = $('mpet-box');
    if (!box) return;
    bindBox(box);
    fillBranchOptions();
    fillDateDefaults();
    syncBranchOut();
  };

  window.mediationPetitionFormHtml = function () {
    return '' +
      '<div class="nrpbox" id="mpet-box">' +
        '<h3>📄 調解聲請書套版產生器</h3>' +
        '<p class="nrp-tip">正式送件請按<b>「下載 Word 官方格式」</b>（套你提供的原檔）。聲請人固定<b>' + esc(FIXED_COMPANY) + '／' + esc(FIXED_REP) + '／' + esc(FIXED_TAX) + '</b>。管轄以<b>對造住所地</b>為準；概要可 AI 潤飾。' +
          '　<a href="' + esc(resolveAssetUrl(BLANK_DOCX)) + '" download>空白原檔 ↘</a></p>' +
        '<div class="nrp-sec">' +
          '<h4>聲請人（固定）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>公司名稱</span><input type="text" value="' + esc(FIXED_COMPANY) + '" readonly /></label>' +
            '<label class="nrp-field"><span>法定代理人</span><input type="text" value="' + esc(FIXED_REP) + '" readonly /></label>' +
            '<label class="nrp-field"><span>營業處<span class="req">*</span></span>' +
              '<select id="mpet-branch"><option value="">－ 請選擇營業處 －</option></select></label>' +
            '<label class="nrp-field"><span>帶入住所</span><span id="mpet-addr-out" class="nrp-tip" style="margin:0;display:block;padding:8px 0">選營業處後帶入住所</span></label>' +
            '<label class="nrp-field span2"><span>帶入電話</span><span id="mpet-phone-out" class="nrp-tip" style="margin:0;display:block;padding:8px 0">選營業處後帶入電話</span></label>' +
            '<label class="nrp-field"><span>委任代理人（業務）</span><input id="mpet-agent" type="text" placeholder="選填；有委任書再填" /></label>' +
            '<label class="nrp-field"><span>統一編號</span><input type="text" value="' + esc(FIXED_TAX) + '" readonly /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>對造人（房客）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>對造姓名<span class="req">*</span></span><input id="mpet-opponent" type="text" placeholder="房客姓名" /></label>' +
            '<label class="nrp-field"><span>對造電話</span><input id="mpet-opponent-phone" type="tel" placeholder="選填" /></label>' +
            '<label class="nrp-field span2"><span>對造住所<span class="req">*</span></span><input id="mpet-opponent-addr" type="text" placeholder="戶籍／住居所（決定調解會管轄）" /></label>' +
            '<label class="nrp-field"><span>第二對造（選填）</span><input id="mpet-opponent2" type="text" placeholder="連帶債務人等" /></label>' +
            '<label class="nrp-field"><span>第二對造電話</span><input id="mpet-opponent2-phone" type="tel" /></label>' +
            '<label class="nrp-field span2"><span>第二對造住所</span><input id="mpet-opponent2-addr" type="text" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>事件與調解會</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>事件名稱</span><input id="mpet-matter" type="text" placeholder="租賃事件" value="租賃事件" /></label>' +
            '<label class="nrp-field"><span>縣（市）<span class="req">*</span></span><input id="mpet-city" type="text" placeholder="例：桃園市" /></label>' +
            '<label class="nrp-field"><span>鄉（鎮、市、區）<span class="req">*</span></span><input id="mpet-town" type="text" placeholder="例：桃園區" /></label>' +
            '<label class="nrp-field span2"><span>事件概要與願接受條件<span class="req">*</span></span>' +
              '<textarea id="mpet-summary" rows="6" placeholder="先用自己的話寫欠租期間、金額、催繳經過與希望調解條件，再按下方「AI 潤飾」。"></textarea>' +
              '<div class="nrp-ai-bar">' +
                '<button type="button" id="mpet-btn-ai">✨ AI 潤飾</button>' +
                '<button type="button" class="soft" id="mpet-ai-undo" hidden>復原</button>' +
                '<p id="mpet-ai-msg" class="nrp-ai-msg"></p>' +
              '</div>' +
            '</label>' +
            '<label class="nrp-field span2"><span>證物名稱及件數</span>' +
              '<textarea id="mpet-evidence" rows="2" placeholder="例：租賃契約影本 1 份、存證信函及回執 1 份、欠租明細 1 份"></textarea></label>' +
            '<label class="nrp-field span2"><span>聲請調查證據</span>' +
              '<textarea id="mpet-investigate" rows="2" placeholder="選填；證人姓名、住居所或請求調查事項"></textarea></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>聲請日期</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>民國年<span class="req">*</span></span><input id="mpet-y" type="number" /></label>' +
            '<label class="nrp-field"><span>月<span class="req">*</span></span><input id="mpet-m" type="number" min="1" max="12" /></label>' +
            '<label class="nrp-field"><span>日<span class="req">*</span></span><input id="mpet-d" type="number" min="1" max="31" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-actions">' +
          '<button type="button" id="mpet-btn-docx">下載 Word 官方格式</button>' +
          '<button type="button" id="mpet-btn-preview">PDF 預覽</button>' +
          '<button type="button" class="soft" id="mpet-btn-generate">下載 PDF</button>' +
          '<button type="button" class="soft" id="mpet-btn-clear">清除欄位</button>' +
          '<p id="mpet-status"></p>' +
        '</div>' +
        '<div id="mpet-preview-wrap" class="nrp-preview-wrap" hidden>' +
          '<div class="nrp-preview-bar">' +
            '<strong>📄 調解聲請書預覽</strong>' +
            '<span class="nrp-preview-actions">' +
              '<button type="button" id="mpet-btn-preview-tab" class="soft">另開分頁</button>' +
              '<button type="button" id="mpet-btn-preview-close" class="soft">關閉預覽</button>' +
            '</span>' +
          '</div>' +
          '<iframe id="mpet-preview-frame" title="調解聲請書預覽"></iframe>' +
        '</div>' +
        '<p class="nrp-foot">※ 正式送件用 Word 官方格式列印蓋章；PDF 僅供畫面預覽。送件請附對造繕本。</p>' +
      '</div>';
  };
})();
