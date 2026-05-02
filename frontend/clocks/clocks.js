(function () {
  const KEY = 'linkflow.clocks.v1';
  const grid = document.getElementById('ckGrid');
  const labelEl = document.getElementById('ckLabel');
  const tzEl = document.getElementById('ckTz');
  const addBtn = document.getElementById('ckAdd');

  const zones = (typeof Intl.supportedValuesOf === 'function')
    ? Intl.supportedValuesOf('timeZone')
    : [
        'UTC',
        'America/New_York', 'America/Los_Angeles', 'America/Chicago',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
        'Australia/Sydney', 'Pacific/Auckland'
      ];
  for (const z of zones) {
    const opt = document.createElement('option');
    opt.value = z; opt.textContent = z;
    if (z === 'UTC') opt.selected = true;
    tzEl.appendChild(opt);
  }
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    tzEl.value = local;
  } catch (_) {}

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  let clocks = load();
  if (clocks.length === 0) {
    try {
      clocks = [{ id: '1', label: 'Local', tz: Intl.DateTimeFormat().resolvedOptions().timeZone }];
      save(clocks);
    } catch (_) {}
  }

  function fmtTime(tz) {
    try {
      return new Intl.DateTimeFormat([], {
        timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date());
    } catch { return '—'; }
  }
  function fmtDate(tz) {
    try {
      return new Intl.DateTimeFormat([], {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
      }).format(new Date());
    } catch { return ''; }
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function render() {
    grid.innerHTML = '';
    if (clocks.length === 0) {
      grid.innerHTML = '<div class="ck-empty">No clocks. Add one above.</div>';
      return;
    }
    for (const c of clocks) {
      const card = document.createElement('div');
      card.className = 'ck-card';
      card.dataset.id = c.id;
      card.innerHTML = `
        <button class="ck-del" title="Remove">×</button>
        <div class="ck-label">${esc(c.label || c.tz)}</div>
        <div class="ck-time">${fmtTime(c.tz)}</div>
        <div class="ck-date">${fmtDate(c.tz)}</div>
        <div class="ck-tz">${esc(c.tz)}</div>
      `;
      card.querySelector('.ck-del').addEventListener('click', () => {
        clocks = clocks.filter(x => x.id !== c.id);
        save(clocks);
        render();
      });
      grid.appendChild(card);
    }
  }

  function tick() {
    for (const c of clocks) {
      const card = grid.querySelector(`.ck-card[data-id="${c.id}"]`);
      if (!card) continue;
      card.querySelector('.ck-time').textContent = fmtTime(c.tz);
      card.querySelector('.ck-date').textContent = fmtDate(c.tz);
    }
  }
  addBtn.addEventListener('click', () => {
    const label = labelEl.value.trim();
    const tz = tzEl.value;
    if (!tz) return;
    clocks.push({ id: Date.now().toString(36), label: label || tz, tz });
    save(clocks);
    labelEl.value = '';
    render();
  });
  labelEl.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });

  render();
  setInterval(tick, 1000);
})();
