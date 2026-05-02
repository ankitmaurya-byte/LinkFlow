// Auth helpers built on lib/api.js.
// Exposes: signup, login, logout, getMe, isAuthed, getCurrentUser, onAuthChange.

const authListeners = new Set();

function notifyAuthChange(state) {
  for (const fn of authListeners) {
    try { fn(state); } catch (e) { console.error('auth listener error', e); }
  }
}

async function signup(username, password) {
  const res = await api.rawFetch('/auth/signup', {
    method: 'POST',
    body: { username, password }
  });
  if (res.status !== 200) {
    const err = new Error(res.body?.error?.message || 'Signup failed');
    err.code = res.body?.error?.code;
    err.status = res.status;
    throw err;
  }
  await api.setTokens({
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    user: res.body.user
  });
  notifyAuthChange({ authed: true, user: res.body.user });
  return res.body.user;
}

async function login(username, password) {
  const res = await api.rawFetch('/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  if (res.status !== 200) {
    const err = new Error(res.body?.error?.message || 'Login failed');
    err.code = res.body?.error?.code;
    err.status = res.status;
    throw err;
  }
  await api.setTokens({
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    user: res.body.user
  });
  notifyAuthChange({ authed: true, user: res.body.user });
  return res.body.user;
}

async function logout() {
  const { refreshToken } = await api.getTokens();
  if (refreshToken) {
    try {
      await api.rawFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
    } catch (_) { /* best-effort */ }
  }
  await api.clearTokens();
  api.clearCache?.();
  notifyAuthChange({ authed: false, user: null });
}

async function getCurrentUser() {
  const { user } = await api.getTokens();
  return user;
}

async function isAuthed() {
  const { accessToken, refreshToken } = await api.getTokens();
  return Boolean(accessToken || refreshToken);
}

async function getMe() {
  const data = await api.authedFetch('/me');
  await api.setTokens({ user: data.user });
  return data.user;
}

function onAuthChange(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

const auth = { signup, login, logout, getCurrentUser, isAuthed, getMe, onAuthChange };
