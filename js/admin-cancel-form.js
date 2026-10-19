(function () {
    'use strict';

    const IMAGE_MAX = 2400;
    const PDF_MAX_BYTES = 10 * 1024 * 1024;
    const STATUS = {
        pending: ['pending', '未審核'],
        done: ['done', '同意解編'],
        rejected: ['rejected', '不同意解編']
    };
    const FILTERS = [['', '全部', 'all'], ['pending', '未審核', 'pending'], ['done', '同意解編', 'done'], ['rejected', '不同意解編', 'rejected']];

    const $ = (id) => document.getElementById(id);
    const auth = () => window.skyfunAuth;
    const token = () => auth()?.getToken?.() || '';

    const state = {
        items: [],
        counts: {},
        filter: '',
        query: '',
        openId: null,
        rejecting: null,
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
            applyLeaseInputBounds(form);
            updateNoteCount(form);
            form.querySelector('select, input')?.focus();
        }
    }

    /** 業務備註最少字數：空白、換行不算字 */
    const NOTE_MIN = 100;
    const LEASE_MIN = '2010-01-01';
    const LEASE_MAX_YEAR_AHEAD = 5;
    const LEASE_MAX_YEARS = 20;
    const CARE_RE = /關懷|挽留|慰留|協調|溝通|勸說|無法挽留|未挽留|沒挽留|沒有挽留|有挽留|未能挽留|無法協調/;
    const BULLET_RE = /^\s*1\s*[.．、)]\s*\S/m;
    const noteLength = (v) => Array.from(String(v || '').replace(/\s+/g, '')).length;
    const leaseMaxYmd = () => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + LEASE_MAX_YEAR_AHEAD);
        return d.toISOString().slice(0, 10);
    };

    function updateNoteCount(form) {
        const el = $('acf-note-count');
        const note = form?.elements?.note;
        if (!el || !note) return;
        const n = noteLength(note.value);
        const careOk = CARE_RE.test(note.value);
        let msg = n >= NOTE_MIN
            ? '已寫 ' + n + ' 字 ✓'
            : '已寫 ' + n + ' 字，還差 ' + (NOTE_MIN - n) + ' 字才能送出';
        if (n >= NOTE_MIN && !careOk) msg += '　⚠️ 尚未寫到關懷／挽留';
        el.textContent = msg;
        el.classList.toggle('is-ok', n >= NOTE_MIN && careOk);
    }

    function applyLeaseInputBounds(form) {
        const max = leaseMaxYmd();
        ['leaseStart', 'leaseEnd'].forEach((name) => {
            const el = form?.elements?.[name];
            if (!el) return;
            el.min = LEASE_MIN;
            el.max = max;
        });
    }

    function validateLease(startEl, endEl) {
        const start = startEl?.value || '';
        const end = endEl?.value || '';
        const max = leaseMaxYmd();
        if (!start || !end) return '請填寫租約起迄日期';
        if (start < LEASE_MIN || end < LEASE_MIN) {
            return '租約日期不合理（不可早於 2010/01/01）。請改填實際租約起迄日，勿使用系統空值／亂碼日期';
        }
        if (start > max || end > max) {
            return '租約日期不合理（不可晚於 ' + max.replace(/-/g, '/') + '）';
        }
        if (end < start) return '租約到期日不能早於租約開始日期';
        const a = new Date(start + 'T00:00:00');
        const b = new Date(end + 'T00:00:00');
        if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '日期格式不正確';
        const years = (b - a) / (365.25 * 24 * 3600 * 1000);
        if (years > LEASE_MAX_YEARS) {
            return '租期超過 ' + LEASE_MAX_YEARS + ' 年，請再確認起迄日是否填錯';
        }
        return '';
    }

    const aiNoteUrl = () => String(window.SKYFUN_PETITION_AI_URL || 'https://skyfun-petition-ai.onrender.com').replace(/\/$/, '') + '/api/cancel-note/polish';
    const ai = { original: null, busy: false };

    function aiMsg(text, kind) {
        const el = $('acf-ai-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'acf-ai-msg' + (kind ? ' is-' + kind : '');
    }

    function aiReset() {
        ai.original = null;
        const undo = $('acf-ai-undo');
        if (undo) undo.hidden = true;
        aiMsg('');
    }

    /** @returns {{ ok: boolean, todo?: string[], error?: string }} */
    async function aiBullets(form, opts) {
        const silent = !!(opts && opts.silent);
        const note = form.elements.note;
        const text = note.value.trim();
        if (ai.busy) return { ok: false, error: 'AI 正在整理中' };
        if (!token()) {
            if (!silent) aiMsg('請先登入工具箱', 'err');
            return { ok: false, error: '請先登入工具箱' };
        }
        if (noteLength(text) < 5) {
            if (!silent) aiMsg('先用口語寫幾句原因，再按 AI 整理', 'err');
            note.focus();
            return { ok: false, error: '備註太短' };
        }
        ai.busy = true;
        const btn = $('acf-ai');
        if (btn) { btn.disabled = true; btn.textContent = '✨ AI 整理中…'; }
        if (!silent) aiMsg('大約 5～20 秒；如果 AI 服務在休息，第一次要等 30～60 秒，請稍候…');
        try {
            const res = await fetch(aiNoteUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token(), text }),
                signal: AbortSignal.timeout(150000)
            });
            let data = null;
            try { data = await res.json(); } catch { /* non-JSON */ }
            if (!data?.ok) throw new Error(data?.error || ('AI 暫時無法使用（' + res.status + '）'));
            if (ai.original == null) ai.original = note.value;
            note.value = data.text;
            note.dispatchEvent(new Event('input', { bubbles: true }));
            const undo = $('acf-ai-undo');
            if (undo) undo.hidden = false;
            if (data.todo?.length) {
                aiMsg('⚠️ 還沒寫到：' + data.todo.join('、') + '，請補充後再送出', 'warn');
                return { ok: true, todo: data.todo };
            }
            aiMsg('✅ 已整理並潤飾成 1. 2. 3. 條列，請確認內容正確再送出', 'ok');
            return { ok: true, todo: [] };
        } catch (e) {
            const msg = e.name === 'TimeoutError' ? 'AI 整理逾時，請再按一次' : e.message === 'Failed to fetch' ? '連不上 AI 服務，請稍後再試' : e.message;
            aiMsg(msg, 'err');
            return { ok: false, error: msg };
        } finally {
            ai.busy = false;
            if (btn) { btn.disabled = false; btn.textContent = '✨ AI 條列＋潤飾'; }
        }
    }

    function aiUndo(form) {
        if (ai.original == null) return;
        form.elements.note.value = ai.original;
        form.elements.note.dispatchEvent(new Event('input', { bubbles: true }));
        aiReset();
        aiMsg('已復原成原本的內容');
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
        const leaseErr = validateLease(start, end);
        if (leaseErr) {
            const badEl = (start.value < LEASE_MIN || start.value > leaseMaxYmd()) ? start : end;
            badEl.closest('.acf-field')?.classList.add('is-invalid');
            setMsg(leaseErr, 'err');
            badEl.focus();
            return false;
        }
        const note = form.elements.note;
        const noteLen = noteLength(note.value);
        if (noteLen < NOTE_MIN) {
            note.closest('.acf-field')?.classList.add('is-invalid');
            setMsg('業務備註至少要 ' + NOTE_MIN + ' 字（目前 ' + noteLen + ' 字），請把前因後果、是否有關懷／挽留寫清楚', 'err');
            note.focus();
            return false;
        }
        if (!CARE_RE.test(note.value)) {
            note.closest('.acf-field')?.classList.add('is-invalid');
            setMsg('業務備註必須寫到「有無關懷或挽留」（例如：有挽留／無法挽留／已協調）。請補充後再送出', 'err');
            note.focus();
            return false;
        }
        return true;
    }

    async function submit(form) {
        if (state.busy) return;
        setMsg('');
        if (!token()) { setMsg('請先登入工具箱再送出', 'err'); return; }
        if (!validate(form)) return;

        const note = form.elements.note;
        if (!BULLET_RE.test(note.value)) {
            setMsg('送出前先請 AI 整理成 1. 2. 3. 條列…', '');
            const polished = await aiBullets(form, { silent: true });
            if (!polished.ok) {
                setMsg((polished.error || 'AI 整理失敗') + '。也可先按「AI 條列＋潤飾」後再送出', 'err');
                return;
            }
            if (!validate(form)) return;
            if (polished.todo?.length) {
                setMsg('AI 整理後仍缺：' + polished.todo.join('、') + '。請補充後再送出', 'err');
                note.focus();
                return;
            }
        }

        if (!window.confirm('確定送出「星鴻註銷物件申請」？送出後大家都看得到，無法自行修改。')) return;

        const data = {};
        [...form.elements].forEach((el) => { if (el.name) data[el.name] = el.value; });

        state.busy = true;
        const btn = $('acf-submit');
        if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
        try {
            const res = await rpc('object_cancel_submit', { p_token: token(), p_data: data });
            form.reset();
            aiReset();
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
            '<p>綁定後，你送出的註銷申請審核完（同意／不同意解編），LINE 會通知你結果；主管另可收到新申請通知（需管理員勾選為通知對象）。</p>' +
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
        const rejected = item.status === 'rejected';
        let handle;
        if (done || rejected) {
            const line = item.decisionLineAt
                ? '📨 已 LINE 通知送件人 ' + esc(item.userName || '') + '（' + esc(fmtTime(item.decisionLineAt)) + '）'
                : '⚠️ LINE 沒有通知到送件人' + (item.decisionLineError ? '：' + esc(item.decisionLineError) : '');
            handle = '<div class="acf-box ' + (done ? 'acf-box--approved' : 'acf-box--rejected') + '">' +
                '<p class="acf-box-title">' + (done ? '✅ 同意解編' : '❌ 不同意解編') + '</p>' +
                (item.adminNote ? '<p class="acf-reject-reason">' + (done ? '備註：' : '原因：') + esc(item.adminNote) + '</p>' : '') +
                '<p class="acf-done-by acf-done-by--flat">由 ' + esc(item.doneByName || '—') + ' 於 ' + esc(fmtTime(item.handledAt)) + ' 審核</p>' +
                '<p class="acf-done-by acf-done-by--flat' + (item.decisionLineAt ? '' : ' acf-line-miss') + '">' + line + '</p>' +
                '<div class="acf-reject-btns"><button type="button" class="acf-reject-btn acf-reject-btn--muted" data-decide="reset" data-id="' + item.id + '">撤銷決定</button></div>' +
                '</div>';
        } else {
            const kind = state.rejecting?.id === item.id ? state.rejecting.kind : '';
            const form = kind
                ? '<div class="acf-reject-form">' +
                    '<textarea id="acf-reject-reason" rows="3" maxlength="1000" placeholder="' +
                    (kind === 'reject' ? '請寫不同意的原因（必填），會一起 LINE 給送件人' : '備註（選填），會一起 LINE 給送件人') + '"></textarea>' +
                    '<div class="acf-reject-btns">' +
                    '<button type="button" class="acf-decide-btn acf-decide-btn--' + kind + '" data-decide="' + kind + '" data-id="' + item.id + '">確認' + (kind === 'reject' ? '不同意解編' : '同意解編') + '</button>' +
                    '<button type="button" class="acf-reject-btn acf-reject-btn--muted" data-decide-cancel>取消</button>' +
                    '</div></div>'
                : '';
            handle = '<div class="acf-box">' +
                '<p class="acf-box-title">🗳️ 審核（決定後會 LINE 通知送件人' + (item.userName ? ' ' + esc(item.userName) : '') + '）</p>' +
                (kind ? '' :
                    '<div class="acf-reject-btns">' +
                    '<button type="button" class="acf-decide-btn acf-decide-btn--approve" data-decide-open="approve" data-id="' + item.id + '">✅ 同意解編</button>' +
                    '<button type="button" class="acf-decide-btn acf-decide-btn--reject" data-decide-open="reject" data-id="' + item.id + '">❌ 不同意解編</button>' +
                    '</div>') +
                form +
                '</div>';
        }
        return '<div class="acf-detail">' +
            '<dl class="acf-kv">' +
            kv('申請處所', item.dept) + kv('申請人', item.applicant) +
            kv('星鴻業務姓名', item.agentName) + kv('物件所在區域', item.region) +
            kv('物件型態', item.objectType) + kv('合約狀況', item.contractStatus) +
            kv('租約開始日期', roc(item.leaseStart)) + kv('租約到期日', roc(item.leaseEnd)) +
            kv('註銷物件地址', item.address, true) +
            kv('業務備註', item.note, true) +
            kv('承接業者', item.takerCompany) + kv('承接業者業務姓名', item.takerAgent) +
            '</dl>' +
            '<div class="acf-box"><p class="acf-box-title">📄 簽呈</p>' + filesHtml(item) + '</div>' +
            handle +
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
            return '<div class="acf-item' + (it.status === 'done' ? ' is-done' : '') + (it.status === 'rejected' ? ' is-rejected' : '') + (open ? ' is-open' : '') + '">' +
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

    async function decide(id, kind, btn) {
        let note = '';
        if (kind === 'reset') {
            if (!window.confirm('確定撤銷這筆的審核決定？會回到「未審核」，原因／備註會清掉（不會另外通知送件人）。')) return;
        } else {
            const box = $('acf-reject-reason');
            note = (box?.value || '').trim();
            if (kind === 'reject' && !note) { detailMsg('請先寫不同意的原因', 'err'); box?.focus(); return; }
            if (!window.confirm('確定' + (kind === 'reject' ? '不同意解編' : '同意解編') + '？送出後會 LINE 通知送件人。')) return;
        }
        if (btn) btn.disabled = true;
        try {
            const res = await rpc('object_cancel_decide', { p_token: token(), p_id: id, p_decision: kind, p_note: note });
            state.rejecting = null;
            await loadList();
            if (kind === 'reset') flash('已撤銷審核決定，回到未審核');
            else if (res.lineRecipients) flash('✅ 已' + (kind === 'reject' ? '不同意解編' : '同意解編') + '，並已 LINE 通知送件人');
            else flash('已' + (kind === 'reject' ? '不同意解編' : '同意解編') + '（LINE 沒有通知到：' + (res.lineError || '未知原因') + '）', 10000);
        } catch (e) {
            if (btn) btn.disabled = false;
            detailMsg(e.message, 'err');
        }
    }

    function bind() {
        const zone = $('cancel-obj-zone');
        const form = $('acf-form');
        if (!zone || !form) return;

        const clear = (e) => e.target.closest('.acf-field')?.classList.remove('is-invalid');
        form.addEventListener('input', clear);
        form.addEventListener('input', (e) => { if (e.target.name === 'note') updateNoteCount(form); });
        form.addEventListener('change', clear);
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(form); });
        $('acf-new')?.addEventListener('click', () => showForm(true));
        $('acf-cancel')?.addEventListener('click', () => { form.reset(); aiReset(); showForm(false); });
        $('acf-ai')?.addEventListener('click', () => { aiBullets(form); });
        $('acf-ai-undo')?.addEventListener('click', () => aiUndo(form));
        applyLeaseInputBounds(form);

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
                state.rejecting = null;
                renderList();
                if (state.openId) loadFiles(state.openId);
                return;
            }
            const del = e.target.closest('[data-del-file]');
            if (del) { deleteFile(Number(del.dataset.delFile)); return; }
            const open = e.target.closest('[data-decide-open]');
            if (open) {
                state.rejecting = { id: Number(open.dataset.id), kind: open.dataset.decideOpen };
                renderList();
                $('acf-reject-reason')?.focus();
                return;
            }
            if (e.target.closest('[data-decide-cancel]')) { state.rejecting = null; renderList(); return; }
            const act = e.target.closest('[data-decide]');
            if (act) decide(Number(act.dataset.id), act.dataset.decide, act);
        });
        list?.addEventListener('change', (e) => {
            const up = e.target.closest('[data-upload]');
            if (up) upload(Number(up.dataset.upload), up);
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
