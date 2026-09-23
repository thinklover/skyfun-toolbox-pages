/**
 * 行政 QA 點數 →「行政填寫 / 每日績效登陸 / 行政QA」欄位
 *
 * 設定步驟見 README.md
 */
var QA_SYNC_CONFIG = {
  SUPABASE_URL: '', // 例：https://xpbownhiedurytlyqszu.supabase.co
  SUPABASE_ANON_KEY: '',
  ADMIN_SECRET: '',
  SHEET_NAME: '行政填寫-每日績效登錄',
  SHEET_GID: '820202601', // 網址 #gid= 後的數字；比工作表名稱更準
  QA_HEADERS: ['行政QA', '行政 QA'],
  NAME_HEADERS: ['員工姓名', '姓名', '人員', '名字', '同仁姓名'],
  DATE_HEADERS: ['紀錄日', '日期', '登錄日期', '績效日期'],
  MAX_SCAN_ROWS: 300,
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('行政 QA')
    .addItem('立即同步點數（手動）', 'syncAdminQaPointsMenu')
    .addItem('檢查同步設定', 'diagnoseQaSync')
    .addItem('安裝每天早上 8:00 自動同步', 'installDailySyncTrigger')
    .addItem('列出所有工作表名稱', 'listWorksheetNames')
    .addToUi();
}

/**
 * 編輯器按 ▶ 時 SpreadsheetApp.getUi() 會卡住（只顯示「開始執行」）。
 * 優先用 alert；失敗則寫入執行記錄＋toast。
 */
function notify_(title, message) {
  var text = String(message || '');
  Logger.log((title ? '[' + title + ']\n' : '') + text);
  console.log((title ? '[' + title + ']\n' : '') + text);
  try {
    SpreadsheetApp.getUi().alert(title || '行政 QA', text, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  } catch (e1) {
    /* 從編輯器執行時無試算表 UI */
  }
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(text.substring(0, 180), title || '行政 QA', 20);
  } catch (e2) {
    /* ignore */
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify(syncAdminQaPoints()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return doGet(e);
}

function installDailySyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAdminQaPoints') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAdminQaPoints')
    .timeBased()
    .atHour(8)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('Asia/Taipei')
    .create();
  notify_('行政 QA', '已設定每天早上 8:00（台北時間）自動同步。\n請到「執行記錄」確認沒有紅字。');
}

/** 舊版選單相容 */
function installAutoSyncTrigger() {
  installDailySyncTrigger();
}

/** 選單用：同步後跳出結果（含 skipped） */
function syncAdminQaPointsMenu() {
  try {
    var result = syncAdminQaPoints();
    var lines = [];
    lines.push(result.message || (result.ok ? '同步完成' : '同步失敗'));
    lines.push('（紀錄日＝檢核通過日）');
    lines.push('更新既有列：' + (result.updated || 0));
    lines.push('新增該日列：' + (result.created || 0));
    lines.push('標記已同步：' + (result.marked || 0));
    lines.push('拉取筆數：' + (result.pulled || 0));
    var skipped = result.skipped || result.unmatched || [];
    if (skipped.length) {
      lines.push('');
      lines.push('已跳過（試算表無此姓名）：');
      skipped.slice(0, 12).forEach(function (u) {
        lines.push(
          '- ' + (u.workDate || '') + '／' + (u.matchName || '') + '／' + (u.totalPoints || 0) + ' 點' +
          (u.reason ? '（' + u.reason + '）' : '')
        );
      });
      if (skipped.length > 12) lines.push('…共 ' + skipped.length + ' 筆');
    }
    notify_('同步結果', lines.join('\n'));
    return result;
  } catch (err) {
    notify_('同步失敗', String(err && err.message ? err.message : err));
    throw err;
  }
}

