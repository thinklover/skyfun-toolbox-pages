(function () {
    'use strict';

    const WEEK = ['一', '二', '三', '四', '五'];
    const QUICK_NOTES = ['證照上課中', '外出場勘', '請假'];
    const PHOTO_MAX = 1600;
    const THUMB_MAX = 480;

    let view = null;
    let entries = {};
    let editing = null;
    let loading = false;

    const $ = (id) => document.getElementById(id);
    const root = () => $('nb-ck-body');
    const auth = () => window.skyfunAuth;
    const token = () => (auth()?.getToken ? auth().getToken() : '');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
    function taipeiToday() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    function dow(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); }
    function rocMonth(y, m) { return (y - 1911) + '年' + pad(m) + '月'; }
    function dayLabel(s) {
        const [y, m, d] = s.split('-').map(Number);
        return (y - 1911) + '/' + pad(m) + '/' + pad(d) + '（星期' + '日一二三四五六'[dow(s)] + '）';
    }

    function monthWeeks(y, m) {
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const weeks = [];
        let row = null;
        for (let d = 1; d <= last; d++) {
            const s = ymd(y, m, d);
            const w = dow(s);
            if (w === 0 || w === 6) continue;
            if (!row || w === 1) { row = [null, null, null, null, null]; weeks.push(row); }
            row[w - 1] = s;
        }
        return weeks;
    }

    function api() {
        const c = window.SKYFUN_SUPABASE || {};
        const url = String(c.url || '').trim().replace(/\/$/, '');
        const key = String(c.anonKey || c.anon_key || '').trim();
        return { endpoint: url + '/functions/v1/subsidy-checkin', key };
    }

    async function call(body) {
        const { endpoint, key } = api();
        const isForm = body instanceof FormData;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: Object.assign({ Authorization: 'Bearer ' + key, apikey: key }, isForm ? {} : { 'Content-Type': 'application/json' }),
            body: isForm ? body : JSON.stringify(body)
        });
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok && !data) throw new Error('連線失敗（' + res.status + '）');
        if (!data?.ok) throw new Error(data?.error || data?.message || '操作失敗');
        return data;
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片，請改用 JPG 或 PNG')); };
            img.src = url;
        });
    }

    function toJpeg(img, max, quality) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    function currentMonth() {
        const t = taipeiToday();
        return { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) };
    }

    function shiftMonth(delta) {
        let y = view.y, m = view.m + delta;
        if (m < 1) { m = 12; y--; }
        if (m > 12) { m = 1; y++; }
        const cur = currentMonth();
        if (y * 12 + m > cur.y * 12 + cur.m) return;
        if (y < 2024) return;
        view = { y, m };
        editing = null;
        loadMonth();
    }

    async function loadMonth() {
        const el = root();
        if (!el) return;
        if (!token()) {
            el.innerHTML = '<p class="nb-exam-muted">請先登入工具箱，才能上傳打卡照片。</p>';
            return;
        }
        loading = true;
        render();
        const last = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
        try {
            const res = await call({ action: 'mine', token: token(), from: ymd(view.y, view.m, 1), to: ymd(view.y, view.m, last) });
            entries = {};
            (res.entries || []).forEach((e) => { entries[e.day] = e; });
            loading = false;
            render();
        } catch (e) {
            loading = false;
            render(e.message);
        }
    }

    function cellHtml(s, today) {
        if (!s) return '<td class="nb-ck-cell is-out"></td>';
        const e = entries[s];
        const future = s > today;
        const cls = ['nb-ck-cell'];
        if (s === today) cls.push('is-today');
        if (future) cls.push('is-future');
        if (e) cls.push('is-done');
        if (editing === s) cls.push('is-editing');
        let inner = '<span class="nb-ck-date">' + Number(s.slice(8)) + '</span>';
        if (e && e.thumbUrl) inner += '<img class="nb-ck-thumb" src="' + esc(e.thumbUrl) + '" alt="' + esc(s) + ' 打卡照片" loading="lazy">';
        if (e && e.note) inner += '<span class="nb-ck-note">' + esc(e.note) + '</span>';
        if (!e && !future) inner += '<span class="nb-ck-add">＋ 上傳</span>';
        const attrs = future ? ' aria-disabled="true"' : ' role="button" tabindex="0" data-day="' + s + '"';
        return '<td class="' + cls.join(' ') + '"' + attrs + ' title="' + esc(dayLabel(s)) + '">' + inner + '</td>';
    }

    function editorHtml(s) {
        const e = entries[s];
        return '<div class="nb-ck-editor" id="nb-ck-editor">' +
            '<p class="nb-ck-editor-title">📅 ' + esc(dayLabel(s)) + ' 打卡</p>' +
            (e && e.photoUrl
                ? '<div class="nb-ck-current"><a href="' + esc(e.photoUrl) + '" target="_blank" rel="noopener"><img src="' + esc(e.thumbUrl || e.photoUrl) + '" alt="目前照片"></a>' +
                  '<label class="nb-ck-remove"><input type="checkbox" id="nb-ck-remove"> 移除這張照片</label></div>'
                : '') +
            '<label class="nb-calc-label" for="nb-ck-file">' + (e && e.photoUrl ? '更換照片' : '上傳照片') + '</label>' +
            '<input type="file" id="nb-ck-file" accept="image/*" class="nb-ck-file">' +
            '<div id="nb-ck-preview" class="nb-ck-preview" hidden></div>' +
            '<label class="nb-calc-label" for="nb-ck-note">文字說明（選填）</label>' +
            '<input type="text" id="nb-ck-note" class="nb-calc-input" maxlength="200" placeholder="例如：證照上課中" value="' + esc(e ? e.note : '') + '">' +
            '<div class="nb-ck-chips">' + QUICK_NOTES.map((n) => '<button type="button" class="nb-ck-chip" data-note="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' +
            '<p id="nb-ck-msg" class="nb-ck-msg" hidden></p>' +
            '<div class="nb-ck-actions">' +
            '<button type="button" class="nb-exam-start" id="nb-ck-save">儲存</button>' +
            (e ? '<button type="button" class="nb-ck-btn is-danger" id="nb-ck-delete">刪除這天</button>' : '') +
            '<button type="button" class="nb-ck-btn" id="nb-ck-cancel">取消</button>' +
            '</div></div>';
    }

    function render(error) {
        const el = root();
        if (!el || !view) return;
        const today = taipeiToday();
        const weeks = monthWeeks(view.y, view.m);
        const cur = currentMonth();
        const atLatest = view.y * 12 + view.m >= cur.y * 12 + cur.m;
        const due = weeks.flat().filter((s) => s && s <= today);
        const done = due.filter((s) => entries[s]).length;
        const todayOpen = dow(today) >= 1 && dow(today) <= 5;

        el.innerHTML =
            '<ul class="nb-ck-rules">' +
            '<li>每個工作日上傳一張打卡照片；重新上傳會覆蓋當天的照片。</li>' +
            '<li>當天出門場勘無法進辦公室打卡，請上傳場勘照。</li>' +
            '<li>證照上課：第一天上傳報名收據，上課那幾天填文字「證照上課中」。</li>' +
            '<li>符合請假規範：上傳主管同意請假畫面（業績結算後不符合仍會退出計畫）。</li>' +
            '</ul>' +
            (todayOpen && !entries[today] && view.y === cur.y && view.m === cur.m
                ? '<button type="button" class="nb-exam-start nb-ck-today" data-day="' + today + '">📸 上傳今天（' + esc(dayLabel(today)) + '）</button>'
                : '') +
            '<div class="nb-ck-nav">' +
            '<button type="button" class="nb-ck-btn" data-shift="-1" aria-label="上個月">‹</button>' +
            '<strong>' + rocMonth(view.y, view.m) + '</strong>' +
            '<button type="button" class="nb-ck-btn" data-shift="1" aria-label="下個月"' + (atLatest ? ' disabled' : '') + '>›</button>' +
            '<span class="nb-ck-count">' + (loading ? '讀取中…' : '已上傳 ' + done + ' / ' + due.length + ' 個工作日') + '</span>' +
            '</div>' +
            (error ? '<p class="nb-exam-msg">' + esc(error) + '</p>' : '') +
            '<div class="nb-ck-table-wrap"><table class="nb-ck-table"><thead><tr>' +
            WEEK.map((w) => '<th>星期' + w + '</th>').join('') +
            '</tr></thead><tbody>' +
            weeks.map((row) => '<tr>' + row.map((s) => cellHtml(s, today)).join('') + '</tr>').join('') +
            '</tbody></table></div>' +
            (editing ? editorHtml(editing) : '') +
            '<p class="nb-exam-admin-link"><a href="./admin/subsidy-checkin-dashboard.html" target="_blank" rel="noopener">管理員：打卡紀錄後台</a></p>';
    }

    function openEditor(s, keepOpen) {
        editing = editing === s && !keepOpen ? null : s;
        render();
        if (editing) $('nb-ck-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showMsg(text, isError) {
        const m = $('nb-ck-msg');
        if (!m) return;
        m.textContent = text;
        m.hidden = !text;
        m.classList.toggle('is-error', !!isError);
    }

    async function save() {
        const s = editing;
        if (!s) return;
        const btn = $('nb-ck-save');
        const file = $('nb-ck-file')?.files?.[0] || null;
        const note = ($('nb-ck-note')?.value || '').trim();
        const remove = !!$('nb-ck-remove')?.checked;
        const e = entries[s];
        const willHavePhoto = !!file || (e?.hasPhoto && !remove);
        if (!willHavePhoto && !note) {
            showMsg('請選擇照片或填寫文字說明。', true);
            return;
        }
        btn.disabled = true;
        showMsg(file ? '壓縮並上傳中…' : '儲存中…');
        try {
            const form = new FormData();
            form.append('action', 'save');
            form.append('token', token());
            form.append('day', s);
            form.append('note', note);
            if (remove && !file) form.append('removePhoto', '1');
            if (file) {
                const img = await loadImage(file);
                const photo = await toJpeg(img, PHOTO_MAX, 0.82);
                const thumb = await toJpeg(img, THUMB_MAX, 0.8);
                if (!photo || !thumb) throw new Error('圖片處理失敗，請換一張再試');
                form.append('photo', photo, s + '.jpg');
                form.append('thumb', thumb, s + '-t.jpg');
            }
            const res = await call(form);
            if (res.deleted) delete entries[s];
            else entries[s] = res.entry;
            editing = null;
            render();
        } catch (err) {
            btn.disabled = false;
            showMsg(err.message, true);
        }
    }

    async function removeDay() {
        const s = editing;
        if (!s || !confirm('確定刪除 ' + dayLabel(s) + ' 的打卡紀錄？')) return;
        try {
            await call({ action: 'delete', token: token(), day: s });
            delete entries[s];
            editing = null;
            render();
        } catch (err) {
            showMsg(err.message, true);
        }
    }

    async function preview(file) {
        const box = $('nb-ck-preview');
        if (!box) return;
        if (!file) { box.hidden = true; box.innerHTML = ''; return; }
        const url = URL.createObjectURL(file);
        box.innerHTML = '<img src="' + url + '" alt="預覽">';
        box.hidden = false;
    }

    function onClick(ev) {
        const t = ev.target;
        const shift = t.closest('[data-shift]');
        if (shift) { shiftMonth(Number(shift.dataset.shift)); return; }
        const day = t.closest('[data-day]');
        if (day) { openEditor(day.dataset.day, day.classList.contains('nb-ck-today')); return; }
        const chip = t.closest('.nb-ck-chip');
        if (chip) { const n = $('nb-ck-note'); if (n) n.value = chip.dataset.note; return; }
        if (t.closest('#nb-ck-save')) { save(); return; }
        if (t.closest('#nb-ck-delete')) { removeDay(); return; }
        if (t.closest('#nb-ck-cancel')) { editing = null; render(); }
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
        view = currentMonth();
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', (ev) => {
            if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-day]')) {
                ev.preventDefault();
                openEditor(ev.target.dataset.day);
            }
        });
        el.addEventListener('change', (ev) => {
            if (ev.target.id === 'nb-ck-file') preview(ev.target.files?.[0] || null);
        });
        el.innerHTML = '<p class="nb-exam-muted">請先登入工具箱，才能上傳打卡照片。</p>';
        whenLoggedIn(loadMonth);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
