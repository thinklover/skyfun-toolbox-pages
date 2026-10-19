/**
 * 本票聲請狀產生器（催收流程第 4 階段內嵌）
 * 內容依司法院「聲請裁定本票強制執行狀」；版面同強制執行民事聲請狀
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

  const CN_DIG = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
  const CN_UNIT = ['', '拾', '佰', '仟'];

  let fontBytesPromise = null;
  let previewUrl = null;

  const COURT_REGION_OPTIONS = [
    '臺北', '新北', '士林', '基隆', '宜蘭', '桃園', '新竹', '苗栗',
    '臺中', '南投', '彰化', '雲林', '嘉義', '臺南', '高雄', '橋頭',
    '屏東', '臺東', '花蓮', '澎湖', '金門', '連江'
  ];

  const BRANCH_COURT_HINT = {
    hq: '臺北', tp: '臺北', ty: '桃園', 'tc-1': '臺中', 'tc-2': '臺中',
    tn: '臺南', kh: '高雄', hsinchu: '新竹', yilan: '宜蘭', keelung: '基隆',
    changhua: '彰化', nantou: '南投', chiayi: '嘉義'
  };

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

  function $(id) { return document.getElementById(id); }
  function val(id) { return String($(id)?.value || '').trim(); }
  function numVal(id) {
    return Number(String(val(id)).replace(/[^\d.-]/g, '')) || 0;
  }

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

  /** 辨識 TTF／OTF／TTC；避免 404 被 Pages 回成 HTML 卻當成字型 */
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
    await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=nrp'));
    const total = window.LAL_FONT_PART_COUNT;
    if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
    for (let i = 0; i < total; i++) {
      if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
      await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=nrp'));
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

  function sectionToChinese(n) {
    if (n === 0) return '';
    let s = '';
    const str = String(n);
    for (let i = 0; i < str.length; i++) {
      const d = Number(str[i]);
      const u = CN_UNIT[str.length - 1 - i];
      if (d === 0) {
        if (!s.endsWith('零') && s.length) s += '零';
      } else {
        s += CN_DIG[d] + u;
      }
    }
    return s.replace(/零+$/g, '').replace(/零+/g, '零');
  }

  function amountToChineseMoney(amount) {
    const n = Math.round(Number(amount) || 0);
    if (n <= 0) return '零元整';
    if (n >= 100000000) return String(n) + '元整';
    const wan = Math.floor(n / 10000);
    const rest = n % 10000;
    let out = '';
    if (wan > 0) out += sectionToChinese(wan) + '萬';
    if (rest > 0) {
      const part = sectionToChinese(rest);
      if (wan > 0 && rest < 1000) out += '零';
      out += part;
    }
    return out + '元整';
  }

  function formatMoney(n) {
    return (Number(n) || 0).toLocaleString('zh-TW');
  }

  function todayRocParts() {
    const d = new Date();
    return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, day: d.getDate() };
  }

  function rocText(y, m, d) {
    if (!y) return '民國　　年　　月　　日';
    return `民國 ${y} 年 ${m || '　'} 月 ${d || '　'} 日`;
  }

  function collectNoteData() {
    const amount = numVal('nrp-amount');
    const t = todayRocParts();
    const debtorAddr = val('nrp-debtor-addr');
    return {
      mode: 'note-ruling',
      caseYear: String(t.y),
      caseSerial: '',
      handler: '',
      division: '',
      court: val('nrp-court'),
      amount,
      amountCN: amountToChineseMoney(amount),
      landlordName: val('nrp-creditor-name'),
      landlordAddr: val('nrp-creditor-addr'),
      landlordPhone: val('nrp-creditor-phone'),
      debtors: [{
        name: val('nrp-debtor-name'),
        id: val('nrp-debtor-id'),
        addr: debtorAddr
      }],
      debtorName: val('nrp-debtor-name'),
      debtorId: val('nrp-debtor-id'),
      debtorAddr,
      propertyAddr: debtorAddr,
      noteCount: Math.max(1, numVal('nrp-note-count') || 1),
      noteNo: val('nrp-note-no'),
      issueY: val('nrp-issue-y'),
      issueM: val('nrp-issue-m'),
      issueD: val('nrp-issue-d'),
      interestRate: '6',
      petitioner: val('nrp-petitioner'),
      filingY: val('nrp-filing-y') || String(t.y),
      filingM: val('nrp-filing-m') || String(t.m),
      filingD: val('nrp-filing-d') || String(t.day)
    };
  }

  function buildNotePetitionItems(d) {
    const rate = d.interestRate || '6';
    return [
      `一、裁定相對人簽發如附表所載本票金額新臺幣${d.amountCN}，及自提示日起至清償日止按週年利率百分之${rate}計算之利息，准予強制執行。`,
      '二、聲請程序費用由相對人負擔。'
    ];
  }

  function buildNoteReasonParagraphs(d) {
    const count = d.noteCount || 1;
    return [
      `聲請人持有相對人簽發如附表所載本票${count}張，均已屆期，經提示未獲付款。聲請人雖屢為催討，仍未蒙置理。為此依據票據法第123條、非訟事件法第194條規定，聲請裁定准予強制執行，以保權益。`
    ];
  }

  function buildNoteScheduleLines(d) {
    const issue = rocText(d.issueY, d.issueM, d.issueD);
    const lines = [
      `一、發票人：${d.debtorName || '　　　'}（身分證字號：${d.debtorId || '　　　'}）`,
      `二、票面金額：新臺幣${d.amountCN}`,
      `三、開票年月日：${issue}`,
      `四、本票張數：${d.noteCount || 1} 張`
    ];
    if (d.noteNo) lines.push(`五、票號：${d.noteNo}`);
    return lines;
  }

  function buildNoteEvidenceItems(d) {
    return [
      `本票正本${d.noteCount || 1}張。`,
      '公司變更登記表正本1份。'
    ];
  }

  function buildNoteEvidenceChecklist(d) {
    return [
      { no: 1, name: '本票正本', qty: `${d.noteCount || 1} 張` },
      { no: 2, name: '公司變更登記表正本', qty: '1 份' },
      { no: 3, name: '管轄權證明（未載付款地／發票地時）', qty: '依需要' },
      { no: 4, name: '提示日釋明資料（未載到期日時）', qty: '依需要' },
      { no: 5, name: '裁定費繳納證明', qty: '1 份' },
      { no: 6, name: '其他相關證明文件', qty: '依需要' }
    ];
  }

  function validateNote(d) {
    const miss = [];
    if (!d.court) miss.push('管轄地方法院');
    if (!d.landlordName) miss.push('聲請人（債權人）');
    if (!d.landlordAddr) miss.push('聲請人地址');
    if (!d.debtorName) miss.push('承租人姓名');
    if (!d.debtorId) miss.push('承租人身分證字號');
    if (!d.amount) miss.push('本票金額');
    if (!d.noteNo) miss.push('票號');
    if (!d.issueY || !d.issueM || !d.issueD) miss.push('開票年月日');
    if (!d.petitioner) miss.push('具狀人');
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
    const wrap = $('nrp-preview-wrap');
    const frame = $('nrp-preview-frame');
    if (frame) frame.src = 'about:blank';
    if (wrap) wrap.hidden = true;
  }

  function showPreview(bytes) {
    revokePreview();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    previewUrl = URL.createObjectURL(blob);
    const wrap = $('nrp-preview-wrap');
    const frame = $('nrp-preview-frame');
    if (frame) frame.src = previewUrl;
    if (wrap) wrap.hidden = false;
  }

  function openPreviewTab() {
    if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
  }

  function updateAmountCn() {
    const out = $('nrp-amount-cn');
    if (out) out.textContent = amountToChineseMoney(numVal('nrp-amount'));
  }

  async function makePdf(mode) {
    const status = $('nrp-status');
    const btnGen = $('nrp-btn-generate');
    const btnPrev = $('nrp-btn-preview');
    const d = collectNoteData();
    const miss = validateNote(d);
    if (miss.length) {
      alert('請填寫：' + miss.join('、'));
      return;
    }
    try {
      if (status) status.textContent = mode === 'preview' ? '產生預覽中…' : '載入字型中…';
      if (btnGen) btnGen.disabled = true;
      if (btnPrev) btnPrev.disabled = true;
      const PDFLib = window.PDFLib;
      if (!PDFLib) throw new Error('PDF 函式庫未載入');
      if (!window.fontkit) throw new Error('字型引擎未載入');
      if (typeof window.buildEnforcementPetitionPdf !== 'function') {
        throw new Error('找不到訴狀排版程式');
      }
      const fontBytes = await getFontBytes(status);
      if (status) status.textContent = '繪製訴狀中…';

      const helpers = {
        mode: 'note-ruling',
        buildNotePetitionItems,
        buildNoteReasonParagraphs,
        buildNoteScheduleLines,
        buildEvidenceItems: () => buildNoteEvidenceItems(d),
        buildEvidenceChecklist: () => buildNoteEvidenceChecklist(d)
      };

      const bytes = await window.buildEnforcementPetitionPdf(PDFLib, fontBytes, d, helpers);
      if (mode === 'preview') {
        showPreview(bytes);
        if (status) status.textContent = '預覽已就緒（含證物清單共 3 頁），確認後再下載列印。';
        return;
      }
      const stamp = new Date();
      const fn = `本票聲請_${d.debtorName || '案件'}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.pdf`;
      downloadPdf(bytes, fn);
      if (status) status.textContent = '已產生 PDF（含證物清單），請列印後至法院遞狀。';
    } catch (e) {
      console.error(e);
      alert('產生失敗：' + (e?.message || e));
      if (status) status.textContent = '';
    } finally {
      if (btnGen) btnGen.disabled = false;
      if (btnPrev) btnPrev.disabled = false;
    }
  }

  function resetBranchSelect() {
    const branch = $('nrp-creditor-branch');
    if (!branch) return;
    branch.disabled = true;
    branch.innerHTML = '<option value="">－ 請先選公司別 －</option>';
  }

  function onCompanyChange() {
    const company = val('nrp-creditor-company');
    const branch = $('nrp-creditor-branch');
    const branches = COMPANY_BRANCH_PRESETS[company] || [];
    if (!branch) return;
    if (!company || !branches.length) {
      resetBranchSelect();
      return;
    }
    branch.disabled = false;
    branch.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
      branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
    if ($('nrp-creditor-name')) $('nrp-creditor-name').value = company;
  }

  function onBranchChange() {
    const company = val('nrp-creditor-company');
    const branchId = val('nrp-creditor-branch');
    const hit = (COMPANY_BRANCH_PRESETS[company] || []).find((b) => b.id === branchId);
    if (!hit) return;
    if ($('nrp-creditor-name')) $('nrp-creditor-name').value = company;
    if ($('nrp-creditor-phone')) $('nrp-creditor-phone').value = hit.phone || '';
    if ($('nrp-creditor-addr')) $('nrp-creditor-addr').value = hit.addr || '';
    const courtHint = BRANCH_COURT_HINT[branchId];
    const courtSel = $('nrp-court');
    if (courtHint && courtSel && !courtSel.value) courtSel.value = courtHint;
  }

  function courtSelectHtml() {
    return '<option value="">－ 請選擇地區 －</option>' +
      COURT_REGION_OPTIONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  }

  function clearForm() {
    document.querySelectorAll('#nrp-box input, #nrp-box select, #nrp-box textarea').forEach((el) => {
      if (el.type === 'button' || el.type === 'submit') return;
      el.value = '';
    });
    resetBranchSelect();
    const t = todayRocParts();
    if ($('nrp-filing-y')) $('nrp-filing-y').value = String(t.y);
    if ($('nrp-filing-m')) $('nrp-filing-m').value = String(t.m);
    if ($('nrp-filing-d')) $('nrp-filing-d').value = String(t.day);
    if ($('nrp-note-count')) $('nrp-note-count').value = '1';
    if ($('nrp-interest')) $('nrp-interest').value = '6';
    if ($('nrp-petitioner')) $('nrp-petitioner').value = '星鴻股份有限公司';
    if ($('nrp-status')) $('nrp-status').textContent = '';
    closePreview();
    updateAmountCn();
  }

  function fillFilingDefaults() {
    const t = todayRocParts();
    if ($('nrp-filing-y') && !$('nrp-filing-y').value) $('nrp-filing-y').value = String(t.y);
    if ($('nrp-filing-m') && !$('nrp-filing-m').value) $('nrp-filing-m').value = String(t.m);
    if ($('nrp-filing-d') && !$('nrp-filing-d').value) $('nrp-filing-d').value = String(t.day);
    if ($('nrp-note-count') && !$('nrp-note-count').value) $('nrp-note-count').value = '1';
    if ($('nrp-interest')) $('nrp-interest').value = '6';
    if ($('nrp-petitioner') && !$('nrp-petitioner').value) $('nrp-petitioner').value = '星鴻股份有限公司';
  }

  function bindBox(box) {
    if (!box || box.getAttribute('data-bound') === '1') return;
    box.setAttribute('data-bound', '1');
    box.addEventListener('click', (e) => {
      if (e.target.id === 'nrp-btn-preview') makePdf('preview');
      if (e.target.id === 'nrp-btn-generate') makePdf('download');
      if (e.target.id === 'nrp-btn-clear') clearForm();
      if (e.target.id === 'nrp-btn-preview-tab') openPreviewTab();
      if (e.target.id === 'nrp-btn-preview-close') closePreview();
    });
    box.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'nrp-amount') updateAmountCn();
    });
    box.addEventListener('change', (e) => {
      if (!e.target) return;
      if (e.target.id === 'nrp-creditor-company') onCompanyChange();
      if (e.target.id === 'nrp-creditor-branch') onBranchChange();
    });
  }

  window.initNoteRulingPetition = function () {
    const box = $('nrp-box');
    if (!box) return;
    bindBox(box);
    fillFilingDefaults();
    updateAmountCn();
  };

  window.noteRulingPetitionFormHtml = function () {
    return '' +
      '<div class="nrpbox" id="nrp-box">' +
        '<h3>⚖️ 本票聲請狀產生器</h3>' +
        '<p class="nrp-tip">向法院聲請准予本票強制執行（非訟）。內容依司法院書狀範例。</p>' +
        '<div class="nrp-sec">' +
          '<h4>管轄法院</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field span2"><span>管轄地方法院（地區）<span class="req">*</span></span>' +
              '<select id="nrp-court">' + courtSelectHtml() + '</select></label>' +
          '</div>' +
          '<p class="nrp-tip" style="margin:0">選地區後訴狀會帶入「臺灣○○地方法院」。案號／承辦／股別由法院收件後填；年度自動帶入民國 ' + (new Date().getFullYear() - 1911) + ' 年。</p>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>聲請人（債權人）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>公司別</span>' +
              '<select id="nrp-creditor-company">' +
                '<option value="">－ 請選擇公司別 －</option>' +
                '<option value="星鴻股份有限公司">星鴻股份有限公司</option>' +
                '<option value="星華股份有限公司">星華股份有限公司</option>' +
              '</select></label>' +
            '<label class="nrp-field"><span>營業處<span class="req">*</span></span>' +
              '<select id="nrp-creditor-branch" disabled><option value="">－ 請先選公司別 －</option></select></label>' +
            '<label class="nrp-field"><span>聲請人名稱<span class="req">*</span></span><input id="nrp-creditor-name" type="text" placeholder="選公司別後自動帶入" /></label>' +
            '<label class="nrp-field"><span>電話</span><input id="nrp-creditor-phone" type="tel" placeholder="選營業處後自動帶入" /></label>' +
            '<label class="nrp-field span2"><span>聲請人地址<span class="req">*</span></span><input id="nrp-creditor-addr" type="text" placeholder="選營業處後自動帶入，可再修改" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec">' +
          '<h4>承租人（相對人／發票人）</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>承租人姓名<span class="req">*</span></span><input id="nrp-debtor-name" type="text" placeholder="承租人姓名" /></label>' +
            '<label class="nrp-field"><span>身分證字號<span class="req">*</span></span><input id="nrp-debtor-id" type="text" placeholder="承租人身分證字號" /></label>' +
            '<label class="nrp-field span2"><span>承租人地址（戶籍／現住）</span><input id="nrp-debtor-addr" type="text" placeholder="承租人戶籍或現住地址" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-sec" id="nrp-fields-note">' +
          '<h4>本票資料</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field"><span>本票金額（元）<span class="req">*</span></span><input id="nrp-amount" type="number" min="0" step="1" /></label>' +
            '<label class="nrp-field"><span>張數</span><input id="nrp-note-count" type="number" min="1" value="1" /></label>' +
            '<label class="nrp-field"><span>週年利率％<span class="req">*</span></span><input id="nrp-interest" type="text" value="6" readonly /></label>' +
            '<label class="nrp-field"><span>票號<span class="req">*</span></span><input id="nrp-note-no" type="text" placeholder="本票存根聯上方或本票右上方之票號" /></label>' +
            '<label class="nrp-field"><span>開票年<span class="req">*</span></span><input id="nrp-issue-y" type="text" inputmode="numeric" placeholder="114" /></label>' +
            '<label class="nrp-field"><span>月<span class="req">*</span></span><input id="nrp-issue-m" type="text" inputmode="numeric" placeholder="1" /></label>' +
            '<label class="nrp-field"><span>日<span class="req">*</span></span><input id="nrp-issue-d" type="text" inputmode="numeric" placeholder="1" /></label>' +
          '</div>' +
          '<p class="nrp-tip" style="margin:0">開票年月日＝本票最下方承租人簽署本票日（民國年／月／日）。</p>' +
        '</div>' +
        '<p class="nrp-amt">金額大寫：<b id="nrp-amount-cn">零元整</b></p>' +
        '<div class="nrp-sec">' +
          '<h4>具狀</h4>' +
          '<div class="nrp-grid">' +
            '<label class="nrp-field span2"><span>具狀人<span class="req">*</span></span><input id="nrp-petitioner" type="text" value="星鴻股份有限公司" placeholder="星鴻股份有限公司" /></label>' +
            '<label class="nrp-field"><span>具狀民國年</span><input id="nrp-filing-y" type="number" /></label>' +
            '<label class="nrp-field"><span>月</span><input id="nrp-filing-m" type="number" min="1" max="12" /></label>' +
            '<label class="nrp-field"><span>日</span><input id="nrp-filing-d" type="number" min="1" max="31" /></label>' +
          '</div>' +
        '</div>' +
        '<div class="nrp-actions">' +
          '<button type="button" id="nrp-btn-preview">預覽</button>' +
          '<button type="button" id="nrp-btn-generate">產生 PDF（下載列印）</button>' +
          '<button type="button" class="soft" id="nrp-btn-clear">清除欄位</button>' +
          '<p id="nrp-status"></p>' +
        '</div>' +
        '<div id="nrp-preview-wrap" class="nrp-preview-wrap" hidden>' +
          '<div class="nrp-preview-bar">' +
            '<strong>📄 本票聲請狀預覽</strong>' +
            '<span class="nrp-preview-actions">' +
              '<button type="button" id="nrp-btn-preview-tab" class="soft">另開分頁</button>' +
              '<button type="button" id="nrp-btn-preview-close" class="soft">關閉預覽</button>' +
            '</span>' +
          '</div>' +
          '<iframe id="nrp-preview-frame" title="本票聲請狀預覽"></iframe>' +
        '</div>' +
        '<p class="nrp-foot">※ 可先按「預覽」確認版面，再下載列印。內容依司法院範本，遞狀前請覆核並確認最新費用。</p>' +
        '<p class="nrp-foot"><a href="https://www.judicial.gov.tw/tw/cp-1365-56941-973e0-1.html" target="_blank" rel="noopener">📄 司法院｜聲請裁定本票強制執行狀</a></p>' +
      '</div>';
  };
})();
