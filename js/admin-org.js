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
                    P('在職', '詹佳芸', '新北', '115年08月', '租賃管理部', '劉婷昱'),
                    P('在職', '劉邦禹', '新北', '115年03月', '租賃管理部', '侯思廷'),
                    P('在職', '韋宓妤', '新北', '114年06月', '租賃管理部', '詹佳芸'),
                    P('在職', '鄭宇峻', '台北', '115年04月', '北一處', '温巧萱'),
                    P('在職', '温巧萱', '台北', '112年10月', '北一處', '鄭宇峻'),
                    P('待補', '', '台北', '', '北一處'),
                    P('在職', '高慈惠', '新北', '115年09月', '北二處', '韋宓妤'),
                    P('在職', '彭心緣', '新北', '115年08月', '工讀生'),
                    P('在職', '梁凌佳', '新北', '114年06月', '工讀生'),
                    P('在職', '賴加琳', '新北', '114年07月', '工讀生'),
                    P('在職', '劉婷昱', '新北', '115年08月', '北三處 北四處', '高慈惠'),
                    P('在職', '吳羽涵', '宜蘭', '115年07月', '宜一處', '侯思廷'),
                    P('在職', '蔡宜秀', '桃園', '111年12月', '桃一處', '簡旻鈺'),
                    P('在職', '簡旻鈺', '桃園', '115年08月', '桃一處', '蔡宜秀'),
                    P('在職', '邱郁庭', '桃園', '115年03月', '工讀生'),
                    P('在職', '張庭筠', '新竹', '115年02月', '竹一處', '賴曉嫻'),
                    P('在職', '賴曉嫻', '新竹', '115年08月', '竹一處', '張庭筠')
                ]
            },
            {
                name: '中區行政組', lead: '黃怡婷',
                people: [
                    P('在職', '魏汕洝', '台中', '115年01月', '租賃管理部', '林盈家'),
                    P('在職', '郭沛琳', '台中', '113年10月', '租賃管理部', '戴佳妤'),
                    P('在職', '王思涵', '台中', '115年09月', '租賃管理部', '何虹邑'),
                    P('在職', '林盈家', '台中', '115年03月', '中一處', '魏汕洝'),
                    P('在職', '戴佳妤', '台中', '113年10月', '中一處', '郭沛琳'),
                    P('在職', '林怡軒', '台中', '115年08月', '中二處', '呂佳融'),
                    P('在職', '呂佳融', '台中', '115年09月', '中三處', '林怡軒'),
                    P('在職', '何虹邑', '台中', '114年12月', '中五處', '王思涵'),
                    P('在職', '曾意庭', '台中', '115年10月', '中四處'),
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

    /** 排序：部別（由北到南）→ 營業處（租賃管理部、各處依編號、駐府、工讀生）→ 到職日（早到晚，待補最後） */
    const DEPT_ORDER = ['大台北', '台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林', '嘉義', '台南', '高雄', '屏東', '花蓮', '台東'];
    const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const deptRank = (d) => {
        const i = DEPT_ORDER.indexOf(String(d || '').trim());
        return i < 0 ? 99 : i;
    };
    const officeRank = (o) => {
        const s = String(o || '').trim();
        if (s === '租賃管理部') return 0;
        if (s === '駐府人員') return 800;
        if (s === '工讀生') return 900;
        const m = s.match(/^[^\s]{1,3}?([一二三四五六七八九十])處/);
        return m ? 100 + CN_NUM[m[1]] : s ? 500 : 950;
    };
    const joinedRank = (j) => {
        const m = String(j || '').match(/(\d+)\s*年\s*(\d+)(?:\s*月\s*(\d+))?/);
        return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3] || 0) : Infinity;
    };

    /** 到職日存民國年字串「115年10月01日」；舊資料只有「113年10月」 */
    const pad2 = (n) => String(n).padStart(2, '0');
    const joinedParts = (j) => {
        const m = String(j || '').match(/(\d+)\s*年\s*(\d+)\s*月?(?:\s*(\d+)\s*日?)?/);
        return m ? { y: Number(m[1]), m: Number(m[2]), d: m[3] ? Number(m[3]) : 0 } : null;
    };
    const joinedMonth = (j) => {
        const p = joinedParts(j);
        return p ? `${p.y}年${pad2(p.m)}月` : String(j || '');
    };
    const joinedFull = (j) => {
        const p = joinedParts(j);
        return p ? `${p.y}年${pad2(p.m)}月${p.d ? `${pad2(p.d)}日` : ''}` : String(j || '');
    };
    const joinedIso = (j) => {
        const p = joinedParts(j);
        return p && p.d ? `${p.y + 1911}-${pad2(p.m)}-${pad2(p.d)}` : '';
    };
    const isoToJoined = (iso) => {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${Number(m[1]) - 1911}年${m[2]}月${m[3]}日` : '';
    };
    function sortedPeople(people) {
        return (people || [])
            .map((p, i) => ({ p, i }))
            .sort((a, b) =>
                deptRank(a.p.dept) - deptRank(b.p.dept) ||
                String(a.p.dept || '').localeCompare(String(b.p.dept || ''), 'zh-Hant') ||
                officeRank(a.p.office) - officeRank(b.p.office) ||
                String(a.p.office || '').localeCompare(String(b.p.office || ''), 'zh-Hant') ||
                joinedRank(a.p.joined) - joinedRank(b.p.joined) ||
                a.i - b.i
            );
    }

    const view = { data: null, updatedAt: null, canEdit: false, edit: null, busy: false, msg: '' };

    function row(p, gi, i) {
        const open = isOpen(p);
        const intern = isIntern(p);
        const editing = view.edit && view.edit.g === gi && view.edit.i === i;
        return `<tr class="${open ? 'is-open' : intern ? 'is-intern' : ''}${view.canEdit ? ' is-editable' : ''}${editing ? ' is-editing' : ''}"${view.canEdit ? ` data-org-row data-g="${gi}" data-i="${i}" title="點一下修改"` : ''}>
            <td class="ado2-st">${esc(p.status || '在職')}</td>
            <td class="ado2-name">${esc(p.name || (open ? '' : '—'))}</td>
            <td>${esc(p.dept)}</td>
            <td${p.joined ? ` title="到職日 ${esc(joinedFull(p.joined))}"` : ''}>${esc(joinedMonth(p.joined))}</td>
            <td>${esc(p.office)}</td>
            <td>${esc(p.deputy)}</td>
        </tr>${editing ? editRow(p) : ''}`;
    }

    function joinedField(joined) {
        const iso = joinedIso(joined);
        const hint = joined && !iso ? `<small class="ado2-joined-hint">目前只記到月份（${esc(joinedFull(joined))}），請補上日期</small>` : '';
        return `<label><span>到職日</span><input type="date" data-f="joinedDate" value="${iso}" />${hint}</label>`;
    }

    function editRow(p) {
        const isNew = view.edit.i === -1;
        const status = view.edit.status || p.status || '在職';
        const field = (k, label, ph) => `<label><span>${label}</span><input type="text" data-f="${k}" value="${esc(p[k])}" maxlength="40"${ph ? ` placeholder="${ph}"` : ''} /></label>`;
        const options = (isNew ? ['待補', '在職'] : ['在職', '離職', '待補']).map((s) => `<option${s === status ? ' selected' : ''}>${s}</option>`).join('');
        return `<tr class="ado2-edit"><td colspan="6"><div class="ado2-form" data-org-form>
            <label><span>狀態</span><select data-f="status">${options}</select></label>
            ${status === '離職' ? `<label class="ado2-leave"><span>離職日 <em>*</em></span><input type="date" data-f="leaveDate" value="${esc(view.edit.leaveDate || '')}" /></label>` : ''}
            ${status === '在職' ? field('name', '姓名／職稱') : ''}
            ${field('dept', '部別', '例如 台中')}
            ${status === '在職' ? joinedField(p.joined) : ''}
            ${field('office', '營業處', '例如 中一處')}
            ${status === '在職' ? field('deputy', '代理人') : ''}
            ${status === '離職' ? '<p class="ado2-form-hint">儲存後會在後台記錄離職日，這一列轉成「待補」，保留部別與營業處。</p>' : ''}
            <div class="ado2-form-btns">
                <button type="button" class="ado2-btn ado2-btn--main" data-org-act="save"${view.busy ? ' disabled' : ''}>${view.busy ? '儲存中…' : '儲存'}</button>
                <button type="button" class="ado2-btn" data-org-act="cancel">取消</button>
                ${!isNew && isOpen(p) ? '<button type="button" class="ado2-btn ado2-btn--del" data-org-act="delete">刪除這個待補</button>' : ''}
                ${view.msg ? `<span class="ado2-form-msg">${esc(view.msg)}</span>` : ''}
            </div>
        </div></td></tr>`;
    }

    function group(g, gi) {
        const s = stats(g);
        const isNewHere = view.edit && view.edit.g === gi && view.edit.i === -1;
        const body = sortedPeople(g.people).map(({ p, i }) => row(p, gi, i)).join('');
        return `<section class="ado2-group">
            <header class="ado2-group-head">${esc(g.name)}｜${esc(g.lead || '待補')}</header>
            <div class="ado2-stats">
                <span>現有人力 <b>${s.now}</b> 人</span><i>｜</i><span>待補 <b>${s.open}</b> 人</span><i>｜</i><span>規劃 <b>${s.plan}</b> 人</span>
                <small>工讀生 ${s.intern} 人（另計）</small>
            </div>
            <div class="ado2-table-wrap"><table class="ado2-table">
                <thead><tr><th>狀態</th><th>姓名／職稱</th><th>部別</th><th>到職日</th><th>營業處</th><th>代理人</th></tr></thead>
                <tbody>${body || (isNewHere ? '' : '<tr><td colspan="6" class="ado2-empty">尚無人員</td></tr>')}${isNewHere ? editRow(view.edit.draft) : ''}</tbody>
            </table></div>
            ${view.canEdit && !isNewHere ? `<button type="button" class="ado2-add" data-org-act="add" data-g="${gi}">＋ 新增待補</button>` : ''}
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
            ${view.canEdit ? '<p class="ado2-edit-tip">✏️ 你可以修改組織圖：點人員那一列就能改；離職會記離職日並轉成待補。</p>' : ''}
            <div class="ado2-groups">${d.groups.map(group).join('')}</div>
            ${d.note ? `<p class="ado2-note">${esc(d.note)}</p>` : ''}`;
    }

    function render(data) {
        const root = document.getElementById('admin-org');
        if (!root) return;
        if (data !== undefined) view.data = data;
        root.classList.add('ado2');
        root.innerHTML = html(view.data);
        if (!root.dataset.bound) {
            root.dataset.bound = '1';
            root.addEventListener('click', onClick);
            root.addEventListener('change', onChange);
        }
    }

    /** 把表單目前的值收進 view.edit，重畫時不會遺失 */
    function collect() {
        const form = document.querySelector('#admin-org [data-org-form]');
        if (!form || !view.edit) return;
        form.querySelectorAll('[data-f]').forEach((el) => {
            const k = el.dataset.f;
            if (k === 'status') view.edit.status = el.value;
            else if (k === 'leaveDate') view.edit.leaveDate = el.value;
            else if (k === 'joinedDate') {
                if (el.value) view.edit.draft.joined = isoToJoined(el.value);
            }
            else view.edit.draft[k] = el.value.trim();
        });
    }

    function onChange(e) {
        if (e.target.matches('[data-org-form] [data-f="status"]')) {
            collect();
            render();
        }
    }

    function onClick(e) {
        const act = e.target.closest('[data-org-act]');
        if (act) {
            const a = act.dataset.orgAct;
            if (!view.data) return;
            if (a === 'add') {
                view.edit = { g: +act.dataset.g, i: -1, status: '待補', draft: { status: '待補', name: '', dept: '', joined: '', office: '', deputy: '' } };
                view.msg = '';
                render();
            } else if (a === 'cancel') {
                view.edit = null;
                render();
            } else if (a === 'save') save();
            else if (a === 'delete') remove();
            return;
        }
        if (e.target.closest('[data-org-form]')) return;
        const tr = e.target.closest('[data-org-row]');
        if (!tr || !view.canEdit || !view.data) return;
        const g = +tr.dataset.g;
        const i = +tr.dataset.i;
        if (view.edit && view.edit.g === g && view.edit.i === i) view.edit = null;
        else {
            const p = view.data.groups[g].people[i];
            view.edit = { g, i, status: p.status || '在職', draft: { ...p } };
        }
        view.msg = '';
        render();
    }

    function fail(msg) {
        view.msg = msg;
        render();
    }

    async function commit(next, leave) {
        const auth = window.skyfunAuth;
        view.busy = true;
        view.msg = '';
        render();
        try {
            const res = await auth.rpc('admin_org_user_save', { p_token: auth.getToken(), p_data: next, p_updated_at: view.updatedAt, p_leave: leave || null });
            view.busy = false;
            if (!res?.ok) return fail(res?.error || '儲存失敗');
            view.updatedAt = res.updatedAt;
            view.edit = null;
            render(next);
        } catch (err) {
            view.busy = false;
            fail(err?.message || '儲存失敗，請稍後再試');
        }
    }

    function save() {
        if (view.busy || !view.edit) return;
        collect();
        const { g, i, status, draft } = view.edit;
        const next = JSON.parse(JSON.stringify(view.data));
        const people = next.groups[g].people;
        const old = i >= 0 ? people[i] : null;
        let leave = null;
        let rowData;
        if (status === '離職') {
            if (!view.edit.leaveDate) return fail('請填離職日');
            leave = { name: old.name, group: next.groups[g].name, dept: draft.dept, office: draft.office, joined: old.joined, date: view.edit.leaveDate };
            rowData = { status: '待補', name: '', dept: draft.dept, joined: '', office: draft.office, deputy: '' };
        } else if (status === '待補') {
            if (!draft.office) return fail('請填營業處');
            rowData = { status: '待補', name: '', dept: draft.dept, joined: '', office: draft.office, deputy: '' };
        } else {
            if (!draft.name) return fail('請填姓名');
            rowData = { status: '在職', name: draft.name, dept: draft.dept, joined: draft.joined, office: draft.office, deputy: draft.deputy };
        }
        if (old && old.status !== '待補' && status === '待補') return fail('在職人員離開請選「離職」並填離職日');
        if (i >= 0) people[i] = rowData;
        else people.push(rowData);
        commit(next, leave);
    }

    function remove() {
        if (view.busy || !view.edit || view.edit.i < 0) return;
        const p = view.data.groups[view.edit.g].people[view.edit.i];
        if (!isOpen(p) || !confirm(`刪除「${p.office || ''}」這個待補職缺？`)) return;
        const next = JSON.parse(JSON.stringify(view.data));
        next.groups[view.edit.g].people.splice(view.edit.i, 1);
        commit(next, null);
    }

    let loaded = false;
    async function load() {
        const auth = window.skyfunAuth;
        const token = auth?.getToken?.();
        if (loaded || !token || !auth.rpc) return;
        loaded = true;
        try {
            const res = await auth.rpc('admin_org_get', { p_token: token });
            if (res?.ok && res.data) {
                view.updatedAt = res.updatedAt || null;
                view.canEdit = !!res.canEdit;
                render(res.data);
            }
        } catch {
            loaded = false;
        }
    }

    window.AdminOrg = { DEFAULT, html, stats, isOpen, isIntern, sortedPeople };
    const start = () => {
        render(null);
        load();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    document.addEventListener('skyfun-auth-ready', load);
})();
