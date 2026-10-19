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
    const ink = PDFLib.rgb(0.08, 0.1, 0.14);
    const muted = PDFLib.rgb(0.35, 0.38, 0.45);

    const draw = (text, x, y, size, color) => {
      page.drawText(String(text || ''), { x, y, size, font, color: color || ink });
    };

    let y = H - 42;
    const title = '委　　任　　書';
    const ts = 22;
    draw(title, (W - font.widthOfTextAtSize(title, ts)) / 2, y, ts);
    y -= 22;

    const caseLine = (d.caseY || '　　') + '年民調字第' + (d.caseNo || '　　　　') + '號';
    draw(caseLine, W - 48 - font.widthOfTextAtSize(caseLine, 11), y, 11, muted);
    y -= 18;

    /* 表格：左稱謂｜姓名｜性別｜出生｜身分證｜住所｜電話 */
    const L = 36;
    const R = W - 36;
    const tableW = R - L;
    const cols = [
      { key: 'role', w: 28, label: '' },
      { key: 'name', w: 118, label: '姓名（或名稱）' },
      { key: 'sex', w: 28, label: '性別' },
      { key: 'birth', w: 72, label: '出生年月日' },
      { key: 'id', w: 88, label: '身分證字號' },
      { key: 'addr', w: 150, label: '住所或居所（事務所或營業所）' },
      { key: 'tel', w: tableW - 28 - 118 - 28 - 72 - 88 - 150, label: '連絡電話' }
    ];
    const headH = 28;
    const rowH = 78;

    const drawCellText = (text, x, cy, w, h, size) => {
      const pad = 4;
      const lines = wrapLines(font, text, size, w - pad * 2);
      let ty = cy + h - pad - size;
      for (const line of lines.slice(0, 5)) {
        draw(line, x + pad, ty, size);
        ty -= size + 2;
      }
    };

    const drawTableRow = (top, h, cells, isHead) => {
      let x = L;
      page.drawRectangle({
        x: L, y: top - h, width: tableW, height: h,
        borderWidth: 1, borderColor: ink
      });
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (i > 0) {
          page.drawLine({
            start: { x, y: top },
            end: { x, y: top - h },
            thickness: 0.9,
            color: ink
          });
        }
        const t = cells[c.key] || '';
        drawCellText(t, x, top - h, c.w, h, isHead ? 8.5 : 10);
        x += c.w;
      }
    };

    drawTableRow(y, headH, {
      role: '',
      name: '姓名（或名稱）',
      sex: '性別',
      birth: '出生年月日',
      id: '身分證字號',
      addr: '住所或居所（事務所或營業所）',
      tel: '連絡電話'
    }, true);
    y -= headH;

    const principalName = FIXED_COMPANY + '\n法定代理人\n' + FIXED_REP;
    drawTableRow(y, rowH, {
      role: '委\n任\n人',
      name: principalName,
      sex: '',
      birth: '',
      id: '',
      addr: d.addr,
      tel: d.phone
    }, false);
    y -= rowH;

    drawTableRow(y, rowH, {
      role: '受\n任\n人',
      name: d.agent,
      sex: '',
      birth: '',
      id: '',
      addr: '同上',
      tel: d.agentPhone || ''
    }, false);
    y -= rowH + 18;

    const bodySize = 12;
    const bodyMax = tableW;
    const body1 = '茲因' + FIXED_COMPANY + '與' + d.opponent + '間' + d.matter + '調解事件，委任' + d.agent + '為代理人，有代理為一切調解行為之權，並有同意調解條件、撤回、捨棄、領取所爭物或選任代理人等特別代理權。';
    for (const line of wrapLines(font, body1, bodySize, bodyMax)) {
      draw(line, L, y, bodySize);
      y -= 20;
    }
    y -= 8;
    draw('此　致', L, y, bodySize);
    y -= 22;
    draw(d.committee, L, y, bodySize);
    y -= 36;

    draw('委任人：' + FIXED_COMPANY + '　　（公司大章）', L, y, 11);
    y -= 18;
    draw('法定代理人：' + FIXED_REP + '　　（負責人小章／簽名）', L, y, 11);
    y -= 22;
    draw('受任人：' + d.agent + '　　（簽名或蓋章）', L, y, 11);
    y -= 28;
    draw('中　華　民　國　　' + d.y + '　　年　　' + d.m + '　　月　　' + d.d + '　　日', L, y, 11);
    y -= 28;

    draw('※ 委任人／受任人：性別、出生年月日、身分證字號欄位留白，列印後手填。', L, y, 9, muted);
    y -= 14;
    draw('※ 委任人住所／電話已依營業處帶入；受任人住所印「同上」。', L, y, 9, muted);

    return new Uint8Array(await doc.save());
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
        if (status) status.textContent = '預覽已就緒，確認後下載列印並蓋大小章。';
        return;
      }
      const fn = `調解委任書_${d.agent}_${d.y}${String(d.m).padStart(2, '0')}${String(d.d).padStart(2, '0')}.pdf`;
      downloadPdf(bytes, fn);
      if (status) status.textContent = '已下載 PDF。列印後手填身分證／生日，並蓋公司大章＋負責人小章。';
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
        '<p class="nrp-tip">委任人固定<b>星鴻股份有限公司／法定代理人吳宗霖</b>。住所／電話依營業處帶入；受任人填業務。性別／生日／身分證欄位留白，列印後手填。</p>' +
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
          '<button type="button" id="mpoa-btn-preview">預覽</button>' +
          '<button type="button" id="mpoa-btn-generate">產生 PDF（下載列印）</button>' +
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
        '<p class="nrp-foot">※ 性別／生日／身分證不套版、列印後手填；委任人蓋公司大章＋負責人小章；受任人（業務）簽名。</p>' +
      '</div>';
  };
})();
