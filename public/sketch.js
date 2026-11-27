(() => {
  const canvas = document.getElementById('sketch-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const WIDTH = 800;
  const HEIGHT = 500;
  const MAX_STROKES = 300;
  const MAX_POINTS = 500;

  let tool = 'pen';
  let mirror = 'none';
  let color = '#7d0c14';
  let width = 5;
  let strokes = [];
  let activeStroke = null;
  let moveDrag = null;
  let submitting = false;

  const canvasWrap = canvas.closest('.sketch-canvas-wrap');
  const statusEl = document.getElementById('sketch-status');
  const formEl = document.getElementById('sketch-submit-form');
  const submitBtn = document.getElementById('sketch-submit-btn');

  function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', isError);
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const x = round1(((event.clientX - rect.left) / rect.width) * WIDTH);
    const y = round1(((event.clientY - rect.top) / rect.height) * HEIGHT);
    return [Math.max(0, Math.min(WIDTH, x)), Math.max(0, Math.min(HEIGHT, y))];
  }

  function drawStroke(s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (s.tool === 'pen') {
      if (s.points.length === 1) {
        ctx.beginPath();
        ctx.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i += 1) {
        ctx.lineTo(s.points[i][0], s.points[i][1]);
      }
      ctx.stroke();
      return;
    }
    const [x1, y1] = s.from;
    const [x2, y2] = s.to;
    ctx.beginPath();
    if (s.tool === 'line') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    } else if (s.tool === 'rect') {
      ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (s.tool === 'circle') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const r = Math.hypot(x2 - x1, y2 - y1) / 2;
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.stroke();
  }

  function transformStroke(s, flipX, flipY) {
    const tx = x => (flipX ? round1(WIDTH - x) : x);
    const ty = y => (flipY ? round1(HEIGHT - y) : y);
    if (s.tool === 'pen') {
      return { tool: 'pen', color: s.color, width: s.width, points: s.points.map(([x, y]) => [tx(x), ty(y)]) };
    }
    return {
      tool: s.tool,
      color: s.color,
      width: s.width,
      from: [tx(s.from[0]), ty(s.from[1])],
      to: [tx(s.to[0]), ty(s.to[1])],
    };
  }

  function expandSymmetry(s) {
    if (mirror === 'horizontal') {
      return [s, transformStroke(s, true, false)];
    }
    if (mirror === 'kaleidoscope') {
      return [
        s,
        transformStroke(s, true, false),
        transformStroke(s, false, true),
        transformStroke(s, true, true),
      ];
    }
    return [s];
  }

  function getStrokesBounds(list) {
    let minX = WIDTH;
    let maxX = 0;
    let minY = HEIGHT;
    let maxY = 0;
    const visit = ([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };
    for (const s of list) {
      if (s.tool === 'pen') {
        s.points.forEach(visit);
      } else {
        visit(s.from);
        visit(s.to);
      }
    }
    return { minX, maxX, minY, maxY };
  }

  function translateStroke(s, dx, dy) {
    const shift = ([x, y]) => [
      Math.max(0, Math.min(WIDTH, round1(x + dx))),
      Math.max(0, Math.min(HEIGHT, round1(y + dy))),
    ];
    if (s.tool === 'pen') {
      return { ...s, points: s.points.map(shift) };
    }
    return { ...s, from: shift(s.from), to: shift(s.to) };
  }

  function drawGuides() {
    if (mirror === 'none') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 12, 20, 0.24)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 0);
    ctx.lineTo(WIDTH / 2, HEIGHT);
    if (mirror === 'kaleidoscope') {
      ctx.moveTo(0, HEIGHT / 2);
      ctx.lineTo(WIDTH, HEIGHT / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function redraw() {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawGuides();
    for (const s of strokes) drawStroke(s);
    if (activeStroke) {
      for (const s of expandSymmetry(activeStroke)) drawStroke(s);
    }
  }

  redraw();

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (tool === 'move') {
      if (!strokes.length) return;
      canvas.setPointerCapture(event.pointerId);
      const pt = canvasPoint(event);
      const snapshot = strokes.map(s => (
        s.tool === 'pen'
          ? { ...s, points: s.points.map(([x, y]) => [x, y]) }
          : { ...s, from: [...s.from], to: [...s.to] }
      ));
      moveDrag = { start: pt, snapshot, bounds: getStrokesBounds(snapshot) };
      return;
    }
    const needed = mirror === 'kaleidoscope' ? 4 : mirror === 'horizontal' ? 2 : 1;
    if (strokes.length + needed > MAX_STROKES) {
      setStatus(`Limit of ${MAX_STROKES} strokes reached. Undo or clear to continue.`, true);
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    const pt = canvasPoint(event);
    activeStroke = tool === 'pen'
      ? { tool: 'pen', color, width, points: [pt] }
      : { tool, color, width, from: pt, to: pt };
    redraw();
  });

  canvas.addEventListener('pointermove', event => {
    if (moveDrag) {
      const pt = canvasPoint(event);
      const rawDx = pt[0] - moveDrag.start[0];
      const rawDy = pt[1] - moveDrag.start[1];
      const dx = round1(Math.max(-moveDrag.bounds.minX, Math.min(WIDTH - moveDrag.bounds.maxX, rawDx)));
      const dy = round1(Math.max(-moveDrag.bounds.minY, Math.min(HEIGHT - moveDrag.bounds.maxY, rawDy)));
      strokes = moveDrag.snapshot.map(s => translateStroke(s, dx, dy));
      redraw();
      return;
    }
    if (!activeStroke) return;
    const pt = canvasPoint(event);
    if (activeStroke.tool === 'pen') {
      const last = activeStroke.points[activeStroke.points.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 1.5 && activeStroke.points.length < MAX_POINTS) {
        activeStroke.points.push(pt);
      }
    } else {
      activeStroke.to = pt;
    }
    redraw();
  });

  function finishStroke() {
    if (moveDrag) {
      moveDrag = null;
      return;
    }
    if (!activeStroke) return;
    for (const s of expandSymmetry(activeStroke)) {
      if (strokes.length < MAX_STROKES) strokes.push(s);
    }
    activeStroke = null;
    redraw();
  }

  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);

  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      tool = btn.getAttribute('data-tool') || 'pen';
      document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      canvasWrap?.classList.toggle('is-move-tool', tool === 'move');
    });
  });

  document.querySelectorAll('[data-mirror]').forEach(btn => {
    btn.addEventListener('click', () => {
      mirror = btn.getAttribute('data-mirror') || 'none';
      document.querySelectorAll('[data-mirror]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      redraw();
    });
  });

  document.querySelectorAll('[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      color = btn.getAttribute('data-color') || '#7d0c14';
      document.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  document.querySelectorAll('[data-width]').forEach(btn => {
    btn.addEventListener('click', () => {
      width = Number(btn.getAttribute('data-width')) || 5;
      document.querySelectorAll('[data-width]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  document.getElementById('sketch-undo')?.addEventListener('click', () => {
    if (!strokes.length) return;
    strokes.pop();
    redraw();
    setStatus('');
  });

  document.getElementById('sketch-clear')?.addEventListener('click', () => {
    strokes = [];
    activeStroke = null;
    redraw();
    setStatus('Canvas cleared.');
  });

  function buildSvg() {
    const parts = strokes.map(s => {
      const attrs = `fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"`;
      if (s.tool === 'pen') {
        if (s.points.length === 1) {
          return `<circle cx="${s.points[0][0]}" cy="${s.points[0][1]}" r="${s.width / 2}" fill="${s.color}" />`;
        }
        const d = s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
        return `<path d="${d}" ${attrs} />`;
      }
      const [x1, y1] = s.from;
      const [x2, y2] = s.to;
      if (s.tool === 'line') return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs} />`;
      if (s.tool === 'rect') {
        return `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" ${attrs} />`;
      }
      const cx = round1((x1 + x2) / 2);
      const cy = round1((y1 + y2) / 2);
      const r = round1(Math.hypot(x2 - x1, y2 - y1) / 2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs} />`;
    });
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">`,
      `  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f4f4f4" />`,
      `  ${parts.join('\n  ')}`,
      '</svg>',
    ].join('\n');
  }

  function hexToRgb01(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' ');
  }

  function buildPdf() {
    const commands = ['0.957 0.957 0.957 rg', `0 0 ${WIDTH} ${HEIGHT} re f`, '1 J 1 j'];
    const py = y => (HEIGHT - y).toFixed(1);
    for (const s of strokes) {
      const rgb = hexToRgb01(s.color);
      commands.push(`${rgb} RG ${rgb} rg ${s.width} w`);
      if (s.tool === 'pen') {
        if (s.points.length === 1) {
          const [cx, cy] = s.points[0];
          const r = s.width / 2;
          commands.push(`${(cx - r).toFixed(1)} ${(HEIGHT - cy - r).toFixed(1)} ${s.width} ${s.width} re f`);
          continue;
        }
        commands.push(`${s.points[0][0].toFixed(1)} ${py(s.points[0][1])} m`);
        for (let i = 1; i < s.points.length; i += 1) {
          commands.push(`${s.points[i][0].toFixed(1)} ${py(s.points[i][1])} l`);
        }
        commands.push('S');
      } else if (s.tool === 'line') {
        commands.push(`${s.from[0].toFixed(1)} ${py(s.from[1])} m ${s.to[0].toFixed(1)} ${py(s.to[1])} l S`);
      } else if (s.tool === 'rect') {
        const x = Math.min(s.from[0], s.to[0]);
        const y = Math.min(s.from[1], s.to[1]);
        const w = Math.abs(s.to[0] - s.from[0]);
        const h = Math.abs(s.to[1] - s.from[1]);
        commands.push(`${x.toFixed(1)} ${(HEIGHT - y - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
      } else if (s.tool === 'circle') {
        const cx = (s.from[0] + s.to[0]) / 2;
        const cy = (s.from[1] + s.to[1]) / 2;
        const r = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) / 2;
        const k = r * 0.5522847498;
        commands.push(`${(cx + r).toFixed(1)} ${py(cy)} m`);
        commands.push(`${(cx + r).toFixed(1)} ${py(cy - k)} ${(cx + k).toFixed(1)} ${py(cy - r)} ${cx.toFixed(1)} ${py(cy - r)} c`);
        commands.push(`${(cx - k).toFixed(1)} ${py(cy - r)} ${(cx - r).toFixed(1)} ${py(cy - k)} ${(cx - r).toFixed(1)} ${py(cy)} c`);
        commands.push(`${(cx - r).toFixed(1)} ${py(cy + k)} ${(cx - k).toFixed(1)} ${py(cy + r)} ${cx.toFixed(1)} ${py(cy + r)} c`);
        commands.push(`${(cx + k).toFixed(1)} ${py(cy + r)} ${(cx + r).toFixed(1)} ${py(cy + k)} ${(cx + r).toFixed(1)} ${py(cy)} c S`);
      }
    }
    const stream = commands.join('\n');
    const objs = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Contents 4 0 R >>\nendobj\n`,
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objs) {
      offsets.push(pdf.length);
      pdf += obj;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return pdf;
  }

  function triggerDownload(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById('sketch-download-svg')?.addEventListener('click', () => {
    if (!strokes.length) return setStatus('Draw something first before downloading.', true);
    triggerDownload(buildSvg(), 'image/svg+xml;charset=utf-8', 'tatenda-sketch.svg');
    setStatus('SVG downloaded.');
  });

  document.getElementById('sketch-download-pdf')?.addEventListener('click', () => {
    if (!strokes.length) return setStatus('Draw something first before downloading.', true);
    triggerDownload(buildPdf(), 'application/pdf', 'tatenda-sketch.pdf');
    setStatus('PDF downloaded.');
  });

  const ALLOWED_COLORS = new Set(['#7d0c14', '#1f1c1c', '#4a5568', '#9c6b19']);
  const ALLOWED_WIDTHS = new Set([2, 5, 9]);
  const ALLOWED_TOOLS = new Set(['pen', 'line', 'rect', 'circle']);

  function encodeShareState() {
    const titleInput = formEl?.querySelector('input[name="title"]');
    const authorInput = formEl?.querySelector('input[name="author"]');
    const payload = {
      t: titleInput instanceof HTMLInputElement ? titleInput.value.trim().slice(0, 60) : '',
      a: authorInput instanceof HTMLInputElement ? authorInput.value.trim().slice(0, 40) : '',
      s: strokes,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeShareState(encoded) {
    try {
      const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!parsed || !Array.isArray(parsed.s) || parsed.s.length === 0 || parsed.s.length > MAX_STROKES) return null;
      const validStrokes = [];
      for (const raw of parsed.s) {
        if (!raw || !ALLOWED_TOOLS.has(raw.tool) || !ALLOWED_COLORS.has(raw.color) || !ALLOWED_WIDTHS.has(Number(raw.width))) return null;
        if (raw.tool === 'pen') {
          if (!Array.isArray(raw.points) || !raw.points.length || raw.points.length > MAX_POINTS) return null;
          const pts = raw.points.map(p => (Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
            ? [Math.max(0, Math.min(WIDTH, round1(Number(p[0])))), Math.max(0, Math.min(HEIGHT, round1(Number(p[1]))))]
            : null);
          if (pts.some(p => !p)) return null;
          validStrokes.push({ tool: 'pen', color: raw.color, width: Number(raw.width), points: pts });
        } else {
          if (!Array.isArray(raw.from) || raw.from.length !== 2 || !Array.isArray(raw.to) || raw.to.length !== 2) return null;
          const fx = Number(raw.from[0]), fy = Number(raw.from[1]), tx = Number(raw.to[0]), ty = Number(raw.to[1]);
          if (![fx, fy, tx, ty].every(Number.isFinite)) return null;
          validStrokes.push({
            tool: raw.tool,
            color: raw.color,
            width: Number(raw.width),
            from: [Math.max(0, Math.min(WIDTH, round1(fx))), Math.max(0, Math.min(HEIGHT, round1(fy)))],
            to: [Math.max(0, Math.min(WIDTH, round1(tx))), Math.max(0, Math.min(HEIGHT, round1(ty)))],
          });
        }
      }
      return {
        title: typeof parsed.t === 'string' ? parsed.t.trim().slice(0, 60) : '',
        author: typeof parsed.a === 'string' ? parsed.a.trim().slice(0, 40) : '',
        strokes: validStrokes,
      };
    } catch {
      return null;
    }
  }

  document.getElementById('sketch-copy-link')?.addEventListener('click', async () => {
    if (!strokes.length) return setStatus('Draw something first before copying a link.', true);
    const encoded = encodeShareState();
    if (encoded.length > 8000) {
      return setStatus('This drawing is too detailed for a share link—download it as SVG or PDF instead.', true);
    }
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    history.replaceState(null, '', `#s=${encoded}`);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Share link copied! Anyone with this link can open your drawing.');
    } catch {
      setStatus('Share link added to your address bar—copy the URL to share.');
    }
  });

  if (window.location.hash.startsWith('#s=')) {
    const loaded = decodeShareState(window.location.hash.slice(3));
    if (loaded) {
      strokes = loaded.strokes;
      const titleInput = formEl?.querySelector('input[name="title"]');
      const authorInput = formEl?.querySelector('input[name="author"]');
      if (titleInput instanceof HTMLInputElement && loaded.title) titleInput.value = loaded.title;
      if (authorInput instanceof HTMLInputElement && loaded.author) authorInput.value = loaded.author;
      redraw();
      setStatus('Loaded shared sketch from link.');
    } else {
      setStatus('Could not load that shared sketch link.', true);
    }
  }

  formEl?.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    if (!strokes.length) return setStatus('Draw at least one line or shape before posting.', true);
    const data = new FormData(formEl);
    const title = String(data.get('title') || '').trim();
    const author = String(data.get('author') || '').trim();
    if (!title) return setStatus('Please add a title for your sketch.', true);

    submitting = true;
    if (submitBtn) submitBtn.setAttribute('disabled', 'true');
    setStatus('Sending sketch for review...');
    try {
      const response = await fetch('/write/api/public/sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, strokes }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(body.error || 'Could not send sketch right now. You can still download SVG or PDF.', true);
        return;
      }
      strokes = [];
      redraw();
      formEl.reset();
      setStatus(body.message || 'Sketch received! It will appear on the wall once approved.');
    } catch {
      setStatus('Sketch submission service is offline right now, but you can still download your SVG or PDF.', true);
    } finally {
      submitting = false;
      submitBtn?.removeAttribute('disabled');
    }
  });
})();
