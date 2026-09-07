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

    const TEMPLATE_PATH = 'assets/lal/tw_lal.pdf';
    const FONT_PATH = 'assets/lal/TW-Kai-98_1.ttf';
    const PDF_LIB_LOCAL = 'js/vendor/pdf-lib.min.js';
    const PDF_LIB_CDN = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    const FONTKIT_LOCAL = 'js/vendor/fontkit.umd.js';
    const FONTKIT_CDN = 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.js';

    let pdfLibPromise = null;

    const PARTY_LABELS = {
        sender: { namePh: '寄件人姓名', addrPh: '寄件人詳細地址' },
        receiver: { namePh: '收件人姓名', addrPh: '收件人詳細地址（租屋處）' },
        cc: { namePh: '副本收件人姓名', addrPh: '副本收件人詳細地址（多為戶籍地）' }
    };
    let templateBytesPromise = null;
    let fontBytesPromise = null;

    function $(id) { return document.getElementById(id); }

    function isFileProtocol() {
        return window.location.protocol === 'file:';
    }

    function resolveAssetUrl(path) {
        return new URL(path.replace(/^\.\//, ''), document.baseURI).href;
    }

    const FONT_MANIFEST = 'js/lal-font/manifest.js';
    const FONT_PART_PREFIX = 'js/lal-font/part-';

    function base64ToArrayBuffer(b64) {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    /** file:// 或 fetch 失敗時，從內嵌分片載入標楷體（無需手動選檔） */
    async function loadEmbeddedFontBytes() {
        const status = $('lal-status');
        if (!window.LAL_FONT_PART_COUNT) {
            await loadScript(resolveAssetUrl(FONT_MANIFEST));
        }
        const total = window.LAL_FONT_PART_COUNT;
        if (!total) {
            throw new Error('找不到內嵌字型。請確認資料夾內含 js/lal-font/');
        }
        window.LAL_FONT_PARTS = window.LAL_FONT_PARTS || [];
        for (let i = window.LAL_FONT_PARTS.length; i < total; i++) {
            if (status) status.textContent = `載入字型中…（${i + 1}/${total}）`;
            const partPath = FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js';
            await loadScript(resolveAssetUrl(partPath));
        }
        return base64ToArrayBuffer(window.LAL_FONT_PARTS.join(''));
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
        return fetch(url).then((r) => {
            if (!r.ok) throw new Error('無法載入資源（HTTP ' + r.status + '）：' + url);
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
                return await fetchAsset(FONT_PATH);
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
    let tplFieldsBound = false;
    /** 使用者手動改過內文時，不再被範本自動覆寫 */
    let contentManuallyEdited = false;

    function getSelectedLetterTemplate() {
        const id = $('lal-tpl-select')?.value;
        if (!id) return null;
        return (window.LAL_LETTER_TEMPLATES || []).find((t) => t.id === id) || null;
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
            const hint = document.createElement('p');
            hint.className = 'lal-hint';
            hint.textContent = '起租日、迄租日可直接輸入 115/06/15；離開欄位後會自動格式化，並計算計租年／月數帶入內文';
            wrap.appendChild(hint);
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
        if (!tplFieldsBound) {
            tplFieldsBound = true;
            host.addEventListener('input', scheduleApplyLetterTemplate);
            host.addEventListener('change', scheduleApplyLetterTemplate);
        }
        applyLetterTemplate(true);
    }

    function initLetterTemplateSelect() {
        const sel = $('lal-tpl-select');
        if (!sel || !window.LAL_LETTER_TEMPLATES) return;
        if (sel.options.length) return;
        let lastGroup = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = '— 請選擇範本 —';
        sel.appendChild(opt0);
        window.LAL_LETTER_TEMPLATES.forEach((t) => {
            if (t.group !== lastGroup) {
                const og = document.createElement('optgroup');
                og.label = t.group;
                og.dataset.group = t.group;
                sel.appendChild(og);
                lastGroup = t.group;
            }
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.title;
            sel.lastElementChild.appendChild(opt);
        });
        sel.addEventListener('change', renderTplFields);
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

    async function generatePdf() {
        const status = $('lal-status');
        const btn = $('btn-lal-generate');
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
            if (status) status.textContent = '載入字型與範本中（首次可能需十餘秒）…';
            if (btn) btn.disabled = true;

            const PDFLib = await loadPdfLib();
            const [fontBytes, templateBytes] = await Promise.all([getFontBytes(), getTemplateBytes()]);
            if (status) status.textContent = '排版產生中…';

            const overlayBytes = await buildOverlayPdf(PDFLib, fontBytes, senders, receivers, ccs, finalContent);
            const finalBytes = await mergeWithTemplate(PDFLib, overlayBytes, templateBytes);

            const d = new Date();
            const fn = `lal_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}${d.getMinutes()}${d.getSeconds()}.pdf`;
            downloadPdf(finalBytes, fn);
            if (status) status.textContent = '已下載 PDF，請列印後至郵局辦理存證信函。';
        } catch (e) {
            console.error(e);
            resetAssetCache();
            const msg = (e && e.message) ? String(e.message) : String(e);
            alert('產生失敗：' + msg);
            if (status) status.textContent = '';
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    let lalBound = false;

    function bindLal() {
        if (lalBound) return;
        lalBound = true;
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
        $('btn-lal-generate')?.addEventListener('click', generatePdf);
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

    window.initLalGenerator = function () {
        bindLal();
        initLetterTemplateSelect();
        warnIfFileProtocol();
        applyArrearsPrefill();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initLalGenerator);
    } else {
        window.initLalGenerator();
    }
})();
