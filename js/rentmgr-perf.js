/**
 * 租管師績效中心｜導覽與渲染
 */
(function (global) {
  'use strict';

  const EMPTY = '無資料';
  let activeModule = 'overview';
  /** 各地區 KPI：week｜month｜year */
  let regionKpiView = 'week';
  let regionKpiMonthId = '';
  let activeRenewRegion = 'all';
  let cache = null;
  let bound = false;

  const STATUS_LABEL = {
    bad: '警示',
    warn: '注意',
    ok: '達標',
    pending: '待資料',
    control: '控管內',
    alert: '警戒',
    over: '超標'
  };

  const CAP_STATUS_LABEL = {
    ok: '控管內',
    warn: '警戒',
    bad: '超標',
    pending: '待資料',
    control: '控管內',
    alert: '警戒',
    over: '超標'
  };

  function dataApi() {
    return global.RentmgrPerfData || null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayVal(v) {
    if (v === null || v === undefined || v === '') {
      return '<span class="rmp-empty">' + EMPTY + '</span>';
    }
    return esc(v);
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function setPeriod(periodLabel) {
    const el = $('#rmp-period');
    if (!el) return;
    el.textContent = '資料期間：' + (periodLabel || EMPTY);
  }

  function overviewGoal(kpi, row) {
    if (row && row.goal != null && isFinite(Number(row.goal))) return Number(row.goal);
    if (kpi.goalValue != null && isFinite(Number(kpi.goalValue))) return Number(kpi.goalValue);
    return null;
  }

  function overviewStatus(kpi, value, row) {
    if (value === null || value === undefined || value === '') return 'pending';
    const n = Number(value);
    const g = overviewGoal(kpi, row);
    if (!isFinite(n) || g == null) return 'pending';
    if (kpi.higherIsBetter) {
      if (n >= g) return 'ok';
      if (n >= g * 0.8) return 'warn';
      return 'bad';
    }
    /* 越低越好（催收件數、不續約率） */
    if (n <= g) return 'ok';
    if (kpi.kind === 'count') {
      if (n <= g + 2) return 'warn';
      return 'bad';
    }
    if (n <= g * 1.2) return 'warn';
    return 'bad';
  }

  function overviewValueText(kpi, value) {
    if (value === null || value === undefined || value === '') return EMPTY;
    const n = Number(value);
    if (!isFinite(n)) return EMPTY;
    if (kpi.kind === 'rate') return n.toFixed(1) + '%';
    return String(Math.round(n)) + (kpi.unit === '件' ? ' 件' : '');
  }

  function overviewDeltaHtml(kpi, delta) {
    if (delta === null || delta === undefined || delta === '') {
      return '<span class="rmp-ov-delta is-empty">' + EMPTY + '</span>';
    }
    const n = Number(delta);
    if (!isFinite(n)) return '<span class="rmp-ov-delta is-empty">' + EMPTY + '</span>';
    const up = n > 0;
    const flat = n === 0;
    const better = kpi.higherIsBetter ? up : !up && !flat;
    const worse = kpi.higherIsBetter ? !up && !flat : up;
    const tone = flat ? 'flat' : better ? 'better' : worse ? 'worse' : 'flat';
    const arrow = flat ? '－' : up ? '▲' : '▼';
    const abs = Math.abs(n);
    const unit = kpi.kind === 'rate' ? ' pt' : ' 件';
    const sign = up && kpi.kind === 'count' ? '+' : '';
    return (
      '<span class="rmp-ov-delta tone-' + tone + '">' +
        arrow + ' 較上期 ' + sign + abs.toFixed(kpi.kind === 'rate' ? 1 : 0) + unit +
      '</span>'
    );
  }

  function overviewBarPct(kpi, value, row) {
    const g = overviewGoal(kpi, row);
    if (value === null || value === undefined || value === '' || g == null) return 0;
    const n = Number(value);
    if (!isFinite(n) || !isFinite(g)) return 0;
    if (kpi.higherIsBetter) {
      if (g <= 0) return 0;
      return Math.max(0, Math.min(100, (n / g) * 100));
    }
    /* 上限型：達標時滿格；超出則依超標程度縮短 */
    if (kpi.kind === 'count') {
      if (n <= g) return 100;
      return Math.max(8, Math.min(100, 100 - Math.max(0, n - g) * 12));
    }
    if (g <= 0) return n <= 0 ? 100 : 0;
    if (n <= g) return 100;
    return Math.max(8, Math.min(100, (g / n) * 100));
  }

  function isCapKpi(kpi) {
    return !!(kpi && (kpi.statusMode === 'cap' || kpi.key === 'collectOver30'));
  }

  function overviewDisplayStatus(kpi, status) {
    if (!isCapKpi(kpi)) return status;
    if (status === 'ok') return 'control';
    if (status === 'warn') return 'alert';
    if (status === 'bad') return 'over';
    return status;
  }

  function overviewStatusLabel(kpi, status) {
    if (isCapKpi(kpi)) return CAP_STATUS_LABEL[status] || CAP_STATUS_LABEL.pending;
    return STATUS_LABEL[status] || STATUS_LABEL.pending;
  }

  function overviewGapText(kpi, value, row) {
    const g = overviewGoal(kpi, row);
    if (value === null || value === undefined || value === '' || g == null) {
      return '差距 ' + EMPTY;
    }
    const n = Number(value);
    if (!isFinite(n) || !isFinite(g)) return '差距 ' + EMPTY;
    if (kpi.higherIsBetter) {
      const d = g - n;
      if (d <= 0) return '已達標';
      return '差距 ' + d.toFixed(1) + ' 個百分點';
    }
    if (kpi.kind === 'count') {
      const d = n - g;
      if (d <= 0) return isCapKpi(kpi) ? '在上限內' : '已達標';
      return '超出 ' + d + ' 件';
    }
    const d = n - g;
    if (d <= 0) return '已達標';
    return '超出 ' + d.toFixed(1) + ' 個百分點';
  }

  function resolveActiveOverviewMonth(modData) {
    const api = dataApi();
    const monthIds = (modData && modData.monthIds) || ['10', '11', '12'];
    if (activeOverviewMonthId && monthIds.indexOf(activeOverviewMonthId) >= 0) {
      return activeOverviewMonthId;
    }
    if (modData && modData.monthId && monthIds.indexOf(modData.monthId) >= 0) {
      activeOverviewMonthId = modData.monthId;
      return activeOverviewMonthId;
    }
    if (api && typeof api.defaultOverviewMonthId === 'function') {
      activeOverviewMonthId = api.defaultOverviewMonthId();
      return activeOverviewMonthId;
    }
    activeOverviewMonthId = monthIds.indexOf('11') >= 0 ? '11' : monthIds[0];
    return activeOverviewMonthId;
  }

  function overviewMonthPickerHtml(monthIds, selectedId) {
    const opts = (monthIds || ['10', '11', '12']).map(function (id) {
      return (
        '<option value="' + esc(id) + '"' +
          (id === selectedId ? ' selected' : '') + '>' +
          esc(Number(id) + '月') +
        '</option>'
      );
    }).join('');
    return (
      '<label class="rmp-month-pick">' +
        '<span class="rmp-month-pick-label">查看月份</span>' +
        '<select class="rmp-month-select" data-rmp-ov-month-pick aria-label="選擇總覽月份">' +
          opts +
        '</select>' +
      '</label>'
    );
  }

  function renderOverview(mod, modData) {
    const cardsWrap = $('#rmp-cards');
    const tableWrap = $('#rmp-table-wrap');
    if (!cardsWrap || !tableWrap || !mod) return;
    cardsWrap.hidden = true;
    cardsWrap.innerHTML = '';

    const monthId = resolveActiveOverviewMonth(modData);
    const monthBundle =
      (modData && modData.byMonth && modData.byMonth[monthId]) ||
      modData ||
      {};
    const kpiData = monthBundle.kpis || (modData && modData.kpis) || {};
    const kpis = mod.kpis || [];
    const monthIds = (modData && modData.monthIds) || ['10', '11', '12'];

    const kpiHtml = kpis.map(function (kpi) {
      const row = kpiData[kpi.key] || {};
      const value = row.value;
      const rawStatus = row.status || overviewStatus(kpi, value, row);
      const status = overviewDisplayStatus(kpi, rawStatus);
      const empty = value === null || value === undefined || value === '';
      const bar = overviewBarPct(kpi, value, row);
      const goalLabel = row.goalText || kpi.goalText || '';
      const hint = kpi.hint ? String(kpi.hint) : '';
      return (
        '<article class="rmp-ov-card tone-' + status + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
          '<div class="rmp-ov-top">' +
            '<div class="rmp-ov-label">' + esc(kpi.label) + '</div>' +
            '<span class="rmp-ov-badge">' + esc(overviewStatusLabel(kpi, status)) + '</span>' +
          '</div>' +
          '<div class="rmp-ov-value' + (empty ? ' is-empty' : '') + '">' +
            esc(overviewValueText(kpi, value)) +
          '</div>' +
          '<div class="rmp-ov-bar" aria-hidden="true"><i style="width:' + bar.toFixed(1) + '%"></i></div>' +
          '<div class="rmp-ov-meta">' +
            '<span>' + esc(goalLabel) + '</span>' +
            '<span>' + esc(overviewGapText(kpi, value, row)) + '</span>' +
          '</div>' +
          (hint ? '<div class="rmp-ov-hint">' + esc(hint) + '</div>' : '') +
          overviewDeltaHtml(kpi, row.delta) +
        '</article>'
      );
    }).join('');

    const cols = mod.pointsColumns || [];
    const points = (monthBundle.points != null ? monthBundle.points : (modData && modData.points)) || [];
    let head = '';
    cols.forEach(function (c) {
      head += '<th scope="col">' + esc(c.label) + '</th>';
    });
    let body;
    if (!points.length) {
      body =
        '<tr><td colspan="' + cols.length + '" class="rmp-empty-row">' +
          '租管師點數表尚無資料，之後會自動帶入' +
        '</td></tr>';
    } else {
      body = points.map(function (p, idx) {
        return (
          '<tr>' +
            '<td>' + esc(p.rank != null ? p.rank : idx + 1) + '</td>' +
            '<td>' + esc(p.name || EMPTY) + '</td>' +
            '<td>' + esc(p.region || EMPTY) + '</td>' +
            '<td>' + esc(p.office || EMPTY) + '</td>' +
            '<td class="num">' + (p.points == null ? displayVal(null) : esc(p.points)) + '</td>' +
            '<td>' + esc(p.note || '') + '</td>' +
          '</tr>'
        );
      }).join('');
    }

    tableWrap.innerHTML =
      '<section class="rmp-overview" aria-label="績效總覽">' +
        '<div class="rmp-renew-toolbar rmp-ov-toolbar">' +
          overviewMonthPickerHtml(monthIds, monthId) +
          '<p class="rmp-renew-hint">全國總覽｜' + esc(Number(monthId) + '月') +
            '。領先續約率（次月）＝租約到期日為下個月、本月已先簽回的佔比；續轉包／催收取各地區KPI週報；當月續約率與不續約率取該月續約總計。過去月份請用「查看月份」切換。</p>' +
        '</div>' +
        '<div class="rmp-ov-grid">' + kpiHtml + '</div>' +
        '<div class="rmp-points">' +
          '<div class="rmp-points-head">' +
            '<h3 class="rmp-points-title">租管師點數表</h3>' +
            '<p class="rmp-points-sub">資料就緒後自動帶入；目前顯示空表</p>' +
          '</div>' +
          '<div class="rmp-month-scroll">' +
            '<table class="rmp-table rmp-points-table" aria-label="租管師點數表">' +
              '<thead><tr>' + head + '</tr></thead>' +
              '<tbody>' + body + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</section>';

    $all('[data-rmp-ov-month-pick]', tableWrap).forEach(function (sel) {
      sel.addEventListener('change', function () {
        const next = sel.value;
        if (!next) return;
        activeOverviewMonthId = next;
        renderOverview(mod, modData);
      });
    });
  }

  function renderCards(mod, modData) {
    const wrap = $('#rmp-cards');
    if (!wrap || !mod) return;
    const cards = mod.cards || [];
    if (!cards.length || mod.layout === 'renewWeeks' || mod.layout === 'renewMonths' || mod.layout === 'noRenewDashboard' || mod.layout === 'overview' || mod.layout === 'orgChart') {
      wrap.innerHTML = '';
      wrap.hidden = true;
      return;
    }
    /* regionKpiMatrix／regionTable 仍顯示頂部摘要卡 */
    wrap.hidden = false;
    wrap.setAttribute('data-count', String(cards.length));
    const values = (modData && modData.cards) || {};
    wrap.innerHTML = cards.map(function (c) {
      const raw = values[c.key];
      const empty = raw === null || raw === undefined || raw === '';
      const hint = c.hint ? String(c.hint) : '';
      return (
        '<article class="rmp-card"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' +
          '<div class="rmp-card-label">' + esc(c.label) + '</div>' +
          '<div class="rmp-card-value' + (empty ? ' is-empty' : '') + '">' +
            (empty ? EMPTY : esc(raw)) +
          '</div>' +
          (hint ? '<div class="rmp-card-hint">' + esc(hint) + '</div>' : '') +
        '</article>'
      );
    }).join('');
  }

  function fmtRegionKpiCell(kind, value) {
    if (value == null || value === '') return '<span class="rmp-empty">—</span>';
    if (kind === 'count') return esc(String(Math.round(Number(value))));
    const n = Number(value);
    if (!isFinite(n)) return esc(String(value));
    return esc((Math.round(n * 10) / 10) + '%');
  }

  /**
   * 週報著色（對齊試算表字色）：
   * 包租催收件數｜地區：0綠／1白／2黃／>2紅；全區：0–4綠／5白／6–9黃／≥10紅
   * 其他比率｜累計週目標＝月目標×(週次)/4（例：月標 80 → 一週20、二週40、三週60、四週80）：
   *   達標綠｜差距≤5%（含）白｜5.1%–10%黃｜>10%紅
   * @param {number} [weekIndex] 0-based；週報必傳，用於累計週目標
   */
  function regionKpiTone(kind, actual, goal, mode, regionId, weekIndex) {
    if (actual == null || actual === '') return '';
    const a = Number(actual);
    if (!isFinite(a)) return '';

    if (kind === 'count') {
      const isAll = regionId === 'all';
      if (isAll) {
        if (a <= 4) return ' tone-ok';
        if (a === 5) return '';
        if (a <= 9) return ' tone-warn';
        return ' tone-bad';
      }
      if (a <= 0) return ' tone-ok';
      if (a === 1) return '';
      if (a === 2) return ' tone-warn';
      return ' tone-bad';
    }

    if (goal == null || goal === '') return '';
    const gMonth = Number(goal);
    if (!isFinite(gMonth)) return '';
    let target = gMonth;
    if (mode === 'week') {
      const wi = weekIndex == null ? 0 : Number(weekIndex);
      const step = Math.max(1, Math.min(4, (isFinite(wi) ? wi : 0) + 1));
      target = (gMonth * step) / 4;
    }
    if (!isFinite(target)) return '';

    /* 達標（≥該週累計目標／月目標）→ 綠 */
    if (a >= target) return ' tone-ok';
    /* 差距用相對％：((目標−實績)/目標)*100；目標為 0 時改看是否為 0 */
    if (target === 0) return a > 0 ? ' tone-bad' : ' tone-ok';
    const gapPct = ((target - a) / Math.abs(target)) * 100;
    if (gapPct <= 5) return ''; /* 含 5% → 白 */
    if (gapPct <= 10) return ' tone-warn'; /* 5.1%–10% → 黃 */
    return ' tone-bad'; /* >10% → 紅 */
  }

  /** 專案／權重欄：有值的列往下合併到下一筆有值之前 */
  function regionKpiLabelSpans(rows, field) {
    const spans = [];
    let i = 0;
    while (i < rows.length) {
      const label = String((rows[i] && rows[i][field]) || '').trim();
      if (!label) {
        spans[i] = 0;
        i += 1;
        continue;
      }
      let n = 1;
      while (i + n < rows.length && !String((rows[i + n] && rows[i + n][field]) || '').trim()) n += 1;
      spans[i] = n;
      for (let k = 1; k < n; k++) spans[i + k] = 0;
      i += n;
    }
    return spans;
  }

  function regionKpiWeekLabelShort(lab, idx) {
    const map = ['一', '二', '三', '四', '五', '六'];
    const s = String(lab || '');
    const m = s.match(/第\s*([一二三四五六])\s*週/) || s.match(/第\s*([1-6])\s*週/);
    if (m) {
      const g = m[1];
      const zh = /[1-6]/.test(g) ? map[Number(g) - 1] : g;
      return zh + '週';
    }
    return (map[idx] || String(idx + 1)) + '週';
  }

  /** 全區某週空白時，用各縣市同週加總（件數）或平均（比率）補齊 */
  function fillAllRegionWeek(row, regions, weekCount) {
    if (!row || !row.byRegion) return;
    const all = row.byRegion.all;
    if (!all) return;
    const weeks = (all.weeks || []).slice();
    while (weeks.length < weekCount) weeks.push(null);
    const cityIds = (regions || []).map(function (r) { return r.id; }).filter(function (id) {
      return id && id !== 'all';
    });
    for (let wi = 0; wi < weekCount; wi++) {
      if (weeks[wi] != null) continue;
      let sum = 0;
      let n = 0;
      cityIds.forEach(function (id) {
        const cell = row.byRegion[id];
        const v = cell && cell.weeks ? cell.weeks[wi] : null;
        if (v == null) return;
        sum += Number(v);
        n += 1;
      });
      if (!n) continue;
      weeks[wi] = row.kind === 'count'
        ? Math.round(sum)
        : Math.round((sum / n) * 10) / 10;
    }
    all.weeks = weeks;
    let last = null;
    for (let wi = weeks.length - 1; wi >= 0; wi--) {
      if (weeks[wi] != null) {
        last = weeks[wi];
        break;
      }
    }
    if (all.value == null && last != null) all.value = last;
  }

  function shortSectionLabel(s) {
    return String(s || '')
      .replace(/[《》]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /** 合併欄輸出：span>0 輸出；span=0 表示被上一列蓋住則略過 */
  function appendSpanCell(html, spans, idx, cls, text) {
    const span = spans[idx] || 0;
    if (span > 0) {
      return html +
        '<td class="' + cls + '" rowspan="' + span + '">' + esc(text || '') + '</td>';
    }
    return html;
  }

  function renderRegionKpiWeekTable(pack, regions, weekLabels) {
    const api = dataApi();
    const labels = (weekLabels && weekLabels.length)
      ? weekLabels.slice()
      : (api && api.weekLabelsForMonth ? api.weekLabelsForMonth('10') : null) ||
        ['第一週', '第二週', '第三週', '第四週'];
    const rows = (pack || []).map(function (row) {
      const copy = Object.assign({}, row, {
        byRegion: Object.assign({}, row.byRegion || {})
      });
      Object.keys(copy.byRegion).forEach(function (id) {
        const c = copy.byRegion[id] || {};
        copy.byRegion[id] = Object.assign({}, c, {
          weeks: (c.weeks || []).slice()
        });
      });
      fillAllRegionWeek(copy, regions, labels.length);
      return copy;
    });
    const secSpans = regionKpiLabelSpans(rows, 'section');
    const wtSpans = regionKpiLabelSpans(rows, 'weight');
    const weekN = labels.length;
    const regionN = (regions || []).length;

    let colgroup =
      '<colgroup>' +
        '<col class="rmp-rk-c-sec" />' +
        '<col class="rmp-rk-c-wt" />' +
        '<col class="rmp-rk-c-metric" />' +
        '<col class="rmp-rk-c-meta" />' +
        '<col class="rmp-rk-c-meta" />';
    for (let i = 0; i < regionN * weekN; i++) colgroup += '<col class="rmp-rk-c-val" />';
    colgroup += '</colgroup>';

    let head =
      '<tr>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-1">專案</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-2">權重</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-3">指標</th>' +
        '<th rowspan="2">去年</th>' +
        '<th rowspan="2">目標</th>';
    regions.forEach(function (r) {
      head += '<th class="rmp-rk-region" colspan="' + weekN + '">' + esc(r.label) + '</th>';
    });
    head += '</tr><tr>';
    regions.forEach(function () {
      labels.forEach(function (w, wi) {
        head += '<th class="rmp-rk-sub">' + esc(regionKpiWeekLabelShort(w, wi)) + '</th>';
      });
    });
    head += '</tr>';

    const body = rows.map(function (row, idx) {
      let cells = '';
      cells = appendSpanCell(cells, secSpans, idx, 'rmp-rk-sec rmp-rk-sticky rmp-rk-sticky-1', shortSectionLabel(row.section));
      cells = appendSpanCell(cells, wtSpans, idx, 'rmp-rk-wt rmp-rk-sticky rmp-rk-sticky-2', row.weight);
      cells +=
        '<td class="rmp-rk-metric rmp-rk-sticky rmp-rk-sticky-3">' + esc(row.label || '') + '</td>' +
        '<td class="rmp-rk-meta">' + fmtRegionKpiCell(row.kind, row.ly) + '</td>' +
        '<td class="rmp-rk-goal">' + fmtRegionKpiCell(row.kind, row.goal) + '</td>';
      regions.forEach(function (r, ri) {
        const cell = (row.byRegion && row.byRegion[r.id]) || {};
        const weeks = cell.weeks || [];
        labels.forEach(function (_w, wi) {
          const v = weeks[wi];
          const edge = ri > 0 && wi === 0 ? ' rmp-rk-region-start' : '';
          cells +=
            '<td class="rmp-rk-val' + edge + regionKpiTone(row.kind, v, row.goal, 'week', r.id, wi) + '">' +
              fmtRegionKpiCell(row.kind, v) +
            '</td>';
        });
      });
      return '<tr>' + cells + '</tr>';
    }).join('');

    return (
      '<div class="rmp-rk-fit">' +
        '<table class="rmp-rk-table" aria-label="各地區KPI週報">' +
          colgroup +
          '<thead>' + head + '</thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderRegionKpiMonthTable(pack, regions) {
    const rows = pack || [];
    const secSpans = regionKpiLabelSpans(rows, 'section');
    const wtSpans = regionKpiLabelSpans(rows, 'weight');
    const regionN = (regions || []).length;

    let colgroup =
      '<colgroup>' +
        '<col class="rmp-rk-c-sec" />' +
        '<col class="rmp-rk-c-wt" />' +
        '<col class="rmp-rk-c-metric" />';
    for (let i = 0; i < regionN * 3; i++) colgroup += '<col class="rmp-rk-c-val" />';
    colgroup += '</colgroup>';

    let head =
      '<tr>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-1">專案</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-2">權重</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-3">指標</th>';
    regions.forEach(function (r) {
      head += '<th class="rmp-rk-region" colspan="3">' + esc(r.label) + '</th>';
    });
    head += '</tr><tr>';
    regions.forEach(function () {
      head +=
        '<th class="rmp-rk-sub">去年</th>' +
        '<th class="rmp-rk-sub">目標</th>' +
        '<th class="rmp-rk-sub">實績</th>';
    });
    head += '</tr>';

    const body = rows.map(function (row, idx) {
      let cells = '';
      cells = appendSpanCell(cells, secSpans, idx, 'rmp-rk-sec rmp-rk-sticky rmp-rk-sticky-1', shortSectionLabel(row.section));
      cells = appendSpanCell(cells, wtSpans, idx, 'rmp-rk-wt rmp-rk-sticky rmp-rk-sticky-2', row.weight);
      cells +=
        '<td class="rmp-rk-metric rmp-rk-sticky rmp-rk-sticky-3">' + esc(row.label || '') + '</td>';
      regions.forEach(function (r, ri) {
        const cell = (row.byRegion && row.byRegion[r.id]) || {};
        const g = cell.target != null ? cell.target : row.goal;
        const edge = ri > 0 ? ' rmp-rk-region-start' : '';
        cells +=
          '<td class="rmp-rk-meta' + edge + '">' + fmtRegionKpiCell(row.kind, cell.ly) + '</td>' +
          '<td class="rmp-rk-goal">' + fmtRegionKpiCell(row.kind, g) + '</td>' +
          '<td class="rmp-rk-val' + regionKpiTone(row.kind, cell.actual, g, 'month', r.id) + '">' +
            fmtRegionKpiCell(row.kind, cell.actual) +
          '</td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join('');

    return (
      '<div class="rmp-rk-fit">' +
        '<table class="rmp-rk-table" aria-label="各地區KPI月報">' +
          colgroup +
          '<thead>' + head + '</thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderRegionKpiAnnualTable(annualPack, months) {
    const rows = (annualPack && annualPack.rows) || [];
    const secSpans = regionKpiLabelSpans(rows, 'section');
    const wtSpans = regionKpiLabelSpans(rows, 'weight');
    const monthN = (months || []).length;

    let colgroup =
      '<colgroup>' +
        '<col class="rmp-rk-c-sec" />' +
        '<col class="rmp-rk-c-wt" />' +
        '<col class="rmp-rk-c-metric" />';
    for (let i = 0; i < monthN * 3; i++) colgroup += '<col class="rmp-rk-c-val" />';
    colgroup += '</colgroup>';

    let head =
      '<tr>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-1">專案及例行性業務項目</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-2">權重%</th>' +
        '<th rowspan="2" class="rmp-rk-sticky rmp-rk-sticky-3">目標效益指標展開</th>';
    (months || []).forEach(function (m) {
      head += '<th class="rmp-rk-region" colspan="3">' + esc(m + '月') + '</th>';
    });
    head += '</tr><tr>';
    (months || []).forEach(function () {
      head +=
        '<th class="rmp-rk-sub">去年同期</th>' +
        '<th class="rmp-rk-sub">目標</th>' +
        '<th class="rmp-rk-sub">實績</th>';
    });
    head += '</tr>';

    const body = rows.map(function (row, idx) {
      let cells = '';
      cells = appendSpanCell(cells, secSpans, idx, 'rmp-rk-sec rmp-rk-sticky rmp-rk-sticky-1', shortSectionLabel(row.section));
      cells = appendSpanCell(cells, wtSpans, idx, 'rmp-rk-wt rmp-rk-sticky rmp-rk-sticky-2', row.weight);
      cells +=
        '<td class="rmp-rk-metric rmp-rk-sticky rmp-rk-sticky-3">' + esc(row.label || '') + '</td>';
      (months || []).forEach(function (m, mi) {
        const cell = (row.byMonth && row.byMonth[m]) || {};
        const edge = mi > 0 ? ' rmp-rk-region-start' : '';
        cells +=
          '<td class="rmp-rk-meta' + edge + '">' + fmtRegionKpiCell(row.kind, cell.ly) + '</td>' +
          '<td class="rmp-rk-goal">' + fmtRegionKpiCell(row.kind, cell.target) + '</td>' +
          '<td class="rmp-rk-val' +
            regionKpiTone(row.kind, cell.actual, cell.target, 'month', 'all') +
          '">' +
            fmtRegionKpiCell(row.kind, cell.actual) +
          '</td>';
      });
      return '<tr>' + cells + '</tr>';
    }).join('');

    return (
      '<div class="rmp-rk-fit rmp-rk-annual">' +
        '<table class="rmp-rk-table" aria-label="租管部KPI年報">' +
          colgroup +
          '<thead>' + head + '</thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>'
    );
  }

  function renderRegionKpiMatrix(mod, modData) {
    const wrap = $('#rmp-table-wrap');
    if (!wrap || !mod) return;
    const north = mod.northRegions || [];
    const south = mod.southRegions || [];
    const view =
      regionKpiView === 'month' ? 'month' : regionKpiView === 'year' ? 'year' : 'week';
    const weekPack = (modData && modData.weekMatrix) || {};
    const monthMap = (modData && modData.monthMatrixByMonth) || {};
    const annualPack = (modData && modData.annualKpi) || null;
    const monthIds = (modData && modData.monthIds) || Object.keys(monthMap).sort();
    if (!regionKpiMonthId) {
      regionKpiMonthId = (modData && modData.monthId) || monthIds[monthIds.length - 1] || '';
    }
    if (monthIds.length && monthIds.indexOf(regionKpiMonthId) < 0) {
      regionKpiMonthId = monthIds[monthIds.length - 1];
    }
    const monthPack = monthMap[regionKpiMonthId] || null;

    const monthOpts = monthIds.map(function (id) {
      return (
        '<option value="' + esc(id) + '"' +
          (id === regionKpiMonthId ? ' selected' : '') + '>' +
          esc(Number(id) + '月') +
        '</option>'
      );
    }).join('');

    let tables = '';
    let title = '';
    let note = '';
    if (view === 'week') {
      title = weekPack.title || '各地區KPI週報';
      note = mod.leadRenewHint || '';
      tables =
        renderRegionKpiWeekTable(weekPack.north, north, weekPack.weekLabels) +
        renderRegionKpiWeekTable(weekPack.south, south, weekPack.weekLabels);
      if (!(weekPack.north || []).length && !(weekPack.south || []).length) {
        tables = '<p class="rmp-norenew-empty">週報尚無資料</p>';
      }
    } else if (view === 'year') {
      title = (annualPack && annualPack.title) || '115年度租管部KPI月報';
      note = (annualPack && annualPack.note) || '1–9 月＝年報圖面；10 月起＝系統';
      if (annualPack && annualPack.rows && annualPack.rows.length) {
        const halves = annualPack.halves || [
          { months: [1, 2, 3, 4, 5, 6] },
          { months: [7, 8, 9, 10, 11, 12] }
        ];
        tables = halves
          .map(function (h) {
            return renderRegionKpiAnnualTable(annualPack, h.months);
          })
          .join('');
      } else {
        tables = '<p class="rmp-norenew-empty">年報尚無資料</p>';
      }
    } else {
      title = (monthPack && monthPack.title) || ('各地區KPI月報｜' + Number(regionKpiMonthId) + '月');
      note = (monthPack && monthPack.synthesized)
        ? '此月月報分頁尚無資料，已用週報「去年同期／目標／最近一週」彙整顯示。'
        : (mod.leadRenewHint || '');
      if (monthPack) {
        tables =
          renderRegionKpiMonthTable(monthPack.north, north) +
          renderRegionKpiMonthTable(monthPack.south, south);
      } else {
        tables = '<p class="rmp-norenew-empty">月報尚無資料</p>';
      }
    }

    wrap.innerHTML =
      '<div class="rmp-region-kpi">' +
        '<div class="rmp-renew-toolbar rmp-rk-toolbar">' +
          '<div class="rmp-rk-tabs" role="tablist" aria-label="週報、月報或年報">' +
            '<button type="button" class="rmp-rk-tab' + (view === 'week' ? ' is-active' : '') + '" data-rmp-rk-view="week">週報</button>' +
            '<button type="button" class="rmp-rk-tab' + (view === 'month' ? ' is-active' : '') + '" data-rmp-rk-view="month">月報</button>' +
            '<button type="button" class="rmp-rk-tab' + (view === 'year' ? ' is-active' : '') + '" data-rmp-rk-view="year">年報</button>' +
          '</div>' +
          (view === 'month'
            ? '<label class="rmp-month-pick"><span class="rmp-month-pick-label">月份</span>' +
                '<select class="rmp-month-select" data-rmp-rk-month aria-label="選擇月報月份">' +
                  (monthOpts || '<option value="">—</option>') +
                '</select></label>'
            : '') +
          '<p class="rmp-renew-hint">' + esc(title) +
            (note ? '｜' + esc(note) : '') +
            (view !== 'year' && mod.toBaoFormula ? '｜續轉包：' + esc(mod.toBaoFormula) : '') +
          '</p>' +
        '</div>' +
        tables +
      '</div>';

    $all('[data-rmp-rk-view]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = btn.getAttribute('data-rmp-rk-view');
        if (!next || next === regionKpiView) return;
        regionKpiView = next;
        renderRegionKpiMatrix(mod, modData);
      });
    });
    $all('[data-rmp-rk-month]', wrap).forEach(function (sel) {
      sel.addEventListener('change', function () {
        regionKpiMonthId = sel.value || '';
        renderRegionKpiMatrix(mod, modData);
      });
    });
  }

  function renderRegionTable(mod, modData) {
    renderRegionKpiMatrix(mod, modData);
  }

  /** 各月目前選取的週（0–2）；未設則預設本週／最近有資料週 */
  const renewWeekPick = {};
  /** 續約分頁目前顯示的月份（10／11／12）；null＝依本週自動 */
  let activeRenewMonthId = null;
  /** 總覽目前顯示的月份；null＝依本週自動 */
  let activeOverviewMonthId = null;
  /** 表內展開的案件明細：{ monthId, region, metric, metricLabel, regionLabel } */
  let renewDetailOpen = null;
  const renewDetailCache = {};
  let renewLastMod = null;
  let renewLastModData = null;
  let noRenewDash = null;
  let noRenewDetailMonth = null;
  let noRenewDetail = null;
  let noRenewLoading = false;
  /** 不續約明細：縣市篩選（空＝全部） */
  let activeNoRenewCity = '';
  /** 不續約明細排序：{ key, dir } dir＝1 升／-1 降 */
  let noRenewSort = { key: '', dir: 1 };
  /** 不續約儀表板：展開中的 KPI 卡（null／noRenew／leasing／annualNoRenew） */
  let nrKpiOpen = null;
  let leasingDetailMonth = null;
  let leasingDetail = null;
  let leasingLoading = false;
  let activeLeasingCity = '';
  let leasingSort = { key: '', dir: 1 };
  /** 異常轉業／年度不續約合併明細（1～當月） */
  let annualNoRenewDetail = null;
  let annualNoRenewLoading = false;
  let activeAnnualNrCity = '';
  let annualNrMonthFilter = 0;
  let annualNrSort = { key: '', dir: 1 };
  let collectDash = null;
  let collectLoading = false;
  /** 催收案件明細：縣市篩選（空＝全部） */
  let activeCollectCity = '';

  const COLLECT_STATUS_OPTIONS = [
    { value: '未處理完成', tone: 'green' },
    { value: '未繳款', tone: 'red' },
    { value: '申請調解', tone: 'red' },
    { value: '強制執行', tone: 'red' },
    { value: '還款協議+本票', tone: 'red' },
    { value: '請法務協助', tone: 'danger' },
    { value: '解約', tone: 'amber' },
    { value: '固定時間匯款', tone: 'blue' },
    { value: '處理進度中', tone: 'blue' },
    { value: '已匯款', tone: 'navy' }
  ];

  function collectStatusTone(status) {
    const hit = COLLECT_STATUS_OPTIONS.find(function (x) { return x.value === status; });
    return hit ? hit.tone : 'empty';
  }

  function collectStatusSelectHtml(caseId, status) {
    const cur = status || '';
    const tone = collectStatusTone(cur);
    const opts =
      '<option value=""' + (!cur ? ' selected' : '') + '>未填</option>' +
      COLLECT_STATUS_OPTIONS.map(function (s) {
        return (
          '<option value="' + esc(s.value) + '"' +
            (cur === s.value ? ' selected' : '') + '>' +
            esc(s.value) +
          '</option>'
        );
      }).join('');
    return (
      '<select class="rmp-collect-status-sel tone-' + tone + '" data-rmp-case="' +
        esc(caseId) + '">' + opts + '</select>'
    );
  }
  /** 展開中的案件案號（空＝未展開） */
  let activeCollectCaseId = '';
  /** 催收案件索引（展開明細用，避免整頁重繪） */
  let collectCaseById = {};

  function trendClass(metric, curr, prev) {
    const api = dataApi();
    const a = api && api.toNumber ? api.toNumber(curr) : null;
    const b = api && api.toNumber ? api.toNumber(prev) : null;
    if (a === null || b === null) return { cls: '', mark: '' };
    const diff = a - b;
    if (Math.abs(diff) < 1e-9) return { cls: '', mark: '' };
    const up = diff > 0;
    const good = metric.higherIsBetter === true ? up : metric.higherIsBetter === false ? !up : null;
    if (good === true) return { cls: 'is-up-good', mark: '↑' };
    if (good === false) return { cls: 'is-down-bad', mark: '↓' };
    return { cls: up ? 'is-up' : 'is-down', mark: up ? '↑' : '↓' };
  }

  function rateTone(metric, raw) {
    if (!metric || metric.kind !== 'rate') return '';
    const api = dataApi();
    const n = api && api.toNumber ? api.toNumber(raw) : null;
    if (n === null) return '';
    if (metric.key === 'noRenewRate') {
      if (n >= 25) return 'tone-bad';
      if (n >= 15) return 'tone-warn';
      return 'tone-ok';
    }
    if (n >= 50) return 'tone-ok';
    if (n >= 30) return 'tone-warn';
    return 'tone-bad';
  }

  function weekCountOf(monthId) {
    const api = dataApi();
    if (api && api.weekCountForMonth) return api.weekCountForMonth(monthId);
    return 3;
  }

  function isLeadingMonth(monthId) {
    const api = dataApi();
    const n = weekCountOf(monthId);
    for (let wi = 0; wi < n; wi++) {
      if (api && api.sheetWeekPhase && api.sheetWeekPhase(monthId, wi) === 'current') return false;
    }
    /* 沒有本週落在此月，且月份大於目前日曆月 → 領先月 */
    const nowM = new Date().getMonth() + 1;
    return Number(monthId) > nowM;
  }

  function defaultWeekIndex(monthId) {
    const api = dataApi();
    const last = weekCountOf(monthId) - 1;
    for (let wi = last; wi >= 0; wi--) {
      const ph = api && api.sheetWeekPhase ? api.sheetWeekPhase(monthId, wi) : 'past';
      if (ph === 'current') return wi;
    }
    if (isLeadingMonth(monthId)) return 0; /* 領先月皆即時，預設第一週 */
    for (let wi = last; wi >= 0; wi--) {
      const ph = api && api.sheetWeekPhase ? api.sheetWeekPhase(monthId, wi) : 'past';
      if (ph === 'past') return wi;
    }
    return 0;
  }

  function pickedWeek(monthId) {
    const last = weekCountOf(monthId) - 1;
    if (renewWeekPick[monthId] == null) renewWeekPick[monthId] = defaultWeekIndex(monthId);
    if (renewWeekPick[monthId] > last) renewWeekPick[monthId] = last;
    if (renewWeekPick[monthId] < 0) renewWeekPick[monthId] = 0;
    return renewWeekPick[monthId];
  }

  function cellHasData(cell) {
    if (!cell) return false;
    const api = dataApi();
    const metrics = (api && api.RENEW_METRICS) || [];
    for (let i = 0; i < metrics.length; i++) {
      const v = cell[metrics[i].key];
      if (v !== null && v !== undefined && v !== '') return true;
    }
    return false;
  }

  function resolveActiveRenewMonth(mod, byMonth) {
    const bands = mod.monthBands || [];
    const ids = bands.map(function (b) { return b.id; });
    if (activeRenewMonthId && ids.indexOf(activeRenewMonthId) >= 0) return activeRenewMonthId;

    const api = dataApi();
    for (let i = 0; i < bands.length; i++) {
      const id = bands[i].id;
      const n = weekCountOf(id);
      for (let wi = 0; wi < n; wi++) {
        if (api && api.sheetWeekPhase && api.sheetWeekPhase(id, wi) === 'current') {
          activeRenewMonthId = id;
          return id;
        }
      }
    }
    /* 日曆月落在 10–12 則用該月（例如已進 11 月就預設 11 月） */
    const calId = (function () {
      const m = new Date().getMonth() + 1;
      const id = m < 10 ? '0' + m : String(m);
      return ids.indexOf(id) >= 0 ? id : null;
    })();
    if (calId) {
      activeRenewMonthId = calId;
      return calId;
    }
    for (let i = bands.length - 1; i >= 0; i--) {
      const id = bands[i].id;
      const wi = defaultWeekIndex(id);
      const cell = (((byMonth[id] || {}).byRegion || {}).all || {}).weeks;
      if (cell && cellHasData(cell[wi])) {
        activeRenewMonthId = id;
        return id;
      }
    }
    activeRenewMonthId = ids[0] || '11';
    return activeRenewMonthId;
  }

  function renderRenewMonthPicker(mod, selectedId) {
    const bands = mod.monthBands || [];
    const opts = bands.map(function (b) {
      return (
        '<option value="' + esc(b.id) + '"' +
          (b.id === selectedId ? ' selected' : '') + '>' +
          esc(b.label) +
        '</option>'
      );
    }).join('');
    return (
      '<label class="rmp-month-pick">' +
        '<span class="rmp-month-pick-label">查看月份</span>' +
        '<select class="rmp-month-select" data-rmp-month-pick aria-label="選擇續約月份">' +
          opts +
        '</select>' +
      '</label>'
    );
  }

  function renderRenewKpiStrip(mod, byMonth, monthId) {
    const api = dataApi();
    if (!monthId) monthId = resolveActiveRenewMonth(mod, byMonth);
    let weekIndex = pickedWeek(monthId);
    renewWeekPick[monthId] = weekIndex;
    const cell = ((((byMonth[monthId] || {}).byRegion || {}).all || {}).weeks || [])[weekIndex] || {};
    const cards = [
      { key: 'renewRateAll', label: '續約率' },
      { key: 'renewRateExcl', label: '當月續約率-異常轉業者' },
      { key: 'due', label: '應續約' },
      { key: 'done', label: '已續約' },
      { key: 'noRenewRate', label: '不續約率' }
    ];
    const monthLabel = monthId + '月';
    const band = (mod.monthBands || []).find(function (b) { return b.id === monthId; });
    const weekLabel =
      (band && band.weekLabels && band.weekLabels[weekIndex]) ||
      (api && api.weekLabelsForMonth && api.weekLabelsForMonth(monthId)[weekIndex]) ||
      (mod.weekLabels || [])[weekIndex] ||
      '';
    const html = cards.map(function (c) {
      const met = (mod.metrics || []).find(function (m) { return m.key === c.key; }) || c;
      const raw = cell[c.key];
      const empty = raw === null || raw === undefined || raw === '';
      const tone = empty ? '' : rateTone(met, raw);
      return (
        '<article class="rmp-kpi' + (tone ? ' ' + tone : '') + '">' +
          '<div class="rmp-kpi-label">' + esc(c.label) + '</div>' +
          '<div class="rmp-kpi-value' + (empty ? ' is-empty' : '') + '">' +
            (empty ? EMPTY : esc(raw)) +
          '</div>' +
        '</article>'
      );
    }).join('');
    return (
      '<div class="rmp-kpi-strip" data-month="' + esc(monthId) + '">' +
        '<div class="rmp-kpi-head">全國總計｜' + esc(monthLabel) + ' ' + esc(weekLabel) + '</div>' +
        '<div class="rmp-kpi-grid">' + html + '</div>' +
      '</div>'
    );
  }

  function renderOneRenewMonth(mod, monthBand, monthData) {
    const api = dataApi();
    const regions = (api && api.REGIONS) || [];
    const weekLabels =
      (monthBand && monthBand.weekLabels) ||
      (api && api.weekLabelsForMonth && api.weekLabelsForMonth(monthBand.id)) ||
      mod.weekLabels ||
      (api && api.RENEW_WEEK_LABELS) ||
      ['第一週', '第二週', '第三週'];
    const metrics = mod.metrics || [];
    const byRegion = (monthData && monthData.byRegion) || {};
    const wi = pickedWeek(monthBand.id);
    const phaseOf = function (idx) {
      return api && api.sheetWeekPhase ? api.sheetWeekPhase(monthBand.id, idx) : 'past';
    };

    const weekTabs = weekLabels.map(function (lab, idx) {
      const ph = phaseOf(idx);
      const on = idx === wi;
      const liveTag = ph !== 'past';
      return (
        '<button type="button" class="rmp-week-tab' + (on ? ' is-active' : '') + '"' +
          ' data-rmp-month="' + esc(monthBand.id) + '" data-rmp-week="' + idx + '">' +
          esc(lab) +
          (ph === 'current' ? ' ·本週' : '') +
          (liveTag && ph !== 'current' ? ' ·即時' : '') +
        '</button>'
      );
    }).join('');

    let head = '<th scope="col" class="rmp-region-col">地區</th>';
    head += '<th scope="col" class="rmp-metric-h is-rate is-prev-week">上週續約率</th>';
    metrics.forEach(function (m) {
      head += '<th scope="col" class="rmp-metric-h' + (m.kind === 'rate' ? ' is-rate' : '') + '">' + esc(m.label) + '</th>';
    });

    const colSpan = 2 + metrics.length;
    const open =
      renewDetailOpen && String(renewDetailOpen.monthId) === String(monthBand.id)
        ? renewDetailOpen
        : null;

    const body = regions.map(function (r) {
      const weeks = ((byRegion[r.id] || {}).weeks) || [];
      const cell = weeks[wi] || {};
      const prev = wi > 0 ? weeks[wi - 1] || {} : {};
      let cells = '<th scope="row" class="rmp-region-col">' + esc(r.label) + '</th>';
      /* 上週續約率＝同月上一週的「續約率-全部」；第一週無上週 */
      const prevRate = wi > 0 ? prev.renewRateAll : null;
      const prevEmpty = prevRate === null || prevRate === undefined || prevRate === '';
      const prevTone = prevEmpty ? '' : rateTone({ key: 'renewRateAll', kind: 'rate' }, prevRate);
      cells +=
        '<td class="rmp-val is-rate is-prev-week' + (prevTone ? ' ' + prevTone : '') + '">' +
          (prevEmpty
            ? '<span class="rmp-empty">' + EMPTY + '</span>'
            : '<span class="rmp-val-main">' + esc(prevRate) + '</span>') +
        '</td>';
      metrics.forEach(function (metric) {
        const raw = cell[metric.key];
        const empty = raw === null || raw === undefined || raw === '';
        const ph = phaseOf(wi);
        const tr = empty || ph === 'future' ? { cls: '', mark: '' } : trendClass(metric, raw, prev[metric.key]);
        const tone = empty ? '' : rateTone(metric, raw);
        const n = api && api.toNumber ? api.toNumber(raw) : Number(raw);
        const clickable =
          !empty &&
          ph !== 'past' &&
          api &&
          api.canOpenRenewDetail &&
          api.canOpenRenewDetail(metric.key) &&
          n != null &&
          n > 0;
        const isOpen =
          open && open.region === r.id && open.metric === metric.key;
        const main = empty
          ? '<span class="rmp-empty">' + (ph === 'future' ? '—' : EMPTY) + '</span>'
          : clickable
            ? '<button type="button" class="rmp-val-btn' + (isOpen ? ' is-open' : '') + '" data-rmp-detail="1"' +
                ' data-rmp-month="' + esc(monthBand.id) + '"' +
                ' data-rmp-region="' + esc(r.id) + '"' +
                ' data-rmp-metric="' + esc(metric.key) + '"' +
                ' data-rmp-metric-label="' + esc(metric.label) + '"' +
                ' data-rmp-region-label="' + esc(r.label) + '"' +
                ' aria-expanded="' + (isOpen ? 'true' : 'false') + '"' +
                ' title="點擊展開／收合案件地址">' +
                '<span class="rmp-val-main">' + esc(raw) + '</span>' +
              '</button>'
            : '<span class="rmp-val-main">' + esc(raw) + '</span>';
        cells +=
          '<td class="rmp-val ' + (metric.kind === 'rate' ? 'is-rate ' : '') + tr.cls + (tone ? ' ' + tone : '') +
            (clickable ? ' is-clickable' : '') + (isOpen ? ' is-detail-open' : '') + '">' +
            main +
            (!empty && tr.mark ? '<span class="rmp-delta" aria-hidden="true">' + tr.mark + '</span>' : '') +
          '</td>';
      });
      let html = '<tr class="rmp-region-row' + (r.id === 'all' ? ' is-total' : '') +
        (open && open.region === r.id ? ' has-detail' : '') + '">' + cells + '</tr>';
      if (open && open.region === r.id) {
        html +=
          '<tr class="rmp-detail-row" data-rmp-detail-row="' + esc(monthBand.id) + '">' +
            '<td colspan="' + colSpan + '">' +
              '<div class="rmp-detail-inline">' +
                '<div class="rmp-detail-inline-head">' +
                  '<div>' +
                    '<strong>' + esc(open.regionLabel || r.label) + '｜' + esc(open.metricLabel || open.metric) + '</strong>' +
                    '<span class="rmp-detail-inline-sub" data-rmp-detail-sub>載入中…</span>' +
                  '</div>' +
                  '<button type="button" class="rmp-detail-inline-close" data-rmp-detail-close="' +
                    esc(monthBand.id) + '" aria-label="收合明細">收合</button>' +
                '</div>' +
                '<div class="rmp-detail-inline-body" data-rmp-detail-body>請稍候</div>' +
              '</div>' +
            '</td>' +
          '</tr>';
      }
      return html;
    }).join('');

    return (
      '<section class="rmp-month-block rmp-renew-month" data-month="' + esc(monthBand.id) + '">' +
        '<div class="rmp-month-bar">' +
          '<h3 class="rmp-month-title">' + esc(monthBand.label) + '</h3>' +
          '<div class="rmp-week-tabs" role="tablist" aria-label="' + esc(monthBand.label) + '週次">' + weekTabs + '</div>' +
        '</div>' +
        '<div class="rmp-month-scroll">' +
          '<table class="rmp-table rmp-table--renew rmp-table--exec" aria-label="' + esc(monthBand.label) + '續約">' +
            '<thead><tr>' + head + '</tr></thead>' +
            '<tbody>' + body + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>'
    );
  }

  function renewDetailCacheKey(opts) {
    return [opts.monthId, opts.region, opts.metric].join('|');
  }

  function renderDetailItemsHtml(items) {
    if (!items || !items.length) {
      return '<p class="rmp-detail-empty">沒有案件明細</p>';
    }
    return (
      '<ol class="rmp-detail-list">' +
        items.map(function (it, i) {
          return (
            '<li class="rmp-detail-item">' +
              '<span class="rmp-detail-idx">' + (i + 1) + '</span>' +
              '<div class="rmp-detail-main">' +
                '<div class="rmp-detail-addr">' + esc(it.address || '（無地址）') + '</div>' +
                '<div class="rmp-detail-meta">' +
                  (it.matchNo ? '<span>媒合 ' + esc(it.matchNo) + '</span>' : '') +
                  (it.status ? '<span>' + esc(it.status) + '</span>' : '') +
                  (it.leaseEnd ? '<span>迄日 ' + esc(it.leaseEnd) + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</li>'
          );
        }).join('') +
      '</ol>'
    );
  }

  function fillOpenRenewDetail() {
    if (!renewDetailOpen || !renewLastMod) return;
    const wrap = $('#rmp-table-wrap');
    if (!wrap) return;
    const row = wrap.querySelector(
      '.rmp-renew-month[data-month="' + renewDetailOpen.monthId + '"] [data-rmp-detail-row]'
    );
    if (!row) return;
    const sub = row.querySelector('[data-rmp-detail-sub]');
    const body = row.querySelector('[data-rmp-detail-body]');
    const key = renewDetailCacheKey(renewDetailOpen);
    const cached = renewDetailCache[key];
    if (cached) {
      if (sub) {
        sub.textContent = '共 ' + ((cached.items && cached.items.length) || 0) + ' 件' +
          (cached.fetchedAt ? '｜' + String(cached.fetchedAt).replace('T', ' ').slice(0, 16) : '');
      }
      if (body) body.innerHTML = renderDetailItemsHtml(cached.items);
      return;
    }
    const api = dataApi();
    if (!api || !api.fetchRenewKpiDetail) return;
    if (sub) sub.textContent = '載入中…';
    if (body) body.innerHTML = '<p class="rmp-detail-loading">請稍候</p>';
    const req = {
      monthId: renewDetailOpen.monthId,
      region: renewDetailOpen.region,
      metric: renewDetailOpen.metric
    };
    api.fetchRenewKpiDetail({
      year: 115,
      month: Number(req.monthId),
      region: req.region || 'all',
      metric: req.metric
    }).then(function (data) {
      if (!renewDetailOpen ||
          renewDetailOpen.monthId !== req.monthId ||
          renewDetailOpen.region !== req.region ||
          renewDetailOpen.metric !== req.metric) {
        return;
      }
      const pack = {
        items: (data && data.items) || [],
        fetchedAt: data && data.fetchedAt
      };
      renewDetailCache[key] = pack;
      const row2 = $('#rmp-table-wrap') &&
        $('#rmp-table-wrap').querySelector(
          '.rmp-renew-month[data-month="' + req.monthId + '"] [data-rmp-detail-row]'
        );
      if (!row2) return;
      const sub2 = row2.querySelector('[data-rmp-detail-sub]');
      const body2 = row2.querySelector('[data-rmp-detail-body]');
      if (sub2) {
        sub2.textContent = '共 ' + pack.items.length + ' 件' +
          (pack.fetchedAt ? '｜' + String(pack.fetchedAt).replace('T', ' ').slice(0, 16) : '');
      }
      if (body2) body2.innerHTML = renderDetailItemsHtml(pack.items);
    }).catch(function (err) {
      if (!renewDetailOpen || renewDetailOpen.monthId !== req.monthId) return;
      const row2 = $('#rmp-table-wrap') &&
        $('#rmp-table-wrap').querySelector(
          '.rmp-renew-month[data-month="' + req.monthId + '"] [data-rmp-detail-row]'
        );
      if (!row2) return;
      const sub2 = row2.querySelector('[data-rmp-detail-sub]');
      const body2 = row2.querySelector('[data-rmp-detail-body]');
      if (sub2) sub2.textContent = '載入失敗';
      if (body2) {
        body2.innerHTML = '<p class="rmp-detail-empty">' +
          esc(err && err.message ? err.message : '無法載入明細') + '</p>';
      }
    });
  }

  function toggleRenewDetail(opts) {
    const same =
      renewDetailOpen &&
      renewDetailOpen.monthId === opts.monthId &&
      renewDetailOpen.region === opts.region &&
      renewDetailOpen.metric === opts.metric;
    renewDetailOpen = same
      ? null
      : {
          monthId: opts.monthId,
          region: opts.region,
          metric: opts.metric,
          metricLabel: opts.metricLabel,
          regionLabel: opts.regionLabel
        };
    if (renewLastMod) renderRenewMonths(renewLastMod, renewLastModData);
  }

  function renderRenewMonths(mod, modData) {
    const wrap = $('#rmp-table-wrap');
    if (!wrap || !mod) return;
    renewLastMod = mod;
    renewLastModData = modData;
    const bands = mod.monthBands || [];
    const byMonth = (modData && modData.byMonth) || {};
    const monthId = resolveActiveRenewMonth(mod, byMonth);
    const band = bands.find(function (b) { return b.id === monthId; }) || bands[0];
    const table = band ? renderOneRenewMonth(mod, band, byMonth[band.id]) : '';

    wrap.innerHTML =
      '<div class="rmp-renew-panel">' +
        renderRenewKpiStrip(mod, byMonth, monthId) +
        '<div class="rmp-renew-toolbar">' +
          renderRenewMonthPicker(mod, monthId) +
          '<p class="rmp-renew-hint">列＝地區、欄＝指標。「上週續約率」＝同月上一週的續約率-全部（第一週無資料）。第1–3週已過＝試算表；第4週起已過＝系統週快照；本週／未到＝系統即時（每天早上 8 點更新）。點擊藍色件數會在該列下方展開案件地址。「異常轉業」僅認試算表、無明細。過去月份（如 10 月）請用上方「查看月份」切換。</p>' +
        '</div>' +
        '<div class="rmp-renew-months">' + table + '</div>' +
      '</div>';

    $all('[data-rmp-month-pick]', wrap).forEach(function (sel) {
      sel.addEventListener('change', function () {
        const next = sel.value;
        if (!next) return;
        activeRenewMonthId = next;
        if (renewDetailOpen && renewDetailOpen.monthId !== next) renewDetailOpen = null;
        renderRenewMonths(mod, modData);
      });
    });

    $all('[data-rmp-week]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mid = btn.getAttribute('data-rmp-month');
        const week = Number(btn.getAttribute('data-rmp-week'));
        if (!mid || !isFinite(week)) return;
        renewWeekPick[mid] = week;
        if (renewDetailOpen && renewDetailOpen.monthId === mid) renewDetailOpen = null;
        renderRenewMonths(mod, modData);
      });
    });

    $all('[data-rmp-detail]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleRenewDetail({
          monthId: btn.getAttribute('data-rmp-month'),
          region: btn.getAttribute('data-rmp-region'),
          metric: btn.getAttribute('data-rmp-metric'),
          metricLabel: btn.getAttribute('data-rmp-metric-label'),
          regionLabel: btn.getAttribute('data-rmp-region-label')
        });
      });
    });

    $all('[data-rmp-detail-close]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        renewDetailOpen = null;
        renderRenewMonths(mod, modData);
      });
    });

    fillOpenRenewDetail();
  }

  function setActiveNav(moduleId) {
    $all('#page-rentmanager-perf [data-rmp-module]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-rmp-module') === moduleId);
      btn.setAttribute('aria-selected', btn.getAttribute('data-rmp-module') === moduleId ? 'true' : 'false');
    });
  }

  function fmtPct(v) {
    if (v === null || v === undefined || v === '') return EMPTY;
    return (typeof v === 'number' ? v : Number(v)) + '%';
  }

  function fmtNumOrEmpty(v) {
    if (v === null || v === undefined || v === '') return EMPTY;
    return esc(v);
  }

  function renderNoRenewChart(dash) {
    const CH = global.AdminPointsCharts;
    if (!CH || !CH.trend || !dash || !dash.chart) {
      return '<p class="rmp-norenew-empty">圖表載入中或無資料</p>';
    }
    return (
      '<div class="rmp-norenew-chart">' +
        '<div class="rmp-norenew-chart-title">114年與115年不續約佔比圖</div>' +
        '<div class="rmp-norenew-legend">' +
          '<span><i class="rmp-leg rmp-leg-ly"></i>去年同期</span>' +
          '<span><i class="rmp-leg rmp-leg-act"></i>實績</span>' +
          '<span><i class="rmp-leg rmp-leg-lease"></i>招租中</span>' +
        '</div>' +
        CH.trend({
          id: 'rmp-norenew',
          labels: dash.chart.labels,
          lines: [
            { name: '去年同期', values: dash.chart.lyRates, color: '#94a3b8' },
            { name: '實績', values: dash.chart.actRates, color: '#dc2626', area: true },
            { name: '招租中', values: dash.chart.leaseRates, color: '#2563eb' }
          ],
          fmt: function (v) { return (Math.round(v * 10) / 10) + '%'; },
          min: 0,
          max: 40,
          step: 10,
          width: 960,
          height: 280,
          padL: 48,
          padR: 16,
          padB: 30,
          showXLabels: true
        }) +
      '</div>'
    );
  }

  function renderNoRenewMonthTable(dash) {
    if (!dash || !dash.months) return '';
    const rows = [
      { key: 'due', label: '應續約件數', kind: 'count' },
      { key: 'leasing', label: '招租中案件', kind: 'count' },
      { key: 'leaseRate', label: '招租中占比', kind: 'rate' },
      { key: 'noRenew', label: '不續約件數', kind: 'count' },
      { key: 'noRenewRate', label: '不續約占比', kind: 'rate' }
    ];
    let head = '<th class="rmp-norenew-corner">項目</th>';
    dash.months.forEach(function (m) {
      head +=
        '<th colspan="2" class="rmp-norenew-month-h">' + m.m + '月</th>';
    });
    head += '<th colspan="2" class="rmp-norenew-month-h">年度合計</th>';

    let sub = '<th></th>';
    dash.months.forEach(function () {
      sub += '<th class="rmp-norenew-sub">去年同期</th><th class="rmp-norenew-sub">實績</th>';
    });
    sub += '<th class="rmp-norenew-sub">去年同期</th><th class="rmp-norenew-sub">實績</th>';

    const body = rows.map(function (r) {
      let cells = '<th scope="row">' + esc(r.label) + '</th>';
      dash.months.forEach(function (m) {
        const ly = m.ly[r.key];
        const act = m.act[r.key];
        const lyTxt = r.kind === 'rate' ? (ly == null ? '—' : fmtPct(ly)) : (ly == null ? '—' : fmtNumOrEmpty(ly));
        const actTxt = r.kind === 'rate' ? (act == null ? '—' : fmtPct(act)) : (act == null ? EMPTY : fmtNumOrEmpty(act));
        cells +=
          '<td class="' + (m.ly && m.ly.fromSystem ? 'is-sys' : '') + '">' + lyTxt + '</td>' +
          '<td class="' + (m.act.fromSystem ? 'is-sys' : '') + '">' + actTxt + '</td>';
      });
      const ann = dash.annual || {};
      if (r.key === 'noRenewRate') {
        cells +=
          '<td>' + (ann.lyNoRenewRate == null ? '—' : fmtPct(ann.lyNoRenewRate)) + '</td>' +
          '<td class="is-sys">' + (ann.actNoRenewRate == null ? EMPTY : fmtPct(ann.actNoRenewRate)) + '</td>';
      } else if (r.key === 'leaseRate') {
        cells +=
          '<td>' + (ann.lyLeaseRate == null ? '—' : fmtPct(ann.lyLeaseRate)) + '</td>' +
          '<td class="is-sys">' + (ann.leaseRate == null ? EMPTY : fmtPct(ann.leaseRate)) + '</td>';
      } else if (r.key === 'due') {
        cells +=
          '<td>' + (ann.lyDue == null ? '—' : fmtNumOrEmpty(ann.lyDue)) + '</td>' +
          '<td class="is-sys">' + (ann.due == null ? EMPTY : fmtNumOrEmpty(ann.due)) + '</td>';
      } else if (r.key === 'leasing') {
        cells +=
          '<td>' + (ann.lyLeasing == null ? '—' : fmtNumOrEmpty(ann.lyLeasing)) + '</td>' +
          '<td class="is-sys">' + (ann.leasing == null ? EMPTY : fmtNumOrEmpty(ann.leasing)) + '</td>';
      } else {
        cells +=
          '<td>' + (ann.lyNoRenew == null ? '—' : fmtNumOrEmpty(ann.lyNoRenew)) + '</td>' +
          '<td class="is-sys">' + (ann.noRenew == null ? EMPTY : fmtNumOrEmpty(ann.noRenew)) + '</td>';
      }
      return '<tr>' + cells + '</tr>';
    }).join('');

    return (
      '<div class="rmp-norenew-table-wrap">' +
        '<h3 class="rmp-norenew-block-title">115年 不續約占比' +
          (dash.sheetVer ? '<span class="rmp-norenew-sheet-tag">試算表 1–9月</span>' : '') +
        '</h3>' +
        '<div class="rmp-norenew-matrix-scroll">' +
          '<table class="rmp-norenew-matrix" aria-label="115年不續約占比">' +
            '<thead><tr>' + head + '</tr><tr>' + sub + '</tr></thead>' +
            '<tbody>' + body + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>'
    );
  }

  function noRenewSortValue(it, key) {
    if (key === 'abnormal') {
      if (it.abnormal === true) return '2';
      if (it.abnormal === false) return '1';
      return '0';
    }
    return String(it[key] || '');
  }

  function sortNoRenewItems(items) {
    const key = noRenewSort && noRenewSort.key;
    const dir = noRenewSort && noRenewSort.dir === -1 ? -1 : 1;
    if (!key) return items.slice();
    return items.slice().sort(function (a, b) {
      const av = noRenewSortValue(a, key);
      const bv = noRenewSortValue(b, key);
      const cmp = av.localeCompare(bv, 'zh-Hant', { numeric: true, sensitivity: 'base' });
      return cmp * dir;
    });
  }

  function noRenewSortTh(key, label) {
    const on = noRenewSort && noRenewSort.key === key;
    const aria = on ? (noRenewSort.dir === -1 ? 'descending' : 'ascending') : 'none';
    const mark = on ? (noRenewSort.dir === -1 ? ' ▼' : ' ▲') : '';
    const alignCls = key === 'address' ? ' rmp-nr-addr' : key === 'remark' ? ' rmp-nr-note' : '';
    return (
      '<th scope="col" class="rmp-nr-sortable' + alignCls + (on ? ' is-sorted' : '') + '"' +
        ' data-rmp-nr-sort="' + esc(key) + '" aria-sort="' + aria + '" title="點擊排序">' +
        esc(label) + mark +
      '</th>'
    );
  }

  function renderMonthTabs(activeMonth, attrName) {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push(
        '<button type="button" class="rmp-week-tab' + (i === activeMonth ? ' is-active' : '') + '" ' +
          attrName + '="' + i + '">' + i + '月</button>'
      );
    }
    return months.join('');
  }

  function renderCityChips(allItems, activeCity, attrName) {
    const cityCount = {};
    allItems.forEach(function (it) {
      const c = String(it.city || '').trim() || '（未填縣市）';
      cityCount[c] = (cityCount[c] || 0) + 1;
    });
    const cities = Object.keys(cityCount).sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hant');
    });
    return (
      '<div class="rmp-norenew-city-chips" role="tablist" aria-label="縣市篩選">' +
        '<button type="button" class="rmp-collect-chip' + (!activeCity ? ' is-active' : '') +
          '" ' + attrName + '="">全部縣市 · ' + esc(String(allItems.length)) + '</button>' +
        cities.map(function (c) {
          const on = activeCity === c;
          return (
            '<button type="button" class="rmp-collect-chip' + (on ? ' is-active' : '') +
              '" ' + attrName + '="' + esc(c) + '">' +
              esc(c) + ' · ' + esc(String(cityCount[c])) +
            '</button>'
          );
        }).join('') +
      '</div>'
    );
  }

  function filterByCity(items, activeCity) {
    if (!activeCity) return items.slice();
    return items.filter(function (it) {
      const c = String(it.city || '').trim() || '（未填縣市）';
      return c === activeCity;
    });
  }

  function renderNoRenewDetailBody() {
    const nowM = new Date().getMonth() + 1;
    const month = noRenewDetailMonth || nowM;
    let body = '';
    if (noRenewLoading) {
      body = '<p class="rmp-norenew-empty">明細載入中…</p>';
    } else if (!noRenewDetail) {
      body = '<p class="rmp-norenew-empty">尚無明細</p>';
    } else if (noRenewDetail.error && !(noRenewDetail.items || []).length) {
      body = '<p class="rmp-norenew-empty">載入失敗：' + esc(noRenewDetail.error) + '</p>';
    } else if (!(noRenewDetail.items || []).length) {
      body = '<p class="rmp-norenew-empty">本月沒有不續約案件</p>';
    } else {
      const allItems = noRenewDetail.items || [];
      if (activeNoRenewCity) {
        const still = allItems.some(function (it) {
          return (String(it.city || '').trim() || '（未填縣市）') === activeNoRenewCity;
        });
        if (!still) activeNoRenewCity = '';
      }
      let filtered = filterByCity(allItems, activeNoRenewCity);
      filtered = sortNoRenewItems(filtered);
      const rows = filtered.length
        ? filtered.map(function (it) {
            const ab = it.abnormal;
            const sel =
              '<select class="rmp-nr-abnormal" data-rmp-match="' + esc(it.matchNo) + '">' +
                '<option value=""' + (ab == null ? ' selected' : '') + '>未填</option>' +
                '<option value="1"' + (ab === true ? ' selected' : '') + '>是</option>' +
                '<option value="0"' + (ab === false ? ' selected' : '') + '>否</option>' +
              '</select>';
            return (
              '<tr class="' + (ab === true ? 'is-abnormal' : '') + '">' +
                '<td>' + esc(it.status || '') + '</td>' +
                '<td>' + esc(it.entrustType || '') + '</td>' +
                '<td>' + esc(it.city || '') + '</td>' +
                '<td class="rmp-nr-addr">' + esc(it.address || '') + '</td>' +
                '<td class="rmp-nr-note">' + esc(it.remark || '') + '</td>' +
                '<td>' + esc(it.sales || '') + '</td>' +
                '<td>' + sel + '</td>' +
              '</tr>'
            );
          }).join('')
        : '<tr><td colspan="7" class="rmp-norenew-empty-row">此縣市尚無案件</td></tr>';
      body =
        renderCityChips(allItems, activeNoRenewCity, 'data-rmp-nr-city') +
        '<div class="rmp-norenew-detail-scroll">' +
          '<table class="rmp-norenew-detail" aria-label="當月不續約明細">' +
            '<colgroup>' +
              '<col class="rmp-nr-col-status" /><col class="rmp-nr-col-type" /><col class="rmp-nr-col-city" />' +
              '<col class="rmp-nr-col-addr" /><col class="rmp-nr-col-note" /><col class="rmp-nr-col-sales" />' +
              '<col class="rmp-nr-col-abn" />' +
            '</colgroup>' +
            '<thead><tr>' +
              noRenewSortTh('status', '續約狀態') +
              noRenewSortTh('entrustType', '委託形式') +
              noRenewSortTh('city', '物件縣市') +
              noRenewSortTh('address', '租賃地址') +
              noRenewSortTh('remark', '備註') +
              noRenewSortTh('sales', '業務') +
              noRenewSortTh('abnormal', '是否異常轉業') +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="rmp-norenew-hint">顯示 ' + filtered.length + '／共 ' + allItems.length + ' 件' +
          (activeNoRenewCity ? '（' + esc(activeNoRenewCity) + '）' : '') +
          (noRenewDetail.fetchedAt ? '｜' + String(noRenewDetail.fetchedAt).replace('T', ' ').slice(0, 16) : '') +
          '。異常轉業寫入工具箱並連動續約「不續約-異常轉業／扣除異常」；點表頭可排序。</p>';
    }

    return (
      '<div class="rmp-norenew-kpi-expand-inner">' +
        '<div class="rmp-month-bar">' +
          '<h3 class="rmp-month-title">當月不續約明細</h3>' +
          '<div class="rmp-week-tabs" role="tablist">' + renderMonthTabs(month, 'data-rmp-nr-month') + '</div>' +
        '</div>' +
        body +
      '</div>'
    );
  }

  function leasingSortValue(it, key) {
    return String(it[key] || '');
  }

  function sortLeasingItems(items) {
    const key = leasingSort && leasingSort.key;
    const dir = leasingSort && leasingSort.dir === -1 ? -1 : 1;
    if (!key) return items.slice();
    return items.slice().sort(function (a, b) {
      const cmp = leasingSortValue(a, key).localeCompare(
        leasingSortValue(b, key),
        'zh-Hant',
        { numeric: true, sensitivity: 'base' }
      );
      return cmp * dir;
    });
  }

  function leasingSortTh(key, label) {
    const on = leasingSort && leasingSort.key === key;
    const aria = on ? (leasingSort.dir === -1 ? 'descending' : 'ascending') : 'none';
    const mark = on ? (leasingSort.dir === -1 ? ' ▼' : ' ▲') : '';
    return (
      '<th scope="col" class="rmp-nr-sortable' + (on ? ' is-sorted' : '') + '"' +
        ' data-rmp-lease-sort="' + esc(key) + '" aria-sort="' + aria + '" title="點擊排序">' +
        esc(label) + mark +
      '</th>'
    );
  }

  function renderLeasingDetailBody() {
    const nowM = new Date().getMonth() + 1;
    const month = leasingDetailMonth || nowM;
    let body = '';
    if (leasingLoading) {
      body = '<p class="rmp-norenew-empty">明細載入中…</p>';
    } else if (!leasingDetail) {
      body = '<p class="rmp-norenew-empty">尚無明細</p>';
    } else if (!(leasingDetail.items || []).length) {
      body = '<p class="rmp-norenew-empty">本月沒有招租中案件</p>';
    } else {
      const allItems = leasingDetail.items || [];
      if (activeLeasingCity) {
        const still = allItems.some(function (it) {
          return (String(it.city || '').trim() || '（未填縣市）') === activeLeasingCity;
        });
        if (!still) activeLeasingCity = '';
      }
      let filtered = filterByCity(allItems, activeLeasingCity);
      filtered = sortLeasingItems(filtered);
      const rows = filtered.length
        ? filtered.map(function (it) {
            return (
              '<tr>' +
                '<td>' + esc(it.status || '') + '</td>' +
                '<td>' + esc(it.city || '') + '</td>' +
                '<td class="rmp-nr-addr">' + esc(it.address || '') + '</td>' +
                '<td>' + esc(it.matchNo || '') + '</td>' +
                '<td>' + esc(it.leaseEnd || '') + '</td>' +
              '</tr>'
            );
          }).join('')
        : '<tr><td colspan="5" class="rmp-norenew-empty-row">此縣市尚無案件</td></tr>';
      body =
        renderCityChips(allItems, activeLeasingCity, 'data-rmp-lease-city') +
        '<div class="rmp-norenew-detail-scroll">' +
          '<table class="rmp-norenew-detail rmp-norenew-detail--lease" aria-label="招租中案件地址">' +
            '<colgroup>' +
              '<col class="rmp-nr-col-status" /><col class="rmp-nr-col-city" />' +
              '<col class="rmp-nr-col-addr" /><col class="rmp-nr-col-sales" /><col class="rmp-nr-col-type" />' +
            '</colgroup>' +
            '<thead><tr>' +
              leasingSortTh('status', '續約狀態') +
              leasingSortTh('city', '物件縣市') +
              leasingSortTh('address', '租賃地址') +
              leasingSortTh('matchNo', '媒合編號') +
              leasingSortTh('leaseEnd', '租約迄日') +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<p class="rmp-norenew-hint">顯示 ' + filtered.length + '／共 ' + allItems.length + ' 件' +
          (activeLeasingCity ? '（' + esc(activeLeasingCity) + '）' : '') +
          (leasingDetail.fetchedAt ? '｜' + String(leasingDetail.fetchedAt).replace('T', ' ').slice(0, 16) : '') +
          '。點表頭可排序。</p>';
    }

    return (
      '<div class="rmp-norenew-kpi-expand-inner">' +
        '<div class="rmp-month-bar">' +
          '<h3 class="rmp-month-title">招租中案件地址</h3>' +
          '<div class="rmp-week-tabs" role="tablist">' + renderMonthTabs(month, 'data-rmp-lease-month') + '</div>' +
        '</div>' +
        body +
      '</div>'
    );
  }

  function annualNrSortValue(it, key) {
    if (key === 'month') return String(it.month || 0).padStart(2, '0');
    if (key === 'abnormal') {
      if (it.abnormal === true) return '2';
      if (it.abnormal === false) return '1';
      return '0';
    }
    return String(it[key] || '');
  }

  function sortAnnualNrItems(items) {
    const key = annualNrSort && annualNrSort.key;
    const dir = annualNrSort && annualNrSort.dir === -1 ? -1 : 1;
    if (!key) {
      return items.slice().sort(function (a, b) {
        const am = Number(a.month) || 0;
        const bm = Number(b.month) || 0;
        if (am !== bm) return am - bm;
        return String(a.address || '').localeCompare(String(b.address || ''), 'zh-Hant');
      });
    }
    return items.slice().sort(function (a, b) {
      const cmp = annualNrSortValue(a, key).localeCompare(
        annualNrSortValue(b, key),
        'zh-Hant',
        { numeric: true, sensitivity: 'base' }
      );
      return cmp * dir;
    });
  }

  function annualNrSortTh(key, label) {
    const on = annualNrSort && annualNrSort.key === key;
    const aria = on ? (annualNrSort.dir === -1 ? 'descending' : 'ascending') : 'none';
    const mark = on ? (annualNrSort.dir === -1 ? ' ▼' : ' ▲') : '';
    return (
      '<th scope="col" class="rmp-nr-sortable' + (on ? ' is-sorted' : '') + '"' +
        ' data-rmp-ann-sort="' + esc(key) + '" aria-sort="' + aria + '" title="點擊排序">' +
        esc(label) + mark +
      '</th>'
    );
  }

  function renderAnnualMonthChips(allItems) {
    const nowM = new Date().getMonth() + 1;
    const count = {};
    allItems.forEach(function (it) {
      const m = Number(it.month) || 0;
      if (m) count[m] = (count[m] || 0) + 1;
    });
    let html =
      '<div class="rmp-norenew-city-chips" role="tablist" aria-label="月份篩選">' +
        '<button type="button" class="rmp-collect-chip' + (!annualNrMonthFilter ? ' is-active' : '') +
          '" data-rmp-ann-month="0">全部月份 · ' + esc(String(allItems.length)) + '</button>';
    for (let m = 1; m <= nowM; m++) {
      const n = count[m] || 0;
      const on = annualNrMonthFilter === m;
      html +=
        '<button type="button" class="rmp-collect-chip' + (on ? ' is-active' : '') +
          '" data-rmp-ann-month="' + m + '">' + m + '月 · ' + n + '</button>';
    }
    return html + '</div>';
  }

  /** 當月異常轉業件數／比例（分母＝當月應續約；與當月不續約率同一批 KPI） */
  function abnormalTransferStats(cur) {
    const month = cur && cur.m != null ? Number(cur.m) : (new Date().getMonth() + 1);
    const due = cur && cur.due != null ? Number(cur.due) : null;
    if (annualNoRenewDetail) {
      const items = annualNoRenewDetail.items || [];
      const transfer = items.filter(function (it) {
        return it.abnormal === true && Number(it.month) === month;
      }).length;
      const rate =
        due != null && due > 0 ? Math.round((transfer / due) * 1000) / 10 : null;
      return { transfer: transfer, due: due, rate: rate, month: month, loading: false };
    }
    const transfer = cur && cur.abnormalTransfer != null ? Number(cur.abnormalTransfer) : null;
    const rate =
      cur && cur.abnormalRate != null
        ? Number(cur.abnormalRate)
        : (due != null && due > 0 && transfer != null
          ? Math.round((transfer / due) * 1000) / 10
          : null);
    return {
      transfer: transfer,
      due: due,
      rate: rate,
      month: month,
      loading: false
    };
  }

  function renderAnnualNoRenewDetailBody() {
    const nowM = new Date().getMonth() + 1;
    let body = '';
    if (annualNoRenewLoading) {
      body = '<p class="rmp-norenew-empty">明細載入中…</p>';
    } else if (!annualNoRenewDetail) {
      body = '<p class="rmp-norenew-empty">尚無明細</p>';
    } else {
      const sourceAll = (annualNoRenewDetail.items || []).filter(function (it) {
        return it.abnormal === true;
      });
      if (!sourceAll.length) {
        body = '<p class="rmp-norenew-empty">今年尚無標記為異常轉業的案件</p>';
      } else {
        let allItems = sourceAll.slice();
        if (annualNrMonthFilter) {
          allItems = allItems.filter(function (it) {
            return Number(it.month) === annualNrMonthFilter;
          });
        }
        if (activeAnnualNrCity) {
          const still = allItems.some(function (it) {
            return (String(it.city || '').trim() || '（未填縣市）') === activeAnnualNrCity;
          });
          if (!still) activeAnnualNrCity = '';
        }
        let filtered = filterByCity(allItems, activeAnnualNrCity);
        filtered = sortAnnualNrItems(filtered);
        const rows = filtered.length
          ? filtered.map(function (it) {
              const ab = it.abnormal;
              const sel =
                '<select class="rmp-nr-abnormal" data-rmp-match="' + esc(it.matchNo) + '">' +
                  '<option value=""' + (ab == null ? ' selected' : '') + '>未填</option>' +
                  '<option value="1"' + (ab === true ? ' selected' : '') + '>是</option>' +
                  '<option value="0"' + (ab === false ? ' selected' : '') + '>否</option>' +
                '</select>';
              return (
                '<tr class="is-abnormal">' +
                  '<td>' + esc((it.month || '') + '月') + '</td>' +
                  '<td>' + esc(it.status || '') + '</td>' +
                  '<td>' + esc(it.entrustType || '') + '</td>' +
                  '<td>' + esc(it.city || '') + '</td>' +
                  '<td class="rmp-nr-addr">' + esc(it.address || '') + '</td>' +
                  '<td class="rmp-nr-note">' + esc(it.remark || '') + '</td>' +
                  '<td>' + esc(it.sales || '') + '</td>' +
                  '<td>' + sel + '</td>' +
                '</tr>'
              );
            }).join('')
          : '<tr><td colspan="8" class="rmp-norenew-empty-row">此條件尚無案件</td></tr>';
        body =
          renderAnnualMonthChips(sourceAll) +
          renderCityChips(allItems, activeAnnualNrCity, 'data-rmp-ann-city') +
          '<div class="rmp-norenew-detail-scroll">' +
            '<table class="rmp-norenew-detail" aria-label="異常轉業案件地址">' +
              '<colgroup>' +
                '<col class="rmp-nr-col-type" /><col class="rmp-nr-col-status" /><col class="rmp-nr-col-type" />' +
                '<col class="rmp-nr-col-city" /><col class="rmp-nr-col-addr" /><col class="rmp-nr-col-note" />' +
                '<col class="rmp-nr-col-sales" /><col class="rmp-nr-col-abn" />' +
              '</colgroup>' +
              '<thead><tr>' +
                annualNrSortTh('month', '月份') +
                annualNrSortTh('status', '續約狀態') +
                annualNrSortTh('entrustType', '委託形式') +
                annualNrSortTh('city', '物件縣市') +
                annualNrSortTh('address', '租賃地址') +
                annualNrSortTh('remark', '備註') +
                annualNrSortTh('sales', '業務') +
                annualNrSortTh('abnormal', '是否異常轉業') +
              '</tr></thead>' +
              '<tbody>' + rows + '</tbody>' +
            '</table>' +
          '</div>' +
          '<p class="rmp-norenew-hint">顯示 ' + filtered.length + '／篩選池 ' + allItems.length +
            '／異常轉業 ' + sourceAll.length + ' 件（1～' + nowM + '月）' +
            (activeAnnualNrCity ? '｜' + esc(activeAnnualNrCity) : '') +
            (annualNoRenewDetail.fetchedAt
              ? '｜' + String(annualNoRenewDetail.fetchedAt).replace('T', ' ').slice(0, 16)
              : '') +
            '。改為「否／未填」會自本列表移除；點表頭可排序。</p>';
      }
    }

    return (
      '<div class="rmp-norenew-kpi-expand-inner">' +
        '<div class="rmp-month-bar">' +
          '<h3 class="rmp-month-title">異常轉業案件地址</h3>' +
        '</div>' +
        body +
      '</div>'
    );
  }

  function renderNrKpiExpandSlot() {
    if (nrKpiOpen === 'noRenew') {
      return '<div class="rmp-norenew-kpi-expand" data-rmp-nr-expand="noRenew">' + renderNoRenewDetailBody() + '</div>';
    }
    if (nrKpiOpen === 'leasing') {
      return '<div class="rmp-norenew-kpi-expand" data-rmp-nr-expand="leasing">' + renderLeasingDetailBody() + '</div>';
    }
    if (nrKpiOpen === 'annualNoRenew') {
      return (
        '<div class="rmp-norenew-kpi-expand" data-rmp-nr-expand="annualNoRenew">' +
          renderAnnualNoRenewDetailBody() +
        '</div>'
      );
    }
    return '';
  }

  function bindNoRenewExpandHandlers(wrap) {
    $all('[data-rmp-nr-month]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const m = Number(btn.getAttribute('data-rmp-nr-month'));
        if (!m) return;
        loadAndShowNoRenewDetail(m);
      });
    });
    $all('[data-rmp-nr-city]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const next = btn.getAttribute('data-rmp-nr-city') || '';
        activeNoRenewCity = activeNoRenewCity === next ? '' : next;
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-nr-sort]', wrap).forEach(function (th) {
      th.addEventListener('click', function (e) {
        e.stopPropagation();
        const key = th.getAttribute('data-rmp-nr-sort') || '';
        if (!key) return;
        if (noRenewSort.key === key) {
          noRenewSort = { key: key, dir: noRenewSort.dir === 1 ? -1 : 1 };
        } else {
          noRenewSort = { key: key, dir: 1 };
        }
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-lease-month]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const m = Number(btn.getAttribute('data-rmp-lease-month'));
        if (!m) return;
        loadAndShowLeasingDetail(m);
      });
    });
    $all('[data-rmp-lease-city]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const next = btn.getAttribute('data-rmp-lease-city') || '';
        activeLeasingCity = activeLeasingCity === next ? '' : next;
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-lease-sort]', wrap).forEach(function (th) {
      th.addEventListener('click', function (e) {
        e.stopPropagation();
        const key = th.getAttribute('data-rmp-lease-sort') || '';
        if (!key) return;
        if (leasingSort.key === key) {
          leasingSort = { key: key, dir: leasingSort.dir === 1 ? -1 : 1 };
        } else {
          leasingSort = { key: key, dir: 1 };
        }
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-ann-month]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const m = Number(btn.getAttribute('data-rmp-ann-month')) || 0;
        annualNrMonthFilter = m === 0 ? 0 : (annualNrMonthFilter === m ? 0 : m);
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-ann-city]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const next = btn.getAttribute('data-rmp-ann-city') || '';
        activeAnnualNrCity = activeAnnualNrCity === next ? '' : next;
        renderNoRenewDashboard();
      });
    });
    $all('[data-rmp-ann-sort]', wrap).forEach(function (th) {
      th.addEventListener('click', function (e) {
        e.stopPropagation();
        const key = th.getAttribute('data-rmp-ann-sort') || '';
        if (!key) return;
        if (annualNrSort.key === key) {
          annualNrSort = { key: key, dir: annualNrSort.dir === 1 ? -1 : 1 };
        } else {
          annualNrSort = { key: key, dir: 1 };
        }
        renderNoRenewDashboard();
      });
    });
    $all('.rmp-nr-abnormal', wrap).forEach(function (sel) {
      sel.addEventListener('change', function (e) {
        e.stopPropagation();
        const api = dataApi();
        const matchNo = sel.getAttribute('data-rmp-match');
        if (!api || !api.setNoRenewAbnormal || !matchNo) return;
        const v = sel.value;
        const abnormal = v === '' ? null : v === '1';
        sel.disabled = true;
        api.setNoRenewAbnormal(matchNo, abnormal)
          .then(function () {
            function patch(list) {
              if (!list) return;
              list.forEach(function (it) {
                if (it.matchNo === matchNo) it.abnormal = abnormal;
              });
            }
            if (noRenewDetail) patch(noRenewDetail.items);
            if (annualNoRenewDetail) patch(annualNoRenewDetail.items);
            renderNoRenewDashboard();
            if (api.refreshRenewAbnormalOverlay && cache && cache.modules && cache.modules.renew) {
              const renewMod = cache.modules.renew;
              const monthHint = noRenewDetailMonth || new Date().getMonth() + 1;
              return api.refreshRenewAbnormalOverlay(renewMod.byMonth, monthHint).then(function () {
                renewLastModData = renewMod;
                if (renewLastMod && activeModule === 'renew') {
                  renderRenewMonths(renewLastMod, renewMod);
                }
              });
            }
          })
          .catch(function (err) {
            alert(err && err.message ? err.message : '寫入失敗');
            if (nrKpiOpen === 'annualNoRenew') loadAnnualNoRenewDetail(true);
            else loadAndShowNoRenewDetail(noRenewDetailMonth);
          })
          .then(function () {
            sel.disabled = false;
          });
      });
    });
  }

  function toggleNrKpi(kind) {
    if (nrKpiOpen === kind) {
      nrKpiOpen = null;
      renderNoRenewDashboard();
      return;
    }
    nrKpiOpen = kind;
    const nowM = new Date().getMonth() + 1;
    if (kind === 'annualNoRenew') {
      /* 展開時預設看當月異常轉業 */
      const curM = (noRenewDash && noRenewDash.currentMonth && noRenewDash.currentMonth.m) || nowM;
      annualNrMonthFilter = Number(curM) || nowM;
    }
    renderNoRenewDashboard();
    if (kind === 'noRenew' && !noRenewDetail) {
      loadAndShowNoRenewDetail(noRenewDetailMonth || nowM);
    } else if (kind === 'leasing' && !leasingDetail) {
      loadAndShowLeasingDetail(leasingDetailMonth || nowM);
    } else if (kind === 'annualNoRenew' && !annualNoRenewDetail) {
      loadAnnualNoRenewDetail(false);
    }
  }

  function renderNoRenewDashboard() {
    /* 非同步載入完成時若已切走其他分頁，不可覆蓋目前內容 */
    if (activeModule !== 'noRenew') return;
    const wrap = $('#rmp-table-wrap');
    if (!wrap) return;
    const dash = noRenewDash;
    const ann = (dash && dash.annual) || {};
    const cur = (dash && dash.currentMonth) || {};
    const curLabel = (cur.m != null ? cur.m : (new Date().getMonth() + 1)) + '月';
    const openNo = nrKpiOpen === 'noRenew';
    const openLease = nrKpiOpen === 'leasing';
    const openAnn = nrKpiOpen === 'annualNoRenew';
    const abn = abnormalTransferStats(cur);
    const cards =
      '<div class="rmp-norenew-kpis">' +
        '<button type="button" class="rmp-norenew-kpi is-expandable' + (openNo ? ' is-open' : '') + '"' +
          ' data-rmp-nr-kpi="noRenew" aria-expanded="' + (openNo ? 'true' : 'false') + '">' +
          '<div class="rmp-norenew-kpi-top">' +
            '<div class="rmp-kpi-label">當月不續約率</div>' +
            '<span class="rmp-norenew-kpi-chev" aria-hidden="true">' + (openNo ? '收合' : '展開') + '</span>' +
          '</div>' +
          '<div class="rmp-kpi-value">' + (cur.noRenewRate == null ? EMPTY : esc(fmtPct(cur.noRenewRate))) + '</div>' +
          '<div class="rmp-norenew-kpi-sub">' + esc(curLabel) +
            '｜去年同期 ' + esc(fmtPct(cur.lyNoRenewRate)) + '</div>' +
        '</button>' +
        '<button type="button" class="rmp-norenew-kpi is-expandable' + (openLease ? ' is-open' : '') + '"' +
          ' data-rmp-nr-kpi="leasing" aria-expanded="' + (openLease ? 'true' : 'false') + '">' +
          '<div class="rmp-norenew-kpi-top">' +
            '<div class="rmp-kpi-label">招租中比例</div>' +
            '<span class="rmp-norenew-kpi-chev" aria-hidden="true">' + (openLease ? '收合' : '展開') + '</span>' +
          '</div>' +
          '<div class="rmp-kpi-value">' + (ann.leaseRate == null ? EMPTY : esc(fmtPct(ann.leaseRate))) + '</div>' +
          '<div class="rmp-norenew-kpi-sub">應續約 ' +
            (ann.due == null ? EMPTY : esc(ann.due)) +
            ' 件中，招租中 ' +
            (ann.leasing == null ? EMPTY : esc(ann.leasing)) +
            ' 件</div>' +
        '</button>' +
        '<button type="button" class="rmp-norenew-kpi is-expandable' + (openAnn ? ' is-open' : '') + '"' +
          ' data-rmp-nr-kpi="annualNoRenew" aria-expanded="' + (openAnn ? 'true' : 'false') + '">' +
          '<div class="rmp-norenew-kpi-top">' +
            '<div class="rmp-kpi-label">當月異常轉業者比例</div>' +
            '<span class="rmp-norenew-kpi-chev" aria-hidden="true">' + (openAnn ? '收合' : '展開') + '</span>' +
          '</div>' +
          '<div class="rmp-kpi-value">' +
            (abn.rate == null ? EMPTY : esc(fmtPct(abn.rate))) +
          '</div>' +
          '<div class="rmp-norenew-kpi-sub">' + esc(curLabel) +
            '｜異常轉業 ' +
            (abn.transfer == null ? EMPTY : esc(String(abn.transfer))) +
            ' 件｜應續約 ' +
            (abn.due == null ? EMPTY : esc(abn.due)) +
            ' 件</div>' +
        '</button>' +
        renderNrKpiExpandSlot() +
      '</div>';

    wrap.innerHTML =
      '<div class="rmp-norenew-panel">' +
        '<p class="rmp-renew-hint">去年同期與過去月份實績（含招租中／不續約件數與占比）＝試算表；當月＝公司系統（每天早上 8 點更新）。點「當月不續約率／招租中比例／當月異常轉業者比例」可展開案件地址。當月異常轉業比例＝當月已標記異常轉業÷當月應續約。</p>' +
        cards +
        renderNoRenewChart(dash) +
        renderNoRenewMonthTable(dash) +
      '</div>';

    $all('[data-rmp-nr-kpi]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kind = btn.getAttribute('data-rmp-nr-kpi');
        if (kind) toggleNrKpi(kind);
      });
    });
    bindNoRenewExpandHandlers(wrap);
  }

  function loadAndShowNoRenewDetail(month) {
    const api = dataApi();
    if (!api || !api.fetchNoRenewDetail) return;
    noRenewDetailMonth = month;
    noRenewLoading = true;
    renderNoRenewDashboard();
    const reqMonth = month;
    const timer = setTimeout(function () {
      if (!noRenewLoading || noRenewDetailMonth !== reqMonth) return;
      noRenewDetail = { items: [], error: '載入逾時，請再點一次月份重試' };
      noRenewLoading = false;
      if (activeModule === 'noRenew') renderNoRenewDashboard();
    }, 25000);
    api.fetchNoRenewDetail(month)
      .then(function (data) {
        clearTimeout(timer);
        if (noRenewDetailMonth !== reqMonth) return;
        noRenewDetail = data;
        noRenewLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (noRenewDetailMonth !== reqMonth) return;
        noRenewDetail = { items: [], error: err && err.message };
        noRenewLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      });
  }

  function loadAnnualNoRenewDetail(force) {
    const api = dataApi();
    if (!api || !api.fetchNoRenewDetail) return;
    if (annualNoRenewDetail && !force) {
      renderNoRenewDashboard();
      return;
    }
    const nowM = new Date().getMonth() + 1;
    annualNoRenewLoading = true;
    renderNoRenewDashboard();
    const months = [];
    for (let m = 1; m <= nowM; m++) months.push(m);
    Promise.all(
      months.map(function (m) {
        return api.fetchNoRenewDetail(m).then(
          function (data) {
            return { m: m, items: (data && data.items) || [], fetchedAt: data && data.fetchedAt };
          },
          function () {
            return { m: m, items: [], fetchedAt: null };
          }
        );
      })
    )
      .then(function (packs) {
        const items = [];
        let fetchedAt = null;
        packs.forEach(function (pack) {
          if (pack.fetchedAt) fetchedAt = pack.fetchedAt;
          (pack.items || []).forEach(function (it) {
            items.push(Object.assign({}, it, { month: pack.m }));
          });
        });
        annualNoRenewDetail = { items: items, fetchedAt: fetchedAt };
        annualNoRenewLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      })
      .catch(function (err) {
        annualNoRenewDetail = { items: [], error: err && err.message };
        annualNoRenewLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      });
  }

  function loadAndShowLeasingDetail(month) {
    const api = dataApi();
    if (!api || !api.fetchRenewKpiDetail) return;
    leasingDetailMonth = month;
    leasingLoading = true;
    renderNoRenewDashboard();
    api.fetchRenewKpiDetail({
      year: 115,
      month: Number(month) || 1,
      region: 'all',
      metric: 'leasing'
    })
      .then(function (data) {
        leasingDetail = {
          items: (data && data.items) || [],
          fetchedAt: data && data.fetchedAt
        };
        leasingLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      })
      .catch(function (err) {
        leasingDetail = { items: [], error: err && err.message };
        leasingLoading = false;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      });
  }

  function ensureNoRenewLoaded() {
    const api = dataApi();
    if (!api || !api.loadNoRenewDashboard) return;
    const wantVer = (api.NORENEW_SHEET_VER) || '20261026-abn-month';
    if (noRenewDash && noRenewDash.sheetVer === wantVer) {
      renderNoRenewDashboard();
      return;
    }
    noRenewDash = null;
    const wrap = $('#rmp-table-wrap');
    if (wrap) wrap.innerHTML = '<p class="rmp-norenew-empty">載入不續約儀表板…</p>';
    api.loadNoRenewDashboard()
      .then(function (dash) {
        noRenewDash = dash;
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      })
      .catch(function () {
        noRenewDash = buildEmptyDashFallback();
        if (activeModule === 'noRenew') renderNoRenewDashboard();
      });
  }

  function moneyFmt(n) {
    const x = Number(n) || 0;
    return '$' + Math.round(x).toLocaleString('zh-TW');
  }

  function numFmt(n) {
    return Number(n || 0).toLocaleString('zh-TW');
  }

  function renderCollectDashboard() {
    if (activeModule !== 'collect') return;
    const wrap = $('#rmp-table-wrap');
    const cardsWrap = $('#rmp-cards');
    if (cardsWrap) {
      cardsWrap.innerHTML = '';
      cardsWrap.hidden = true;
    }
    if (!wrap) return;

    if (collectLoading && !collectDash) {
      wrap.innerHTML = '<p class="rmp-collect-empty">催收資料載入中…</p>';
      return;
    }
    if (!collectDash || collectDash.error) {
      wrap.innerHTML =
        '<div class="rmp-collect-empty">' +
          '<p>' + esc((collectDash && collectDash.error) || '無資料') + '</p>' +
        '</div>';
      return;
    }

    const s = collectDash.summary || {};
    const asOf = collectDash.asOf || EMPTY;
    const synced = collectDash.syncedAt
      ? new Date(collectDash.syncedAt).toLocaleString('zh-TW', { hour12: false })
      : EMPTY;
    const cities = s.cities || [];
    const allCases = s.cases || collectDash.cases || [];
    const cityOk = cities.some(function (c) { return c.name === activeCollectCity; });
    if (activeCollectCity && !cityOk) activeCollectCity = '';
    const filtered = activeCollectCity
      ? allCases.filter(function (c) { return c.city === activeCollectCity; })
      : allCases;
    const cityMax = Math.max(1, ...cities.map(function (c) { return Number(c.amount) || 0; }));

    const kpiHtml =
      '<div class="rmp-collect-kpis">' +
        '<article class="rmp-collect-kpi accent-blue">' +
          '<div class="rmp-ck-label">有效呆帳案件</div>' +
          '<div class="rmp-ck-value">' + esc(numFmt(s.caseCount)) + '</div>' +
          '<div class="rmp-ck-sub">' + esc(numFmt(s.lineCount)) + ' 筆應收明細</div>' +
        '</article>' +
        '<article class="rmp-collect-kpi accent-teal">' +
          '<div class="rmp-ck-label">欠款總金額</div>' +
          '<div class="rmp-ck-value">' + esc(moneyFmt(s.amount)) + '</div>' +
          '<div class="rmp-ck-sub">依公司檔「欠款金額」</div>' +
        '</article>' +
        '<article class="rmp-collect-kpi accent-amber">' +
          '<div class="rmp-ck-label">14天以下案件</div>' +
          '<div class="rmp-ck-value">' + esc(numFmt((s.under14 && s.under14.cases) || 0)) + '</div>' +
          '<div class="rmp-ck-sub">' + esc(moneyFmt((s.under14 && s.under14.amount) || 0)) + '</div>' +
        '</article>' +
        '<article class="rmp-collect-kpi accent-orange">' +
          '<div class="rmp-ck-label">14天到29天案件</div>' +
          '<div class="rmp-ck-value">' + esc(numFmt((s.day14to29 && s.day14to29.cases) || 0)) + '</div>' +
          '<div class="rmp-ck-sub">' + esc(moneyFmt((s.day14to29 && s.day14to29.amount) || 0)) + '</div>' +
        '</article>' +
        '<article class="rmp-collect-kpi accent-red">' +
          '<div class="rmp-ck-label">30天以上案件</div>' +
          '<div class="rmp-ck-value">' + esc(numFmt((s.over30 && s.over30.cases) || 0)) + '</div>' +
          '<div class="rmp-ck-sub">' + esc(moneyFmt((s.over30 && s.over30.amount) || 0)) + '</div>' +
        '</article>' +
        '<article class="rmp-collect-kpi accent-violet">' +
          '<div class="rmp-ck-label">請法務協助</div>' +
          '<div class="rmp-ck-value">' + esc(numFmt((s.legalAssist && s.legalAssist.cases) || 0)) + '</div>' +
          '<div class="rmp-ck-sub">' + esc(moneyFmt((s.legalAssist && s.legalAssist.amount) || 0)) +
            '｜催收狀態勾選</div>' +
        '</article>' +
      '</div>';

    const cityChipHtml =
      '<div class="rmp-collect-city-chips" role="tablist" aria-label="縣市篩選">' +
        '<button type="button" class="rmp-collect-chip' + (!activeCollectCity ? ' is-active' : '') +
          '" data-rmp-collect-city="">全部縣市 · ' + esc(numFmt(allCases.length)) + '</button>' +
        cities.map(function (c) {
          const on = activeCollectCity === c.name;
          return (
            '<button type="button" class="rmp-collect-chip' + (on ? ' is-active' : '') +
              '" data-rmp-collect-city="' + esc(c.name) + '">' +
              esc(c.name) + ' · ' + esc(numFmt(c.cases)) +
            '</button>'
          );
        }).join('') +
      '</div>';

    const cityBars =
      '<div class="rmp-collect-gauge-grid" role="list">' +
        (cities.length
          ? cities.map(function (c) {
              const pctRaw = ((Number(c.amount) || 0) / cityMax) * 100;
              const pct = Math.max(0, Math.min(100, pctRaw));
              const ringPct = Math.max(3, pct);
              const on = activeCollectCity === c.name;
              const tone = Number(c.over30) > 0 ? 'bad' : (Number(c.cases) > 0 ? 'warn' : 'ok');
              return (
                '<button type="button" role="listitem" class="rmp-collect-gauge tone-' + tone +
                  (on ? ' is-active' : '') +
                  '" data-rmp-collect-city="' + esc(c.name) + '"' +
                  ' style="--gauge-pct:' + ringPct.toFixed(1) + '">' +
                  '<div class="rmp-cg-ring" aria-hidden="true">' +
                    '<span class="rmp-cg-ring-inner">' +
                      '<b>' + esc(pct.toFixed(0)) + '%</b>' +
                      '<small>曝險</small>' +
                    '</span>' +
                  '</div>' +
                  '<div class="rmp-cg-body">' +
                    '<div class="rmp-cg-title">' +
                      '<strong>' + esc(c.name) + '</strong>' +
                      '<span>' + esc(numFmt(c.cases)) + ' 案</span>' +
                    '</div>' +
                    '<div class="rmp-cg-amount">' + esc(moneyFmt(c.amount)) + '</div>' +
                    '<div class="rmp-cg-meta">30天+ ' + esc(numFmt(c.over30)) + ' 案</div>' +
                  '</div>' +
                '</button>'
              );
            }).join('')
          : '<p class="rmp-collect-empty">無縣市資料</p>') +
      '</div>';

    collectCaseById = {};
    filtered.forEach(function (c) {
      if (c && c.caseId) collectCaseById[String(c.caseId)] = c;
    });
    const caseIdOk = filtered.some(function (c) { return String(c.caseId) === String(activeCollectCaseId); });
    if (activeCollectCaseId && !caseIdOk) activeCollectCaseId = '';

    const caseRows = filtered.length
      ? filtered.map(function (c) {
          const noteText = String(c.note || '').replace(/\s+/g, ' ').trim();
          const cid = String(c.caseId || '');
          const lines = Array.isArray(c.lines) ? c.lines : [];
          const lineN = lines.length || Number(c.lineCount) || 0;
          const notePreview = noteText
            ? (noteText.length > 28 ? noteText.slice(0, 28) + '…' : noteText)
            : '—';
          const lineBadge = lineN > 1
            ? '<span class="rmp-collect-line-badge">' + esc(numFmt(lineN)) + ' 筆</span>'
            : '';
          return (
            '<tr class="rmp-collect-case-row"' +
              ' data-rmp-collect-case="' + esc(cid) + '"' +
              ' data-rmp-line-n="' + esc(String(lineN)) + '"' +
              ' tabindex="0" role="button"' +
              ' aria-expanded="false"' +
              ' title="點擊向下展開應收明細">' +
              '<td class="num">' + esc(numFmt(c.maxDays)) + '</td>' +
              '<td class="amount"><span class="rmp-collect-amt">' + esc(moneyFmt(c.amount)) + '</span>' +
                lineBadge + '</td>' +
              '<td class="left nowrap">' + esc(c.dueDate || '—') + '</td>' +
              '<td class="left nowrap">' + esc(c.city || '—') + '</td>' +
              '<td class="left nowrap">' + esc(c.staff || '—') + '</td>' +
              '<td class="left nowrap">' + esc(c.tenant || '—') + '</td>' +
              '<td class="left rmp-collect-addr" title="' + esc(c.address || '') + '">' +
                esc(c.address || '—') +
              '</td>' +
              '<td class="left rmp-collect-note">' +
                '<span class="rmp-collect-note-preview">' + esc(notePreview) + '</span>' +
                '<span class="rmp-collect-expand-hint">' +
                  (lineN > 1 ? '展開 ' + numFmt(lineN) + ' 筆' : '展開') +
                '</span>' +
              '</td>' +
              '<td class="rmp-collect-cstatus">' + collectStatusSelectHtml(cid, c.collectStatus) + '</td>' +
              '<td class="rmp-collect-actions">' + collectDocActionHtml(c) + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="10" class="rmp-empty-row">此縣市尚無案件</td></tr>';

    wrap.innerHTML =
      '<section class="rmp-collect" aria-label="催收總覽">' +
        '<div class="rmp-collect-head">' +
          '<div>' +
            '<h3 class="rmp-collect-title">' +
              esc((collectDash.scopeLabel || '業務支援管理部') + '｜呆帳催收') +
            '</h3>' +
            '<p class="rmp-collect-meta">僅列 ' + esc(collectDash.scopeLabel || '業務支援管理部') +
              '｜資料日 ' + esc(asOf) + '｜同步 ' + esc(synced) + '</p>' +
          '</div>' +
        '</div>' +
        '<section class="rmp-collect-dashboard" aria-label="催收儀表板">' +
          '<div class="rmp-collect-dash-hd">' +
            '<div>' +
              '<h4>儀表板</h4>' +
              '<p>總覽 KPI 與各地區曝險；點縣市可篩選下方明細</p>' +
            '</div>' +
          '</div>' +
          kpiHtml +
          cityBars +
        '</section>' +
        '<article class="rmp-collect-panel rmp-collect-detail">' +
          '<div class="rmp-cp-hd">' +
            '<div>' +
              '<h4>各地區明細</h4>' +
              '<p>目前 ' + esc(activeCollectCity || '全部縣市') +
                '｜' + esc(numFmt(filtered.length)) + ' 案' +
                (filtered.length !== allCases.length ? '／全部 ' + esc(numFmt(allCases.length)) + ' 案' : '') +
                '｜點列展開各筆應收天數與金額' +
              '</p>' +
            '</div>' +
          '</div>' +
          '<div class="rmp-cp-body rmp-cp-body--chips">' + cityChipHtml + '</div>' +
          '<div class="rmp-month-scroll rmp-collect-scroll">' +
            '<table class="rmp-collect-table rmp-collect-cases" aria-label="各地區催收明細">' +
              '<colgroup>' +
                '<col class="rmp-cc-days" /><col class="rmp-cc-amt" />' +
                '<col class="rmp-cc-date" />' +
                '<col class="rmp-cc-city" /><col class="rmp-cc-staff" /><col class="rmp-cc-tenant" />' +
                '<col class="rmp-cc-addr" /><col class="rmp-cc-note" />' +
                '<col class="rmp-cc-cstatus" /><col class="rmp-cc-act" />' +
              '</colgroup>' +
              '<thead><tr>' +
                '<th class="num">欠租天數</th><th class="num">欠款金額</th>' +
                '<th class="left">應收款日</th><th class="left">縣市</th>' +
                '<th class="left">代管人員</th><th class="left">承租人</th>' +
                '<th class="left">租賃地址</th><th class="left">備註</th>' +
                '<th>催收狀態</th><th>操作</th>' +
              '</tr></thead>' +
              '<tbody>' + caseRows + '</tbody>' +
            '</table>' +
          '</div>' +
        '</article>' +
      '</section>';

    $all('[data-rmp-collect-city]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = btn.getAttribute('data-rmp-collect-city') || '';
        activeCollectCity = activeCollectCity === next ? '' : next;
        activeCollectCaseId = '';
        renderCollectDashboard();
      });
    });

    $all('[data-rmp-collect-case]', wrap).forEach(function (row) {
      function toggleCase() {
        toggleCollectCaseExpand(row);
      }
      row.addEventListener('click', toggleCase);
      row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          toggleCase();
        }
      });
    });

    $all('[data-rmp-doc]', wrap).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const kind = btn.getAttribute('data-rmp-doc') || '';
        const caseId = btn.getAttribute('data-rmp-case') || '';
        openCollectDocTemplate(kind, caseId);
      });
    });

    $all('.rmp-collect-status-sel', wrap).forEach(function (sel) {
      sel.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      sel.addEventListener('mousedown', function (ev) {
        ev.stopPropagation();
      });
      sel.addEventListener('change', function (ev) {
        ev.stopPropagation();
        const api = dataApi();
        const caseId = sel.getAttribute('data-rmp-case') || '';
        if (!api || !api.setCollectStatus || !caseId) return;
        const status = sel.value || '';
        sel.className = 'rmp-collect-status-sel tone-' + collectStatusTone(status);
        sel.disabled = true;
        api.setCollectStatus(caseId, status)
          .then(function () {
            const c = findCollectCase(caseId);
            if (c) c.collectStatus = status || null;
            if (collectDash && collectDash.cases) {
              collectDash.cases.forEach(function (it) {
                if (String(it.caseId) === String(caseId)) it.collectStatus = status || null;
              });
            }
            /* 狀態變更後重算 KPI（含請法務協助件數） */
            if (collectDash && api.summarizeCollectCases) {
              collectDash.summary = api.summarizeCollectCases(collectDash.cases || []);
            }
            if (activeModule === 'collect') renderCollectDashboard();
          })
          .catch(function (err) {
            alert(err && err.message ? err.message : '寫入失敗');
            collectDash = null;
            ensureCollectLoaded();
          })
          .then(function () {
            sel.disabled = false;
          });
      });
    });

    if (activeCollectCaseId) {
      const openRow = wrap.querySelector(
        '[data-rmp-collect-case="' + activeCollectCaseId.replace(/"/g, '\\"') + '"]'
      );
      if (openRow) toggleCollectCaseExpand(openRow, true);
    }
  }

  /** 與 AI 催收儀表板相同：欠租 ≥14 天才可套版 */
  function collectDocEligible(c) {
    return (Number(c && c.maxDays) || 0) >= 14;
  }

  function collectDocActionHtml(c) {
    if (!collectDocEligible(c)) {
      return '<span class="rmp-collect-act-empty">—</span>';
    }
    const id = esc(c.caseId || '');
    return (
      '<span class="rmp-collect-row-actions">' +
        '<button type="button" class="rmp-doc-btn rmp-doc-visit" data-rmp-doc="visit" data-rmp-case="' + id + '">家訪單</button>' +
        '<button type="button" class="rmp-doc-btn rmp-doc-letter" data-rmp-doc="letter" data-rmp-case="' + id + '">存證信函</button>' +
        '<button type="button" class="rmp-doc-btn rmp-doc-ep" data-rmp-doc="ep" data-rmp-case="' + id + '">民事訴狀(強制執行)</button>' +
      '</span>'
    );
  }

  function findCollectCase(caseId) {
    const list = (collectDash && collectDash.cases) || [];
    return list.find(function (x) { return String(x.caseId) === String(caseId); }) || null;
  }

  function openCollectDocTemplate(kind, caseId) {
    const c = findCollectCase(caseId);
    if (!c) {
      window.alert('找不到案件');
      return;
    }
    if (!collectDocEligible(c)) {
      window.alert('需欠租 14 天以上才可產生文件');
      return;
    }
    const payload = {
      type: kind === 'visit' ? 'visit' : kind === 'letter' ? 'letter' : 'ep',
      caseId: c.caseId || '',
      tenant: c.tenant || '',
      address: c.address || '',
      staff: c.staff || '',
      city: c.city || '',
      office: c.office || '',
      amount: c.amount || 0,
      maxDays: c.maxDays || 0,
      leaseStart: c.leaseStart || '',
      leaseEnd: c.leaseEnd || '',
      typeLabel: c.type || '',
      dueDate: c.dueDate || '',
      note: c.note || '',
      lines: Array.isArray(c.lines) ? c.lines : []
    };
    try {
      sessionStorage.setItem('skyfun_arrears_prefill', JSON.stringify(payload));
    } catch (e) { /* ignore quota */ }

    if (kind === 'visit') {
      if (typeof showPage === 'function') showPage('care-visit-notice');
      return;
    }
    if (kind === 'letter') {
      if (typeof showPage === 'function') showPage('lal-generator');
      return;
    }
    if (typeof showPage === 'function') showPage('collection-case');
  }

  function buildCollectExpandHtml(c) {
    if (!c) return '';
    const noteText = String(c.note || '').replace(/\s+/g, ' ').trim();
    const cid = String(c.caseId || '');
    const lines = Array.isArray(c.lines) ? c.lines : [];
    const lineN = lines.length || Number(c.lineCount) || 0;
    const lineRowsHtml = lines.length
      ? lines.map(function (ln, i) {
          return (
            '<tr>' +
              '<td class="num">' + esc(numFmt(ln.sourceRow || (i + 1))) + '</td>' +
              '<td class="num">' + esc(numFmt(ln.days)) + '</td>' +
              '<td class="left nowrap">' + esc(ln.dueDate || '—') + '</td>' +
              '<td class="num">' + esc(moneyFmt(ln.rent)) + '</td>' +
              '<td class="num">' + esc(moneyFmt(ln.receivable)) + '</td>' +
              '<td class="left nowrap">' + esc(ln.paidDate || '—') + '</td>' +
              '<td class="num">' + esc(moneyFmt(ln.paid)) + '</td>' +
              '<td class="amount">' + esc(moneyFmt(ln.arrears)) + '</td>' +
              '<td class="left">' + esc(ln.status || '—') + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="9" class="rmp-empty-row">無應收明細</td></tr>';
    return (
      '<tr class="rmp-collect-expand-row" data-rmp-expand-for="' + esc(cid) + '">' +
        '<td colspan="10">' +
          '<div class="rmp-collect-expand-body">' +
            '<div class="rmp-collect-expand-grid">' +
              '<div><span>案號</span><b>' + esc(cid || '—') + '</b></div>' +
              '<div><span>最長欠租</span><b>' + esc(numFmt(c.maxDays)) + ' 天</b></div>' +
              '<div><span>欠款合計</span><b class="amount">' + esc(moneyFmt(c.amount)) + '</b></div>' +
              '<div><span>應收筆數</span><b>' + esc(numFmt(lineN)) + '</b></div>' +
              '<div><span>應收款日</span><b>' + esc(c.dueDate || '—') + '</b></div>' +
              '<div><span>縣市</span><b>' + esc(c.city || '—') + '</b></div>' +
              '<div><span>營業處</span><b>' + esc(c.office || '—') + '</b></div>' +
              '<div><span>代管人員</span><b>' + esc(c.staff || '—') + '</b></div>' +
              '<div><span>承租人</span><b>' + esc(c.tenant || '—') + '</b></div>' +
            '</div>' +
            (collectDocEligible(c)
              ? '<div class="rmp-collect-expand-actions">' + collectDocActionHtml(c) + '</div>'
              : '') +
            '<div class="rmp-collect-expand-block">' +
              '<span>租賃地址</span>' +
              '<p>' + esc(c.address || '—') + '</p>' +
            '</div>' +
            '<div class="rmp-collect-expand-block">' +
              '<span>備註（完整）</span>' +
              '<p>' + esc(noteText || '—') + '</p>' +
            '</div>' +
            '<div class="rmp-collect-lines-wrap">' +
              '<div class="rmp-collect-lines-hd">' +
                '<strong>應收明細</strong>' +
                '<span>' + esc(numFmt(lineN)) + ' 筆</span>' +
              '</div>' +
              '<div class="rmp-collect-lines-scroll">' +
                '<table class="rmp-collect-lines" aria-label="應收明細">' +
                  '<thead><tr>' +
                    '<th class="num">資料列</th><th class="num">欠租天數</th>' +
                    '<th class="left">應收款日</th><th class="num">租金</th>' +
                    '<th class="num">應收金額</th><th class="left">實收款日</th>' +
                    '<th class="num">實收金額</th><th class="num">欠款金額</th>' +
                    '<th class="left">催收狀態</th>' +
                  '</tr></thead>' +
                  '<tbody>' + lineRowsHtml + '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }

  function setCollectRowHint(row, open) {
    if (!row) return;
    const hint = row.querySelector('.rmp-collect-expand-hint');
    const lineN = Number(row.getAttribute('data-rmp-line-n') || 0);
    row.classList.toggle('is-open', !!open);
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (hint) {
      hint.textContent = open ? '收合' : (lineN > 1 ? '展開 ' + numFmt(lineN) + ' 筆' : '展開');
    }
  }

  /** 就地展開／收合，不重繪整頁，避免版面跳動 */
  function toggleCollectCaseExpand(row, forceOpen) {
    if (!row) return;
    const cid = row.getAttribute('data-rmp-collect-case') || '';
    if (!cid) return;
    const tbody = row.parentNode;
    if (!tbody) return;
    const existing = tbody.querySelector('.rmp-collect-expand-row');
    const isSameOpen = existing && existing.getAttribute('data-rmp-expand-for') === cid;
    const wantOpen = forceOpen === true ? true : forceOpen === false ? false : !isSameOpen;

    if (existing) {
      const prevId = existing.getAttribute('data-rmp-expand-for') || '';
      const prevRow = tbody.querySelector('[data-rmp-collect-case="' + prevId.replace(/"/g, '\\"') + '"]');
      existing.parentNode.removeChild(existing);
      setCollectRowHint(prevRow, false);
    }

    if (!wantOpen) {
      activeCollectCaseId = '';
      setCollectRowHint(row, false);
      return;
    }

    const c = collectCaseById[cid];
    if (!c) return;
    const html = buildCollectExpandHtml(c);
    const tmp = document.createElement('tbody');
    tmp.innerHTML = html;
    const expandRow = tmp.firstElementChild;
    if (!expandRow) return;
    if (row.nextSibling) tbody.insertBefore(expandRow, row.nextSibling);
    else tbody.appendChild(expandRow);
    activeCollectCaseId = cid;
    setCollectRowHint(row, true);
    $all('[data-rmp-doc]', expandRow).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openCollectDocTemplate(btn.getAttribute('data-rmp-doc') || '', btn.getAttribute('data-rmp-case') || '');
      });
    });
  }

  function ensureCollectLoaded() {
    const api = dataApi();
    if (!api || !api.loadCollectDashboard) {
      collectDash = { error: '催收模組未載入' };
      renderCollectDashboard();
      return;
    }
    if (collectDash && collectDash.loaded && !collectDash.error) {
      renderCollectDashboard();
      return;
    }
    if (collectLoading) {
      renderCollectDashboard();
      return;
    }
    collectLoading = true;
    renderCollectDashboard();
    api.loadCollectDashboard().then(function (payload) {
      collectLoading = false;
      collectDash = payload;
      if (activeModule === 'collect') renderCollectDashboard();
    }).catch(function (err) {
      collectLoading = false;
      collectDash = { error: (err && err.message) || '催收資料載入失敗' };
      if (activeModule === 'collect') renderCollectDashboard();
    });
  }

  function buildEmptyDashFallback() {
    const api = dataApi();
    if (api && api.loadNoRenewDashboard) {
      /* loadNoRenewDashboard already merges sheet YoY even if live null via catch upstream */
    }
    return {
      year: 115,
      months: [],
      annual: {},
      chart: { labels: [], lyRates: [], actRates: [], leaseRates: [] }
    };
  }

  function renderModule(moduleId) {
    const api = dataApi();
    if (!api) return;
    const mod = api.MODULES[moduleId];
    if (!mod) return;
    activeModule = moduleId;
    setActiveNav(moduleId);
    const modData = cache && cache.modules ? cache.modules[moduleId] : null;
    if (mod.layout === 'overview') {
      renderOverview(mod, modData);
      return;
    }
    if (mod.layout === 'collectDashboard') {
      ensureCollectLoaded();
      return;
    }
    if (mod.layout === 'orgChart') {
      const wrap = $('#rmp-table-wrap');
      const cards = $('#rmp-cards');
      if (cards) cards.innerHTML = '';
      if (wrap && window.RentmgrOrg && typeof window.RentmgrOrg.mount === 'function') {
        try {
          window.RentmgrOrg.mount(wrap);
        } catch (err) {
          wrap.innerHTML = '<p class="rmp-norenew-empty">組織人力載入失敗：' +
            esc((err && err.message) || '未知錯誤') + '</p>';
        }
      } else if (wrap) {
        wrap.innerHTML = '<p class="rmp-norenew-empty">組織人力模組未載入</p>';
      }
      return;
    }
    renderCards(mod, modData);
    if (mod.layout === 'renewMonths' || mod.layout === 'renewWeeks') {
      renderRenewMonths(mod, modData);
    } else if (mod.layout === 'noRenewDashboard') {
      ensureNoRenewLoaded();
    } else if (mod.layout === 'regionKpiMatrix' || mod.layout === 'regionTable') {
      renderRegionKpiMatrix(mod, modData);
    } else {
      renderRegionTable(mod, modData);
    }
  }

  function renderFooter() {
    const foot = $('#rmp-foot-links');
    const api = dataApi();
    if (!foot || !api) return;
    foot.innerHTML = (api.SHEET_LINKS || []).map(function (link) {
      return (
        '<a href="' + esc(link.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(link.label) + ' ↗' +
        '</a>'
      );
    }).join('');
  }

  function bindNav() {
    if (bound) return;
    bound = true;
    $all('#page-rentmanager-perf [data-rmp-module]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-rmp-module');
        if (id) renderModule(id);
      });
    });
  }

  function init() {
    const page = document.getElementById('page-rentmanager-perf');
    const api = dataApi();
    if (!page || !api) return;
    bindNav();
    renderFooter();
    api.loadPerfData().then(function (payload) {
      cache = payload || { periodLabel: null, modules: {} };
      setPeriod(cache.periodLabel);
      renderModule(activeModule || 'overview');
    }).catch(function () {
      cache = { periodLabel: null, modules: {} };
      setPeriod(null);
      renderModule('overview');
    });
  }

  function onShow() {
    init();
  }

  global.RentmgrPerf = { init: init, onShow: onShow };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('page-rentmanager-perf') &&
        !document.getElementById('page-rentmanager-perf').classList.contains('hidden')) {
      init();
    }
  });
})(window);
