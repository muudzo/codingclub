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
  let color = '#7d0c14';
  let width = 5;
  let strokes = [];
  let activeStroke = null;
  let submitting = false;

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

  function redraw() {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const s of strokes) drawStroke(s);
    if (activeStroke) drawStroke(activeStroke);
  }

  redraw();

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if (strokes.length >= MAX_STROKES) {
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
    if (!activeStroke) return;
    strokes.push(activeStroke);
    activeStroke = null;
    redraw();
  }

  canvas.addEventListener('pointerup', finishStroke);
  canvas.addEventListener('pointercancel', finishStroke);

  document.querySelectorAll('[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      tool = btn.getAttribute('data-tool') || 'pen';
      document.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
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
