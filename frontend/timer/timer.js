(function () {
  const KEY = 'urlgram.timer.v1';
  const display = document.getElementById('tmDisplay');
  const startBtn = document.getElementById('tmStart');
  const pauseBtn = document.getElementById('tmPause');
  const resetBtn = document.getElementById('tmReset');
  const customWrap = document.getElementById('tmCustom');
  const minInput = document.getElementById('tmMin');
  const secInput = document.getElementById('tmSec');
  const applyBtn = document.getElementById('tmApply');
  const cyclesEl = document.getElementById('tmCycles');

  let totalSec = 25 * 60;
  let remaining = totalSec;
  let intervalId = null;
  let mode = 'pomodoro';
  const today = new Date().toDateString();
  let state = load();
  if (state.day !== today) state = { day: today, pomodoros: 0 };
  cyclesEl.textContent = `Pomodoros today: ${state.pomodoros}`;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { day: today, pomodoros: 0 }; }
    catch { return { day: today, pomodoros: 0 }; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  function fmt(s) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  function render() {
    display.textContent = fmt(remaining);
    document.title = fmt(remaining) + ' • Timer';
  }
  function setMode(m, minutes) {
    mode = m;
    document.querySelectorAll('.tm-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    customWrap.hidden = m !== 'custom';
    if (typeof minutes === 'number') {
      totalSec = minutes * 60;
      remaining = totalSec;
      stop(false);
      render();
    }
  }
  function start() {
    if (intervalId) return;
    startBtn.hidden = true;
    pauseBtn.hidden = false;
    display.classList.add('run');
    display.classList.remove('done');
    intervalId = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      render();
      if (remaining === 0) {
        stop(true);
        display.classList.add('done');
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.2;
          o.start(); o.stop(ctx.currentTime + 0.3);
        } catch (_) {}
        if (mode === 'pomodoro') {
          state.pomodoros += 1;
          save();
          cyclesEl.textContent = `Pomodoros today: ${state.pomodoros}`;
        }
      }
    }, 1000);
  }
  function stop(reset) {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    startBtn.hidden = false;
    pauseBtn.hidden = true;
    display.classList.remove('run');
    if (reset) remaining = totalSec;
    render();
  }
  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', () => stop(false));
  resetBtn.addEventListener('click', () => stop(true));

  document.querySelectorAll('.tm-mode button').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      if (m === 'custom') {
        setMode('custom');
      } else {
        const minutes = parseInt(btn.dataset.min, 10);
        setMode(m, minutes);
      }
    });
  });
  applyBtn.addEventListener('click', () => {
    const min = Math.max(0, parseInt(minInput.value, 10) || 0);
    const sec = Math.max(0, Math.min(59, parseInt(secInput.value, 10) || 0));
    totalSec = min * 60 + sec;
    remaining = totalSec;
    stop(false);
    render();
  });

  render();
})();
