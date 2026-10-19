/**
 * 欠租強制執行聲請狀（查封屋內動產）套版產生器
 * 填寫欄位 → 產生 PDF 下載列印（字型與存證信函相同之標楷體）
 */
(function () {
    'use strict';

    const ASSET_BASE = (typeof window.ENFORCEMENT_PETITION_ASSET_BASE === 'string' && window.ENFORCEMENT_PETITION_ASSET_BASE)
        ? window.ENFORCEMENT_PETITION_ASSET_BASE.replace(/\/?$/, '/')
        : ((typeof window.NOTE_PETITION_ASSET_BASE === 'string' && window.NOTE_PETITION_ASSET_BASE)
            ? window.NOTE_PETITION_ASSET_BASE.replace(/\/?$/, '/')
            : '');
    const PDF_INCH = 72;
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN_L = 56;
    const MARGIN_R = 56;
    const MARGIN_T = 52;
    const MARGIN_B = 52;
    const LINE_H = 18;
    const FONT_PATHS = [
        ASSET_BASE + 'assets/lal/TW-Kai-98_1.ttf',
        ASSET_BASE + 'fonts/TW-Kai.ttf'
    ];
    const FONT_MANIFEST = ASSET_BASE + 'js/lal-font/manifest.js';
    const FONT_PART_PREFIX = ASSET_BASE + 'js/lal-font/part-';

    let fontBytesPromise = null;
    let previewUrl = null;

    function $(id) { return document.getElementById(id); }

    function val(id) {
        return String($(id)?.value || '').trim();
    }

    function num(id) {
        const n = Number(String($(id)?.value || '').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : 0;
    }

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function resolveAssetUrl(path) {
        return new URL(path.replace(/^\.\//, ''), document.baseURI).href;
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
        await loadScript(resolveAssetUrl(FONT_MANIFEST + '?v=ep'));
        const total = window.LAL_FONT_PART_COUNT;
        if (!total) throw new Error('找不到內嵌字型（js/lal-font）');
        for (let i = 0; i < total; i++) {
            if (statusEl) statusEl.textContent = `載入字型中…（${i + 1}/${total}）`;
            await loadScript(resolveAssetUrl(FONT_PART_PREFIX + String(i).padStart(3, '0') + '.js?v=ep'));
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

    function amountInFormalText(amount) {
        const n = Math.round(Number(amount) || 0);
        if (n >= 10000) {
            const wan = Math.floor(n / 10000);
            const rest = n % 10000;
            if (!rest) return `${wan} 萬元整`;
            return `${wan} 萬 ${rest} 元整`;
        }
        return `${formatMoney(n)} 元整`;
    }

    function buildExecTitle(d) {
        return `${d.notaryOffice}${d.notaryRef}公證書（債務人願逕受強制執行）。`;
    }

    function extractNotaryOfficeName(full) {
        const s = String(full || '').trim();
        const m = s.match(/民間公證人(.+)$/);
        if (m) return m[1];
        return s.replace(/^臺灣[^所]*地方法院所屬民間公證人/, '').replace(/^民間公證人/, '') || s;
    }

    function buildReasonParagraphs(d) {
        const leaseLabel = d.leaseType === '轉租' ? '房屋租賃（轉租）' : '房屋租賃';
        const contractDate = d.contractY
            ? `民國 ${d.contractY} 年 ${d.contractM || '　'} 月 ${d.contractD || '　'} 日`
            : '民國　　　年　　月　　日';
        const notaryRef = d.notaryRef || '　　　年度　　　字第　　　號';
        const monthlyRentCN = d.monthlyRent ? amountToChineseMoney(d.monthlyRent) : '　　　　　';
        const arrearsStart = d.arrearsStartY
            ? `民國 ${d.arrearsStartY} 年 ${d.arrearsStartM || '　'} 月`
            : '民國　　　年　　月';
        const arrearsEnd = d.arrearsEndY
            ? `民國 ${d.arrearsEndY} 年 ${d.arrearsEndM || '　'} 月 ${d.arrearsEndD || '　'} 日`
            : '民國　　　年　　月　　日';
        return [
            `一、聲請人與債務人於${contractDate}簽訂${leaseLabel}契約，並經臺灣${d.court}地方法院所屬民間公證人${d.notaryOfficeName}辦理公證（${notaryRef}），債務人並於公證書中約定願逕受強制執行。`,
            `二、依契約約定，債務人應按月給付租金新臺幣${monthlyRentCN}。`,
            `三、惟債務人自${arrearsStart}起未依約給付租金，截至${arrearsEnd}止，共積欠租金新臺幣${d.amountCN}（詳如附件「欠租明細表」）。`,
            '四、聲請人已多次以電話、LINE、書面催告（如附件）催討，惟債務人迄今仍未履行給付義務。',
            '五、為保障債權人權益，爰依公證法、強制執行法及其他相關規定，聲請准予強制執行。'
        ];
    }

    function buildExecContentParagraphs(d) {
        return [
            `一、債務人應給付聲請人積欠租金新臺幣${d.amountCN}（詳如欠租明細）。`,
            '二、執行費用由債務人負擔。'
        ];
    }

    function buildExecTargetParagraphs(d) {
        return [
            `請就債務人所有之財產實施強制執行，其中包含位於承租房屋（地址：${d.propertyAddr}）內之動產。`,
            '並請依法就債務人之銀行存款、薪資所得、汽車、機車及其他依法得執行之財產實施強制執行；如有必要，請准依強制執行法第19條第2項調查債務人財產。'
        ];
    }

    function buildEvidenceItems() {
        return [
            '一、公證書正本。',
            '二、租賃（轉租）契約正本。',
            '三、欠租明細表（金流表）。',
            '四、催告紀錄（LINE對話、催繳通知等）。',
            '五、存證信函。',
            '六、其他相關證明文件。'
        ];
    }

    function buildEvidenceChecklist() {
        return [
            { no: 1, name: '公證書正本', qty: '1 份' },
            { no: 2, name: '租賃（轉租）契約正本', qty: '1 份' },
            { no: 3, name: '欠租明細表（金流表）', qty: '1 份' },
            { no: 4, name: '催告紀錄（LINE對話、催繳通知等）', qty: '1 份' },
            { no: 5, name: '存證信函', qty: '1 份' },
            { no: 6, name: '其他相關證明文件', qty: '依需要' }
        ];
    }

    const CN_DIG = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
    const CN_UNIT = ['', '拾', '佰', '仟'];
    const CN_BIG = ['', '萬', '億'];

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

    /** 金額大寫（元整） */
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

    function parseRocDateText(raw) {
        const s = String(raw || '').trim();
        if (!s) return null;
        const m = s.match(/(\d{2,3})\s*[\/年.-]\s*(\d{1,2})\s*[\/月.-]\s*(\d{1,2})/);
        if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return { y: Number(iso[1]) - 1911, m: Number(iso[2]), d: Number(iso[3]) };
        return null;
    }

    function rocDateLabel(raw) {
        const p = parseRocDateText(raw);
        if (!p) return String(raw || '');
        return `民國 ${p.y} 年 ${p.m} 月 ${p.d} 日`;
    }

    function rocSlash(raw) {
        const p = parseRocDateText(raw);
        if (!p) return String(raw || '');
        return `${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`;
    }

    function todayRocParts() {
        const d = new Date();
        return { y: d.getFullYear() - 1911, m: d.getMonth() + 1, day: d.getDate() };
    }

    function readDebtors() {
        const rows = [];
        document.querySelectorAll('#ep-debtors-list .ep-debtor-row').forEach((row) => {
            const name = String(row.querySelector('.ep-debtor-name')?.value || '').trim();
            const id = String(row.querySelector('.ep-debtor-id')?.value || '').trim();
            if (name || id) rows.push({ name, id });
        });
        return rows;
    }

    function updateAddDebtorButton() {
        const btn = $('ep-btn-add-debtor');
        const count = document.querySelectorAll('#ep-debtors-list .ep-debtor-row').length;
        if (btn) btn.style.display = count >= 2 ? 'none' : '';
    }

    function addDebtorRow(data, index) {
        const wrap = $('ep-debtors-list');
        if (!wrap) return;
        const embed = !!$('ep-form')?.classList?.contains('nrpbox');
        const row = document.createElement('div');
        row.className = embed
            ? 'ep-debtor-row'
            : 'ep-debtor-row rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2';
        const title = index === 0 ? '第一位債務人' : '第二位債務人';
        const canRemove = index > 0;
        if (embed) {
            row.innerHTML = `
                <div class="ep-dyn-h"><strong>${title}</strong>${canRemove ? '<button type="button" class="soft ep-debtor-remove">刪除</button>' : ''}</div>
                <div class="nrp-grid">
                    <label class="nrp-field"><span>姓名<span class="req">*</span></span>
                        <input type="text" class="ep-debtor-name" value="${esc(data?.name || '')}" /></label>
                    <label class="nrp-field"><span>身分證統一編號<span class="req">*</span></span>
                        <input type="text" class="ep-debtor-id" value="${esc(data?.id || '')}" /></label>
                </div>`;
        } else {
            row.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-slate-800">${title}</span>
                    ${canRemove ? '<button type="button" class="btn btn-sm tone-slate-soft ep-debtor-remove">刪除</button>' : ''}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label class="practice-field"><span>姓名<span class="req-mark" aria-hidden="true">*</span></span>
                        <input type="text" class="ep-debtor-name w-full px-3 py-2 border border-slate-200 rounded-lg" value="${esc(data?.name || '')}" /></label>
                    <label class="practice-field"><span>身分證統一編號<span class="req-mark" aria-hidden="true">*</span></span>
                        <input type="text" class="ep-debtor-id w-full px-3 py-2 border border-slate-200 rounded-lg" value="${esc(data?.id || '')}" /></label>
                </div>`;
        }
        row.querySelector('.ep-debtor-remove')?.addEventListener('click', () => {
            row.remove();
            updateAddDebtorButton();
        });
        wrap.appendChild(row);
        updateAddDebtorButton();
    }

    function ensureDebtorRows() {
        const wrap = $('ep-debtors-list');
        if (!wrap || wrap.children.length) return;
        addDebtorRow({}, 0);
    }

    function readArrearsRows() {
        const rows = [];
        document.querySelectorAll('#ep-arrears-rows .ep-arrears-row').forEach((row) => {
            const label = row.querySelector('.ep-ar-label')?.value || '';
            const amt = Number(String(row.querySelector('.ep-ar-amt')?.value || '').replace(/[^\d]/g, '')) || 0;
            if (label.trim() || amt) rows.push({ label: label.trim(), amount: amt });
        });
        return rows;
    }

    function sumArrears(rows) {
        return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    }

    function readAmountTotal() {
        return sumArrears(readArrearsRows());
    }

    function resolveAmountTotal(rows) {
        return sumArrears(rows);
    }

    function buildArrearsDetail(rows) {
        if (!rows.length) return '';
        return rows.map((r) => {
            const label = r.label || '項目';
            return `${label} ${formatMoney(r.amount)} 元`;
        }).join('、');
    }

    function numVal(id) {
        return Number(String(val(id)).replace(/[^\d]/g, '')) || 0;
    }

    function normalizeCaseYear(raw) {
        return String(raw || '').trim().replace(/年度$/,'').replace(/年$/,'');
    }

    function collectFormData() {
        const rows = readArrearsRows();
        const total = resolveAmountTotal(rows);
        const debtors = readDebtors();
        const primary = debtors[0] || {};
        const region = val('ep-region');
        const preset = (window.ENFORCEMENT_REGION_PRESETS || {})[region] || {};
        const notaryOffice = val('ep-notary-exec') || preset.notaryExec || '';
        const notaryRef = val('ep-notary-serial');
        const leaseTypeVal = val('ep-lease-type') || '轉租';
        const propertyAddr = val('ep-property-addr');

        return {
            caseYear: normalizeCaseYear(val('ep-case-year')),
            caseSerial: val('ep-case-serial'),
            handler: val('ep-handler'),
            division: val('ep-division'),
            court: val('ep-court') || preset.court || '',
            amount: total,
            amountCN: amountToChineseMoney(total),
            debtors: debtors.map((t) => ({ ...t, addr: propertyAddr })),
            debtorName: primary.name,
            debtorId: primary.id,
            debtorAddr: propertyAddr,
            landlordName: val('ep-landlord-name'),
            landlordAddr: val('ep-landlord-addr'),
            landlordPhone: val('ep-landlord-phone'),
            tenantName: primary.name,
            tenantId: primary.id,
            tenantAddr: propertyAddr,
            propertyAddr,
            notaryRef,
            notaryOffice,
            notaryExec: notaryOffice,
            notaryOfficeName: extractNotaryOfficeName(notaryOffice),
            arrearsRows: rows,
            arrearsDetail: buildArrearsDetail(rows),
            leaseType: leaseTypeVal,
            contractY: val('ep-contract-y'),
            contractM: val('ep-contract-m'),
            contractD: val('ep-contract-d'),
            monthlyRent: numVal('ep-monthly-rent'),
            monthlyRentCN: amountToChineseMoney(numVal('ep-monthly-rent')),
            arrearsStartY: val('ep-arrears-start-y'),
            arrearsStartM: val('ep-arrears-start-m'),
            arrearsEndY: val('ep-arrears-end-y'),
            arrearsEndM: val('ep-arrears-end-m'),
            arrearsEndD: val('ep-arrears-end-d'),
            petitioner: val('ep-petitioner'),
            filingY: val('ep-filing-y') || String(todayRocParts().y),
            filingM: val('ep-filing-m') || String(todayRocParts().m),
            filingD: val('ep-filing-d') || String(todayRocParts().day)
        };
    }

    function validateData(d) {
        const miss = [];
        if (!d.landlordName) miss.push('聲請人（出租人）姓名');
        if (!d.debtors?.length || !d.debtors[0]?.name) miss.push('相對人（承租人）姓名');
        if (!d.debtors?.[0]?.id) miss.push('相對人（承租人）身分證統一編號');
        if (!d.propertyAddr) miss.push('承租房屋地址');
        if (!d.amount) miss.push('積欠金額明細（至少一筆）');
        if (!d.court) miss.push('管轄地方法院');
        if (!d.notaryRef) miss.push('公證書字號');
        if (!d.notaryOffice) miss.push('公證人事務所');
        if (!d.petitioner) miss.push('具狀人');
        return miss;
    }

    function buildDocumentParagraphs(d) {
        const p1 = [
            '民事聲請狀',
            '（強制執行）',
            '',
            `案號 ${d.caseYear || '　　　'} 年度 ${d.caseSerial || '　　　'} 字第　　　號　　承辦 ${d.handler || '　　　'}　　股別 ${d.division || '　　　'}`,
            '訴訟標的',
            `金額或價額　新台幣 ${d.amountCN}`,
            '',
            '聲請人即債權人',
            `出租人：${d.landlordName}`,
            `地址：${d.landlordAddr}`,
            `電話：${d.landlordPhone}`,
            '',
            '相對人即債務人（承租人）',
            ...(d.debtors || []).flatMap((t, i) => [
                `${d.debtors.length > 1 ? `（${i + 1}）` : ''}承租人：${t.name}`,
                `身分證字號：${t.id}`,
                `地址：${t.addr}`,
                ''
            ]).slice(0, -1)
        ];

        const p2 = [
            '為聲請強制執行事：',
            '一、聲請強制執行之內容：',
            ...buildExecContentParagraphs(d),
            '二、執行名義：',
            buildExecTitle(d),
            '三、執行標的：',
            ...buildExecTargetParagraphs(d),
            '四、事由：',
            ...buildReasonParagraphs(d),
            '',
            '證物：',
            ...buildEvidenceItems(),
            '',
            '謹狀',
            `臺灣${d.court}地方法院民事執行處　　公鑒`,
            '',
            `中華民國${d.filingY}年${d.filingM}月${d.filingD}日`,
            `具狀人：${d.petitioner}`
        ];

        return p1.concat(['', '— 續下頁 —', ''], p2);
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
        const wrap = $('ep-preview-wrap');
        const frame = $('ep-preview-frame');
        if (frame) frame.src = 'about:blank';
        if (wrap) wrap.hidden = true;
    }

    function showPdfPreview(bytes) {
        revokePreview();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        previewUrl = URL.createObjectURL(blob);
        const wrap = $('ep-preview-wrap');
        const frame = $('ep-preview-frame');
        const textPre = $('ep-preview');
        if (frame) frame.src = previewUrl;
        if (wrap) wrap.hidden = false;
        if (textPre) {
            const data = collectFormData();
            textPre.innerHTML = buildDocumentParagraphs(data).map((l) => esc(l)).join('<br>');
        }
        const details = document.querySelector('#ep-form details.ep-preview-details, #ep-form details');
        if (details) details.open = true;
        wrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function openPreviewTab() {
        if (previewUrl) window.open(previewUrl, '_blank', 'noopener');
    }

    async function makePdf(mode) {
        const status = $('ep-status');
        const btnGen = $('ep-btn-generate');
        const btnPrev = $('ep-btn-preview');
        const d = collectFormData();
        const miss = validateDataWithHints(d);
        if (miss.length) {
            alert('請填寫：' + miss.join('、'));
            const first = document.querySelector('#ep-form .practice-field.is-error input, #ep-form .practice-field.is-error select, #ep-form .practice-field.is-error textarea, #ep-form .nrp-field.is-error input, #ep-form .nrp-field.is-error select, #ep-form .nrp-field.is-error textarea');
            first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            if (status) status.textContent = '繪製訴狀表格中…';
            const finalBytes = await window.buildEnforcementPetitionPdf(PDFLib, fontBytes, d, {
                amountInFormalText,
                buildExecTitle,
                buildExecContentParagraphs,
                buildExecTargetParagraphs,
                buildReasonParagraphs,
                buildEvidenceItems,
                buildEvidenceChecklist
            });

            if (mode === 'preview') {
                showPdfPreview(finalBytes);
                if (status) status.textContent = '預覽已就緒（含證物清單共 3 頁），確認後再下載列印。';
                return;
            }

            const stamp = new Date();
            const fn = `強制執行聲請_${d.debtorName || '案件'}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.pdf`;
            downloadPdf(finalBytes, fn);
            showPdfPreview(finalBytes);
            if (status) status.textContent = '已產生訴狀 PDF（含證物清單共 3 頁），請列印後至法院遞狀。';
        } catch (e) {
            console.error(e);
            alert('產生失敗：' + (e?.message || e));
            if (status) status.textContent = '';
        } finally {
            if (btnGen) btnGen.disabled = false;
            if (btnPrev) btnPrev.disabled = false;
        }
    }

    function generatePdf() {
        return makePdf('download');
    }

    function updatePreview() {
        return makePdf('preview');
    }

    function updateAmountSummary() {
        const rows = readArrearsRows();
        const total = resolveAmountTotal(rows);
        const cn = $('ep-amount-cn');
        const sum = $('ep-amount-sum');
        const detail = $('ep-arrears-detail-preview');
        if (cn) cn.textContent = amountToChineseMoney(total);
        if (sum) sum.textContent = formatMoney(total);
        if (detail) {
            detail.textContent = buildArrearsDetail(rows) || '（請至少新增一筆積欠項目）';
        }
    }

    function applyRegionPreset() {
        const region = val('ep-region');
        const preset = (window.ENFORCEMENT_REGION_PRESETS || {})[region];
        if (!preset) return;
        const set = (id, v) => { const el = $(id); if (el && v) el.value = v; };
        set('ep-court', preset.court);
        const offices = getRegionalNotaryOffices(region);
        const office = offices[0] || preset.notaryExec;
        set('ep-notary-exec', office);
    }

    function addArrearsRow(labelVal, amtVal) {
        const wrap = $('ep-arrears-rows');
        if (!wrap) return;
        const embed = !!$('ep-form')?.classList?.contains('nrpbox');
        const row = document.createElement('div');
        if (embed) {
            row.className = 'ep-arrears-row';
            row.innerHTML = `
                <label class="nrp-field"><span class="sr-only">積欠項目</span>
                    <input type="text" class="ep-ar-label" placeholder="113/12 租金、管理費" value="${esc(labelVal || '')}" /></label>
                <label class="nrp-field"><span class="sr-only">金額</span>
                    <input type="number" class="ep-ar-amt" min="0" step="1" value="${esc(amtVal || '')}" /></label>
                <button type="button" class="soft ep-ar-remove" title="刪除">✕</button>`;
        } else {
            row.className = 'ep-arrears-row grid grid-cols-[1fr_7.5rem_2.5rem] gap-2 items-end';
            row.innerHTML = `
                <label class="practice-field mb-0"><span class="sr-only">積欠項目</span>
                    <input type="text" class="ep-ar-label w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="113/12 租金、管理費" value="${esc(labelVal || '')}" /></label>
                <label class="practice-field mb-0"><span class="sr-only">金額</span>
                    <input type="number" class="ep-ar-amt w-full px-3 py-2 border border-slate-200 rounded-lg text-right tabular-nums" min="0" step="1" value="${esc(amtVal || '')}" /></label>
                <button type="button" class="btn btn-sm tone-slate-soft ep-ar-remove mb-0.5 justify-self-center" title="刪除">✕</button>`;
        }
        row.querySelector('.ep-ar-remove')?.addEventListener('click', () => {
            const count = document.querySelectorAll('#ep-arrears-rows .ep-arrears-row').length;
            if (count <= 1) {
                row.querySelector('.ep-ar-label').value = '';
                row.querySelector('.ep-ar-amt').value = '';
                updateAmountSummary();
                return;
            }
            row.remove();
            updateAmountSummary();
        });
        row.querySelectorAll('input').forEach((inp) => {
            inp.addEventListener('input', updateAmountSummary);
        });
        wrap.appendChild(row);
    }

    function ensureArrearsRows() {
        const wrap = $('ep-arrears-rows');
        if (!wrap || wrap.children.length) return;
        addArrearsRow('積欠租金', '');
    }

    function populateRegionSelect() {
        const regions = Object.keys(window.ENFORCEMENT_REGION_PRESETS || {});
        const sel = $('ep-region');
        if (!sel || !regions.length) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">請選擇地區（帶入法院／公證用語）</option>' +
            regions.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
        if (prev && regions.includes(prev)) sel.value = prev;
    }

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

    // 公證人事務所（可選也可自行輸入）
    const NOTARY_OFFICE_OPTIONS = [
        '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
        '臺灣臺北地方法院所屬民間公證人巫芸甄事務所',
        '臺灣桃園地方法院所屬民間公證人謝孟儒事務所',
        '臺灣臺中地方法院所屬民間公證人郭哲嫚事務所',
        '臺灣臺中地方法院所屬民間公證人薛任智事務所',
        '臺灣彰化地方法院所屬民間公證人彰化聯合事務所 郭俊麟公證人',
        '臺灣台南地方法院所屬民間公證人余乾慶事務所',
        '臺灣臺南地方法院所屬民間公證人黃淑芬事務所',
        '臺灣高雄地方法院民間公證人鼓山美術聯合事務所'
    ];

    const NOTARY_OFFICES_BY_REGION = {
        '臺北': [
            '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
            '臺灣臺北地方法院所屬民間公證人巫芸甄事務所'
        ],
        '新北': [
            '臺灣臺北地方法院所屬民間公證人賴靜瑜事務所',
            '臺灣臺北地方法院所屬民間公證人巫芸甄事務所'
        ],
        '桃園': ['臺灣桃園地方法院所屬民間公證人謝孟儒事務所'],
        '臺中': [
            '臺灣臺中地方法院所屬民間公證人郭哲嫚事務所',
            '臺灣臺中地方法院所屬民間公證人薛任智事務所'
        ],
        '彰化': ['臺灣彰化地方法院所屬民間公證人彰化聯合事務所 郭俊麟公證人'],
        '臺南': [
            '臺灣台南地方法院所屬民間公證人余乾慶事務所',
            '臺灣臺南地方法院所屬民間公證人黃淑芬事務所'
        ],
        '高雄': ['臺灣高雄地方法院民間公證人鼓山美術聯合事務所']
    };

    function getRegionalNotaryOffices(region) {
        return NOTARY_OFFICES_BY_REGION[region] || [];
    }

    function updateNotaryOfficeDatalists() {
        const execList = $('ep-notary-exec-list');
        if (!execList) return;
        const region = val('ep-region');
        const regional = getRegionalNotaryOffices(region);
        const options = regional.length ? regional : NOTARY_OFFICE_OPTIONS;
        execList.innerHTML = options.map((s) => `<option value="${esc(s)}"></option>`).join('');
    }

    function clearFieldErrorState() {
        document.querySelectorAll('#ep-form .practice-field.is-error, #ep-form .nrp-field.is-error').forEach((el) => el.classList.remove('is-error'));
        document.querySelectorAll('#ep-form .field-error').forEach((el) => el.remove());
        document.querySelectorAll('#ep-form [aria-invalid=\"true\"]').forEach((el) => el.removeAttribute('aria-invalid'));
    }

    function markFieldError(el, message) {
        if (!el) return;
        el.setAttribute('aria-invalid', 'true');
        const field = el.closest('.practice-field, .nrp-field');
        if (!field) return;
        field.classList.add('is-error');
        const msg = document.createElement('div');
        msg.className = 'field-error';
        msg.textContent = message || '此欄位必填';
        field.appendChild(msg);
    }

    function validateDataWithHints(d) {
        clearFieldErrorState();
        const miss = [];

        if (!val('ep-region') && !d.court) { miss.push('承辦地區'); markFieldError($('ep-region'), '必填：承辦地區'); }
        if (!d.caseYear) { miss.push('案號年度'); markFieldError($('ep-case-year'), '必填：案號年度'); }
        if (!d.court) { miss.push('管轄地方法院'); markFieldError($('ep-court'), '必填：管轄地方法院'); }
        if (!d.contractY || !d.contractM || !d.contractD) {
            miss.push('簽約日');
            if (!d.contractY) markFieldError($('ep-contract-y'), '必填');
            if (!d.contractM) markFieldError($('ep-contract-m'), '必填');
            if (!d.contractD) markFieldError($('ep-contract-d'), '必填');
        }
        if (!d.monthlyRent) { miss.push('月租金'); markFieldError($('ep-monthly-rent'), '必填：月租金'); }
        if (!d.arrearsStartY || !d.arrearsStartM) {
            miss.push('欠租起算年月');
            if (!d.arrearsStartY) markFieldError($('ep-arrears-start-y'), '必填');
            if (!d.arrearsStartM) markFieldError($('ep-arrears-start-m'), '必填');
        }
        if (!d.arrearsEndY || !d.arrearsEndM || !d.arrearsEndD) {
            miss.push('欠租截至年月日');
            if (!d.arrearsEndY) markFieldError($('ep-arrears-end-y'), '必填');
            if (!d.arrearsEndM) markFieldError($('ep-arrears-end-m'), '必填');
            if (!d.arrearsEndD) markFieldError($('ep-arrears-end-d'), '必填');
        }
        if (!d.landlordName) { miss.push('聲請人（出租人）姓名'); markFieldError($('ep-landlord-name'), '必填：出租人姓名／公司名'); }
        if (!d.landlordPhone) { miss.push('出租人電話'); markFieldError($('ep-landlord-phone'), '必填：出租人電話'); }
        if (!d.landlordAddr) { miss.push('出租人地址'); markFieldError($('ep-landlord-addr'), '必填：出租人地址'); }
        if (!d.propertyAddr) { miss.push('承租房屋地址'); markFieldError($('ep-property-addr'), '必填：承租房屋地址'); }
        if (!d.notaryRef) { miss.push('公證書字號'); markFieldError($('ep-notary-serial'), '必填：公證書字號'); }
        if (!d.notaryOffice) { miss.push('公證人事務所'); markFieldError($('ep-notary-exec'), '必填：公證人事務所'); }
        if (!d.petitioner) { miss.push('具狀人'); markFieldError($('ep-petitioner'), '必填：具狀人'); }

        const firstDebtorName = document.querySelector('#ep-debtors-list .ep-debtor-row .ep-debtor-name');
        const firstDebtorId = document.querySelector('#ep-debtors-list .ep-debtor-row .ep-debtor-id');
        if (!d.debtors?.length || !d.debtors[0]?.name) {
            miss.push('相對人（承租人）姓名');
            markFieldError(firstDebtorName, '必填：承租人姓名');
        }
        if (!d.debtors?.[0]?.id) {
            miss.push('相對人（承租人）身分證統一編號');
            markFieldError(firstDebtorId, '必填：承租人身分證統一編號');
        }
        document.querySelectorAll('#ep-debtors-list .ep-debtor-row').forEach((row, i) => {
            if (i === 0) return;
            const name = String(row.querySelector('.ep-debtor-name')?.value || '').trim();
            const idEl = row.querySelector('.ep-debtor-id');
            const id = String(idEl?.value || '').trim();
            if (name && !id) {
                miss.push('第二位債務人身分證統一編號');
                markFieldError(idEl, '必填：身分證統一編號');
            }
        });

        const hasAmount = (d.arrearsRows || []).some((r) => Number(r.amount) > 0);
        if (!hasAmount) {
            miss.push('積欠金額明細（至少一筆）');
            const firstAmt = document.querySelector('#ep-arrears-rows .ep-arrears-row .ep-ar-amt');
            markFieldError(firstAmt, '必填：請填至少一筆金額');
        }

        return miss;
    }

    function resetLandlordBranchSelect() {
        const branchSel = $('ep-landlord-branch');
        if (!branchSel) return;
        branchSel.innerHTML = '<option value="">－ 請先選公司別 －</option>';
        branchSel.disabled = true;
        branchSel.value = '';
    }

    function clearLandlordSection() {
        if ($('ep-landlord-company')) $('ep-landlord-company').value = '';
        resetLandlordBranchSelect();
        if ($('ep-landlord-name')) $('ep-landlord-name').value = '';
        if ($('ep-landlord-phone')) $('ep-landlord-phone').value = '';
        if ($('ep-landlord-addr')) $('ep-landlord-addr').value = '';
    }

    function bind() {
        const form = $('ep-form');
        if (!form || form.getAttribute('data-ep-bound') === '1') return;
        form.setAttribute('data-ep-bound', '1');

        populateRegionSelect();
        updateNotaryOfficeDatalists();

        const t = todayRocParts();
        if ($('ep-filing-y') && !$('ep-filing-y').value) $('ep-filing-y').value = String(t.y);
        if ($('ep-filing-m') && !$('ep-filing-m').value) $('ep-filing-m').value = String(t.m);
        if ($('ep-filing-d') && !$('ep-filing-d').value) $('ep-filing-d').value = String(t.day);

        $('ep-region')?.addEventListener('change', () => {
            applyRegionPreset();
            updateNotaryOfficeDatalists();
        });
        $('ep-landlord-company')?.addEventListener('change', () => {
            const company = val('ep-landlord-company');
            const branchSel = $('ep-landlord-branch');
            if (!branchSel) return;
            const branches = COMPANY_BRANCH_PRESETS[company] || [];
            if (!company || !branches.length) {
                resetLandlordBranchSelect();
                return;
            }
            branchSel.disabled = false;
            branchSel.innerHTML = '<option value="">－ 請選擇營業處 －</option>' +
                branches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
            $('ep-landlord-name').value = company;
        });
        $('ep-landlord-branch')?.addEventListener('change', () => {
            const company = val('ep-landlord-company');
            const branchId = val('ep-landlord-branch');
            const branches = COMPANY_BRANCH_PRESETS[company] || [];
            const hit = branches.find((b) => b.id === branchId);
            if (!hit) return;
            if ($('ep-landlord-name') && !$('ep-landlord-name').value) $('ep-landlord-name').value = company;
            if ($('ep-landlord-phone')) $('ep-landlord-phone').value = hit.phone;
            if ($('ep-landlord-addr')) $('ep-landlord-addr').value = hit.addr;
        });
        $('ep-btn-clear-landlord')?.addEventListener('click', clearLandlordSection);
        $('ep-btn-add-arrears')?.addEventListener('click', () => addArrearsRow('', ''));
        $('ep-btn-add-debtor')?.addEventListener('click', () => {
            const count = document.querySelectorAll('#ep-debtors-list .ep-debtor-row').length;
            if (count >= 2) return;
            addDebtorRow({}, count);
        });
        $('ep-btn-generate')?.addEventListener('click', generatePdf);
        $('ep-btn-preview')?.addEventListener('click', () => updatePreview());
        $('ep-btn-preview-tab')?.addEventListener('click', openPreviewTab);
        $('ep-btn-preview-close')?.addEventListener('click', closePreview);
        $('ep-btn-clear')?.addEventListener('click', () => {
            if (!confirm('清除本頁所有欄位？')) return;
            document.querySelectorAll('#ep-form input, #ep-form textarea').forEach((el) => {
                if (el.type === 'checkbox') el.checked = false;
                else el.value = '';
            });
            $('ep-arrears-rows').innerHTML = '';
            $('ep-debtors-list').innerHTML = '';
            addDebtorRow({}, 0);
            ensureArrearsRows();
            resetLandlordBranchSelect();
            updateAmountSummary();
            if ($('ep-preview')) $('ep-preview').innerHTML = '';
            closePreview();
        });

        ensureDebtorRows();
        ensureArrearsRows();
        updateAmountSummary();
    }

    window.initEnforcementPetition = function () {
        if (!$('ep-form')) return;
        populateRegionSelect();
        ensureDebtorRows();
        ensureArrearsRows();
        bind();
        updateAmountSummary();
    };

    window.enforcementPetitionFormHtml = function () {
        return '' +
            '<div class="nrpbox" id="ep-form">' +
              '<h3>⚖️ 強制執行｜民事聲請狀產生器</h3>' +
              '<p class="nrp-tip">依司法院「民事聲請狀（強制執行）」格式產生 PDF。填妥後先「預覽」確認完整版面，再下載列印。</p>' +
              '<div class="nrp-sec">' +
                '<h4>① 地區與案號</h4>' +
                '<div class="nrp-grid">' +
                  '<label class="nrp-field"><span>承辦地區<span class="req">*</span></span>' +
                    '<select id="ep-region"><option value="">請選擇地區</option></select></label>' +
                  '<label class="nrp-field"><span>案號年度（例 115）<span class="req">*</span></span><input id="ep-case-year" type="text" inputmode="numeric" placeholder="115" /></label>' +
                  '<label class="nrp-field span2"><span>管轄地方法院<span class="req">*</span></span><input id="ep-court" type="text" placeholder="新北" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>② 積欠金額明細</h4>' +
                '<p class="nrp-tip" style="margin:0">逐筆填寫項目與金額，系統自動加總。</p>' +
                '<div class="ep-arrears-head"><span>積欠項目</span><span>金額（元）*</span><span></span></div>' +
                '<div id="ep-arrears-rows" class="ep-arrears-list"></div>' +
                '<button type="button" class="soft" id="ep-btn-add-arrears">＋ 新增一筆積欠項目</button>' +
                '<p class="nrp-amt">合計：NT$ <b id="ep-amount-sum">0</b>　大寫：<b id="ep-amount-cn">零元整</b></p>' +
                '<p class="nrp-tip" style="margin:0">欠租明細：<span id="ep-arrears-detail-preview">（請至少新增一筆）</span></p>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>③ 契約與欠租期間</h4>' +
                '<div class="nrp-grid">' +
                  '<label class="nrp-field"><span>簽約日<span class="req">*</span></span><input id="ep-contract-y" type="text" inputmode="numeric" placeholder="113" /></label>' +
                  '<label class="nrp-field"><span>月<span class="req">*</span></span><input id="ep-contract-m" type="text" inputmode="numeric" placeholder="6" /></label>' +
                  '<label class="nrp-field"><span>日<span class="req">*</span></span><input id="ep-contract-d" type="text" inputmode="numeric" placeholder="1" /></label>' +
                  '<label class="nrp-field"><span>契約類型<span class="req">*</span></span>' +
                    '<select id="ep-lease-type"><option value="轉租" selected>房屋租賃（轉租）</option><option value="租賃">房屋租賃</option></select></label>' +
                  '<label class="nrp-field"><span>月租金（元）<span class="req">*</span></span><input id="ep-monthly-rent" type="number" min="0" step="1" placeholder="12000" /></label>' +
                  '<label class="nrp-field"><span>欠租起算年<span class="req">*</span></span><input id="ep-arrears-start-y" type="text" inputmode="numeric" placeholder="114" /></label>' +
                  '<label class="nrp-field"><span>月起<span class="req">*</span></span><input id="ep-arrears-start-m" type="text" inputmode="numeric" placeholder="1" /></label>' +
                  '<label class="nrp-field"><span>截至年<span class="req">*</span></span><input id="ep-arrears-end-y" type="text" inputmode="numeric" placeholder="114" /></label>' +
                  '<label class="nrp-field"><span>月<span class="req">*</span></span><input id="ep-arrears-end-m" type="text" inputmode="numeric" placeholder="3" /></label>' +
                  '<label class="nrp-field"><span>日<span class="req">*</span></span><input id="ep-arrears-end-d" type="text" inputmode="numeric" placeholder="31" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>④ 聲請人即債權人（出租人） <button type="button" class="soft" id="ep-btn-clear-landlord" style="margin-left:8px">一鍵清除</button></h4>' +
                '<div class="nrp-grid">' +
                  '<label class="nrp-field"><span>公司別（選填）</span>' +
                    '<select id="ep-landlord-company">' +
                      '<option value="">－ 請選擇公司別 －</option>' +
                      '<option value="星鴻股份有限公司">星鴻股份有限公司</option>' +
                      '<option value="星華股份有限公司">星華股份有限公司</option>' +
                    '</select></label>' +
                  '<label class="nrp-field"><span>營業處（選填）</span>' +
                    '<select id="ep-landlord-branch" disabled><option value="">－ 請先選公司別 －</option></select></label>' +
                  '<label class="nrp-field"><span>姓名<span class="req">*</span></span><input id="ep-landlord-name" type="text" /></label>' +
                  '<label class="nrp-field"><span>電話<span class="req">*</span></span><input id="ep-landlord-phone" type="tel" /></label>' +
                  '<label class="nrp-field span2"><span>地址<span class="req">*</span></span><input id="ep-landlord-addr" type="text" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>⑤ 相對人即債務人（承租人）</h4>' +
                '<div id="ep-debtors-list" class="ep-debtors-list"></div>' +
                '<button type="button" class="soft" id="ep-btn-add-debtor">＋ 新增第二位債務人</button>' +
                '<div class="nrp-grid" style="margin-top:8px">' +
                  '<label class="nrp-field span2"><span>承租房屋地址<span class="req">*</span></span><input id="ep-property-addr" type="text" placeholder="租屋地址" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>⑥ 公證書（執行名義）</h4>' +
                '<div class="nrp-grid">' +
                  '<label class="nrp-field span2"><span>公證書字號<span class="req">*</span></span><input id="ep-notary-serial" type="text" placeholder="113 年度桃院民公柏字第 000325 號" /></label>' +
                  '<label class="nrp-field span2"><span>公證人事務所<span class="req">*</span></span><input id="ep-notary-exec" type="text" list="ep-notary-exec-list" /></label>' +
                '</div>' +
                '<datalist id="ep-notary-exec-list"></datalist>' +
              '</div>' +
              '<div class="nrp-sec">' +
                '<h4>⑦ 具狀人與日期</h4>' +
                '<div class="nrp-grid">' +
                  '<label class="nrp-field span2"><span>具狀人<span class="req">*</span></span><input id="ep-petitioner" type="text" value="星鴻股份有限公司" placeholder="星鴻股份有限公司" /></label>' +
                  '<label class="nrp-field"><span>具狀民國年</span><input id="ep-filing-y" type="number" /></label>' +
                  '<label class="nrp-field"><span>月</span><input id="ep-filing-m" type="number" min="1" max="12" /></label>' +
                  '<label class="nrp-field"><span>日</span><input id="ep-filing-d" type="number" min="1" max="31" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="nrp-actions">' +
                '<button type="button" id="ep-btn-preview">預覽</button>' +
                '<button type="button" id="ep-btn-generate">產生 PDF（下載列印）</button>' +
                '<button type="button" class="soft" id="ep-btn-clear">清除欄位</button>' +
                '<p id="ep-status"></p>' +
              '</div>' +
              '<div id="ep-preview-wrap" class="nrp-preview-wrap" hidden>' +
                '<div class="nrp-preview-bar">' +
                  '<strong>📄 民事聲請狀預覽（完整 3 頁）</strong>' +
                  '<span class="nrp-preview-actions">' +
                    '<button type="button" id="ep-btn-preview-tab" class="soft">另開分頁</button>' +
                    '<button type="button" id="ep-btn-preview-close" class="soft">關閉預覽</button>' +
                  '</span>' +
                '</div>' +
                '<iframe id="ep-preview-frame" title="民事聲請狀預覽"></iframe>' +
              '</div>' +
              '<details class="nrp-sec ep-preview-details">' +
                '<summary style="cursor:pointer;font-weight:900">文字對照（選看）</summary>' +
                '<div id="ep-preview" style="margin-top:8px;font-size:13px;line-height:1.55;white-space:pre-wrap"></div>' +
              '</details>' +
              '<p class="nrp-foot">※ 可先按「預覽」看完整訴狀版面，再下載列印。須以已公證且載明逕受強制執行之租約為執行名義；遞狀前請覆核。</p>' +
            '</div>';
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initEnforcementPetition);
    } else {
        window.initEnforcementPetition();
    }
})();
