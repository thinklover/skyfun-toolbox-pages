/**
 * 行政專區 › 行政週會：每次週會的簡報＋線上小考（小考沿用 CourseExam，題庫在 admin-meeting-exam-data.js，答案只在 Supabase）
 * 新增一次週會：MEETINGS 最前面加一筆，簡報圖放 assets/meetings/<id>/01.jpg…，題目用 包租代管題庫/meeting-exam-export.mjs 產生
 */
(function () {
    const MEETINGS = [
        {
            id: '1151019',
            course: 'meet1151019',
            date: '115/10/19',
            title: '行政會議紀錄',
            slides: [
                '系統公告｜手機上傳安全檢核表照片：前置作業與方法 A（尚未建立物件）',
                '系統公告｜手機上傳：AI 預審、儲存草稿與電腦版查詢草稿（方法 A 續）',
                '系統公告｜手機上傳方法 B：公司系統已建立物件資料',
                '系統公告｜手機儲存草稿 ≠ 已送出審核，回電腦版完成送審',
                '行政管理部公告｜包租契約解約退押款匯入專屬房東虛擬帳號',
                '系統公告｜插件功能授權方式變更：由管理員勾選開啟'
            ]
        },
        {
            id: 'secproj',
            course: null,
            date: '115/10/12 版',
            title: '秘書及專案任務管理辦法（業務主管權責）',
            slides: [
                '秘書及專案任務管理辦法｜一句話看懂分工',
                '誰管誰？分工一次看懂（秘書歸處長、專案秘書歸區主管）',
                '派件與跨營業處支援：誰決定、怎麼做',
                '專案任務管理與人力增補流程',
                '日常管理：請假加班、教育訓練、代理交接',
                '異常處理、定期追蹤與主管紅線'
            ]
        },
        {
            id: '1151012',
            course: 'meet1151012',
            date: '115/10/12',
            title: '行政週會',
            slides: [
                '系統公告｜未成年房東資料上傳說明',
                '系統公告｜未成年帳戶指定人佐證文件上傳',
                '系統公告｜寄居房客謄本調閱確認',
                '系統公告｜住家用稅率核准公文替代房屋稅單',
                '系統公告｜稅籍證明書使用條件',
                '系統公告｜契約書介面更新預告',
                '系統公告｜契約書審核介面更新',
                '解約費用結算｜轉租契約解約注意事項',
                '解約費用結算｜包租契約解約注意事項',
                '系統預計優化｜包租／轉租契約收件與簽約日登錄',
                '行政管理部公告｜退押款匯入專屬房東虛擬帳號',
                '系統公告｜押金月份選單與金額填寫',
                '更換房東／房客 1/3｜使用範圍與前置作業',
                '更換房東／房客 2/3｜操作入口與案件選單',
                '更換房東／房客 3/3｜原因填寫、文件列印與行政收件',
                '房客紙本財產、所得核對 1/4｜資料準備與各區限額',
                '房客紙本財產、所得核對 2/4｜所得核對',
                '房客紙本財產、所得核對 3/4｜動產核對：利息推算本金',
                '房客紙本財產、所得核對 4/4｜不動產核對與系統輸入'
            ]
        }
    ];

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const img = (m, i) => `./assets/meetings/${m.id}/${String(i + 1).padStart(2, '0')}.jpg`;
    const view = { id: MEETINGS[0]?.id, tab: 'slides', slide: 0, q: '' };
    const meeting = () => MEETINGS.find((m) => m.id === view.id) || MEETINGS[0];
    const HIDE_BOARD_NAMES = new Set(['簡為倢']);

    function fmtBoardTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear() - 1911}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function scoreTone(score) {
        if (score >= 100) return 'is-full';
        if (score >= 60) return 'is-good';
        if (score > 0) return 'is-low';
        return 'is-zero';
    }
    function hueOf(name) {
        let h = 0;
        for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
        return h;
    }
    function myName() {
        try {
            return window.skyfunAuth?.getSession?.()?.name || window.skyfunAuth?.getUser?.()?.name || '';
        } catch (_) {
            return '';
        }
    }

    function boardHtml(course) {
        if (!course) return '';
        const title = window.COURSE_EXAM?.[course]?.title || '本週小考';
        if (!window.CourseExam?.boardOf) {
            return `<div class="amt-board"><h3 class="amt-board-title">公開成績板</h3><p class="gx-muted">成績板元件尚未載入。</p></div>`;
        }
        const board = window.CourseExam.boardOf(course);
        if (!board.loaded) {
            return `<div class="amt-board"><h3 class="amt-board-title">公開成績板 · ${esc(title)}</h3><p class="gx-muted">讀取成績板中…</p></div>`;
        }
        if (board.error) {
            return `<div class="amt-board"><h3 class="amt-board-title">公開成績板 · ${esc(title)}</h3><p class="gx-warn">成績板讀取失敗：${esc(board.error)}</p></div>`;
        }
        const items = (board.items || []).filter((r) => !HIDE_BOARD_NAMES.has(String(r.name || '').trim()));
        const me = myName();
        const passedN = items.filter((x) => x.passed).length;
        const body = items
            .map((r, i) => {
                const score = r.best == null ? null : Number(r.best);
                const state = r.passed
                    ? ['is-done', '✅ 滿分通過']
                    : score != null
                      ? ['is-retake', '待補考']
                      : ['is-none', '尚未交卷'];
                return `<tr class="gx-board-row${me && r.name === me ? ' is-me' : ''}">
          <td class="num">${i + 1}</td>
          <td><span class="gx-who"><span class="gx-avatar" style="--h:${hueOf(r.name)}">${esc(String(r.name).slice(0, 1))}</span><b>${esc(r.name)}</b></span></td>
          <td class="gx-score-cell">${score == null ? '<span class="gx-dim">—</span>' : `<b class="gx-score ${scoreTone(score)}">${score}</b><i>分</i>`}</td>
          <td class="num">${r.correct != null ? `${r.correct}／${r.total}` : '—'}</td>
          <td class="num">${r.attempts || 0}</td>
          <td>${fmtBoardTime(r.lastAt)}</td>
          <td><span class="gx-board-state ${state[0]}">${state[1]}</span></td>
        </tr>`;
            })
            .join('');
        return `<div class="amt-board">
      <h3 class="amt-board-title">公開成績板 · ${esc(title)}</h3>
      <div class="gx-board">
      <div class="gx-board-head">
        <div class="gx-stat is-main"><span>已考人數</span><b>${items.length}<i>人</i></b></div>
        <div class="gx-stat is-done"><span>滿分通過</span><b>${passedN}<i>人</i></b></div>
        <div class="gx-stat is-retake"><span>待補考</span><b>${Math.max(0, items.length - passedN)}<i>人</i></b></div>
      </div>
      <div class="gx-board-wrap"><table class="gx-table gx-board-table">
        <thead><tr><th class="num">#</th><th>姓名</th><th class="gx-score-cell">最高成績</th><th class="num">最高答對</th><th class="num">考試次數</th><th>最近交卷</th><th>狀態</th></tr></thead>
        <tbody>${body || '<tr><td colspan="7" class="gx-muted">還沒有人考試，考完會顯示在這裡給大家看。</td></tr>'}</tbody>
      </table></div>
      <p class="gx-muted">全員登入後都看得到姓名與成績；不顯示作答內容與正解。全部答對（100 分）才算通過，沒全對可重考。</p>
      </div></div>`;
    }

    /** 搜尋：跨所有週會比對日期、標題與每張投影片標題（不分大小寫、空白分隔多關鍵字需全部符合） */
    const norm = (t) => String(t || '').toLowerCase();
    function searchHits(q) {
        const words = norm(q).split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const out = [];
        MEETINGS.forEach((m) => m.slides.forEach((t, i) => {
            const hay = norm(`${m.date} ${m.id} ${m.title} ${t}`);
            if (words.every((w) => hay.includes(w))) out.push({ m, i, t });
        }));
        return out;
    }
    function hl(t, q) {
        const words = norm(q).split(/\s+/).filter(Boolean);
        let h = esc(t);
        words.forEach((w) => {
            const ew = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            h = h.replace(new RegExp(`(${ew})(?![^<]*>)`, 'gi'), '<mark>$1</mark>');
        });
        return h;
    }
    function searchBarHtml() {
        return `<form class="amt-search" data-amt-search role="search">
            <input type="search" class="amt-search-input" data-amt-q placeholder="🔍 搜尋週會內容（例：解約、押金、未成年）" value="${esc(view.q)}" aria-label="搜尋行政週會" />
            <button type="submit" class="amt-search-btn">搜尋</button>
            <button type="button" class="amt-search-clear" data-amt="clear"${view.q ? '' : ' hidden'}>清除</button>
        </form>
        <div class="amt-results" data-amt-results>${resultsHtml()}</div>`;
    }
    function resultsHtml() {
        if (!view.q.trim()) return '';
        const hits = searchHits(view.q);
        if (!hits.length) return `<p class="amt-results-empty">找不到「${esc(view.q)}」相關的週會內容。</p>`;
        return `<p class="amt-results-count">找到 <b>${hits.length}</b> 張相關投影片，點一下直接跳到該張：</p>
            <div class="amt-results-list">${hits.map((h) => `<button type="button" class="amt-result" data-amt="hit" data-id="${esc(h.m.id)}" data-i="${h.i}">
                <span class="amt-result-meta">${esc(h.m.date)} · 第 ${h.i + 1} 張</span><span class="amt-result-title">${hl(h.t, view.q)}</span></button>`).join('')}</div>`;
    }
    /** 即時篩選：更新結果清單，並把左側縮圖中不符合的淡化 */
    function applySearch() {
        const root = document.getElementById('admin-meeting-root');
        if (!root) return;
        const box = root.querySelector('[data-amt-results]');
        if (box) box.innerHTML = resultsHtml();
        const clr = root.querySelector('[data-amt="clear"]');
        if (clr) clr.hidden = !view.q;
        const m = meeting();
        const set = new Set(searchHits(view.q).filter((h) => h.m.id === m.id).map((h) => h.i));
        root.querySelectorAll('.amt-thumb').forEach((b, k) => b.classList.toggle('is-dim', !!view.q.trim() && !set.has(k)));
    }

    /** 像 PPT：左邊縮圖、右邊大圖，上一張／下一張、方向鍵翻頁、全螢幕放映 */
    function deckHtml(m) {
        const n = m.slides.length;
        const thumbs = m.slides
            .map((t, i) => `<button type="button" class="amt-thumb${i === view.slide ? ' is-on' : ''}" data-amt="go" data-i="${i}" title="${esc(t)}">
                <i>${i + 1}</i><img src="${img(m, i)}" alt="" loading="lazy" decoding="async" />
            </button>`)
            .join('');
        return `<div class="amt-deck">
            <div class="amt-rail" aria-label="投影片縮圖">${thumbs}</div>
            <div class="amt-stage" data-amt-stage>
                <div class="amt-slide">
                    <img src="${img(m, view.slide)}" alt="${esc(m.slides[view.slide])}" data-amt-img />
                    <button type="button" class="amt-hit amt-hit--prev" data-amt="prev" aria-label="上一張"></button>
                    <button type="button" class="amt-hit amt-hit--next" data-amt="next" aria-label="下一張"></button>
                </div>
                <div class="amt-bar">
                    <button type="button" class="amt-nav" data-amt="prev"${view.slide === 0 ? ' disabled' : ''}>‹ 上一張</button>
                    <span class="amt-count"><b data-amt-no>${view.slide + 1}</b>／${n}<small data-amt-title>${esc(m.slides[view.slide])}</small></span>
                    ${nextBtn(view.slide === n - 1)}
                    <button type="button" class="amt-nav amt-full" data-amt="full" title="全螢幕放映（Esc 離開）">⛶ 全螢幕</button>
                </div>
            </div>
        </div>`;
    }

    function html() {
        const m = meeting();
        if (!m) return '<p class="amt-empty">還沒有週會資料。</p>';
        const picker = MEETINGS.length > 1
            ? `<select class="amt-pick" data-amt="pick">${MEETINGS.map((x) => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${esc(x.date)} ${esc(x.title)}</option>`).join('')}</select>`
            : `<span class="amt-date">${esc(m.date)} ${esc(m.title)}</span>`;
        const n = examCount(m);
        const tabList = [['slides', `📑 週會簡報（${m.slides.length} 張）`]];
        if (n) {
            tabList.push(['exam', `📝 線上小考（${n} 題）`]);
            tabList.push(['board', '🏆 公開成績']);
        }
        const tabs = tabList
            .map(([k, t]) => `<button type="button" class="amt-tab amt-tab--${k}${view.tab === k ? ' is-on' : ''}" data-amt="tab" data-tab="${k}">${t}</button>`)
            .join('');
        let body = '';
        if (view.tab === 'board' && n) {
            body = boardHtml(m.course);
        } else if (view.tab === 'exam' && n) {
            body = `<div class="amt-exam" data-cx-root></div>${boardHtml(m.course)}`;
        } else {
            body = `${searchBarHtml()}${deckHtml(m)}<div class="amt-cta">
                        <p class="amt-tip">用 ← → 方向鍵或點投影片左右兩側翻頁。${n ? '看完簡報後請完成線上小考，全部答對才算通過；成績會公開排在「公開成績」。' : '這份簡報沒有線上小考。'}</p>
                        ${n ? `<div class="amt-cta-row"><button type="button" class="amt-cta-btn" data-amt="tab" data-tab="exam">📝 開始線上小考（${n} 題）→</button><button type="button" class="amt-cta-btn amt-cta-btn--soft" data-amt="tab" data-tab="board">🏆 看公開成績</button></div>` : ''}
                    </div>`;
        }
        return `<div class="amt-head">${picker}<div class="amt-tabs">${tabs}</div></div>${body}`;
    }

    const examCount = (m) => (m?.course ? window.COURSE_EXAM?.[m.course]?.questions?.length || 0 : 0);

    /** 最後一張的「下一張」換成直接去考試（沒有小考的簡報就停用） */
    function nextBtn(last) {
        if (!last) return '<button type="button" class="amt-nav amt-next" data-amt="next">下一張 ›</button>';
        return examCount(meeting())
            ? '<button type="button" class="amt-nav amt-next is-exam" data-amt="tab" data-tab="exam">📝 開始小考 →</button>'
            : '<button type="button" class="amt-nav amt-next" disabled>已是最後一張</button>';
    }

    /** 翻頁只換大圖與縮圖狀態，不重畫整個區塊（避免閃爍、縮圖捲動位置跑掉） */
    function goSlide(i) {
        const m = meeting();
        const root = document.getElementById('admin-meeting-root');
        const next = Math.max(0, Math.min(m.slides.length - 1, i));
        view.slide = next;
        const deck = root?.querySelector('.amt-deck');
        if (!deck) return;
        const pic = deck.querySelector('[data-amt-img]');
        pic.src = img(m, next);
        pic.alt = m.slides[next];
        deck.querySelector('[data-amt-no]').textContent = next + 1;
        deck.querySelector('[data-amt-title]').textContent = m.slides[next];
        deck.querySelectorAll('[data-amt="prev"]').forEach((b) => { b.disabled = next === 0; });
        deck.querySelectorAll('.amt-hit--next').forEach((b) => { b.disabled = next === m.slides.length - 1; });
        deck.querySelector('.amt-next')?.replaceWith(Object.assign(document.createElement('template'), { innerHTML: nextBtn(next === m.slides.length - 1) }).content);
        deck.querySelectorAll('.amt-thumb').forEach((b, k) => b.classList.toggle('is-on', k === next));
        const on = deck.querySelector('.amt-thumb.is-on');
        const rail = deck.querySelector('.amt-rail');
        if (on && rail) {
            const top = on.offsetTop - rail.offsetTop;
            const left = on.offsetLeft - rail.offsetLeft;
            if (top < rail.scrollTop || top + on.offsetHeight > rail.scrollTop + rail.clientHeight) rail.scrollTop = top - rail.clientHeight / 2 + on.offsetHeight / 2;
            if (left < rail.scrollLeft || left + on.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = left - rail.clientWidth / 2 + on.offsetWidth / 2;
        }
        if (next + 1 < m.slides.length) new Image().src = img(m, next + 1);
    }

    function toggleFull() {
        const stage = document.querySelector('#admin-meeting-root [data-amt-stage]');
        if (!stage) return;
        if (document.fullscreenElement) document.exitFullscreen?.();
        else stage.requestFullscreen?.().catch(() => {});
    }

    function refreshBoardOnly() {
        const root = document.getElementById('admin-meeting-root');
        const m = meeting();
        if (!root || !m?.course) return;
        const next = boardHtml(m.course);
        const boxes = root.querySelectorAll('.amt-board');
        if (!boxes.length) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = next;
        const fresh = tmp.firstElementChild;
        if (!fresh) return;
        boxes.forEach((box) => box.replaceWith(fresh.cloneNode(true)));
    }

    function render() {
        const root = document.getElementById('admin-meeting-root');
        if (!root) return;
        if (view.tab === 'board' && !examCount(meeting())) view.tab = 'slides';
        root.innerHTML = html();
        if (view.tab === 'slides') applySearch();
        if (view.tab === 'exam') {
            const el = root.querySelector('[data-cx-root]');
            if (window.CourseExam?.has(meeting().course)) window.CourseExam.mount({ course: meeting().course, self: true, root: el });
            else if (el) el.innerHTML = '<p class="amt-empty">小考題目準備中。</p>';
        }
        if ((view.tab === 'exam' || view.tab === 'board') && meeting().course && window.CourseExam?.loadOverview) {
            window.CourseExam.loadOverview(true);
        }
    }

    function onClick(e) {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        const act = b.dataset.amt;
        const m = meeting();
        if (act === 'tab') {
            if (view.tab === 'exam' && b.dataset.tab !== 'exam' && window.CourseExam?.inExam() && !confirm('考試還在進行中（作答會保留、計時不會停），確定要先離開考試畫面嗎？')) return;
            view.tab = b.dataset.tab;
            render();
        } else if (act === 'go') goSlide(+b.dataset.i);
        else if (act === 'prev') goSlide(view.slide - 1);
        else if (act === 'next') goSlide(view.slide + 1);
        else if (act === 'full') toggleFull();
        else if (act === 'clear') {
            view.q = '';
            const inp = document.querySelector('#admin-meeting-root [data-amt-q]');
            if (inp) { inp.value = ''; inp.focus(); }
            applySearch();
        } else if (act === 'hit') {
            if (b.dataset.id !== view.id) { view.id = b.dataset.id; view.slide = +b.dataset.i; render(); }
            else goSlide(+b.dataset.i);
        } else return;
        if (m && act !== 'tab') e.preventDefault();
    }

    /** 方向鍵翻頁：週會區塊展開、在看簡報、而且不是在輸入框打字時才有效 */
    function onKey(e) {
        const fold = document.getElementById('admin-meeting-zone');
        const page = document.getElementById('page-administration');
        if (view.tab !== 'slides' || !fold?.open || page?.classList.contains('hidden')) return;
        if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
        const n = meeting().slides.length;
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') goSlide(view.slide - 1);
        else if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && document.fullscreenElement)) goSlide(view.slide + 1);
        else if (e.key === 'Home') goSlide(0);
        else if (e.key === 'End') goSlide(n - 1);
        else return;
        e.preventDefault();
    }

    function start() {
        const root = document.getElementById('admin-meeting-root');
        if (!root) return;
        root.addEventListener('click', onClick);
        root.addEventListener('change', (e) => {
            if (e.target.matches('[data-amt="pick"]')) {
                view.id = e.target.value;
                view.slide = 0;
                if (!examCount(meeting())) view.tab = 'slides';
                render();
            }
        });
        root.addEventListener('input', (e) => {
            if (e.target.matches('[data-amt-q]')) { view.q = e.target.value; applySearch(); }
        });
        root.addEventListener('submit', (e) => {
            if (!e.target.matches('[data-amt-search]')) return;
            e.preventDefault();
            view.q = e.target.querySelector('[data-amt-q]').value;
            applySearch();
            const first = root.querySelector('.amt-result');
            if (first) first.click();
        });
        document.addEventListener('keydown', onKey);
        const fold = document.getElementById('admin-meeting-zone');
        fold?.addEventListener('toggle', () => {
            if (fold.open) render();
        });
        if (window.CourseExam?.onChange) {
            window.CourseExam.onChange(() => {
                if (view.tab === 'exam' || view.tab === 'board') refreshBoardOnly();
            });
        }
        render();
    }

    window.AdminMeeting = { MEETINGS };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
