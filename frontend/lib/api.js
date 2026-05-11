// Backend API wrapper for urlgram extension.
// Storage: browser.storage.local under keys `auth.accessToken`, `auth.refreshToken`, `auth.user`.

// const API_BASE = 'http://localhost:4000';
const API_BASE = 'https://linkflow-be.vercel.app';
const TOKEN_KEYS = {
  access: 'auth.accessToken',
  refresh: 'auth.refreshToken',
  user: 'auth.user'
};

async function getTokens() {
  const data = await browser.storage.local.get([TOKEN_KEYS.access, TOKEN_KEYS.refresh, TOKEN_KEYS.user]);
  return {
    accessToken: data[TOKEN_KEYS.access] || null,
    refreshToken: data[TOKEN_KEYS.refresh] || null,
    user: data[TOKEN_KEYS.user] || null
  };
}

async function setTokens({ accessToken, refreshToken, user }) {
  const patch = {};
  if (accessToken !== undefined) patch[TOKEN_KEYS.access] = accessToken;
  if (refreshToken !== undefined) patch[TOKEN_KEYS.refresh] = refreshToken;
  if (user !== undefined) patch[TOKEN_KEYS.user] = user;
  await browser.storage.local.set(patch);
}

async function clearTokens() {
  await browser.storage.local.remove([TOKEN_KEYS.access, TOKEN_KEYS.refresh, TOKEN_KEYS.user]);
}

async function rawFetch(path, { method = 'GET', body, accessToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let payload = null;
  try { payload = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, body: payload };
}

async function tryRefresh() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;
  const res = await rawFetch('/auth/refresh', { method: 'POST', body: { refreshToken } });
  if (res.status !== 200) {
    await clearTokens();
    return null;
  }
  await setTokens({ accessToken: res.body.accessToken, refreshToken: res.body.refreshToken });
  return res.body.accessToken;
}

// === In-memory response cache ===
// GETs are cached for `ttl` ms (default 30s). Mutations invalidate the resource
// root (e.g. POST /bookmarks → drops every GET starting with /bookmarks).
// In-flight de-dup: identical concurrent GETs share one network request.
const _cache = new Map();   // key -> { expires, body }
const _inflight = new Map(); // key -> Promise<body>
const TTL_DEFAULT = 30000;

function _cacheKey(path, opts = {}) {
  const m = (opts.method || 'GET').toUpperCase();
  return m + ':' + path + ':' + (opts.body !== undefined ? JSON.stringify(opts.body) : '');
}

function _clone(v) {
  // Structured clone preserves Date/Map; JSON is enough for plain server JSON.
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function _resourceRoot(path) {
  const clean = (path || '').split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return '/' + parts[0];
}

function invalidate(prefix) {
  if (!prefix) { _cache.clear(); return; }
  const target = prefix.startsWith('/') ? prefix : '/' + prefix;
  for (const k of [..._cache.keys()]) {
    // key shape "METHOD:/path:body"
    const colonIdx = k.indexOf(':');
    const rest = colonIdx >= 0 ? k.slice(colonIdx + 1) : k;
    if (rest.startsWith(target)) _cache.delete(k);
  }
}

function clearCache() { _cache.clear(); _inflight.clear(); }

// authedFetch: attaches access token; on 401 AUTH_EXPIRED, refresh once + retry.
// Cached for GETs; mutations invalidate the resource root.
async function authedFetch(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const cacheable = method === 'GET' && !opts.noCache;
  const key = _cacheKey(path, opts);

  if (cacheable) {
    const hit = _cache.get(key);
    if (hit && hit.expires > Date.now()) return _clone(hit.body);
    // Coalesce concurrent identical GETs.
    if (_inflight.has(key)) return _clone(await _inflight.get(key));
  }

  const exec = (async () => {
    let { accessToken } = await getTokens();
    if (!accessToken) throw new Error('NOT_AUTHED');
    let res = await rawFetch(path, { ...opts, accessToken });
    if (res.status === 401 && res.body?.error?.code === 'AUTH_EXPIRED') {
      accessToken = await tryRefresh();
      if (!accessToken) throw new Error('NOT_AUTHED');
      res = await rawFetch(path, { ...opts, accessToken });
    }
    if (res.status >= 400) {
      const code = res.body?.error?.code || 'HTTP_' + res.status;
      const message = res.body?.error?.message || `HTTP ${res.status}`;
      const err = new Error(message);
      err.code = code;
      err.status = res.status;
      throw err;
    }
    return res.body;
  })();

  if (cacheable) _inflight.set(key, exec);

  try {
    const body = await exec;
    if (cacheable) {
      _cache.set(key, { expires: Date.now() + (opts.ttl || TTL_DEFAULT), body: _clone(body) });
    } else if (method !== 'GET') {
      // Invalidate cached GETs on this resource root.
      const root = _resourceRoot(path);
      if (root) invalidate(root);
    }
    return body;
  } finally {
    if (cacheable) _inflight.delete(key);
  }
}

const api = {
  base: API_BASE,
  getTokens,
  setTokens,
  clearTokens,
  rawFetch,
  authedFetch,
  invalidate,
  clearCache
};
