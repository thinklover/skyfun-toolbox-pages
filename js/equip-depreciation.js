/**
 * 解約點交：設備損壞賠償試算（折舊後參考金額）
 * 耐用年限取自行政院主計總處「什項設備分類明細表」之最低使用年限。
 */
(function () {
    'use strict';

    const EQUIP_GROUPS = [
        { group: '家電', items: [
            { id: 'ac', name: '冷氣機（冷暖氣機）', life: 9, code: '5010106-03' },
            { id: 'fridge', name: '冰箱', life: 8, code: '5010107-01B' },
            { id: 'washer', name: '洗衣機', life: 5, code: '5010108-04' },
            { id: 'dryer', name: '烘乾機（乾衣機、洗衣烘乾機）', life: 5, code: '5010108-16' },
            { id: 'tv', name: '電視機', life: 6, code: '5010105-57' },
            { id: 'heater', name: '熱水器', life: 5, code: '5010108-07' },
            { id: 'dehumid', name: '除濕機', life: 5, code: '5010108-20' },
            { id: 'fan', name: '電扇（含抽風扇、冷風扇）', life: 5, code: '5010106-01' },
            { id: 'warmer', name: '電暖器', life: 5, code: '5010106-02' },
            { id: 'vacuum', name: '吸塵器', life: 5, code: '5010108-01' },
            { id: 'purifier', name: '淨水器（濾水器）', life: 5, code: '5010108-32' },
            { id: 'dispenser', name: '飲水機', life: 3, code: '5010110-19' },
            { id: 'kettle', name: '開飲機（開水機）', life: 3, code: '5010110-40' }
        ] },
        { group: '廚房', items: [
            { id: 'gas-stove', name: '瓦斯爐', life: 3, code: '5010110-17' },
            { id: 'e-stove', name: '電爐（電磁爐）', life: 3, code: '5010110-05' },
            { id: 'hood', name: '排油煙機（油煙罩）', life: 10, code: '5010110-66A' },
            { id: 'microwave', name: '微波爐', life: 3, code: '5010110-34' },
            { id: 'oven', name: '烤箱', life: 5, code: '5010110-06' },
            { id: 'cooker', name: '電鍋', life: 5, code: '5010110-07' },
            { id: 'dish-dryer', name: '烘碗機', life: 4, code: '5010110-38' },
            { id: 'dishwasher', name: '洗碗機', life: 6, code: '5010110-25' },
            { id: 'kitchen-cab', name: '流理台櫥櫃（含吊櫥）', life: 6, code: '5010306-12' }
        ] },
        { group: '家具', items: [
            { id: 'bed', name: '床（床架）', life: 5, code: '5010305-01' },
            { id: 'wardrobe', name: '衣櫃', life: 5, code: '5010305-03' },
            { id: 'nightstand', name: '床頭櫃', life: 5, code: '5010305-04' },
            { id: 'dresser', name: '梳妝台', life: 5, code: '5010305-02' },
            { id: 'desk-wood', name: '桌子（木製）', life: 5, code: '5010301-01B' },
            { id: 'desk-metal', name: '桌子（金屬）', life: 10, code: '5010301-01A' },
            { id: 'desk-plastic', name: '桌子（塑膠）', life: 3, code: '5010301-01C' },
            { id: 'dining', name: '餐桌（含茶几、咖啡桌）', life: 5, code: '5010306-01' },
            { id: 'chair', name: '椅子（椅凳）', life: 5, code: '5010304-02' },
            { id: 'sofa', name: '沙發', life: 5, code: '5010304-01' },
            { id: 'cabinet-wood', name: '櫃子（書櫃、鞋櫃等，木製／塑鋼）', life: 5, code: '5010303-01B' },
            { id: 'cabinet-metal', name: '櫃子（金屬）', life: 10, code: '5010303-01A' },
            { id: 'rack', name: '置物架', life: 5, code: '5010303-03' },
            { id: 'curtain', name: '窗簾', life: 3, code: '5010302-11' },
            { id: 'carpet', name: '地毯', life: 5, code: '5010302-12' }
        ] }
    ];
    const CUSTOM_ID = 'custom';
    const BY_ID = {};
    EQUIP_GROUPS.forEach(g => g.items.forEach(it => { BY_ID[it.id] = it; }));

    const nf = n => Math.round(n).toLocaleString('zh-TW');
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = el => { const v = parseFloat(el && el.value); return Number.isFinite(v) && v >= 0 ? v : null; };

    function optionsHtml() {
        let h = '<option value="">— 選擇設備 —</option>';
        EQUIP_GROUPS.forEach(g => {
            h += '<optgroup label="' + esc(g.group) + '">' +
                g.items.map(it => '<option value="' + it.id + '">' + esc(it.name) + '（' + it.life + ' 年）</option>').join('') +
                '</optgroup>';
        });
        h += '<optgroup label="其他"><option value="' + CUSTOM_ID + '">其他設備（自行輸入名稱與耐用年限）</option></optgroup>';
        return h;
    }

    function calc(price, life, usedYears) {
        const salvage = price / (life + 1);
        const annual = (price - salvage) / life;
        const usedCapped = Math.min(usedYears, life);
        const accum = annual * usedCapped;
        return { salvage, annual, accum, value: price - accum, expired: usedYears >= life };
    }

    function rowHtml() {
        return '' +
            '<div class="eqd-row rounded-xl border border-amber-200 bg-white p-3 md:p-4 space-y-3 shadow-sm">' +
                '<div class="flex items-start gap-2">' +
                    '<span class="eqd-no shrink-0 mt-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-black text-amber-800"></span>' +
                    '<div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">' +
                        '<label class="block space-y-1"><span class="text-xs font-semibold text-slate-600">設備</span>' +
                            '<select class="eqd-equip w-full px-3 py-2 border-2 border-slate-200 rounded-lg bg-white text-sm">' + optionsHtml() + '</select></label>' +
                        '<label class="eqd-custom-wrap hidden space-y-1"><span class="text-xs font-semibold text-slate-600">設備名稱</span>' +
                            '<input type="text" class="eqd-name w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" placeholder="例如：電子鎖"></label>' +
                    '</div>' +
                    '<button type="button" class="eqd-del shrink-0 mt-6 btn btn-sm tone-rose" aria-label="刪除此設備">刪除</button>' +
                '</div>' +
                '<div class="grid grid-cols-2 md:grid-cols-4 gap-2">' +
                    '<label class="block space-y-1"><span class="text-xs font-semibold text-slate-600">設備原價（元）</span>' +
                        '<input type="number" inputmode="numeric" min="0" step="1" class="eqd-price w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" placeholder="例如 30000"></label>' +
                    '<label class="block space-y-1"><span class="text-xs font-semibold text-slate-600">耐用年限（年）</span>' +
                        '<input type="number" inputmode="decimal" min="1" step="1" class="eqd-life w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm bg-slate-50" readonly placeholder="選設備自動帶入"></label>' +
                    '<label class="block space-y-1"><span class="text-xs font-semibold text-slate-600">已使用（年）</span>' +
                        '<input type="number" inputmode="numeric" min="0" step="1" class="eqd-years w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" placeholder="0"></label>' +
                    '<label class="block space-y-1"><span class="text-xs font-semibold text-slate-600">已使用（月）</span>' +
                        '<input type="number" inputmode="numeric" min="0" max="11" step="1" class="eqd-months w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm" placeholder="0"></label>' +
                '</div>' +
                '<div class="eqd-out text-sm text-slate-500">請選設備並輸入原價與已使用時間。</div>' +
            '</div>';
    }

    function readRow(row) {
        const sel = row.querySelector('.eqd-equip');
        const isCustom = sel.value === CUSTOM_ID;
        const item = BY_ID[sel.value];
        const name = isCustom ? (row.querySelector('.eqd-name').value.trim() || '其他設備') : (item ? item.name : '');
        const price = num(row.querySelector('.eqd-price'));
        const life = num(row.querySelector('.eqd-life'));
        const years = num(row.querySelector('.eqd-years')) || 0;
        const months = num(row.querySelector('.eqd-months')) || 0;
        return { name, item, price, life, years, months, used: years + months / 12, ready: !!name && price !== null && price > 0 && life !== null && life >= 1 };
    }

    function usedLabel(r) {
        const y = Math.floor(r.years), m = Math.floor(r.months);
        return [y ? y + ' 年' : '', m ? m + ' 個月' : ''].filter(Boolean).join(' ') || '未滿 1 個月';
    }

    function render(root) {
        const rows = [...root.querySelectorAll('.eqd-row')];
        let total = 0, count = 0;
        rows.forEach((row, i) => {
            row.querySelector('.eqd-no').textContent = i + 1;
            const out = row.querySelector('.eqd-out');
            const r = readRow(row);
            if (!r.ready) {
                out.className = 'eqd-out text-sm text-slate-500';
                out.textContent = '請選設備並輸入原價與已使用時間。';
                return;
            }
            const c = calc(r.price, r.life, r.used);
            total += Math.round(c.value);
            count++;
            out.className = 'eqd-out rounded-lg bg-amber-50/70 border border-amber-100 px-3 py-2 text-sm text-slate-700';
            out.innerHTML =
                '<div class="flex flex-wrap gap-x-4 gap-y-1">' +
                    '<span>殘值 <b>' + nf(c.salvage) + '</b></span>' +
                    '<span>每年折舊 <b>' + nf(c.annual) + '</b></span>' +
                    '<span>累計折舊 <b>' + nf(c.accum) + '</b>（' + esc(usedLabel(r)) + '）</span>' +
                '</div>' +
                '<div class="mt-1 text-base">參考賠償金額：<b class="text-rose-700 text-lg">' + nf(c.value) + '</b> 元' +
                    (c.expired ? ' <span class="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">已達耐用年限，以殘值計</span>' : '') +
                '</div>';
        });
        root.querySelector('#eqd-total').textContent = nf(total);
        root.querySelector('#eqd-count').textContent = count;
        root.querySelector('#eqd-copy').disabled = count === 0;
    }

    function summaryText(root) {
        const lines = ['【解約點交 設備損壞賠償試算（僅供參考）】'];
        let total = 0, i = 0;
        root.querySelectorAll('.eqd-row').forEach(row => {
            const r = readRow(row);
            if (!r.ready) return;
            const c = calc(r.price, r.life, r.used);
            total += Math.round(c.value);
            lines.push((++i) + '. ' + r.name + '：原價 ' + nf(r.price) + ' 元，耐用 ' + r.life + ' 年，已使用 ' + usedLabel(r) +
                '，參考賠償 ' + nf(c.value) + ' 元' + (c.expired ? '（已達耐用年限，以殘值計）' : ''));
        });
        lines.push('合計：' + nf(total) + ' 元');
        lines.push('※ 殘值＝原價÷(耐用年限＋1)；每年折舊額＝(原價－殘值)÷耐用年限；折舊後金額＝原價－累計折舊額。耐用年限依主計總處「什項設備分類明細表」。');
        return lines.join('\n');
    }

    function addRow(root) {
        const wrap = root.querySelector('#eqd-rows');
        wrap.insertAdjacentHTML('beforeend', rowHtml());
        render(root);
    }

    function init() {
        const root = document.getElementById('equip-dep');
        if (!root || root.dataset.ready) return;
        root.dataset.ready = '1';
        addRow(root);

        root.addEventListener('change', e => {
            if (!e.target.classList.contains('eqd-equip')) return;
            const row = e.target.closest('.eqd-row');
            const lifeEl = row.querySelector('.eqd-life');
            const isCustom = e.target.value === CUSTOM_ID;
            const item = BY_ID[e.target.value];
            const customWrap = row.querySelector('.eqd-custom-wrap');
            customWrap.classList.toggle('hidden', !isCustom);
            customWrap.classList.toggle('block', isCustom);
            lifeEl.readOnly = !isCustom;
            lifeEl.classList.toggle('bg-slate-50', !isCustom);
            lifeEl.value = item ? item.life : '';
            lifeEl.placeholder = isCustom ? '請輸入' : '選設備自動帶入';
            render(root);
        });
        root.addEventListener('input', () => render(root));
        root.addEventListener('click', e => {
            if (e.target.closest('#eqd-add')) { addRow(root); return; }
            const del = e.target.closest('.eqd-del');
            if (del) {
                del.closest('.eqd-row').remove();
                if (!root.querySelector('.eqd-row')) addRow(root); else render(root);
                return;
            }
            if (e.target.closest('#eqd-reset')) {
                root.querySelector('#eqd-rows').innerHTML = '';
                addRow(root);
                return;
            }
            const copyBtn = e.target.closest('#eqd-copy');
            if (copyBtn) {
                const text = summaryText(root);
                const done = () => { const t = copyBtn.textContent; copyBtn.textContent = '✅ 已複製'; setTimeout(() => { copyBtn.textContent = t; }, 1500); };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, () => window.prompt('請手動複製：', text));
                } else {
                    window.prompt('請手動複製：', text);
                }
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
