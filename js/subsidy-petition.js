(function () {
    'use strict';

    const IMAGE_MAX = 2400;
    const PDF_MAX_BYTES = 10 * 1024 * 1024;

    let list = [];
    let busy = false;

    const $ = (id) => document.getElementById(id);
    const root = () => $('nb-pt-body');
    const auth = () => window.skyfunAuth;
    const token = () => (auth()?.getToken ? auth().getToken() : '');
    const settle = () => window.SubsidySettle;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtTime(iso) {
        try { return new Date(iso).toLocaleString('zh-TW', { hour12: false }); } catch { return iso; }
    }

    function settleLabel(d) {
        const s = settle()?.settleFor(d);
        if (!s) return '—';
        return settle().fmt(s.date) + (s.estimated ? '（預估）' : '');
    }

    async function call(body) {
        const c = window.SKYFUN_SUPABASE || {};
        const url = String(c.url || '').trim().replace(/\/$/, '');
        const key = String(c.anonKey || c.anon_key || '').trim();
        const isForm = body instanceof FormData;
        const res = await fetch(url + '/functions/v1/subsidy-checkin', {
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

    function deadlineHtml() {
        const S = settle();
        if (!S) return '';
        const now = new Date();
        const s = S.settleFor(now);
        if (!s) return '';
        const last = S.addDays(s.date, -1);
        return '<div class="nb-pt-deadline">⚠️ <strong>請於結績日前上傳簽呈</strong>' +
            '<span>本期結績日：' + S.fmt(s.date) + (s.estimated ? '（預估）' : '') +
            '，最晚請於 <strong>' + S.fmt(last) + '</strong> 前上傳。</span></div>';
    }

    function listHtml() {
        if (!list.length) return '<p class="nb-exam-muted">還沒有上傳過簽呈。</p>';
        return '<div class="nb-rule-table-wrap"><table class="nb-rule-table nb-pt-table"><thead><tr>' +
            '<th>上傳時間</th><th>檔案</th><th>說明</th><th>所屬結績日</th><th></th></tr></thead><tbody>' +
            list.map((p) => '<tr>' +
                '<td>' + esc(fmtTime(p.createdAt)) + '</td>' +
                '<td>' + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + (p.mime === 'application/pdf' ? '📕 ' : '🖼️ ') + esc(p.fileName) + '</a>' : esc(p.fileName)) + '</td>' +
                '<td>' + esc(p.note || '—') + '</td>' +
                '<td>' + esc(settleLabel(new Date(p.createdAt))) + '</td>' +
                '<td><button type="button" class="nb-ck-btn is-danger" data-del="' + p.id + '">刪除</button></td>' +
                '</tr>').join('') +
            '</tbody></table></div>';
    }

    function render(message, isError) {
        const el = root();
        if (!el) return;
        if (!token()) {
            el.innerHTML = '<p class="nb-exam-muted">請先登入工具箱，才能上傳簽呈。</p>';
            return;
        }
        el.innerHTML =
            '<p class="nb-pt-intro">個案可透過簽呈<strong>接續財補方案</strong>。請將簽呈拍照或掃描後上傳，可一次選多個檔案（圖片或 PDF）。</p>' +
            deadlineHtml() +
            '<label class="nb-calc-label" for="nb-pt-file">簽呈檔案</label>' +
            '<input type="file" id="nb-pt-file" class="nb-ck-file" accept="image/*,application/pdf" multiple>' +
            '<label class="nb-calc-label nb-pt-gap" for="nb-pt-note">說明（選填）</label>' +
            '<input type="text" id="nb-pt-note" class="nb-calc-input nb-pt-note" maxlength="300" placeholder="例如：簡述接續財補的原因">' +
            (message ? '<p class="nb-ck-msg' + (isError ? ' is-error' : '') + '">' + esc(message) + '</p>' : '') +
            '<div class="nb-ck-actions"><button type="button" class="nb-exam-start" id="nb-pt-upload"' + (busy ? ' disabled' : '') + '>上傳簽呈</button></div>' +
            '<div class="nb-exam-history"><h4>我上傳的簽呈</h4>' + listHtml() + '</div>' +
            '<p class="nb-exam-admin-link"><a href="./admin/subsidy-checkin-dashboard.html" target="_blank" rel="noopener">管理員：打卡紀錄後台</a></p>';
    }

    async function load() {
        if (!token()) { render(); return; }
        try {
            const res = await call({ action: 'petition_mine', token: token() });
            list = res.petitions || [];
            render();
        } catch (e) {
            render(e.message, true);
        }
    }

    async function upload() {
        if (busy) return;
        const files = [...($('nb-pt-file')?.files || [])];
        const note = ($('nb-pt-note')?.value || '').trim();
        if (!files.length) { render('請先選擇簽呈檔案。', true); return; }
        busy = true;
        const btn = $('nb-pt-upload');
        if (btn) { btn.disabled = true; btn.textContent = '上傳中…'; }
        let done = 0;
        try {
            for (const f of files) {
                const { blob, name } = await prepare(f);
                const form = new FormData();
                form.append('action', 'petition_save');
                form.append('token', token());
                form.append('note', note);
                form.append('fileName', name);
                form.append('file', blob, name);
                const res = await call(form);
                list.unshift(res.petition);
                done++;
            }
            busy = false;
            render('已上傳 ' + done + ' 個檔案。');
        } catch (e) {
            busy = false;
            render((done ? '已上傳 ' + done + ' 個，其餘失敗：' : '') + e.message, true);
        }
    }

    async function remove(id) {
        const p = list.find((x) => x.id === id);
        if (!p || !confirm('確定刪除簽呈「' + p.fileName + '」？')) return;
        try {
            await call({ action: 'petition_delete', token: token(), id });
            list = list.filter((x) => x.id !== id);
            render('已刪除。');
        } catch (e) {
            render(e.message, true);
        }
    }

    function whenLoggedIn(cb) {
        let tries = 0;
        const check = () => {
            if (token()) return cb();
            if (++tries < 120) setTimeout(check, 500);
        };
        check();
    }

    function init() {
        const el = root();
        if (!el) return;
        el.addEventListener('click', (ev) => {
            if (ev.target.closest('#nb-pt-upload')) { upload(); return; }
            const del = ev.target.closest('[data-del]');
            if (del) remove(Number(del.dataset.del));
        });
        render();
        whenLoggedIn(load);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
