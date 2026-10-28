/**
 * 租管師績效中心｜組織人力圖（北／南區）
 * 種子資料對齊管理師表組織報告（至 115/09）；10 月起待爬蟲。
 * 離職→待補、新增待補：比照行政組織圖；存 Supabase rentmgr_org_chart。
 */
(function () {
  /** 僅顯示 115 年；9 月前個人件數用試算表舊值 */
  const MONTHS_SEED = [
    '115-01', '115-02', '115-03', '115-04', '115-05',
    '115-06', '115-07', '115-08', '115-09'
  ];
  const MONTHS_DISPLAY = MONTHS_SEED.concat(['115-10', '115-11', '115-12']);

  function P(partial) {
    return Object.assign({
      status: '在職',
      name: '',
      city: '',
      joined: '',
      title: '租管師',
      perf: '',
      year115: null,
      months: {}
    }, partial || {});
  }

  function m(obj) {
    return obj || {};
  }

  /**
   * 種子 v5：拿掉 114；合計用試算表（含離職）；盧冠云 115/04 到職。
   * monthTotals.all＝試算表右側合計欄；zone 於 09 月依人均×人數覆寫。
   */
  const DEFAULT = {
    seedVersion: 5,
    title: '租管部｜組織人力圖',
    targets: { north: 7, south: 8 },
    summary: {
      caseTotal: { north: 1368, south: 1218 },
      perCapitaMonth: '115-09',
      perCapitaLabel: '09月人均件數'
    },
    /** 試算表合計（含已離職同仁件數） */
    monthTotals: {
      all: {
        '115-01': 83, '115-02': 62, '115-03': 89, '115-04': 135, '115-05': 150,
        '115-06': 138, '115-07': 178, '115-08': 165, '115-09': 172
      },
      year115: 1172,
      /** 09 月北／南＝試算表人均×現有人數（21×4、13×8） */
      north: { '115-09': 84 },
      south: { '115-09': 104 }
    },
    months: MONTHS_SEED.slice(),
    groups: [
      {
        id: 'north',
        name: '北區（雙北／台中）',
        people: [
          P({
            name: '林凌宇', city: '雙北', joined: '114年08月', title: '租管師(儲幹)', perf: '達標',
            year115: 153,
            months: m({
              '115-01': 17, '115-02': 15, '115-03': 15, '115-04': 17, '115-05': 19,
              '115-06': 15, '115-07': 16, '115-08': 21, '115-09': 18
            })
          }),
          P({
            name: '羅偉融', city: '雙北', joined: '114年12月', title: '租管師', perf: '達標',
            year115: 149,
            months: m({
              '115-01': 8, '115-02': 18, '115-03': 21, '115-04': 15, '115-05': 16,
              '115-06': 16, '115-07': 18, '115-08': 18, '115-09': 19
            })
          }),
          P({
            name: '謝岑宗', city: '台中', joined: '113年09月', title: '租管師', perf: '達標',
            year115: 179,
            months: m({
              '115-01': 24, '115-02': 3, '115-03': 16, '115-04': 25, '115-05': 22,
              '115-06': 23, '115-07': 25, '115-08': 18, '115-09': 23
            })
          }),
          P({
            name: '逄旻絹', city: '台中', joined: '114年04月', title: '租管師', perf: '達標',
            year115: 148,
            months: m({
              '115-01': 18, '115-02': 2, '115-03': 17, '115-04': 18, '115-05': 18,
              '115-06': 16, '115-07': 15, '115-08': 22, '115-09': 22
            })
          })
        ]
      },
      {
        id: 'south',
        name: '南區（高雄／台南／嘉義）',
        people: [
          P({
            name: '李仲弦', city: '高雄', joined: '114年07月', title: '儲備幹部', perf: '-',
            year115: 57,
            months: m({
              '115-01': 5, '115-02': 1, '115-03': 2, '115-04': 3, '115-05': 14,
              '115-06': 4, '115-07': 11, '115-08': 10, '115-09': 7
            })
          }),
          P({
            name: '李效誠', city: '高雄', joined: '114年10月', title: '租管師', perf: '達標',
            year115: 109,
            months: m({
              '115-01': 8, '115-02': 4, '115-03': 8, '115-04': 11, '115-05': 13,
              '115-06': 19, '115-07': 16, '115-08': 15, '115-09': 15
            })
          }),
          P({
            name: '蔡佩珊', city: '高雄', joined: '115年04月', title: '租管師', perf: '達標',
            year115: 69,
            months: m({
              '115-04': '到職', '115-05': 5, '115-06': 15, '115-07': 19,
              '115-08': 16, '115-09': 14
            })
          }),
          P({
            name: '盧冠云', city: '台南', joined: '115年04月', title: '儲備幹部', perf: '-',
            year115: 14,
            months: m({
              '115-04': '到職', '115-05': 9, '115-06': 1, '115-07': 4, '115-08': '-', '115-09': '-'
            })
          }),
          P({
            name: '呂佶霖', city: '台南', joined: '115年05月', title: '租管師', perf: '達標',
            year115: 74,
            months: m({
              '115-05': '到職', '115-06': 17, '115-07': 10, '115-08': 10, '115-09': 16
            })
          }),
          P({
            name: '林杰', city: '台南', joined: '115年06月', title: '租管師', perf: '達標',
            year115: 49,
            months: m({
              '115-06': '到職', '115-07': 18, '115-08': 14, '115-09': 12
            })
          }),
          P({
            name: '莊雨蓁', city: '台南', joined: '115年06月', title: '租管師', perf: '未達標',
            year115: 34,
            months: m({
              '115-06': '到職', '115-07': 16, '115-08': 7, '115-09': 11
            })
          }),
          P({
            name: '廖宜嫻', city: '嘉義', joined: '115年07月', title: '租管師', perf: '未達標',
            year115: 34,
            months: m({
              '115-07': '到職', '115-08': 10, '115-09': 15
            })
          })
        ]
      }
    ],
    note: '115 年件數；合計取自試算表（含離職同仁）。9 月前個人數字依試算表舊值；10 月起待爬。黃色＝本月；待補欄可編輯。'
  };

  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  };

  function isOpen(p) {
    return String(p && p.status || '').trim() === '待補';
  }

  function isOnDuty(p) {
    return p && !isOpen(p) && String(p.name || '').trim() !== '';
  }

  function monthLabel(key) {
    const m = String(key || '').match(/^(\d+)-(\d+)$/);
    if (!m) return key;
    return Number(m[1]) + '年' + Number(m[2]) + '月';
  }

  function monthShort(key) {
    const m = String(key || '').match(/^(\d+)-(\d+)$/);
    if (!m) return key;
    return Number(m[2]) + '月';
  }

  /** 「114年08月」→「114-08」 */
  function joinedKey(joined) {
    const m = String(joined || '').match(/(\d+)\s*年\s*(\d+)\s*月/);
    if (!m) return '';
    return Number(m[1]) + '-' + String(Number(m[2])).padStart(2, '0');
  }

  function cellVal(p, key) {
    if (!p || isOpen(p)) return '';
    const jk = joinedKey(p.joined);
    if (jk && jk === key) return '到職';
    const v = p.months && p.months[key];
    if (v == null || v === '') return '';
    return v;
  }

  function fmtCell(v, isFuture) {
    if (isFuture) return '<span class="rmo-future">—</span>';
    if (v === '' || v == null) return '';
    if (v === '到職') return '<span class="rmo-join">到職</span>';
    if (v === '-') return '<span class="rmo-dash">-</span>';
    return esc(v);
  }

  function sumVisibleMonth(people, key) {
    let sum = 0;
    (people || []).forEach(function (p) {
      if (!isOnDuty(p)) return;
      const v = cellVal(p, key);
      if (typeof v === 'number') sum += v;
    });
    return sum;
  }

  /** 試算表合計（含離職）；有分區覆寫用覆寫，否則依在職可見件數占比拆全區合計 */
  function sheetMonthTotal(data, groupId, key) {
    const mt = data && data.monthTotals;
    if (!mt) return null;
    if (mt[groupId] && mt[groupId][key] != null) return mt[groupId][key];
    const all = mt.all && mt.all[key];
    if (all == null) return null;
    const gN = (data.groups || []).find(function (g) { return g.id === 'north'; }) || { people: [] };
    const gS = (data.groups || []).find(function (g) { return g.id === 'south'; }) || { people: [] };
    const nv = sumVisibleMonth(gN.people, key);
    const sv = sumVisibleMonth(gS.people, key);
    const den = nv + sv;
    if (den <= 0) return groupId === 'north' ? all : 0;
    const northShare = Math.round((all * nv) / den);
    return groupId === 'north' ? northShare : (all - northShare);
  }

  function sheetYear115Total(data, groupId) {
    const mt = data && data.monthTotals;
    if (!mt) return null;
    if (mt[groupId] && mt[groupId].year115 != null) return mt[groupId].year115;
    const all = mt.year115;
    if (all == null) return null;
    let nSum = 0;
    let sSum = 0;
    (data.groups || []).forEach(function (g) {
      (g.people || []).forEach(function (p) {
        if (!isOnDuty(p) || typeof p.year115 !== 'number') return;
        if (g.id === 'north') nSum += p.year115;
        else if (g.id === 'south') sSum += p.year115;
      });
    });
    const den = nSum + sSum;
    if (den <= 0) return groupId === 'north' ? all : 0;
    const northShare = Math.round((all * nSum) / den);
    return groupId === 'north' ? northShare : (all - northShare);
  }

  function groupStats(g, data) {
    const people = (g && g.people) || [];
    const now = people.filter(isOnDuty).length;
    const open = people.filter(isOpen).length;
    const id = g && g.id;
    const caseTotal = (data.summary && data.summary.caseTotal && data.summary.caseTotal[id]) || 0;
    const pcMonth = (data.summary && data.summary.perCapitaMonth) || '115-09';
    const monthTot = sheetMonthTotal(data, id, pcMonth);
    const perCapita = (monthTot != null && now > 0) ? Math.round(monthTot / now) : null;
    return { now: now, open: open, plan: now + open, caseTotal: caseTotal, perCapita: perCapita, monthTot: monthTot };
  }

  function kpiBlock(data) {
    const gN = data.groups.find(function (g) { return g.id === 'north'; }) || { people: [] };
    const gS = data.groups.find(function (g) { return g.id === 'south'; }) || { people: [] };
    const sn = groupStats(gN, data);
    const ss = groupStats(gS, data);
    const tN = (data.targets && data.targets.north) || 0;
    const tS = (data.targets && data.targets.south) || 0;
    const pcLabel = (data.summary && data.summary.perCapitaLabel) || '人均件數';
    const pcAll = (sn.now + ss.now) > 0 && sn.monthTot != null && ss.monthTot != null
      ? Math.round((sn.monthTot + ss.monthTot) / (sn.now + ss.now))
      : '—';
    const rows = [
      ['目標人數', tN, tS, tN + tS],
      ['現有人數', sn.now, ss.now, sn.now + ss.now],
      ['總案件數', sn.caseTotal, ss.caseTotal, sn.caseTotal + ss.caseTotal],
      [pcLabel, sn.perCapita != null ? sn.perCapita : '—', ss.perCapita != null ? ss.perCapita : '—', pcAll]
    ];
    return (
      '<div class="rmo-kpi-wrap">' +
        '<table class="rmo-kpi" aria-label="組織人力摘要">' +
          '<thead><tr><th>項目</th><th>北區</th><th>南區</th><th>合計</th></tr></thead>' +
          '<tbody>' +
            rows.map(function (r) {
              return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + esc(r[3]) + '</td></tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
        '<p class="rmo-kpi-note">人均＝該區試算表合計件數 ÷ 租管師（現有）人數；合計含離職同仁產件。</p>' +
      '</div>'
    );
  }

  function perfClass(perf) {
    const s = String(perf || '');
    if (s === '達標') return 'is-ok';
    if (s === '未達標') return 'is-bad';
    return 'is-na';
  }

  /** 「115年04月」→「115/04」 */
  function joinedShort(joined) {
    const m = String(joined || '').match(/(\d+)\s*年\s*(\d+)\s*月/);
    if (!m) return String(joined || '').trim();
    return Number(m[1]) + '/' + String(Number(m[2])).padStart(2, '0');
  }

  function personHead(p, gi, pi, canEdit) {
    if (isOpen(p)) {
      return (
        '<th class="rmo-person is-open" data-rmo-row data-g="' + gi + '" data-i="' + pi + '"' +
          (canEdit ? ' title="點擊編輯待補"' : '') + '>' +
          '<div class="rmo-name">待補</div>' +
        '</th>'
      );
    }
    return (
      '<th class="rmo-person" data-rmo-row data-g="' + gi + '" data-i="' + pi + '"' +
        (canEdit ? ' title="點擊編輯"' : '') + '>' +
        '<div class="rmo-name">' + esc(p.name || '—') + '</div>' +
      '</th>'
    );
  }

  /** 最近有數字的月份件數（不含到職／—） */
  function latestMonthStat(p) {
    if (!p || !p.months) return null;
    for (let i = MONTHS_SEED.length - 1; i >= 0; i--) {
      const key = MONTHS_SEED[i];
      const v = p.months[key];
      if (typeof v === 'number') {
        return { key: key, value: v, label: monthShort(key) };
      }
    }
    return null;
  }

  function perfBoard(data) {
    const pcMonth = (data.summary && data.summary.perCapitaMonth) || '115-09';
    const pcLabel = monthShort(pcMonth);
    const cards = [];
    let ok = 0;
    let bad = 0;
    let na = 0;
    (data.groups || []).forEach(function (g) {
      const st = groupStats(g, data);
      const zonePc = st.perCapita;
      (g.people || []).forEach(function (p) {
        if (!isOnDuty(p)) return;
        const perf = String(p.perf || '').trim();
        if (perf === '達標') ok += 1;
        else if (perf === '未達標') bad += 1;
        else na += 1;
        const latest = latestMonthStat(p);
        const monthVal = p.months && typeof p.months[pcMonth] === 'number' ? p.months[pcMonth] : (latest && latest.value);
        const monthKeyLabel = (p.months && typeof p.months[pcMonth] === 'number') ? pcLabel : (latest ? latest.label : pcLabel);
        let pct = null;
        if (monthVal != null && zonePc != null && zonePc > 0) {
          pct = Math.round((monthVal / zonePc) * 100);
        }
        const gaugePct = pct == null ? 0 : Math.max(0, Math.min(100, pct));
        cards.push({
          groupId: g.id,
          name: p.name,
          city: p.city,
          title: p.title,
          perf: perf || '—',
          monthVal: monthVal,
          monthLabel: monthKeyLabel,
          zonePc: zonePc,
          pct: pct,
          gaugePct: gaugePct
        });
      });
    });

    const byGroup = [
      { id: 'north', label: '北區' },
      { id: 'south', label: '南區' }
    ].map(function (z) {
      const list = cards.filter(function (c) { return c.groupId === z.id; });
      if (!list.length) return '';
      const zonePc = list[0] && list[0].zonePc != null ? list[0].zonePc : null;
      return (
        '<div class="rmo-perf-zone" data-zone="' + esc(z.id) + '">' +
          '<div class="rmo-perf-zone-h">' + esc(z.label) +
            ' <span>' + list.length + ' 人' +
            (zonePc != null ? '｜區人均 ' + esc(zonePc) + ' 件' : '') +
            '</span></div>' +
          '<div class="rmo-perf-grid">' +
            list.map(function (c) {
              const tone = perfClass(c.perf);
              const num = c.monthVal != null ? esc(c.monthVal) : '—';
              return (
                '<article class="rmo-gauge ' + tone + '" style="--gauge-pct:' + c.gaugePct + '">' +
                  '<div class="rmo-gauge-ring" aria-hidden="true">' +
                    '<div class="rmo-gauge-inner">' +
                      '<b>' + num + '</b>' +
                      '<small>件</small>' +
                    '</div>' +
                  '</div>' +
                  '<div class="rmo-gauge-body">' +
                    '<div class="rmo-gauge-name">' + esc(c.name) + '</div>' +
                    '<div class="rmo-gauge-meta">' + esc(c.city || '') +
                      (c.title ? ' · ' + esc(c.title) : '') + '</div>' +
                    '<span class="rmo-perf-chip ' + tone + '">' + esc(c.perf || '—') + '</span>' +
                    '<div class="rmo-gauge-foot">' +
                      esc(c.monthLabel) + '產件' +
                      (c.pct != null ? '｜相對區人均 ' + esc(c.pct) + '%' : '') +
                    '</div>' +
                  '</div>' +
                '</article>'
              );
            }).join('') +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<section class="rmo-perf-board" aria-label="個人產件儀表板">' +
        '<header class="rmo-perf-board-head">' +
          '<div>' +
            '<h4>個人產件儀表板</h4>' +
            '<p>圓圈數字＝' + esc(pcLabel) + '產件；進度對照各區人均。狀態取組織表「是否達標」。</p>' +
          '</div>' +
          '<div class="rmo-perf-summary">' +
            '<span class="is-ok">達標 <b>' + ok + '</b></span>' +
            '<span class="is-bad">未達標 <b>' + bad + '</b></span>' +
            '<span class="is-na">待評 <b>' + na + '</b></span>' +
          '</div>' +
        '</header>' +
        byGroup +
      '</section>'
    );
  }

  function yearBandRow(label, colSpan) {
    return (
      '<tr class="rmo-year-band"><th class="rmo-sticky" colspan="' + colSpan + '">' +
        esc(label) + '</th></tr>'
    );
  }

  function groupTable(g, gi, data, view) {
    const people = g.people || [];
    const canEdit = !!view.canEdit;
    const s = groupStats(g, data);
    const colSpan = people.length + 2;
    const futureSet = {};
    MONTHS_DISPLAY.forEach(function (k) {
      if (MONTHS_SEED.indexOf(k) < 0) futureSet[k] = true;
    });

    const head =
      '<tr class="rmo-head-row">' +
        '<th class="rmo-sticky rmo-corner">姓名</th>' +
        people.map(function (p, pi) { return personHead(p, gi, pi, canEdit); }).join('') +
        '<th class="rmo-total-h">合計</th>' +
      '</tr>';

    function infoRow(label, getVal, opts) {
      const o = opts || {};
      const cells = people.map(function (p) {
        if (isOpen(p)) {
          const v = o.openVal ? o.openVal(p) : (p.city || '');
          return '<td class="is-open">' + esc(v) + '</td>';
        }
        return '<td class="rmo-info">' + esc(getVal(p) || '') + '</td>';
      }).join('');
      return (
        '<tr class="rmo-info-row"><th class="rmo-sticky">' + esc(label) + '</th>' + cells +
          '<td class="rmo-total"></td></tr>'
      );
    }

    const infoHtml =
      infoRow('地區', function (p) { return p.city || ''; }, {
        openVal: function (p) { return p.city || '—'; }
      }) +
      infoRow('報到年月', function (p) { return joinedShort(p.joined); }) +
      infoRow('職稱', function (p) { return p.title || ''; }, {
        openVal: function (p) { return p.title || ''; }
      });

    const y115Sheet = sheetYear115Total(data, g.id);
    const metaHtml = (function () {
      const cells = people.map(function (p) {
        if (isOpen(p)) return '<td class="is-open"></td>';
        const v = p.year115;
        return '<td class="rmo-num">' + (v == null ? '' : esc(v)) + '</td>';
      }).join('');
      return (
        '<tr class="rmo-meta-row"><th class="rmo-sticky">115年件數</th>' + cells +
          '<td class="rmo-total" title="試算表合計（含離職）">' +
            (y115Sheet != null ? esc(y115Sheet) : '') + '</td></tr>'
      );
    })();

    const monthHtml = MONTHS_DISPLAY.map(function (key) {
      const fut = !!futureSet[key];
      const isHighlight = key === '115-09';
      let hasJoin = false;
      const cells = people.map(function (p) {
        if (isOpen(p)) return '<td class="is-open"></td>';
        const v = cellVal(p, key);
        if (v === '到職') hasJoin = true;
        const tdCls = (v === '到職' ? ' is-join' : '') + (typeof v === 'number' ? ' rmo-num' : '');
        return '<td class="' + tdCls.trim() + '">' + fmtCell(v, fut) + '</td>';
      }).join('');
      const sheetTot = fut ? null : sheetMonthTotal(data, g.id, key);
      return (
        '<tr class="' + (fut ? 'is-future-row' : '') + (isHighlight ? ' is-hl-row' : '') +
          (hasJoin ? ' has-join' : '') + '">' +
          '<th class="rmo-sticky" title="' + esc(monthLabel(key)) + '">' +
            esc(monthShort(key)) +
            (fut ? ' <small>待爬</small>' : '') +
          '</th>' +
          cells +
          '<td class="rmo-total" title="試算表合計（含離職）">' +
            (fut ? '—' : (sheetTot != null ? esc(sheetTot) : '')) + '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<section class="rmo-group" data-rmo-group="' + esc(g.id) + '">' +
        '<header class="rmo-group-head">' +
          '<div>' +
            '<h4>' + esc(g.name) + '</h4>' +
            '<p>現有 <b>' + s.now + '</b>｜待補 <b>' + s.open + '</b>｜規劃 <b>' + s.plan +
              '</b>｜目標 ' + esc((data.targets && data.targets[g.id]) || '—') + '</p>' +
          '</div>' +
          (canEdit
            ? '<button type="button" class="rmo-add" data-rmo-act="add" data-g="' + gi + '">＋ 新增待補</button>'
            : '') +
        '</header>' +
        '<div class="rmo-scroll" data-rmo-scroll>' +
          '<table class="rmo-matrix">' +
            '<thead>' + head + '</thead>' +
            '<tbody>' + infoHtml + metaHtml + monthHtml + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>'
    );
  }

  function editForm(view) {
    if (!view.edit) return '';
    const e = view.edit;
    const isNew = e.i < 0;
    const status = e.status || '在職';
    const d = e.draft || {};
    const opts = (isNew ? ['待補', '在職'] : ['在職', '離職', '待補']).map(function (s) {
      return '<option' + (s === status ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    return (
      '<div class="rmo-form" data-rmo-form>' +
        '<h5>' + (isNew ? '新增待補' : '編輯人員') + '</h5>' +
        '<label><span>狀態</span><select data-f="status">' + opts + '</select></label>' +
        (status === '離職'
          ? '<label class="rmo-leave"><span>離職日 <em>*</em></span><input type="date" data-f="leaveDate" value="' + esc(e.leaveDate || '') + '" /></label>'
          : '') +
        (status === '在職'
          ? (
              '<label><span>姓名</span><input data-f="name" value="' + esc(d.name || '') + '" /></label>' +
              '<label><span>縣市</span><input data-f="city" value="' + esc(d.city || '') + '" placeholder="雙北／台中／高雄…" /></label>' +
              '<label><span>到職</span><input data-f="joined" value="' + esc(d.joined || '') + '" placeholder="115年06月" /></label>' +
              '<label><span>職稱</span><input data-f="title" value="' + esc(d.title || '') + '" /></label>' +
              '<label><span>績效</span><select data-f="perf">' +
                ['', '達標', '未達標', '-'].map(function (x) {
                  return '<option value="' + esc(x) + '"' + ((d.perf || '') === x ? ' selected' : '') + '>' +
                    (x === '' ? '（未填）' : x) + '</option>';
                }).join('') +
              '</select></label>'
            )
          : (
              '<label><span>縣市（待補）</span><input data-f="city" value="' + esc(d.city || '') + '" /></label>' +
              '<label><span>職稱（待補）</span><input data-f="title" value="' + esc(d.title || '租管師') + '" /></label>'
            )) +
        (status === '離職'
          ? '<p class="rmo-hint">儲存後此欄轉成「待補」，並寫入離職紀錄。</p>'
          : '') +
        '<div class="rmo-form-acts">' +
          '<button type="button" class="rmo-btn rmo-btn--main" data-rmo-act="save"' +
            (view.busy ? ' disabled' : '') + '>' + (view.busy ? '儲存中…' : '儲存') + '</button>' +
          '<button type="button" class="rmo-btn" data-rmo-act="cancel">取消</button>' +
          (!isNew && isOpen(d)
            ? '<button type="button" class="rmo-btn rmo-btn--del" data-rmo-act="delete">刪除這個待補</button>'
            : '') +
        '</div>' +
        (view.msg ? '<p class="rmo-msg">' + esc(view.msg) + '</p>' : '') +
      '</div>'
    );
  }

  function html(data, view) {
    const d = data && Array.isArray(data.groups) ? data : DEFAULT;
    return (
      '<div class="rmo">' +
        '<div class="rmo-top">' +
          '<div>' +
            '<h3 class="rmo-title">' + esc(d.title || '組織人力圖') + '</h3>' +
            '<p class="rmo-sub">地區僅分北區／南區。點人員欄可編輯；離職會轉待補。達標狀態見上方進度板。</p>' +
          '</div>' +
        '</div>' +
        kpiBlock(d) +
        perfBoard(d) +
        editForm(view) +
        '<div class="rmo-groups">' +
          d.groups.map(function (g, gi) { return groupTable(g, gi, d, view); }).join('') +
        '</div>' +
        '<p class="rmo-note">' + esc(d.note || '') + '</p>' +
      '</div>'
    );
  }

  const view = {
    data: null,
    updatedAt: null,
    canEdit: false,
    edit: null,
    busy: false,
    msg: '',
    root: null
  };

  function bindScrollSync(root) {
    const scrolls = root.querySelectorAll('[data-rmo-scroll]');
    if (scrolls.length < 2) return;
    let lock = false;
    function sync(from, to) {
      if (lock) return;
      lock = true;
      to.scrollTop = from.scrollTop;
      lock = false;
    }
    scrolls[0].addEventListener('scroll', function () { sync(scrolls[0], scrolls[1]); });
    scrolls[1].addEventListener('scroll', function () { sync(scrolls[1], scrolls[0]); });
  }

  function render(nextData) {
    if (nextData) view.data = nextData;
    if (!view.data) view.data = JSON.parse(JSON.stringify(DEFAULT));
    if (!view.root) return;
    view.root.innerHTML = html(view.data, view);
    bindScrollSync(view.root);
  }

  function collect() {
    if (!view.edit || !view.root) return;
    const form = view.root.querySelector('[data-rmo-form]');
    if (!form) return;
    form.querySelectorAll('[data-f]').forEach(function (el) {
      const k = el.getAttribute('data-f');
      if (k === 'leaveDate') view.edit.leaveDate = el.value;
      else if (k === 'status') view.edit.status = el.value;
      else view.edit.draft[k] = el.value.trim();
    });
  }

  function fail(msg) {
    view.msg = msg;
    render();
  }

  async function commit(next, leave) {
    const auth = window.skyfunAuth;
    if (!auth || !auth.rpc || !auth.getToken) return fail('請先登入');
    view.busy = true;
    view.msg = '';
    render();
    try {
      const res = await auth.rpc('rentmgr_org_user_save', {
        p_token: auth.getToken(),
        p_data: next,
        p_updated_at: view.updatedAt,
        p_leave: leave || null
      });
      view.busy = false;
      if (!res || !res.ok) return fail((res && res.error) || '儲存失敗');
      view.updatedAt = res.updatedAt;
      view.edit = null;
      render(next);
    } catch (err) {
      view.busy = false;
      fail((err && err.message) || '儲存失敗，請稍後再試');
    }
  }

  function save() {
    if (view.busy || !view.edit) return;
    collect();
    const e = view.edit;
    const next = JSON.parse(JSON.stringify(view.data));
    const people = next.groups[e.g].people;
    const old = e.i >= 0 ? people[e.i] : null;
    const status = e.status;
    const draft = e.draft || {};
    let leave = null;
    let rowData;
    if (status === '離職') {
      if (!e.leaveDate) return fail('請填離職日');
      if (!old || !old.name) return fail('找不到原姓名');
      leave = {
        name: old.name,
        group: next.groups[e.g].name,
        city: draft.city || old.city || '',
        title: draft.title || old.title || '',
        joined: old.joined || '',
        date: e.leaveDate
      };
      rowData = {
        status: '待補',
        name: '',
        city: draft.city || old.city || '',
        joined: '',
        title: draft.title || old.title || '租管師',
        perf: '',
        year114: null,
        months: {}
      };
    } else if (status === '待補') {
      rowData = {
        status: '待補',
        name: '',
        city: draft.city || '',
        joined: '',
        title: draft.title || '租管師',
        perf: '',
        year114: null,
        months: {}
      };
    } else {
      if (!draft.name) return fail('請填姓名');
      rowData = Object.assign({}, old || P({}), {
        status: '在職',
        name: draft.name,
        city: draft.city || '',
        joined: draft.joined || '',
        title: draft.title || '租管師',
        perf: draft.perf || '',
        months: (old && old.months) || {}
      });
    }
    if (old && old.status !== '待補' && status === '待補') {
      return fail('在職人員離開請選「離職」並填離職日');
    }
    if (e.i >= 0) people[e.i] = rowData;
    else people.push(rowData);
    commit(next, leave);
  }

  function remove() {
    if (view.busy || !view.edit || view.edit.i < 0) return;
    const p = view.data.groups[view.edit.g].people[view.edit.i];
    if (!isOpen(p) || !confirm('刪除這個待補職缺？')) return;
    const next = JSON.parse(JSON.stringify(view.data));
    next.groups[view.edit.g].people.splice(view.edit.i, 1);
    commit(next, null);
  }

  function onClick(e) {
    const act = e.target.closest('[data-rmo-act]');
    if (act) {
      const a = act.getAttribute('data-rmo-act');
      if (a === 'add') {
        view.edit = {
          g: Number(act.getAttribute('data-g')),
          i: -1,
          status: '待補',
          draft: { status: '待補', name: '', city: '', joined: '', title: '租管師', perf: '' }
        };
        view.msg = '';
        render();
      } else if (a === 'cancel') {
        view.edit = null;
        view.msg = '';
        render();
      } else if (a === 'save') save();
      else if (a === 'delete') remove();
      return;
    }
    if (e.target.closest('[data-rmo-form]')) return;
    const cell = e.target.closest('[data-rmo-row]');
    if (!cell || !view.canEdit || !view.data) return;
    const g = Number(cell.getAttribute('data-g'));
    const i = Number(cell.getAttribute('data-i'));
    if (view.edit && view.edit.g === g && view.edit.i === i) view.edit = null;
    else {
      const p = view.data.groups[g].people[i];
      view.edit = { g: g, i: i, status: p.status || '在職', draft: Object.assign({}, p), leaveDate: '' };
    }
    view.msg = '';
    render();
  }

  function onChange(e) {
    if (e.target.matches('[data-rmo-form] [data-f="status"]')) {
      collect();
      render();
    }
  }

  async function load() {
    const auth = window.skyfunAuth;
    const token = auth && auth.getToken && auth.getToken();
    if (!token || !auth.rpc) {
      view.canEdit = false;
      render(JSON.parse(JSON.stringify(DEFAULT)));
      return;
    }
    try {
      const res = await auth.rpc('rentmgr_org_get', { p_token: token });
      if (res && res.ok) {
        view.updatedAt = res.updatedAt || null;
        view.canEdit = res.canEdit !== false;
        const d = res.data;
        const needSeed = !d || !Array.isArray(d.groups) || !d.seedVersion || Number(d.seedVersion) < 5;
        render(needSeed ? JSON.parse(JSON.stringify(DEFAULT)) : d);
      } else {
        view.canEdit = true;
        render(JSON.parse(JSON.stringify(DEFAULT)));
      }
    } catch (err) {
      view.canEdit = true;
      render(JSON.parse(JSON.stringify(DEFAULT)));
    }
  }

  function mount(el) {
    if (!el) return;
    view.root = el;
    view.edit = null;
    view.msg = '';
    el.onclick = onClick;
    el.onchange = onChange;
    render(JSON.parse(JSON.stringify(DEFAULT)));
    load();
  }

  window.RentmgrOrg = {
    DEFAULT: DEFAULT,
    mount: mount,
    reload: load,
    isOpen: isOpen
  };
})();
