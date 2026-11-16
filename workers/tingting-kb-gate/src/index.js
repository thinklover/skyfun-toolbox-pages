/**
 * AI婷婷知識庫後台門禁
 * POST /api/tingting-kb-gate { token, password }
 * - 登入者須在 allowlist，否則 403
 * - 密碼比對 env.TINGTING_KB_GATE_PASSWORD
 * - 連續錯 5 次鎖 10 分鐘
 */
const ALLOWED_NAMES = ['簡為倢', '黃怡婷', '邱奕棋'];
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const PASSWORD_MAX = 128;

/** @type {Map<string, { fails: number, until: number }>} */
const lockState = new Map();

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = parseOrigins(env.ALLOWED_ORIGINS);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Skyfun-Session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function isAllowedName(name) {
  return ALLOWED_NAMES.includes(String(name || '').trim());
}

function getLock(name) {
  const key = String(name || '').trim();
  const cur = lockState.get(key) || { fails: 0, until: 0 };
  if (cur.until && Date.now() >= cur.until) {
    const reset = { fails: 0, until: 0 };
    lockState.set(key, reset);
    return reset;
  }
  return cur;
}

function setLock(name, data) {
  lockState.set(String(name || '').trim(), data);
}

function clearLock(name) {
  lockState.delete(String(name || '').trim());
}

async function whoami(token, env) {
  const t = String(token || '').trim();
  if (!t || t.length > 200) return null;
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/rpc/toolbox_me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_token: t })
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.ok || !data.user) return null;
  const name = String(data.user.name || '').trim();
  const username = String(data.user.username || '').trim();
  if (!name && !username) return null;
  return { name, username };
}

function passwordOk(input, expected) {
  const a = String(input || '');
  const b = String(expected || '');
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname !== '/api/tingting-kb-gate' || request.method !== 'POST') {
      return json({ ok: false, error: '找不到這個功能' }, 404, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: '資料格式不正確' }, 400, cors);
    }

    const token = body?.token || request.headers.get('X-Skyfun-Session') || '';
    const user = await whoami(token, env);
    if (!user) return json({ ok: false, error: '請先登入工具箱' }, 401, cors);

    if (!isAllowedName(user.name)) {
      return json({ ok: false, error: '沒有權限' }, 403, cors);
    }

    const lock = getLock(user.name);
    if (lock.until && Date.now() < lock.until) {
      const mins = Math.max(1, Math.ceil((lock.until - Date.now()) / 60000));
      return json({ ok: false, error: `嘗試次數過多，請 ${mins} 分鐘後再試`, lockedUntil: lock.until }, 429, cors);
    }

    const password = String(body?.password || '');
    if (!password || password.length > PASSWORD_MAX) {
      return json({ ok: false, error: '請輸入密碼' }, 400, cors);
    }

    const expected = String(env.TINGTING_KB_GATE_PASSWORD || '');
    if (!expected) {
      console.error(JSON.stringify({ event: 'tingting-kb-gate-misconfig', name: user.name }));
      return json({ ok: false, error: '門禁尚未設定，請通知管理員' }, 503, cors);
    }

    if (!passwordOk(password, expected)) {
      const fails = (lock.fails || 0) + 1;
      if (fails >= MAX_FAILS) {
        const until = Date.now() + LOCK_MS;
        setLock(user.name, { fails, until });
        console.log(JSON.stringify({ event: 'tingting-kb-gate-lock', name: user.name, fails }));
        return json({ ok: false, error: '密碼錯誤，已鎖定 10 分鐘', lockedUntil: until }, 429, cors);
      }
      setLock(user.name, { fails, until: 0 });
      console.log(JSON.stringify({ event: 'tingting-kb-gate-fail', name: user.name, fails }));
      return json({ ok: false, error: '密碼錯誤', failsLeft: MAX_FAILS - fails }, 401, cors);
    }

    clearLock(user.name);
    console.log(JSON.stringify({ event: 'tingting-kb-gate-ok', name: user.name }));
    return json({ ok: true }, 200, cors);
  }
};
