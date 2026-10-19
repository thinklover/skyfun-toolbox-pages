/**
 * 台灣郵局存證信函產生器（瀏覽器版，可離線雙擊 index.html）
 * 版面座標對齊 csterryliu 開源專案 lal_module/constants.py：
 * - Legal-Attest-Letter-Generator-TW（Python 桌面版）
 * - Legal-Attest-Letter-Generator-TW-Django（網頁版，https://lalg-pro.onrender.com/）
 */
(function () {
    'use strict';

    const PDF_INCH = 72;
    const PAGE_W = 8.2677 * PDF_INCH;
    const PAGE_H = 11.692 * PDF_INCH;
    const CONTENT_X_Y_BEGIN = [1.27 * PDF_INCH, 7.82 * PDF_INCH];
    const CONTENT_X_Y_INTERVAL = [0.33 * PDF_INCH, 0.47 * PDF_INCH];
    const CONTENT_X_Y_FIX = [0.001 * PDF_INCH, 0.001 * PDF_INCH];
    const CONTENT_MAX_CHARACTER_PER_LINE = 20;
    const CONTENT_MAX_LINE_PER_PAGE = 10;
    const NAME_COORDINATE = {
        s_x_y_begin: [4.60 * PDF_INCH, 10.27 * PDF_INCH],
        r_x_y_begin: [4.60 * PDF_INCH, 9.66 * PDF_INCH],
        c_x_y_begin: [4.60 * PDF_INCH, 9.06 * PDF_INCH]
    };
    const ADDR_COORDINATE = {
        s_x_y_begin: [4.72 * PDF_INCH, 9.95 * PDF_INCH],
        r_x_y_begin: [4.72 * PDF_INCH, 9.32 * PDF_INCH],
        c_x_y_begin: [4.72 * PDF_INCH, 8.84 * PDF_INCH]
    };
    const BOX_UPPERLEFT = [3.125 * PDF_INCH, 10.611 * PDF_INCH];
    const BOX_UPPERRIGHT = [7.847 * PDF_INCH, 10.611 * PDF_INCH];
    const CUT_INFO = [5.111 * PDF_INCH, 10.750 * PDF_INCH];
    const QUOTE = [3.264 * PDF_INCH, 10.472 * PDF_INCH];
    const RECT = [7.146 * PDF_INCH, 10.25 * PDF_INCH, 0.139 * PDF_INCH, 0.167 * PDF_INCH];
    const CHT_IN_RECT = [7.146 * PDF_INCH, 10.292 * PDF_INCH];
    const DETAIL_START = [4.167 * PDF_INCH, 10.292 * PDF_INCH];
    const DETAIL_Y_INTERVAL = 0.278 * PDF_INCH;
    const TITLE_START = [3.264 * PDF_INCH, 10.139 * PDF_INCH];
    const TITLE_Y_INTERVAL = 0.139 * PDF_INCH;
    const CC_RECEIVER_FIX = [0.278 * PDF_INCH, 0.069 * PDF_INCH];

    const ASSET_BASE = (typeof window.LAL_ASSET_BASE === 'string' && window.LAL_ASSET_BASE)
        ? window.LAL_ASSET_BASE.replace(/\/?$/, '/')
        : './';
    const TEMPLATE_PATH = ASSET_BASE + 'assets/lal/tw_lal.pdf';
    const FONT_PATH = ASSET_BASE + 'assets/lal/TW-Kai-98_1.ttf';
    const PDF_LIB_LOCAL = ASSET_BASE + 'js/vendor/pdf-lib.min.js';
    const PDF_LIB_CDN = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    const FONTKIT_LOCAL = ASSET_BASE + 'js/vendor/fontkit.umd.js';
    const FONTKIT_CDN = 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.js';

    let pdfLibPromise = null;

    const PARTY_LABELS = {
        sender: { namePh: '寄件人姓名', addrPh: '寄件人詳細地址' },
        receiver: { namePh: '收件人姓名', addrPh: '收件人詳細地址（租屋處）' },
        cc: { namePh: '副本收件人姓名', addrPh: '副本收件人詳細地址（多為戶籍地）' }
    };

    /** 包租寄件人：與家訪單／解約單相同營業處清單 */
    const COMPANY_NAME = '星鴻股份有限公司';
    const COMPANY_OFFICES = [
        { id: 'tp', name: '台北分公司', phone: '0809-092-122', addr: '103 台北市大同區重慶北路一段26巷9弄1號4樓' },
        { id: 'ty', name: '桃園分公司', phone: '(03) 275-7773', addr: '320 桃園市中壢區環北路400號13樓之6' },
        { id: 'tc-1', name: '台中分公司', phone: '(04) 3707-2368', addr: '406 台中市北屯區文心路四段698號6樓之1' },
        { id: 'tn', name: '台南分公司', phone: '(06) 703-2305', addr: '704 台南市北區成功路54號11樓之1' },
        { id: 'kh', name: '高雄分公司', phone: '(07) 976-3955', addr: '806 高雄市前鎮區一心一路239號11樓之2' },
        { id: 'hsinchu', name: '新竹分公司', phone: '(03) 622-3937', addr: '302 新竹縣竹北市光明五街342號2樓' },
        { id: 'yilan', name: '宜蘭分公司', phone: '(03) 910-8705', addr: '260 宜蘭縣宜蘭市舊城北路154號2樓' },
        { id: 'keelung', name: '基隆分公司', phone: '(02) 7751-7851', addr: '202 基隆市中正區義二路196號2樓' },
        { id: 'changhua', name: '彰化分公司', phone: '(04) 706-0725', addr: '' },
        { id: 'nantou', name: '南投分公司', phone: '(049) 700-9327', addr: '542 南投縣草屯鎮中正路755號7樓之1' },
        { id: 'chiayi', name: '嘉義分公司', phone: '(05) 320-9119', addr: '600 嘉義市西區上海路175號2樓' }
    ];

    function stripPostalPrefix(addr) {
        return String(addr || '').replace(/^\d{3}\s*/, '').trim();
    }

    function getCompanyOffice(id) {
        return COMPANY_OFFICES.find((o) => o.id === id) || null;
    }

    function ensureOfficeSelectOptions() {
        const sel = $('lal-office-select');
        if (!sel || sel.dataset.filled === '1') return;
        sel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
            COMPANY_OFFICES.map((o) =>
                '<option value="' + o.id + '">' + o.name + (o.phone ? '　' + o.phone : '') + '</option>'
            ).join('');
        sel.dataset.filled = '1';
    }

    function fillBaoSenderFromOffice() {
        const sel = $('lal-office-select');
        if (!sel || !sel.value) return false;
        const office = getCompanyOffice(sel.value);
        if (!office) return false;
        const addr = stripPostalPrefix(office.addr);
        clearParties('sender');
        const list = partyListEl('sender');
        if (!list) return false;
        list.appendChild(createPartyCard('sender', {
            name: COMPANY_NAME,
            addr: addr || ('（請補齊' + office.name + '地址）')
        }, 1));
        const tip = $('lal-office-tip');
        if (tip) {
            tip.textContent = addr
                ? ('已帶入：' + COMPANY_NAME + '／' + office.name + '／' + addr)
                : (office.name + '地址尚未建檔，請手動補在寄件人地址欄。');
        }
        return true;
    }
    let templateBytesPromise = null;
    let fontBytesPromise = null;

    function $(id) { return document.getElementById(id); }

    function isFileProtocol() {
        return window.location.protocol === 'file:';
    }

    function resolveAssetUrl(path) {
        return new URL(path.replace(/^\.\//, ''), document.baseURI).href;
    }

    const FONT_MANIFEST = ASSET_BASE + 'js/lal-font/manifest.js';
    const FONT_PART_PREFIX = ASSET_BASE + 'js/lal-font/part-';

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

    /** file:// 或 fetch 失敗時，從內嵌分片載入標楷體（無需手動選檔） */
    async function loadEmbeddedFontBytes() {
        const status = $('lal-status');
        window.LAL_FONT_PARTS = [];
        window.LAL_FONT_PART_COUNT = 0;
        await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=lal'));
        const total = window.LAL_FONT_PART_COUNT;
        if (!total) {
            throw new Error('找不到內嵌字型。請確認資料夾內含 js/lal-font/');
        }
        for (let i = 0; i < total; i++) {
            if (status) status.textContent = `載入字型中…（${i + 1}/${total}）`;
            const partPath = FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=lal';
            await loadScript(resolveAssetUrl(partPath));
        }
        const bytes = base64ToArrayBuffer(window.LAL_FONT_PARTS.join(''));
        if (!isFontBytes(bytes)) throw new Error('內嵌字型格式無效');
        return bytes;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('無法載入腳本：' + src));
            document.head.appendChild(s);
        });
    }

    async function ensureFontkitLoaded() {
        if (window.fontkit) return;
        const localUrl = resolveAssetUrl(FONTKIT_LOCAL);
        try {
            await loadScript(localUrl);
        } catch (e1) {
            if (!isFileProtocol()) {
                try {
                    await loadScript(FONTKIT_CDN);
                } catch (e2) {
                    throw new Error('無法載入字型引擎 fontkit（本機與 CDN 皆失敗）');
                }
            } else {
                throw new Error('無法載入字型引擎：' + localUrl);
            }
        }
        if (!window.fontkit) throw new Error('字型引擎載入後未就緒');
    }

    function loadPdfLib() {
        if (pdfLibPromise) return pdfLibPromise;
        pdfLibPromise = (async () => {
            if (!window.PDFLib) {
                const localUrl = resolveAssetUrl(PDF_LIB_LOCAL);
                try {
                    await loadScript(localUrl);
                } catch (e1) {
                    if (!isFileProtocol()) {
                        try {
                            await loadScript(PDF_LIB_CDN);
                        } catch (e2) {
                            throw new Error('無法載入 PDF 函式庫（本機與 CDN 皆失敗）');
                        }
                    } else {
                        throw new Error('無法載入 PDF 函式庫：' + localUrl);
                    }
                }
            }
            if (!window.PDFLib) throw new Error('PDF 函式庫載入後未就緒');
            await ensureFontkitLoaded();
            return window.PDFLib;
        })();
        return pdfLibPromise;
    }

    function fetchAsset(path) {
        const url = resolveAssetUrl(path);
        return fetch(url).then(async (r) => {
            if (!r.ok) throw new Error('無法載入資源（HTTP ' + r.status + '）：' + url);
            const ct = String(r.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('text/html')) {
                throw new Error('資源路徑回傳網頁而非檔案：' + url);
            }
            return r.arrayBuffer();
        }).catch((err) => {
            if (err.message && err.message.includes('Failed to fetch')) {
                throw new Error('無法連線載入：' + url);
            }
            throw err;
        });
    }

    async function loadTemplateBytes() {
        if (window.LAL_TEMPLATE_B64) {
            return base64ToArrayBuffer(window.LAL_TEMPLATE_B64);
        }
        if (!isFileProtocol()) {
            return fetchAsset(TEMPLATE_PATH);
        }
        throw new Error('找不到郵局範本。請確認已載入 lal-template-b64.js，或改用本機伺服器開啟。');
    }

    async function loadFontBytes() {
        if (!isFileProtocol()) {
            try {
                const buf = await fetchAsset(FONT_PATH);
                if (isFontBytes(buf)) return buf;
                console.warn('字型檔格式不正確，改載入內嵌分片');
            } catch (err) {
                console.warn('字型 fetch 失敗，改載入內嵌分片', err);
            }
        }
        return loadEmbeddedFontBytes();
    }

    function getTemplateBytes() {
        if (!templateBytesPromise) templateBytesPromise = loadTemplateBytes();
        return templateBytesPromise;
    }

    function getFontBytes() {
        if (!fontBytesPromise) fontBytesPromise = loadFontBytes();
        return fontBytesPromise;
    }

    function resetAssetCache() {
        templateBytesPromise = null;
        fontBytesPromise = null;
    }

    function warnIfFileProtocol() {
        const status = $('lal-status');
        if (!isFileProtocol() || !status) return;
        status.textContent = '可直接使用。首次產生 PDF 會載入內嵌字型（約 50MB，請稍候）；請保持整份資料夾完整（含 js/lal-font）。';
    }

    let tplAutoTimer = null;
    /** 使用者手動改過內文時，不再被範本自動覆寫 */
    let contentManuallyEdited = false;

    function getSelectedLetterTemplate() {
        const id = $('lal-tpl-select')?.value;
        if (!id) return null;
        return listLetterTemplates().find((t) => t.id === id)
            || (window.LAL_LETTER_TEMPLATES || []).find((t) => t.id === id)
            || null;
    }

    function val(id) {
        return ($(id)?.value || '').trim();
    }

    function partOrBox(v) {
        return v || '□';
    }

    /** 解析 115/06/15、115-6-15、1150615；西元 2025/06/15 自動轉民國 */
    function parseRocDateInput(raw) {
        const s = String(raw || '').trim().replace(/\s/g, '');
        if (!s) return null;
        let m = s.match(/^(\d{3})(\d{2})(\d{2})$/);
        if (m) {
            return { y: m[1], m: String(+m[2]), d: String(+m[3]) };
        }
        m = s.match(/^(\d{2,4})[\/\-\.\年](\d{1,2})[\/\-\.\月](\d{1,2})日?$/);
        if (!m) {
            m = s.match(/^(\d{2,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
        }
        if (m) {
            let y = parseInt(m[1], 10);
            if (y >= 1912) y -= 1911;
            if (y < 1 || y > 200) return null;
            return { y: String(y), m: String(+m[2]), d: String(+m[3]) };
        }
        return null;
    }

    function normalizeRocDateInput(el) {
        if (!el) return;
        const p = parseRocDateInput(el.value);
        if (p) {
            el.value = p.y + '/' + String(p.m).padStart(2, '0') + '/' + String(p.d).padStart(2, '0');
        }
    }

    function rocPartsToDate(p) {
        if (!p) return null;
        const dt = new Date(parseInt(p.y, 10) + 1911, parseInt(p.m, 10) - 1, parseInt(p.d, 10), 12, 0, 0);
        return Number.isNaN(dt.getTime()) ? null : dt;
    }

    /** 依起迄租日計算計租年／月（迄租日通常為滿期前一日，故迄日+1 日再計算） */
    function computeLeaseYearsMonths(startParts, endParts) {
        const start = rocPartsToDate(startParts);
        const end = rocPartsToDate(endParts);
        if (!start || !end) return null;
        const endInclusive = new Date(end);
        endInclusive.setDate(endInclusive.getDate() + 1);
        if (endInclusive.getTime() <= start.getTime()) return null;
        let years = endInclusive.getFullYear() - start.getFullYear();
        let months = endInclusive.getMonth() - start.getMonth();
        if (endInclusive.getDate() < start.getDate()) months--;
        if (months < 0) {
            years--;
            months += 12;
        }
        if (years < 0) return null;
        return { years: String(years), months: String(months) };
    }

    function resolveLeaseYearsMonths(startParts, endParts) {
        const ly = val('lal-f-leaseYears');
        const lm = val('lal-f-leaseMonths');
        if (ly || lm) return { years: ly, months: lm };
        return computeLeaseYearsMonths(startParts, endParts);
    }

    function updateLeaseTermFields() {
        const yearsEl = $('lal-f-leaseYears');
        const monthsEl = $('lal-f-leaseMonths');
        if (!yearsEl || !monthsEl) return;
        const start = parseRocDateInput(val('lal-f-leaseStart'));
        const end = parseRocDateInput(val('lal-f-leaseEnd'));
        const term = computeLeaseYearsMonths(start, end);
        if (term) {
            yearsEl.value = term.years;
            monthsEl.value = term.months;
        } else if (!start || !end) {
            yearsEl.value = '';
            monthsEl.value = '';
        }
    }

    function bindLeaseTermAutoCalc() {
        ['lal-f-leaseStart', 'lal-f-leaseEnd'].forEach((id) => {
            const inp = $(id);
            if (!inp || inp.dataset.leaseTermBound) return;
            inp.dataset.leaseTermBound = '1';
            inp.addEventListener('blur', () => {
                normalizeRocDateInput(inp);
                updateLeaseTermFields();
                scheduleApplyLetterTemplate();
            });
        });
    }

    function rocDatePhrase(p, prefix, suffix) {
        if (!p) return '';
        return (prefix || '') + p.y + '年' + p.m + '月' + p.d + '日' + (suffix || '');
    }

    function compactDatePhrase(inputId, prefix, suffix) {
        return rocDatePhrase(parseRocDateInput(val(inputId)), prefix, suffix);
    }

    /** 西元 date picker（YYYY-MM-DD）→ 民國年月日 */
    function adDateToRocParts(isoDate) {
        const s = String(isoDate || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        const y = parseInt(m[1], 10) - 1911;
        if (y < 1) return null;
        return { y: String(y), m: String(+m[2]), d: String(+m[3]) };
    }

    function datePickerPhrase(inputId, prefix, suffix) {
        return rocDatePhrase(adDateToRocParts(val(inputId)), prefix, suffix);
    }

    function formatAddr() {
        const full = val('lal-f-addrFull');
        return full || '□縣(市)□鄉(鎮/市/區)□街(路)□段□巷□弄□號□樓□室';
    }

    function formatLeaseTerm() {
        const start = parseRocDateInput(val('lal-f-leaseStart'));
        const end = parseRocDateInput(val('lal-f-leaseEnd'));
        const term = resolveLeaseYearsMonths(start, end);
        const ly = term?.years || '';
        const lm = term?.months || '';
        if (!start && !end) return '租期自□年□月□日起至□年□月□日止，計□年□月';
        const seg = (p) => (p ? p.y + '年' + p.m + '月' + p.d + '日' : '□年□月□日');
        let s = '租期自' + seg(start) + '起至' + seg(end) + '止';
        if (ly || lm) s += '，計' + partOrBox(ly) + '年' + partOrBox(lm) + '月';
        return s;
    }

    function formatLeaseTermRoc() {
        const start = parseRocDateInput(val('lal-f-rocStart'));
        const end = parseRocDateInput(val('lal-f-rocEnd'));
        if (!start && !end) return '租期自民國□年□月□日至民國□年□月□日止';
        const seg = (p) => (p ? '民國' + p.y + '年' + p.m + '月' + p.d + '日' : '民國□年□月□日');
        return '租期自' + seg(start) + '至' + seg(end) + '止';
    }

    function formatOwedMonth() {
        const y = val('lal-f-owedY');
        const m = val('lal-f-owedM');
        if (!y || !m) return '□年□月份';
        return y + '年' + m + '月份';
    }

    function buildLetterTokens() {
        const creditor = val('lal-f-creditor') || '本公司';
        const landlordName = val('lal-f-landlordName');
        return {
            creditor,
            creditorLabel: creditor === '本人' ? '本人' : '',
            addr: formatAddr(),
            simpleAddr: val('lal-f-simpleAddr') || '□市□街□號',
            leaseTerm: formatLeaseTerm(),
            leaseTermRoc: formatLeaseTermRoc(),
            rentMonthly: partOrBox(val('lal-f-rentMonthly')),
            rentPayDay: partOrBox(val('lal-f-rentPayDay')),
            arrearsSince: datePickerPhrase('lal-f-arrearsDate', '於', '以後') || '於□年□月□日以後',
            arrearsTotal: partOrBox(val('lal-f-arrearsTotal')),
            owedMonth: formatOwedMonth(),
            owedAmount: partOrBox(val('lal-f-owedAmount')),
            priorLetter: datePickerPhrase('lal-f-priorDate', '於', '以')
                + partOrBox(val('lal-f-postOffice')) + '郵局第' + partOrBox(val('lal-f-letterNo')) + '號存證信函',
            landlordName: landlordName || '(出租人全名)',
            propertyOwner: val('lal-f-propertyOwner') || '(房屋所有權人全名)',
            escrowIntro: landlordName
                ? '本公司受' + landlordName + '委託代為管理租賃房屋，並受託代為進行催告，合先敘明。\n'
                : '',
            leaseEndDate: compactDatePhrase('lal-f-eventDate', '', '') || '□年□月□日',
            inspectDateTime: compactDatePhrase('lal-f-inspectDate', '', '')
                + (val('lal-f-inspectH') || val('lal-f-inspectMi')
                    ? (val('lal-f-inspectH') || '□') + '時' + (val('lal-f-inspectMi') || '□') + '分'
                    : '□時□分')
        };
    }

    function renderLetterBody(tpl) {
        if (!tpl) return '';
        const tokens = buildLetterTokens();
        return tpl.body.replace(/\{\{(\w+)\}\}/g, (_, key) => (tokens[key] != null ? tokens[key] : ''));
    }

    function applyLetterTemplate(silent) {
        const tpl = getSelectedLetterTemplate();
        const ta = $('lal-content');
        if (!tpl || !ta) return false;
        updateLeaseTermFields();
        contentManuallyEdited = false;
        ta.value = renderLetterBody(tpl);
        if (!silent) {
            const st = $('lal-status');
            if (st) st.textContent = '已依範本產生內文，請確認後產生 PDF。';
        }
        return true;
    }

    function scheduleApplyLetterTemplate() {
        if (contentManuallyEdited) return;
        clearTimeout(tplAutoTimer);
        tplAutoTimer = setTimeout(() => applyLetterTemplate(true), 400);
    }

    function mkInput(id, ph, cls) {
        const el = document.createElement('input');
        el.type = 'text';
        el.id = id;
        el.className = cls || '';
        if (ph) el.placeholder = ph;
        return el;
    }

    function mkCompactDateInput(id, label) {
        const cell = document.createElement('div');
        const lab = document.createElement('label');
        lab.textContent = label;
        lab.htmlFor = id;
        const inp = mkInput(id, '115/06/15');
        inp.dataset.lalCompactDate = '1';
        inp.addEventListener('blur', () => normalizeRocDateInput(inp));
        cell.append(lab, inp);
        return cell;
    }

    function mkDatePickerInput(id, label) {
        const wrap = document.createElement('div');
        wrap.className = 'lal-date-pick';
        const lab = document.createElement('di' + 'v');
        lab.className = 'lal-field-title';
        lab.textContent = label;
        const inp = document.createElement('input');
        inp.type = 'date';
        inp.id = id;
        inp.className = 'max-w-xs';
        const hint = document.createElement('p');
        hint.className = 'lal-hint';
        hint.textContent = '點選日曆選日期，內文會轉為民國年月日';
        wrap.append(lab, inp, hint);
        return wrap;
    }

    function currentRocYear() {
        return new Date().getFullYear() - 1911;
    }

    function renderTplFieldBlock(fieldKey) {
        const def = (window.LAL_LETTER_FIELD_DEFS || {})[fieldKey];
        if (!def) return null;
        const wrap = document.createElement('div');
        wrap.className = 'lal-field-block';
        wrap.dataset.lalField = fieldKey;
        wrap.dataset.lalFieldType = def.type;

        if (def.type === 'address') {
            wrap.innerHTML = '<' + 'div class="lal-field-title">' + def.label + '</' + 'div>';
            wrap.appendChild(mkInput('lal-f-addrFull', '請輸入完整地址，例：新北市○○區○○路○號○樓'));
            return wrap;
        }

        if (def.type === 'lease') {
            wrap.innerHTML = '<div class="lal-field-title">' + def.label + '</div>';
            const grid = document.createElement('div');
            grid.className = 'lal-subgrid';
            grid.append(
                mkCompactDateInput('lal-f-leaseStart', '起租日'),
                mkCompactDateInput('lal-f-leaseEnd', '迄租日')
            );
            [['lal-f-leaseYears', '計租年數'], ['lal-f-leaseMonths', '計租月數']].forEach(([id, lb]) => {
                const cell = document.createElement('di' + 'v');
                const lab = document.createElement('label');
                lab.textContent = lb;
                lab.htmlFor = id;
                const inp = mkInput(id, '自動計算');
                inp.readOnly = true;
                inp.classList.add('bg-slate-50');
                inp.title = '依起租日、迄租日自動計算';
                cell.append(lab, inp);
                grid.appendChild(cell);
            });
            wrap.appendChild(grid);
            bindLeaseTermAutoCalc();
            return wrap;
        }

        if (def.type === 'leaseRoc') {
            wrap.innerHTML = '<div class="lal-field-title">' + def.label + '</div>';
            const grid = document.createElement('div');
            grid.className = 'lal-subgrid';
            grid.append(
                mkCompactDateInput('lal-f-rocStart', '起租日'),
                mkCompactDateInput('lal-f-rocEnd', '迄租日')
            );
            wrap.appendChild(grid);
            const hintRoc = document.createElement('p');
            hintRoc.className = 'lal-hint';
            hintRoc.textContent = '可直接輸入 115/06/15（民國年）';
            wrap.appendChild(hintRoc);
            return wrap;
        }

        if (def.type === 'datePick') {
            wrap.appendChild(mkDatePickerInput('lal-f-arrearsDate', def.label));
            wrap.classList.add('lal-field-block');
            return wrap;
        }

        if (def.type === 'date') {
            wrap.innerHTML = '<div class="lal-field-title">' + def.label + '</div>';
            const grid = document.createElement('div');
            grid.className = 'lal-subgrid';
            grid.appendChild(mkCompactDateInput('lal-f-eventDate', '日期（115/06/15）'));
            wrap.appendChild(grid);
            return wrap;
        }

        if (def.type === 'priorLetter') {
            wrap.innerHTML = '<div class="lal-field-title">' + def.label + '</div>';
            const grid = document.createElement('di' + 'v');
            grid.className = 'lal-subgrid';
            const dateCell = document.createElement('di' + 'v');
            const dateLab = document.createElement('label');
            dateLab.textContent = '寄發日期';
            dateLab.htmlFor = 'lal-f-priorDate';
            dateLab.className = 'block text-xs text-slate-600 mb-0.5';
            const dateInp = document.createElement('input');
            dateInp.type = 'date';
            dateInp.id = 'lal-f-priorDate';
            dateInp.className = '';
            dateCell.append(dateLab, dateInp);
            grid.appendChild(dateCell);
            [
                ['lal-f-postOffice', '郵局'], ['lal-f-letterNo', '函號']
            ].forEach(([id, lb]) => {
                const cell = document.createElement('div');
                const lab = document.createElement('label');
                lab.textContent = lb;
                cell.append(lab, mkInput(id, ''));
                grid.appendChild(cell);
            });
            wrap.appendChild(grid);
            return wrap;
        }

        if (def.type === 'datetime') {
            wrap.innerHTML = '<div class="lal-field-title">' + def.label + '</div>';
            const grid = document.createElement('div');
            grid.className = 'lal-subgrid';
            grid.appendChild(mkCompactDateInput('lal-f-inspectDate', '日期（115/06/15）'));
            [
                ['lal-f-inspectH', '時'], ['lal-f-inspectMi', '分']
            ].forEach(([id, lb]) => {
                const cell = document.createElement('div');
                const lab = document.createElement('label');
                lab.textContent = lb;
                cell.append(lab, mkInput(id, ''));
                grid.appendChild(cell);
            });
            wrap.appendChild(grid);
            return wrap;
        }

        if (def.type === 'owedMonth') {
            const title = document.createElement('di' + 'v');
            title.className = 'lal-field-title';
            title.textContent = def.label;
            const row = document.createElement('di' + 'v');
            row.className = 'flex flex-wrap items-center gap-2';
            const ySel = document.createElement('select');
            ySel.id = 'lal-f-owedY';
            const yOpt0 = document.createElement('option');
            yOpt0.value = '';
            yOpt0.textContent = '— 年 —';
            ySel.appendChild(yOpt0);
            const rocNow = currentRocYear();
            for (let y = rocNow + 2; y >= rocNow - 8; y--) {
                const opt = document.createElement('option');
                opt.value = String(y);
                opt.textContent = y + ' 年';
                ySel.appendChild(opt);
            }
            const mSel = document.createElement('select');
            mSel.id = 'lal-f-owedM';
            const mOpt0 = document.createElement('option');
            mOpt0.value = '';
            mOpt0.textContent = '— 月 —';
            mSel.appendChild(mOpt0);
            for (let m = 1; m <= 12; m++) {
                const opt = document.createElement('option');
                opt.value = String(m);
                opt.textContent = m + ' 月';
                mSel.appendChild(opt);
            }
            row.append(ySel, mSel);
            const now = new Date();
            const defM = now.getMonth() === 0 ? 12 : now.getMonth();
            const defY = now.getMonth() === 0 ? rocNow - 1 : rocNow;
            mSel.value = String(defM);
            ySel.value = String(defY);
            wrap.append(title, row);
            wrap.className = 'lal-field-cell lal-field-cell--month';
            return wrap;
        }

        if (def.type === 'select') {
            wrap.className = 'lal-field-cell lal-field-cell--select';
            const title = document.createElement('di' + 'v');
            title.className = 'lal-field-title';
            title.textContent = def.label;
            const sel = document.createElement('select');
            sel.id = 'lal-f-' + fieldKey;
            (def.options || []).forEach((o) => {
                const opt = document.createElement('option');
                opt.value = o.value;
                opt.textContent = o.label;
                sel.appendChild(opt);
            });
            wrap.append(title, sel);
            return wrap;
        }

        wrap.className = 'lal-field-cell';
        if (['rentMonthly', 'arrearsTotal', 'owedAmount'].includes(fieldKey)) {
            wrap.classList.add('lal-field-cell--money');
        }
        const title = document.createElement('di' + 'v');
        title.className = 'lal-field-title';
        title.textContent = def.label;
        const inp = mkInput('lal-f-' + fieldKey, def.placeholder || '');
        wrap.append(title, inp);
        if (def.fullWidth) {
            wrap.classList.remove('lal-field-cell');
            wrap.classList.add('lal-field-block');
        }
        return wrap;
    }

    function renderTplFields() {
        const host = $('lal-tpl-fields');
        const tpl = getSelectedLetterTemplate();
        if (!host) return;
        host.innerHTML = '';
        if (!tpl) return;
        tpl.fields.forEach((fk) => {
            const block = renderTplFieldBlock(fk);
            if (block) host.appendChild(block);
        });
        if (host.dataset.tplBound !== '1') {
            host.dataset.tplBound = '1';
            host.addEventListener('input', scheduleApplyLetterTemplate);
            host.addEventListener('change', scheduleApplyLetterTemplate);
        }
        applyLetterTemplate(true);
        if (typeof window.applyLalCaseMode === 'function') window.applyLalCaseMode();
    }

    function listLetterTemplates() {
        const all = window.LAL_LETTER_TEMPLATES || [];
        const allow = window.LAL_TEMPLATE_ALLOWLIST;
        if (!Array.isArray(allow) || !allow.length) return all;
        const set = new Set(allow.map(String));
        return all.filter((t) => set.has(t.id));
    }

    function initLetterTemplateSelect() {
        const sel = $('lal-tpl-select');
        if (!sel || !window.LAL_LETTER_TEMPLATES) return;
        if (sel.dataset.bound === '1') return;
        sel.dataset.bound = '1';
        if (sel.options.length) {
            sel.addEventListener('change', renderTplFields);
            return;
        }
        const templates = listLetterTemplates();
        const onlyOne = templates.length === 1;
        if (!onlyOne) {
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = '— 請選擇範本 —';
            sel.appendChild(opt0);
        }
        let lastGroup = '';
        templates.forEach((t) => {
            if (!onlyOne && t.group !== lastGroup) {
                const og = document.createElement('optgroup');
                og.label = t.group;
                og.dataset.group = t.group;
                sel.appendChild(og);
                lastGroup = t.group;
            }
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            if (onlyOne) sel.appendChild(opt);
            else sel.lastElementChild.appendChild(opt);
        });
        sel.addEventListener('change', renderTplFields);
        const defId = window.LAL_TEMPLATE_DEFAULT || (onlyOne ? templates[0].id : '');
        if (defId && templates.some((t) => t.id === defId)) {
            sel.value = defId;
            renderTplFields();
        }
    }

    function partyListEl(role) {
        return $(`lal-list-${role}`);
    }

    function readParties(role) {
        return [...partyListEl(role).querySelectorAll('[data-lal-party]')].map((el) => ({
            name: (el.querySelector('.lal-party-card__name-input')?.value || '').trim(),
            addr: (el.querySelector('.lal-party-card__addr-input')?.value || '').trim()
        })).filter((p) => p.name || p.addr);
    }

    function createPartyCard(role, item, index) {
        const card = document.createElement('div');
        card.className = 'lal-party-card';
        card.dataset.lalParty = '1';
        const labels = PARTY_LABELS[role] || PARTY_LABELS.receiver;
        const head = document.createElement('div');
        head.className = 'lal-party-card__head';
        const num = document.createElement('span');
        num.className = 'lal-party-card__num';
        num.textContent = '#' + index;
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-sm tone-rose';
        btnDel.textContent = '刪除';
        btnDel.addEventListener('click', () => { card.remove(); renumberParties(role); });
        head.append(num, btnDel);

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'lal-party-card__name-input w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm';
        nameInput.placeholder = labels.namePh;
        nameInput.value = item.name || '';

        const addrInput = document.createElement('textarea');
        addrInput.className = 'lal-party-card__addr-input w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm mt-1.5';
        addrInput.rows = 2;
        addrInput.placeholder = labels.addrPh;
        addrInput.value = item.addr || '';

        card.append(head, nameInput, addrInput);
        return card;
    }

    function renumberParties(role) {
        partyListEl(role).querySelectorAll('[data-lal-party]').forEach((el, i) => {
            const num = el.querySelector('.lal-party-card__num');
            if (num) num.textContent = '#' + (i + 1);
        });
    }

    function addParty(role) {
        const list = partyListEl(role);
        const card = createPartyCard(role, { name: '', addr: '' }, list.querySelectorAll('[data-lal-party]').length + 1);
        list.appendChild(card);
        card.querySelector('.lal-party-card__name-input')?.focus();
    }

    function clearParties(role) {
        partyListEl(role).innerHTML = '';
    }

    function clearAll() {
        ['sender', 'receiver', 'cc'].forEach(clearParties);
        const c = $('lal-content');
        if (c) c.value = '';
        contentManuallyEdited = false;
        const sel = $('lal-tpl-select');
        if (sel) sel.value = '';
        const fields = $('lal-tpl-fields');
        if (fields) fields.innerHTML = '';
    }

    function isOnlyOne(list) {
        const names = list.filter((p) => p.name);
        const addrs = list.filter((p) => p.addr);
        if (names.length > 1 || addrs.length > 1) return false;
        return true;
    }

    function onePageEnough(senders, receivers, ccs) {
        return isOnlyOne(senders) && isOnlyOne(receivers) && isOnlyOne(ccs);
    }

    async function buildOverlayPdf(PDFLib, fontBytes, senders, receivers, ccs, mainText) {
        const { PDFDocument, rgb } = PDFLib;
        const overlayDoc = await PDFDocument.create();
        if (!window.fontkit) throw new Error('字型引擎未載入');
        overlayDoc.registerFontkit(window.fontkit);
        const font = await overlayDoc.embedFont(fontBytes);

        const drawText = (page, text, x, y, size) => {
            page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
        };

        const drawLine = (page, x1, y1, x2, y2) => {
            page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0, 0, 0) });
        };

        const drawRect = (page, x, y, w, h) => {
            page.drawRectangle({ x, y, width: w, height: h, borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
        };

        let page = overlayDoc.addPage([PAGE_W, PAGE_H]);
        const single = onePageEnough(senders, receivers, ccs);

        if (single) {
            if (senders[0]?.name) drawText(page, senders[0].name, NAME_COORDINATE.s_x_y_begin[0], NAME_COORDINATE.s_x_y_begin[1], 10);
            if (senders[0]?.addr) drawText(page, senders[0].addr, ADDR_COORDINATE.s_x_y_begin[0], ADDR_COORDINATE.s_x_y_begin[1], 10);
            if (receivers[0]?.name) drawText(page, receivers[0].name, NAME_COORDINATE.r_x_y_begin[0], NAME_COORDINATE.r_x_y_begin[1], 10);
            if (receivers[0]?.addr) drawText(page, receivers[0].addr, ADDR_COORDINATE.r_x_y_begin[0], ADDR_COORDINATE.r_x_y_begin[1], 10);
            if (ccs[0]?.name) drawText(page, ccs[0].name, NAME_COORDINATE.c_x_y_begin[0], NAME_COORDINATE.c_x_y_begin[1], 10);
            if (ccs[0]?.addr) drawText(page, ccs[0].addr, ADDR_COORDINATE.c_x_y_begin[0], ADDR_COORDINATE.c_x_y_begin[1], 10);
        } else {
            drawInfoBox(page, drawText, drawLine, drawRect, font, senders, receivers, ccs);
            page = overlayDoc.addPage([PAGE_W, PAGE_H]);
        }

        writeMainArticle(overlayDoc, page, drawText, mainText);

        return overlayDoc.save();
    }

    function drawInfoBox(page, drawText, drawLine, drawRect, font, senders, receivers, ccs) {
        drawText(page, '[請自行剪下貼上]', CUT_INFO[0], CUT_INFO[1], 8);
        drawLine(page, BOX_UPPERLEFT[0], BOX_UPPERLEFT[1], BOX_UPPERRIGHT[0], BOX_UPPERRIGHT[1]);
        drawText(page, '（寄件人如為機關、團體、學校、公司、商號請加蓋單位圖章及法定代理人簽名或蓋章）', QUOTE[0], QUOTE[1], 8);
        drawRect(page, RECT[0], RECT[1], RECT[2], RECT[3]);
        drawText(page, '印', CHT_IN_RECT[0], CHT_IN_RECT[1], 10);

        let y = DETAIL_START[1];
        drawText(page, '一、寄件人', TITLE_START[0], TITLE_START[1], 10);
        y = fillPartyBlock(page, drawText, senders, DETAIL_START[0], y);

        y -= TITLE_Y_INTERVAL;
        drawText(page, '二、收件人', TITLE_START[0], y, 10);
        y = fillPartyBlock(page, drawText, receivers, DETAIL_START[0], y);

        y -= TITLE_Y_INTERVAL;
        drawText(page, '三、', TITLE_START[0], y, 10);
        drawText(page, '副 本', TITLE_START[0] + CC_RECEIVER_FIX[0], y + CC_RECEIVER_FIX[1], 10);
        drawText(page, '收件人', TITLE_START[0] + CC_RECEIVER_FIX[0], y - CC_RECEIVER_FIX[1], 10);
        y = fillPartyBlock(page, drawText, ccs, DETAIL_START[0], y);

        drawLine(page, BOX_UPPERLEFT[0], BOX_UPPERLEFT[1], BOX_UPPERLEFT[0], y);
        drawLine(page, BOX_UPPERLEFT[0], y, BOX_UPPERRIGHT[0], y);
        drawLine(page, BOX_UPPERRIGHT[0], BOX_UPPERRIGHT[1], BOX_UPPERRIGHT[0], y);
    }

    function fillPartyBlock(page, drawText, list, x, yStart) {
        const max = Math.max(list.length, 1);
        let y = yStart;
        if (list.length === 0) {
            drawText(page, '姓名：', x, y, 10);
            y -= DETAIL_Y_INTERVAL;
            drawText(page, '詳細地址：', x, y, 10);
            return y - DETAIL_Y_INTERVAL;
        }
        for (let i = 0; i < max; i++) {
            const p = list[i] || { name: '', addr: '' };
            drawText(page, '姓名：' + (p.name || ''), x, y, 10);
            y -= DETAIL_Y_INTERVAL;
            drawText(page, '詳細地址：' + (p.addr || ''), x, y, 10);
            y -= DETAIL_Y_INTERVAL;
        }
        return y;
    }

    function writeMainArticle(overlayDoc, firstPage, drawText, mainText) {
        const text = String(mainText || '');
        let page = firstPage;
        let x = CONTENT_X_Y_BEGIN[0];
        let y = CONTENT_X_Y_BEGIN[1];
        let lineCounter = 1;
        let charCounter = 1;

        const newPage = () => {
            page = overlayDoc.addPage([PAGE_W, PAGE_H]);
            x = CONTENT_X_Y_BEGIN[0];
            y = CONTENT_X_Y_BEGIN[1];
            lineCounter = 1;
            charCounter = 1;
        };

        const newLine = () => {
            x = CONTENT_X_Y_BEGIN[0];
            y -= CONTENT_X_Y_INTERVAL[1] + CONTENT_X_Y_FIX[1];
            lineCounter += 1;
            charCounter = 1;
        };

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '\n' || charCounter > CONTENT_MAX_CHARACTER_PER_LINE) {
                newLine();
                if (ch === '\n') continue;
            }
            if (lineCounter > CONTENT_MAX_LINE_PER_PAGE) {
                newPage();
            }
            drawText(page, ch, x, y, 20);
            x += CONTENT_X_Y_INTERVAL[0] - CONTENT_X_Y_FIX[0];
            charCounter += 1;
        }
    }

    async function mergeWithTemplate(PDFLib, overlayBytes, templateBytes) {
        const { PDFDocument } = PDFLib;
        const templateDoc = await PDFDocument.load(templateBytes);
        const overlayDoc = await PDFDocument.load(overlayBytes);
        const outDoc = await PDFDocument.create();
        const pageCount = overlayDoc.getPageCount();

        for (let i = 0; i < pageCount; i++) {
            const [tplPage] = await outDoc.copyPages(templateDoc, [0]);
            const [ovlPage] = await outDoc.copyPages(overlayDoc, [i]);
            const embedded = await outDoc.embedPage(ovlPage);
            tplPage.drawPage(embedded);
            outDoc.addPage(tplPage);
        }

        return outDoc.save();
    }

    let lalPreviewUrl = null;

    function revokeLalPreview() {
        if (lalPreviewUrl) {
            URL.revokeObjectURL(lalPreviewUrl);
            lalPreviewUrl = null;
        }
    }

    function ensureLalPreviewUi() {
        const actions = document.querySelector('.lal-actions') || $('btn-lal-generate')?.parentElement;
        if (!actions) return;
        if (!$('btn-lal-preview')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btn-lal-preview';
            btn.textContent = '預覽';
            const gen = $('btn-lal-generate');
            if (gen) actions.insertBefore(btn, gen);
            else actions.appendChild(btn);
        }
        if ($('lal-preview-wrap')) return;
        const wrap = document.createElement('div');
        wrap.id = 'lal-preview-wrap';
        wrap.className = 'lal-preview-wrap';
        wrap.hidden = true;
        wrap.innerHTML =
            '<div class="lal-preview-bar">' +
              '<strong>📄 存證信函預覽</strong>' +
              '<span class="lal-preview-actions">' +
                '<button type="button" id="btn-lal-preview-tab" class="soft">另開分頁</button>' +
                '<button type="button" id="btn-lal-preview-close" class="soft">關閉預覽</button>' +
              '</span>' +
            '</div>' +
            '<iframe id="lal-preview-frame" title="存證信函預覽"></iframe>';
        const foot = $('lal-foot-seal');
        if (foot && foot.parentNode) foot.parentNode.insertBefore(wrap, foot);
        else actions.parentNode?.insertBefore(wrap, actions.nextSibling);

        if (!$('lal-preview-style')) {
            const style = document.createElement('style');
            style.id = 'lal-preview-style';
            style.textContent =
                '.lal-preview-wrap{margin:12px 0;border:2px solid #c9a227;border-radius:12px;overflow:hidden;background:#fff;}' +
                '.lal-preview-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#fffbeb,#fff);border-bottom:1px solid #e2e8f0;}' +
                '.lal-preview-bar strong{font-size:14px;font-weight:900;color:#192437;}' +
                '.lal-preview-actions{display:flex;gap:8px;}' +
                '.lal-preview-wrap iframe{display:block;width:100%;height:min(72vh,720px);border:0;background:#525659;}' +
                '#btn-lal-preview-tab,#btn-lal-preview-close{appearance:none;border:1.5px solid #cbd5e1;border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;background:#fff;color:#192437;}' +
                '#btn-lal-preview{background:#1d4ed8!important;color:#fff!important;border-color:#1d4ed8!important;}';
            document.head.appendChild(style);
        }
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

    async function generatePdf(mode) {
        const isPreview = mode === 'preview';
        const status = $('lal-status');
        const btn = $('btn-lal-generate');
        const btnPv = $('btn-lal-preview');
        const senders = readParties('sender');
        const receivers = readParties('receiver');
        const ccs = readParties('cc');
        const content = $('lal-content')?.value || '';

        if (!receivers.some((p) => p.name || p.addr)) {
            alert('請至少新增一位收件人。');
            return;
        }
        if (!content.trim()) {
            if (getSelectedLetterTemplate()) {
                applyLetterTemplate(true);
            }
            if (!($('lal-content')?.value || '').trim()) {
                alert('請選擇範本並填寫契約資訊，或直接輸入內文。');
                return;
            }
        }

        const finalContent = ($('lal-content')?.value || '').trim();
        if (!finalContent) {
            alert('請選擇範本並填寫契約資訊，或直接輸入內文。');
            return;
        }

        try {
            if (status) status.textContent = isPreview
                ? '產生預覽中（首次載入字型可能需十餘秒）…'
                : '載入字型與範本中（首次可能需十餘秒）…';
            if (btn) btn.disabled = true;
            if (btnPv) btnPv.disabled = true;

            const PDFLib = await loadPdfLib();
            const [fontBytes, templateBytes] = await Promise.all([getFontBytes(), getTemplateBytes()]);
            if (status) status.textContent = isPreview ? '預覽排版中…' : '排版產生中…';

            const overlayBytes = await buildOverlayPdf(PDFLib, fontBytes, senders, receivers, ccs, finalContent);
            const finalBytes = await mergeWithTemplate(PDFLib, overlayBytes, templateBytes);

            if (isPreview) {
                ensureLalPreviewUi();
                revokeLalPreview();
                const blob = new Blob([finalBytes], { type: 'application/pdf' });
                lalPreviewUrl = URL.createObjectURL(blob);
                const wrap = $('lal-preview-wrap');
                const frame = $('lal-preview-frame');
                if (wrap && frame) {
                    wrap.hidden = false;
                    frame.src = lalPreviewUrl;
                }
                if (status) status.textContent = '已產生預覽，確認無誤後再按「產生 PDF 文件」下載列印。';
                return;
            }

            const d = new Date();
            const fn = `lal_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}${d.getMinutes()}${d.getSeconds()}.pdf`;
            downloadPdf(finalBytes, fn);
            if (status) status.textContent = '已下載 PDF，請列印後至郵局辦理存證信函。';
        } catch (e) {
            console.error(e);
            resetAssetCache();
            const msg = (e && e.message) ? String(e.message) : String(e);
            alert((isPreview ? '預覽失敗：' : '產生失敗：') + msg);
            if (status) status.textContent = '';
        } finally {
            if (btn) btn.disabled = false;
            if (btnPv) btnPv.disabled = false;
        }
    }

    function bindLal() {
        const gen = $('btn-lal-generate');
        if (!gen || gen.dataset.bound === '1') return;
        gen.dataset.bound = '1';
        ensureLalPreviewUi();
        $('btn-lal-add-sender')?.addEventListener('click', () => addParty('sender'));
        $('btn-lal-add-receiver')?.addEventListener('click', () => addParty('receiver'));
        $('btn-lal-add-cc')?.addEventListener('click', () => addParty('cc'));
        $('btn-lal-clear-parties')?.addEventListener('click', () => {
            if (confirm('清除所有寄件人、收件人、副本？')) {
                clearParties('sender');
                clearParties('receiver');
                clearParties('cc');
            }
        });
        $('btn-lal-clear-content')?.addEventListener('click', () => {
            if ($('lal-content')) $('lal-content').value = '';
            contentManuallyEdited = false;
        });
        $('lal-content')?.addEventListener('input', () => { contentManuallyEdited = true; });
        $('btn-lal-clear-all')?.addEventListener('click', () => {
            if (confirm('清除全部資料？')) clearAll();
        });
        gen.addEventListener('click', () => generatePdf('download'));
        $('btn-lal-preview')?.addEventListener('click', () => generatePdf('preview'));
        $('btn-lal-preview-close')?.addEventListener('click', () => {
            const wrap = $('lal-preview-wrap');
            const frame = $('lal-preview-frame');
            if (frame) frame.src = 'about:blank';
            if (wrap) wrap.hidden = true;
            revokeLalPreview();
            const st = $('lal-status');
            if (st && /預覽/.test(st.textContent || '')) st.textContent = '';
        });
        $('btn-lal-preview-tab')?.addEventListener('click', () => {
            if (lalPreviewUrl) window.open(lalPreviewUrl, '_blank', 'noopener');
        });
        $('btn-lal-apply-tpl')?.addEventListener('click', () => applyLetterTemplate(false));
    }

    function applyArrearsPrefill() {
        try {
            const raw = sessionStorage.getItem('skyfun_arrears_prefill');
            if (!raw) return;
            const p = JSON.parse(raw);
            if (p.type !== 'letter') return;
            const list = partyListEl('receiver');
            if (list && !list.querySelector('[data-lal-party]') && (p.tenant || p.address)) {
                const card = createPartyCard('receiver', { name: p.tenant || '', addr: p.address || '' }, 1);
                list.appendChild(card);
            }
            sessionStorage.removeItem('skyfun_arrears_prefill');
            const st = $('lal-status');
            if (st) st.textContent = '已自呆帳追蹤系統帶入收件人';
        } catch { /* ignore */ }
    }

    function readCaseMode() {
        const caseType = document.querySelector('input[name="lal-case-type"]:checked')?.value || 'bao';
        const mailTarget = document.querySelector('input[name="lal-mail-target"]:checked')?.value || 'rent';
        return {
            caseType,
            mailTarget,
            seal: caseType === 'dai' ? '房東印章' : '公司大小章',
            copies: mailTarget === 'both' ? 4 : 3,
            withCc: mailTarget === 'both'
        };
    }

    function syncReceiptTemplate() {
        const tenantEl = $('lal-receipt-tenant');
        const lessorEl = $('lal-receipt-lessor');
        if (!tenantEl && !lessorEl) return;
        const receivers = typeof readParties === 'function' ? readParties('receiver') : [];
        const senders = typeof readParties === 'function' ? readParties('sender') : [];
        const r = receivers[0] || {};
        const s = senders[0] || {};
        if (tenantEl) {
            const t = [r.name, r.addr].filter(Boolean).join('\n');
            tenantEl.textContent = t || '填好上方「收件人」後會自動帶入';
        }
        if (lessorEl) {
            const mode = typeof readCaseMode === 'function' ? readCaseMode() : { caseType: 'bao' };
            const tag = mode.caseType === 'dai' ? '（代管＝房東）' : '（包租＝公司）';
            const t = [s.name, s.addr].filter(Boolean).join('\n');
            lessorEl.textContent = t ? (t + '\n' + tag) : ('填好上方「寄件人」後會自動帶入' + tag);
        }
    }

    function applyLalCaseMode() {
        if (!window.LAL_CASE_MODE_UI) return;
        const mode = readCaseMode();
        const isBao = mode.caseType === 'bao';
        const ccCol = $('lal-cc-col');
        if (ccCol) {
            ccCol.hidden = !mode.withCc;
            if (!mode.withCc) clearParties('cc');
        }
        document.querySelector('.lal-parties')?.classList.toggle('is-no-cc', !mode.withCc);

        const officeRow = $('lal-office-row');
        if (officeRow) officeRow.hidden = !isBao;
        ensureOfficeSelectOptions();
        const addSenderBtn = $('btn-lal-add-sender');
        if (addSenderBtn) addSenderBtn.hidden = isBao;
        const senderTitle = document.querySelector('#cf-lal .lal-party-col h4, .lal-party-col:has(#lal-list-sender) h4');
        const senderHead = $('lal-sender-title');
        if (senderHead) {
            senderHead.textContent = isBao ? '寄件人（選營業處自動帶入）' : '寄件人（房東）';
        } else if (senderTitle && partyListEl('sender')?.closest('.lal-party-col')?.contains(senderTitle)) {
            senderTitle.textContent = isBao ? '寄件人（選營業處自動帶入）' : '寄件人（房東）';
        }

        if (isBao) {
            if ($('lal-office-select')?.value) fillBaoSenderFromOffice();
            else {
                const tip = $('lal-office-tip');
                if (tip) tip.textContent = '請先選營業處，寄件人會自動帶入星鴻股份有限公司與該處地址。';
            }
        } else {
            const tip = $('lal-office-tip');
            if (tip) tip.textContent = '';
            const officeSel = $('lal-office-select');
            if (officeSel) officeSel.value = '';
        }

        const creditorBlock = document.querySelector('[data-lal-field="creditor"]');
        if (creditorBlock) creditorBlock.hidden = true;
        const creditor = $('lal-f-creditor');
        if (creditor) {
            // 包租：台端向本公司；代管：台端向本人
            creditor.value = isBao ? '本公司' : '本人';
            creditor.disabled = true;
        }

        const hint = $('lal-case-hint');
        if (hint) {
            const officeBit = isBao ? '；包租請選<strong>營業處</strong>帶入寄件人' : '；代管請自行填房東為寄件人';
            const sealBit = isBao
                ? '大小章蓋在<strong>存證信函右上角</strong>'
                : '<strong>房東印章</strong>蓋在<strong>存證信函右上角</strong>';
            hint.innerHTML = mode.withCc
                ? `本案${sealBit}；列印存證信函 <b>4</b> 份（收件租屋處＋副本戶籍地）${officeBit}。出門帶：存證信函 4 份、信封、回執聯。`
                : `本案${sealBit}；列印存證信函 <b>3</b> 份（僅租屋處，無副本）${officeBit}。出門帶：存證信函 3 份、信封、回執聯。`;
        }
        const pack = $('lal-pack-tip');
        if (pack) {
            pack.innerHTML = mode.withCc
                ? `帶 <b>存證信函 3 份或 4 份、信封、回執聯</b>。${isBao ? '大小章' : '房東印章'}蓋在<strong>存證信函右上角</strong>。寄<b>租屋處＋戶籍地</b>。`
                : `帶 <b>存證信函 3 份或 4 份、信封、回執聯</b>。${isBao ? '大小章' : '房東印章'}蓋在<strong>存證信函右上角</strong>。寄<b>租屋處</b>（無副本）。`;
        }
        const foot = $('lal-foot-seal');
        if (foot) {
            foot.textContent = isBao
                ? `※ 產出後請將大小章蓋在存證信函右上角、填回執，至郵局以掛號附回執寄發（列印 ${mode.copies} 份）。僅協助套印格式，不構成法律意見。`
                : `※ 產出後請將房東印章蓋在存證信函右上角、填回執，至郵局以掛號附回執寄發（列印 ${mode.copies} 份）。僅協助套印格式，不構成法律意見。`;
        }
        const note = $('lal-embed-note');
        if (note) {
            const caseLabel = isBao ? '包租' : '代管';
            note.textContent = mode.withCc
                ? `已選：${caseLabel}／租屋地＋戶籍地（4 份含副本）。首次產生若需載入標楷體，可能需等待十餘秒。`
                : `已選：${caseLabel}／僅租屋地（3 份、無副本）。首次產生若需載入標楷體，可能需等待十餘秒。`;
        }
        if (!contentManuallyEdited) scheduleApplyLetterTemplate();
        syncReceiptTemplate();
    }

    function bindLalCaseMode() {
        if (!window.LAL_CASE_MODE_UI) return;
        const root = $('cf-lal') || document;
        if (root.dataset.caseModeBound === '1') {
            applyLalCaseMode();
            return;
        }
        root.dataset.caseModeBound = '1';
        root.querySelectorAll('input[name="lal-case-type"], input[name="lal-mail-target"]').forEach((el) => {
            el.addEventListener('change', applyLalCaseMode);
        });
        ensureOfficeSelectOptions();
        $('lal-office-select')?.addEventListener('change', () => {
            fillBaoSenderFromOffice();
            syncReceiptTemplate();
        });
        root.addEventListener('input', (e) => {
            if (e.target.closest('[data-lal-party]')) syncReceiptTemplate();
        });
        applyLalCaseMode();
    }

    window.applyLalCaseMode = applyLalCaseMode;
    window.readLalCaseMode = readCaseMode;

    window.initLalGenerator = function () {
        bindLal();
        initLetterTemplateSelect();
        warnIfFileProtocol();
        applyArrearsPrefill();
        bindLalCaseMode();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initLalGenerator);
    } else {
        window.initLalGenerator();
    }
})();