/** 檢查 Script properties／工作表／能否連上 Supabase（不寫入） */
function diagnoseQaSync() {
  var lines = [];
  try {
    var cfg = getQaSyncConfig_();
    lines.push('SUPABASE_URL：' + (cfg.SUPABASE_URL ? '有' : '缺'));
    lines.push('SUPABASE_ANON_KEY：' + (cfg.SUPABASE_ANON_KEY ? '有（' + String(cfg.SUPABASE_ANON_KEY).length + ' 字）' : '缺'));
    lines.push('ADMIN_SECRET：' + (cfg.ADMIN_SECRET ? '有（' + String(cfg.ADMIN_SECRET).length + ' 字）' : '缺'));
    lines.push('SHEET_NAME：' + (cfg.SHEET_NAME || '（空）'));
    lines.push('SHEET_GID：' + (cfg.SHEET_GID || '（空）'));

    var sheet = resolveTargetSheet_(cfg);
    if (!sheet) {
      lines.push('');
      lines.push('找不到目標工作表。現有：' + listWorksheetNames_().join('、'));
      notify_('檢查同步設定', lines.join('\n'));
      return;
    }
    lines.push('目標工作表：' + sheet.getName() + ' (gid=' + sheet.getSheetId() + ')');

    try {
      var layout = findDailyPerfLayout_(sheet, cfg);
      lines.push('標題列：第 ' + (layout.headerRow + 1) + ' 列');
      lines.push('資料起始列：第 ' + layout.dataStartRow + ' 列');
      lines.push('欄位：姓名 col' + layout.nameCol + '／日期 col' + layout.dateCol + '／行政QA col' + layout.qaCol);
    } catch (layoutErr) {
      lines.push('標題列錯誤：' + String(layoutErr.message || layoutErr));
    }

    var pull = supabaseRpc_(cfg, 'admin_qa_sheets_sync_pull', { p_secret: cfg.ADMIN_SECRET });
    if (!pull.ok) {
      lines.push('');
      lines.push('Supabase 連線失敗：' + (pull.error || JSON.stringify(pull)));
      lines.push('（常見原因：ADMIN_SECRET 與後台密碼不一致）');
    } else {
      var rows = pull.rows || [];
      lines.push('');
      lines.push('待同步列數：' + rows.length);
      rows.slice(0, 8).forEach(function (r) {
        lines.push('- ' + (r.workDate || '') + '／' + (r.matchName || '') + '／' + (r.totalPoints || 0) + ' 點');
      });
    }

    var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'syncAdminQaPoints';
    });
    lines.push('');
    lines.push('08:00 觸發器：' + (triggers.length ? '已安裝 ' + triggers.length + ' 個' : '尚未安裝（請點選單安裝）'));

    notify_('檢查同步設定', lines.join('\n'));
  } catch (err) {
    lines.push('');
    lines.push('錯誤：' + String(err && err.message ? err.message : err));
    notify_('檢查失敗', lines.join('\n'));
  }
}

function syncAdminQaPoints() {
  var cfg = getQaSyncConfig_();
  var pull = supabaseRpc_(cfg, 'admin_qa_sheets_sync_pull', { p_secret: cfg.ADMIN_SECRET });
  if (!pull.ok) throw new Error(pull.error || '讀取 Supabase 失敗');

  var rows = pull.rows || [];
  var eventIds = pull.eventIds || [];
  if (!rows.length) {
    return { ok: true, updated: 0, unmatched: [], pulled: 0, marked: 0, message: '沒有待同步資料' };
  }

  var sheet = resolveTargetSheet_(cfg);
  if (!sheet) {
    throw new Error('找不到目標工作表。現有分頁：' + listWorksheetNames_().join('、') +
      '。請在 Script properties 設定 SHEET_GID=820202601 或正確的 SHEET_NAME');
  }

  var layout = findDailyPerfLayout_(sheet, cfg);
  var updated = 0;
  var created = 0;
  var skipped = [];
  var ackIds = [];
  var known = collectKnownNames_(sheet, layout, cfg);

  rows.forEach(function (row) {
    var name = String(row.matchName || row.displayName || '').trim();
    if (!name) {
      skipped.push({
        workDate: row.workDate,
        matchName: '(無名)',
        totalPoints: row.totalPoints,
        reason: '無名',
      });
      return;
    }

    var canonical = resolveCanonicalName_(name, known);
    // 試算表姓名欄／下拉完全沒此人 → 跳過
    if (!canonical) {
      skipped.push({
        workDate: row.workDate,
        matchName: name,
        totalPoints: row.totalPoints,
        reason: '試算表無此姓名',
      });
      return;
    }

    // 用試算表既有寫法對姓名，避免下拉驗證不符
    var rowForMatch = Object.assign({}, row, {
      matchName: canonical,
      displayName: canonical,
    });

    var target = findTargetRow_(sheet, layout, rowForMatch, cfg);
    if (!target) {
      // 有姓名、無該日列 → 新增一列後寫入
      target = appendDailyPerfRow_(sheet, layout, {
        workDate: row.workDate,
        matchName: canonical,
        displayName: canonical,
        totalPoints: row.totalPoints,
      });
      if (!target) {
        skipped.push({
          workDate: row.workDate,
          matchName: canonical,
          totalPoints: row.totalPoints,
          reason: '無法新增列',
        });
        return;
      }
      created += 1;
    } else {
      setValueBypassValidation_(sheet.getRange(target.row, layout.qaCol), Number(row.totalPoints) || 0);
      updated += 1;
    }

    (row.eventIds || []).forEach(function (id) {
      if (ackIds.indexOf(id) < 0) ackIds.push(id);
    });
  });

  if (ackIds.length) {
    var ack = supabaseRpc_(cfg, 'admin_qa_sheets_sync_ack', {
      p_secret: cfg.ADMIN_SECRET,
      p_event_ids: ackIds,
    });
    if (!ack.ok) throw new Error(ack.error || '回寫 Supabase 失敗');
  }

  return {
    ok: true,
    updated: updated,
    created: created,
    unmatched: skipped,
    skipped: skipped,
    pulled: rows.length,
    marked: ackIds.length,
    message: skipped.length
      ? (updated || created ? '部分寫入成功，其餘已跳過（無此姓名）' : '沒有可寫入的列（試算表無此姓名）')
      : created
        ? '同步成功（含新增該日列）'
        : '同步成功',
  };
}

function getQaSyncConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    SUPABASE_URL: props.getProperty('SUPABASE_URL') || QA_SYNC_CONFIG.SUPABASE_URL,
    SUPABASE_ANON_KEY: props.getProperty('SUPABASE_ANON_KEY') || QA_SYNC_CONFIG.SUPABASE_ANON_KEY,
    ADMIN_SECRET: props.getProperty('ADMIN_SECRET') || QA_SYNC_CONFIG.ADMIN_SECRET,
    SHEET_NAME: props.getProperty('SHEET_NAME') || QA_SYNC_CONFIG.SHEET_NAME,
    SHEET_GID: props.getProperty('SHEET_GID') || QA_SYNC_CONFIG.SHEET_GID,
    QA_HEADERS: QA_SYNC_CONFIG.QA_HEADERS,
    NAME_HEADERS: QA_SYNC_CONFIG.NAME_HEADERS,
    DATE_HEADERS: QA_SYNC_CONFIG.DATE_HEADERS,
    MAX_SCAN_ROWS: QA_SYNC_CONFIG.MAX_SCAN_ROWS,
  };
}

function supabaseRpc_(cfg, fn, payload) {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !cfg.ADMIN_SECRET) {
    throw new Error('請先在 Script properties 填入 SUPABASE_URL、SUPABASE_ANON_KEY、ADMIN_SECRET');
  }
  var url = String(cfg.SUPABASE_URL).replace(/\/$/, '') + '/rest/v1/rpc/' + fn;
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var text = resp.getContentText();
  var data;
  try { data = JSON.parse(text); } catch (e) { data = { ok: false, error: text }; }
  return data;
}

function listWorksheetNames() {
  var names = listWorksheetNames_();
  notify_('工作表名稱', names.join('\n'));
  return names;
}

function listWorksheetNames_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) {
    return s.getName() + ' (gid=' + s.getSheetId() + ')';
  });
}

function resolveTargetSheet_(cfg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  if (cfg.SHEET_GID) {
    var gid = Number(cfg.SHEET_GID);
    if (!isNaN(gid)) {
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() === gid) return sheets[i];
      }
    }
  }

  if (cfg.SHEET_NAME) {
    var exact = ss.getSheetByName(cfg.SHEET_NAME);
    if (exact) return exact;
    var target = normalizeHeader_(cfg.SHEET_NAME);
    for (var j = 0; j < sheets.length; j++) {
      if (normalizeHeader_(sheets[j].getName()) === target) return sheets[j];
    }
    for (var k = 0; k < sheets.length; k++) {
      if (String(sheets[k].getName()).indexOf(cfg.SHEET_NAME) >= 0) return sheets[k];
    }
  }

  for (var m = 0; m < sheets.length; m++) {
    if (sheetHasDailyPerfSection_(sheets[m], cfg)) return sheets[m];
  }
  return null;
}

function sheetHasDailyPerfSection_(sheet, cfg) {
  try {
    findDailyPerfLayout_(sheet, cfg);
    return true;
  } catch (e) {
    return false;
  }
}

function headerMatches_(cell, candidates, partial) {
  var h = normalizeHeader_(cell);
  if (!h) return false;
  return candidates.some(function (x) {
    var key = normalizeHeader_(x);
    return partial ? (h.indexOf(key) >= 0 || key.indexOf(h) >= 0) : h === key;
  });
}

