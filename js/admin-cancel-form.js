(function () {
    'use strict';

    const IMAGE_MAX = 2400;
    const PDF_MAX_BYTES = 10 * 1024 * 1024;
    const STATUS = {
        pending: ['pending', '未完成'],
        done: ['done', '已完成'],
        rejected: ['rejected', '退回']
    };
    const FILTERS = [['', '全部', 'all'], ['pending', '未完成', 'pending'], ['done', '已完成', 'done']];

    const $ = (id) => document.getElementById(id);
    const auth = () => window.skyfunAuth;
    const token = () => auth()?.getToken?.() || '';

    const state = {
        items: [],
        counts: {},
        filter: '',
        query: '',
        openId: null,
        files: {},
        busy: false,
        loaded: false
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmtTime(iso) {
        try { return new Date(iso).toLocaleString('zh-TW', { hour12: false }); } catch { return iso; }
    }
    function roc(ymd) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
        return m ? (Number(m[1]) - 1911) + '/' + m[2] + '/' + m[3] : (ymd || '—');
    }

    async function rpc(name, args) {
        if (!auth()?.rpc) throw new Error('尚未登入');
        const res = await auth().rpc(name, args);
        if (!res?.ok) throw new Error(res?.error || '連線失敗');
        return res;
    }

    async function fn(body) {
        const c = window.SKYFUN_SUPABASE || {};
        const url = String(c.url || '').trim().replace(/\/$/, '');
        const key = String(c.anonKey || c.anon_key || '').trim();
        const isForm = body instanceof FormData;
        const res = await fetch(url + '/functions/v1/object-cancel', {
            method: 'POST',
            headers: Object.assign({ Authorization: 'Bearer ' + key, apikey: key }, isForm ? {} : { 'Content-Type': 'application/json' }),
            body: isForm ? body : JSON.stringify(body)
        });
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        if (!data?.ok) throw new Error(data?.error || data?.message || ('連線失敗（' + res.status + '）'));
        return data;
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取「' + file.name + '」，請改用 JPG、PNG 或 PDF')); };
            img.src = url;
        });
    }

    async function prepare(file) {
        if (file.type === 'application/pdf') {
            if (file.size > PDF_MAX_BYTES) throw new Error('「' + file.name + '」超過 10MB');
            return { blob: file, name: file.name };
        }
        if (!/^image\//.test(file.type)) throw new Error('「' + file.name + '」不是圖片或 PDF');
        const img = await loadImage(file);
        const scale = Math.min(1, IMAGE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('「' + file.name + '」處理失敗');
        return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
    }

    /* ---------- 新增申請表單 ---------- */

    function setMsg(text, kind) {
        const el = $('acf-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'acf-msg' + (kind ? ' is-' + kind : '');
    }

    function prefill() {
        const user = auth()?.getUser ? auth().getUser() : null;
        if (!user) return;
        const applicant = $('acf-applicant');
        if (applicant && !applicant.value) applicant.value = user.name || user.username || '';
        const dept = $('acf-dept');
        if (dept && !dept.value && user.team && [...dept.options].some((o) => o.value === user.team)) {
            dept.value = user.team;
        }
    }

    function showForm(show) {
        const form = $('acf-form');
        if (!form) return;
        form.hidden = !show;
        $('acf-new').hidden = show;
        if (show) {
            setMsg('');
            prefill();
            form.querySelector('select, input')?.focus();
        }
    }

    function validate(form) {
        let first = null;
        form.querySelectorAll('[required]').forEach((el) => {
            if (el.type !== 'date') el.value = el.value.trim();
            const bad = !el.value;
            el.closest('.acf-field')?.classList.toggle('is-invalid', bad);
            if (bad && !first) first = el;
        });
        if (first) {
            setMsg('還有欄位沒填，請補齊紅框欄位', 'err');
            first.focus();
            return false;
        }
        const start = form.elements.leaseStart;
        const end = form.elements.leaseEnd;
        if (end.value < start.value) {
            end.closest('.acf-field')?.classList.add('is-invalid');
            setMsg('租約到期日不能早於租約開始日期', 'err');
            end.focus();
            return false;
        }
        return true;
    }

    async function submit(form) {
        if (state.busy) return;
        setMsg('');
        if (!token()) { setMsg('請先登入工具箱再送出', 'err'); return; }
        if (!validate(form)) return;
        if (!window.confirm('確定送出「星鴻註銷物件申請」？送出後大家都看得到，無法自行修改。')) return;

        const data = {};
        [...form.elements].forEach((el) => { if (el.name) data[el.name] = el.value; });

        state.busy = true;
        const btn = $('acf-submit');
        if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
        try {
            const res = await rpc('object_cancel_submit', { p_token: token(), p_data: data });
            form.reset();
            showForm(false);
            flash('✅ 已送出，已加到下方列表。正在通知主管…');
            notifySupervisors(res.id);
            state.filter = '';
            state.query = '';
            if ($('acf-q')) $('acf-q').value = '';
            state.openId = res.id || null;
            await loadList();
        } catch (e) {
            setMsg(e.message, 'err');
        } finally {
            state.busy = false;
            if (btn) { btn.disabled = false; btn.textContent = '送出申請'; }
        }
    }

    function flash(text, ms) {
        const el = $('acf-flash');
        if (!el) return;
        el.textContent = text;
        clearTimeout(flash.t);
        flash.t = setTimeout(() => { el.textContent = ''; }, ms || 5000);
    }

    async function notifySupervisors(id) {
        if (!id) return;
        try {
            const res = await fn({ action: 'notify', token: token(), requestId: id });
            if (res.sent) flash('✅ 已送出，並已用 LINE 通知 ' + res.sent + ' 位主管。');
            else flash('✅ 已送出（LINE 未通知：' + (res.error || '未知原因') + '）', 10000);
        } catch (e) {
            flash('✅ 已送出（LINE 未通知：' + e.message + '）', 10000);
        }
    }

    /* ---------- 主管綁定 LINE ---------- */

    const LINE_ADD_URL = 'https://line.me/R/ti/p/@522ubeym';
    const line = { code: null, expiresAt: null, error: '' };

    function lineBody() { return $('acf-line-body'); }

    function renderLine(info) {
        const box = lineBody();
        if (!box) return;
        if (!token()) { box.innerHTML = '<p>請先登入工具箱。</p>'; return; }
        if (!info) { box.innerHTML = '<p>讀取中…</p>'; return; }
        const err = line.error ? '<p class="acf-line-err">' + esc(line.error) + '</p>' : '';
        if (info.bound) {
            box.innerHTML =
                '<p>✅ 已綁定 LINE：<strong>' + esc(info.lineName || '—') + '</strong>（' + esc(fmtTime(info.boundAt)) + '）</p>' +
                '<p class="acf-line-note">' + (info.notifyObjectCancel
                    ? '🔔 目前<strong>會</strong>收到註銷申請通知。'
                    : '目前<strong>不會</strong>收到註銷通知，請管理員在後台把你勾選為通知對象。') + '</p>' +
                '<div class="acf-line-btns"><button type="button" class="acf-line-btn acf-line-btn--muted" data-line="unbind">解除綁定</button></div>' + err;
            return;
        }
        const codeHtml = line.code
            ? '<div>你的驗證碼：<span class="acf-line-code">' + esc(line.code) + '</span></div>' +
              '<p class="acf-line-note">10 分鐘內有效（到 ' + esc(fmtTime(line.expiresAt)) + '）。在 LINE 傳出後，按下方「我傳好了」。</p>'
            : '';
        box.innerHTML =
            '<p>綁定後，有人送出註銷申請時，LINE 會通知你（需管理員勾選為通知對象）。</p>' +
            '<ol>' +
            '<li>加官方帳號「星鴻萬能小幫手」好友：<a href="' + LINE_ADD_URL + '" target="_blank" rel="noopener">點我加好友 ↗</a></li>' +
            '<li>按下「取得驗證碼」</li>' +
            '<li>在小幫手的聊天室傳送那 6 位數驗證碼</li>' +
            '</ol>' + codeHtml +
            '<div class="acf-line-btns">' +
            '<button type="button" class="acf-line-btn" data-line="code">' + (line.code ? '重新取得驗證碼' : '取得驗證碼') + '</button>' +
            (line.code ? '<button type="button" class="acf-line-btn" data-line="refresh">我傳好了</button>' : '') +
            '</div>' + err;
    }

    async function loadLine() {
        line.error = '';
        renderLine(null);
        if (!token()) return renderLine(null);
        try {
            const info = await rpc('line_my_binding', { p_token: token() });
            if (info.bound) line.code = null;
            renderLine(info);
            return info;
        } catch (e) {
            line.error = e.message;
            renderLine({ bound: false });
        }
    }

    async function lineAction(kind, btn) {
        if (btn) btn.disabled = true;
        line.error = '';
        try {
            if (kind === 'code') {
                const res = await rpc('line_bind_code', { p_token: token() });
                line.code = res.code;
                line.expiresAt = res.expiresAt;
                renderLine({ bound: false });
            } else if (kind === 'refresh') {
                const info = await loadLine();
                if (info && !info.bound) {
                    line.error = '還沒收到綁定，請確認已加好友並傳送驗證碼後再試一次。';
                    renderLine(info);
                }
            } else if (kind === 'unbind') {
                if (!window.confirm('確定解除 LINE 綁定？解除後不會再收到註銷通知。')) { if (btn) btn.disabled = false; return; }
                await rpc('line_unbind', { p_token: token() });
                line.code = null;
                await loadLine();
            }
        } catch (e) {
            line.error = e.message;
            if (btn) btn.disabled = false;
            const p = document.createElement('p');
            p.className = 'acf-line-err';
            p.textContent = e.message;
            lineBody()?.appendChild(p);
        }
    }

    /* ---------- 列表 ---------- */

    function renderFilters() {
        const box = $('acf-filters');
        if (!box) return;
        box.innerHTML = FILTERS.map(([value, label, key]) =>
            '<button type="button" class="acf-chip' + (state.filter === value ? ' is-active' : '') + '" data-filter="' + value + '">' +
            label + ' ' + (state.counts[key] ?? 0) + '</button>').join('');
    }

    function filesHtml(item) {
        const files = state.files[item.id];
        if (!files) return '<p class="acf-empty">載入簽呈中…</p>';
        const list = files.length
            ? '<ul class="acf-files">' + files.map((f) =>
                '<li>' + (f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + (f.mime === 'application/pdf' ? '📕 ' : '🖼️ ') + esc(f.fileName) + '</a>' : esc(f.fileName)) +
                '<small>' + esc(f.userName || '—') + '・' + esc(fmtTime(f.createdAt)) + '</small>' +
                (f.canDelete ? '<button type="button" class="acf-file-del" data-del-file="' + f.id + '">刪除</button>' : '') +
                '</li>').join('') + '</ul>'
            : '<p class="acf-empty">還沒有上傳簽呈。</p>';
        return list +
            '<div class="acf-upload"><input type="file" accept="image/*,application/pdf" multiple data-upload="' + item.id + '" aria-label="選擇簽呈檔案">' +
            '<span class="acf-hint">可一次選多個圖片或 PDF（單檔 10MB 內）</span></div>';
    }

    function detailHtml(item) {
        const kv = (k, v, wide) => '<div' + (wide ? ' class="wide"' : '') + '><dt>' + k + '</dt><dd>' + esc(v || '—') + '</dd></div>';
        const done = item.status === 'done';
        return '<div class="acf-detail">' +
            '<dl class="acf-kv">' +
            kv('申請處所', item.dept) + kv('申請人', item.applicant) +
            kv('星鴻業務姓名', item.agentName) + kv('物件所在區域', item.region) +
            kv('物件型態', item.objectType) + kv('合約狀況', item.contractStatus) +
            kv('租約開始日期', roc(item.leaseStart)) + kv('租約到期日', roc(item.leaseEnd)) +
            kv('註銷物件地址', item.address, true) +
            kv('業務備註', item.note, true) +
            kv('承接業者', item.takerCompany) + kv('承接業者業務姓名', item.takerAgent) +
            (item.adminNote ? kv('管理部回覆', item.adminNote, true) : '') +
            '</dl>' +
            '<div class="acf-box"><p class="acf-box-title">📄 簽呈</p>' + filesHtml(item) + '</div>' +
            '<div class="acf-box">' +
            '<label class="acf-done"><input type="checkbox" data-done="' + item.id + '"' + (done ? ' checked' : '') + '> 已完成</label>' +
            (done ? '<p class="acf-done-by">由 ' + esc(item.doneByName || '—') + ' 於 ' + esc(fmtTime(item.handledAt)) + ' 勾選</p>' : '') +
            '</div>' +
            '<p class="acf-detail-msg" id="acf-detail-msg" role="status" aria-live="polite"></p>' +
            '</div>';
    }

    function renderList(message) {
        renderFilters();
        const box = $('acf-list');
        if (!box) return;
        if (message) { box.innerHTML = '<p class="acf-empty">' + esc(message) + '</p>'; return; }
        if (!state.items.length) {
            box.innerHTML = '<p class="acf-empty">' + (state.query || state.filter ? '沒有符合的申請。' : '目前沒有註銷申請。') + '</p>';
            return;
        }
        box.innerHTML = state.items.map((it) => {
            const [cls, label] = STATUS[it.status] || STATUS.pending;
            const open = state.openId === it.id;
            return '<div class="acf-item' + (it.status === 'done' ? ' is-done' : '') + (open ? ' is-open' : '') + '">' +
                '<button type="button" class="acf-row" data-open="' + it.id + '" aria-expanded="' + open + '">' +
                '<span class="acf-row-addr">' + esc(it.address) + '</span>' +
                '<span class="acf-row-side"><span class="acf-badge acf-badge--' + cls + '">' + label + '</span>' +
                '<span class="acf-row-files">📄 簽呈 ' + (it.fileCount || 0) + '</span></span>' +
                '<span class="acf-row-meta">' + esc(it.dept) + '・' + esc(it.applicant) + '・' + esc(it.objectType) + '・' + esc(fmtTime(it.createdAt)) + '</span>' +
                '</button>' +
                (open ? detailHtml(it) : '') +
                '</div>';
        }).join('');
    }

    function detailMsg(text, kind) {
        const el = $('acf-detail-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'acf-detail-msg' + (kind ? ' is-' + kind : '');
    }

    async function loadList() {
        if (!token()) { renderList('登入工具箱後可查看註銷申請列表。'); return; }
        try {
            const res = await rpc('object_cancel_list', { p_token: token(), p_query: state.query, p_status: state.filter, p_limit: 500 });
            state.items = res.items || [];
            state.counts = res.counts || {};
            state.loaded = true;
            if (state.openId && !state.items.some((it) => it.id === state.openId)) state.openId = null;
            renderList();
            if (state.openId) loadFiles(state.openId);
        } catch (e) {
            renderList(e.message);
        }
    }

    async function loadFiles(id) {
        try {
            const res = await fn({ action: 'files', token: token(), requestId: id });
            state.files[id] = res.files || [];
            const item = state.items.find((it) => it.id === id);
            if (item) item.fileCount = state.files[id].length;
        } catch (e) {
            state.files[id] = [];
            renderList();
            detailMsg(e.message, 'err');
            return;
        }
        if (state.openId === id) renderList();
    }

    async function upload(id, input) {
        const picked = [...(input.files || [])];
        if (!picked.length) return;
        input.disabled = true;
        let ok = 0;
        const errors = [];
        for (let i = 0; i < picked.length; i++) {
            detailMsg('上傳中… ' + (i + 1) + ' / ' + picked.length);
            try {
                const prepared = await prepare(picked[i]);
                const fd = new FormData();
                fd.append('action', 'upload');
                fd.append('token', token());
                fd.append('requestId', String(id));
                fd.append('fileName', prepared.name);
                fd.append('file', prepared.blob, prepared.name);
                await fn(fd);
                ok++;
            } catch (e) {
                errors.push(e.message);
            }
        }
        await loadFiles(id);
        if (errors.length) detailMsg((ok ? '已上傳 ' + ok + ' 個；' : '') + errors.join('；'), 'err');
        else detailMsg('✅ 已上傳 ' + ok + ' 個簽呈', 'ok');
    }

    async function deleteFile(fileId) {
        if (!window.confirm('確定刪除這個簽呈檔案？')) return;
        const id = state.openId;
        try {
            await fn({ action: 'delete_file', token: token(), id: fileId });
            await loadFiles(id);
            detailMsg('已刪除', 'ok');
        } catch (e) {
            detailMsg(e.message, 'err');
        }
    }

    async function setDone(id, checkbox) {
        const done = checkbox.checked;
        const label = done ? '確定勾選「已完成」？' : '確定取消「已完成」？';
        if (!window.confirm(label)) { checkbox.checked = !done; return; }
        checkbox.disabled = true;
        try {
            await rpc('object_cancel_set_done', { p_token: token(), p_id: id, p_done: done });
            await loadList();
        } catch (e) {
            checkbox.checked = !done;
            checkbox.disabled = false;
            detailMsg(e.message, 'err');
        }
    }

    function bind() {
        const zone = $('cancel-obj-zone');
        const form = $('acf-form');
        if (!zone || !form) return;

        const clear = (e) => e.target.closest('.acf-field')?.classList.remove('is-invalid');
        form.addEventListener('input', clear);
        form.addEventListener('change', clear);
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
        $('acf-new')?.addEventListener('click', () => showForm(true));
        $('acf-cancel')?.addEventListener('click', () => { form.reset(); showForm(false); });

        $('acf-filters')?.addEventListener('click', (e) => {
            const chip = e.target.closest('[data-filter]');
            if (!chip) return;
            state.filter = chip.dataset.filter;
            loadList();
        });
        let qTimer = null;
        $('acf-q')?.addEventListener('input', (e) => {
            clearTimeout(qTimer);
            qTimer = setTimeout(() => { state.query = e.target.value.trim(); loadList(); }, 350);
        });

        const list = $('acf-list');
        list?.addEventListener('click', (e) => {
            const row = e.target.closest('[data-open]');
            if (row) {
                const id = Number(row.dataset.open);
                state.openId = state.openId === id ? null : id;
                renderList();
                if (state.openId) loadFiles(state.openId);
                return;
            }
            const del = e.target.closest('[data-del-file]');
            if (del) deleteFile(Number(del.dataset.delFile));
        });
        list?.addEventListener('change', (e) => {
            const up = e.target.closest('[data-upload]');
            if (up) { upload(Number(up.dataset.upload), up); return; }
            const done = e.target.closest('[data-done]');
            if (done) setDone(Number(done.dataset.done), done);
        });

        $('acf-line-toggle')?.addEventListener('click', (e) => {
            const body = lineBody();
            if (!body) return;
            body.hidden = !body.hidden;
            e.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
            if (!body.hidden) loadLine();
        });
        lineBody()?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-line]');
            if (btn) lineAction(btn.dataset.line, btn);
        });

        zone.addEventListener('toggle', () => {
            if (zone.open) loadList();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
