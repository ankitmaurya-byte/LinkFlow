// Backend API wrapper for LinkFlow extension.
// Storage: browser.storage.local under keys `auth.accessToken`, `auth.refreshToken`, `auth.user`.

const API_BASE = 'http://localhost:4000';
// const API_BASE = 'https://linkflow-be.vercel.app';
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

// authedFetch: attaches access token; on 401 AUTH_EXPIRED, refresh once + retry.
async function authedFetch(path, opts = {}) {
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
}

const api = {
  base: API_BASE,
  getTokens,
  setTokens,
  clearTokens,
  rawFetch,
  authedFetch
};