function findDailyPerfLayout_(sheet, cfg) {
  var values = sheet.getDataRange().getValues();
  var headerRow = -1;
  var nameCol = -1;
  var dateCol = -1;
  var qaCol = -1;

  for (var hr = 0; hr < Math.min(values.length, 25); hr++) {
    var nc = -1;
    var dc = -1;
    var qc = -1;
    for (var hc = 0; hc < values[hr].length; hc++) {
      var cell = values[hr][hc];
      if (nc < 0 && headerMatches_(cell, cfg.NAME_HEADERS, false)) nc = hc;
      if (dc < 0 && headerMatches_(cell, cfg.DATE_HEADERS, false)) dc = hc;
      if (qc < 0 && headerMatches_(cell, cfg.QA_HEADERS, true)) qc = hc;
    }
    if (nc >= 0 && dc >= 0 && qc >= 0) {
      headerRow = hr;
      nameCol = nc;
      dateCol = dc;
      qaCol = qc;
      break;
    }
  }

  if (headerRow < 0) {
    throw new Error('找不到標題列（需有：紀錄日、員工姓名、行政QA）');
  }

  var dataStartRow = headerRow + 2;
  if (headerRow + 1 < values.length) {
    var sub = values[headerRow + 1];
    var looksLikeSubheader = false;
    for (var sc = 0; sc < sub.length; sc++) {
      var t = String(sub[sc] || '');
      if (t.indexOf('1-4') >= 0 || t.indexOf('1~4') >= 0 || t.indexOf('依核定') >= 0) {
        looksLikeSubheader = true;
        break;
      }
    }
    dataStartRow = looksLikeSubheader ? headerRow + 3 : headerRow + 2;
  }

  return {
    headerRow: headerRow,
    nameCol: nameCol + 1,
    dateCol: dateCol + 1,
    qaCol: qaCol + 1,
    dataStartRow: dataStartRow,
  };
}

function findTargetRow_(sheet, layout, row, cfg) {
  var lastRow = Math.min(sheet.getLastRow(), layout.dataStartRow + cfg.MAX_SCAN_ROWS);
  if (lastRow < layout.dataStartRow) return null;
  var numRows = lastRow - layout.dataStartRow + 1;
  var names = sheet.getRange(layout.dataStartRow, layout.nameCol, numRows, 1).getValues();
  var dates = sheet.getRange(layout.dataStartRow, layout.dateCol, numRows, 1).getValues();
  var targetNames = buildNameCandidates_(row);

  for (var i = 0; i < numRows; i++) {
    var sheetName = String(names[i][0] || '');
    if (!sheetName.trim()) continue;
    if (!nameMatches_(sheetName, targetNames)) continue;
    if (!sameWorkDate_(dates[i][0], row.workDate)) continue;
    return { row: layout.dataStartRow + i };
  }
  return null;
}

/** 收集試算表姓名欄已出現過的名字（下拉名單／既有列）→ { 正規化名: 試算表原始字串 } */
function collectKnownNames_(sheet, layout, cfg) {
  var lastRow = Math.min(sheet.getLastRow(), layout.dataStartRow + cfg.MAX_SCAN_ROWS);
  var map = {};
  function add(raw) {
    var original = String(raw || '').trim();
    var n = normalizeName_(original);
    if (!n) return;
    if (!map[n]) map[n] = original;
  }
  if (lastRow >= layout.dataStartRow) {
    var numRows = lastRow - layout.dataStartRow + 1;
    var names = sheet.getRange(layout.dataStartRow, layout.nameCol, numRows, 1).getValues();
    for (var i = 0; i < names.length; i++) add(names[i][0]);
  }
  try {
    var sample = sheet.getRange(layout.dataStartRow, layout.nameCol);
    var rule = sample.getDataValidation();
    if (rule) {
      var criteria = rule.getCriteriaType();
      var values = rule.getCriteriaValues();
      if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST && values && values[0]) {
        values[0].forEach(add);
      } else if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE && values && values[0]) {
        values[0].getValues().forEach(function (r) {
          r.forEach(add);
        });
      }
    }
  } catch (e) {
    /* ignore */
  }
  return map;
}

/** 回傳試算表裡的標準姓名字串；找不到則 null */
function resolveCanonicalName_(name, knownMap) {
  var n = normalizeName_(name);
  if (!n) return null;
  if (knownMap[n]) return knownMap[n];
  for (var key in knownMap) {
    if (!knownMap.hasOwnProperty(key)) continue;
    if (key.indexOf(n) >= 0 || n.indexOf(key) >= 0) return knownMap[key];
  }
  return null;
}

