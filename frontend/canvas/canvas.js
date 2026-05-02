// Self-contained canvas editor — pen / rect / ellipse / line / arrow / text / eraser.
// Vector model: shapes[] redrawn each tick. Persists JSON to localStorage.

(function () {
  const KEY = 'linkflow.canvas.v2';
  const stage = document.getElementById('cvCanvas');
  const ctx = stage.getContext('2d');
  const stageWrap = stage.parentElement;
  const textEditor = document.getElementById('cvTextEditor');

  let DPR = window.devicePixelRatio || 1;
  let tool = 'pen';
  let stroke = '#181d26';
  let fill = '#ffffff00';
  let lineWidth = 2;

  let shapes = load() || [];
  let undoStack = [];
  let redoStack = [];

  let drawing = false;
  let startPt = null;
  let activeShape = null;
  let selected = null;
  let dragOffset = null;

  function fitCanvas() {
    DPR = window.devicePixelRatio || 1;
    const w = stageWrap.clientWidth;
    const h = stageWrap.clientHeight;
    stage.width = w * DPR;
    stage.height = h * DPR;
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    redraw();
  }

  function pos(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function snap() {
    return JSON.stringify(shapes);
  }
  function pushHistory() {
    undoStack.push(snap());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  let saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(shapes)); } catch (_) {}
    }, 300);
  }

  function redraw() {
    ctx.clearRect(0, 0, stage.width / DPR, stage.height / DPR);
    for (const s of shapes) drawShape(s, false);
    if (activeShape) drawShape(activeShape, true);
    if (selected) drawHandles(selected);
  }

  function drawShape(s, ghost) {
    ctx.save();
    ctx.strokeStyle = s.stroke || '#181d26';
    ctx.fillStyle = s.fill || 'transparent';
    ctx.lineWidth = s.width || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (ghost) ctx.globalAlpha = 0.7;

    if (s.type === 'pen') {
      ctx.beginPath();
      const pts = s.points || [];
      pts.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    } else if (s.type === 'rect') {
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      if (s.fill && !s.fill.endsWith('00')) ctx.fill();
      ctx.stroke();
    } else if (s.type === 'ellipse') {
      ctx.beginPath();
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      ctx.ellipse(cx, cy, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2);
      if (s.fill && !s.fill.endsWith('00')) ctx.fill();
      ctx.stroke();
    } else if (s.type === 'line' || s.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      if (s.type === 'arrow') {
        const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
        const head = 10 + (s.width || 2);
        ctx.beginPath();
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - head * Math.cos(a - Math.PI / 6), s.y2 - head * Math.sin(a - Math.PI / 6));
        ctx.moveTo(s.x2, s.y2);
        ctx.lineTo(s.x2 - head * Math.cos(a + Math.PI / 6), s.y2 - head * Math.sin(a + Math.PI / 6));
        ctx.stroke();
      }
    } else if (s.type === 'text') {
      ctx.fillStyle = s.stroke || '#181d26';
      ctx.font = `${(s.size || 16)}px var(--font-sans, -apple-system, sans-serif)`;
      ctx.textBaseline = 'top';
      const lines = (s.text || '').split('\n');
      lines.forEach((ln, i) => ctx.fillText(ln, s.x, s.y + i * (s.size || 16) * 1.2));
    }
    ctx.restore();
  }

  function drawHandles(s) {
    const b = bounds(s);
    if (!b) return;
    ctx.save();
    ctx.strokeStyle = '#1b61c9';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.restore();
  }

  function bounds(s) {
    if (s.type === 'pen') {
      if (!s.points?.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    if (s.type === 'rect' || s.type === 'ellipse') {
      const x = Math.min(s.x, s.x + s.w);
      const y = Math.min(s.y, s.y + s.h);
      return { x, y, w: Math.abs(s.w), h: Math.abs(s.h) };
    }
    if (s.type === 'line' || s.type === 'arrow') {
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1)
      };
    }
    if (s.type === 'text') {
      return { x: s.x, y: s.y, w: 100, h: (s.size || 16) * 1.2 };
    }
    return null;
  }

  function hitTest(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const b = bounds(shapes[i]);
      if (!b) continue;
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) {
        return shapes[i];
      }
    }
    return null;
  }

  // === Tool selection ===
  document.querySelectorAll('.cv-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool;
      document.querySelectorAll('.cv-tool').forEach(b => b.classList.toggle('active', b === btn));
      stage.style.cursor = (tool === 'select' || tool === 'eraser') ? 'default' : 'crosshair';
      selected = null;
      redraw();
    });
  });

  document.getElementById('cvColor').addEventListener('input', e => {
    stroke = e.target.value;
    if (selected) { selected.stroke = stroke; persist(); redraw(); }
  });
  document.getElementById('cvFill').addEventListener('input', e => {
    fill = e.target.value + (e.target.value.length === 7 ? '' : '');
    if (selected) { selected.fill = fill; persist(); redraw(); }
  });
  document.getElementById('cvWidth').addEventListener('input', e => {
    lineWidth = parseInt(e.target.value, 10);
    if (selected) { selected.width = lineWidth; persist(); redraw(); }
  });

  document.getElementById('cvUndo').addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(snap());
    shapes = JSON.parse(undoStack.pop());
    persist();
    redraw();
  });
  document.getElementById('cvRedo').addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(snap());
    shapes = JSON.parse(redoStack.pop());
    persist();
    redraw();
  });
  document.getElementById('cvClear').addEventListener('click', () => {
    if (!shapes.length) return;
    pushHistory();
    shapes = [];
    persist();
    redraw();
  });
  document.getElementById('cvExport').addEventListener('click', () => {
    const url = stage.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkflow-canvas-' + Date.now() + '.png';
    a.click();
  });

  // === Drawing ===
  stage.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    if (tool === 'select') {
      const hit = hitTest(p.x, p.y);
      selected = hit;
      if (hit) {
        const b = bounds(hit);
        dragOffset = { dx: p.x - b.x, dy: p.y - b.y };
      }
      redraw();
      return;
    }
    if (tool === 'eraser') {
      const hit = hitTest(p.x, p.y);
      if (hit) {
        pushHistory();
        shapes = shapes.filter(s => s !== hit);
        persist();
        redraw();
      }
      return;
    }
    if (tool === 'text') {
      showTextEditor(p.x, p.y);
      return;
    }
    drawing = true;
    startPt = p;
    if (tool === 'pen') {
      activeShape = { type: 'pen', stroke, width: lineWidth, points: [p] };
    } else if (tool === 'rect' || tool === 'ellipse') {
      activeShape = { type: tool, stroke, fill, width: lineWidth, x: p.x, y: p.y, w: 0, h: 0 };
    } else if (tool === 'line' || tool === 'arrow') {
      activeShape = { type: tool, stroke, width: lineWidth, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    }
    redraw();
  });

  stage.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (tool === 'select' && selected && dragOffset && (e.buttons & 1)) {
      moveShape(selected, p.x - dragOffset.dx, p.y - dragOffset.dy);
      redraw();
      return;
    }
    if (!drawing || !activeShape) return;
    if (activeShape.type === 'pen') {
      activeShape.points.push(p);
    } else if (activeShape.type === 'rect' || activeShape.type === 'ellipse') {
      activeShape.w = p.x - startPt.x;
      activeShape.h = p.y - startPt.y;
    } else if (activeShape.type === 'line' || activeShape.type === 'arrow') {
      activeShape.x2 = p.x;
      activeShape.y2 = p.y;
    }
    redraw();
  });

  const endDraw = () => {
    if (drawing && activeShape) {
      pushHistory();
      shapes.push(activeShape);
      persist();
    }
    drawing = false;
    activeShape = null;
    startPt = null;
    if (tool === 'select') dragOffset = null;
    redraw();
  };
  stage.addEventListener('pointerup', endDraw);
  stage.addEventListener('pointercancel', endDraw);
  stage.addEventListener('pointerleave', () => {
    if (drawing) endDraw();
  });

  function moveShape(s, x, y) {
    const b = bounds(s);
    if (!b) return;
    const dx = x - b.x;
    const dy = y - b.y;
    if (s.type === 'pen') {
      s.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    } else if (s.type === 'rect' || s.type === 'ellipse') {
      s.x += dx; s.y += dy;
    } else if (s.type === 'line' || s.type === 'arrow') {
      s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
    } else if (s.type === 'text') {
      s.x += dx; s.y += dy;
    }
    persist();
  }

  function showTextEditor(x, y) {
    textEditor.hidden = false;
    textEditor.style.left = x + 'px';
    textEditor.style.top = y + 'px';
    textEditor.textContent = '';
    textEditor.focus();
    const onBlur = () => {
      const txt = textEditor.textContent.trim();
      textEditor.hidden = true;
      textEditor.removeEventListener('blur', onBlur);
      if (txt) {
        pushHistory();
        shapes.push({ type: 'text', stroke, x, y, text: txt, size: 16 + lineWidth });
        persist();
        redraw();
      }
    };
    textEditor.addEventListener('blur', onBlur);
    textEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') textEditor.blur();
    });
  }

  // === Keyboard shortcuts ===
  window.addEventListener('keydown', (e) => {
    if (textEditor && !textEditor.hidden) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('cvUndo').click();
    } else if (meta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      document.getElementById('cvRedo').click();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected) {
        e.preventDefault();
        pushHistory();
        shapes = shapes.filter(s => s !== selected);
        selected = null;
        persist();
        redraw();
      }
    } else if (e.key === 'p') tool = 'pen';
    else if (e.key === 'r') tool = 'rect';
    else if (e.key === 'o') tool = 'ellipse';
    else if (e.key === 'l') tool = 'line';
    else if (e.key === 'a') tool = 'arrow';
    else if (e.key === 't') tool = 'text';
    else if (e.key === 'e') tool = 'eraser';
    else if (e.key === 'v' || e.key === 's') tool = 'select';
    document.querySelectorAll('.cv-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  });

  window.addEventListener('resize', fitCanvas);
  fitCanvas();
})();
