/**
 * 新人專區 — 業務／租管師分線：路線圖、詞典、快篩、速查、常見錯誤
 */
(function () {
    'use strict';

    function $(id) {
        return document.getElementById(id);
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 切換分頁／展開教材時避免瀏覽器自動往下捲 */
    function preserveScrollAround(fn) {
        const y = window.scrollY;
        fn();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (Math.abs(window.scrollY - y) > 2) {
                    window.scrollTo({ top: y, left: 0, behavior: 'auto' });
                }
            });
        });
    }

    function initNbDisclosureScrollLock() {
        document.addEventListener('toggle', (e) => {
            const det = e.target;
            if (!(det instanceof HTMLDetailsElement)) return;
            if (!det.closest('[id^="page-newbie"]')) return;
            const y = window.scrollY;
            requestAnimationFrame(() => {
                window.scrollTo({ top: y, left: 0, behavior: 'auto' });
            });
        }, true);
    }

    function navBtn(label, page, rentmgrItemOrOpts) {
        let rentmgrItem = null;
        let section = null;
        let reading = null;
        if (typeof rentmgrItemOrOpts === 'object' && rentmgrItemOrOpts !== null) {
            rentmgrItem = rentmgrItemOrOpts.rentmgrItem ?? null;
            section = rentmgrItemOrOpts.section || null;
            reading = rentmgrItemOrOpts.reading || null;
        } else if (rentmgrItemOrOpts != null) {
            rentmgrItem = rentmgrItemOrOpts;
        }
        const rm = rentmgrItem != null ? ` data-rentmgr-item="${rentmgrItem}"` : '';
        const sec = section ? ` data-nb-section="${escapeHtml(section)}"` : '';
        const rd = reading ? ` data-nb-reading-target="${escapeHtml(reading)}"` : '';
        return `<button type="button" class="rmfg-link-btn nb-nav-btn" data-page="${escapeHtml(page)}"${rm}${sec}${rd}>${escapeHtml(label)}</button>`;
    }

    function activateNbSection(pageId, section) {
        if (!section) return;
        const pageEl = document.getElementById(pageId);
        if (!pageEl) return;
        const tab = pageEl.querySelector(`[data-nb-section="${section}"]`);
        tab?.click();
    }

    function openNbReading(pageId, readingKey) {
        if (!readingKey) return;
        const pageEl = document.getElementById(pageId);
        if (!pageEl) return;
        const details = pageEl.querySelector(`details[data-nb-reading="${readingKey}"]`);
        if (details) {
            details.open = true;
            details.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function runNavButtonAction(btn) {
        const page = btn.getAttribute('data-page');
        const rm = btn.getAttribute('data-rentmgr-item');
        const section = btn.getAttribute('data-nb-section') || btn.getAttribute('data-section');
        const reading = btn.getAttribute('data-nb-reading-target');
        if (rm && typeof window.openRentmgrItem === 'function') {
            window.openRentmgrItem(parseInt(rm, 10));
        }
        if (page && typeof window.showPage === 'function') window.showPage(page);
        if (section && page) {
            setTimeout(() => activateNbSection(`page-${page}`, section), 80);
        }
        if (reading && page) {
            setTimeout(() => openNbReading(`page-${page}`, reading), section ? 160 : 100);
        }
    }

    function bindNavButtons(root) {
        if (!root) return;
        root.querySelectorAll('.nb-nav-btn').forEach((btn) => {
            if (btn.dataset.nbNavBound === '1') return;
            btn.dataset.nbNavBound = '1';
            btn.addEventListener('click', () => runNavButtonAction(btn));
        });
    }

    function stepReadingSlots(step) {
        const keys = step.readings || [];
        if (!keys.length) return '';
        return `<div class="nb-step-readings">${keys.map((k) =>
            `<div data-nb-reading-slot="${escapeHtml(k)}"></div>`
        ).join('')}</div>`;
    }

    function renderSteps(steps) {
        return steps.map((s, i) => {
            const items = (s.items || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
            let meta = '';
            if (s.nav) meta = `<p class="rmfg-step-ref">${s.nav}</p>`;
            const readings = stepReadingSlots(s);
            return `<li class="rmfg-step">
                <div class="rmfg-step-head">
                    <span class="rmfg-step-num">${i + 1}</span>
                    <span class="rmfg-step-phase">${escapeHtml(s.phase)}</span>
                </div>
                <div class="rmfg-step-body">
                    <div class="rmfg-step-title">${escapeHtml(s.title)}</div>
                    <ul class="rmfg-step-items">${items}</ul>
                    ${meta}
                    ${readings}
                </div>
            </li>`;
        }).join('');
    }

    const PHOTO_CHECK_STORAGE_KEY = 'nb-photo-checks-v1';

    function loadPhotoChecks() {
        try {
            return JSON.parse(localStorage.getItem(PHOTO_CHECK_STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function savePhotoChecks(state) {
        try {
            localStorage.setItem(PHOTO_CHECK_STORAGE_KEY, JSON.stringify(state));
        } catch { /* ignore quota */ }
    }

    function setPhotoCheckVisual(cb, checked) {
        cb.checked = !!checked;
        cb.closest('.nb-photo-check')?.classList.toggle('is-done', !!checked);
    }

    function isVisiblePhotoCheck(cb) {
        const li = cb.closest('li');
        if (li && (li.hidden || li.classList.contains('hidden'))) return false;
        const sec = cb.closest('[data-nb-heater-section]');
        if (sec && (sec.hidden || sec.classList.contains('hidden'))) return false;
        const skipHost = cb.closest('[data-nb-photo-skip-region]');
        if (skipHost && (skipHost.hidden || skipHost.classList.contains('hidden'))) return false;
        return true;
    }

    function updatePhotoProgress(panel) {
        if (!panel) return;
        const boxes = [...panel.querySelectorAll('[data-nb-photo-id]')].filter(isVisiblePhotoCheck);
        const done = boxes.filter((cb) => cb.checked).length;
        const total = boxes.length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const label = panel.querySelector('[data-nb-photo-progress-label]');
        const fill = panel.querySelector('[data-nb-photo-progress-fill]');
        if (label) label.textContent = `已完成 ${done} / ${total}`;
        if (fill) fill.style.width = `${pct}%`;
    }

    function syncPhotoChecklist(panel) {
        if (!panel) return;
        const state = loadPhotoChecks();
        panel.querySelectorAll('[data-nb-photo-id]').forEach((cb) => {
            const id = cb.getAttribute('data-nb-photo-id');
            setPhotoCheckVisual(cb, !!state[id]);
        });
        updatePhotoProgress(panel);
    }

    function syncPhotoChecklists(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-nb-photo-checklist]').forEach(syncPhotoChecklist);
    }

    function clearAllPhotoChecks() {
        savePhotoChecks({});
        document.querySelectorAll('[data-nb-photo-id]').forEach((cb) => setPhotoCheckVisual(cb, false));
        document.querySelectorAll('[data-nb-photo-checklist]').forEach(updatePhotoProgress);
    }

    function initPhotoChecklistEvents() {
        window.__nbUpdatePhotoProgress = updatePhotoProgress;
        document.addEventListener('change', (e) => {
            const cb = e.target;
            if (!cb.matches?.('[data-nb-photo-id]')) return;
            const id = cb.getAttribute('data-nb-photo-id');
            const state = loadPhotoChecks();
            if (cb.checked) state[id] = true;
            else delete state[id];
            savePhotoChecks(state);
            document.querySelectorAll(`[data-nb-photo-id="${id}"]`).forEach((el) => setPhotoCheckVisual(el, cb.checked));
            document.querySelectorAll('[data-nb-photo-checklist]').forEach(updatePhotoProgress);
        });

        document.addEventListener('click', (e) => {
            const btn = e.target.closest?.('[data-nb-photo-clear]');
            if (!btn) return;
            e.preventDefault();
            clearAllPhotoChecks();
        });
    }

    function fillReadingSlots(root) {
        const lib = $('nb-readings-library');
        if (!lib || !root) return;
        root.querySelectorAll('[data-nb-reading-slot]').forEach((slot) => {
            const key = slot.getAttribute('data-nb-reading-slot');
            slot.innerHTML = '';
            const src = lib.querySelector(`[data-nb-reading="${key}"]`);
            if (src) slot.appendChild(src.cloneNode(true));
        });
        syncPhotoChecklists(root);
        if (typeof window.initPhotoGuidePreview === 'function') window.initPhotoGuidePreview(root);
    }

    function fillTrainingCatalog(containerId, role) {
        const el = $(containerId);
        const lib = $('nb-readings-library');
        if (!el || !lib) return;
        el.innerHTML = '';
        const items = TRAINING_CATALOG.filter((c) => c.roles.includes(role));
        if (!items.length) {
            el.innerHTML = '<p class="text-sm text-slate-500">尚無教材項目。</p>';
            return;
        }
        items.forEach((item) => {
            const src = lib.querySelector(`[data-nb-reading="${item.key}"]`);
            if (!src) return;
            const clone = src.cloneNode(true);
            clone.removeAttribute('id');
            el.appendChild(clone);
        });
        syncPhotoChecklists(el);
    }

    function fillHubTrainingCatalog(containerId) {
        const el = $(containerId);
        const lib = $('nb-readings-library');
        if (!el || !lib) return;
        el.innerHTML = '';
        TRAINING_CATALOG.forEach((item) => {
            const src = lib.querySelector(`[data-nb-reading="${item.key}"]`);
            if (!src) return;
            const wrap = document.createElement('div');
            wrap.className = 'nb-training-hub-item';
            const badge = item.roles.length === 2
                ? '<span class="nb-training-badge nb-training-badge--both">業務 · 租管</span>'
                : item.roles[0] === 'business'
                    ? '<span class="nb-training-badge nb-training-badge--biz">業務</span>'
                    : '<span class="nb-training-badge nb-training-badge--rm">租管</span>';
            const clone = src.cloneNode(true);
            clone.removeAttribute('id');
            const summary = clone.querySelector('summary');
            if (summary && !summary.querySelector('.nb-training-badge')) {
                const span = document.createElement('span');
                span.className = 'nb-training-badge-wrap';
                span.innerHTML = badge;
                summary.insertBefore(span, summary.lastElementChild);
            }
            wrap.appendChild(clone);
            el.appendChild(wrap);
        });
        syncPhotoChecklists(el);
    }

    const ROADMAPS = {
        business_sales: { alias: 'business_pipeline' },
        business_field: { alias: 'business_pipeline' },
        business_pipeline: {
            badge: '業務',
            badgeClass: 'rmfg-badge--amber',
            title: '業務完整流程',
            summary: '開發 → 場勘委租上架 → 帶看 → 房客確認 → 信任租與證明查核 → 回報房東 → 收定金 → 收雙方資料 → 拍物件照 → 合約送審。請依序執行，勿跳步。',
            steps: [
                {
                    phase: '①',
                    title: '開發房東',
                    items: [
                        '電話／LINE／591 開發；確認房東本人、出租意願與服務區域',
                        '話術：社宅補助、修繕、信任租與代管責任，勿只談佣金',
                        '電話階段先問：新青安、重購退稅、他業者社宅、用途與門牌（資格快篩）',
                        '約場勘見面；用任務板打卡 KPI（以當期考核為準）'
                    ],
                    readings: ['reject', 'invite', 'listing-591', 'landlord'],
                    nav: navBtn('→ 業務開發心法', 'newbie-playbook') + ' · ' + navBtn('→ 進件資格快篩', 'newbie-business', { section: 'screen' })
                },
                {
                    phase: '②',
                    title: '場勘、簽委租、上架廣告',
                    items: [
                        '現場場勘：坪數、管理費、車位、寵物、設備、消防、熱水器／偵煙器；填寫屋況及租屋安全檢核表',
                        '簽委租、收鑰匙（或約定帶看方式），場勘表完整填寫；簽約租金須符合市場租金上限',
                        '系統建案；591 刊登（須有營業員證照），租金與媒合頁面條件先對齊',
                        '591 上架照≠送審五期照，兩套規格都要會'
                    ],
                    readings: ['site']
                },
                {
                    phase: '③',
                    title: '帶看',
                    items: [
                        '依約帶看；確認房客承租意願與可配合的租期、租金',
                        '租補／300 億方向先釐清，勿混用表單（與社宅制度不同）',
                        '帶看紀錄寫進系統或群組，方便後續回報房東'
                    ],
                    readings: ['tenant-view'],
                    nav:
                        navBtn('→ 房客承租條件', 'tenant-criteria') +
                        ' · ' +
                        navBtn('→ 房客承租資格試算', 'tenant-eligibility')
                },
                {
                    phase: '④',
                    title: '房客確認要租',
                    items: [
                        '房客口頭或書面確認承租；鎖定人選後再跑後續徵信',
                        '尚未確認前勿收定金、勿跟房東保證「一定租出去」',
                        '若房客猶豫，可備選人選但勿同時對多人收定金'
                    ],
                    nav: navBtn('→ 房客專區', 'tenant')
                },
                {
                    phase: '⑤',
                    title: '調查房客：信任租、工作證明、繳租證明',
                    items: [
                        '跑信任租；人工核對 BLL、監理站罰單、拒往被查、東吳評等（D/E/F 不能包租）等（截圖留底）',
                        '工作證明：在職、收入與職業是否與申報一致',
                        '繳租證明／財力：近況能否負擔租金（依公司 SOP）',
                        '任一項有疑慮：問主管；未通過不得進入回報房東'
                    ],
                    readings: ['trust-rent', 'tenant-she', 'tenant-300']
                },
                {
                    phase: '⑥',
                    title: '確認沒問題，跟房東回報',
                    items: [
                        '整理房客摘要：身分、職業、信任租結果、預計租期與租金',
                        '主動回報房東；說明為何推薦此人選、有無需注意事項',
                        '房東有疑問先解答，勿催促簽約或收定金'
                    ]
                },
                {
                    phase: '⑦',
                    title: '房東沒問題',
                    items: [
                        '取得房東同意該房客承租（口頭或訊息留底）',
                        '房東仍猶豫：可安排三方溝通，勿代房東決定',
                        '房東不同意：換房客或重新媒合，勿硬進件'
                    ]
                },
                {
                    phase: '⑧',
                    title: '收定金',
                    items: [
                        '房東同意後才收定金；金額、用途、退還條件依公司規定',
                        '開立收據或依 SOP 留存匯款證明',
                        '定金≠送審資料齊全，後續仍要收齊雙方文件'
                    ]
                },
                {
                    phase: '⑨',
                    title: '跟房東、房客收資料',
                    items: [
                        '房東：最新身分證、最新一期房屋稅單、所有權人存摺、手機號碼、通訊地址',
                        '房客：最新身分證、存摺、一個月內戶籍謄本（記事不可省略）、手機號碼、通訊地址',
                        '媒合頁面租金、條件須與未來合約一致；缺件清單追蹤寫進系統'
                    ],
                    readings: ['docs-checklist'],
                    nav: navBtn('→ 雙方須提供資料', 'newbie-business', { section: 'roadmap', reading: 'docs-checklist' })
                },
                {
                    phase: '⑩',
                    title: '去現場拍物件照',
                    items: [
                        '依五期／5.0 送審規格到現場拍攝（非 591 上架照）',
                        '門牌、衛浴、消防、設備缺一不可；分租確認獨立門牌',
                        '用站內拍照清單逐張勾選，避免送審被退'
                    ],
                    readings: ['photos'],
                    nav: navBtn('→ 路線圖本步教材', 'newbie-business')
                },
                {
                    phase: '⑪',
                    title: '合約送審',
                    items: [
                        '資料與照片齊全再送審；補件期限寫進行事曆',
                        '簽約當日：金額、附約、印章、媒合頁面與合約一致',
                        '送審通過後建群、官方 LINE 等依 SOP 交租管師維運'
                    ],
                    nav: navBtn('→ 公證費試算', 'business-notary-fee')
                }
            ]
        },
        rentmgr_new: {
            badge: '租管師',
            badgeClass: 'rmfg-badge--rose',
            title: '新案接手與日常維運',
            summary: '送審後的日常維運：系統、LINE、修繕與房東房客溝通。適合新接手或業務轉租管的人。',
            steps: [
                {
                    phase: '衝刺',
                    title: '維運 KPI 先抓重點',
                    items: [
                        '每日：催收電話、續約聯繫有紀錄才算數（用任務板打卡）',
                        '送審／補件逾期直接影響考核——到期日寫進行事曆',
                        '房客租補：續約空窗過長可能斷補，到期前 2 個月起跑',
                        '包租／轉租／代租責任不同，接案第一天先對合約型態'
                    ],
                    readings: ['subsidy-plan'],
                    nav: navBtn('→ 業績任務板', 'newbie-quest') + ' · ' + navBtn('→ 租管師專區', 'rentmanager')
                },
                {
                    phase: '收租',
                    title: '租金入帳與催收起點',
                    items: [
                        '虛擬帳號前碼依區域＋身分證；文案勿寫錯',
                        'D+1～3 友善提醒 → D+7 電訪 → D+14 存證門檻',
                        '期程用試算表對日期，訊息用範本產生器'
                    ],
                    nav: navBtn('→ 催收期程', 'practice-timeline') + ' · ' + navBtn('訊息範本', 'practice-templates')
                },
                {
                    phase: '修繕',
                    title: '修繕與客訴',
                    items: [
                        '先區分：房東設備／房客使用／自然耗損',
                        '重大修繕拍照、估價、必要時報主管',
                        '回覆房東房客要有時間點，避免已讀不回'
                    ],
                    nav: navBtn('→ 租管師範本', 'rentmanager', 5)
                },
                {
                    phase: '稅務',
                    title: '房東問稅與補助',
                    items: [
                        '課稅明細、公證補助、租賃型態影響稅負',
                        '不確定不亂答，引導試算或主管',
                        '300 億與社宅租補流程不同，勿混用'
                    ],
                    readings: ['tenant-she', 'tenant-300', 'subsidy-plan'],
                    nav: navBtn('→ 房東稅務試算', 'calculator')
                },
                {
                    phase: '工具',
                    title: '常用租管師工具',
                    items: [
                        '存證信函產生器、會議表單、獎金辦法',
                        '包租領款收據、轉包租條件',
                        '爭議一律問主管＋查最新簽呈'
                    ],
                    nav: navBtn('→ 官方 LINE 範本', 'rentmanager', 6)
                }
            ]
        },
        rentmgr_renew: {
            badge: '租管師',
            badgeClass: 'rmfg-badge--amber',
            title: '續約專區（到期前必跑）',
            summary: '到期前 2～3 個月啟動；換房客、漲租、轉包租流程不同。KPI：到期前 30 天完成續約。',
            steps: [
                {
                    phase: '啟動',
                    title: '確認續約意願',
                    items: [
                        '分別問房東、房客是否續租',
                        '房客有租補：注意續約空窗是否影響補助',
                        '房東要漲租：先談再收資料'
                    ],
                    readings: ['tenant-she', 'tenant-300', 'subsidy-plan'],
                    nav: navBtn('→ 續約決策問答', 'rentmanager', 5)
                },
                {
                    phase: '情境',
                    title: '判斷屬於哪一種續約',
                    items: [
                        '原房客續租、換房客、漲租、轉包租 — 資料與照片不同',
                        '漲租須租金評定；金額與媒合頁面、合約一致',
                        '轉包租：專用 LINE、領款收據、KPI 另計'
                    ],
                    nav: navBtn('→ 續約決策產生步驟', 'rentmanager', 5)
                },
                {
                    phase: '資料',
                    title: '續約收資料',
                    items: [
                        '房東最新課稅明細、存摺、身分證',
                        '換房客：重跑信任租與五期照片',
                        '續約轉包租：對照轉包租清單'
                    ],
                    readings: ['docs-checklist', 'photos'],
                    nav: navBtn('→ 收資料範本', 'rentmanager', 5)
                },
                {
                    phase: 'LINE',
                    title: '官方 LINE 與通知',
                    items: [
                        '續約、轉包租有固定文字範本，勿自己發明',
                        '通知房東房客簽約日、匯款帳號、新租金',
                        '完成後更新系統到期日'
                    ],
                    nav: navBtn('→ 官方 LINE', 'rentmanager', 6)
                },
                {
                    phase: '風險',
                    title: '常見踩雷',
                    items: [
                        '到期才處理 → 租補斷、房客搬走空窗',
                        '漲租未評定、合約金額與系統不符',
                        '續約照片漏拍消防或門牌'
                    ],
                    nav: navBtn('→ 租管師專線：常見錯誤', 'newbie-rentmgr')
                }
            ]
        },
        rentmgr_collect: {
            badge: '租管師',
            badgeClass: 'rmfg-badge--sky',
            title: '催收與解約',
            summary: '欠租催收至解約結案。依 SOP 階段執行，勿跳步驟或口頭威脅。',
            steps: [
                {
                    phase: 'D+1',
                    title: '友善提醒',
                    items: [
                        'LINE／簡訊提醒匯款，附虛擬帳號',
                        '確認是否匯錯帳、帳號前碼是否正確',
                        '記錄聯繫時間於系統或表單'
                    ],
                    nav: navBtn('→ 訊息範本', 'practice-templates')
                },
                {
                    phase: 'D+7',
                    title: '電訪與書面',
                    items: [
                        '電話確認原因：經濟、爭議、忘記匯款',
                        '必要時寄催告或存證前文件（依主管）',
                        '包租／轉租催收對象可能不同'
                    ],
                    nav: navBtn('→ 催收期程試算', 'practice-timeline')
                },
                {
                    phase: 'D+14+',
                    title: '存證與法務門檻',
                    items: [
                        '達門檻用存證信函產生器',
                        '勿私自到場破門、扣留物品',
                        '解約、點交、押金結算依合約與主管指示'
                    ],
                    nav: navBtn('→ 存證信函', 'lal-generator')
                },
                {
                    phase: '解約',
                    title: '終止租約與點交',
                    items: [
                        '通知房東、房客終止日與搬遷',
                        '點交拍照、修繕費用爭議留證',
                        '系統結案、鑰匙歸還'
                    ],
                    nav: navBtn('→ 租管師專區', 'rentmanager')
                }
            ]
        },
        sales: { alias: 'business_pipeline' },
        field: { alias: 'business_pipeline' },
        ops: { alias: 'rentmgr_renew' }
    };

    function resolveRoadmap(role) {
        const data = ROADMAPS[role];
        if (!data) return null;
        if (data.alias) return ROADMAPS[data.alias];
        return data;
    }

    const GLOSSARY = [
        {
            term: '第三至五期計畫',
            roles: ['business', 'rentmgr'],
            plain: '全名「社會住宅包租代管第三期至第五期計畫執行要點」（住都字第1140030759號，114/8/27）。第三、四、五期可併行執行；補助分「服務費用」（開發費、包管費、媒合費、代管費等）與「代收代付費用」（修繕獎勵費、公證費、保險、代墊租金等，詳附表）。',
            when: '跟房東說明計畫、查補助與送審標準'
        },
        { term: '社會住宅', roles: ['business', 'rentmgr'], plain: '含「直接興辦社宅」與「包租代管」等政策；本專區業務多指租屋服務事業受委任之包租／代租代管，勿與一般民間代管混淆。', when: '跟房東解釋「為什麼要加入」時' },
        { term: '包租案', roles: ['business', 'rentmgr'], plain: '租屋服務事業與房東簽「包租契約」，再與房客簽「轉租契約」並代管；公司先承租再轉租，對房東負承租義務。', when: '談合約型態、續約轉包租、區分案件類型' },
        { term: '代租案', roles: ['business', 'rentmgr'], plain: '租屋服務事業媒合房東與房客簽「租賃契約」並代管；房東仍是出租人，法律關係與包租案不同。', when: '看合約、解釋責任歸屬' },
        { term: '包租', roles: ['business', 'rentmgr'], plain: '口語常指包租案；正式文件用「包租契約＋轉租契約」。星鴻向房東承租後再轉租，收租與代管責任較完整。', when: '跟房東溝通時（避免只說「轉租」）' },
        { term: '轉租／代租', roles: ['business', 'rentmgr'], plain: '轉租＝包租案公司再租給房客；代租＝代租案公司只媒合管理、房東仍是出租人。兩種案件補助與公證規定不同。', when: '看合約、解釋責任歸屬' },
        { term: '次承租人', roles: ['business', 'rentmgr'], plain: '包租案中，向租屋服務事業承租並實際居住的人（簽轉租契約）。代租案則稱「承租人」。', when: '簽約、租金補助、信任租' },
        { term: '委租／委託', roles: ['business'], plain: '房東授權公司招租，通常要簽委租書，實務上常搭配收鑰匙。', when: '場勘當天、還沒簽約前' },
        { term: '信任租', roles: ['business', 'rentmgr'], plain: '對房客做徵信篩選；通過才建議進件。開發時可當「我們會挑房客」的賣點。', when: '開發房東、房客媒合後' },
        { term: 'BLL 黑名單', roles: ['business', 'rentmgr'], plain: '徵信報告欄位；命中通常不可信任租通過。', when: '核對信任租報告' },
        { term: '監理站罰單', roles: ['business', 'rentmgr'], plain: '信任租條件之一：不可線上繳款之罰單超過 3 筆常不通過。', when: '人工核對徵信' },
        { term: '租補／租金補貼', roles: ['business', 'rentmgr'], plain: '房客向政府申請租金補助；續約若中斷可能影響補助，所以要提前處理。', when: '談續約、換約時程' },
        { term: '300 億／中央擴大租金補貼', roles: ['business', 'rentmgr'], plain: '內政部「300 億元中央擴大租金補貼」專案，與社宅包租代管為不同制度；2026 年起新申請加強租賃標的合法性查核。勿與社宅表單混用。', when: '房客問補助、填表' },
        { term: '包租代管 5.0', roles: ['business', 'rentmgr'], plain: '口語指第五期或整體推廣名稱；正式依據為「第三至五期執行要點」。第五期租期可簽 1～3 年，弱勢戶另有換居、待租補助等。', when: '跟房東說明、對照公司 SOP' },
        {
            term: '公證',
            roles: ['business', 'rentmgr'],
            plain: '包租契約：雙方可協議是否辦理，且不補助公證費。轉租契約：應辦理公證。代租租賃契約：雙方協議；載明不辦理視同放棄補助。代收代付補助：雙北每屋三年最高 1.35 萬元，其他縣市 9 千元（實際以附表四、每期上限為準）。',
            when: '簽約前、估公證費、申請補助'
        },
        { term: '虛擬帳號', roles: ['rentmgr'], plain: '房客匯租金用；前碼依區域＋身分證字號組成，催收文案會用到。', when: '催收、訊息範本' },
        { term: '五期／5.0 照片', roles: ['business', 'rentmgr'], plain: '送審用物件／消防／設備照片規格（與 591 上架照不同）。依當期計畫、SOP 與審查表單。', when: '收資料、續約拍照' },
        {
            term: '市場租金上限',
            roles: ['business', 'rentmgr'],
            plain: '簽約租金不得超過執行要點第八點上限：台北 3.9 萬；新北／桃園／台中／新竹 3.5 萬；台南／高雄 2.9 萬；其他縣市 2.2 萬（元／月）。',
            when: '場勘估租、送審、漲租前評定'
        },
        { term: '新青安', roles: ['business'], plain: '青年安心成家貸款；有此貸款之房屋通常不可加入社宅。', when: '資格快篩、場勘' },
        { term: '重購退稅', roles: ['business'], plain: '出售舊屋重購退稅；5 年內常不得加入社宅。', when: '資格快篩' },
        { term: '營業用稅率', roles: ['business'], plain: '房屋稅按營業用課稅；商業用途物件須先變更或排除才能進件。', when: '物件在商業區、房東說有營登' },
        { term: '一戶一門牌', roles: ['business'], plain: '分租套房若無獨立門牌，常不符合進件條件。', when: '資格快篩' },
        { term: '媒合頁面', roles: ['business', 'rentmgr'], plain: '系統上刊登租金、條件供房客媒合的頁面；金額須與合約一致。', when: '收資料、漲租' },
        { term: '租金評定', roles: ['rentmgr'], plain: '調整租金前須依規定評定；漲租續約必做。', when: '續約漲租、房東要加租' },
        { term: '續約轉包租', roles: ['rentmgr'], plain: '續約時改簽包租約；有 KPI 與專用 LINE、領款流程。', when: '到期續約、房東願意包租' },
        { term: '存證信函', roles: ['rentmgr'], plain: '欠租催收到一定階段寄發；有固定範本與時間點。', when: '催收 SOP' },
        { term: '二代健保', roles: ['business', 'rentmgr'], plain: '房東租金收入可能影響；稅務試算表可試算。', when: '房東問稅、試算' },
        { term: '課稅明細', roles: ['rentmgr'], plain: '房東所得稅用；續約常要求提供最新年度。', when: '續約收資料' },
        { term: '特殊身份', roles: ['business', 'rentmgr'], plain: '房客若符合低收入、身心障礙等，須檢附證明；影響承租資格。', when: '收資料、房客專區' },
        { term: '星鴻系統', roles: ['rentmgr'], plain: '公司內部案件管理系統；建案、送審、續約明細都在此。', when: '送審後、每日作業' },
        { term: '開發話術', roles: ['business'], plain: '強調代管責任、信任租、修繕保險與社宅補助，而非只談「幫你找房客」。', when: '電話／LINE 開發' },
        { term: '委任書', roles: ['business', 'rentmgr'], plain: '房東授權公司代辦進件、簽約等事項的文件；與委租書用途不同，依 SOP 使用。', when: '收資料、送審' },
        { term: '拒往被查', roles: ['business', 'rentmgr'], plain: '信任租徵信欄位；次數過高常需主管判斷。', when: '核對信任租' },
        { term: '東吳評等', roles: ['business', 'rentmgr'], plain: '信任租徵信畫面之評等；D、E、F（低於 C）不能包租，C 含以上才可包租。', when: '核對信任租、決定是否包租' },
        { term: '轉包租領款', roles: ['rentmgr'], plain: '續約轉包租後，房東領取相關款項的收據流程；須符合條件與範本。', when: '轉包租續約' },
        { term: '媒合費 55%', roles: ['business'], plain: '業務當月媒合達 5 件以上，媒合費比例可為 55%（例：新北包租 22000×55%=12100／件）；以當期獎金辦法為準。', when: '談薪、算獎金、月底結績' },
        { term: '營業員證照', roles: ['business'], plain: '沒有證照絕對不准上架 591；違規罰款可達 6 萬元以上。', when: '591 刊登前、新人培訓' },
        { term: '新媒合 6p', roles: ['business', 'rentmgr'], plain: '從未進公司系統的物件地址，考核 6 點；再媒合、續約點數不同。', when: '建案、結績、KPI' },
        { term: '結績日', roles: ['business', 'rentmgr'], plain: '約每月 23 日（工作月可能 22 或 24）；當月媒合費次月發放。', when: '月底衝件、獎金試算' },
        { term: '591 上架照', roles: ['business'], plain: '求曝光與空間感，與送審五期／5.0 照片清單不同；兩套都要會。', when: '場勘拍照、刊登前' },
        {
            term: '住宅出租修繕獎勵費',
            roles: ['business', 'rentmgr'],
            plain: '執行要點第六點、附表三：每門牌每年依實際修繕核給，最長三年。第五期上限（三年合計）：包租一般戶 3 萬、弱勢戶 4.5 萬；代租一般戶 2.4 萬、弱勢戶 3 萬；換居戶私換私（包租入住宅）9 萬／（代租）3 萬。換居戶不得再申請一般或弱勢戶修繕獎勵。',
            when: '新案、續約、協助房東申請修繕'
        },
        { term: '修繕補助', roles: ['rentmgr'], plain: '口語即「住宅出租修繕獎勵費」。須主動協助房東依附表三項目申請；未申請致公司損失有獎懲規定。', when: '新案接手、續約' },
        {
            term: '代收代付費用',
            roles: ['business', 'rentmgr'],
            plain: '政府透過租屋服務事業代為申請核撥的項目：修繕獎勵費、租金補助、公證費、居家安全保險（每年最高 3,500 元）、代墊租金（最多 3 個月簽約租金、一次），第五期另有換居搬遷費（最高 1 萬）與租金差額補助。',
            when: '跟房東說明可領補助、送件分類'
        },
        {
            term: '代墊租金',
            roles: ['rentmgr'],
            plain: '房客欠租時，符合執行要點規定者，租屋服務事業可代墊最多三個月「簽約租金」，以一次為限；須先關懷遲繳原因並評估是否符合申請條件。',
            when: '催收、欠租處理'
        },
        {
            term: '轉軌戶',
            roles: ['business', 'rentmgr'],
            plain: '承租人正領「300 億中央擴大租金補貼」，房東申請加入本計畫後，承租人可繼續領租補之案件（租金補貼轉軌案件）。',
            when: '房客已有租補、進件評估'
        },
        {
            term: '換居戶',
            roles: ['business', 'rentmgr'],
            plain: '依執行要點第二十點申請換居者。私換私：自有住宅換租本計畫物件；可另有搬遷費、租金差額補助與較高修繕上限，但不得重複申請一般／弱勢修繕獎勵。',
            when: '第五期換居專案、待租期補助'
        },
        {
            term: '開發費／包管費／媒合費／代管費',
            roles: ['business', 'rentmgr'],
            plain: '租屋服務事業向主管機關申請之「服務費用」：包租簽約後開發費、包租管理期包管費、代租媒合後媒合費、代管期代管費；各期上限與比率見附表二（與公司獎金制度不同）。',
            when: '結績、理解公司收入結構'
        },
        {
            term: '居家安全相關保險',
            roles: ['business', 'rentmgr'],
            plain: '代收代付補助項目；每屋每年最高 3,500 元。代租案可在火險、地震險等範圍內選投保項目（詳執行要點第三十六點）。',
            when: '代租進件、續約'
        }
    ];

    const TRAINING_CATALOG = [
        { key: 'flow-nine', title: '社宅業務流程 9 宮格', roles: ['business', 'rentmgr'] },
        { key: 'company-bonus', title: '星鴻制度：獎金、考核與紅線', roles: ['rentmgr'] },
        { key: 'subsidy-plan', title: '第三至五期：補助、公證與 333 速查', roles: ['rentmgr'] },
        { key: 'docs-checklist', title: '雙方須提供資料', roles: ['business', 'rentmgr'] },
        { key: 'trust-rent', title: '信任租不通過條件篩選', roles: ['business', 'rentmgr'] },
        { key: 'listing-591', title: '591 開發、介面判讀', roles: ['business'] }
    ];

    const QUICK_REF = {
        business: [
            { icon: '🧠', title: '業務開發心法', page: 'newbie-playbook' },
            { icon: '✅', title: '進件資格快篩', page: 'newbie-business', section: 'screen' },
            { icon: '📷', title: '物件照拍攝', page: 'newbie-business', section: 'roadmap', roadmapRole: 'business_pipeline' },
            { icon: '🏠', title: '房客承租條件', page: 'tenant-criteria' },
            { icon: '🧮', title: '承租資格試算', page: 'tenant-eligibility' },
            { icon: '🧮', title: '房東稅務試算', page: 'calculator' },
            { icon: '📜', title: '公證費試算', page: 'business-notary-fee' }
        ],
        rentmgr: [
            { icon: '🔄', title: '續約決策問答', page: 'rentmanager', rentmgr: 5 },
            { icon: '💬', title: '官方 LINE 範本', page: 'rentmanager', rentmgr: 6 },
            { icon: '⏱️', title: '催收期程試算', page: 'practice-timeline' },
            { icon: '📝', title: '訊息範本產生', page: 'practice-templates' },
            { icon: '✉️', title: '存證信函', page: 'lal-generator' }
        ]
    };

    const MISTAKES = {
        business: [
            '只談佣金、不談代管與信任租，房東難建立信任。',
            '未做資格初篩就約簽約，到場才發現新青安或他業者管理中。',
            '場勘未簽委租、未收鑰匙，媒合易被其他業者截走。',
            '沒有營業員證照仍上架 591，違規風險極高。',
            '591 租金與未來合約／媒合頁面不一致，送審被退。',
            '591 上架照當送審照拍，或送審漏門牌／消防。',
            '信任租未過仍硬進件，或沒留徵信截圖。',
            '商業用途沒查營登與房屋稅，送審才爆雷。',
            '協助申請租金補貼時未確認建物合法性（2026 年起新案查核更嚴）。'
        ],
        rentmgr: [
            '到期前兩週才問續約，租補易斷、房客來不及規劃搬遷。',
            '漲租沒做租金評定，或系統金額與合約不同。',
            '未協助房東申請修繕補助，導致公司損失與獎金扣減。',
            '催收跳步驟直接威脅或到場，法律風險高。',
            '續約轉包租沒走專用 LINE／領款流程。',
            '虛擬帳號前碼寫錯，房客匯款不到帳。',
            '送審照片漏門牌或消防，補件拖延 KPI。'
        ]
    };

    const LEGACY_ROADMAP_MAP = {
        sales: 'business_pipeline',
        field: 'business_pipeline',
        ops: 'rentmgr_renew'
    };

    function renderRoadmap(role, outputId) {
        const data = resolveRoadmap(role);
        const out = $(outputId || 'nb-roadmap-output');
        if (!data || !out) return;
        out.innerHTML = `
            <div class="rmfg-result-head">
                <span class="rmfg-badge ${data.badgeClass}">${escapeHtml(data.badge)}</span>
                <h4 class="rmfg-result-title">${escapeHtml(data.title)}</h4>
                <p class="rmfg-result-summary">${escapeHtml(data.summary)}</p>
            </div>
            <ol class="rmfg-steps">${renderSteps(data.steps)}</ol>
            <p class="text-xs text-slate-500 mt-3">每步可展開教材；連結可跳至站內工具。以主管與最新 SOP 為準。</p>`;
        fillReadingSlots(out);
        bindNavButtons(out);
    }

    function initRoadmapPanel(panelId, defaultRole, roleAttr) {
        const panel = $(panelId);
        if (!panel) return;
        const outId = panel.getAttribute('data-output-id') || 'nb-roadmap-output';
        const buttons = panel.querySelectorAll(`[${roleAttr}]`);
        if (!buttons.length) {
            renderRoadmap(defaultRole, outId);
            return;
        }
        let current = defaultRole;
        buttons.forEach((btn) => {
            btn.addEventListener('click', () => {
                preserveScrollAround(() => {
                    current = btn.getAttribute(roleAttr);
                    panel.querySelectorAll(`[${roleAttr}]`).forEach((b) => {
                        b.classList.toggle('is-selected', b === btn);
                    });
                    renderRoadmap(current, outId);
                });
                if (btn.focus) btn.focus({ preventScroll: true });
            });
        });
        renderRoadmap(current, outId);
    }

    function initLegacyRoadmap() {
        const panel = $('nb-roadmap-panel');
        if (!panel) return;
        panel.querySelectorAll('[data-roadmap-role]').forEach((btn) => {
            const legacy = btn.getAttribute('data-roadmap-role');
            if (LEGACY_ROADMAP_MAP[legacy]) {
                btn.setAttribute('data-roadmap-role', LEGACY_ROADMAP_MAP[legacy]);
            }
        });
        initRoadmapPanel('nb-roadmap-panel', 'business_pipeline', 'data-roadmap-role');
    }

    function renderGlossary(filter, listId, roleFilter) {
        const list = $(listId || 'nb-glossary-list');
        if (!list) return;
        const q = (filter || '').trim().toLowerCase();
        const rows = GLOSSARY.filter((g) => {
            if (roleFilter && g.roles && !g.roles.includes(roleFilter)) return false;
            if (!q) return true;
            const hay = [g.term, g.plain, g.when].join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!rows.length) {
            list.innerHTML = '<p class="text-sm text-slate-500 p-4">找不到相關詞彙，試試：包租、信任租、租補、續約</p>';
            return;
        }
        list.innerHTML = rows.map((g) => `
            <article class="nb-glossary-item">
                <h4 class="nb-glossary-term">${escapeHtml(g.term)}</h4>
                <p class="nb-glossary-plain">${escapeHtml(g.plain)}</p>
                <p class="nb-glossary-when"><span class="font-bold text-amber-800">適用時機：</span>${escapeHtml(g.when)}</p>
            </article>`).join('');
    }

    function initGlossary(inputId, listId, roleFilter) {
        const input = $(inputId || 'nb-glossary-search');
        const lid = listId || 'nb-glossary-list';
        if (!input) return;
        input.addEventListener('input', () => renderGlossary(input.value, lid, roleFilter));
        renderGlossary('', lid, roleFilter);
    }

    function createScreeningState() {
        return { scope: null, usage: null, xinqing: null, rebuild: null, joined: null, commercial: null, biztax: null, trust: null };
    }

    const screenStates = {
        main: createScreeningState(),
        business: createScreeningState(),
        rentmgr: createScreeningState()
    };

    function screeningReady(answers) {
        if (!answers.scope) return false;
        if (answers.scope === 'tenant') return answers.trust !== null;
        const objDone = answers.usage !== null && answers.xinqing !== null
            && answers.rebuild !== null && answers.joined !== null
            && answers.commercial !== null
            && (answers.commercial === 'no' || answers.biztax !== null);
        if (answers.scope === 'object') return objDone;
        return objDone && answers.trust !== null;
    }

    function resolveScreening(answers) {
        const issues = [];
        const cautions = [];
        if (answers.scope === 'tenant' || answers.scope === 'both') {
            if (answers.trust === 'fail') issues.push('信任租未通過或徵信命中排除條件，不宜進件。');
            if (answers.trust === 'review') cautions.push('信任租需主管覆核後再進件。');
        }
        if (answers.scope === 'object' || answers.scope === 'both') {
            if (answers.usage === 'no') issues.push('建物主要用途非住宅類，通常不可加入社宅。');
            if (answers.xinqing === 'yes') issues.push('有新青安貸款，通常不可加入。');
            if (answers.rebuild === 'yes') issues.push('重購退稅 5 年管制期內，通常不可加入。');
            if (answers.joined === 'yes') cautions.push('曾加入社宅／他業者管理中，須確認結束日與計畫規定。');
            if (answers.commercial === 'yes') {
                if (answers.biztax === 'yes') issues.push('商業用途且房屋稅為營業用稅率，須先變更或排除。');
                if (answers.biztax === 'unsure') cautions.push('商業用途：請查營登、房屋稅，必要時陪同房東變更使用情形。');
            }
        }
        if (!issues.length && !cautions.length) {
            return { level: 'pass', title: '初步判斷：可朝進件準備', summary: '未命中常見排除項；仍須完成場勘、文件及主管／系統審核。' };
        }
        if (issues.length) {
            return { level: 'fail', title: '初步判斷：建議暫不進件', summary: '請先排除下列項目或洽主管。', issues, cautions };
        }
        return { level: 'caution', title: '初步判斷：需補件或主管確認', summary: '可先備齊資料，下列事項務必處理。', issues, cautions };
    }

    function syncScreenChoices(panel, answers) {
        panel.querySelectorAll('.rd-choice').forEach((btn) => {
            const key = btn.getAttribute('data-sd');
            const val = btn.getAttribute('data-value');
            btn.classList.toggle('is-selected', answers[key] === val);
        });
        const scope = answers.scope;
        const objBlock = panel.querySelector('[data-screen-block="object"]');
        const tenantBlock = panel.querySelector('[data-screen-block="tenant"]');
        if (objBlock) objBlock.classList.toggle('hidden', !scope || scope === 'tenant');
        if (tenantBlock) tenantBlock.classList.toggle('hidden', !scope || scope === 'object');
        const bizQ = panel.querySelector('[data-screen-block="biztax"]');
        if (bizQ) bizQ.classList.toggle('hidden', answers.commercial !== 'yes');
    }

    function renderScreening(panel, answers, outputId, wrapId, copyId, nextNavHtml) {
        const wrap = $(wrapId);
        const out = $(outputId);
        const copyBtn = $(copyId);
        if (!out) return;
        if (!screeningReady(answers)) {
            wrap?.classList.add('is-hidden');
            copyBtn?.classList.add('hidden');
            out.innerHTML = '';
            return;
        }
        const r = resolveScreening(answers);
        const levelClass = r.level === 'pass' ? 'nb-verdict--pass' : r.level === 'fail' ? 'nb-verdict--fail' : 'nb-verdict--caution';
        const list = (arr, title, cls) => {
            if (!arr?.length) return '';
            return `<div class="${cls}"><div class="font-bold mb-1">${title}</div><ul class="list-disc pl-5 space-y-1">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
        };
        const listHtml = list(r.issues, '排除／暫不進件', 'nb-verdict-list') + list(r.cautions, '留意事項', 'nb-verdict-list nb-verdict-list--amber');
        let next = nextNavHtml || '';
        if ((r.level === 'pass' || r.level === 'caution') && !next) {
            next = `<p class="rmfg-step-ref mt-3">${navBtn('→ 業務專線', 'newbie-business')} ${navBtn('→ 租管師專線', 'newbie-rentmgr')}</p>`;
        }
        wrap?.classList.remove('is-hidden');
        copyBtn?.classList.remove('hidden');
        out.innerHTML = `
            <div class="nb-verdict ${levelClass}">
                <h4 class="nb-verdict-title">${escapeHtml(r.title)}</h4>
                <p class="nb-verdict-summary">${escapeHtml(r.summary)}</p>
                ${listHtml}
                ${next}
            </div>
            <p class="text-xs text-slate-500 mt-3">快篩僅供內部自查，非最終進件依據；爭議以主管與機關認定為準。</p>`;
        bindNavButtons(out);
    }

    function onScreenChoice(panel, answers, btn, cfg) {
        const key = btn.getAttribute('data-sd');
        const val = btn.getAttribute('data-value');
        if (!key || val === undefined) return;
        answers[key] = val;
        if (key === 'scope') {
            if (val === 'object') answers.trust = null;
            if (val === 'tenant') {
                ['usage', 'xinqing', 'rebuild', 'joined', 'commercial', 'biztax'].forEach((k) => { answers[k] = null; });
            }
        }
        if (key === 'commercial' && val === 'no') answers.biztax = null;
        syncScreenChoices(panel, answers);
        renderScreening(panel, answers, cfg.outputId, cfg.wrapId, cfg.copyId, cfg.nextNav);
    }

    function initScreeningPanel(panelId, stateKey, cfg) {
        const panel = $(panelId);
        if (!panel) return;
        const answers = screenStates[stateKey];
        panel.querySelectorAll('.rd-choice').forEach((btn) => {
            btn.addEventListener('click', () => onScreenChoice(panel, answers, btn, cfg));
        });
        $(cfg.copyId)?.addEventListener('click', () => {
            if (!screeningReady(answers)) return;
            const r = resolveScreening(answers);
            const lines = [r.title, r.summary, ''];
            (r.issues || []).forEach((x) => lines.push('✗ ' + x));
            (r.cautions || []).forEach((x) => lines.push('△ ' + x));
            navigator.clipboard?.writeText(lines.join('\n'));
        });
        syncScreenChoices(panel, answers);
        renderScreening(panel, answers, cfg.outputId, cfg.wrapId, cfg.copyId, cfg.nextNav);
    }

    function renderQuickRef(role, containerId) {
        const el = $(containerId);
        const items = QUICK_REF[role];
        if (!el || !items) return;
        el.innerHTML = items.map((item) => {
            const rm = item.rentmgr != null ? ` data-rentmgr-item="${item.rentmgr}"` : '';
            const anchor = item.anchor ? ` data-anchor="${item.anchor}"` : '';
            const section = item.section ? ` data-section="${item.section}"` : '';
            const roadmapRole = item.roadmapRole ? ` data-roadmap-role-tab="${item.roadmapRole}"` : '';
            return `<button type="button" class="nb-quick-card nb-nav-btn" data-page="${escapeHtml(item.page)}"${rm}${anchor}${section}${roadmapRole}>
                <span class="nb-quick-icon">${item.icon}</span>
                <span>${escapeHtml(item.title)}</span>
            </button>`;
        }).join('');
        el.querySelectorAll('.nb-nav-btn').forEach((btn) => {
            if (btn.dataset.nbNavBound === '1') return;
            btn.dataset.nbNavBound = '1';
            btn.addEventListener('click', () => {
                const anchor = btn.getAttribute('data-anchor');
                const roadmapRole = btn.getAttribute('data-roadmap-role-tab');
                runNavButtonAction(btn);
                if (roadmapRole) {
                    setTimeout(() => {
                        const page = btn.getAttribute('data-page');
                        const pageEl = document.getElementById(page ? `page-${page}` : '');
                        pageEl?.querySelector(`[data-roadmap-role="${roadmapRole}"]`)?.click();
                    }, 100);
                }
                if (anchor) {
                    setTimeout(() => {
                        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 140);
                }
            });
        });
    }

    function renderMistakes(role, containerId) {
        const el = $(containerId);
        const items = MISTAKES[role];
        if (!el || !items) return;
        el.innerHTML = `<ul class="nb-mistakes-list">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
    }

    function initRolePage(pageId, role, roadmapPanelId, defaultRoadmap, glossaryInputId, glossaryListId, screenPanelId, stateKey, screenCfg) {
        const page = document.getElementById(pageId);
        if (!page) return;

        initRoadmapPanel(roadmapPanelId, defaultRoadmap, 'data-roadmap-role');
        initGlossary(glossaryInputId, glossaryListId, role);
        initScreeningPanel(screenPanelId, stateKey, screenCfg);
        renderQuickRef(role, role === 'business' ? 'nb-business-quick' : 'nb-rentmgr-quick');
        renderMistakes(role, role === 'business' ? 'nb-business-mistakes' : 'nb-rentmgr-mistakes');
        page.querySelectorAll('.nb-pill-nav [data-nb-section]').forEach((tab) => {
            tab.addEventListener('click', () => {
                preserveScrollAround(() => {
                    const section = tab.getAttribute('data-nb-section');
                    page.querySelectorAll('.nb-pill-nav [data-nb-section]').forEach((t) => {
                        t.classList.toggle('is-selected', t === tab);
                        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
                    });
                    page.querySelectorAll('[data-nb-panel]').forEach((p) => {
                        p.classList.toggle('hidden', p.getAttribute('data-nb-panel') !== section);
                    });
                });
                if (tab.focus) tab.focus({ preventScroll: true });
            });
        });
    }

    const QA_SYNONYMS = {
        包租: ['包租案', '轉租'],
        代租: ['代租案', '媒合'],
        修繕: ['修繕獎勵', '修繕補助', '住宅出租修繕獎勵費'],
        公證: ['公證費'],
        租補: ['租金補貼', '300億', '轉軌'],
        轉軌: ['轉軌戶', '租金補貼轉軌'],
        換居: ['換居戶'],
        信任租: ['徵信', 'bll', '黑名單'],
        續約: ['轉包租', '漲租', '租金評定', '到期'],
        五期: ['第三至五期', '5.0', '包租代管'],
        媒合費: ['開發費', '包管費', '代管費'],
        催收: ['欠租', '代墊租金', '存證'],
        解約: ['退租', '終止', '退房', '搬走', '押金退還', '催收解約'],
        欠租: ['催收', '催繳', '遲繳', '解約'],
        進件: ['送件', '送審', '新案', '媒合'],
        場勘: ['現場', '看屋', '帶看', '委租', '收鑰匙', '拍照'],
    };

    /** 開放式流程題：依關鍵字強制帶入 SOP 摘要 */
    const QA_TOPIC_PLAYBOOKS = [
        {
            id: 'field_survey',
            match: ['場勘', '帶看', '看屋', '現場', '委租', '收鑰匙', '場勘表'],
            title: '場勘要注意什麼',
            text:
                '① 出發前：用「進件資格快篩」確認新青安、營登、一戶一門牌、重購退稅等，避免白跑。② 現場：簽委租書、收鑰匙（或約定帶看方式），填場勘表。③ 拍照：門牌、信箱、大門、各空間、衛浴、熱水器與住警器；591 上架照與送審五期照清單不同，兩套都要拍。④ 跟房東談：租金須符合市場租金上限，可先用租金試算；強調信任租、代管與修繕補助等賣點。⑤ 離場：系統建案、備註房東偏好；未簽委租易被其他業者截走。',
            when: '業務約房東現場看屋、第一次場勘時',
            roles: ['business'],
            page: 'newbie-business',
            keywords: '場勘 注意 帶看 委租 鑰匙 拍照 現場',
            relatedPages: ['newbie-screening', 'newbie-business', 'rent', 'newbie-glossary'],
        },
        {
            id: 'termination',
            match: ['解約', '退租', '終止', '退房', '搬走', '押金退', '提前解約'],
            title: '解約／退租怎麼做',
            text:
                '① 先判斷：到期不續、房客主動退租、或欠租拟解約（欠租須先走催收 SOP，勿跳步驟）。② 確認包租或轉租／代租、告知解約日與實際解約日。③ 欠租：用「催收期程試算」對時間軸；必要時「訊息範本」「存證信函」。④ 備齊解約文件（解約／解編碼申請表等，包租件見催收解約專區清單）。⑤ 點交拍照、鑰匙歸還。⑥ 押金／水電／欠租用「包租」或「轉租」解約退還試算（兩頁不同）。⑦ 系統結案；金額以契約、收據及主管為準。',
            when: '房東或房客提出要解約、退租、終止租約時',
            roles: ['business', 'rentmgr'],
            page: 'termination',
            keywords: '解約 退租 終止 怎麼做 如何 流程',
            relatedPages: [
                'termination',
                'practice-timeline',
                'practice-templates',
                'lal-generator',
                'business-deposit-refund',
                'business-bao-deposit-refund',
            ],
        },
        {
            id: 'collection',
            match: ['欠租', '催收', '催繳', '遲繳', '沒繳租', '未繳'],
            title: '欠租催收怎麼做',
            text:
                '① D+1：LINE／簡訊提醒，附虛擬帳號，確認是否匯錯帳。② D+7：電訪了解原因，必要時書面催告（依主管）。③ 達門檻：用「存證信函產生器」；勿私自到場、威脅或扣留物品。④ 持續用「催收期程試算」對日期。⑤ 若拟終止租約，再進入解約、點交與押金結算流程。',
            when: '房客遲繳、欠租時',
            roles: ['business', 'rentmgr'],
            page: 'practice-timeline',
            keywords: '欠租 催收 催繳 怎麼做',
            relatedPages: ['practice-timeline', 'practice-templates', 'lal-generator', 'termination'],
        },
        {
            id: 'renewal',
            match: ['續約', '到期', '轉包租', '漲租'],
            title: '續約／到期怎麼處理',
            text:
                '① 到期前約 1～2 個月主動聯繫房東與房客。② 漲租須先做租金評定，系統與合約金額一致。③ 可評估轉包租（有 KPI 與專用流程）。④ 房客有租補者，注意續約空窗影響補助。⑤ 續約照片、課稅明細等依 SOP 收齊。',
            when: '合約即將到期、房東要加租或改包租時',
            roles: ['business', 'rentmgr'],
            page: 'rentmanager',
            keywords: '續約 到期 轉包租 漲租',
            relatedPages: ['rentmanager', 'rent', 'newbie-glossary'],
        },
        {
            id: 'bao_dai',
            match: ['包租', '代租', '差別', '差異', '不同', '比較', '包租案', '代租案'],
            title: '包租跟代租差在哪',
            text:
                '① 包租案：公司與房東簽包租契約，公司再與房客簽轉租並代管；開發費、包管費、修繕上限與責任結構依包租／轉租區分。② 代租案：媒合房東與房客簽租賃契約，房東仍是出租人；以媒合費、代管費為主。③ 跟房東說明時：代租門檻較低；包租公司承擔較多管理責任。④ 簽約、解約、押金試算頁面在工具箱分「包租／轉租」與「代租」兩套，勿混用。',
            when: '房東問兩種模式、新人釐清案件類型時',
            roles: ['business', 'rentmgr'],
            page: 'newbie-glossary',
            keywords: '包租 代租 差別 差異 比較 包租案 代租案',
            relatedPages: ['newbie-glossary', 'newbie-business', 'rent'],
        },
        {
            id: 'repair_bonus',
            match: ['修繕', '修繕獎勵', '修繕補助', '附表三', '修繕費', '修繕上限'],
            title: '修繕獎勵費怎麼算',
            text:
                '① 依實際修繕核給，每門牌最長三年。② 第五期三年合計上限：包租一般戶3萬、弱勢戶4.5萬；代租一般戶2.4萬、弱勢戶3萬。③ 換居戶私換私另有較高上限，但不得再申請一般或弱勢修繕獎勵。④ 須依送審修繕項目與憑證，以主管與國土署核定為準。',
            when: '房東問修繕補助、續約談修繕時',
            roles: ['business', 'rentmgr'],
            page: 'newbie-glossary',
            keywords: '修繕 修繕獎勵 修繕補助 附表三 上限',
            relatedPages: ['newbie-glossary', 'rentmanager'],
        },
        {
            id: 'notary_fee',
            match: ['公證', '公證費', '驗屋', '契約公證'],
            title: '公證費與要不要辦公證',
            text:
                '① 包租契約：雙方協議，一般不補公證費。② 轉租契約：應辦理公證。③ 代租租賃契約：雙方協議；契約載明不辦理視同放棄補助。④ 代收代付補助：雙北每屋三年最高1.35萬，其他縣市9千元（依附表四及租期）。⑤ 可用工具箱「公證費試算」粗估。',
            when: '簽約前、房東問公證費時',
            roles: ['business', 'rentmgr'],
            page: 'notary-fee',
            keywords: '公證 公證費 轉租 包租契約',
            relatedPages: ['notary-fee', 'newbie-glossary'],
        },
        {
            id: 'newcase',
            match: ['進件', '送件', '送審', '新案', '開發'],
            title: '新案進件怎麼做',
            text:
                '① 業務：資格快篩（新青安、營登、一戶一門牌等）→ 場勘委租 → 信任租 → 591 與送審照。② 租管：收齊文件、星鴻系統建案送審。③ 租金須符合市場租金上限與評定。④ 細節以新人路線圖、雙方須提供資料為準。',
            when: '新物件要加入社宅包租代管時',
            roles: ['business', 'rentmgr'],
            page: 'newbie-screening',
            keywords: '進件 送件 送審 新案 怎麼做',
            relatedPages: ['newbie-screening', 'newbie-business', 'tenant-criteria'],
        },
        {
            id: 'landlord_dev',
            match: ['開發', '電開', '房東', '話術', '591', '刊登', '媒合'],
            title: '開發房東／電開要注意什麼',
            text:
                '① 確認本人出租、區域在服務範圍。② 話術：社宅補助、修繕、信任租、代管責任，勿只談佣金。③ 電話階段可先問新青安、重購退稅、他業者管理、門牌。④ 約見面帶資料比直接約簽約容易。⑤ 被拒絕要記原因，隔週再關心。',
            when: '電話／LINE 開發、陌生開發房東時',
            roles: ['business'],
            page: 'newbie-playbook',
            keywords: '開發 房東 電開 話術 591 媒合',
            relatedPages: ['newbie-playbook', 'newbie-business', 'listing-591'],
        },
        {
            id: 'trust_rent',
            match: ['信任租', '徵信', '房客', '媒合', '帶看'],
            title: '信任租／房客媒合要注意什麼',
            text:
                '① 房客須通過信任租徵信；BLL 命中通常不可進件。② 監理站罰單超過 3 筆常需主管判斷。③ 東吳評等 D、E、F（低於 C）不能包租。④ 特殊身份要檢附證明。⑤ 媒合頁租金須與合約一致。⑥ 通過仍建議留徵信截圖備查。',
            when: '招租、帶看、房客進件前',
            roles: ['business', 'rentmgr'],
            page: 'tenant-criteria',
            keywords: '信任租 徵信 房客 媒合 帶看',
            relatedPages: ['tenant-criteria', 'newbie-glossary'],
        },
    ];

    function isOpenEndedQuestion(qn) {
        if (!qn || qn.length < 4) return false;
        return /怎麼|如何|什麼|該怎|要怎|要注意|注意什麼|怎麼辦|可以嗎|能不能|應該|流程|步驟|嗎$|呢$|想問|不懂|不懂|教我|幫我/.test(qn);
    }

    function scoreQuerySubstringOverlap(qn, hay, maxLen = 6) {
        if (!qn || !hay || qn.length < 2) return 0;
        let score = 0;
        const cap = Math.min(qn.length, 24);
        const q = qn.slice(0, cap);
        for (let len = Math.min(maxLen, q.length); len >= 2; len--) {
            for (let i = 0; i <= q.length - len; i++) {
                const sub = q.slice(i, i + len);
                if (hay.includes(sub)) score += len;
            }
        }
        return Math.min(score, 24);
    }

    function normalizeQaText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
            .replace(/\s+/g, '')
            .replace(/[／/·、，,。.：:;；\-—_()（）【】\[\]]/g, '');
    }

    function qaQueryTokens(query) {
        const raw = (query || '').trim();
        if (!raw) return [];
        const norm = normalizeQaText(raw);
        const parts = raw
            .split(/[\s,，、；;|？?！!]+/)
            .map((s) => normalizeQaText(s))
            .filter((s) => s.length >= 1);
        const tokens = new Set([norm]);
        parts.forEach((p) => tokens.add(p));
        [...tokens].forEach((t) => {
            Object.entries(QA_SYNONYMS).forEach(([key, list]) => {
                const nk = normalizeQaText(key);
                if (t.includes(nk) || nk.includes(t)) {
                    tokens.add(nk);
                    list.forEach((s) => tokens.add(normalizeQaText(s)));
                }
            });
        });
        return [...tokens].filter(Boolean);
    }

    function buildKnowledgeChunks() {
        const chunks = [];
        GLOSSARY.forEach((g) => {
            chunks.push({
                type: 'glossary',
                title: g.term,
                text: g.plain,
                when: g.when,
                roles: g.roles,
                page: 'newbie-glossary',
                keywords: [g.term, g.plain, g.when].join(' ')
            });
        });
        Object.entries(MISTAKES).forEach(([role, list]) => {
            list.forEach((text, i) => {
                chunks.push({
                    type: 'mistake',
                    title: `常見錯誤（${role === 'business' ? '業務' : '租管師'}）`,
                    text,
                    when: '',
                    roles: [role],
                    page: role === 'business' ? 'newbie-business' : 'newbie-rentmgr',
                    keywords: text
                });
            });
        });
        const extra = typeof window !== 'undefined' && window.QA_EXTRA_KNOWLEDGE;
        if (Array.isArray(extra)) {
            extra.forEach((item) => {
                chunks.push({
                    type: 'policy',
                    title: item.title,
                    text: item.text,
                    when: item.when || '',
                    roles: item.roles || ['business', 'rentmgr'],
                    page: item.page || 'newbie-glossary',
                    keywords: item.keywords || [item.title, item.text].join(' '),
                });
            });
        }
        const siteIndex = typeof window !== 'undefined' && window.SITE_SEARCH_INDEX;
        if (Array.isArray(siteIndex)) {
            siteIndex.forEach((item) => {
                if (item.external) return;
                chunks.push({
                    type: 'tool',
                    title: item.title,
                    text: [item.category, item.keywords].filter(Boolean).join(' · '),
                    when: '站內工具',
                    roles: ['business', 'rentmgr'],
                    page: item.page,
                    keywords: [item.title, item.category, item.keywords].join(' '),
                });
            });
        }
        const fileIndex = typeof window !== 'undefined' && window.SITE_FILE_SEARCH_INDEX;
        if (Array.isArray(fileIndex)) {
            fileIndex.forEach((item) => {
                chunks.push({
                    type: 'file',
                    title: item.title,
                    text: `${item.category || ''} ${item.keywords || ''}`.trim(),
                    when: '相關表單／PDF',
                    roles: ['business', 'rentmgr'],
                    page: 'termination',
                    keywords: [item.title, item.category, item.keywords].join(' '),
                });
            });
        }
        Object.entries(ROADMAPS).forEach(([roleKey, roadmap]) => {
            (roadmap.steps || []).forEach((step) => {
                const items = (step.items || []).join(' ');
                chunks.push({
                    type: 'roadmap',
                    title: `${roadmap.title}：${step.title}`,
                    text: items,
                    when: step.phase ? `階段：${step.phase}` : '',
                    roles: roleKey.startsWith('business') ? ['business'] : ['rentmgr'],
                    page: roleKey.startsWith('business') ? 'newbie-business' : 'newbie-rentmgr',
                    keywords: [roadmap.title, roadmap.summary, step.title, items].join(' '),
                });
            });
        });
        return chunks;
    }

    function scorePlaybookMatch(tp, qn, roleFilter) {
        let s = 0;
        tp.match.forEach((k) => {
            const nk = normalizeQaText(k);
            if (qn.includes(nk)) s += nk.length + 5;
        });
        String(tp.keywords || '')
            .split(/\s+/)
            .forEach((kw) => {
                const nk = normalizeQaText(kw);
                if (nk.length >= 2 && qn.includes(nk)) s += nk.length + 2;
            });
        if (roleFilter && tp.roles && tp.roles.includes(roleFilter)) s += 12;
        return s;
    }

    function detectTopicPlaybooks(query, roleFilter) {
        const qn = normalizeQaText(query);
        if (!qn) return [];
        return QA_TOPIC_PLAYBOOKS.map((tp) => ({ tp, s: scorePlaybookMatch(tp, qn, roleFilter) }))
            .filter((x) => x.s >= 5)
            .sort((a, b) => b.s - a.s)
            .map((x) => x.tp);
    }

    function pickFallbackPlaybook(query, roleFilter) {
        const qn = normalizeQaText(query);
        if (!qn) return null;
        let best = null;
        let bestScore = 0;
        QA_TOPIC_PLAYBOOKS.forEach((tp) => {
            const s = scorePlaybookMatch(tp, qn, roleFilter);
            if (s > bestScore) {
                bestScore = s;
                best = tp;
            }
        });
        return bestScore >= 5 ? best : null;
    }

    function playbookToHit(tp, score) {
        return {
            type: 'playbook',
            title: tp.title,
            text: tp.text,
            when: tp.when,
            roles: tp.roles,
            page: tp.page,
            keywords: tp.keywords,
            relatedPages: tp.relatedPages,
            score,
        };
    }

    function getPageTitle(page) {
        const item = (typeof window !== 'undefined' && window.SITE_SEARCH_INDEX || []).find((i) => i.page === page);
        return item ? item.title : page;
    }

    let knowledgeChunksCache = null;

    function getKnowledgeChunks() {
        if (!knowledgeChunksCache) knowledgeChunksCache = buildKnowledgeChunks();
        return knowledgeChunksCache;
    }

    function scoreKnowledgeChunk(chunk, tokens, qn) {
        const hay = normalizeQaText([chunk.title, chunk.text, chunk.when, chunk.keywords].join(' '));
        let score = 0;
        tokens.forEach((tok) => {
            if (!tok || tok.length < 1) return;
            if (hay === tok) score += 12;
            else if (chunk.title && normalizeQaText(chunk.title).includes(tok)) score += 10;
            else if (hay.includes(tok)) score += tok.length >= 3 ? 6 : 3;
            else if (tok.length >= 3 && tok.includes(hay.slice(0, Math.min(hay.length, 20)))) score += 2;
        });
        if (qn) score += scoreQuerySubstringOverlap(qn, hay);
        return score;
    }

    function searchKnowledgeInner(query, roleFilter) {
        const tokens = qaQueryTokens(query);
        const qn = normalizeQaText(query);
        const openEnded = isOpenEndedQuestion(qn);

        const topics = detectTopicPlaybooks(query, roleFilter);
        const topicHits = topics.map((tp, i) => playbookToHit(tp, 96 - i));

        let scored = getKnowledgeChunks()
            .map((c) => {
                let score = scoreKnowledgeChunk(c, tokens, qn);
                if (roleFilter && c.roles && c.roles.includes(roleFilter)) score += 4;
                return { ...c, score };
            })
            .filter((c) => c.score > 0);

        const merged = [...topicHits, ...scored].sort((a, b) => b.score - a.score);
        const seen = new Set();
        const out = [];
        merged.forEach((c) => {
            const key = `${c.type}|${c.title}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push(c);
        });

        const hasPlaybook = out.some((c) => c.type === 'playbook');
        if (!hasPlaybook) {
            const fb = pickFallbackPlaybook(query, roleFilter) || pickFallbackPlaybook(query, null);
            if (fb) out.unshift(playbookToHit(fb, 82));
        }

        if (!out.length && openEnded) {
            const anyFb = pickFallbackPlaybook(query, null);
            if (anyFb) out.push(playbookToHit(anyFb, 45));
        }

        return out.slice(0, 6);
    }

    function searchKnowledge(query, roleFilter) {
        let out = searchKnowledgeInner(query, roleFilter);
        if (!out.length && roleFilter) {
            out = searchKnowledgeInner(query, null);
        }
        return out;
    }

    function shortenForSummary(text, maxLen) {
        const t = String(text || '').trim();
        if (!t) return '';
        if (t.length <= maxLen) return t;
        const first = t.split(/[。；\n]/).map((s) => s.trim()).find((s) => s.length > 0);
        if (first && first.length <= maxLen) return `${first}。`;
        return `${t.slice(0, maxLen)}…`;
    }

    function extractSummaryBullets(text) {
        const t = String(text || '');
        const found = [];
        const patterns = [
            /[^。；]{0,12}?(?:每年|每屋|三年|最長)[^。；]{0,28}/g,
            /[^。；]{0,8}?\d+(?:\.\d+)?萬[^。；]{0,20}/g,
            /[^。；]{0,8}?\d{1,3}(?:,\d{3})*元[^。；]{0,16}/g,
            /不得[^。；]{2,24}/g,
            /應辦理[^。；]{2,20}/g,
            /不補助[^。；]{2,20}/g,
        ];
        patterns.forEach((re) => {
            const m = t.match(re);
            if (m) m.forEach((s) => found.push(s.trim()));
        });
        return [...new Set(found)].slice(0, 4);
    }

    function guessOneLineConclusion(query, hits) {
        const q = normalizeQaText(query);
        const top = hits[0];
        if (!top) return '以下為站內資料整理，供你快速掌握重點。';
        if (q.includes('公證')) return '包租契約通常不補公證費；轉租契約應辦公證，補助有上限。';
        if (q.includes('修繕')) return '修繕獎勵依戶別與包租／代租不同，三年合計有上限，須依實際修繕申請。';
        if (q.includes('包租') && q.includes('代租')) return '包租案公司先承租再轉租；代租案房東仍是出租人，補助與責任不同。';
        if (q.includes('租金') && (q.includes('上限') || q.includes('市場'))) return '簽約租金不得超過執行要點規定的市場租金上限（依縣市）。';
        if (q.includes('轉軌')) return '轉軌戶是房客原領 300 億租補，房東加入計畫後可繼續領租補的案件。';
        if (q.includes('場勘') || q.includes('帶看') || q.includes('看屋') || q.includes('委租')) {
            return '場勘前先快篩資格；現場簽委租、收鑰匙、依 SOP 拍照，租金不超過上限，離場記得系統建案。';
        }
        if (q.includes('解約') || q.includes('退租') || (q.includes('終止') && !q.includes('場勘'))) {
            return '解約要先分清是否欠租：欠租走催收再解約；一般退租則辦文件、點交、押金試算與系統結案。';
        }
        if (q.includes('欠租') || q.includes('催收')) return '欠租依 D+1 提醒 → D+7 電訪 → 達門檻存證；勿跳步驟或私自到場。';
        if (q.includes('續約') || q.includes('到期')) return '續約須提前聯繫、租金評定、必要時轉包租，並注意租補與照片 SOP。';
        if (q.includes('進件') || q.includes('送審')) return '新案先資格快篩與信任租，再收件送審；租金須符合上限與評定。';
        if (q.includes('信任租') || q.includes('徵信')) return '房客須通過信任租徵信；BLL 命中通常不可進件，特殊身份要檢附證明。';
        if (q.includes('開發') || q.includes('電開')) return '開發房東先確認區域與資格，話術講補助與代管價值，約場勘比硬推簽約有效。';
        if (top.type === 'playbook') return shortenForSummary(top.text, 80) || `與「${top.title}」相關，重點如下。`;
        return shortenForSummary(top.text, 72) || `與「${top.title}」相關的重點如下。`;
    }

    function composeLocalAnswer(query, hits) {
        if (!hits.length) {
            const fb = pickFallbackPlaybook(query, null);
            if (fb) {
                hits.push(playbookToHit(fb, 50));
            } else {
                return {
                    text:
                        '【一句話結論】這題站內教材沒有直接對應的條目。\n\n【重點整理】\n• 請改用關鍵字再問，例如：場勘、解約、續約、公證、修繕、信任租、591\n• 或到首頁搜尋、社宅白話詞典查名詞\n• 若已開「啟動雲端API主機」並設 AI 金鑰，開放式問題會回答較完整\n\n【提醒】實際作業以主管與最新 SOP 為準。',
                    links: [
                        { title: '社宅白話詞典', page: 'newbie-glossary' },
                        { title: '進件資格快篩', page: 'newbie-screening' },
                        { title: '新人專區', page: 'newbie' },
                    ],
                };
            }
        }

        const topHits = hits.slice(0, 3);
        const lines = [];
        lines.push(`【一句話結論】${guessOneLineConclusion(query, topHits)}`);
        lines.push('');
        lines.push('【重點整理】');

        topHits.forEach((h) => {
            if (h.type === 'playbook' && h.text.includes('①')) {
                h.text.split(/(?=①|②|③|④|⑤|⑥|⑦)/).filter(Boolean).forEach((step) => {
                    lines.push(`• ${step.trim()}`);
                });
            } else {
                const bullets = extractSummaryBullets(h.text);
                if (bullets.length) {
                    bullets.forEach((b) => lines.push(`• ${h.title}：${shortenForSummary(b, 48)}`));
                } else {
                    lines.push(`• ${h.title}：${shortenForSummary(h.text, 56)}`);
                }
            }
        });

        const whenList = topHits.map((h) => h.when).filter(Boolean);
        if (whenList.length) {
            lines.push('');
            lines.push('【何時用】');
            [...new Set(whenList)].slice(0, 2).forEach((w) => lines.push(`• ${w}`));
        }

        lines.push('');
        lines.push('【提醒】以上為站內教材重點摘要，非完整條文；金額與流程以主管、最新 SOP、執行要點 PDF 與系統為準。');

        const links = [];
        const seen = new Set();
        const addLink = (title, page) => {
            if (!page || seen.has(page)) return;
            seen.add(page);
            links.push({ title, page });
        };
        hits.forEach((h) => {
            if (h.relatedPages) {
                h.relatedPages.forEach((p) => addLink(getPageTitle(p), p));
            } else if (h.page) {
                addLink(h.title, h.page);
            }
        });
        return { text: lines.join('\n'), links };
    }

    window.nbSearchKnowledge = searchKnowledge;
    window.nbComposeLocalAnswer = composeLocalAnswer;
    window.nbRefreshKnowledgeIndex = function () {
        knowledgeChunksCache = null;
    };

    /** Magic / Aceternity：滑鼠聚光；各頁注入 Background Beams */
    function initNbMagicCards() {
        if (document.documentElement.dataset.nbMagicBound) return;
        document.documentElement.dataset.nbMagicBound = '1';
        document.querySelectorAll('[id^="page-newbie"].nb-magic-page').forEach((page) => {
            if (page.querySelector(':scope > .nb-ui-beams')) return;
            const beams = document.createElement('div');
            beams.className = 'nb-ui-beams';
            beams.setAttribute('aria-hidden', 'true');
            beams.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';
            page.insertBefore(beams, page.firstChild);
        });
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.addEventListener('pointermove', (e) => {
            const card = e.target.closest('[data-nb-magic], .nb-mcard, .nb-role-head, .nb-panel');
            if (!card || !card.closest('[id^="page-newbie"]')) return;
            const r = card.getBoundingClientRect();
            if (!r.width || !r.height) return;
            card.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
            card.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
        }, { passive: true });
    }

    function init() {
        initNbDisclosureScrollLock();
        initNbMagicCards();
        initPhotoChecklistEvents();
        initLegacyRoadmap();
        initGlossary('nb-glossary-search', 'nb-glossary-list', null);
        initScreeningPanel('nb-screen-panel', 'main', {
            outputId: 'nb-screen-output',
            wrapId: 'nb-screen-result-wrap',
            copyId: 'nb-screen-copy'
        });

        initRolePage(
            'page-newbie-business',
            'business',
            'nb-business-roadmap-panel',
            'business_pipeline',
            'nb-business-glossary-search',
            'nb-business-glossary-list',
            'nb-business-screen-panel',
            'business',
            {
                outputId: 'nb-business-screen-output',
                wrapId: 'nb-business-screen-result-wrap',
                copyId: 'nb-business-screen-copy',
                nextNav: `<p class="rmfg-step-ref mt-3">${navBtn('→ 開發房東路線', 'newbie-business')} ${navBtn('→ 業務開發心法', 'newbie-playbook')}</p>`
            }
        );

        initRolePage(
            'page-newbie-rentmgr',
            'rentmgr',
            'nb-rentmgr-roadmap-panel',
            'rentmgr_new',
            'nb-rentmgr-glossary-search',
            'nb-rentmgr-glossary-list',
            'nb-rentmgr-screen-panel',
            'rentmgr',
            {
                outputId: 'nb-rentmgr-screen-output',
                wrapId: 'nb-rentmgr-screen-result-wrap',
                copyId: 'nb-rentmgr-screen-copy',
                nextNav: `<p class="rmfg-step-ref mt-3">${navBtn('→ 續約決策問答', 'rentmanager', 5)} ${navBtn('→ 催收期程', 'practice-timeline')}</p>`
            }
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
