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
    .addItem('立即同步點數（手動）', 'syncAdminQaPoints')
    .addItem('安裝每天早上 8:00 自動同步', 'installDailySyncTrigger')
    .addItem('列出所有工作表名稱', 'listWorksheetNames')
    .addToUi();
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
  SpreadsheetApp.getUi().alert('已設定每天早上 8:00（台北時間）自動同步行政 QA 點數。\n\n小組長核准後的點數，會依「核准日期」寫入日報表對應列。');
}

/** 舊版選單相容 */
function installAutoSyncTrigger() {
  installDailySyncTrigger();
}

function syncAdminQaPoints() {
  var cfg = getQaSyncConfig_();
  var pull = supabaseRpc_(cfg, 'admin_qa_sheets_sync_pull', { p_secret: cfg.ADMIN_SECRET });
  if (!pull.ok) throw new Error(pull.error || '讀取 Supabase 失敗');

  var rows = pull.rows || [];
  var eventIds = pull.eventIds || [];
  if (!rows.length) {
    return { ok: true, updated: 0, unmatched: [], message: '沒有待同步資料' };
  }

  var sheet = resolveTargetSheet_(cfg);
  if (!sheet) {
    throw new Error('找不到目標工作表。現有分頁：' + listWorksheetNames_().join('、') +
      '。請在 Script properties 設定 SHEET_GID=820202601 或正確的 SHEET_NAME');
  }

  var layout = findDailyPerfLayout_(sheet, cfg);
  var updated = 0;
  var unmatched = [];
  var ackIds = [];

  rows.forEach(function (row) {
    var target = findTargetRow_(sheet, layout, row, cfg);
    if (!target) {
      unmatched.push({
        workDate: row.workDate,
        matchName: row.matchName,
        totalPoints: row.totalPoints,
      });
      return;
    }
    sheet.getRange(target.row, layout.qaCol).setValue(Number(row.totalPoints) || 0);
    updated += 1;
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
    unmatched: unmatched,
    pulled: rows.length,
    marked: ackIds.length,
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
  SpreadsheetApp.getUi().alert('此試算表的工作表：\n\n' + names.join('\n'));
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
  if (!isoDate) return false;
  if (Object.prototype.toString.call(cell) === '[object Date]' && !isNaN(cell.getTime())) {
    return Utilities.formatDate(cell, 'Asia/Taipei', 'yyyy-MM-dd') === isoDate;
  }
  var s = String(cell || '').trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s === isoDate;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    var p = s.split('/');
    return isoDate === p[0] + '-' + pad2_(p[1]) + '-' + pad2_(p[2]);
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(s)) {
    var y = isoDate.slice(0, 4);
    var mp = s.split('/');
    return isoDate === y + '-' + pad2_(mp[0]) + '-' + pad2_(mp[1]);
  }
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd') === isoDate;
    }
  } catch (e) {}
  return false;
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
