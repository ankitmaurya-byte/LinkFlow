// Renders a login/signup overlay into a host element.
// Usage: const overlay = createLoginOverlay({ onAuthed: (user) => {...} }); container.appendChild(overlay);

const LF_ICONS = {
  brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  user:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  lock:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  eye:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.79 19.79 0 0 1 5.16-6.16M9.9 4.24A11 11 0 0 1 12 4c7 0 11 8 11 8a19.86 19.86 0 0 1-3.17 4.19"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z"/></svg>'
};

function createLoginOverlay({ onAuthed } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <div class="app-icon">${LF_ICONS.brand}</div>
        <h2 class="login-title">urlgram</h2>
        <p class="login-subtitle" data-role="subtitle">Sign in to sync bookmarks across devices</p>
      </div>
      <div class="login-tabs">
        <button class="login-tab active" data-mode="login" type="button">
          <span class="lf-tab-icon">${LF_ICONS.user}</span>
          Log in
        </button>
        <button class="login-tab" data-mode="signup" type="button">
          <span class="lf-tab-icon">${LF_ICONS.spark}</span>
          Sign up
        </button>
      </div>
      <form class="login-form" data-role="form" autocomplete="on">
        <div class="form-group">
          <label for="login-username">Username</label>
          <div class="lf-field">
            <span class="lf-field-icon">${LF_ICONS.user}</span>
            <input id="login-username" name="username" class="input lf-input" autocomplete="username"
                   minlength="3" maxlength="32" pattern="[a-z0-9_-]+" placeholder="yourname" required />
          </div>
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <div class="lf-field">
            <span class="lf-field-icon">${LF_ICONS.lock}</span>
            <input id="login-password" name="password" class="input lf-input" type="password"
                   autocomplete="current-password" minlength="8" placeholder="••••••••" required />
            <button type="button" class="lf-field-toggle" data-role="pwToggle" title="Show password" aria-label="Show password">
              ${LF_ICONS.eye}
            </button>
          </div>
        </div>
        <p class="login-error" data-role="error" hidden>
          <span class="lf-error-icon">${LF_ICONS.alert}</span>
          <span data-role="errorText"></span>
        </p>
        <button type="submit" class="btn btn-primary login-submit" data-role="submit">
          <span data-role="submitLabel">Log in</span>
          <span class="lf-submit-icon">${LF_ICONS.arrow}</span>
        </button>
      </form>
      <p class="login-help" data-role="help">Username must be 3–32 chars of <code>a–z 0–9 _ -</code>. Password 8+ chars.</p>
    </div>
  `;

  let mode = 'login';
  const form = overlay.querySelector('[data-role="form"]');
  const errorEl = overlay.querySelector('[data-role="error"]');
  const errorTextEl = overlay.querySelector('[data-role="errorText"]');
  const submitBtn = overlay.querySelector('[data-role="submit"]');
  const submitLabel = overlay.querySelector('[data-role="submitLabel"]');
  const subtitleEl = overlay.querySelector('[data-role="subtitle"]');
  const usernameInput = overlay.querySelector('#login-username');
  const passwordInput = overlay.querySelector('#login-password');
  const pwToggle = overlay.querySelector('[data-role="pwToggle"]');

  function setMode(next) {
    mode = next;
    overlay.querySelectorAll('.login-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (mode === 'signup') {
      submitLabel.textContent = 'Create account';
      subtitleEl.textContent = 'Pick a username to start syncing';
      passwordInput.autocomplete = 'new-password';
    } else {
      submitLabel.textContent = 'Log in';
      subtitleEl.textContent = 'Sign in to sync bookmarks across devices';
      passwordInput.autocomplete = 'current-password';
    }
    showError(null);
  }

  function showError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorTextEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorTextEl.textContent = message;
  }

  pwToggle.addEventListener('click', () => {
    const isPw = passwordInput.type === 'password';
    passwordInput.type = isPw ? 'text' : 'password';
    pwToggle.innerHTML = isPw ? LF_ICONS.eyeOff : LF_ICONS.eye;
    pwToggle.title = isPw ? 'Hide password' : 'Show password';
    pwToggle.setAttribute('aria-label', pwToggle.title);
  });

  overlay.querySelectorAll('.login-tab').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(null);
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!username || !password) return;
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    const original = submitLabel.textContent;
    submitLabel.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    try {
      const user = mode === 'signup'
        ? await auth.signup(username, password)
        : await auth.login(username, password);
      if (typeof onAuthed === 'function') onAuthed(user);
    } catch (err) {
      showError(humanizeAuthError(err, mode));
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      submitLabel.textContent = original;
    }
  });

  return overlay;
}

function humanizeAuthError(err, mode) {
  const code = err?.code;
  if (code === 'CONFLICT' || code === 'USERNAME_TAKEN') return 'Username already taken.';
  if (code === 'AUTH_INVALID') return 'Wrong username or password.';
  if (code === 'VALIDATION') return err.message || 'Invalid username or password.';
  if (code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and retry.';
  if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
    return 'Cannot reach server. Is the backend running on localhost:4000?';
  }
  return err?.message || (mode === 'signup' ? 'Signup failed.' : 'Login failed.');
}
