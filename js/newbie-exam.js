/**
 * 財補專區線上考試：隨機 A/B 卷、題目與選項每次重新排序、限時 20 分鐘、伺服器評分並記錄。
 */
(function () {
    'use strict';

    const STATE_KEY = 'nbExamState-v1';
    const SECTION_ORDER = ['tf', 'single', 'multi', 'short'];
    const LETTERS = 'ABCDEFGH';

    let state = null;
    let timerId = null;
    let submitting = false;
    let lastResult = null;

    function data() { return window.NEWBIE_EXAM; }
    function root() { return document.getElementById('nb-exam-body'); }
    function auth() { return window.skyfunAuth; }
    function token() { return auth()?.getToken?.() || ''; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function rpc(name, args) {
        if (!auth()?.rpc) throw new Error('尚未登入');
        return auth().rpc(name, args);
    }

    function randInt(n) {
        if (window.crypto?.getRandomValues) {
            const a = new Uint32Array(1);
            window.crypto.getRandomValues(a);
            return a[0] % n;
        }
        return Math.floor(Math.random() * n);
    }
    function shuffle(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = randInt(i + 1);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function paperOf(id) { return data().papers[id]; }
    function findQuestion(paper, qid) {
        for (const sec of paper.sections) {
            const q = sec.questions.find((x) => x.id === qid);
            if (q) return { q, sec };
        }
        return null;
    }

    function buildOrder(paper) {
        const order = {};
        const optOrder = {};
        paper.sections.forEach((sec) => {
            order[sec.key] = shuffle(sec.questions.map((q) => q.id));
            sec.questions.forEach((q) => {
                if (!q.options || q.type === 'tf') return;
                const free = q.options.filter((o) => !o.pinLast).map((o) => o.id);
                const pinned = q.options.filter((o) => o.pinLast).map((o) => o.id);
                optOrder[q.id] = shuffle(free).concat(pinned);
            });
        });
        return { order, optOrder };
    }

    function optIds(q, st) {
        const base = q.options.map((o) => o.id);
        if (q.type === 'tf') return base;
        return (st && st.optOrder && st.optOrder[q.id]) || base;
    }

    function saveState() {
        try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
    }
    function loadState() {
        try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (_) { return null; }
    }
    function clearState() {
        try { localStorage.removeItem(STATE_KEY); } catch (_) { /* ignore */ }
    }

    function fmtClock(sec) {
        const s = Math.max(0, Math.round(sec));
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }
    function fmtDuration(sec) {
        if (sec == null) return '—';
        const m = Math.floor(sec / 60), s = sec % 60;
        return m + ' 分 ' + String(s).padStart(2, '0') + ' 秒';
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (d.getFullYear() - 1911) + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') +
                ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        } catch (_) { return iso; }
    }
    function fmtScore(n) {
        const v = Number(n || 0);
        return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
    }

    function totalQuestions(paper) {
        return paper.sections.reduce((n, s) => n + s.questions.length, 0);
    }
    function isAnswered(v) {
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        return String(v).trim() !== '';
    }
    function answeredCount() {
        return Object.values(state.answers || {}).filter(isAnswered).length;
    }

    /* ---------- 首頁：開始考試與歷史成績 ---------- */

    async function renderHome(message) {
        stopTimer();
        const el = root();
        if (!el) return;
        const d = data();
        el.innerHTML =
            '<div class="nb-exam-intro">' +
            '<p>題目為<strong>星鴻財補計畫試題（' + esc(d.version) + '版）</strong>，每次隨機抽 A 卷或 B 卷，題目與選項順序每次都不同。</p>' +
            '<ul>' +
            '<li>限時 <strong>' + d.durationMin + ' 分鐘</strong>，時間到會自動交卷。</li>' +
            '<li>配分：是非 30 題 × 2 分、單選 5 題 × 3 分、複選 3 題 × 5 分（全對才給分）、簡答 10 題 × 1 分（依關鍵字給分），滿分 100 分。</li>' +
            '<li>門牌照片題依帳號處別判斷地區答案；每次考試成績都會記錄。</li>' +
            '</ul></div>' +
            (message ? '<p class="nb-exam-msg">' + esc(message) + '</p>' : '') +
            '<div id="nb-exam-region-pick"></div>' +
            '<button type="button" class="nb-exam-start" id="nb-exam-start-btn">開始考試</button>' +
            '<div class="nb-exam-history"><h4>我的考試紀錄</h4><div id="nb-exam-history-list"><p class="nb-exam-muted">載入中…</p></div></div>' +
            '<p class="nb-exam-muted nb-exam-admin-link"><a href="./admin/newbie-exam-dashboard.html" target="_blank" rel="noopener">管理員：查看全部考試成績 ↗</a></p>';
        document.getElementById('nb-exam-start-btn').addEventListener('click', () => startExam());
        loadHistory();
    }

    async function loadHistory() {
        const box = document.getElementById('nb-exam-history-list');
        if (!box) return;
        if (!token()) { box.innerHTML = '<p class="nb-exam-muted">登入後可查看紀錄。</p>'; return; }
        try {
            const res = await rpc('newbie_exam_my_attempts', { p_token: token() });
            if (!res?.ok) throw new Error(res?.error || '讀取失敗');
            const items = res.items || [];
            if (!items.length) { box.innerHTML = '<p class="nb-exam-muted">尚無紀錄。</p>'; return; }
            const pass = data().passScore;
            box.innerHTML = '<div class="nb-rule-table-wrap"><table class="nb-rule-table nb-exam-hist-table"><thead><tr>' +
                '<th>考試時間</th><th>卷別</th><th>分數</th><th>用時</th><th>備註</th></tr></thead><tbody>' +
                items.map((it) => {
                    const done = it.status === 'submitted';
                    const note = !done ? '未交卷（作廢）' : [it.autoSubmitted ? '時間到自動交卷' : '', it.overtime ? '逾時' : ''].filter(Boolean).join('、');
                    const scoreCls = done ? (Number(it.score) >= pass ? 'is-pass' : 'is-fail') : '';
                    return '<tr><td>' + fmtTime(it.startedAt) + '</td><td>' + esc(it.paper) + ' 卷</td>' +
                        '<td class="' + scoreCls + '">' + (done ? fmtScore(it.score) : '—') + '</td>' +
                        '<td>' + (done ? fmtDuration(it.durationSec) : '—') + '</td><td>' + esc(note || '—') + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        } catch (e) {
            box.innerHTML = '<p class="nb-exam-muted">紀錄載入失敗：' + esc(e.message) + '</p>';
        }
    }

    function renderRegionPick(team) {
        const box = document.getElementById('nb-exam-region-pick');
        if (!box) return;
        box.innerHTML = '<div class="nb-exam-region">' +
            '<p>您的處別「' + esc(team || '未設定') + '」無法自動判斷地區，請選擇作答地區：</p>' +
            ['雙北', '桃園', '台中台南'].map((r) =>
                '<label><input type="radio" name="nb-exam-region" value="' + r + '"> ' + r + '</label>').join('') +
            '</div>';
    }

    async function startExam() {
        const btn = document.getElementById('nb-exam-start-btn');
        if (!token()) { renderHome('請先登入工具箱再考試。'); return; }
        const picked = document.querySelector('input[name="nb-exam-region"]:checked');
        if (btn) { btn.disabled = true; btn.textContent = '準備考卷中…'; }
        try {
            const res = await rpc('newbie_exam_start', { p_token: token(), p_region: picked ? picked.value : null });
            if (!res?.ok && res?.needRegion && !picked) {
                renderRegionPick(res.team);
                if (btn) { btn.disabled = false; btn.textContent = '開始考試'; }
                return;
            }
            if (!res?.ok) throw new Error(res?.error || '無法開始考試');
            const saved = loadState();
            const skew = Date.now() - new Date(res.serverNow).getTime();
            if (saved && saved.attemptId === res.attemptId) {
                state = saved;
                state.skew = skew;
            } else {
                const paper = paperOf(res.paper);
                const { order, optOrder } = buildOrder(paper);
                state = { attemptId: res.attemptId, paper: res.paper, region: res.region, order, optOrder, answers: {}, skew };
            }
            state.deadline = new Date(res.deadlineAt).getTime();
            saveState();
            renderExam(res.resumed);
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = '開始考試'; }
            const box = document.getElementById('nb-exam-region-pick');
            if (box) box.insertAdjacentHTML('beforeend', '<p class="nb-exam-msg">' + esc(e.message) + '</p>');
        }
    }

    /* ---------- 作答畫面 ---------- */

    function optionHtml(q, opt, idx) {
        const type = q.type === 'multi' ? 'checkbox' : 'radio';
        const cur = state.answers[q.id];
        const checked = q.type === 'multi' ? Array.isArray(cur) && cur.includes(opt.id) : cur === opt.id;
        const body = opt.img
            ? '<a href="' + esc(opt.img) + '" target="_blank" rel="noopener" class="nb-exam-zoom" title="開新分頁放大">🔍 放大</a>' +
              '<span class="nb-exam-opt-img"><img src="' + esc(opt.img) + '" alt="選項 ' + LETTERS[idx] + '" loading="lazy"></span>'
            : '<span class="nb-exam-opt-text">' + esc(opt.text) + '</span>';
        return '<label class="nb-exam-opt' + (opt.img ? ' has-img' : '') + (checked ? ' is-on' : '') + '">' +
            '<input type="' + type + '" name="nbq-' + q.id + '" value="' + esc(opt.id) + '"' + (checked ? ' checked' : '') + ' data-qid="' + q.id + '">' +
            '<span class="nb-exam-opt-letter">' + LETTERS[idx] + '</span>' + body + '</label>';
    }

    function questionHtml(q, no, sec) {
        let body = '';
        if (q.type === 'short') {
            body = '<textarea class="nb-exam-text" data-qid="' + q.id + '" rows="2" placeholder="請輸入答案">' + esc(state.answers[q.id] || '') + '</textarea>';
        } else {
            const byId = {};
            q.options.forEach((o) => { byId[o.id] = o; });
            const ids = optIds(q, state);
            body = '<div class="nb-exam-opts' + (q.options.some((o) => o.img) ? ' is-img-grid' : '') + (q.type === 'tf' ? ' is-tf' : '') + '">' +
                ids.map((id, i) => optionHtml(q, byId[id], i)).join('') + '</div>';
        }
        const img = q.img
            ? '<a href="' + esc(q.img) + '" target="_blank" rel="noopener" class="nb-exam-q-img' + (/deed/.test(q.img) ? ' is-wide' : '') + '" title="點擊放大"><img src="' + esc(q.img) + '" alt="附圖" loading="lazy"></a>'
            : '';
        const hint = q.type === 'multi' ? '<span class="nb-exam-tag">複選</span>' : '';
        return '<div class="nb-exam-q" id="nbq-' + q.id + '">' +
            '<p class="nb-exam-q-title"><span class="nb-exam-q-no">' + no + '.</span>' + esc(q.text) + hint +
            (q.regional ? '<span class="nb-exam-tag is-region">' + esc(state.region) + '</span>' : '') + '</p>' +
            img + body + '</div>';
    }

    function renderExam(resumed) {
        const el = root();
        const paper = paperOf(state.paper);
        let html = '<div class="nb-exam-bar" id="nb-exam-bar">' +
            '<span class="nb-exam-bar-paper">' + esc(state.paper) + ' 卷</span>' +
            '<span class="nb-exam-bar-clock" id="nb-exam-clock">--:--</span>' +
            '<span class="nb-exam-bar-count" id="nb-exam-count"></span>' +
            '<button type="button" class="nb-exam-submit" id="nb-exam-submit-top">交卷</button></div>';
        if (resumed) html += '<p class="nb-exam-msg">已接續上次未完成的考卷，計時不會重新開始。</p>';
        SECTION_ORDER.forEach((key) => {
            const sec = paper.sections.find((s) => s.key === key);
            if (!sec) return;
            html += '<div class="nb-exam-sec"><h4>' + esc(sec.title) + '<small>每題 ' + sec.points + ' 分</small></h4>' +
                (state.order[key] || []).map((qid, i) => questionHtml(findQuestion(paper, qid).q, i + 1, sec)).join('') + '</div>';
        });
        html += '<button type="button" class="nb-exam-submit is-bottom" id="nb-exam-submit-bottom">交卷</button>';
        el.innerHTML = html;
        el.querySelectorAll('.nb-exam-submit').forEach((b) => b.addEventListener('click', () => submitExam(false)));
        mountFloat();
        updateCount();
        startTimer();
        document.getElementById('nb-exam-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function onAnswerInput(e) {
        const t = e.target;
        if (!state || !t.dataset || !t.dataset.qid || !t.closest('#nb-exam-body')) return;
        const qid = t.dataset.qid;
        if (t.type === 'checkbox') {
            const list = Array.from(document.querySelectorAll('input[name="nbq-' + qid + '"]:checked')).map((x) => x.value);
            state.answers[qid] = list;
            t.closest('.nb-exam-opt')?.classList.toggle('is-on', t.checked);
        } else if (t.type === 'radio') {
            state.answers[qid] = t.value;
            document.querySelectorAll('input[name="nbq-' + qid + '"]').forEach((x) => x.closest('.nb-exam-opt')?.classList.toggle('is-on', x.checked));
        } else if (t.tagName === 'TEXTAREA') {
            state.answers[qid] = t.value;
        } else return;
        saveState();
        updateCount();
    }

    let floatObserver = null;
    function mountFloat() {
        unmountFloat();
        const f = document.createElement('div');
        f.id = 'nb-exam-float';
        f.className = 'nb-exam-float';
        f.hidden = true;
        f.innerHTML = '<span class="nb-exam-bar-clock" id="nb-exam-float-clock">--:--</span>' +
            '<span class="nb-exam-float-count" id="nb-exam-float-count"></span>' +
            '<button type="button" class="nb-exam-submit">交卷</button>';
        f.querySelector('button').addEventListener('click', () => submitExam(false));
        document.body.appendChild(f);
        const bar = document.getElementById('nb-exam-bar');
        const page = document.getElementById('page-newbie-subsidy');
        if (bar && 'IntersectionObserver' in window) {
            floatObserver = new IntersectionObserver((entries) => {
                const visible = entries[0].isIntersecting;
                f.hidden = visible || !page || page.classList.contains('hidden');
            });
            floatObserver.observe(bar);
        }
    }
    function unmountFloat() {
        if (floatObserver) floatObserver.disconnect();
        floatObserver = null;
        document.getElementById('nb-exam-float')?.remove();
    }

    function updateCount() {
        if (!state) return;
        const text = '已答 ' + answeredCount() + ' / ' + totalQuestions(paperOf(state.paper));
        const el = document.getElementById('nb-exam-count');
        if (el) el.textContent = text;
        const f = document.getElementById('nb-exam-float-count');
        if (f) f.textContent = text;
    }

    function remainingSec() {
        return (state.deadline - (Date.now() - (state.skew || 0))) / 1000;
    }
    function startTimer() {
        if (timerId) clearInterval(timerId);
        const tick = () => {
            if (!state) return stopTimer();
            const left = remainingSec();
            ['nb-exam-clock', 'nb-exam-float-clock'].forEach((id) => {
                const clock = document.getElementById(id);
                if (!clock) return;
                clock.textContent = '剩 ' + fmtClock(left);
                clock.classList.toggle('is-warn', left <= 300 && left > 60);
                clock.classList.toggle('is-danger', left <= 60);
            });
            const f = document.getElementById('nb-exam-float');
            const page = document.getElementById('page-newbie-subsidy');
            if (f && page && page.classList.contains('hidden')) f.hidden = true;
            if (left <= 0) { stopTimer(); submitExam(true); }
        };
        tick();
        timerId = setInterval(tick, 1000);
    }
    function stopTimer() {
        if (timerId) clearInterval(timerId);
        timerId = null;
        unmountFloat();
    }

    async function submitExam(auto) {
        if (!state || submitting) return;
        const paper = paperOf(state.paper);
        if (!auto) {
            const left = totalQuestions(paper) - answeredCount();
            const msg = left > 0 ? '還有 ' + left + ' 題未作答，確定要交卷嗎？' : '確定要交卷嗎？';
            if (!window.confirm(msg)) return;
        }
        submitting = true;
        document.querySelectorAll('.nb-exam-submit').forEach((b) => { b.disabled = true; b.textContent = '評分中…'; });
        try {
            const res = await rpc('newbie_exam_submit', {
                p_token: token(), p_attempt_id: state.attemptId, p_answers: state.answers, p_auto: !!auto
            });
            if (!res?.ok) throw new Error(res?.error || '交卷失敗');
            stopTimer();
            const snapshot = state;
            clearState();
            state = null;
            lastResult = { res, snapshot };
            renderResult(res, snapshot);
        } catch (e) {
            if (/已交卷|作廢|找不到/.test(e.message)) {
                stopTimer();
                clearState();
                state = null;
                renderHome('這份考卷已無法交卷（' + e.message + '），請重新開始考試。');
                return;
            }
            document.querySelectorAll('.nb-exam-submit').forEach((b) => { b.disabled = false; b.textContent = '交卷'; });
            if (!auto) window.alert('交卷失敗：' + e.message + '\n作答內容已保存在此裝置，請確認網路後再按一次「交卷」。');
            else renderHome('自動交卷失敗：' + e.message + '，請確認網路後重新整理頁面。');
        } finally {
            submitting = false;
        }
    }

    /* ---------- 成績畫面 ---------- */

    function optLabel(q, snapshot, id) {
        const ids = optIds(q, snapshot);
        const idx = ids.indexOf(id);
        const opt = q.options.find((o) => o.id === id);
        const letter = idx >= 0 ? LETTERS[idx] : '?';
        return opt && opt.text ? letter + '. ' + opt.text : letter;
    }
    function answerText(q, snapshot, v) {
        if (!isAnswered(v)) return '（未作答）';
        if (q.type === 'short') return String(v);
        const list = Array.isArray(v) ? v : [v];
        const ids = optIds(q, snapshot);
        return list.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b)).map((id) => optLabel(q, snapshot, id)).join('、');
    }

    function renderResult(res, snapshot) {
        const el = root();
        const paper = paperOf(res.paper);
        const pass = Number(res.score) >= data().passScore;
        const names = { tf: '是非題', single: '單選題', multi: '複選題', short: '簡答題' };
        const secHtml = SECTION_ORDER.filter((k) => res.sections?.[k]).map((k) =>
            '<div class="nb-exam-sec-score"><span>' + names[k] + '</span><strong>' + fmtScore(res.sections[k].earned) + '</strong><small>/ ' + fmtScore(res.sections[k].max) + '</small></div>').join('');
        let list = '';
        SECTION_ORDER.forEach((key) => {
            const sec = paper.sections.find((s) => s.key === key);
            if (!sec) return;
            list += '<div class="nb-exam-sec"><h4>' + esc(sec.title) + '</h4>';
            (snapshot.order[key] || []).forEach((qid, i) => {
                const q = findQuestion(paper, qid).q;
                const r = res.results?.[qid] || {};
                const earned = Number(r.earned || 0), pts = Number(r.points || sec.points);
                const cls = earned >= pts ? 'is-right' : earned > 0 ? 'is-partial' : 'is-wrong';
                const correct = q.type === 'short' ? String(r.correct || '') : answerText(q, snapshot, r.correct);
                list += '<div class="nb-exam-r ' + cls + '">' +
                    '<p class="nb-exam-q-title"><span class="nb-exam-q-no">' + (i + 1) + '.</span>' + esc(q.text) +
                    '<span class="nb-exam-r-pts">' + fmtScore(earned) + ' / ' + fmtScore(pts) + '</span></p>' +
                    '<p class="nb-exam-r-line"><span>你的答案</span>' + esc(answerText(q, snapshot, snapshot.answers[qid])) + '</p>' +
                    (earned >= pts ? '' : '<p class="nb-exam-r-line is-key"><span>' + (q.type === 'short' ? '參考答案' : '正確答案') + '</span>' + esc(correct) + '</p>') +
                    '</div>';
            });
            list += '</div>';
        });
        el.innerHTML =
            '<div class="nb-exam-score ' + (pass ? 'is-pass' : 'is-fail') + '">' +
            '<p class="nb-exam-score-num">' + fmtScore(res.score) + '<small> 分</small></p>' +
            '<p class="nb-exam-score-tag">' + (pass ? '✅ 通過（' + data().passScore + ' 分以上）' : '❌ 未達 ' + data().passScore + ' 分') + '</p>' +
            '<p class="nb-exam-muted">' + esc(res.paper) + ' 卷 · 用時 ' + fmtDuration(res.durationSec) +
            (res.autoSubmitted ? ' · 時間到自動交卷' : '') + (res.overtime ? ' · 逾時交卷' : '') + ' · 成績已記錄</p>' +
            '<div class="nb-exam-sec-scores">' + secHtml + '</div>' +
            '<button type="button" class="nb-exam-start" id="nb-exam-back">回到考試首頁</button></div>' +
            '<details class="nb-exam-review" open><summary>逐題檢討</summary>' + list + '</details>';
        document.getElementById('nb-exam-back').addEventListener('click', () => renderHome());
        document.getElementById('nb-exam-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ---------- 初始化 ---------- */

    function whenLoggedIn(cb) {
        let tries = 0;
        const check = () => {
            if (token()) return cb();
            if (++tries < 60) setTimeout(check, 500);
        };
        check();
    }

    function init() {
        if (!root() || !data()) return;
        document.addEventListener('change', onAnswerInput);
        document.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') onAnswerInput(e); });
        const saved = loadState();
        if (saved && saved.deadline && saved.deadline > Date.now()) {
            renderHome('偵測到未完成的考卷，按「開始考試」即可接續作答。');
        } else if (saved && saved.attemptId) {
            renderHome('上次的考卷時間已到，登入後會自動以已作答內容交卷。');
            whenLoggedIn(() => { state = saved; submitExam(true); });
            return;
        } else {
            renderHome();
        }
        whenLoggedIn(loadHistory);
    }

    window.newbieExam = { refresh: () => { if (!state) renderHome(); }, lastResult: () => lastResult };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
