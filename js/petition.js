(function () {
    'use strict';

    const IMAGE_MAX = 2400;
    const FILE_MAX_BYTES = 10 * 1024 * 1024;
    const TOTAL_MAX_BYTES = 20 * 1024 * 1024;
    const MAX_FILES = 10;
    const LINE_ADD_URL = 'https://line.me/R/ti/p/@522ubeym';
    const PICK_KEY = 'skyfun-petition-approvers';
    const STAGE_ORDER = ['applicant', 'manager', 'director', 'office', 'gm'];
    const STAGE_NAME = { applicant: '承辦人', manager: '部門主管', director: '審核', office: '會辦單位', gm: '總經理決行' };
    const STATUS = {
        manager: ['wait', '待部門主管電子簽名'],
        director: ['wait', '待經理／協理電子簽名'],
        office: ['wait', '待總經理室會辦'],
        gm: ['wait', '待總經理決行'],
        done: ['done', '已完成'],
        rejected: ['rejected', '已退回']
    };
    const ACTION = { submit: '送出簽呈', approve: '簽核完成', reject: '退回', resubmit: '修改後重新送出', withdraw: '撤回' };
    const TABS = [
        ['todo', '待我簽核', '等你處理'],
        ['wait', '簽核中', '我送出的'],
        ['rejected', '被退回', '我送出的'],
        ['done', '已完成', '我送出的'],
        ['related', '與我相關', '我簽過的']
    ];
    const LIST_KEYS = TABS.map((t) => t[0]);
    const EMPTY = {
        todo: '目前沒有等你簽核的簽呈 👍',
        wait: '目前沒有簽核中的簽呈。',
        rejected: '沒有被退回的簽呈 👍',
        done: '還沒有已完成的簽呈。',
        related: '目前沒有其他與你相關的簽呈。'
    };

    const $ = (id) => document.getElementById(id);
    const auth = () => window.skyfunAuth;
    const token = () => auth()?.getToken?.() || '';

    const state = {
        tab: '',
        lists: { mine: [], todo: [], related: [] },
        loaded: false,
        openId: null,
        details: {},
        approvers: null,
        devApproverSettings: null,
        busy: false
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString('zh-TW', { hour12: false }); } catch { return iso; }
    }
    function sizeText(n) {
        if (!n) return '';
        return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
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
        const res = await fetch(url + '/functions/v1/petition', {
            method: 'POST',
            headers: Object.assign({ Authorization: 'Bearer ' + key, apikey: key }, isForm ? {} : { 'Content-Type': 'application/json' }),
            body: isForm ? body : JSON.stringify(body)
        });
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        if (!data?.ok) throw new Error(data?.error || data?.message || ('連線失敗（' + res.status + '）'));
        return data;
    }

    /* ---------- 檔案處理 ---------- */

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
            if (file.size > FILE_MAX_BYTES) throw new Error('「' + file.name + '」超過 10MB');
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

    async function prepareAll(list, emptyMsg) {
        const picked = [...(list || [])];
        if (!picked.length) throw new Error(emptyMsg || '請選擇要上傳的檔案');
        if (picked.length > MAX_FILES) throw new Error('一次最多上傳 ' + MAX_FILES + ' 個檔案');
        const out = [];
        for (const f of picked) out.push(await prepare(f));
        const total = out.reduce((s, f) => s + f.blob.size, 0);
        if (total > TOTAL_MAX_BYTES) throw new Error('檔案加起來超過 20MB，請減少檔案或把 PDF 壓縮後再上傳');
        return out;
    }

    function bindSignaturePad(canvas) {
        if (!canvas || canvas.dataset.bound) return;
        canvas.dataset.bound = '1';
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
        let drawing = false;
        const point = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
        };
        canvas.addEventListener('pointerdown', (e) => {
            drawing = true;
            canvas.setPointerCapture?.(e.pointerId);
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            canvas.dataset.ink = '1';
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!drawing) return;
            const p = point(e);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            canvas.dataset.ink = '1';
            e.preventDefault();
        });
        const stop = () => { drawing = false; };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('pointerleave', stop);
    }

    /** 把手簽照片／圖片檔置中塞進簽名板（等比縮放） */
    function loadSignatureImage(canvas, file) {
        return new Promise((resolve, reject) => {
            if (!canvas) return reject(new Error('找不到簽名欄'));
            if (!file) return reject(new Error('請選擇簽名照片'));
            const type = String(file.type || '').toLowerCase();
            const name = String(file.name || '').toLowerCase();
            const isImage = type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(name);
            if (!isImage) return reject(new Error('請上傳簽名照片（JPG／PNG／WEBP 等）。手簽後拍照上傳即可；PDF 請先存成圖片。'));
            if (file.size > 10 * 1024 * 1024) return reject(new Error('簽名照片請在 10MB 以內'));
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                try {
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
                    const w = img.naturalWidth * scale;
                    const h = img.naturalHeight * scale;
                    const x = (canvas.width - w) / 2;
                    const y = (canvas.height - h) / 2;
                    ctx.drawImage(img, x, y, w, h);
                    canvas.dataset.ink = '1';
                    resolve();
                } catch (err) {
                    reject(new Error('簽名照片無法放入簽名欄，請換一張再試'));
                } finally {
                    URL.revokeObjectURL(url);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('無法讀取這張簽名照片，請改用 JPG／PNG 再試'));
            };
            img.src = url;
        });
    }

    function bindSignatureUpload(input, root) {
        if (!input || input.dataset.boundUpload) return;
        input.dataset.boundUpload = '1';
        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) return;
            const kind = input.getAttribute('data-sign-upload');
            const scope = input.closest('.acf-field, .pt-sign-action, form, .acf-detail') || root || document;
            const canvas = scope.querySelector('canvas[data-signature="' + kind + '"]');
            try {
                await loadSignatureImage(canvas, file);
            } catch (err) {
                alert(err?.message || '上傳失敗');
            }
        });
    }

    function bindSignaturePads(root) {
        const scope = root || document;
        scope.querySelectorAll('canvas[data-signature]').forEach(bindSignaturePad);
        scope.querySelectorAll('input[data-sign-upload]').forEach((input) => bindSignatureUpload(input, scope));
    }

    function clearSignature(kind, root) {
        const scope = root || document;
        const canvas = scope.querySelector('canvas[data-signature="' + kind + '"]');
        if (!canvas) return;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        delete canvas.dataset.ink;
        const upload = scope.querySelector('input[data-sign-upload="' + kind + '"]');
        if (upload) upload.value = '';
    }

    async function signatureBlob(kind, root) {
        const canvas = (root || document).querySelector('canvas[data-signature="' + kind + '"]');
        if (!canvas?.dataset.ink) throw new Error('請先完成電子簽名');
        return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('電子簽名處理失敗')), 'image/png'));
    }

    function formWith(action, fields, files, signature) {
        const fd = new FormData();
        fd.append('action', action);
        fd.append('token', token());
        Object.entries(fields).forEach(([k, v]) => fd.append(k, v == null ? '' : String(v)));
        files.forEach((f) => fd.append('file', f.blob, f.name));
        if (signature) fd.append('signature', signature, 'signature.png');
        return fd;
    }

    function lineText(line, who) {
        if (!line) return '';
        if (line.sent && !line.error) return '已用 LINE 通知' + who + '。';
        if (line.sent) return '已用 LINE 通知（' + line.error + '）。';
        return 'LINE 沒有送出（' + (line.error || '未知原因') + '），請自行告知' + who + '。';
    }

    function flash(text, ms) {
        const el = $('pt-flash');
        if (!el) return;
        el.textContent = text;
        clearTimeout(flash.t);
        flash.t = setTimeout(() => { el.textContent = ''; }, ms || 12000);
    }

    /* ---------- LINE 綁定 ---------- */

    const line = { info: null, code: null, expiresAt: null, error: '' };

    function renderLine() {
        const box = $('pt-line');
        if (!box) return;
        if (!token()) { box.innerHTML = ''; return; }
        const info = line.info;
        if (!info) { box.innerHTML = '<p class="pt-line-note">讀取 LINE 綁定狀態中…</p>'; return; }
        const err = line.error ? '<p class="acf-line-err">' + esc(line.error) + '</p>' : '';
        if (info.bound) {
            box.className = 'pt-line is-bound';
            box.innerHTML = '<p>🔔 已綁定 LINE（<strong>' + esc(info.lineName || '—') + '</strong>）：簽呈輪到你、被退回或完成時，LINE 會通知你。' +
                ' <button type="button" class="pt-line-unbind" data-line="unbind">解除綁定</button></p>' + err;
            return;
        }
        box.className = 'pt-line is-unbound';
        const codeHtml = line.code
            ? '<div>你的驗證碼：<span class="acf-line-code">' + esc(line.code) + '</span></div>' +
              '<p class="acf-line-note">10 分鐘內有效（到 ' + esc(fmtTime(line.expiresAt)) + '）。在 LINE 傳出後，按「我傳好了」。</p>'
            : '';
        box.innerHTML =
            '<p class="pt-line-head">⚠️ 你還沒綁定 LINE：簽呈輪到你簽、被退回或完成時，會收不到通知。</p>' +
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
        if (!token()) { line.info = null; renderLine(); return null; }
        try {
            line.info = await rpc('line_my_binding', { p_token: token() });
            if (line.info.bound) line.code = null;
        } catch (e) {
            line.info = { bound: false };
            line.error = e.message;
        }
        renderLine();
        return line.info;
    }

    async function lineAction(kind, btn) {
        if (btn) btn.disabled = true;
        line.error = '';
        try {
            if (kind === 'code') {
                const res = await rpc('line_bind_code', { p_token: token() });
                line.code = res.code;
                line.expiresAt = res.expiresAt;
                renderLine();
            } else if (kind === 'refresh') {
                const info = await loadLine();
                if (info && !info.bound) {
                    line.error = '還沒收到綁定，請確認已加好友並傳送驗證碼後再試一次。';
                    renderLine();
                }
            } else if (kind === 'unbind') {
                if (!window.confirm('確定解除 LINE 綁定？解除後簽呈輪到你時不會再收到通知。')) { if (btn) btn.disabled = false; return; }
                await rpc('line_unbind', { p_token: token() });
                line.code = null;
                await loadLine();
            }
        } catch (e) {
            line.error = e.message;
            renderLine();
        }
    }

    /* ---------- 送出簽呈表單 ---------- */

    function setMsg(text, kind) {
        const el = $('pt-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'acf-msg' + (kind ? ' is-' + kind : '');
    }

    function savedPicks() {
        try { return JSON.parse(localStorage.getItem(PICK_KEY) || '{}') || {}; } catch { return {}; }
    }

    function pickBox(role) {
        return $('pt-form')?.querySelector('.pt-pick[data-role="' + role + '"]');
    }

    function pickValue(role) {
        return pickBox(role)?.querySelector('select')?.value || '';
    }

    function personOf(id) {
        return (state.approvers || []).find((a) => a.id === id) || null;
    }

    function fillPicker(role, value) {
        const box = pickBox(role);
        if (!box || !state.approvers) return;
        const sel = box.querySelector('select');
        const q = box.querySelector('input').value.trim().toLowerCase();
        const cur = value != null ? value : sel.value;
        const myTeam = auth()?.getUser?.()?.team || '';
        const eligible = state.approvers.filter((a) => a[role]);
        const list = eligible.filter((a) =>
            a.id === cur || !q || (a.name + ' ' + a.team).toLowerCase().includes(q));
        const teams = new Map();
        list.forEach((a) => {
            const t = a.team || '未分處';
            if (!teams.has(t)) teams.set(t, []);
            teams.get(t).push(a);
        });
        const ordered = [...teams].sort((a, b) => (b[0] === myTeam) - (a[0] === myTeam));
        const empty = eligible.length ? '找不到符合的人' : '後台尚未設定名單';
        sel.innerHTML = '<option value="">' + (list.length ? '請選擇' : empty) + '</option>' +
            ordered.map(([t, arr]) => '<optgroup label="' + esc(t) + '">' + arr.map((a) =>
                '<option value="' + esc(a.id) + '">' + esc(a.name) + (a.lineBound ? '' : '（未綁 LINE）') + '</option>').join('') + '</optgroup>').join('');
        sel.value = list.some((a) => a.id === cur) ? cur : '';
        if (!sel.value && q) {
            const hits = list.filter((a) => a.id !== cur);
            if (hits.length === 1) sel.value = hits[0].id;
        }
        warnPicker(role);
    }

    function warnPicker(role) {
        const box = pickBox(role);
        if (!box) return;
        const a = personOf(box.querySelector('select').value);
        box.querySelector('.pt-pick-warn').textContent = a && !a.lineBound
            ? '⚠️ ' + a.name + ' 還沒綁定 LINE，輪到他時收不到通知，送出後請自行告知。'
            : '';
        if (a) box.classList.remove('is-invalid');
    }

    async function ensureApprovers() {
        if (state.approvers || !token()) return;
        const sel = $('pt-form')?.querySelectorAll('.pt-pick select') || [];
        sel.forEach((s) => { s.innerHTML = '<option value="">讀取名單中…</option>'; });
        try {
            const res = await fn({ action: 'approvers', token: token() });
            state.approvers = res.items || [];
            const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
            if (isLocal && state.approvers.length && !state.approvers.some((a) => 'manager' in a || 'director' in a || 'office' in a)) {
                let dev = {};
                try { dev = JSON.parse(localStorage.getItem('skyfun-petition-approver-settings-dev') || '{}') || {}; } catch { /* ignore */ }
                const managers = new Set(dev.managers || []);
                const directors = new Set(dev.directors || []);
                const offices = new Set(dev.offices || []);
                state.approvers.forEach((a) => {
                    a.manager = managers.has(a.id);
                    a.director = directors.has(a.id);
                    a.office = offices.has(a.id);
                });
                const me = auth()?.getUser?.();
                if (me?.id && managers.has(me.id) && !state.approvers.some((a) => a.id === me.id)) {
                    state.approvers.push({
                        id: me.id, username: me.username || '', name: me.name || me.username || '自己', team: me.team || '',
                        lineBound: !!line.info?.bound, manager: true, director: false, office: false
                    });
                }
            }
            const saved = savedPicks();
            fillPicker('manager', saved.managerId || '');
            fillPicker('director', saved.directorId || '');
            fillPicker('office', saved.officeId || '');
        } catch (e) {
            sel.forEach((s) => { s.innerHTML = '<option value="">名單讀取失敗</option>'; });
            setMsg(e.message, 'err');
        }
    }

    const DRAFT_FIELDS = ['aiText', 'category', 'otherCategory', 'title', 'summary', 'timeline', 'description', 'proposal',
        'closing', 'coOffice', 'afterApproval', 'attachments', 'showRespect', 'note'];

    function draftKey() {
        const me = auth()?.getUser?.();
        return 'skyfun-petition-draft:' + (me?.id || me?.username || 'guest');
    }

    function readFormContent(form) {
        const v = (name) => (form.elements[name]?.value || '').trim();
        const choice = v('category');
        return {
            category: choice === '其他' ? '其他：' + v('otherCategory') : choice,
            closing: v('closing') || '擬請核示',
            summary: v('summary'),
            timeline: v('timeline'),
            description: v('description'),
            proposal: v('proposal'),
            coOffice: v('coOffice'),
            afterApproval: v('afterApproval'),
            attachments: v('attachments'),
            showRespect: !!form.elements.showRespect?.checked
        };
    }

    function draftStatus(text) {
        const el = $('pt-draft-status');
        if (el) el.textContent = text;
    }

    function saveDraft(form) {
        const data = {};
        DRAFT_FIELDS.forEach((name) => {
            const el = form.elements[name];
            if (el) data[name] = el.type === 'checkbox' ? el.checked : el.value;
        });
        const hasText = DRAFT_FIELDS.some((n) => n !== 'closing' && n !== 'afterApproval' && n !== 'showRespect' && String(data[n] || '').trim());
        try {
            if (hasText) {
                localStorage.setItem(draftKey(), JSON.stringify({ data, savedAt: Date.now() }));
                draftStatus('💾 草稿已自動儲存（' + new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) + '）');
            } else {
                localStorage.removeItem(draftKey());
                draftStatus('');
            }
        } catch { /* ignore */ }
    }

    function restoreDraft(form) {
        if (form.dataset.draftLoaded === draftKey()) return;
        form.dataset.draftLoaded = draftKey();
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch { /* ignore */ }
        if (!saved?.data) { draftStatus(''); return; }
        DRAFT_FIELDS.forEach((name) => {
            const el = form.elements[name];
            if (!el || !(name in saved.data)) return;
            if (el.type === 'checkbox') el.checked = !!saved.data[name];
            else el.value = saved.data[name];
        });
        $('pt-other-title')?.classList.toggle('hidden', form.elements.category.value !== '其他');
        draftStatus('📝 已帶回上次未送出的草稿（' + fmtTime(new Date(saved.savedAt).toISOString()) + '）');
    }

    function clearDraft(form) {
        try { localStorage.removeItem(draftKey()); } catch { /* ignore */ }
        draftStatus('');
        if (form) form.dataset.draftLoaded = draftKey();
        ai.undo = null;
        $('pt-ai-undo')?.setAttribute('hidden', '');
        aiMsg('');
    }

    /* ---------- AI 一鍵整理 ---------- */

    const AI_FIELDS = ['category', 'otherCategory', 'title', 'summary', 'timeline', 'description', 'proposal', 'coOffice', 'attachments'];
    const ai = { busy: false, undo: null };
    const aiUrl = () => String(window.SKYFUN_PETITION_AI_URL || 'https://skyfun-petition-ai.onrender.com').replace(/\/$/, '');

    function aiMsg(text, kind) {
        const el = $('pt-ai-msg');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'pt-ai-msg' + (kind ? ' is-' + kind : '');
    }

    function aiSnapshot(form) {
        const snap = {};
        AI_FIELDS.forEach((name) => { snap[name] = form.elements[name]?.value || ''; });
        return snap;
    }

    function aiFill(form, values) {
        const changed = [];
        AI_FIELDS.forEach((name) => {
            const el = form.elements[name];
            if (!el) return;
            const v = String(values[name] || '');
            if (name === 'otherCategory') return;
            if (!v && (name === 'category' || el.value.trim())) return;
            if (el.value === v) return;
            el.value = v;
            changed.push(el.closest('.acf-field'));
        });
        const isOther = form.elements.category.value === '其他';
        if (isOther && values.otherCategory) form.elements.otherCategory.value = values.otherCategory;
        if (!isOther) form.elements.otherCategory.value = '';
        $('pt-other-title')?.classList.toggle('hidden', !isOther);
        changed.forEach((f) => { f?.classList.remove('is-invalid'); f?.classList.add('pt-ai-filled'); });
        setTimeout(() => changed.forEach((f) => f?.classList.remove('pt-ai-filled')), 4000);
        return changed.length;
    }

    async function aiOrganize(form) {
        if (ai.busy) return;
        if (!token()) { aiMsg('請先登入工具箱', 'err'); return; }
        const text = (form.elements.aiText?.value || '').trim();
        const fields = aiSnapshot(form);
        if (!text && !AI_FIELDS.some((n) => n !== 'category' && fields[n].trim())) {
            aiMsg('先在上面打下你想寫的內容，再按一鍵整理', 'err');
            form.elements.aiText?.focus();
            return;
        }
        const btn = $('pt-ai-run');
        ai.busy = true;
        if (btn) { btn.disabled = true; btn.textContent = '整理中…'; }
        aiMsg('AI 整理中，大約 10～30 秒，請稍候…');
        try {
            const res = await fetch(aiUrl() + '/api/petition/organize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: token(), text, fields }),
                signal: AbortSignal.timeout(150000)
            });
            let data = null;
            try { data = await res.json(); } catch { /* non-JSON */ }
            if (!data?.ok) throw new Error(data?.error || ('AI 服務暫時無法使用（' + res.status + '）'));
            ai.undo = fields;
            const n = aiFill(form, data.fields || {});
            saveDraft(form);
            $('pt-ai-undo')?.removeAttribute('hidden');
            const missing = (data.missing || []).length ? '\n建議補充：' + data.missing.join('、') : '';
            const left = Number.isFinite(data.remaining) ? '（今天還可以用 ' + data.remaining + ' 次）' : '';
            aiMsg('✅ 已整理 ' + n + ' 個欄位，請檢查內容再送出' + left + missing, 'ok');
            form.elements.title?.closest('.acf-field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            const msg = e?.name === 'TimeoutError' ? 'AI 整理逾時，請再按一次'
                : e instanceof TypeError ? '連不上 AI 服務（可能剛啟動，請 30 秒後再按一次）'
                : (e?.message || String(e));
            aiMsg(msg, 'err');
        } finally {
            ai.busy = false;
            if (btn) { btn.disabled = false; btn.textContent = '✨ 一鍵整理'; }
        }
    }

    function aiUndo(form) {
        if (!ai.undo) return;
        AI_FIELDS.forEach((name) => { if (form.elements[name]) form.elements[name].value = ai.undo[name]; });
        $('pt-other-title')?.classList.toggle('hidden', form.elements.category.value !== '其他');
        ai.undo = null;
        $('pt-ai-undo')?.setAttribute('hidden', '');
        saveDraft(form);
        aiMsg('已復原成整理前的內容');
    }

    /** 預覽套版用：把畫布上已簽的簽名編成 printDocHtml 可吃的資料 */
    function signaturePreviewEntries(form, me, extraSigns) {
        const signs = Array.isArray(extraSigns) ? extraSigns.slice() : [];
        const has = (role) => signs.some((s) => s.role === role);
        const canvas = form?.querySelector?.('canvas[data-signature="applicant"]')
            || (form || document).querySelector?.('canvas[data-signature="applicant"]');
        if (canvas?.dataset.ink && !has('applicant')) {
            signs.push({
                role: 'applicant',
                roleLabel: '承辦人',
                userName: me?.name || me?.username || '',
                url: canvas.toDataURL('image/png'),
                createdAt: new Date().toISOString()
            });
        }
        return signs;
    }

    function previewForm(form) {
        const me = auth()?.getUser?.();
        const d = {
            title: (form.elements.title.value || '').trim() || '（尚未填寫主旨）',
            team: me?.team || '',
            createdAt: new Date().toISOString(),
            content: readFormContent(form)
        };
        const signs = signaturePreviewEntries(form, me, []);
        openPrintWindow(printDocHtml(d, signs, true), (m) => setMsg(m, 'err'));
    }

    async function submitForm(form) {
        if (state.busy) return;
        setMsg('');
        if (!token()) { setMsg('請先登入工具箱再送出', 'err'); return; }
        if (!state.approvers) { setMsg('名單還在讀取，請稍候再按一次', 'err'); return; }
        const categoryEl = form.elements.category;
        const otherCategoryEl = form.elements.otherCategory;
        otherCategoryEl.value = otherCategoryEl.value.trim();
        const titleEl = form.elements.title;
        titleEl.value = titleEl.value.trim();
        const title = titleEl.value;
        const managerId = pickValue('manager');
        const directorId = pickValue('director');
        const officeId = pickValue('office');
        const fileEl = form.elements.file;
        const missing = [];
        categoryEl.closest('.acf-field').classList.toggle('is-invalid', !categoryEl.value);
        if (!categoryEl.value) missing.push('簽呈分類');
        if (categoryEl.value === '其他' && !otherCategoryEl.value) {
            categoryEl.closest('.acf-field').classList.add('is-invalid');
            missing.push('其他分類');
        }
        const requiredContent = [
            ['title', '完整主旨內容'],
            ['summary', '案件摘要'],
            ['timeline', '時間歷程與證據狀態'],
            ['description', '案件說明'],
            ['proposal', '擬辦事項']
        ];
        requiredContent.forEach(([name, label]) => {
            const el = form.elements[name];
            el.value = el.value.trim();
            el.closest('.acf-field').classList.toggle('is-invalid', !el.value);
            if (!el.value) missing.push(label);
        });
        pickBox('manager').classList.toggle('is-invalid', !managerId);
        if (!managerId) missing.push('部門主管');
        pickBox('director').classList.toggle('is-invalid', !directorId);
        if (!directorId) missing.push('審核人員');
        pickBox('office').classList.toggle('is-invalid', !officeId);
        if (!officeId) missing.push('總經理室會辦人員');
        if (missing.length) {
            setMsg('請補上：' + missing.join('、'), 'err');
            form.querySelector('.is-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const manager = personOf(managerId), director = personOf(directorId), office = personOf(officeId);
        const btn = $('pt-submit');
        state.busy = true;
        if (btn) { btn.disabled = true; btn.textContent = '處理檔案中…'; }
        try {
            const files = fileEl.files.length ? await prepareAll(fileEl.files) : [];
            const signature = await signatureBlob('applicant', form);
            if (!window.confirm('確定電子簽名並送出「' + title + '」？\n\n流程：\n1. 部門主管 ' + manager.name + '\n2. 審核（經理／協理）' + director.name + '\n3. 會辦（總經理室）' + office.name + '\n4. 總經理紙本決行')) return;
            if (btn) btn.textContent = '送出中…';
            const res = await fn(formWith('submit', {
                title,
                note: form.elements.note.value.trim(),
                content: JSON.stringify(readFormContent(form)),
                managerId,
                directorId,
                officeId
            }, files, signature));
            try { localStorage.setItem(PICK_KEY, JSON.stringify({ managerId, directorId, officeId })); } catch { /* ignore */ }
            form.reset();
            clearDraft(form);
            $('pt-other-title')?.classList.add('hidden');
            clearSignature('applicant', form);
            fillPicker('manager', managerId);
            fillPicker('director', directorId);
            fillPicker('office', officeId);
            const nextWho = res.petition?.stage === 'director' ? '審核人員 ' + director.name : '部門主管 ' + manager.name;
            flash('✅ 已電子簽名並送出。' + lineText(res.line, nextWho));
            state.tab = 'wait';
            state.openId = res.petition?.id || null;
            await loadList();
        } catch (e) {
            setMsg(e.message, 'err');
        } finally {
            state.busy = false;
            if (btn) { btn.disabled = false; btn.textContent = '電子簽名並送出'; }
        }
    }

    /* ---------- 列表 ---------- */

    function listOf(key) {
        const mine = state.lists.mine;
        if (key === 'wait') return mine.filter((p) => p.stage !== 'done' && p.stage !== 'rejected');
        if (key === 'rejected') return mine.filter((p) => p.stage === 'rejected');
        if (key === 'done') return mine.filter((p) => p.stage === 'done');
        return state.lists[key] || [];
    }

    function defaultTab() {
        return ['todo', 'rejected', 'wait'].find((k) => listOf(k).length) || (listOf('done').length ? 'done' : 'wait');
    }

    function renderTabs() {
        const box = $('pt-tabs');
        if (!box) return;
        box.hidden = state.tab === 'new';
        if (!token()) { box.innerHTML = ''; return; }
        box.innerHTML = TABS.map(([key, label, hint]) => {
            const n = state.loaded ? listOf(key).length : null;
            return '<button type="button" role="tab" class="pt-card pt-card--' + key + (state.tab === key ? ' is-active' : '') +
                (n ? ' has-n' : n === 0 ? ' is-zero' : '') + '" data-tab="' + key + '" aria-selected="' + (state.tab === key) + '">' +
                '<span class="pt-card-n">' + (n == null ? '…' : n) + '</span>' +
                '<span class="pt-card-label">' + label + '</span>' +
                '<span class="pt-card-hint">' + hint + '</span></button>';
        }).join('');
    }

    function renderPane() {
        renderTabs();
        const form = $('pt-form'), list = $('pt-list');
        if (!form || !list) return;
        const isNew = state.tab === 'new';
        form.hidden = !isNew;
        list.hidden = isNew;
        page()?.querySelectorAll('[data-new]').forEach((b) => { if (b.closest('.pt-head')) b.hidden = isNew; });
        if (isNew) { restoreDraft(form); ensureApprovers(); }
        else renderList();
    }

    function page() { return $('page-petition'); }

    const NEW_BTN = '<button type="button" class="pt-new-btn" data-new>✍️ 寫新簽呈</button>';

    function renderList(message) {
        const box = $('pt-list');
        if (!box) return;
        if (message) { box.innerHTML = '<p class="acf-empty">' + esc(message) + '</p>'; return; }
        if (!state.loaded) { box.innerHTML = '<p class="acf-empty">讀取中…</p>'; return; }
        const items = listOf(state.tab);
        const tab = TABS.find((t) => t[0] === state.tab);
        if (!items.length) {
            const none = !state.lists.mine.length && !state.lists.todo.length && !state.lists.related.length;
            box.innerHTML = '<div class="pt-empty">' + (none ? '你還沒有任何簽呈。' : EMPTY[state.tab] || '') +
                (state.tab === 'todo' || state.tab === 'related' ? '' : '<br>' + NEW_BTN) + '</div>';
            return;
        }
        const head = tab ? (tab[2] === '我送出的' ? '我送出的簽呈・' + tab[1] : tab[1]) : '';
        box.innerHTML = (tab ? '<p class="pt-list-head">' + head + '<small>' + items.length + ' 份・點一下看內容' +
            (state.tab === 'todo' ? '並簽核' : state.tab === 'rejected' ? '並修改重送' : '') + '</small></p>' : '') +
            items.map(itemHtml).join('');
        bindSignaturePads(box);
    }

    function stepsHtml(p) {
        const idx = { manager: 1, director: 2, office: 3, gm: 4, done: 5 }[p.stage];
        const rejectedAt = p.stage === 'rejected' ? STAGE_ORDER.indexOf(p.rejectedStage) : -1;
        const steps = [
            ['承辦人', p.userName],
            ['部門主管', p.managerName],
            ['審核', p.directorName],
            ['會辦', p.officeName],
            ['決行', '總經理']
        ];
        return '<ol class="pt-steps">' + steps.map(([label, name], i) => {
            let cls, mark = String(i + 1);
            if (p.stage === 'rejected') cls = i < rejectedAt ? 'is-done' : i === rejectedAt ? 'is-rejected' : '';
            else cls = i < idx ? 'is-done' : i === idx ? 'is-current' : '';
            if (cls === 'is-done') mark = '✓';
            else if (cls === 'is-rejected') mark = '✕';
            return '<li class="' + cls + '"><i>' + mark + '</i><b>' + label + '</b><span>' + esc(name || '—') + '</span></li>';
        }).join('') + '</ol>';
    }

    function fmtDay(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '/' + d.getDate();
    }

    function waited(iso) {
        const ms = Date.now() - new Date(iso).getTime();
        if (!Number.isFinite(ms) || ms < 0) return '';
        const h = Math.floor(ms / 3600000);
        if (h < 1) return '剛送到';
        if (h < 24) return '已等 ' + h + ' 小時';
        return '已等 ' + Math.floor(h / 24) + ' 天';
    }

    function holderText(p) {
        if (p.stage === 'manager') return '部門主管 ' + p.managerName;
        if (p.stage === 'director') return '審核 ' + p.directorName;
        if (p.stage === 'office') return '總經理室 ' + p.officeName;
        if (p.stage === 'gm') return '總經理（紙本決行中，由總經理室 ' + p.officeName + ' 上傳）';
        return '';
    }

    function nowHtml(p) {
        if (p.myTurn) {
            const what = p.stage === 'gm' ? '請上傳總經理決行後的簽呈' : p.stage === 'office' ? '輪到你會辦' : '輪到你電子簽名';
            return '<span class="pt-row-now pt-row-now--turn">👉 ' + what + ' <em>（' + esc(waited(p.updatedAt || p.createdAt)) + '）</em></span>';
        }
        if (p.stage === 'rejected') {
            const reason = String(p.rejectReason || '').replace(/\s+/g, ' ');
            return '<span class="pt-row-now pt-row-now--rejected">↩️ 被' + esc(rejectedByText(p)) + ' 退回' +
                (reason ? '：' + esc(reason.length > 60 ? reason.slice(0, 60) + '…' : reason) : '') + '</span>';
        }
        if (p.stage === 'done') return '<span class="pt-row-now pt-row-now--done">✅ 全部簽核完成' + (p.doneAt ? '（' + esc(fmtDay(p.doneAt)) + '）' : '') + '</span>';
        return '<span class="pt-row-now">⏳ 目前在 <b>' + esc(holderText(p)) + '</b> 手上 <em>（' + esc(waited(p.updatedAt || p.createdAt)) + '）</em></span>';
    }

    function itemHtml(p) {
        const [cls, label] = STATUS[p.stage] || ['wait', p.stageLabel];
        const open = state.openId === p.id;
        const showWho = !p.isMine || state.tab === 'todo' || state.tab === 'related';
        const more = open ? '▲ 收合' : p.myTurn ? '▼ 點開簽核' : p.isMine && p.stage === 'rejected' ? '▼ 點開修改重送' : '▼ 看內容';
        return '<div class="acf-item pt-item pt-item--' + (p.myTurn ? 'turn' : cls) + (p.stage === 'done' ? ' is-done' : '') + (open ? ' is-open' : '') + '">' +
            '<button type="button" class="pt-row" data-open="' + p.id + '" aria-expanded="' + open + '">' +
            '<span class="pt-row-top"><span class="acf-badge pt-badge--' + cls + '">' + label + '</span>' +
            (p.myTurn ? '<span class="pt-turn">輪到你</span>' : '') +
            (p.round > 1 ? '<span class="acf-badge pt-badge--wait">第 ' + p.round + ' 次送出</span>' : '') +
            '<span class="pt-row-date">' + esc(fmtDay(p.createdAt)) + ' 送出</span></span>' +
            '<span class="pt-row-title">' + esc(p.title) + '</span>' +
            nowHtml(p) +
            (showWho ? '<span class="pt-row-meta">承辦人：' + esc(p.userName) + (p.team ? '（' + esc(p.team) + '）' : '') + '</span>' : '') +
            '<span class="pt-row-more">' + more + '</span>' +
            '</button>' + stepsHtml(p) +
            (open ? detailHtml(p) : '') + '</div>';
    }

    function filesHtml(d) {
        const head = '<p class="acf-box-title">📄 簽呈檔案' + (d.files.length ? '（最新的在最上面）' : '') + '</p>';
        if (!d.files.length) return '<div class="acf-box">' + head + '<p class="acf-empty">承辦時未附附件；仍可依簽呈內容完成電子簽名。</p></div>';
        const groups = [];
        d.files.forEach((f) => {
            let g = groups.find((x) => x.round === f.round && x.stage === f.stage);
            if (!g) groups.push(g = { round: f.round, stage: f.stage, userName: f.userName, files: [] });
            g.files.push(f);
        });
        groups.sort((a, b) => b.round - a.round || STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage));
        const multiRound = groups.some((g) => g.round > 1);
        return '<div class="acf-box">' + head + groups.map((g, i) => {
            const who = g.stage === 'gm'
                ? '總經理決行後（總經理室 ' + g.userName + ' 上傳）'
                : (STAGE_NAME[g.stage] || g.stage) + ' ' + g.userName + (g.stage === 'applicant' ? ' 上傳' : ' 簽完上傳');
            const title = (multiRound ? '第 ' + g.round + ' 次送出・' : '') + who;
            return '<div class="pt-fgroup' + (i === 0 ? ' is-latest' : '') + '">' +
                '<p class="pt-fgroup-title">' + (i === 0 ? '<span class="pt-latest">最新版本</span>' : '') + esc(title) + '</p>' +
                (i === 0 && d.myTurn
                    ? '<p class="pt-fgroup-tip">👉 ' + (d.stage === 'gm' ? '請把這份送總經理決行，完成後在下方上傳。' : '請打開這份，完成處理後在下方上傳。') + '</p>'
                    : '') +
                '<ul class="acf-files">' + g.files.map((f) =>
                    '<li>' + (f.url
                        ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + (f.mime === 'application/pdf' ? '📕 ' : '🖼️ ') + esc(f.fileName) + '</a>'
                        : esc(f.fileName)) +
                    '<small>' + esc(fmtTime(f.createdAt)) + (f.size ? '・' + sizeText(f.size) : '') + '</small></li>').join('') +
                '</ul></div>';
        }).join('') + '</div>';
    }

    function uploadField(kind, label) {
        return '<label class="pt-upload"><span>' + label + '</span>' +
            '<input type="file" accept="image/*,application/pdf" multiple data-pick="' + kind + '"></label>' +
            '<span class="acf-hint">可選多個圖片或 PDF（單檔 10MB 內）；手機可直接拍照。</span>';
    }

    function signaturePadHtml(kind, label) {
        return '<div class="pt-sign-action"><p class="pt-label">' + label + '</p>' +
            '<div class="pt-sign-pad"><canvas width="700" height="220" data-signature="' + kind + '" aria-label="' + label + '"></canvas></div>' +
            '<div class="pt-sign-tools"><span class="acf-hint">可手寫，或上傳手簽照片／圖片（手機可拍照）。</span>' +
            '<span class="pt-sign-btns">' +
            '<label class="pt-sign-upload">上傳簽名照<input type="file" accept="image/*" data-sign-upload="' + kind + '" hidden></label>' +
            '<button type="button" class="pt-sign-clear" data-clear-sign="' + kind + '">清除重簽</button></span></div></div>';
    }

    function signaturesHtml(d) {
        const signs = (d.signatures || []).filter((s) => s.round === d.round);
        if (!signs.length) return '';
        return '<div class="acf-box"><p class="acf-box-title">✍️ 本次電子簽名</p><div class="pt-signatures">' +
            signs.map((s) => '<div class="pt-signature"><b>' + esc(s.roleLabel) + '</b>' +
                (s.url ? '<img src="' + esc(s.url) + '" alt="' + esc(s.roleLabel) + '電子簽名">' : '') +
                '<span>' + esc(s.userName) + '</span><small>' + esc(fmtTime(s.createdAt)) + '</small></div>').join('') +
            '</div>' + (signs.length >= 3 ? '<button type="button" class="pt-secondary mt-2" data-act="print">🖨️ 列印正式套版簽呈</button>' : '') + '</div>';
    }

    function rocDate(iso) {
        const d = iso ? new Date(iso) : new Date();
        if (Number.isNaN(d.getTime())) return '';
        return (d.getFullYear() - 1911) + '年' + String(d.getMonth() + 1).padStart(2, '0') + '月' + String(d.getDate()).padStart(2, '0') + '日';
    }

    function templateHtml(d) {
        const c = d.content || {};
        const section = (title, value) => value ? '<h4>' + title + '</h4><p>' + esc(value) + '</p>' : '';
        return '<div class="pt-template"><div class="pt-template-head"><span>簽　於　' + esc(d.team || '未填部門') + '</span><span>中華民國' + esc(rocDate(d.createdAt)) + '</span></div>' +
            '<h4>主旨</h4><p>' + esc(d.title) + '，' + esc(c.closing || '擬請核示') + '。</p>' +
            section('一、案件摘要', c.summary) +
            section('二、時間歷程與證據狀態', c.timeline) +
            section('三、案件說明', c.description) +
            section('四、擬辦', c.proposal) +
            (c.coOffice ? '<h4>會辦單位</h4><p>' + esc(c.coOffice) + '</p>' : '') +
            '<h4>擬辦</h4><p>' + esc(c.afterApproval || '奉 核後，影印陳送各會辦單位存照。') + '</p>' +
            (c.showRespect ? '<p><b>敬陳</b></p>' : '') +
            (c.attachments ? '<h4>附件</h4><p>' + esc(c.attachments) + '</p>' : '') +
            '</div>';
    }

    function rejectedByText(d) {
        return d.rejectedStage === 'gm'
            ? '總經理決行（由總經理室 ' + d.rejectedByName + ' 登錄）'
            : (STAGE_NAME[d.rejectedStage] || '') + ' ' + d.rejectedByName;
    }

    const REJECT_BOX = '<details class="pt-reject"><summary>要退回這份簽呈？</summary>' +
        '<textarea class="pt-note" data-note="reject" rows="2" maxlength="1000" placeholder="退回原因（必填，會用 LINE 通知承辦人）"></textarea>' +
        '<button type="button" class="pt-reject-btn" data-act="reject">退回給承辦人</button></details>';

    function resubmitEditorHtml(d) {
        const c = d.content || {};
        const isOther = String(c.category || '').startsWith('其他：');
        const selected = isOther ? '其他' : (c.category || '');
        const options = ['', '人事相關', '獎金辦法', '賠償案件', '薪資出勤', '其他'].map((v) =>
            '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v || '請選擇') + '</option>').join('');
        const field = (label, name, value, required) => '<label class="acf-field"><span>' + label + (required ? ' <em>*</em>' : '') +
            '</span><textarea data-resubmit="' + name + '" rows="3"' + (required ? ' required' : '') + '>' + esc(value || '') + '</textarea></label>';
        return '<div class="acf-box"><p class="acf-box-title">📝 修改簽呈內容</p>' +
            '<label class="acf-field"><span>主旨分類 <em>*</em></span><select data-resubmit="category" required>' + options + '</select></label>' +
            '<label class="acf-field' + (isOther ? '' : ' hidden') + '" data-resubmit-other-wrap><span>其他分類 <em>*</em></span><input data-resubmit="otherCategory" value="' + esc(isOther ? c.category.slice(3) : '') + '" maxlength="80"></label>' +
            '<label class="acf-field"><span>完整主旨 <em>*</em></span><input data-resubmit="title" value="' + esc(d.title) + '" maxlength="500" required></label>' +
            field('一、案件摘要', 'summary', c.summary, true) +
            field('二、時間歷程與證據狀態', 'timeline', c.timeline, true) +
            field('三、案件說明', 'description', c.description, true) +
            field('四、擬辦', 'proposal', c.proposal, true) +
            '<label class="acf-field"><span>主旨結語</span><select data-resubmit="closing"><option' + (c.closing !== '敬請核示' ? ' selected' : '') + '>擬請核示</option><option' + (c.closing === '敬請核示' ? ' selected' : '') + '>敬請核示</option></select></label>' +
            '<label class="acf-field"><span>會辦單位</span><input data-resubmit="coOffice" value="' + esc(c.coOffice || '') + '" maxlength="200"></label>' +
            field('奉核後處理方式', 'afterApproval', c.afterApproval || '奉 核後，影印陳送各會辦單位存照。', false) +
            field('附件說明', 'attachments', c.attachments, false) +
            '<label class="acf-check"><input type="checkbox" data-resubmit="showRespect"' + (c.showRespect ? ' checked' : '') + '> 顯示「敬陳」</label></div>';
    }

    function actionHtml(d) {
        if (d.myTurn && d.stage === 'gm') {
            return '<div class="pt-act">' +
                '<p class="pt-act-title">👔 請送總經理決行（由總經理室上傳）</p>' +
                '<ol class="pt-act-steps"><li>把上方「最新版本」送總經理決行</li><li>決行後拍照或掃描</li><li>在這裡上傳，按「總經理已決行，完成」</li></ol>' +
                uploadField('approve', '上傳總經理決行後的簽呈') +
                '<textarea class="pt-note" data-note="approve" rows="2" maxlength="1000" placeholder="備註（選填）"></textarea>' +
                '<div class="pt-act-btns"><button type="button" class="acf-submit" data-act="approve">總經理已決行，完成</button></div>' +
                REJECT_BOX.replace('要退回這份簽呈？', '總經理退回？') +
                '</div>';
        }
        if (d.myTurn && d.stage === 'office') {
            return '<div class="pt-act">' +
                '<p class="pt-act-title">🏢 輪到你會辦（總經理室）</p>' +
                '<ol class="pt-act-steps"><li>確認承辦人、主管、審核三方電子簽名</li><li>列印正式套版簽呈送總經理紙本決行</li><li>決行後拍照或掃描上傳</li></ol>' +
                uploadField('approve', '若總經理已決行，可直接上傳最後版本') +
                '<textarea class="pt-note" data-note="approve" rows="2" maxlength="1000" placeholder="備註（選填）"></textarea>' +
                '<div class="pt-act-btns">' +
                '<button type="button" class="acf-submit" data-act="approve-gm">總經理已決行，直接完成</button>' +
                '<button type="button" class="pt-secondary" data-act="approve">會辦完成，先送總經理決行</button>' +
                '</div>' +
                '<p class="acf-hint">若總經理尚未決行，先選「會辦完成」；決行後再到「待我簽核」上傳最後版本。</p>' +
                REJECT_BOX + '</div>';
        }
        if (d.myTurn) {
            const nextText = d.stage === 'manager'
                ? '主管電子簽名，送審核人員 ' + esc(d.directorName)
                : '審核電子簽名，送總經理室 ' + esc(d.officeName);
            return '<div class="pt-act">' +
                '<p class="pt-act-title">✍️ 輪到你簽核（' + esc(STAGE_NAME[d.stage]) + '）</p>' +
                '<ol class="pt-act-steps"><li>確認簽呈內容及附件</li><li>在下方完成本人電子簽名</li><li>按下按鈕送到下一關</li></ol>' +
                signaturePadHtml('approve', STAGE_NAME[d.stage] + '電子簽名') +
                '<textarea class="pt-note" data-note="approve" rows="2" maxlength="1000" placeholder="備註（選填）"></textarea>' +
                '<div class="pt-act-btns"><button type="button" class="acf-submit" data-act="approve">' + nextText + '</button></div>' +
                REJECT_BOX + '</div>';
        }
        if (d.isMine && d.stage === 'rejected') {
            return '<div class="pt-act pt-act--redo">' +
                '<p class="pt-act-title">🔁 修改後重新送出</p>' +
                '<p class="acf-hint">依退回原因修改後重新電子簽名；先前所有電子簽名不再適用。</p>' +
                resubmitEditorHtml(d) +
                uploadField('resubmit', '附件有修改時再上傳（選填）') +
                signaturePadHtml('resubmit', '承辦人重新電子簽名') +
                '<textarea class="pt-note" data-note="resubmit" rows="2" maxlength="1000" placeholder="修改說明（選填）"></textarea>' +
                '<div class="pt-act-btns"><button type="button" class="acf-submit" data-act="resubmit">重新送出</button>' +
                '<button type="button" class="pt-withdraw" data-act="withdraw">撤回這份簽呈</button></div></div>';
        }
        if (d.isMine && d.stage !== 'done') {
            return '<div class="pt-act-btns pt-act-btns--end"><button type="button" class="pt-withdraw" data-act="withdraw">撤回這份簽呈</button></div>';
        }
        return '';
    }

    function eventsHtml(d) {
        if (!d.events.length) return '';
        return '<details class="pt-events"><summary>簽核歷程（' + d.events.length + '）</summary><ul>' + d.events.map((e) =>
            '<li><time>' + esc(fmtTime(e.createdAt)) + '</time><span><b>' + esc(e.actorName) + '</b>' + esc(eventText(e)) + '</span>' +
            (e.note ? '<p>' + esc(e.note) + '</p>' : '') + '</li>').join('') + '</ul></details>';
    }

    function eventText(e) {
        if (e.stage === 'gm') return e.action === 'reject' ? '（總經理室）登錄總經理退回' : '（總經理室）上傳總經理決行後版本';
        return (e.stage !== 'applicant' ? '（' + (STAGE_NAME[e.stage] || e.stageLabel) + '）' : '') + ' ' + (ACTION[e.action] || e.action);
    }

    function detailHtml(p) {
        const d = state.details[p.id];
        if (!d) return '<div class="acf-detail"><p class="acf-empty">讀取中…</p></div>';
        const jump = d.myTurn ? '👇 直接到簽核區' : d.isMine && d.stage === 'rejected' ? '👇 直接到修改重送' : '';
        return '<div class="acf-detail">' +
            (d.stage === 'rejected'
                ? '<div class="pt-rejected"><b>❌ 被' + esc(rejectedByText(d)) + ' 退回</b><p>' + esc(d.rejectReason) + '</p></div>'
                : '') +
            (jump ? '<button type="button" class="pt-jump" data-jump>' + jump + '</button>' : '') +
            (d.stage === 'done' ? '<div class="pt-donebox">✅ 全部簽核完成（' + esc(fmtTime(d.doneAt)) + '）</div>' : '') +
            templateHtml(d) +
            (d.note ? '<dl class="acf-kv"><div class="wide"><dt>內部補充說明</dt><dd>' + esc(d.note) + '</dd></div></dl>' : '') +
            signaturesHtml(d) + filesHtml(d) + actionHtml(d) + eventsHtml(d) +
            (d.lineError && d.isMine ? '<p class="pt-line-err">LINE 通知：' + esc(d.lineError) + '</p>' : '') +
            '<p class="acf-detail-msg" id="pt-detail-msg" role="status" aria-live="polite"></p>' +
            '</div>';
    }

    function detailMsg(text, kind) {
        const el = $('pt-detail-msg');
        if (!el) return;
        el.textContent = text;
        el.className = 'acf-detail-msg' + (kind ? ' is-' + kind : '');
    }

    const SIGN_ROLES = [['applicant', '承辦人'], ['manager', '部門主管'], ['director', '審核（經理／協理）']];
    const PRINT_CSS = '@page{size:A4;margin:18mm 20mm}*{box-sizing:border-box}' +
        'body{font-family:"標楷體","DFKai-SB","BiauKai","Microsoft JhengHei",serif;color:#111;font-size:13pt;line-height:1.7;margin:0}' +
        '.paper{max-width:170mm;margin:0 auto;padding:12px 0}' +
        '.preview{background:#fef3c7;border:1px dashed #d97706;color:#92400e;padding:6px 10px;margin-bottom:12px;font:11pt system-ui,sans-serif}' +
        '.top{display:flex;justify-content:space-between;font-weight:700;margin-bottom:12px}' +
        'h1{font-size:14pt;margin:0 0 14px;font-weight:700;line-height:1.6;padding-left:3em;text-indent:-3em}' +
        'h2{font-size:13pt;margin:14px 0 4px;font-weight:700;break-after:avoid;-webkit-text-stroke:.35px #111}' +
        'p{white-space:pre-wrap;margin:0}section p{padding-left:2em}' +
        '.respect{margin-top:12px;font-weight:700}' +
        '.level{text-align:center;margin:18px 0 6px;font-weight:700;letter-spacing:.3em}' +
        '.signs{display:grid;grid-template-columns:repeat(4,1fr);break-inside:avoid}' +
        '.sign{border:1px solid #333;min-height:130px;padding:6px;text-align:center;display:flex;flex-direction:column;justify-content:space-between}' +
        '.sign+.sign{border-left:0}.sign b{font-size:11pt}.sign span,.sign small{display:block}.sign small{font-size:9pt;color:#444}' +
        '.sign img{width:100%;height:70px;object-fit:contain}.sign .blank{height:70px;color:#999;font-size:10pt;display:flex;align-items:center;justify-content:center}' +
        '.tools{margin:20px auto;max-width:170mm;display:flex;gap:8px}' +
        '.tools button{font:12pt system-ui,sans-serif;padding:8px 18px;border-radius:8px;border:1px solid #1d4ed8;background:#2563eb;color:#fff;cursor:pointer}' +
        '@media print{.tools,.preview{display:none}.paper{padding:0}}';

    function printDocHtml(d, signs, preview) {
        const c = d.content || {};
        const section = (title, value) => value ? '<section><h2>' + title + '</h2><p>' + esc(value) + '</p></section>' : '';
        const cards = SIGN_ROLES.map(([role, label]) => {
            const s = signs.find((x) => x.role === role);
            if (!s) return '<div class="sign"><b>' + label + '</b><div class="blank">尚未簽名</div><span>&nbsp;</span><small>&nbsp;</small></div>';
            return '<div class="sign"><b>' + esc(s.roleLabel || label) + '</b>' +
                (s.url ? '<img src="' + esc(s.url) + '" alt="">' : '<div class="blank">簽名讀取失敗</div>') +
                '<span>' + esc(s.userName) + '</span><small>' + esc(fmtTime(s.createdAt)) + '</small></div>';
        }).join('');
        return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + esc(d.title || '簽呈預覽') + '</title><style>' + PRINT_CSS + '</style></head><body>' +
            '<div class="tools"><button onclick="window.print()">' + (preview ? '列印預覽稿' : '列印正式簽呈') + '</button></div>' +
            '<div class="paper">' +
            (preview ? '<div class="preview">這是送出前的預覽稿：已簽名的欄位會顯示目前內容；尚未簽核的關卡仍顯示「尚未簽名」。</div>' : '') +
            '<div class="top"><span>簽　於　' + esc(d.team || '未填部門') + '</span><span>中華民國' + esc(rocDate(d.createdAt)) + '</span></div>' +
            '<h1>主旨：' + esc(d.title) + '，' + esc(c.closing || '擬請核示') + '。</h1>' +
            section('一、案件摘要', c.summary) + section('二、時間歷程與證據狀態', c.timeline) +
            section('三、案件說明', c.description) + section('四、擬辦', c.proposal) +
            section('會辦單位', c.coOffice) +
            section('擬辦', c.afterApproval || '奉 核後，影印陳送各會辦單位存照。') +
            (c.showRespect ? '<p class="respect">敬陳</p>' : '') +
            '<p class="level">第一層決行</p><div class="signs">' + cards +
            '<div class="sign"><b>決行（總經理）</b><div class="blank"></div><span>紙本簽名</span><small>日期：　　年　　月　　日</small></div></div>' +
            section('附件', c.attachments) +
            '</div></body></html>';
    }

    function openPrintWindow(html, onBlocked) {
        const win = window.open('', '_blank');
        if (!win) { onBlocked('瀏覽器封鎖列印視窗，請允許彈出視窗後再試一次'); return; }
        win.document.write(html);
        win.document.close();
    }

    function printSignatureSheet(d) {
        const signs = (d.signatures || []).filter((s) => s.round === d.round);
        if (signs.length < 3) {
            detailMsg('承辦人、部門主管、審核三方尚未全部完成電子簽名', 'err');
            return;
        }
        openPrintWindow(printDocHtml(d, signs, false), (m) => detailMsg(m, 'err'));
    }

    function renderEntryBadge() {
        const el = $('pt-entry-badge');
        if (!el) return;
        const n = state.lists.todo.length;
        el.hidden = !n;
        el.textContent = '待你簽核 ' + n + ' 件';
    }

    function applyLists(res) {
        state.lists = { mine: res.mine || [], todo: res.todo || [], related: res.related || [] };
        state.loaded = true;
        renderEntryBadge();
    }

    async function loadList() {
        if (!token()) { renderTabs(); renderList('請先登入工具箱。'); return; }
        if (!state.loaded) renderPane();
        try {
            applyLists(await fn({ action: 'list', token: token() }));
            if (!state.tab) state.tab = defaultTab();
            const all = state.lists.mine.concat(state.lists.todo, state.lists.related);
            if (state.openId && !all.some((p) => p.id === state.openId)) state.openId = null;
            if (state.openId && state.tab !== 'new' && !listOf(state.tab).some((p) => p.id === state.openId)) {
                const home = LIST_KEYS.find((k) => listOf(k).some((p) => p.id === state.openId));
                if (home) state.tab = home;
            }
            renderPane();
            if (state.openId) loadDetail(state.openId);
        } catch (e) {
            renderTabs();
            renderList(e.message);
        }
    }

    async function loadDetail(id) {
        try {
            const res = await fn({ action: 'detail', token: token(), id });
            state.details[id] = res.petition;
        } catch (e) {
            if (state.openId === id) { renderList(); detailMsg(e.message, 'err'); }
            return;
        }
        if (state.openId === id) renderList();
    }

    async function act(kind, btn) {
        const d = state.details[state.openId];
        if (!d || state.busy) return;
        const root = btn.closest('.acf-detail');
        const noteEl = (k) => root.querySelector('[data-note="' + k + '"]');
        const note = (k) => (noteEl(k)?.value || '').trim();
        try {
            if (kind === 'print') {
                printSignatureSheet(d);
                return;
            }
            if (kind === 'withdraw') {
                if (!window.confirm('確定撤回「' + d.title + '」？\n撤回後這份簽呈和所有檔案都會刪除，無法復原。')) return;
                state.busy = true;
                btn.disabled = true;
                await fn({ action: 'withdraw', token: token(), id: d.id });
                state.openId = null;
                flash('已撤回簽呈。');
                await loadList();
                return;
            }
            if (kind === 'reject') {
                const reason = note('reject');
                if (!reason) { detailMsg('請填寫退回原因', 'err'); noteEl('reject')?.focus(); return; }
                if (!window.confirm('確定把「' + d.title + '」退回給 ' + d.userName + '？')) return;
                state.busy = true;
                btn.disabled = true;
                detailMsg('退回中…');
                const res = await fn({ action: 'reject', token: token(), id: d.id, reason });
                state.openId = null;
                flash('已退回。' + lineText(res.line, '承辦人 ' + d.userName));
                await loadList();
                return;
            }
            const withGm = kind === 'approve-gm';
            const action = withGm ? 'approve' : kind;
            let updatedTitle = '';
            let updatedContent = null;
            if (action === 'resubmit') {
                const read = (name) => (root.querySelector('[data-resubmit="' + name + '"]')?.value || '').trim();
                const categoryChoice = read('category');
                const otherCategory = read('otherCategory');
                updatedTitle = read('title');
                updatedContent = {
                    category: categoryChoice === '其他' ? '其他：' + otherCategory : categoryChoice,
                    closing: read('closing'),
                    summary: read('summary'),
                    timeline: read('timeline'),
                    description: read('description'),
                    proposal: read('proposal'),
                    coOffice: read('coOffice'),
                    afterApproval: read('afterApproval'),
                    attachments: read('attachments'),
                    showRespect: !!root.querySelector('[data-resubmit="showRespect"]')?.checked
                };
                if (!categoryChoice || (categoryChoice === '其他' && !otherCategory) || !updatedTitle ||
                    !updatedContent.summary || !updatedContent.timeline || !updatedContent.description || !updatedContent.proposal) {
                    detailMsg('請填完主旨分類、完整主旨、案件摘要、時間歷程與證據狀態、案件說明與擬辦', 'err');
                    return;
                }
            }
            const input = root.querySelector('[data-pick="' + action + '"]');
            let files = [];
            if (d.stage === 'gm' || withGm) files = await prepareAll(input?.files, '請先上傳總經理紙本決行後的檔案');
            else if (action === 'resubmit' && input?.files?.length) files = await prepareAll(input.files);
            const needsSignature = action === 'resubmit' || d.stage === 'manager' || d.stage === 'director';
            const signature = needsSignature ? await signatureBlob(action, root) : null;
            let ask;
            if (action === 'resubmit') ask = '確定重新電子簽名並送出？會重新開始三方簽核。';
            else if (withGm || d.stage === 'gm') ask = '確定總經理已決行？送出後整份簽呈就完成了。';
            else if (d.stage === 'office') ask = '確定會辦完成並送總經理紙本決行？決行後要再上傳最後版本。';
            else if (d.stage === 'manager') ask = '確定以部門主管身分電子簽名，送審核人員 ' + d.directorName + '？';
            else ask = '確定以審核人身分電子簽名，送總經理室 ' + d.officeName + '？';
            if (!window.confirm(ask)) return;
            state.busy = true;
            btn.disabled = true;
            detailMsg('上傳中，請稍候…');
            const fields = { id: d.id, note: note(action) };
            if (action === 'resubmit') {
                fields.title = updatedTitle;
                fields.content = JSON.stringify(updatedContent);
            }
            if (withGm) fields.withGm = '1';
            const res = await fn(formWith(action, fields, files, signature));
            const p = res.petition || {};
            let text;
            if (action === 'resubmit') {
                const who = p.stage === 'director' ? '審核人員 ' + p.directorName : '部門主管 ' + p.managerName;
                text = '✅ 已重新電子簽名並送出。' + lineText(res.line, who);
            }
            else if (p.stage === 'done') text = '✅ 總經理已決行，整份簽呈已完成。' + lineText(res.line, '審核人員 ' + p.managerName);
            else if (p.stage === 'gm') text = '✅ 會辦完成。請送總經理決行，完成後在這裡上傳最後版本。';
            else if (p.stage === 'office') text = '✅ 審核電子簽名完成，已送總經理室 ' + p.officeName + '。' + lineText(res.line, '總經理室 ' + p.officeName);
            else text = '✅ 主管電子簽名完成，已送審核人員 ' + p.directorName + '。' + lineText(res.line, '審核人員 ' + p.directorName);
            if (action === 'approve' && p.stage !== 'gm') state.openId = null;
            else delete state.details[d.id];
            flash(text);
            await loadList();
        } catch (e) {
            detailMsg(e.message, 'err');
            btn.disabled = false;
        } finally {
            state.busy = false;
        }
    }

    /* ---------- 進入點 ---------- */

    function visible(id) {
        const el = $(id);
        return !!el && !el.classList.contains('hidden');
    }

    function init() {
        if (!$('page-petition')) return;
        const me = auth()?.getUser?.();
        const applicant = $('pt-applicant');
        if (applicant) {
            applicant.textContent = me
                ? (me.name || me.username || '—') + (me.team ? '（' + me.team + '）' : '（未填部門）')
                : '依登入帳號自動帶入';
        }
        const isLocal = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
        if (isLocal) {
            const current = localStorage.getItem('skyfun-petition-approver-settings-dev') || '';
            if (current !== state.devApproverSettings) {
                state.devApproverSettings = current;
                state.approvers = null;
            }
        }
        if (!token()) {
            renderLine();
            renderTabs();
            renderList('請先登入工具箱。');
            return;
        }
        loadLine();
        loadList();
    }

    async function badge() {
        if (!token()) return;
        try { applyLists(await fn({ action: 'list', token: token() })); } catch { /* ignore */ }
    }

    window.petitionInit = init;
    window.petitionBadge = badge;

    function bind() {
        const page = $('page-petition');
        const form = $('pt-form');
        if (!page || !form) return;
        bindSignaturePads(page);
        page.addEventListener('click', (e) => {
            const clear = e.target.closest('[data-clear-sign]');
            if (clear) {
                clearSignature(clear.dataset.clearSign, clear.closest('form, .acf-detail') || page);
                return;
            }
            if (e.target.closest('[data-refresh]')) {
                state.details = {};
                state.approvers = null;
                loadLine();
                loadList();
                if (state.tab === 'new') ensureApprovers();
                return;
            }
            if (e.target.closest('[data-new]')) {
                if (state.tab !== 'new') state.backTab = state.tab;
                state.tab = 'new';
                renderPane();
                return;
            }
            if (e.target.closest('[data-back]')) {
                state.tab = state.backTab && state.backTab !== 'new' ? state.backTab : defaultTab();
                renderPane();
                return;
            }
            const tab = e.target.closest('[data-tab]');
            if (!tab) return;
            state.tab = tab.dataset.tab;
            state.openId = null;
            renderPane();
        });

        const list = $('pt-list');
        list?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (btn) { act(btn.dataset.act, btn); return; }
            const jump = e.target.closest('[data-jump]');
            if (jump) { return; }
            const row = e.target.closest('[data-open]');
            if (!row) return;
            const id = Number(row.dataset.open);
            state.openId = state.openId === id ? null : id;
            renderList();
            if (state.openId) loadDetail(state.openId);
        });
        list?.addEventListener('change', (e) => {
            if (!e.target.matches('[data-resubmit="category"]')) return;
            const root = e.target.closest('.acf-detail');
            const wrap = root?.querySelector('[data-resubmit-other-wrap]');
            const isOther = e.target.value === '其他';
            wrap?.classList.toggle('hidden', !isOther);
            if (isOther) wrap.querySelector('input')?.focus();
            else if (wrap) wrap.querySelector('input').value = '';
        });

        form.addEventListener('submit', (e) => { e.preventDefault(); submitForm(form); });
        let draftTimer = null;
        const queueDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft(form), 600); };
        form.addEventListener('input', (e) => {
            const q = e.target.closest('.pt-pick input');
            if (q) { fillPicker(q.closest('.pt-pick').dataset.role); return; }
            e.target.closest('.acf-field')?.classList.remove('is-invalid');
            if (DRAFT_FIELDS.includes(e.target.name)) queueDraft();
        });
        form.addEventListener('click', (e) => {
            if (e.target.closest('#pt-preview')) { previewForm(form); return; }
            if (e.target.closest('#pt-ai-run')) { aiOrganize(form); return; }
            if (e.target.closest('#pt-ai-undo')) { aiUndo(form); return; }
            if (e.target.closest('#pt-draft-clear')) {
                if (!window.confirm('確定清空目前填寫的內容與草稿？')) return;
                form.reset();
                $('pt-other-title')?.classList.add('hidden');
                clearSignature('applicant', form);
                clearDraft(form);
                fillPicker('manager', savedPicks().managerId || '');
                fillPicker('director', savedPicks().directorId || '');
                fillPicker('office', savedPicks().officeId || '');
                setMsg('');
            }
        });
        form.addEventListener('change', (e) => {
            if (DRAFT_FIELDS.includes(e.target.name)) queueDraft();
            if (e.target === form.elements.category) {
                const isOther = e.target.value === '其他';
                $('pt-other-title')?.classList.toggle('hidden', !isOther);
                if (isOther) form.elements.otherCategory.focus();
                else form.elements.otherCategory.value = '';
                e.target.closest('.acf-field')?.classList.remove('is-invalid');
                return;
            }
            const sel = e.target.closest('.pt-pick select');
            if (sel) { warnPicker(sel.closest('.pt-pick').dataset.role); return; }
            e.target.closest('.acf-field')?.classList.remove('is-invalid');
        });

        $('pt-line')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-line]');
            if (btn) lineAction(btn.dataset.line, btn);
        });

        document.addEventListener('skyfun-auth-ready', () => {
            state.tab = '';
            state.loaded = false;
            state.openId = null;
            state.details = {};
            state.approvers = null;
            state.lists = { mine: [], todo: [], related: [] };
            line.info = null;
            line.code = null;
            if (visible('page-petition')) init();
            else if (visible('page-administration')) badge();
        });
        window.addEventListener('storage', (e) => {
            if (e.key !== 'skyfun-petition-approver-settings-dev') return;
            state.devApproverSettings = e.newValue || '';
            state.approvers = null;
            if (visible('page-petition') && state.tab === 'new') ensureApprovers();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
