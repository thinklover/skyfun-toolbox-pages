/**
 * 行政專區 › 全台行政組織與人力配置（放在行政行事曆下面）
 * 資料存在 Supabase（admin_org_chart），後台「組織圖」可以改；讀不到時用下面的預設內容。
 * 營業處填「工讀生」的列算工讀生（另計）；狀態「待補」是待補職缺。
 */
(function () {
    const P = (status, name, dept, joined, office, deputy) => ({ status, name, dept, joined, office, deputy: deputy || '' });
    const DEFAULT = {
        title: '行政管理部｜全台行政組織與人力配置',
        lead: [
            { role: '行政管理部協理', name: '邱奕棋' },
            { role: '行政管理部經理', name: '黃怡婷' },
            { role: '行政管理部副理', name: '待補' }
        ],
        groups: [
            {
                name: '北區行政組', lead: '侯思廷',
                people: [
                    P('在職', '詹佳芸', '大台北', '115年08月', '租賃管理部', '劉婷昱'),
                    P('在職', '劉邦禹', '大台北', '115年03月', '租賃管理部', '侯思廷'),
                    P('在職', '韋宓妤', '大台北', '114年06月', '租賃管理部', '詹佳芸'),
                    P('在職', '鄭宇峻', '大台北', '115年04月', '北一處', '温巧萱'),
                    P('在職', '温巧萱', '大台北', '112年10月', '北一處', '鄭宇峻'),
                    P('待補', '', '大台北', '', '北一處'),
                    P('在職', '高慈惠', '大台北', '115年09月', '北二處', '韋宓妤'),
                    P('在職', '彭心緣', '大台北', '115年08月', '工讀生'),
                    P('在職', '梁凌佳', '大台北', '114年06月', '工讀生'),
                    P('在職', '賴加琳', '大台北', '114年07月', '工讀生'),
                    P('在職', '劉婷昱', '大台北', '115年08月', '北三處 北四處', '高慈惠'),
                    P('在職', '吳羽涵', '宜蘭', '115年07月', '宜一處', '侯思廷'),
                    P('在職', '蔡宜秀', '桃園', '111年12月', '桃一處', '簡旻鈺'),
                    P('在職', '簡旻鈺', '桃園', '115年08月', '桃一處', '蔡宜秀'),
                    P('在職', '邱郁庭', '桃園', '115年03月', '工讀生'),
                    P('在職', '張庭筠', '新竹', '115年02月', '竹一處', '賴曉嫻'),
                    P('在職', '賴曉嫻', '新竹', '115年08月', '竹一處', '張庭筠')
                ]
            },
            {
                name: '中區行政組', lead: '戴佳妤',
                people: [
                    P('在職', '魏汕洝', '台中', '115年01月', '租賃管理部', '林盈家'),
                    P('在職', '郭沛琳', '台中', '113年10月', '租賃管理部', '戴佳妤'),
                    P('在職', '王思涵', '台中', '115年09月', '租賃管理部', '何虹邑'),
                    P('在職', '林盈家', '台中', '115年03月', '中一處', '魏汕洝'),
                    P('在職', '戴佳妤', '台中', '113年10月', '中一處', '郭沛琳'),
                    P('在職', '林怡軒', '台中', '115年08月', '中二處', '呂佳融'),
                    P('在職', '呂佳融', '台中', '115年09月', '中三處', '林怡軒'),
                    P('在職', '何虹邑', '台中', '114年12月', '中五處', '王思涵'),
                    P('在職', '曾意庭', '台中', '115年10月', '中六處'),
                    P('在職', '方靖雯', '彰化', '115年06月', '彰一處', '戴佳妤')
                ]
            },
            {
                name: '南區行政組', lead: '李芷琳',
                people: [
                    P('在職', '温馨', '嘉義', '113年03月', '嘉一處', '李芷琳'),
                    P('在職', '劉芮蓁', '嘉義', '112年12月', '駐府人員'),
                    P('在職', '池禹杉', '嘉義', '115年04月', '工讀生'),
                    P('在職', '林宥淇', '台南', '114年02月', '租賃管理部', '楊舒喬'),
                    P('在職', '楊舒喬', '台南', '115年09月', '租賃管理部', '林宥淇'),
                    P('在職', '温思琳', '台南', '115年05月', '南一處', '林信良'),
                    P('待補', '待補', '台南', '', '南一處'),
                    P('在職', '陳怡伶', '高雄', '114年12月', '租賃管理部', '吳若寧'),
                    P('在職', '吳若寧', '高雄', '115年08月', '租賃管理部', '高佳苓'),
                    P('在職', '高佳苓', '高雄', '115年09月', '租賃管理部', '陳怡伶'),
                    P('在職', '吳俐儀', '高雄', '115年07月', '高一處', '彭琪婷'),
                    P('在職', '韋安俞', '高雄', '115年09月', '高一處', '吳俐儀'),
                    P('在職', '彭琪婷', '高雄', '115年07月', '高二處', '韋安俞')
                ]
            }
        ],
        note: '配置原則：大型營業處配置較多行政人力；小型營業處未達專責配置標準前，由處長統籌基礎行政，區域支援人力承接集中作業。黃色列為未來待補職缺。'
    };

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const isOpen = (p) => String(p.status || '').trim() === '待補';
    const isIntern = (p) => !isOpen(p) && String(p.office || '').trim() === '工讀生';
    const isVacantName = (name) => !String(name || '').trim() || /^(待補|從缺)$/.test(String(name).trim());

    function stats(g) {
        const people = g.people || [];
        const now = people.filter((p) => !isOpen(p) && !isIntern(p)).length;
        const open = people.filter(isOpen).length;
        return { now, open, plan: now + open, intern: people.filter(isIntern).length };
    }

    function row(p) {
        const open = isOpen(p);
        const intern = isIntern(p);
        return `<tr class="${open ? 'is-open' : intern ? 'is-intern' : ''}">
            <td class="ado2-st">${esc(p.status || '在職')}</td>
            <td class="ado2-name">${esc(p.name || (open ? '' : '—'))}</td>
            <td>${esc(p.dept)}</td>
            <td>${esc(p.joined)}</td>
            <td>${esc(p.office)}</td>
            <td>${esc(p.deputy)}</td>
        </tr>`;
    }

    function group(g) {
        const s = stats(g);
        return `<section class="ado2-group">
            <header class="ado2-group-head">${esc(g.name)}｜${esc(g.lead || '待補')}</header>
            <div class="ado2-stats">
                <span>現有人力 <b>${s.now}</b> 人</span><i>｜</i><span>待補 <b>${s.open}</b> 人</span><i>｜</i><span>規劃 <b>${s.plan}</b> 人</span>
                <small>工讀生 ${s.intern} 人（另計）</small>
            </div>
            <div class="ado2-table-wrap"><table class="ado2-table">
                <thead><tr><th>狀態</th><th>姓名／職稱</th><th>部別</th><th>報到年月</th><th>營業處</th><th>代理人</th></tr></thead>
                <tbody>${(g.people || []).map(row).join('') || '<tr><td colspan="6" class="ado2-empty">尚無人員</td></tr>'}</tbody>
            </table></div>
        </section>`;
    }

    function html(data) {
        const d = data && Array.isArray(data.groups) ? data : DEFAULT;
        const leads = (d.lead || []).map((l, i) => {
            const vacant = isVacantName(l.name);
            return `<div class="ado2-lead ado2-lead--${i % 3}${vacant ? ' is-vacant' : ''}">${esc(l.role)}｜${esc(vacant ? '待補' : l.name)}</div>`;
        }).join('');
        return `<div class="ado2-title">${esc(d.title || DEFAULT.title)}</div>
            <div class="ado2-leads">${leads}</div>
            <div class="ado2-groups">${d.groups.map(group).join('')}</div>
            ${d.note ? `<p class="ado2-note">${esc(d.note)}</p>` : ''}`;
    }

    function render(data) {
        const root = document.getElementById('admin-org');
        if (!root) return;
        root.classList.add('ado2');
        root.innerHTML = html(data);
    }

    let loaded = false;
    async function load() {
        const auth = window.skyfunAuth;
        const token = auth?.getToken?.();
        if (loaded || !token || !auth.rpc) return;
        loaded = true;
        try {
            const res = await auth.rpc('admin_org_get', { p_token: token });
            if (res?.ok && res.data) render(res.data);
        } catch {
            loaded = false;
        }
    }

    window.AdminOrg = { DEFAULT, html, stats, isOpen, isIntern };

    const start = () => {
        render(null);
        load();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    document.addEventListener('skyfun-auth-ready', load);
})();
