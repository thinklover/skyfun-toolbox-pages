/**
 * 首頁功能搜尋：同義詞、多關鍵字、結果高亮、熱門捷徑、鍵盤導覽
 */
(function () {
    'use strict';

    let homeSearchActiveIndex = -1;
    let homeSearchDebounceTimer = null;
    let homeSearchLastMatches = [];
    let homeSearchLastQuery = '';

    const HOME_SEARCH_POPULAR = [
        { page: 'rent', title: '租金水準試算器', category: '業務專區', keywords: '租金 評定 待租' },
        { page: 'newbie-quest', title: '業績任務板', category: '新人專區', keywords: '業績 打卡 任務' },
        { page: 'business-deposit-refund', title: '轉租解約退還金額試算', category: '催收解約專區', keywords: '押金 退還' },
        { page: 'practice-templates', title: '訊息範本產生器', category: '催收解約專區', keywords: '催收 line 催繳' },
        { page: 'collection-case', title: '聲請狀產生器', category: '催收解約專區', keywords: '強制執行 聲請狀 訴狀 欠租 查封 動產 公證 pdf 產生器' },
        { page: 'enforcement-flow', title: '強制執行流程', category: '催收解約專區', keywords: '強制執行 流程 案例 存證 查封 範例' },
        { page: 'lal-generator', title: '存證信函產生器', category: '催收解約專區', keywords: '存證 信函' },
        { file: './docs/lal-howto/', title: '如何寄存證信函', category: '催收解約專區', keywords: '存證 怎麼寄 回執 催告' },
        { page: 'calculator', title: '房東稅務試算表', category: '房東專區', keywords: '稅務 試算' },
        { page: 'business-notary-fee', title: '租賃公證費試算', category: '業務專區', keywords: '公證 費用' },
        { page: 'rentmanager-crossarea-bonus', title: '租賃管理部獎金辦法', category: '租管師專區', keywords: '獎金 kpi' },
    ];

    const SEARCH_SYNONYMS = {
        試算器: ['計算器', '試算', '工具'],
        計算器: ['試算器', '試算'],
        任務板: ['業績', '打卡', '任務', '新人任務'],
        業績: ['任務板', '打卡', 'kpi', '點數'],
        打卡: ['任務板', '業績'],
        租補: ['租金補貼', '300億', 'pip'],
        租金補貼: ['租補', '300億'],
        公證: ['公證費', '119'],
        公證費: ['公證'],
        催收: ['欠租', '催繳', '遲繳'],
        存證: ['存證信函', '信函'],
        存證信函: ['存證', 'lal'],
        押金: ['退還', '解約'],
        退還: ['押金', '解約'],
        解約: ['退租', '終止', '催收'],
        續約: ['轉包租', '包租', 'line'],
        評定: ['租金水準', '待租', '社宅'],
        待租: ['評定', '擬定月租'],
        信任租: ['徵信', '黑名單'],
        稅: ['稅務', '所得', '試算'],
        稅務: ['稅', '試算', '綜所稅'],
        實價: ['實價登錄', 'lvr'],
        時價: ['實價登錄', '實價'],
    };

    function normalizeSearchText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
            .replace(/\s+/g, '')
            .replace(/[／/·、，,。.：:;；\-—_()（）【】\[\]]/g, '');
    }

    function tokenizeSearchQuery(query) {
        const raw = (query || '').trim();
        if (!raw) return [];
        const norm = normalizeSearchText(raw);
        const parts = raw
            .split(/[\s,，、；;|]+/)
            .map((s) => normalizeSearchText(s))
            .filter((s) => s.length >= 1);
        const tokens = new Set([norm]);
        parts.forEach((p) => tokens.add(p));
        return [...tokens].filter(Boolean);
    }

    function searchQueryVariants(token) {
        const q = normalizeSearchText(token);
        if (!q) return [];
        const variants = new Set([q]);
        if (q.includes('試算器')) variants.add(q.replace(/試算器/g, '計算器'));
        if (q.includes('計算器')) variants.add(q.replace(/計算器/g, '試算器'));
        const syns = SEARCH_SYNONYMS[q];
        if (syns) syns.forEach((s) => variants.add(normalizeSearchText(s)));
        for (const [key, list] of Object.entries(SEARCH_SYNONYMS)) {
            const nk = normalizeSearchText(key);
            if (q.includes(nk) || nk.includes(q)) {
                variants.add(nk);
                list.forEach((s) => variants.add(normalizeSearchText(s)));
            }
        }
        return [...variants];
    }

    function getSiteSearchCatalog() {
        const base = window.SITE_SEARCH_INDEX || [];
        const files = window.SITE_FILE_SEARCH_INDEX || [];
        return base.concat(files);
    }

    function scoreSearchItemForQuery(item, q) {
        if (!q) return 0;
        const title = normalizeSearchText(item.title);
        const category = normalizeSearchText(item.category);
        const keywords = normalizeSearchText(item.keywords);
        const fileName = item.file
            ? normalizeSearchText(item.file.split('/').pop().replace(/\.[^.]+$/, ''))
            : '';
        const blob = title + category + keywords + fileName;

        if (title === q) return 200;
        if (title.startsWith(q)) return 155;
        if (title.includes(q)) return 125;
        if (category.includes(q)) return 108;
        if (keywords.includes(q) || blob.includes(q)) return 95;

        const chars = Array.from(q);
        let pos = 0;
        let ordered = 0;
        for (const ch of chars) {
            const idx = blob.indexOf(ch, pos);
            if (idx >= 0) {
                ordered++;
                pos = idx + 1;
            }
        }
        const orderedRatio = ordered / chars.length;
        const minOrdered = chars.length <= 2 ? 0.75 : 0.85;
        if (orderedRatio >= minOrdered) return 55 + Math.round(orderedRatio * 35);

        let any = 0;
        for (const ch of chars) {
            if (blob.includes(ch)) any++;
        }
        const anyRatio = any / chars.length;
        const minAny = chars.length <= 2 ? 0.55 : 0.65;
        if (anyRatio >= minAny) return 22 + Math.round(anyRatio * 28);

        return 0;
    }

    function scoreSearchItem(item, query) {
        const tokens = tokenizeSearchQuery(query);
        if (!tokens.length) return 0;
        let total = 0;
        let minScore = Infinity;
        for (const token of tokens) {
            const s = Math.max(
                0,
                ...searchQueryVariants(token).map((q) => scoreSearchItemForQuery(item, q))
            );
            if (tokens.length > 1 && s === 0) return 0;
            total += s;
            minScore = Math.min(minScore, s);
        }
        const bonus = tokens.length > 1 ? Math.round(minScore * 0.25) : 0;
        return total + bonus;
    }

    function searchSiteFeatures(query) {
        const q = (query || '').trim();
        if (!q) return [];
        return getSiteSearchCatalog()
            .map((item) => ({ item, score: scoreSearchItem(item, q) }))
            .filter((row) => row.score > 0)
            .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'zh-Hant'))
            .slice(0, 15)
            .map((row) => row.item);
    }

    function openRentmgrItem(itemNum) {
        const page = document.getElementById('page-rentmanager');
        if (!page || !itemNum) return;
        const summary =
            page.querySelector('[data-rentmgr-item="' + itemNum + '"]') ||
            (function () {
                const prefix = itemNum + '.';
                for (const s of page.querySelectorAll('summary')) {
                    if (s.textContent.trim().startsWith(prefix)) return s;
                }
                return null;
            })();
        if (!summary) return;
        const details = summary.closest('details');
        if (!details) return;
        const major = details.closest('.rentmgr-major-details');
        if (major) major.open = true;
        details.open = true;
    }

    function searchItemFromButton(btn) {
        if (!btn) return null;
        const external = btn.getAttribute('data-search-external');
        if (external) return { external };
        const file = btn.getAttribute('data-search-file');
        if (file) return { file };
        const page = btn.getAttribute('data-search-page');
        if (!page) return null;
        const rentmgr = btn.getAttribute('data-search-rentmgr');
        return {
            page,
            rentmgrItem: rentmgr ? Number(rentmgr) : undefined,
        };
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeRegExp(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function highlightSearchText(text, query) {
        const safe = escapeHtml(text);
        const tokens = tokenizeSearchQuery(query)
            .filter((t) => t.length >= 1)
            .sort((a, b) => b.length - a.length);
        if (!tokens.length) return safe;
        let out = safe;
        for (const token of tokens) {
            if (token.length < 1) continue;
            const re = new RegExp('(' + escapeRegExp(token) + ')', 'gi');
            out = out.replace(re, '<mark class="home-search-mark">$1</mark>');
        }
        return out;
    }

    function renderHomeSearchResults(items, query, options) {
        const results = document.getElementById('home-search-results');
        const input = document.getElementById('home-search-input');
        if (!results || !input) return;

        const opts = options || {};
        homeSearchLastMatches = items;
        homeSearchLastQuery = query || '';

        if (!items.length) {
            const hint = query
                ? '找不到「' + escapeHtml(query) + '」，試試：'
                : '熱門搜尋：';
            const chips = (query ? ['獎金', '押金', '公證', '催收', '稅務', '任務板', '評定'] : []).map(
                (w) =>
                    '<button type="button" class="home-search-chip" data-suggest="' +
                    escapeHtml(w) +
                    '">' +
                    escapeHtml(w) +
                    '</button>'
            );
            results.innerHTML =
                '<div class="home-search-empty">' +
                hint +
                (chips.length ? '<span class="home-search-chips">' + chips.join('') + '</span>' : '獎金、押金、公證、催收、稅務、任務板') +
                '</div>';
            results.classList.remove('hidden');
            return;
        }

        const countHtml = opts.popularMode
            ? '<div class="home-search-count">熱門功能 · 點選開啟</div>'
            : '<div class="home-search-count">找到 ' +
              items.length +
              ' 項' +
              (items.length >= 15 ? '（顯示前 15 筆）' : '') +
              '</div>';

        results.innerHTML =
            countHtml +
            items
                .map((item, idx) => {
                    const externalMark = item.external || item.file ? ' ↗' : '';
                    const pageAttr = item.page
                        ? ' data-search-page="' + escapeHtml(item.page) + '"'
                        : '';
                    const externalAttr = item.external
                        ? ' data-search-external="' + escapeHtml(item.external) + '"'
                        : '';
                    const fileAttr = item.file
                        ? ' data-search-file="' + escapeHtml(item.file) + '"'
                        : '';
                    const rentmgrAttr = item.rentmgrItem
                        ? ' data-search-rentmgr="' + item.rentmgrItem + '"'
                        : '';
                    const titleHtml = highlightSearchText(item.title, query);
                    const catHtml = highlightSearchText(item.category, query);
                    return (
                        '<button type="button" class="home-search-item' +
                        (idx === homeSearchActiveIndex ? ' is-active' : '') +
                        '" data-index="' +
                        idx +
                        '"' +
                        pageAttr +
                        externalAttr +
                        fileAttr +
                        rentmgrAttr +
                        ' role="option">' +
                        '<div class="home-search-item-title">' +
                        titleHtml +
                        externalMark +
                        '</div>' +
                        '<div class="home-search-item-meta">' +
                        catHtml +
                        '</div>' +
                        '</button>'
                    );
                })
                .join('');

        results.classList.remove('hidden');
    }

    function navigateSearchResult(item) {
        if (!item) return;

        const input = document.getElementById('home-search-input');
        const results = document.getElementById('home-search-results');
        if (input) input.value = '';
        results?.classList.add('hidden');
        homeSearchActiveIndex = -1;
        homeSearchLastMatches = [];
        homeSearchLastQuery = '';

        if (item.external) {
            const url = item.external.match(/^https?:\/\//i)
                ? item.external
                : new URL(item.external, document.baseURI).href;
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        if (item.file) {
            window.open(new URL(item.file, document.baseURI).href, '_blank', 'noopener,noreferrer');
            return;
        }
        if (!item.page) return;

        showPage(item.page);

        if (item.rentmgrItem) {
            setTimeout(() => {
                openRentmgrItem(item.rentmgrItem);
                scrollToActivePage();
            }, 120);
        }
    }

    function initHomeSearch() {
        const input = document.getElementById('home-search-input');
        const results = document.getElementById('home-search-results');
        const wrap = document.getElementById('home-search-wrap');
        if (!input || !results) return;
        if (input.dataset.searchInited === '1') return;
        input.dataset.searchInited = '1';

        if (wrap && !wrap.dataset.searchBound) {
            wrap.dataset.searchBound = '1';
            wrap.addEventListener('click', (e) => {
                const chip = e.target.closest('[data-suggest]');
                if (chip) {
                    e.preventDefault();
                    input.value = chip.getAttribute('data-suggest') || '';
                    homeSearchActiveIndex = -1;
                    renderHomeSearchResults(searchSiteFeatures(input.value), input.value);
                    input.focus();
                    return;
                }
                const btn = e.target.closest('[data-search-page], [data-search-external], [data-search-file]');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const item = searchItemFromButton(btn);
                if (item) navigateSearchResult(item);
            });
        }

        const runSearch = () => {
            const q = input.value.trim();
            homeSearchActiveIndex = -1;
            if (!q) {
                results.classList.add('hidden');
                results.innerHTML = '';
                homeSearchLastMatches = [];
                return;
            }
            renderHomeSearchResults(searchSiteFeatures(q), q);
        };

        const showPopular = () => {
            homeSearchActiveIndex = -1;
            renderHomeSearchResults(HOME_SEARCH_POPULAR, '', { popularMode: true });
        };

        input.addEventListener('input', () => {
            clearTimeout(homeSearchDebounceTimer);
            homeSearchDebounceTimer = setTimeout(runSearch, 100);
        });

        input.addEventListener('focus', () => {
            if (input.value.trim()) runSearch();
            else showPopular();
        });

        input.addEventListener('keydown', (e) => {
            const matched = homeSearchLastMatches;
            if (!matched.length && e.key !== 'Escape') return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                homeSearchActiveIndex = Math.min(homeSearchActiveIndex + 1, matched.length - 1);
                renderHomeSearchResults(matched, homeSearchLastQuery || input.value.trim());
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                homeSearchActiveIndex = Math.max(homeSearchActiveIndex - 1, 0);
                renderHomeSearchResults(matched, homeSearchLastQuery || input.value.trim());
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const pick =
                    homeSearchActiveIndex >= 0
                        ? matched[homeSearchActiveIndex]
                        : matched[0];
                if (pick) navigateSearchResult(pick);
            } else if (e.key === 'Escape') {
                results.classList.add('hidden');
                homeSearchActiveIndex = -1;
                input.blur();
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.home-search')) {
                results.classList.add('hidden');
                homeSearchActiveIndex = -1;
            }
        });
    }

    window.initHomeSearch = initHomeSearch;
    window.searchSiteFeatures = searchSiteFeatures;
    window.openRentmgrItem = openRentmgrItem;
})();
