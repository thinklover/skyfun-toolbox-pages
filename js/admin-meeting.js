/**
 * 行政專區 › 行政週會：每次週會的簡報＋線上小考（小考沿用 CourseExam，題庫在 admin-meeting-exam-data.js，答案只在 Supabase）
 * 新增一次週會：MEETINGS 最前面加一筆，簡報圖放 assets/meetings/<id>/01.jpg…，題目用 包租代管題庫/meeting-exam-export.mjs 產生
 */
(function () {
    const MEETINGS = [
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
        const tabs = [['slides', `📑 週會簡報（${m.slides.length} 張）`], ['exam', '📝 線上小考（20 題）']]
            .map(([k, t]) => `<button type="button" class="amt-tab amt-tab--${k}${view.tab === k ? ' is-on' : ''}" data-amt="tab" data-tab="${k}">${t}</button>`)
            .join('');
        return `<div class="amt-head">${picker}<div class="amt-tabs">${tabs}</div></div>
            ${view.tab === 'slides'
                ? `${searchBarHtml()}${deckHtml(m)}<div class="amt-cta">
                        <p class="amt-tip">用 ← → 方向鍵或點投影片左右兩側翻頁。看完簡報後請完成線上小考，全部答對才算通過。</p>
                        <button type="button" class="amt-cta-btn" data-amt="tab" data-tab="exam">📝 開始線上小考（20 題）→</button>
                    </div>`
                : `<div class="amt-exam" data-cx-root></div>`}`;
    }

    /** 最後一張的「下一張」換成直接去考試 */
    function nextBtn(last) {
        return last
            ? '<button type="button" class="amt-nav amt-next is-exam" data-amt="tab" data-tab="exam">📝 開始小考 →</button>'
            : '<button type="button" class="amt-nav amt-next" data-amt="next">下一張 ›</button>';
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

    function render() {
        const root = document.getElementById('admin-meeting-root');
        if (!root) return;
        root.innerHTML = html();
        if (view.tab === 'slides') applySearch();
        if (view.tab === 'exam') {
            const el = root.querySelector('[data-cx-root]');
            if (window.CourseExam?.has(meeting().course)) window.CourseExam.mount({ course: meeting().course, self: true, root: el });
            else el.innerHTML = '<p class="amt-empty">小考題目準備中。</p>';
        }
    }

    function onClick(e) {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        const act = b.dataset.amt;
        const m = meeting();
        if (act === 'tab') {
            if (view.tab === 'exam' && b.dataset.tab !== 'exam' && window.CourseExam?.inExam() && !confirm('考試還在進行中（作答會保留、計時不會停），確定要先去看簡報嗎？')) return;
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
            document.querySelector('#admin-meeting-root [data-amt-stage]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        render();
    }

    window.AdminMeeting = { MEETINGS };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
