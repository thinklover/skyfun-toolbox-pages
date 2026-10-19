/**
 * 民事補正狀（簡版）— 補正相對人戶籍謄本
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
  const CASE_WORD_DEFAULT = '司票';

  const COURT_REGIONS = [
    '臺北', '新北', '士林', '基隆', '宜蘭', '桃園', '新竹', '苗栗',
    '臺中', '南投', '彰化', '雲林', '嘉義', '臺南', '高雄', '橋頭',
    '屏東', '臺東', '花蓮', '澎湖', '金門', '連江'
  ];

  const COMPANY_PRESETS = {
    '星鴻股份有限公司': {
      branches: [
        { id: 'hq', name: '企業總部', phone: '(02) 7755-2669', addr: '台北市萬華區中華路一段106號' },
        { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '台北市大同區重慶北路一段26巷9弄1號4樓' },
        { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '桃園市中壢區環北路400號13樓之6' },
        { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '台中市北屯區文心路四段698號6樓之1' },
        { id: 'tc-2', name: '台中營業二處', phone: '(04) 3707-2397', addr: '台中市南區忠明南路789號8樓之2' },
        { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '台南市北區成功路54號11樓之1' },
        { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '高雄市前鎮區一心一路239號11樓之2' },
        { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '新竹縣竹北市光明五街342號2樓' },
        { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '宜蘭縣宜蘭市舊城北路154號2樓' },
        { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '基隆市中正區義二路196號' },
        { id: 'changhua', name: '彰化分公司', phone: '(04) 706-0725', addr: '' },
        { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '南投縣草屯鎮中正路755號7樓之1' }
      ]
    },
    '星華股份有限公司': {
      branches: [
        { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '台北市大同區重慶北路一段26巷9弄1號4樓' },
        { id: 'chiayi', name: '嘉義分公司', phone: '(05) 320-9119', addr: '嘉義市西區上海路175號2樓' }
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
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=csp'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=csp'));
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
    const company = val('csp-company') || '星鴻股份有限公司';
    const branches = (COMPANY_PRESETS[company] || {}).branches || [];
    return branches.find((b) => b.id === val('csp-branch')) || null;
  }

  function moneyText(n) {
    const v = Number(String(n || '').replace(/[^\d]/g, '')) || 0;
    return v ? v.toLocaleString('zh-TW') : '';
  }

  function collectData() {
    const t = todayRocParts();
    const branch = selectedBranch();
    return {
      caseYear: val('csp-case-y') || String(t.y),
      caseWord: val('csp-case-word') || CASE_WORD_DEFAULT,
      caseNo: val('csp-case-no'),
      division: val('csp-division'),
      amount: moneyText(val('csp-amount')),
      court: val('csp-court') || '桃園',
      company: val('csp-company') || '星鴻股份有限公司',
      addr: (branch && branch.addr) || val('csp-addr') || '',
      repName: FIXED_REP,
      agentName: val('csp-agent'),
      debtorName: val('csp-debtor'),
      filingY: val('csp-filing-y') || String(t.y),
      filingM: val('csp-filing-m') || String(t.m),
      filingD: val('csp-filing-d') || String(t.day)
    };
  }

  function validate(d) {
    const miss = [];
    if (!d.caseNo) miss.push('案號');
    if (!d.division) miss.push('股別');
    if (!d.court) miss.push('法院');
    if (!d.company) miss.push('具狀人');
    if (!val('csp-branch') && !d.addr) miss.push('營業處');
    if (!d.debtorName) miss.push('相對人');
    if (!d.agentName) miss.push('撰狀人');
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
    const wrap = $('csp-preview-wrap');
    const frame = $('csp-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) wrap.hidden = true;
  }

  function showPreview(bytes) {
    revokePreview();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewUrl = URL.createObjectURL(blob);
    const wrap = $('csp-preview-wrap');
    const frame = $('csp-preview-frame');
    if (frame) frame.src = previewUrl;
    if (wrap) wrap.hidden = false;
  }

  function openPreviewTab() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
  }

  function wrapLines(font, text, size, maxW) {
    const chars = Array.from(String(text || ''));
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      const next = cur + ch;
      if (font.widthOfTextAtSize(next, size) > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else cur = next;
    }
    if (cur) lines.push(cur);
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
    const { width, height } = page.getSize();
    const L = 64;
    const maxW = width - L * 2;
    let y = height - 64;
    const ink = PDFLib.rgb(0.08, 0.1, 0.14);
    const size = 13;
    const lh = 24;

    const draw = (text, x, yy, sz) => {
      page.drawText(String(text || ''), { x, y: yy, size: sz || size, font, color: ink });
    };

    const line = (text, indent) => {
      const pad = indent || 0;
      wrapLines(font, text, size, maxW - pad).forEach((t) => {
        draw(t, L + pad, y, size);
        y -= lh;
      });
    };

    const blank = (n) => { y -= n; };

    const title = '民 事 補 正 狀';
    draw(title, (width - font.widthOfTextAtSize(title, 22)) / 2, y, 22);
    blank(36);

    line(`案號： ${d.caseYear} 年度　${d.caseWord}　字第　${d.caseNo}　號`);
    line(`承辦股別： ${d.division}股`);
    line(`訴訟標的金額或價額：新臺幣${d.amount || '　　　　'} 元`);
    blank(16);

    line('聲請人收受貴院通知命補正下列事項，為此具狀補正：');
    blank(10);
    line(`1.相對人${d.debtorName}最新現戶戶籍謄本正本乙份`);
    blank(28);

    line('　　此　致');
    line(`臺灣${d.court}地方法院　公鑒`);
    blank(28);

    line(`中華民國　${d.filingY}　年　${d.filingM}　月　${d.filingD}　日`);
    blank(28);

    line(`具狀人：${d.company} (簽名蓋章)`);
    line(`法定代理人：${d.repName}`);
    if (d.agentName) line(`撰狀人：${d.agentName}`);

    return new Uint8Array(await doc.save());
  }

  async function makePdf(mode) {
    const status = $('csp-status');
    const btnGen = $('csp-btn-generate');
    const btnPrev = $('csp-btn-preview');
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
      if (status) status.textContent = '繪製補正狀中…';
      const bytes = await buildPdf(fontBytes, d);
      if (mode === 'preview') {
        showPreview(bytes);
        if (status) status.textContent = '預覽已就緒。';
        return;
      }
      const stamp = new Date();
      const fn = `民事補正狀_戶籍謄本_${d.debtorName || '案件'}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.pdf`;
      downloadPdf(bytes, fn);
      if (status) status.textContent = '已產生 PDF，請列印蓋章並附戶籍謄本正本。';
    } catch (e) {
      console.error(e);
      alert('產生失敗：' + (e?.message || e));
      if (status) status.textContent = '';
    } finally {
      if (btnGen) btnGen.disabled = false;
      if (btnPrev) btnPrev.disabled = false;
    }
  }

  function fillBranchSelect() {
    const company = val('csp-company') || '星鴻股份有限公司';
    const branches = (COMPANY_PRESETS[company] || {}).branches || [];
    const sel = $('csp-branch');
    if (!sel) return;
    const prev = val('csp-branch');
    sel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
      branches.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>').join('');
    sel.value = branches.some((b) => b.id === prev) ? prev : '';
  }

  function onCompanyChange() {
    if ($('csp-rep')) $('csp-rep').value = FIXED_REP;
    fillBranchSelect();
  }

  function fillDefaults() {
    const t = todayRocParts();
    if ($('csp-case-y') && !$('csp-case-y').value) $('csp-case-y').value = String(t.y);
    if ($('csp-case-word') && !$('csp-case-word').value) $('csp-case-word').value = CASE_WORD_DEFAULT;
    if ($('csp-filing-y') && !$('csp-filing-y').value) $('csp-filing-y').value = String(t.y);
    if ($('csp-filing-m') && !$('csp-filing-m').value) $('csp-filing-m').value = String(t.m);
    if ($('csp-filing-d') && !$('csp-filing-d').value) $('csp-filing-d').value = String(t.day);
    if ($('csp-rep')) $('csp-rep').value = FIXED_REP;
  }

  function bindBox(box) {
    if (!box || box.getAttribute('data-bound') === '1') return;
    box.setAttribute('data-bound', '1');
    box.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'csp-company') onCompanyChange();
    });
    box.addEventListener('click', (e) => {
      const id = e.target && e.target.id;
      if (id === 'csp-btn-preview') makePdf('preview');
      else if (id === 'csp-btn-generate') makePdf('download');
      else if (id === 'csp-btn-preview-tab') openPreviewTab();
      else if (id === 'csp-btn-preview-close') closePreview();
      else if (id === 'csp-btn-clear') {
        ['csp-case-no', 'csp-division', 'csp-amount', 'csp-agent', 'csp-debtor'].forEach((i) => {
          if ($(i)) $(i).value = '';
        });
        if ($('csp-company')) $('csp-company').value = '星鴻股份有限公司';
        if ($('csp-court')) $('csp-court').value = '桃園';
        onCompanyChange();
        fillDefaults();
        closePreview();
        if ($('csp-status')) $('csp-status').textContent = '';
      }
    });
  }

  window.initCivilSupplementPetition = function () {
    bindBox($('csp-box'));
    onCompanyChange();
    fillDefaults();
  };

  window.civilSupplementPetitionFormHtml = function () {
    const companies = Object.keys(COMPANY_PRESETS);
    const courtOpts = COURT_REGIONS.map((r) =>
      '<option value="' + esc(r) + '"' + (r === '桃園' ? ' selected' : '') + '>' + esc(r) + '</option>'
    ).join('');
    return '' +
      '<div class="nrpbox" id="csp-box">' +
        '<h3>📄 民事補正狀（戶籍謄本）</h3>' +
        '<p class="nrp-tip">補正相對人最新現戶戶籍謄本。法定代理人固定吳宗霖。</p>' +
        '<div class="nrp-sec">' +
          '<h4>案號</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>年度<span class="req">*</span></span><input id="csp-case-y" type="text" inputmode="numeric" /></label>' +
            '<label class="nrp-field"><span>字別</span><input id="csp-case-word" type="text" value="司票" /></label>' +
            '<label class="nrp-field"><span>字號<span class="req">*</span></span><input id="csp-case-no" type="text" placeholder="司票字第後方數字" /></label>' +
            '<label class="nrp-field"><span>股別<span class="req">*</span></span><input id="csp-division" type="text" placeholder="右上方承辦人之股別" /></label>' +
            '<label class="nrp-field"><span>訴訟標的金額（元）</span><input id="csp-amount" type="text" inputmode="numeric" placeholder="可空白" /></label>' +
            '<label class="nrp-field"><span>法院<span class="req">*</span></span><select id="csp-court">' + courtOpts + '</select></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>聲請人／相對人</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>公司<span class="req">*</span></span><select id="csp-company">' +
              companies.map((c) => '<option value="' + esc(c) + '"' + (c === '星鴻股份有限公司' ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
            '</select></label>' +
            '<label class="nrp-field"><span>營業處<span class="req">*</span></span><select id="csp-branch"><option value="">－ 請選擇 －</option></select></label>' +
            '<label class="nrp-field"><span>法定代理人</span><input id="csp-rep" type="text" value="' + esc(FIXED_REP) + '" readonly /></label>' +
            '<label class="nrp-field"><span>撰狀人<span class="req">*</span></span><input id="csp-agent" type="text" placeholder="業務姓名" /></label>' +
            '<label class="nrp-field span2"><span>相對人<span class="req">*</span></span><input id="csp-debtor" type="text" placeholder="承租人姓名" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>具狀日</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>年</span><input id="csp-filing-y" type="number" /></label>' +
            '<label class="nrp-field"><span>月</span><input id="csp-filing-m" type="number" min="1" max="12" /></label>' +
            '<label class="nrp-field"><span>日</span><input id="csp-filing-d" type="number" min="1" max="31" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-actions">' +
          '<button type="button" id="csp-btn-preview">預覽</button>' +
          '<button type="button" id="csp-btn-generate">產生 PDF</button>' +
          '<button type="button" class="soft" id="csp-btn-clear">清除</button>' +
          '<p id="csp-status"></p>' +
        '</div>' +
        '<div id="csp-preview-wrap" class="nrp-preview-wrap" hidden>' +
          '<div class="nrp-preview-bar">' +
            '<strong>📄 民事補正狀預覽</strong>' +
            '<span class="nrp-preview-actions">' +
              '<button type="button" id="csp-btn-preview-tab" class="soft">另開分頁</button>' +
              '<button type="button" id="csp-btn-preview-close" class="soft">關閉</button>' +
            '</span>' +
          '</div>' +
          '<iframe id="csp-preview-frame" title="民事補正狀預覽"></iframe>' +
        '</div>' +
      '</div>';
  };
})();