/**
 * 有姓名、無該日列 → 新增一列
 * 紀錄日一律＝檢核通過日（row.workDate，來自 reviewed_at 台北日期）
 */
function appendDailyPerfRow_(sheet, layout, row) {
  var name = String(row.matchName || row.displayName || '').trim();
  var workDate = String(row.workDate || '').trim(); // YYYY-MM-DD＝檢核通過日
  if (!name || !workDate) return null;

  var insertAt = nextEmptyDataRow_(sheet, layout);
  var dateRange = sheet.getRange(insertAt, layout.dateCol);
  var dateVal = parseIsoDateLocal_(workDate);
  trySetValue_(dateRange, dateVal || workDate);
  try {
    dateRange.setNumberFormat('yyyy/MM/dd');
  } catch (eFmt) {
    /* ignore */
  }
  trySetValue_(sheet.getRange(insertAt, layout.nameCol), name);
  setValueBypassValidation_(sheet.getRange(insertAt, layout.qaCol), Number(row.totalPoints) || 0);
  return { row: insertAt, created: true };
}

function nextEmptyDataRow_(sheet, layout) {
  var last = Math.max(sheet.getLastRow(), layout.dataStartRow - 1);
  var scanEnd = Math.max(last, layout.dataStartRow);
  var maxCol = Math.max(layout.dateCol, layout.nameCol, layout.qaCol);
  var bottom = layout.dataStartRow - 1;
  if (scanEnd >= layout.dataStartRow) {
    var values = sheet.getRange(layout.dataStartRow, 1, scanEnd - layout.dataStartRow + 1, maxCol).getValues();
    for (var i = 0; i < values.length; i++) {
      var dateCell = values[i][layout.dateCol - 1];
      var nameCell = values[i][layout.nameCol - 1];
      if (String(dateCell || '').trim() || String(nameCell || '').trim()) {
        bottom = layout.dataStartRow + i;
      }
    }
  }
  return bottom + 1;
}

function parseIsoDateLocal_(isoDate) {
  var m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function trySetValue_(range, value) {
  try {
    range.setValue(value);
  } catch (e) {
    setValueBypassValidation_(range, value);
  }
}

/** 略過儲存格資料驗證後寫入（僅用於行政QA分數） */
function setValueBypassValidation_(range, value) {
  try {
    range.setValue(value);
    return;
  } catch (e2) {
    try {
      range.clearDataValidations();
      range.setValue(value);
    } catch (e3) {
      throw new Error('無法寫入 ' + range.getA1Notation() + '：' + String(e3.message || e3));
    }
  }
}

function buildNameCandidates_(row) {
  var list = [];
  [row.matchName, row.displayName, row.username].forEach(function (v) {
    var n = normalizeName_(v);
    if (n && list.indexOf(n) < 0) list.push(n);
  });
  return list;
}

function nameMatches_(sheetName, candidates) {
  var norm = normalizeName_(sheetName);
  return candidates.some(function (c) {
    return norm === c || norm.indexOf(c) >= 0 || c.indexOf(norm) >= 0;
  });
}

function sameWorkDate_(cell, isoDate) {
  // isoDate＝檢核通過日 YYYY-MM-DD
  if (!isoDate) return false;
  var want = String(isoDate).trim();
  var got = cellToIsoDate_(cell);
  return !!got && got === want;
}

/** 試算表儲存格 → YYYY-MM-DD（與檢核通過日同一格式） */
function cellToIsoDate_(cell) {
  if (cell === null || cell === undefined || cell === '') return '';
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    // 用日曆年月日，避免時區把日期往前推一天
    return (
      cell.getFullYear() +
      '-' +
      pad2_(cell.getMonth() + 1) +
      '-' +
      pad2_(cell.getDate())
    );
  }
  var s = String(cell || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
    var p = s.split(/[\/\s]/);
    return p[0] + '-' + pad2_(p[1]) + '-' + pad2_(p[2]);
  }
  // 民國 yyy/MM/dd
  if (/^\d{2,3}\/\d{1,2}\/\d{1,2}/.test(s)) {
    var r = s.split('/');
    var y = Number(r[0]) + 1911;
    return y + '-' + pad2_(r[1]) + '-' + pad2_(r[2]);
  }
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
    }
  } catch (e) {}
  return '';
}

function normalizeName_(s) {
  return String(s || '').replace(/\s/g, '').trim();
}

function normalizeHeader_(s) {
  return String(s || '').replace(/\s/g, '').trim();
}

function pad2_(n) {
  return String(n).padStart(2, '0');
}
