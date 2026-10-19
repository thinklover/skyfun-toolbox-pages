/**
 * 星鴻社宅工具箱 — 租管師專區（催收與聯絡工具）
 */
(function () {
    'use strict';

    function getContacts() {
        return window.PIP_CONTACTS_115 || [];
    }

    /** 社宅包租（三年合約）虛擬帳號前五碼 — 依案件區域 */
    const SOCIAL_HOUSING_REGION_PREFIXES = [
        { id: 'taipei', label: '台北', prefix: '10491' },
        { id: 'keelung', label: '基隆', prefix: '60400' },
        { id: 'yilan', label: '宜蘭', prefix: '76550' },
        { id: 'hsinchu-city', label: '新竹市', prefix: '76551' },
        { id: 'hsinchu-county', label: '新竹縣', prefix: '76552' },
        { id: 'chiayi', label: '嘉義', prefix: '23567' },
        { id: 'skyfun-chiayi', label: '星鴻嘉義', prefix: '76553' },
        { id: 'ntpc', label: '新北', prefix: '60402' },
        { id: 'taoyuan', label: '桃園', prefix: '60403' },
        { id: 'taichung', label: '台中', prefix: '60404' },
        { id: 'tainan', label: '台南', prefix: '60405' },
        { id: 'kaohsiung', label: '高雄', prefix: '60406' },
        { id: 'nantou', label: '南投', prefix: '60408' },
        { id: 'changhua', label: '彰化', prefix: '60409' }
    ];

    const REGION_PREFIX_BY_ID = Object.fromEntries(
        SOCIAL_HOUSING_REGION_PREFIXES.map((r) => [r.id, r.prefix])
    );

    /** 各區服務公司電話 */
    const COMPANY_OFFICE_PHONES = [
        { id: 'yilan', label: '宜蘭', tel: '03-910-8705' },
        { id: 'keelung', label: '基隆', tel: '02-7751-7851' },
        { id: 'hsinchu', label: '新竹', tel: '03-622-3937' },
        { id: 'changhua', label: '彰化', tel: '04-706-0725' },
        { id: 'shuangbei', label: '雙北', tel: '0809-092-122' },
        { id: 'tainan', label: '台南', tel: '06-703-2305' },
        { id: 'taichung', label: '台中', tel: '04-3707-2368' },
        { id: 'kaohsiung', label: '高雄', tel: '07-976-3955' },
        { id: 'taoyuan', label: '桃園', tel: '03-275-7773' },
        { id: 'nantou', label: '南投', tel: '049-700-9327' },
        { id: 'chiayi', label: '嘉義', tel: '05-320-9119' }
    ];

    const COMPANY_TEL_BY_ID = Object.fromEntries(
        COMPANY_OFFICE_PHONES.map((o) => [o.id, o.tel])
    );

    const TPL_REGION = { id: 'region', label: '案件區域（虛擬帳號前綴）', type: 'region' };
    const TPL_COMPANY_OFFICE = { id: 'companyOffice', label: '公司電話（服務區域）', type: 'companyTel' };
    const TPL_TENANT_ID = { id: 'tenantId', label: '承租人身分證字號', placeholder: 'A123456789', maxlength: 10 };

    const RENT_MESSAGE_TEMPLATES = {
        remind: {
            label: '提醒繳款（1–3 天）',
            fields: [
                { id: 'dueDay', label: '每月繳款日（號）', placeholder: '例如 5', type: 'number' },
                TPL_REGION,
                TPL_TENANT_ID
            ]
        },
        certified: {
            label: '通知寄發存證信函',
            fields: [
                { id: 'address', label: '承租地址', placeholder: '例如 新北市○○區○○路○號○樓' },
                { id: 'rent', label: '每月租金（元）', placeholder: '例如 18000', type: 'number' },
                { id: 'dueDay', label: '每月給付日（日）', placeholder: '例如 5', type: 'number' },
                { id: 'overdueDays', label: '目前已逾期（天）', placeholder: '例如 7', type: 'number' },
                TPL_REGION,
                TPL_TENANT_ID
            ]
        },
        phone: {
            label: '電訪未接／逾期催繳',
            fields: [
                TPL_COMPANY_OFFICE,
                { id: 'tenantTel', label: '房客手機', placeholder: '0917-103177' },
                { id: 'contact2Role', label: '第二聯絡人稱謂（選填）', placeholder: '太太' },
                { id: 'contact2Tel', label: '第二聯絡人手機（選填）', placeholder: '0968-007503' },
                { id: 'callTimes', label: '聯繫次數', placeholder: '3', type: 'number' },
                { id: 'rentMonth', label: '欠繳月份', placeholder: '12月' },
                { id: 'overdueDays', label: '目前已逾期（天）', placeholder: '14', type: 'number' },
                { id: 'dueDay', label: '每月應於幾號前匯款', placeholder: '10', type: 'number' },
                TPL_REGION,
                TPL_TENANT_ID
            ]
        }
    };

    let tplVersion = 'remind';

    function $(id) { return document.getElementById(id); }

    function valOrPlaceholder(v, placeholder) {
        const s = String(v ?? '').trim();
        return s || placeholder;
    }

    function getRegionPrefix(regionId) {
        return REGION_PREFIX_BY_ID[String(regionId || '').trim()] || '';
    }

    function getCompanyTel(officeId) {
        return COMPANY_TEL_BY_ID[String(officeId || '').trim()] || '';
    }

    function formatVirtualAccountLine(regionId, tenantId, accountLabel) {
        const label = accountLabel || '帳 戶';
        const prefix = getRegionPrefix(regionId);
        const id = String(tenantId || '').trim().toUpperCase();
        const idPart = id || '承租人身份證字號';
        if (!prefix) {
            return `${label}：【請選擇區域】＋${idPart}`;
        }
        return `${label}：${prefix}＋${idPart}`;
    }

    function bankBlock(regionId, tenantId) {
        return [
            '需請您將租金匯入以下帳戶：',
            '戶 名：星鴻股份有限公司',
            '金融機構：國泰帳號(西門分行)',
            formatVirtualAccountLine(regionId, tenantId),
            '再請於匯款後提供憑證於此,以利後續確認,謝謝'
        ].join('\n');
    }

    function buildRemindMessage(vals) {
        const dueDay = valOrPlaceholder(vals.dueDay, 'XX');
        return [
            '親愛的房客您好：',
            '我們是星鴻社會住宅，提醒您，因尚未核實到您的當月租金',
            `需請您將租金於每月【${dueDay}】號 匯入以下帳戶：`,
            '戶 名：星鴻股份有限公司',
            '金融機構：國泰帳號(西門分行)',
            formatVirtualAccountLine(vals.region, vals.tenantId),
            '再請於匯款後提供憑證於此,以利後續確認,謝謝'
        ].join('\n');
    }

    function phoneContactPhrase(vals) {
        const t1 = valOrPlaceholder(vals.tenantTel, '0912345678');
        const role2 = String(vals.contact2Role || '').trim();
        const t2 = String(vals.contact2Tel || '').trim();
        if (t2 && role2) return `您（${t1}）及${role2}（${t2}）`;
        if (t2) return `您（${t1}）及（${t2}）`;
        return `您（${t1}）`;
    }

    function buildPhoneUnreachableMessage(vals) {
        const companyTel = getCompanyTel(vals.companyOffice) || '【請選擇服務區域】';
        const callTimes = valOrPlaceholder(vals.callTimes, '3');
        const rentMonth = valOrPlaceholder(vals.rentMonth, '12月');
        const overdue = valOrPlaceholder(vals.overdueDays, '14');
        const dueDay = valOrPlaceholder(vals.dueDay, '10');
        return [
            '親愛的房客您好：',
            '',
            `我們稍早已使用公司電話（${companyTel}）致電${phoneContactPhrase(vals)}，共聯繫${callTimes}次，惟目前尚未接通。`,
            '',
            `經查詢，目前尚未核實收到您【${rentMonth}】租金，已逾期【${overdue}】日。若今日仍未收到租金，或未與我司協商繳款時間，後續將依法寄發存證信函提醒，尚請見諒。`,
            '',
            `請您於每月【${dueDay}】日前，將租金匯入以下帳戶：`,
            '',
            '戶名：星鴻股份有限公司',
            '金融機構：國泰世華銀行（西門分行）',
            formatVirtualAccountLine(vals.region, vals.tenantId, '帳號'),
            '',
            '匯款完成後，請提供匯款憑證於此對話，以利我司後續確認，謝謝。',
            '',
            '如有任何問題，歡迎隨時與我們聯繫。'
        ].join('\n');
    }

    function buildCertifiedMessage(vals) {
        const address = valOrPlaceholder(vals.address, '地址');
        const rentRaw = String(vals.rent ?? '').trim();
        const rent = rentRaw
            ? (/^\d+$/.test(rentRaw.replace(/,/g, '')) ? Number(rentRaw.replace(/,/g, '')).toLocaleString() : rentRaw)
            : 'XXXXX';
        const dueDay = valOrPlaceholder(vals.dueDay, 'XX');
        const overdue = valOrPlaceholder(vals.overdueDays, 'XX');
        return [
            `關於您承租【${address}】，租金為每月【${rent}】元，並定期於每月【${dueDay}】日給付，目前尚未收到您本月租金，提醒您記得依約給付，目前已逾期【${overdue}】日，將會寄發存證信函提醒您，懇請見諒，如有疑問歡迎隨時與我司聯繫，謝謝。`,
            bankBlock(vals.region, vals.tenantId) + '。'
        ].join('\n');
    }

    function getTplFieldValues() {
        const o = {};
        $('tpl-fields')?.querySelectorAll('[data-tpl-field]').forEach((inp) => {
            o[inp.dataset.tplField] = inp.value;
        });
        return o;
    }

    function setTplVersion(version) {
        tplVersion = version;
        document.querySelectorAll('.tpl-version-btn').forEach((btn) => {
            const active = btn.dataset.tplVersion === version;
            btn.classList.toggle('is-active', active);
            btn.classList.toggle('tone-purple', active);
            btn.classList.toggle('tone-slate-soft', !active);
        });
        buildTemplateFields();
    }

    function buildTemplateFields() {
        const spec = RENT_MESSAGE_TEMPLATES[tplVersion];
        const fields = $('tpl-fields');
        if (!spec || !fields) return;
        fields.innerHTML = spec.fields.map((f) => {
            if (f.type === 'region') {
                const opts = SOCIAL_HOUSING_REGION_PREFIXES.map(
                    (r) => `<option value="${r.id}">${r.label}（${r.prefix}）</option>`
                ).join('');
                return `<label class="practice-field sm:col-span-2"><span>${f.label}</span><select data-tpl-field="${f.id}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="">請選擇區域</option>${opts}</select></label>`;
            }
            if (f.type === 'companyTel') {
                const opts = COMPANY_OFFICE_PHONES.map(
                    (o) => `<option value="${o.id}">${o.label}（${o.tel}）</option>`
                ).join('');
                return `<label class="practice-field sm:col-span-2"><span>${f.label}</span><select data-tpl-field="${f.id}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="">請選擇服務區域</option>${opts}</select></label>`;
            }
            const type = f.type === 'number' ? 'number' : 'text';
            const max = f.maxlength ? ` maxlength="${f.maxlength}"` : '';
            const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : '';
            const extra = type === 'text' && f.id === 'tenantId' ? ' class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm uppercase"' : ' class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"';
            return `<label class="practice-field"><span>${f.label}</span><input type="${type}" data-tpl-field="${f.id}"${extra}${ph}${max}></label>`;
        }).join('');
        fillTemplate();
    }

    function fillTemplate() {
        const out = $('tpl-output');
        if (!out) return;
        const vals = getTplFieldValues();
        if (tplVersion === 'certified') out.value = buildCertifiedMessage(vals);
        else if (tplVersion === 'phone') out.value = buildPhoneUnreachableMessage(vals);
        else out.value = buildRemindMessage(vals);
    }

    function parseDateInput(v) {
        if (!v) return null;
        const d = new Date(v + 'T12:00:00');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function addDays(d, n) {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return x;
    }

    function addMonths(d, n) {
        const x = new Date(d);
        x.setMonth(x.getMonth() + n);
        return x;
    }

    function fmtDate(d) {
        if (!d) return '—';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}/${m}/${day}`;
    }

    const TL_CERT_LETTERS = {
        deposit: { id: 'arrears-under-2m', title: '【金額扣除押金後未累計至二個月】' },
        twoMonth1: { id: 'arrears-2m-1', title: '【欠租累計達二個月】第一封' },
        twoMonth2: { id: 'arrears-2m-2', title: '【欠租累計達二個月】第二封' }
    };

    function todayAtNoon() {
        const t = new Date();
        t.setHours(12, 0, 0, 0);
        return t;
    }

    function daysBetween(from, to) {
        return Math.round((to.getTime() - from.getTime()) / 86400000);
    }

    /** 依今日判斷目前應寄哪一封存證信函 */
    function resolveCurrentCertLetter(today, certDeposit, certTwoMonth1, certTwoMonth2) {
        if (today.getTime() >= certTwoMonth2.getTime()) return TL_CERT_LETTERS.twoMonth2;
        if (today.getTime() >= certTwoMonth1.getTime()) return TL_CERT_LETTERS.twoMonth1;
        if (today.getTime() >= certDeposit.getTime()) return TL_CERT_LETTERS.deposit;
        return null;
    }

    function calcTimeline() {
        const receivableDue = parseDateInput($('tl-receivable-due')?.value);
        const dueDay = parseInt($('tl-due-day')?.value, 10) || 5;
        const receiptDays = Math.max(1, parseInt($('tl-receipt-days')?.value, 10) || 7);
        const out = $('tl-output');
        if (!out) return;
        if (!receivableDue) {
            out.innerHTML = '<p class="text-slate-500">請輸入應收款日。</p>';
            return;
        }
        const twoMonthFirst = addDays(addMonths(receivableDue, 1), 1);
        const certDeposit = addDays(receivableDue, 14);
        const certTwoMonth1 = twoMonthFirst;
        const certTwoMonth2 = addDays(certTwoMonth1, receiptDays);
        const today = todayAtNoon();
        const daysSince = daysBetween(receivableDue, today);
        const currentCert = resolveCurrentCertLetter(today, certDeposit, certTwoMonth1, certTwoMonth2);

        const steps = [
            { when: receivableDue, kind: 'sop', text: '應收款日 · 官方 LINE／電話友善提醒（SOP 1–3 天）' },
            { when: addDays(receivableDue, 3), kind: 'sop', text: 'D+3 · 電訪房客並更新系統' },
            { when: addDays(receivableDue, 7), kind: 'sop', text: 'D+7 · 主管複核；安排家訪貼單（7–14 天窗口）' },
            {
                when: certDeposit,
                kind: 'cert',
                certKey: 'deposit',
                title: TL_CERT_LETTERS.deposit.title,
                note: 'D+14 · 家訪貼單同期辦理'
            },
            { when: addDays(receivableDue, 14), kind: 'sop', text: 'D+14 · 遲繳 14 日以上須主動回報主管（考核／獎金）' },
            {
                when: certTwoMonth1,
                kind: 'cert',
                certKey: 'twoMonth1',
                title: TL_CERT_LETTERS.twoMonth1.title,
                note: `欠租滿 1 個月又 1 日（應收款日 ${fmtDate(receivableDue)} 起算）`
            },
            {
                when: certTwoMonth2,
                kind: 'cert',
                certKey: 'twoMonth2',
                title: TL_CERT_LETTERS.twoMonth2.title,
                note: `收到第一封回執後（寄出日 +${receiptDays} 日估計）`
            },
            { when: addDays(receivableDue, 30), kind: 'sop', text: 'D+30 · 法務／主管會辦（視案件嚴重度）' }
        ];

        steps.sort((a, b) => a.when - b.when || (a.kind === 'cert' ? -1 : 1));

        let currentBanner;
        if (currentCert) {
            currentBanner = `<div class="tl-current-banner rounded-xl border-2 border-indigo-300 bg-indigo-50 px-4 py-3 mb-4">
                <p class="text-sm text-indigo-950 m-0">截至今日（應收款日後第 <strong>${daysSince}</strong> 天），目前應寄存證信函：</p>
                <p class="text-lg font-bold text-indigo-800 mt-1 mb-0">${currentCert.title}</p>
            </div>`;
        } else if (daysSince < 14) {
            currentBanner = `<div class="tl-current-banner rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
                <p class="text-sm text-slate-700 m-0">截至今日（第 <strong>${daysSince}</strong> 天）：尚未達 D+14 存證門檻，請持續 LINE／電訪催收。</p>
                <p class="text-xs text-slate-500 mt-1 mb-0">預計 ${fmtDate(certDeposit)} 寄出 ${TL_CERT_LETTERS.deposit.title}</p>
            </div>`;
        } else {
            currentBanner = '';
        }

        const rows = steps.map((s) => {
            const dLabel = fmtDate(s.when);
            const dPlus = daysBetween(receivableDue, s.when);
            const dTag = dPlus >= 0 ? `<span class="tl-dplus">D+${dPlus}</span>` : '';
            if (s.kind === 'cert') {
                const isCurrent = currentCert && currentCert.id === TL_CERT_LETTERS[s.certKey].id;
                const isPast = today.getTime() > s.when.getTime() && !isCurrent;
                return `<li class="timeline-cert${isCurrent ? ' timeline-current' : ''}${isPast ? ' timeline-past' : ''}">
                    <strong>${dLabel}${dTag}</strong>
                    <span>
                        <span class="tl-cert-title">${s.title}</span>
                        ${isCurrent ? '<span class="tl-now-badge">目前應寄</span>' : ''}
                        <span class="tl-cert-note">${s.note}</span>
                    </span>
                </li>`;
            }
            return `<li><strong>${dLabel}${dTag}</strong><span>${s.text}</span></li>`;
        }).join('');

        out.innerHTML = `
            ${currentBanner}
            <p class="text-sm text-slate-600 mb-2">建議催收時間軸（含存證信函標題，依日期排序）</p>
            <ul class="practice-timeline-list practice-timeline-merged">${rows}</ul>
            <p class="mt-4 flex flex-wrap gap-2">
                <button type="button" onclick="showPage('lal-generator')" class="btn btn-sm tone-rose">📮 存證信函產生器</button>
                <button type="button" onclick="showPage('termination')" class="btn btn-sm tone-slate-soft">📋 返回催收解約專區</button>
            </p>
            <p class="text-xs text-slate-500 mt-3">* 僅供內部 SOP 參考。約定繳款日：每月 ${dueDay} 日；回執估計 ${receiptDays} 日。應收款日：${fmtDate(receivableDue)}。</p>`;
    }

    function copyText(id) {
        const el = $(id);
        if (!el) return;
        navigator.clipboard?.writeText(el.value || el.textContent || '').then(() => {
            const btn = document.querySelector(`[data-copy-for="${id}"]`);
            if (btn) { const o = btn.textContent; btn.textContent = '已複製'; setTimeout(() => { btn.textContent = o; }, 1500); }
        });
    }

    function filterContacts() {
        const q = ($('contact-filter')?.value || '').trim();
        const box = $('contact-table-body');
        if (!box) return;
        const hay = (c) => [c.county, c.unit, c.address, c.tel, c.fax, c.hours].join(' ');
        const rows = getContacts().filter((c) => !q || hay(c).includes(q));
        box.innerHTML = rows.length
            ? rows.map((c) =>
                `<tr>
                    <td class="whitespace-nowrap">${c.county}</td>
                    <td>${c.unit}</td>
                    <td class="min-w-[12rem]">${c.address}</td>
                    <td class="whitespace-nowrap">${c.tel}</td>
                    <td class="whitespace-nowrap">${c.fax}</td>
                    <td>${c.hours}</td>
                </tr>`
            ).join('')
            : '<tr><td colspan="6" class="text-slate-500 text-center py-4">無相符資料</td></tr>';
    }

    function bindPractice() {
        $('btn-tl-calc')?.addEventListener('click', calcTimeline);
        $('btn-tpl-gen')?.addEventListener('click', fillTemplate);
        $('contact-filter')?.addEventListener('input', filterContacts);
        document.querySelectorAll('[data-copy-for]').forEach((btn) => {
            btn.addEventListener('click', () => copyText(btn.dataset.copyFor));
        });
        document.querySelectorAll('.tpl-version-btn').forEach((btn) => {
            btn.addEventListener('click', () => setTplVersion(btn.dataset.tplVersion));
        });
        $('tpl-fields')?.addEventListener('input', fillTemplate);
        $('tpl-fields')?.addEventListener('change', fillTemplate);
        if ($('tpl-fields')) setTplVersion('remind');
        filterContacts();
    }

    window.initPracticeTools = bindPractice;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindPractice);
    } else {
        bindPractice();
    }
})();
