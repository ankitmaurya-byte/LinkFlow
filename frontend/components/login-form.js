// Renders a login/signup overlay into a host element.
// Usage: const overlay = createLoginOverlay({ onAuthed: (user) => {...} }); container.appendChild(overlay);

function createLoginOverlay({ onAuthed } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <div class="app-icon">⬡</div>
        <h2 class="login-title">LinkFlow</h2>
        <p class="login-subtitle" data-role="subtitle">Sign in to sync bookmarks across devices</p>
      </div>
      <div class="login-tabs">
        <button class="login-tab active" data-mode="login" type="button">Log in</button>
        <button class="login-tab" data-mode="signup" type="button">Sign up</button>
      </div>
      <form class="login-form" data-role="form" autocomplete="on">
        <div class="form-group">
          <label for="login-username">Username</label>
          <input id="login-username" name="username" class="input" autocomplete="username"
                 minlength="3" maxlength="32" pattern="[a-z0-9_-]+" required />
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" class="input" type="password"
                 autocomplete="current-password" minlength="8" required />
        </div>
        <p class="login-error" data-role="error" hidden></p>
        <button type="submit" class="btn btn-primary login-submit" data-role="submit">Log in</button>
      </form>
      <p class="login-help" data-role="help">Username must be 3–32 chars of <code>a–z 0–9 _ -</code>. Password 8+ chars.</p>
    </div>
  `;

  let mode = 'login';
  const form = overlay.querySelector('[data-role="form"]');
  const errorEl = overlay.querySelector('[data-role="error"]');
  const submitBtn = overlay.querySelector('[data-role="submit"]');
  const subtitleEl = overlay.querySelector('[data-role="subtitle"]');
  const usernameInput = overlay.querySelector('#login-username');
  const passwordInput = overlay.querySelector('#login-password');

  function setMode(next) {
    mode = next;
    overlay.querySelectorAll('.login-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (mode === 'signup') {
      submitBtn.textContent = 'Create account';
      subtitleEl.textContent = 'Pick a username to start syncing';
      passwordInput.autocomplete = 'new-password';
    } else {
      submitBtn.textContent = 'Log in';
      subtitleEl.textContent = 'Sign in to sync bookmarks across devices';
      passwordInput.autocomplete = 'current-password';
    }
    showError(null);
  }

  function showError(message) {
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

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
    const original = submitBtn.textContent;
    submitBtn.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    try {
      const user = mode === 'signup'
        ? await auth.signup(username, password)
        : await auth.login(username, password);
      if (typeof onAuthed === 'function') onAuthed(user);
    } catch (err) {
      showError(humanizeAuthError(err, mode));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
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
