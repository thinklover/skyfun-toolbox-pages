/**
 * 戶籍謄本委託書產生器（套版：戶籍謄本.doc）
 * 申請人／委託人固定套公司名義，寫明公司名稱＋負責人姓名；列印後蓋公司大章＋負責人小章。
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

  const FIXED_REP = '吳宗霖';

  const COMPANY_PRESETS = {
    '星鴻股份有限公司': {
      taxId: '85103034',
      branches: [
        { id: 'hq', name: '企業總部', phone: '(02) 7755-2669' },
        { id: 'tp', name: '台北分公司', phone: '0809-092-122' },
        { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773' },
        { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368' },
        { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397' },
        { id: 'tn', name: '台南分公司', phone: '(06) 703-2305' },
        { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955' },
        { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937' },
        { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705' },
        { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851' },
        { id: 'changhua', name: '彰化分公司', phone: '(04) 706-0725' },
        { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327' }
      ]
    },
    '星華股份有限公司': {
      taxId: '',
      branches: [
        { id: 'tp', name: '台北分公司', phone: '0809-092-122' },
        { id: 'chiayi', name: '嘉義分公司', phone: '(05) 320-9119' }
      ]
    }
  };

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
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=hpoa'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=hpoa'));
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
          } catch { /* try next */ }
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

  function mark(on) { return on ? '■' : '□'; }

  function selectedBranchPhone() {
    const company = val('hpoa-company') || '星鴻股份有限公司';
    const branches = (COMPANY_PRESETS[company] || {}).branches || [];
    const id = val('hpoa-branch');
    const hit = branches.find((b) => b.id === id);
    return hit ? hit.phone : '';
  }

  function collectData() {
    const t = todayRocParts();
    const company = val('hpoa-company') || '星鴻股份有限公司';
    const preset = COMPANY_PRESETS[company] || {};
    return {
      company,
      repName: FIXED_REP,
      taxId: val('hpoa-taxid') || preset.taxId || '',
      companyPhone: selectedBranchPhone(),
      agentName: val('hpoa-agent'),
      agentId: val('hpoa-agent-id'),
      agentPhone: val('hpoa-agent-phone'),
      copies: Math.max(1, parseInt(val('hpoa-copies'), 10) || 1),
      y: val('hpoa-y') || String(t.y),
      m: val('hpoa-m') || String(t.m),
      d: val('hpoa-d') || String(t.day)
    };
  }

  function validate(d) {
    const miss = [];
    if (!d.company) miss.push('公司名稱');
    if (!val('hpoa-branch') || !d.companyPhone) miss.push('營業處（電話）');
    if (!d.agentName) miss.push('受委託人（代理人）姓名');
    return miss;
  }

  function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function closePreview() {
    revokePreview();
    const wrap = $('hpoa-preview-wrap');
    const frame = $('hpoa-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) wrap.hidden = true;
  }

  function showPreview(bytes) {
    revokePreview();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewUrl = URL.createObjectURL(blob);
    const wrap = $('hpoa-preview-wrap');
    const frame = $('hpoa-preview-frame');
    if (frame) frame.src = previewUrl;
    if (wrap) wrap.hidden = false;
  }

  function openPreviewTab() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
  }

  async function buildPdf(fontBytes, d) {
    const PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error('PDF 函式庫未載入');
    if (!window.fontkit) throw new Error('字型引擎未載入');

    const doc = await PDFLib.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const L = 48;
    let y = height - 52;

    const draw = (text, x, yy, size, opts) => {
      page.drawText(String(text || ''), {
        x, y: yy, size, font,
        color: PDFLib.rgb(0.08, 0.1, 0.14),
        ...(opts || {})
      });
    };

    const line = (yy, gap) => {
      y = yy - (gap == null ? 18 : gap);
      return y;
    };

    // Title
    const title = '委    託    書';
    const titleSize = 20;
    const tw = font.widthOfTextAtSize(title, titleSize);
    draw(title, (width - tw) / 2, y, titleSize);
    y = line(y, 28);

    draw('本人因： ' + mark(true) + '工作     ' + mark(false) + '行動不便', L, y, 11);
    y = line(y, 16);
    draw('         ' + mark(false) + '路途遙遠 ' + mark(false) + '生病  ' + mark(false) + '其他：', L, y, 11);
    y = line(y, 20);
    draw('無法前往辦理：', L, y, 11);
    y = line(y, 18);

    const items = [
      mark(false) + ' 1.遷徙登記(遷徙者姓名：　　　　　　　　　　　　　　)',
      mark(false) + ' 2.國民身分證換領。',
      mark(false) + ' 3.初、補、換領戶口名簿',
      mark(true) + ' 4.' + mark(true) + '全戶戶籍謄本    ' + d.copies + '    份',
      '   ' + mark(false) + '部分戶籍謄本        份(姓名：　　　　　　　　　　　　)',
      '   ' + mark(true) + '記事不省略   ' + mark(false) + '記事省略',
      mark(false) + ' 5.門牌',
      mark(false) + ' 6.桃園市N合一及內政部戶籍資料異動跨機關通報服務',
      mark(false) + ' 7.其他'
    ];
    items.forEach((t) => {
      draw(t, L, y, 10.5);
      y = line(y, 16);
    });

    y = line(y, 10);
    const agentLine = '特委託　' + (d.agentName || '　　　　') + '　代為申辦；另有關違反戶籍事項應繳納之行政罰鍰一併委託。';
    draw(agentLine, L, y, 11);
    y = line(y, 26);

    // 委託人（公司）
    draw('委 託 人（申請人／公司名義）：', L, y, 11);
    y = line(y, 18);
    draw(d.company + '（負責人：' + (d.repName || '　　　') + '）　　（簽章）', L, y, 11);
    y = line(y, 18);
    draw('統一編號：' + (d.taxId || '　　　　　　'), L, y, 11);
    y = line(y, 18);
    draw('電　　話：' + (d.companyPhone || '　　　　　　'), L, y, 11);
    y = line(y, 24);

    draw('受委託人：' + (d.agentName || '　　　　　　　　') + '　　　　　　（簽章）', L, y, 11);
    y = line(y, 18);
    draw('國民身分證統一編號：' + (d.agentId || '　　　　　　　　'), L, y, 11);
    y = line(y, 18);
    draw('電　　話：' + (d.agentPhone || '　　　　　　'), L, y, 11);
    y = line(y, 26);

    draw('中　華　民　國　　' + d.y + '　　年　　' + d.m + '　　月　　' + d.d + '　　日', L, y, 11);
    y = line(y, 28);

    draw('說明：', L, y, 10);
    y = line(y, 15);
    const notes = [
      '一、原因請於□中以（ˇ）方式填寫；本套版已依公司申請全戶戶籍謄本預先勾選。',
      '二、本委託書套版出自戶政「戶籍謄本」委託書；申請人已套公司名義。',
      '三、請領印鑑請以專用「委任書」。'
    ];
    notes.forEach((t) => {
      draw(t, L, y, 9);
      y = line(y, 14);
    });

    return new Uint8Array(await doc.save());
  }

  async function makePdf(mode) {
    const status = $('hpoa-status');
    const btnGen = $('hpoa-btn-generate');
    const btnPrev = $('hpoa-btn-preview');
    const d = collectData();
    const miss = validate(d);
    if (miss.length) {
      alert('請填寫：' + miss.join('、'));
      return;
    }
    try {
      if (status) status.textContent = mode === 'preview' ? '產生預覽中…' : '載入字型中…';
      if (btnGen) btnGen.disabled = true;
      if (btnPrev) btnPrev.disabled = true;
      const fontBytes = await getFontBytes(status);
      if (status) status.textContent = '繪製委託書中…';
      const bytes = await buildPdf(fontBytes, d);
      if (mode === 'preview') {
        showPreview(bytes);
        if (status) status.textContent = '預覽已就緒，確認後再下載列印並蓋大小章。';
        return;
      }
      const stamp = new Date();
      const fn = `戶籍謄本委託書_${d.company}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.pdf`;
      downloadPdf(bytes, fn);
      if (status) status.textContent = '已產生 PDF，請列印後蓋公司大章＋負責人小章。';
    } catch (e) {
      console.error(e);
      alert('產生失敗：' + (e?.message || e));
      if (status) status.textContent = '';
    } finally {
      if (btnGen) btnGen.disabled = false;
      if (btnPrev) btnPrev.disabled = false;
    }
  }

  function fillBranchSelect(keepId) {
    const company = val('hpoa-company') || '星鴻股份有限公司';
    const branches = (COMPANY_PRESETS[company] || {}).branches || [];
    const sel = $('hpoa-branch');
    const phoneOut = $('hpoa-phone-out');
    if (!sel) return;
    const prev = keepId != null ? keepId : val('hpoa-branch');
    sel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
      branches.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '　' + esc(b.phone) + '</option>').join('');
    const ok = branches.some((b) => b.id === prev);
    sel.value = ok ? prev : '';
    if (phoneOut) phoneOut.textContent = selectedBranchPhone() || '選營業處後帶入電話';
  }

  function onCompanyChange() {
    const company = val('hpoa-company');
    const preset = COMPANY_PRESETS[company] || {};
    const tax = $('hpoa-taxid');
    const rep = $('hpoa-rep');
    if (tax && preset.taxId != null) tax.value = preset.taxId;
    if (rep) rep.value = FIXED_REP;
    fillBranchSelect('');
  }

  function onBranchChange() {
    const phoneOut = $('hpoa-phone-out');
    if (phoneOut) phoneOut.textContent = selectedBranchPhone() || '選營業處後帶入電話';
  }

  function fillDateDefaults() {
    const t = todayRocParts();
    if ($('hpoa-y') && !$('hpoa-y').value) $('hpoa-y').value = String(t.y);
    if ($('hpoa-m') && !$('hpoa-m').value) $('hpoa-m').value = String(t.m);
    if ($('hpoa-d') && !$('hpoa-d').value) $('hpoa-d').value = String(t.day);
  }

  function bindBox(box) {
    if (!box || box.getAttribute('data-bound') === '1') return;
    box.setAttribute('data-bound', '1');
    box.addEventListener('change', (e) => {
      const id = e.target && e.target.id;
      if (id === 'hpoa-company') onCompanyChange();
      else if (id === 'hpoa-branch') onBranchChange();
    });
    box.addEventListener('click', (e) => {
      const id = e.target && e.target.id;
      if (id === 'hpoa-btn-preview') makePdf('preview');
      else if (id === 'hpoa-btn-generate') makePdf('download');
      else if (id === 'hpoa-btn-preview-tab') openPreviewTab();
      else if (id === 'hpoa-btn-preview-close') closePreview();
      else if (id === 'hpoa-btn-clear') {
        ['hpoa-agent', 'hpoa-agent-id', 'hpoa-agent-phone'].forEach((i) => {
          if ($(i)) $(i).value = '';
        });
        if ($('hpoa-copies')) $('hpoa-copies').value = '1';
        if ($('hpoa-company')) $('hpoa-company').value = '星鴻股份有限公司';
        onCompanyChange();
        fillDateDefaults();
        closePreview();
        if ($('hpoa-status')) $('hpoa-status').textContent = '';
      }
    });
  }

  window.initHouseholdPoa = function () {
    const box = $('hpoa-box');
    bindBox(box);
    onCompanyChange();
    fillDateDefaults();
  };

  window.householdPoaFormHtml = function () {
    const companies = Object.keys(COMPANY_PRESETS);
    return '' +
      '<div class="nrpbox" id="hpoa-box">' +
        '<h3>📄 戶籍謄本委託書產生器（公司名義）</h3>' +
        '<p class="nrp-tip">套版依戶政「戶籍謄本」委託書。申請人／委託人已套公司；負責人固定吳宗霖。請選營業處並填受委託人（業務），列印後蓋公司大章＋負責人小章。</p>' +
        '<div class="nrp-sec">' +
          '<h4>委託人（公司／申請人）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>公司名稱<span class="req">*</span></span>' +
              '<select id="hpoa-company">' +
                companies.map((c) => '<option value="' + esc(c) + '"' + (c === '星鴻股份有限公司' ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
              '</select></label>' +
            '<label class="nrp-field"><span>負責人姓名<span class="req">*</span></span><input id="hpoa-rep" type="text" value="' + esc(FIXED_REP) + '" readonly /></label>' +
            '<label class="nrp-field"><span>統一編號</span><input id="hpoa-taxid" type="text" placeholder="自動帶入，可改" /></label>' +
            '<label class="nrp-field"><span>營業處（電話）<span class="req">*</span></span>' +
              '<select id="hpoa-branch"><option value="">－ 請選擇營業處 －</option></select></label>' +
            '<label class="nrp-field"><span>帶入電話</span><span id="hpoa-phone-out" class="nrp-tip" style="margin:0;display:block;padding:8px 0">選營業處後帶入電話</span></label>' +
            '<label class="nrp-field"><span>全戶戶籍謄本份數</span><input id="hpoa-copies" type="number" min="1" value="1" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>受委託人（代理人／業務）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>姓名<span class="req">*</span></span><input id="hpoa-agent" type="text" placeholder="實際到戶政辦理的業務姓名" /></label>' +
            '<label class="nrp-field"><span>身分證字號</span><input id="hpoa-agent-id" type="text" placeholder="代理人身分證字號" /></label>' +
            '<label class="nrp-field span2"><span>電話</span><input id="hpoa-agent-phone" type="tel" placeholder="代理人聯絡電話" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>日期</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>民國年</span><input id="hpoa-y" type="number" /></label>' +
            '<label class="nrp-field"><span>月</span><input id="hpoa-m" type="number" min="1" max="12" /></label>' +
            '<label class="nrp-field"><span>日</span><input id="hpoa-d" type="number" min="1" max="31" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-actions">' +
          '<button type="button" id="hpoa-btn-preview">預覽</button>' +
          '<button type="button" id="hpoa-btn-generate">產生 PDF（下載列印）</button>' +
          '<button type="button" class="soft" id="hpoa-btn-clear">清除欄位</button>' +
          '<p id="hpoa-status"></p>' +
        '</div>' +
        '<div id="hpoa-preview-wrap" class="nrp-preview-wrap" hidden>' +
          '<div class="nrp-preview-bar">' +
            '<strong>📄 戶籍謄本委託書預覽</strong>' +
            '<span class="nrp-preview-actions">' +
              '<button type="button" id="hpoa-btn-preview-tab" class="soft">另開分頁</button>' +
              '<button type="button" id="hpoa-btn-preview-close" class="soft">關閉預覽</button>' +
            '</span>' +
          '</div>' +
          '<iframe id="hpoa-preview-frame" title="戶籍謄本委託書預覽"></iframe>' +
        '</div>' +
        '<p class="nrp-foot">※ 列印後委託人欄蓋公司大章＋負責人小章。變更登記表影本請註記「與正本相符」並蓋同章。</p>' +
      '</div>';
  };
})();
