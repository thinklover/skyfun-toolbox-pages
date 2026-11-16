/**
 * 財務回報：公司系統欄位正規化與比對（只讀，不寫入公司系統）
 */
(function (global) {
  'use strict';

  function nfkc(s) {
    try { return String(s ?? '').normalize('NFKC'); } catch (_) { return String(s ?? ''); }
  }

  function normName(s) {
    return nfkc(s).replace(/\s+/g, '').trim();
  }

  function toIsoDate(raw) {
    const s = nfkc(raw).trim().replace(/[./]/g, '-');
    if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
      if (y >= 1911 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
    m = s.match(/^(\d{2,3})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      let y = Number(m[1]);
      if (y < 1911) y += 1911;
      const mo = Number(m[2]); const d = Number(m[3]);
      if (y >= 1911 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      }
    }
    return '';
  }

  function normMoney(raw) {
    const s = nfkc(raw).replace(/,/g, '').replace(/元/g, '').replace(/\s+/g, '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function moneyEqual(a, b) {
    const na = normMoney(a);
    const nb = normMoney(b);
    if (na == null && nb == null) return true;
    if (na == null || nb == null) return false;
    return Math.abs(na - nb) < 0.005;
  }

  function nameEqual(a, b) {
    const na = normName(a);
    const nb = normName(b);
    if (!na && !nb) return true;
    return !!na && na === nb;
  }

  function dateEqual(a, b) {
    const da = toIsoDate(a);
    const db = toIsoDate(b);
    if (!da && !db) return true;
    return !!da && da === db;
  }

  function displayCompany(kind, val) {
    if (val == null || val === '') return '（無資料）';
    if (kind === 'money') {
      const n = normMoney(val);
      return n == null ? String(val) : String(n);
    }
    if (kind === 'date') return toIsoDate(val) || String(val);
    return String(val);
  }

  function pickBestByName(list, userName) {
    const want = normName(userName);
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) return null;
    if (!want) return rows[0];
    const exact = rows.find((r) => normName(r.name) === want);
    if (exact) return exact;
    const soft = rows.find((r) => {
      const n = normName(r.name);
      return n && (n.includes(want) || want.includes(n));
    });
    return soft || null;
  }

  /**
   * @param {object} user - 申請人輸入
   * @param {object} company - { landlords, tenants }
   * @param {string[]} keys - 要比對的欄位
   */
  function compareFields(user, company, keys) {
    const landlords = Array.isArray(company?.landlords) ? company.landlords : [];
    const tenants = Array.isArray(company?.tenants) ? company.tenants : [];
    const ll = pickBestByName(landlords, user.landlord);
    const tn = pickBestByName(tenants, user.tenant);
    const companyMap = {
      landlord: ll?.name || '',
      tenant: tn?.name || '',
      baoLeaseStart: ll?.leaseStart || '',
      baoLeaseEnd: ll?.leaseEnd || '',
      zhuanLeaseStart: tn?.leaseStart || '',
      zhuanLeaseEnd: tn?.leaseEnd || '',
      rent: (tn && tn.rent != null && tn.rent !== '' ? tn.rent : (ll?.rent ?? '')),
      managementFee: tn?.managementFee ?? ll?.managementFee ?? '',
      deposit: tn?.deposit ?? tn?.depositAmount ?? ll?.deposit ?? ll?.depositAmount ?? '',
      caseType: tn?.caseType || ll?.caseType || tn?.contratTypeName || ll?.contratTypeName || ''
    };
    const kinds = {
      landlord: 'name', tenant: 'name',
      baoLeaseStart: 'date', baoLeaseEnd: 'date',
      zhuanLeaseStart: 'date', zhuanLeaseEnd: 'date',
      rent: 'money', managementFee: 'money', deposit: 'money',
      caseType: 'name'
    };
    const fields = {};
    (keys || Object.keys(kinds)).forEach((key) => {
      const kind = kinds[key] || 'name';
      const userVal = user[key];
      const companyVal = companyMap[key];
      const companyMissing = companyVal == null || companyVal === '' ||
        (kind === 'money' && (normMoney(companyVal) == null || normMoney(companyVal) === 0) && String(companyVal).trim() === '');
      let ok = false;
      if (companyMissing && (userVal == null || String(userVal).trim() === '')) {
        ok = true;
      } else if (companyMissing) {
        ok = false;
      } else if (kind === 'money') {
        ok = moneyEqual(userVal, companyVal);
      } else if (kind === 'date') {
        ok = dateEqual(userVal, companyVal);
      } else {
        ok = nameEqual(userVal, companyVal);
      }
      fields[key] = {
        key,
        kind,
        ok,
        user: userVal == null ? '' : String(userVal),
        company: companyMissing ? '' : String(companyVal),
        companyMissing: !!companyMissing,
        companyDisplay: companyMissing ? '（無資料）' : displayCompany(kind, companyVal)
      };
    });
    return {
      matchedLandlord: ll || null,
      matchedTenant: tn || null,
      companyMap,
      fields
    };
  }

  function summarize(fields, overrides) {
    const ov = overrides || {};
    const list = Object.values(fields || {});
    let pendingFix = false;
    let allOk = true;
    list.forEach((f) => {
      const o = ov[f.key] || {};
      if (f.ok) return;
      if (o.checked && String(o.note || '').trim()) {
        pendingFix = true;
        return;
      }
      allOk = false;
    });
    if (!allOk) pendingFix = false;
    else if (list.some((f) => !f.ok)) pendingFix = true;
    const fullyMatched = list.every((f) => f.ok);
    return {
      allOk: fullyMatched || (allOk && pendingFix),
      fullyMatched,
      systemDataPendingFix: !fullyMatched && allOk && pendingFix
    };
  }

  global.FinCompanyCompare = {
    normName,
    toIsoDate,
    normMoney,
    moneyEqual,
    nameEqual,
    dateEqual,
    compareFields,
    summarize,
    pickBestByName,
    displayCompany
  };
})(typeof window !== 'undefined' ? window : globalThis);
