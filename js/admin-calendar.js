(function () {
    'use strict';

    const NAS_PATH = ['nas.skyfun.com.tw', '行政', '00.各都公會提供良率成績'];

    const TASKS = [
        {
            id: 'roster', kind: 'roster', day: 5,
            short: '清冊＋證照異動', chip: '清冊繳交', title: '繳交清冊＋證照人員異動', due: '每月 5 號',
            lines: ['繳交清冊。', '同步提供證照人員異動申請，異動更新給公會。']
        },
        {
            id: 'nas', kind: 'nas', day: 15,
            short: '清冊上傳 NAS', chip: '清冊上傳', title: '當月最新清冊上傳 NAS', due: '每月 15 號前',
            lines: ['當月最新清冊上傳 NAS。', '財務每月 15 號後會上 NAS 抓清冊收入資料。'],
            warn: '15 號後如果又修改資料，務必告知「修改內容」及「重新上傳時間」，避免財會入帳金額錯誤。'
        },
        {
            id: 'report', kind: 'report', day: 20,
            short: '業績表／公會意見', chip: '業績表', title: '各都業績統計表＋公會意見', due: '每月 20 號前・務必填寫完整',
            lines: ['各都業績統計表填寫完整。', '公會「案件意見」＆「清冊意見」填寫回傳，用來計算獎金及檢討審件缺失。']
        },
        {
            id: 'yield', kind: 'yield', day: 20,
            short: '良率上傳 NAS', chip: '良率上傳', title: '同業良率執行情形', due: '每月 20 號前',
            lines: ['各區行政向公會窗口取得每月良率統計資料。', '上傳 NAS，依自己的縣市、按月別存放。'],
            path: true
        },
        {
            id: 'bonus', kind: 'bonus', day: 25, end: 28,
            short: '獎金核對', chip: '獎金核對', title: '獎金核對', due: '每月 25～28 號・依婷婷發出通知',
            lines: ['依婷婷通知的日期，下班前完成「核對完畢」的獎金表。', '核對完畢請回報。']
        }
    ];

    const FESTIVALS = [
        ['2026-02-17', '春節'], ['2026-06-19', '端午節'], ['2026-09-25', '中秋節'],
        ['2027-02-06', '春節'], ['2027-06-09', '端午節'], ['2027-09-15', '中秋節'],
        ['2028-01-26', '春節'], ['2028-05-28', '端午節'], ['2028-10-03', '中秋節'],
        ['2029-02-13', '春節'], ['2029-06-16', '端午節'], ['2029-09-22', '中秋節']
    ];
    const GIFT_LEAD_DAYS = 14;
    const GIFT_LINES = [
        '確認各公會送禮名單，接龍回報秘書長、秘書人數。',
        '不收禮的地區回覆「不送禮」。'
    ];
    const GIFT_EXAMPLE = '秘書長1 秘書3';

    const WEEK = '日一二三四五六';
    const DAY_MS = 86400000;
    const MAX_CHIPS = 3;
    const RELOAD_GAP_MS = 20000;
    const REPEAT_TEXT = { none: '不重複', monthly: '每月同一天', yearly: '每年同一天' };

    const $ = (id) => document.getElementById(id);
    const auth = () => window.skyfunAuth;
    const token = () => auth()?.getToken?.() || '';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ymd = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const mkDate = (y, m, d) => new Date(y, m - 1, d);
    const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return mkDate(y, m, d); };
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fromYmd = (n) => mkDate(Math.floor(n / 10000), Math.floor(n / 100) % 100, n % 100);
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);
    const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    const wk = (d) => `週${WEEK[d.getDay()]}`;
    const today = () => { const n = new Date(); return mkDate(n.getFullYear(), n.getMonth() + 1, n.getDate()); };

    const gifts = FESTIVALS.map(([date, name]) => {
        const fest = parse(date);
        return { kind: 'gift', id: `gift-${date}`, name, fest, start: addDays(fest, -GIFT_LEAD_DAYS), end: addDays(fest, -1) };
    });

    /** 公司年度行事曆試算表：國定假日、月會、每月結績流程；同一件事連續幾天合成一筆 */
    const UNIT_KIND = { 行政: 'kadmin', 行政主管: 'kadmin', 業務: 'ksales', 業務主管: 'ksales', 財務主管: 'kfin', 總經理: 'kfin', 全體人員: 'kall' };
    const sheetChip = (task, note) => task || String(note).split(/[-，(（]/)[0].trim().slice(0, 9);
    const sheetHolidays = new Set();
    const sheetItems = (() => {
        const out = [];
        let run = null;
        (window.AdminCalendarSheet?.days || []).forEach(([date, holiday, meeting, task, unit, note, extra]) => {
            const d = parse(date);
            if (holiday) {
                sheetHolidays.add(ymd(d));
                out.push({ kind: 'holiday', id: `h-${date}`, start: d, end: d, short: holiday, chip: holiday, title: holiday, due: '國定假日', lines: [] });
            }
            if (meeting) out.push({ kind: 'meeting', id: `m-${date}`, start: d, end: d, short: '月會', chip: '月會', title: '月會', due: '', lines: [] });
            if (!unit && !note) { run = null; return; }
            const key = [task, unit, note, extra].join('|');
            if (run && run.key === key && daysBetween(run.end, d) === 1) { run.end = d; return; }
            run = {
                key, kind: UNIT_KIND[unit] || 'kfin', id: `s-${date}`, start: d, end: d, unit,
                short: sheetChip(task, note), chip: sheetChip(task, note), title: task || note,
                lines: task ? [note] : [], warn: extra || ''
            };
            out.push(run);
        });
        out.forEach((it) => {
            const when = ymd(it.start) === ymd(it.end) ? `${md(it.start)}（${wk(it.start)}）` : `${md(it.start)}（${wk(it.start)}）～${md(it.end)}（${wk(it.end)}）`;
            it.due = it.unit ? `${it.unit}・${when}` : it.kind === 'holiday' ? `${when} 國定假日` : when;
        });
        return out;
    })();
    const ALERT_SKIP = new Set(['holiday', 'kfin', 'ksales']);

    const state = {
        y: 0, m: 0,
        custom: [],
        overrides: new Map(),
        editor: false,
        loadedAt: 0,
        loadErr: '',
        loading: false,
        req: 0,
        selected: 0,
        open: new Set(),
        editing: null,
        editItem: null,
        viewItems: [],
        busy: false
    };

    const pad2 = (n) => String(n).padStart(2, '0');
    const whenText = (s, e) => ymd(s) === ymd(e) ? `${md(s)}（${wk(s)}）` : `${md(s)}（${wk(s)}）～${md(e)}（${wk(e)}）`;
    const rangeEnd = (it) => (it.kind === 'gift' ? it.fest : it.end);

    /**
     * 簡為倢／邱奕棋／黃怡婷修改過的內建事項。固定任務的 key 是「任務@YYYY-MM」（只改那個月）
     * 或「任務@*」（之後每個月），日期只取「幾號」套到每個月。
     */
    function applyOverride(it, ov) {
        if (!ov) return it;
        if (ov.hidden) return { ...it, hidden: true, ov };
        const d = ov.data || {};
        const out = { ...it, ov, edited: true };
        if (d.title) { out.title = d.title; out.short = d.title; out.chip = d.title; }
        if (Array.isArray(d.lines)) out.lines = d.lines;
        if (typeof d.warn === 'string') out.warn = d.warn;
        if (d.startDate) {
            let s = parse(d.startDate);
            let e = parse(d.endDate || d.startDate);
            if (ov.key.endsWith('@*')) {
                const span = daysBetween(s, e);
                const last = mkDate(it.start.getFullYear(), it.start.getMonth() + 2, 0).getDate();
                s = mkDate(it.start.getFullYear(), it.start.getMonth() + 1, Math.min(s.getDate(), last));
                e = addDays(s, span);
            }
            if (ymd(s) !== ymd(it.start) || ymd(e) !== ymd(it.end)) {
                out.start = s;
                out.end = e;
                if (it.kind === 'gift') out.fest = addDays(e, 1);
                out.due = ov.key.endsWith('@*')
                    ? `每月 ${s.getDate()} 號${ymd(s) === ymd(e) ? '' : `～${e.getDate()} 號`}`
                    : (it.unit ? `${it.unit}・${whenText(s, e)}` : whenText(s, e));
            }
        }
        return out;
    }

    function taskItem(t, y, m) {
        const okey = `${t.id}@${y}-${pad2(m)}`;
        const it = { ...t, id: okey, okey, taskId: t.id, start: mkDate(y, m, t.day), end: mkDate(y, m, t.end || t.day) };
        return applyOverride(it, state.overrides.get(okey) || state.overrides.get(`${t.id}@*`));
    }

    function giftItem(g) {
        return applyOverride({
            ...g, okey: g.id,
            short: `${g.name}送禮名單`, chip: '送禮名單',
            title: `三節送禮名單（${g.name}）`,
            due: `${g.name} ${md(g.fest)}（${wk(g.fest)}）前接龍回報`,
            lines: GIFT_LINES,
            example: GIFT_EXAMPLE
        }, state.overrides.get(g.id));
    }

    function customDue(ev, s, e) {
        const span = daysBetween(s, e);
        const tail = span ? `起連續 ${span + 1} 天` : '';
        if (ev.repeat === 'monthly') return `每月 ${s.getDate()} 號${tail}`;
        if (ev.repeat === 'yearly') return `每年 ${md(s)}${tail}`;
        return span ? `${md(s)}（${wk(s)}）～${md(e)}（${wk(e)}）` : `${md(s)}（${wk(s)}）`;
    }

    function customItems(y, m) {
        const first = mkDate(y, m, 1);
        const last = mkDate(y, m + 1, 0);
        const out = [];
        state.custom.forEach((ev) => {
            const s = parse(ev.startDate);
            const e = parse(ev.endDate || ev.startDate);
            const span = daysBetween(s, e);
            const monthIdx = y * 12 + m;
            const startIdx = s.getFullYear() * 12 + s.getMonth() + 1;
            let start = null;
            if (ev.repeat === 'monthly') {
                if (monthIdx >= startIdx) start = mkDate(y, m, Math.min(s.getDate(), last.getDate()));
            } else if (ev.repeat === 'yearly') {
                if (s.getMonth() + 1 === m && y >= s.getFullYear()) start = mkDate(y, m, Math.min(s.getDate(), last.getDate()));
            } else {
                start = s;
            }
            if (!start) return;
            const end = addDays(start, span);
            if (ymd(end) < ymd(first) || ymd(start) > ymd(last)) return;
            const note = String(ev.note || '').trim();
            out.push({
                kind: 'custom', id: `c-${ev.id}`, raw: ev, start, end,
                short: ev.title, chip: ev.title, title: ev.title,
                due: customDue(ev, s, e),
                note,
                by: [ev.createdByName, ev.team].filter(Boolean).join('・'),
                mine: !!ev.mine
            });
        });
        return out;
    }

    /** 含已隱藏的內建事項（it.hidden），畫面上只有可修改的人在當天清單看得到 */
    function monthItems(y, m) {
        const first = ymd(mkDate(y, m, 1));
        const last = ymd(mkDate(y, m + 1, 0));
        const base = [];
        [-1, 0, 1].forEach((off) => {
            const d = mkDate(y, m + off, 1);
            TASKS.forEach((t) => base.push(taskItem(t, d.getFullYear(), d.getMonth() + 1)));
        });
        gifts.forEach((g) => base.push(giftItem(g)));
        sheetItems.forEach((it) => base.push(applyOverride({ ...it, okey: it.id }, state.overrides.get(it.id))));
        const items = base.filter((it) => ymd(rangeEnd(it)) >= first && ymd(it.start) <= last);
        items.push(...customItems(y, m));
        return items.sort((a, b) => a.start - b.start || a.end - b.end);
    }

    const visible = (items) => items.filter((it) => !it.hidden);
    const covers = (it, key) => key >= ymd(it.start) && key <= ymd(rangeEnd(it));

    function dayEvents(items, date) {
        const key = ymd(date);
        const out = [];
        visible(items).forEach((it) => {
            if (it.kind === 'gift') {
                if (ymd(it.start) === key) out.push({ kind: 'gift', id: it.id, chip: it.chip, label: it.short });
                if (ymd(it.fest) === key && !sheetHolidays.has(key)) out.push({ kind: 'holiday', id: it.id, chip: it.name, label: it.name });
                return;
            }
            if (key >= ymd(it.start) && key <= ymd(it.end)) out.push({ kind: it.kind, id: it.id, chip: it.chip, label: it.short });
        });
        return out;
    }

    function status(it, now) {
        const t = ymd(now);
        if (t > ymd(it.end)) return { cls: 'is-past', text: '已過' };
        if (t >= ymd(it.start)) {
            if (it.kind === 'gift') return { cls: 'is-now', text: `${it.name}前完成` };
            return { cls: 'is-now', text: ymd(it.start) === ymd(it.end) ? '今天' : '進行中' };
        }
        const days = daysBetween(now, it.start);
        return { cls: days <= 3 ? 'is-soon' : '', text: days === 1 ? '明天' : `還有 ${days} 天` };
    }

    function dateBox(it) {
        if (it.kind === 'gift') return `<b>${md(it.fest)}</b><small>${esc(it.name)}</small>`;
        if (ymd(it.start) !== ymd(it.end)) {
            const sameMonth = it.start.getMonth() === it.end.getMonth();
            return sameMonth
                ? `<b>${it.start.getDate()}–${it.end.getDate()}</b><small>號</small>`
                : `<b class="adc-date-sm">${md(it.start)}</b><small>～${md(it.end)}</small>`;
        }
        return `<b>${it.start.getDate()}</b><small>${wk(it.start)}</small>`;
    }

    function itemHtml(it, now) {
        const st = status(it, now);
        let body = '';
        let by = '';
        if (it.kind === 'custom') {
            body = it.note ? `<p class="adc-note">${esc(it.note)}</p>` : '';
            const acts = it.mine
                ? `<span class="adc-acts"><button type="button" class="adc-act" data-edit="${esc(it.raw.id)}">編輯</button>` +
                  `<button type="button" class="adc-act adc-act--del" data-del="${esc(it.raw.id)}">刪除</button></span>`
                : '';
            by = `<div class="adc-by"><span>👤 ${esc(it.by || '同仁')} 新增</span>${acts}</div>`;
        } else {
            const lines = (it.lines || []).map((l) => `<li>${esc(l)}</li>`).join('');
            const warn = it.warn ? `<p class="adc-warn">⚠️ ${esc(it.warn)}</p>` : '';
            const example = it.example ? `<p class="adc-example">填寫範例：<code>${esc(it.example)}</code></p>` : '';
            const path = it.path
                ? `<div class="adc-path"><span class="adc-path-trail">${NAS_PATH.map(esc).join(' <i>›</i> ')} <i>›</i> 自己的縣市 <i>›</i> 月別</span>` +
                  `<button type="button" class="adc-copy" data-copy="${esc(NAS_PATH.join(' > '))}">複製路徑</button></div>`
                : '';
            body = `${lines ? `<ul class="adc-lines">${lines}</ul>` : ''}${warn}${path}${example}`;
            if (state.editor) {
                const k = esc(it.okey);
                const tag = it.hidden ? '🙈 已隱藏，同仁看不到' : it.edited ? `✏️ ${esc(it.ov.by || '')} 修改過` : '';
                const acts = it.hidden
                    ? `<button type="button" class="adc-act" data-breset="${esc(it.ov.key)}">還原</button>`
                    : `<button type="button" class="adc-act" data-bedit="${k}">修改</button>` +
                      `<button type="button" class="adc-act adc-act--del" data-bhide="${k}">隱藏</button>` +
                      (it.edited ? `<button type="button" class="adc-act" data-breset="${esc(it.ov.key)}">還原預設</button>` : '');
                by = `<div class="adc-by"><span>${tag}</span><span class="adc-acts">${acts}</span></div>`;
            }
        }
        const hasMore = !!(body || by);
        const open = hasMore && !state.open.has(`-${it.id}`) ? ' is-open' : '';
        return `<li class="adc-item adc-k-${it.kind} ${st.cls}${open}${hasMore ? ' has-more' : ''}${it.hidden ? ' is-hidden' : ''}" data-id="${esc(it.id)}">` +
            `<div class="adc-item-date">${dateBox(it)}</div>` +
            `<div class="adc-item-main">` +
                `<div class="adc-item-top"${hasMore ? ' data-toggle role="button" tabindex="0"' : ''}><strong class="adc-item-title">${esc(it.title)}</strong><span class="adc-badge">${st.text}</span>${hasMore ? '<span class="adc-caret" aria-hidden="true">▾</span>' : ''}</div>` +
                `<div class="adc-item-due">${esc(it.due)}</div>` +
                (body ? `<div class="adc-item-body">${body}</div>` : '') +
                by +
            `</div></li>`;
    }

    function upcoming(now) {
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const all = [...monthItems(y, m), ...monthItems(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)];
        const seen = new Set();
        return all.filter((it) => {
            if (it.hidden || ymd(it.end) < ymd(now) || ALERT_SKIP.has(it.kind)) return false;
            const key = `${it.id}@${ymd(it.start)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 3);
    }

    function alertHtml(now) {
        const list = upcoming(now);
        if (!list.length) return '';
        const chips = list.map((it) => {
            const st = status(it, now);
            const when = it.kind === 'gift' ? `${md(it.fest)} 前` : (ymd(it.start) === ymd(it.end) ? `${md(it.start)}（${wk(it.start)}）` : `${md(it.start)}–${md(it.end)}`);
            return `<span class="adc-next adc-k-${it.kind} ${st.cls}"><b>${esc(st.text)}</b>${esc(when)} ${esc(it.short)}</span>`;
        }).join('');
        return `<span class="adc-alert-label">🔔 近期</span>${chips}`;
    }

    function gridHtml(y, m, items, now) {
        const first = mkDate(y, m, 1);
        const days = mkDate(y, m + 1, 0).getDate();
        const lead = first.getDay();
        const cells = Math.ceil((lead + days) / 7) * 7;
        const t = ymd(now);
        let html = '';
        for (let i = 0; i < cells; i++) {
            const d = i - lead + 1;
            if (d < 1 || d > days) { html += '<div class="adc-cell is-out"></div>'; continue; }
            const date = mkDate(y, m, d);
            const key = ymd(date);
            const evs = dayEvents(items, date);
            const cls = ['adc-cell'];
            if (key === t) cls.push('is-today');
            else if (key < t) cls.push('is-before');
            if (key === state.selected) cls.push('is-selected');
            if (date.getDay() === 0 || date.getDay() === 6) cls.push('is-weekend');
            if (evs.length) cls.push('has-ev');
            const shown = evs.slice(0, MAX_CHIPS);
            const more = evs.length - shown.length;
            const chips = shown.map((e) => `<span class="adc-chip adc-k-${e.kind}" title="${esc(e.label)}"><span>${esc(e.chip)}</span></span>`).join('') +
                (more > 0 ? `<span class="adc-more">+${more}</span>` : '');
            const ids = [...new Set(evs.map((e) => e.id))].join(' ');
            const label = `${m}/${d}${evs.length ? ' ' + evs.map((e) => e.label).join('、') : ''}`;
            html += `<div class="${cls.join(' ')}" data-date="${key}" data-ids="${esc(ids)}" role="button" tabindex="0" aria-label="${esc(label)}">` +
                `<span class="adc-num">${d}</span><div class="adc-chips">${chips}</div></div>`;
        }
        return html;
    }

    const LEGEND = [
        ['roster', '清冊／證照'], ['nas', '清冊上傳 NAS'], ['report', '業績表／公會意見'], ['yield', '同業良率'], ['bonus', '獎金核對'],
        ['kadmin', '行政結績流程'], ['ksales', '業務結績／核對'], ['kfin', '財務／發薪'], ['meeting', '月會'], ['kall', '全體活動'],
        ['gift', '三節送禮'], ['holiday', '國定假日'], ['custom', '同仁新增']
    ];

    function skeleton(root) {
        root.innerHTML =
            `<div class="adc-head">` +
                `<h3 class="adc-title">📅 行政行事曆</h3>` +
                `<div class="adc-nav">` +
                    `<button type="button" class="adc-nav-btn" data-nav="-1" aria-label="上個月">‹</button>` +
                    `<strong class="adc-month"></strong>` +
                    `<button type="button" class="adc-nav-btn" data-nav="1" aria-label="下個月">›</button>` +
                    `<button type="button" class="adc-nav-today" data-nav="0">回本月</button>` +
                `</div>` +
                `<div class="adc-head-actions">` +
                    `<button type="button" class="adc-add">＋ 新增事項</button>` +
                    `<button type="button" class="adc-ics" title="下載 .ics，加入 Google／iPhone 行事曆，前一天 9:00 提醒">📲 加到手機行事曆</button>` +
                `</div>` +
            `</div>` +
            `<div class="adc-form-slot"></div>` +
            `<div class="adc-alert"></div>` +
            `<div class="adc-body"></div>`;
    }

    function sideNote() {
        if (!token()) return '<span>登入後可看到、新增同仁的事項</span>';
        if (state.loadErr) return `<span class="adc-err">同仁事項載入失敗：${esc(state.loadErr)}</span>`;
        if (state.loading && !state.loadedAt) return '<span>載入同仁事項中…</span>';
        return `<span>點日曆上的日期看當天${state.editor ? '・你可以直接修改' : ''}</span>`;
    }

    /** 沒選過日期（或換了月份）時：本月選今天，其他月份選 1 號 */
    function selectedDay(now) {
        const inView = (key) => Math.floor(key / 100) === state.y * 100 + state.m;
        if (state.selected && inView(state.selected)) return state.selected;
        state.selected = inView(ymd(now)) ? ymd(now) : ymd(mkDate(state.y, state.m, 1));
        return state.selected;
    }

    function dayPanel(items, key, now) {
        const date = fromYmd(key);
        const list = items.filter((it) => covers(it, key) && (!it.hidden || state.editor));
        const count = list.filter((it) => !it.hidden).length;
        const label = ymd(now) === key ? '今天' : '';
        const body = list.length
            ? `<ol class="adc-list">${list.map((it) => itemHtml(it, now)).join('')}</ol>`
            : `<div class="adc-empty"><p>這天沒有事項</p>${token() ? '<button type="button" class="adc-act adc-add">＋ 在這天新增</button>' : ''}</div>`;
        return `<div class="adc-side-title">${md(date)}（${wk(date)}）${label ? `<em class="adc-today-tag">${label}</em>` : ''}` +
            `<span class="adc-side-count">${count ? `${count} 件` : ''}</span>${sideNote()}</div>${body}`;
    }

    function render() {
        const root = $('admin-calendar');
        if (!root) return;
        if (!root.querySelector('.adc-body')) skeleton(root);
        const now = today();
        if (!state.y) { state.y = now.getFullYear(); state.m = now.getMonth() + 1; }
        const items = monthItems(state.y, state.m);
        state.viewItems = items;
        const sel = selectedDay(now);
        const isThisMonth = state.y === now.getFullYear() && state.m === now.getMonth() + 1;
        root.querySelector('.adc-month').textContent = `${state.y} 年 ${state.m} 月`;
        root.querySelector('.adc-nav-today').disabled = isThisMonth;
        root.querySelector('.adc-alert').innerHTML = alertHtml(now);
        root.querySelector('.adc-body').innerHTML =
            `<div class="adc-cal">` +
                `<div class="adc-week">${[...WEEK].map((w) => `<span>${w}</span>`).join('')}</div>` +
                `<div class="adc-grid">${gridHtml(state.y, state.m, items, now)}</div>` +
                `<div class="adc-legend">${LEGEND.map(([k, l]) => `<span class="adc-leg adc-k-${k}"><i></i>${l}</span>`).join('')}</div>` +
            `</div>` +
            `<div class="adc-side">${dayPanel(items, sel, now)}</div>`;
    }

    async function rpc(name, args) {
        if (!auth()?.rpc) throw new Error('尚未登入');
        const res = await auth().rpc(name, args);
        if (!res?.ok) throw new Error(res?.error || '連線失敗');
        return res;
    }

    function loadRange() {
        const now = today();
        const viewFrom = mkDate(state.y, state.m, 1);
        const viewTo = mkDate(state.y, state.m + 1, 0);
        const curFrom = mkDate(now.getFullYear(), now.getMonth() + 1, 1);
        const curTo = mkDate(now.getFullYear(), now.getMonth() + 3, 0);
        const from = addDays(viewFrom < curFrom ? viewFrom : curFrom, -32);
        const to = viewTo > curTo ? viewTo : curTo;
        return { from: iso(from), to: iso(to) };
    }

    async function load() {
        if (!token()) { render(); return; }
        if (!state.y) { const n = today(); state.y = n.getFullYear(); state.m = n.getMonth() + 1; }
        const req = ++state.req;
        state.loading = true;
        const { from, to } = loadRange();
        try {
            const res = await rpc('admin_calendar_list', { p_token: token(), p_from: from, p_to: to });
            if (req !== state.req) return;
            state.custom = Array.isArray(res.items) ? res.items : [];
            state.editor = res.editor === true;
            state.overrides = new Map((Array.isArray(res.overrides) ? res.overrides : []).map((o) => [o.key, o]));
            state.loadErr = '';
            state.loadedAt = Date.now();
        } catch (err) {
            if (req !== state.req) return;
            state.loadErr = err.message || '連線失敗';
        } finally {
            if (req === state.req) state.loading = false;
        }
        render();
    }

    function maybeReload() {
        if (Date.now() - state.loadedAt > RELOAD_GAP_MS) load();
    }

    function formHtml(ev) {
        const v = ev || {};
        return `<form class="adc-form" novalidate>` +
            `<div class="adc-form-title">${ev ? '✏️ 編輯事項' : '＋ 新增事項'}</div>` +
            `<div class="adc-form-grid">` +
                `<label class="adc-f adc-f--wide"><span>標題 <em>*</em></span><input name="title" maxlength="60" required value="${esc(v.title || '')}" placeholder="例如：公會季會、系統維護停機"></label>` +
                `<label class="adc-f"><span>開始日期 <em>*</em></span><input type="date" name="startDate" required value="${esc(v.startDate || '')}"></label>` +
                `<label class="adc-f"><span>結束日期</span><input type="date" name="endDate" value="${esc(v.endDate && v.endDate !== v.startDate ? v.endDate : '')}"><small>只有一天可以不填</small></label>` +
                `<label class="adc-f"><span>重複</span><select name="repeat">${Object.entries(REPEAT_TEXT).map(([k, l]) => `<option value="${k}"${(v.repeat || 'none') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
                `<label class="adc-f adc-f--wide"><span>說明</span><textarea name="note" rows="3" maxlength="1000" placeholder="要做什麼、注意事項、相關連結…">${esc(v.note || '')}</textarea></label>` +
            `</div>` +
            `<p class="adc-form-hint">儲存後所有登入的同仁都看得到；新增的人和簡為倢、邱奕棋、黃怡婷可以修改或刪除。</p>` +
            `<div class="adc-form-actions">` +
                `<button type="submit" class="adc-save">${ev ? '儲存修改' : '新增'}</button>` +
                `<button type="button" class="adc-cancel">取消</button>` +
                `<span class="adc-form-msg" role="status" aria-live="polite"></span>` +
            `</div>` +
        `</form>`;
    }

    function builtinFormHtml(it) {
        const every = it.taskId && (!it.ov || it.ov.key.endsWith('@*'));
        return `<form class="adc-form" data-mode="builtin" novalidate>` +
            `<div class="adc-form-title">✏️ 修改「${esc(it.title)}」</div>` +
            `<div class="adc-form-grid">` +
                `<label class="adc-f adc-f--wide"><span>標題 <em>*</em></span><input name="title" maxlength="60" required value="${esc(it.title)}"></label>` +
                `<label class="adc-f"><span>開始日期 <em>*</em></span><input type="date" name="startDate" required value="${iso(it.start)}"></label>` +
                `<label class="adc-f"><span>結束日期</span><input type="date" name="endDate" value="${ymd(it.start) === ymd(it.end) ? '' : iso(it.end)}"><small>只有一天可以不填</small></label>` +
                (it.taskId ? `<label class="adc-f adc-f--check"><input type="checkbox" name="every"${every ? ' checked' : ''}><span>之後每個月都套用（日期只看幾號）</span></label>` : '<span></span>') +
                `<label class="adc-f adc-f--wide"><span>說明（一行一點）</span><textarea name="lines" rows="4" maxlength="1500">${esc((it.lines || []).join('\n'))}</textarea></label>` +
                `<label class="adc-f adc-f--wide"><span>⚠️ 注意事項</span><input name="warn" maxlength="200" value="${esc(it.warn || '')}" placeholder="沒有可以不填"></label>` +
            `</div>` +
            `<p class="adc-form-hint">修改後所有同仁都會看到新的內容；隨時可以按「還原預設」改回原本的。</p>` +
            `<div class="adc-form-actions">` +
                `<button type="submit" class="adc-save">儲存修改</button>` +
                `<button type="button" class="adc-cancel">取消</button>` +
                `<span class="adc-form-msg" role="status" aria-live="polite"></span>` +
            `</div>` +
        `</form>`;
    }

    function openForm(ev, builtin) {
        const root = $('admin-calendar');
        if (!root) return;
        const slot = root.querySelector('.adc-form-slot');
        if (!token()) {
            slot.innerHTML = '<p class="adc-form-login">請先登入工具箱才能新增事項。</p>';
            return;
        }
        slot.innerHTML = builtin ? builtinFormHtml(builtin) : formHtml(ev);
        if (!ev && !builtin) slot.querySelector('[name="startDate"]').value = iso(fromYmd(selectedDay(today())));
        state.editing = ev ? ev.id : null;
        state.editItem = builtin || null;
        slot.querySelector('[name="title"]').focus({ preventScroll: true });
    }

    function closeForm() {
        const root = $('admin-calendar');
        if (!root) return;
        root.querySelector('.adc-form-slot').innerHTML = '';
        state.editing = null;
        state.editItem = null;
    }

    async function submitBuiltin(form) {
        const it = state.editItem;
        if (state.busy || !it) return;
        const msg = form.querySelector('.adc-form-msg');
        const fd = new FormData(form);
        const data = {
            title: String(fd.get('title') || '').trim(),
            startDate: String(fd.get('startDate') || ''),
            endDate: String(fd.get('endDate') || ''),
            lines: String(fd.get('lines') || '').split('\n').map((s) => s.trim()).filter(Boolean),
            warn: String(fd.get('warn') || '').trim()
        };
        const fail = (t) => { msg.textContent = t; msg.className = 'adc-form-msg is-err'; };
        if (!data.title) return fail('請填寫標題');
        if (!data.startDate) return fail('請選擇開始日期');
        if (data.endDate && data.endDate < data.startDate) return fail('結束日期不能早於開始日期');
        if (!data.endDate) data.endDate = data.startDate;
        const every = !!fd.get('every');
        const key = every ? `${it.taskId}@*` : it.okey;
        const btn = form.querySelector('.adc-save');
        state.busy = true;
        btn.disabled = true;
        msg.textContent = '儲存中…';
        msg.className = 'adc-form-msg';
        try {
            await rpc('admin_calendar_override_save', { p_token: token(), p_key: key, p_hidden: false, p_data: data });
            if (every && state.overrides.has(it.okey)) await rpc('admin_calendar_override_reset', { p_token: token(), p_key: it.okey });
            const start = parse(data.startDate);
            state.y = start.getFullYear();
            state.m = start.getMonth() + 1;
            state.selected = ymd(start);
            closeForm();
            await load();
        } catch (err) {
            fail(err.message || '儲存失敗');
        } finally {
            state.busy = false;
            btn.disabled = false;
        }
    }

    const findBuiltin = (key) => state.viewItems.find((it) => it.okey === key);

    async function hideBuiltin(key, btn) {
        const it = findBuiltin(key);
        if (!it || !window.confirm(`確定隱藏「${it.title}」？同仁都會看不到，之後可以按「還原」找回來。`)) return;
        btn.disabled = true;
        try {
            await rpc('admin_calendar_override_save', { p_token: token(), p_key: key, p_hidden: true, p_data: {} });
            await load();
        } catch (err) {
            btn.disabled = false;
            window.alert(err.message || '隱藏失敗');
        }
    }

    async function resetBuiltin(key, btn) {
        const label = key.endsWith('@*') ? '這個固定任務每個月的修改都會還原，' : '';
        if (!window.confirm(`確定還原成原本的內容？${label}修改過的文字和日期會清掉。`)) return;
        btn.disabled = true;
        try {
            await rpc('admin_calendar_override_reset', { p_token: token(), p_key: key });
            await load();
        } catch (err) {
            btn.disabled = false;
            window.alert(err.message || '還原失敗');
        }
    }

    async function submitForm(form) {
        if (state.busy) return;
        const msg = form.querySelector('.adc-form-msg');
        const fd = new FormData(form);
        const data = {
            title: String(fd.get('title') || '').trim(),
            startDate: String(fd.get('startDate') || ''),
            endDate: String(fd.get('endDate') || ''),
            repeat: String(fd.get('repeat') || 'none'),
            note: String(fd.get('note') || '').trim()
        };
        const fail = (t) => { msg.textContent = t; msg.className = 'adc-form-msg is-err'; };
        if (!data.title) return fail('請填寫標題');
        if (!data.startDate) return fail('請選擇開始日期');
        if (data.endDate && data.endDate < data.startDate) return fail('結束日期不能早於開始日期');
        if (!data.endDate) data.endDate = data.startDate;
        const btn = form.querySelector('.adc-save');
        state.busy = true;
        btn.disabled = true;
        msg.textContent = '儲存中…';
        msg.className = 'adc-form-msg';
        try {
            const res = await rpc('admin_calendar_save', { p_token: token(), p_id: state.editing, p_data: data });
            const start = parse(data.startDate);
            state.y = start.getFullYear();
            state.m = start.getMonth() + 1;
            state.selected = ymd(start);
            state.open.delete(`-c-${res.id}`);
            closeForm();
            await load();
        } catch (err) {
            fail(err.message || '儲存失敗');
        } finally {
            state.busy = false;
            btn.disabled = false;
        }
    }

    async function removeEvent(id, btn) {
        const ev = state.custom.find((x) => String(x.id) === String(id));
        if (!ev || !window.confirm(`確定刪除「${ev.title}」？刪除後大家都看不到。`)) return;
        btn.disabled = true;
        try {
            await rpc('admin_calendar_delete', { p_token: token(), p_id: ev.id });
            if (state.editing === ev.id) closeForm();
            await load();
        } catch (err) {
            btn.disabled = false;
            window.alert(err.message || '刪除失敗');
        }
    }

    /** 當天清單預設全部展開，收合時記成「-id」 */
    function toggleItem(li) {
        if (!li) return;
        const id = li.dataset.id;
        const open = !li.classList.contains('is-open');
        li.classList.toggle('is-open', open);
        if (open) state.open.delete(`-${id}`);
        else state.open.add(`-${id}`);
    }

    function selectCell(root, cell) {
        state.selected = Number(cell.dataset.date);
        render();
    }

    function icsText(s) {
        return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    }

    function fold(line) {
        const enc = new TextEncoder();
        const parts = [];
        let cur = '';
        let bytes = 0;
        for (const ch of line) {
            const n = enc.encode(ch).length;
            if (bytes + n > (parts.length ? 73 : 74)) { parts.push(cur); cur = ''; bytes = 0; }
            cur += ch;
            bytes += n;
        }
        parts.push(cur);
        return parts.join('\r\n ');
    }

    function icsDate(d) { return String(ymd(d)); }

    function buildIcs() {
        const now = today();
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//skyfun//admin-calendar//ZH-TW', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:行政專區行事曆', 'X-WR-TIMEZONE:Asia/Taipei'];
        const event = (uid, start, endExclusive, summary, desc, rrule) => {
            lines.push('BEGIN:VEVENT', `UID:${uid}@skyfun-admin-calendar`, `DTSTAMP:${stamp}`,
                `DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(endExclusive)}`);
            if (rrule) lines.push(`RRULE:${rrule}`);
            lines.push(`SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, 'TRANSP:TRANSPARENT',
                'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
        };
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        TASKS.forEach((base) => {
            const t = applyOverride({ ...base, start: mkDate(y, m, base.day), end: mkDate(y, m, base.end || base.day) }, state.overrides.get(`${base.id}@*`));
            const desc = [t.due, ...(t.lines || []), t.warn ? `⚠️ ${t.warn}` : '', t.path ? `NAS：${NAS_PATH.join(' > ')} > 自己的縣市 > 月別` : ''].filter(Boolean).join('\n');
            event(`${t.id}-monthly`, t.start, addDays(t.end, 1), `【行政】${t.title}`, desc, `FREQ=MONTHLY;BYMONTHDAY=${t.start.getDate()}`);
        });
        gifts.map(giftItem).filter((g) => !g.hidden && ymd(g.fest) >= ymd(now)).forEach((g) => {
            const desc = [g.due, ...(g.lines || []), g.example ? `填寫範例：${g.example}` : ''].filter(Boolean).join('\n');
            event(g.id, g.start, g.fest, `【行政】${g.title}`, desc, '');
        });
        sheetItems.map((it) => applyOverride(it, state.overrides.get(it.id)))
            .filter((it) => !it.hidden && ['kadmin', 'kall', 'meeting'].includes(it.kind) && ymd(it.end) >= ymd(now)).forEach((it) => {
                const desc = [it.due, ...(it.lines || []), it.warn ? `⚠️ ${it.warn}` : ''].filter(Boolean).join('\n');
                event(`${it.id}-sheet`, it.start, addDays(it.end, 1), `【行政】${it.title}`, desc, '');
            });
        lines.push('END:VCALENDAR');
        return lines.map(fold).join('\r\n') + '\r\n';
    }

    function downloadIcs() {
        const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '行政專區行事曆.ics';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function copy(text, btn) {
        const done = () => { const old = btn.textContent; btn.textContent = '已複製'; setTimeout(() => { btn.textContent = old; }, 1500); };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, () => window.prompt('複製這段路徑：', text));
        } else {
            window.prompt('複製這段路徑：', text);
        }
    }

    function bind() {
        const root = $('admin-calendar');
        if (!root || root.dataset.bound) return;
        root.dataset.bound = '1';
        root.addEventListener('click', (e) => {
            const nav = e.target.closest('[data-nav]');
            if (nav) {
                const step = Number(nav.dataset.nav);
                if (step === 0) { state.y = 0; }
                else {
                    const d = mkDate(state.y, state.m + step, 1);
                    state.y = d.getFullYear();
                    state.m = d.getMonth() + 1;
                }
                state.selected = 0;
                render();
                load();
                return;
            }
            if (e.target.closest('.adc-add')) { openForm(null); return; }
            if (e.target.closest('.adc-cancel')) { closeForm(); return; }
            if (e.target.closest('.adc-ics')) { downloadIcs(); return; }
            const edit = e.target.closest('[data-edit]');
            if (edit) {
                const ev = state.custom.find((x) => String(x.id) === edit.dataset.edit);
                if (ev) openForm(ev);
                return;
            }
            const del = e.target.closest('[data-del]');
            if (del) { removeEvent(del.dataset.del, del); return; }
            const bedit = e.target.closest('[data-bedit]');
            if (bedit) {
                const it = findBuiltin(bedit.dataset.bedit);
                if (it) openForm(null, it);
                return;
            }
            const bhide = e.target.closest('[data-bhide]');
            if (bhide) { hideBuiltin(bhide.dataset.bhide, bhide); return; }
            const breset = e.target.closest('[data-breset]');
            if (breset) { resetBuiltin(breset.dataset.breset, breset); return; }
            const cp = e.target.closest('.adc-copy');
            if (cp) { copy(cp.dataset.copy, cp); return; }
            const tg = e.target.closest('[data-toggle]');
            if (tg) { toggleItem(tg.closest('.adc-item')); return; }
            const cell = e.target.closest('.adc-cell[data-date]');
            if (cell) selectCell(root, cell);
        });
        root.addEventListener('dblclick', (e) => {
            const cell = e.target.closest('.adc-cell[data-date]');
            if (cell) { selectCell(root, cell); openForm(null); }
        });
        root.addEventListener('submit', (e) => {
            const form = e.target.closest('.adc-form');
            if (form) { e.preventDefault(); if (form.dataset.mode === 'builtin') submitBuiltin(form); else submitForm(form); }
        });
        root.addEventListener('keydown', (e) => {
            const tg = e.target.closest('[data-toggle]');
            if (tg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleItem(tg.closest('.adc-item')); return; }
            const cell = e.target.closest('.adc-cell[data-date]');
            if (cell && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectCell(root, cell); }
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); maybeReload(); } });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                if (entries.some((x) => x.isIntersecting)) maybeReload();
            }).observe(root);
        }
    }

    function init() { bind(); render(); load(); }

    window.AdminCalendar = { render, reload: load, buildIcs };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
