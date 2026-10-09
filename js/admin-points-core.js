/**
 * 行政點數表：審核時間紀錄 → 點數（純計算，瀏覽器與 node 共用）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminPointsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const AUTO_ITEMS = [
    { key: 'obj', label: '物審', points: 1 },
    { key: 'tenant', label: '房客', points: 1 },
    { key: 'pre', label: '預審', points: 1 },
    { key: 'rev', label: '複審', points: 1 },
    { key: 'p4', label: '四期產編', points: 1 },
    { key: 'p5', label: '五期產編', points: 2 },
    { key: 'repair', label: '修繕', points: 1 },
    { key: 'lvr', label: '實價登錄', points: 1 }
  ];
  /** 行政QA 由組長依核定點數填 1～4 點，計入「行政QA」欄；其餘計入「手填」欄 */
  const MANUAL_ITEMS = [
    { key: '行政QA', points: 1, maxPoints: 4 },
    { key: '代管解約', points: 1 },
    { key: '案件意見修正', points: 1 },
    { key: '清冊意見修正', points: 1 },
    { key: '包租解約', points: 3 }
  ];
  const STAGE_1 = 250;
  const STAGE_2 = 350;
  const ITEM_POINTS = Object.fromEntries(AUTO_ITEMS.map((i) => [i.key, i.points]));
  const TENANT_TO_EFFECTIVE = /^(財調中|未財調|已退件|人工審核) → 已生效$/;
  const PERIOD_4 = new Set(['04', '41']);
  const PERIOD_5 = new Set(['05']);

  /** 合約編號：區碼英文＋數字＋英文後三碼，首碼 1 代管／3 包租，後兩碼期別（04 四期、41 增辦四期、05 五期） */
  function contractPeriod(no) {
    const m = String(no || '').match(/[A-Z]\d[A-Z](\d)(\d{2})/);
    if (!m) return null;
    return { kind: m[1], period: m[2] };
  }

  /** 回傳 { item, group } 或 { item: null }；group 用來去重（四期／五期產編同屬產編） */
  function classify(row) {
    const status = String(row.status || '').replace(/\s+/g, ' ').trim();
    if (row.type === 'object') {
      return status === '送審中 → 已生效' ? { item: 'obj', group: 'obj' } : { item: null };
    }
    if (row.type === 'tenant') {
      return TENANT_TO_EFFECTIVE.test(status) ? { item: 'tenant', group: 'tenant' } : { item: null };
    }
    if (row.type !== 'contract') return { item: null };
    if (status === '預審中 → 預審通過') return { item: 'pre', group: 'pre' };
    if (status === '複審中 → 複審通過') return { item: 'rev', group: 'rev' };
    if (status === '已生效 → 已生效') return { item: 'lvr', group: 'lvr' };
    if (status === '待產編 → 已生效') {
      const code = contractPeriod(row.no);
      if (code && PERIOD_4.has(code.period)) return { item: 'p4', group: 'prod' };
      if (code && PERIOD_5.has(code.period)) return { item: 'p5', group: 'prod' };
      return { item: null, group: 'prod', unknownCode: true };
    }
    return { item: null };
  }

  /**
   * 同案件判斷鍵：系統 id；合約另加「編號＋地址」與完整編號。
   * 退件重送時系統會開新 id；產編前編號只有前綴（如 L2M105），需搭配地址才能分辨。
   */
  function caseKeys(row, group) {
    const keys = [`${row.type}|id:${row.targetId}|${group}`];
    if (row.type === 'contract') {
      const no = String(row.no || '').replace(/\s+/g, '');
      const addr = String(row.name || '').replace(/\s+/g, '');
      if (no && addr) keys.push(`contract|no:${no}|addr:${addr}|${group}`);
      if (/[A-Z]\d[A-Z]\d{8,}/.test(no)) keys.push(`contract|no:${no}|${group}`);
    }
    return keys;
  }

  function rowsFromPayload(payload) {
    const fields = payload?.fields || [];
    return (payload?.rows || []).map((arr) => {
      const r = {};
      fields.forEach((f, i) => {
        r[f] = arr[i];
      });
      if (!r.date) r.date = String(r.time || '').slice(0, 10).replace(/\//g, '-');
      return r;
    });
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** 業績月：上月 29 日～本月 28 日（month 為 1～12） */
  function perfMonthRange(year, month) {
    const start = new Date(year, month - 2, 29);
    const end = new Date(year, month - 1, 28);
    return { year, month, start: isoDate(start), end: isoDate(end) };
  }

  function perfMonthOf(date) {
    const d = date instanceof Date ? date : new Date(date);
    let y = d.getFullYear();
    let m = d.getMonth() + 1;
    if (d.getDate() >= 29) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return { year: y, month: m };
  }

  function stageOf(total) {
    if (total >= STAGE_2) return 2;
    if (total >= STAGE_1) return 1;
    return 0;
  }

  function emptyTally() {
    const t = { auto: 0, qa: 0, manual: 0, total: 0, counts: {}, manualCounts: {} };
    for (const i of AUTO_ITEMS) t.counts[i.key] = 0;
    for (const i of MANUAL_ITEMS) t.manualCounts[i.key] = 0;
    return t;
  }

  function finish(t) {
    t.total = t.auto + t.qa + t.manual;
    return t;
  }

  /**
   * @param auditRows  rowsFromPayload 結果
   * @param opts { start, end, staff:[{name,status,kind}], manual:[{date,name,item,qty,points}],
   *               expenses: 補助審核 rowsFromPayload 結果（已生效五類費用，date 為審核日期） }
   */
  function compute(auditRows, opts) {
    const start = opts.start;
    const end = opts.end;
    const staffList = opts.staff || [];
    const active = new Map(staffList.filter((s) => s.status === '在職').map((s) => [s.name, s]));
    const inactive = new Set(staffList.filter((s) => s.status !== '在職').map((s) => s.name));
    const rosterReady = active.size > 0;

    const sorted = auditRows
      .filter((r) => r.date >= start && r.date <= end)
      .slice()
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));

    const seen = new Set();
    const scored = [];
    const duplicates = [];
    const unknownCodes = [];
    const resigned = new Map();
    const skipResigned = (name) => {
      if (!inactive.has(name) || active.has(name)) return false;
      resigned.set(name, (resigned.get(name) || 0) + 1);
      return true;
    };

    for (const r of sorted) {
      const c = classify(r);
      if (!c.group) continue;
      const keys = caseKeys(r, c.group);
      const dup = keys.some((k) => seen.has(k));
      keys.forEach((k) => seen.add(k));
      if (dup) {
        duplicates.push({ ...r, item: c.item });
        continue;
      }
      if (c.unknownCode) {
        unknownCodes.push(r);
        continue;
      }
      if (skipResigned(r.auditor)) continue;
      scored.push({ ...r, item: c.item, points: ITEM_POINTS[c.item] });
    }

    const expenses = (opts.expenses || [])
      .filter((r) => r.date >= start && r.date <= end)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    const seenExpense = new Set();
    for (const r of expenses) {
      if (seenExpense.has(r.id)) continue;
      seenExpense.add(r.id);
      if (skipResigned(r.auditor)) continue;
      scored.push({ ...r, item: 'repair', points: ITEM_POINTS.repair, status: `${r.type}（已生效）`, time: '' });
    }

    /** 行政＝人力明細在職；非行政＝有審核紀錄但不在人力明細 */
    const people = new Map();
    const person = (name) => {
      if (!people.has(name)) {
        people.set(name, {
          name,
          kind: active.get(name)?.kind || '',
          group: !rosterReady || active.has(name) ? '行政' : '非行政',
          month: emptyTally(),
          days: new Map(),
          records: []
        });
      }
      return people.get(name);
    };
    const day = (p, date) => {
      if (!p.days.has(date)) p.days.set(date, emptyTally());
      return p.days.get(date);
    };

    for (const r of scored) {
      const p = person(r.auditor);
      const d = day(p, r.date);
      for (const t of [p.month, d]) {
        t.counts[r.item] += 1;
        t.auto += r.points;
      }
      p.records.push(r);
    }

    for (const m of opts.manual || []) {
      if (m.date < start || m.date > end || skipResigned(m.name)) continue;
      const p = person(m.name);
      const pts = Number(m.points) || 0;
      const qty = Number(m.qty) || 1;
      for (const t of [p.month, day(p, m.date)]) {
        if (m.item === '行政QA') {
          t.qa += pts;
          continue;
        }
        t.manual += pts;
        t.manualCounts[m.item] = (t.manualCounts[m.item] || 0) + qty;
      }
    }

    if (rosterReady) {
      for (const [name, s] of active) {
        if (!people.has(name)) person(name);
        people.get(name).kind = s.kind;
      }
    }

    const list = [...people.values()];
    for (const p of list) {
      finish(p.month);
      for (const t of p.days.values()) finish(t);
      p.stage = stageOf(p.month.total);
    }
    list.sort((a, b) => b.month.total - a.month.total || a.name.localeCompare(b.name, 'zh-Hant'));

    return {
      start,
      end,
      rosterReady,
      people: list,
      scoredCount: scored.length,
      duplicates,
      unknownCodes,
      resigned: [...resigned.entries()].sort((a, b) => b[1] - a[1])
    };
  }

  return {
    AUTO_ITEMS,
    MANUAL_ITEMS,
    STAGE_1,
    STAGE_2,
    contractPeriod,
    classify,
    rowsFromPayload,
    perfMonthRange,
    perfMonthOf,
    stageOf,
    compute,
    isoDate
  };
});
