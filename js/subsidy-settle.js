(function (global) {
    'use strict';

    // 每年各月結績日（日）；未公告年份以最近一年同月份暫代並標示預估
    const SETTLE_DAYS = {
        2026: [21, 24, 23, 20, 22, 22, 21, 21, 21, 20, 23, 21],
        2027: [20, 22, 22, 21, 21, 22, 21, 23, 21, 22, 22, 21]
    };
    const WEEK = '日一二三四五六';

    function settleOf(year, monthIdx) {
        if (SETTLE_DAYS[year]) return { date: new Date(year, monthIdx, SETTLE_DAYS[year][monthIdx]), estimated: false };
        const years = Object.keys(SETTLE_DAYS).map(Number).sort((a, b) => a - b);
        const ref = years.reduce((best, y) => Math.abs(y - year) < Math.abs(best - year) ? y : best, years[0]);
        return { date: new Date(year, monthIdx, SETTLE_DAYS[ref][monthIdx]), estimated: true };
    }

    function nextSettleAfter(d) {
        let y = d.getFullYear(), m = d.getMonth();
        for (let i = 0; i < 3; i++) {
            const s = settleOf(y, m);
            if (s.date > d) return s;
            m++; if (m > 11) { m = 0; y++; }
        }
        return null;
    }

    function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

    function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

    function fmt(d) {
        return (d.getFullYear() - 1911) + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' +
            String(d.getDate()).padStart(2, '0') + '（' + WEEK[d.getDay()] + '）';
    }

    // 結績日當天已屬下一期，所以某天所屬的結績日是「嚴格晚於該天」的第一個結績日
    function settleFor(d) { return nextSettleAfter(startOfDay(d)); }

    global.SubsidySettle = { SETTLE_DAYS, settleOf, nextSettleAfter, settleFor, addDays, fmt };
})(window);
