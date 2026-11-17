/**
 * Seed skyfun-mgr-report KV from 開發/match-dashboard local exports.
 * node scripts/seed-mgr-kv-from-dev.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.resolve(root, '..', '開發', 'match-dashboard');
const ns = '1b4e2970db934680b66112d1be3fd308';
const PART = 5000;
const tmp = path.join(root, '.tmp-mgr-kv-seed');
fs.mkdirSync(tmp, { recursive: true });

function loadWindowJson(file, name) {
  const s = fs.readFileSync(path.join(src, file), 'utf8');
  const re = new RegExp('window\\.' + name + '\\s*=\\s*');
  const m = s.match(re);
  if (!m) throw new Error('parse fail ' + file);
  let json = s.slice(m.index + m[0].length).trim();
  if (json.endsWith(';')) json = json.slice(0, -1);
  return JSON.parse(json);
}

function slimContract(r) {
  return {
    id: r.id,
    st: r.st || '',
    ct: r.ct || '',
    ft: r.ft || '',
    so: r.so || '',
    sl: r.sl || '',
    city: r.city || '',
    p: r.p || '',
    ls: r.ls || '',
    le: r.le || '',
    ad: r.ad || '',
    n: r.n || '',
    rel: r.rel || '',
    addr: r.addr || '',
    i: r.i || '',
    nl: r.nl || ''
  };
}

function slimExtra(r) {
  return {
    id: r.id,
    n: r.n || '',
    st: r.st || '',
    ct: r.ct || '',
    ft: r.ft || '',
    sl: r.sl || '',
    so: r.so || '',
    eu: r.eu || '',
    eo: r.eo || '',
    ls: r.ls || '',
    le: r.le || '',
    i: r.i || '',
    h: r.h || '',
    src: r.src || '',
    nl: r.nl || '',
    fam: r.fam || '',
    cd: r.cd || '',
    cls: r.cls || '',
    cle: r.cle || ''
  };
}

function kvPut(key, valueObj) {
  const file = path.join(tmp, key.replace(/[\\/:*?"<>|]/g, '_') + '.json');
  fs.writeFileSync(file, JSON.stringify(valueObj));
  const r = spawnSync(
    'npx',
    ['wrangler', 'kv', 'key', 'put', key, '--namespace-id', ns, '--path', file, '--remote'],
    { cwd: path.join(root, 'workers', 'skyfun-mgr-report'), encoding: 'utf8', shell: true }
  );
  if (r.status !== 0) {
    console.error(r.stdout || '');
    console.error(r.stderr || '');
    throw new Error('kv put failed: ' + key);
  }
  console.log('put', key, 'bytes', fs.statSync(file).size);
}

function writeParts(version, rows, keyFn) {
  let parts = 0;
  for (let i = 0; i < rows.length; i += PART) {
    kvPut(keyFn(version, parts), rows.slice(i, i + PART));
    parts += 1;
  }
  if (!parts) {
    kvPut(keyFn(version, 0), []);
    parts = 1;
  }
  return parts;
}

console.log('loading contracts…');
const contractsRaw = loadWindowJson('contracts.js', 'CONTRACTS');
const contractsMeta = loadWindowJson('contracts-meta.js', 'CONTRACTS_META');
const contracts = contractsRaw.map(slimContract);
const version = String(Date.now());
console.log('contracts', contracts.length, 'version', version);
const parts = writeParts(version, contracts, (v, i) => `mgr-report:contracts:v:${v}:${i}`);
kvPut('mgr-report:contracts:meta', {
  version,
  fetchedAt: contractsMeta.fetchedAt || new Date().toISOString(),
  n: contracts.length,
  parts,
  source: '開發/match-dashboard sync',
  building: false
});

console.log('loading staff…');
const staffHr = loadWindowJson('staff-hr.js', 'STAFF_HR');
const staffMeta = loadWindowJson('staff.js', 'STAFF_META');
const fetchedAt = staffHr.fetchedAt || contractsMeta.fetchedAt || new Date().toISOString();
kvPut('mgr-report:staff', {
  fetchedAt,
  supervisorField: true,
  hr: { fetchedAt: staffHr.fetchedAt || fetchedAt, staff: staffHr.staff || [] },
  meta: {
    fetchedAt: staffMeta.fetchedAt || fetchedAt,
    staff: staffMeta.staff || [],
    supervisorField: true
  }
});

console.log('loading arrears…');
const arrears = loadWindowJson('arrears.js', 'ARREARS');
kvPut('mgr-report:arrears', {
  fetchedAt: arrears.fetchedAt || fetchedAt,
  source: arrears.source || 'ArrearsManagement/Search',
  srcRecords: arrears.srcRecords || arrears.n || (arrears.rows || []).length,
  rows: arrears.rows || []
});

console.log('loading renewals…');
const renewals = loadWindowJson('renewals.js', 'RENEWALS');
kvPut('mgr-report:renewals', {
  fetchedAt: renewals.fetchedAt || fetchedAt,
  n: renewals.n || (renewals.rows || []).length,
  st: renewals.st || {},
  rows: renewals.rows || []
});

console.log('loading match-extra…');
const extraRaw = loadWindowJson('match-extra.js', 'MATCH_EXTRA');
const extraRows = (extraRaw.rows || []).map(slimExtra);
const extraVer = version + '-x';
const extraParts = writeParts(extraVer, extraRows, (v, i) => `mgr-report:match-extra:v:${v}:${i}`);
kvPut('mgr-report:match-extra:meta', {
  version: extraVer,
  parts: extraParts,
  n: extraRows.length,
  importedAt: extraRaw.fetchedAt || fetchedAt,
  fetchedAt: extraRaw.fetchedAt || fetchedAt,
  source: '開發/match-dashboard sync'
});

console.log('seed done contracts=%d renewals=%d extra=%d arrears=%d',
  contracts.length, (renewals.rows || []).length, extraRows.length, (arrears.rows || []).length);
