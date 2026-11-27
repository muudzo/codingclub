(() => {
  const listEl = document.getElementById('pending-sketches');
  const statusEl = document.getElementById('sketch-queue-status');
  if (!listEl || !statusEl) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function renderSvg(strokes) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 800 500');
    svg.setAttribute('aria-hidden', 'true');
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', '800');
    bg.setAttribute('height', '500');
    bg.setAttribute('fill', '#f4f4f4');
    svg.appendChild(bg);

    for (const s of strokes) {
      let node;
      if (s.tool === 'pen') {
        if (s.points.length === 1) {
          node = document.createElementNS(SVG_NS, 'circle');
          node.setAttribute('cx', String(s.points[0][0]));
          node.setAttribute('cy', String(s.points[0][1]));
          node.setAttribute('r', String(s.width / 2));
          node.setAttribute('fill', s.color);
          svg.appendChild(node);
          continue;
        }
        node = document.createElementNS(SVG_NS, 'path');
        node.setAttribute('d', s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' '));
      } else if (s.tool === 'line') {
        node = document.createElementNS(SVG_NS, 'line');
        node.setAttribute('x1', String(s.from[0]));
        node.setAttribute('y1', String(s.from[1]));
        node.setAttribute('x2', String(s.to[0]));
        node.setAttribute('y2', String(s.to[1]));
      } else if (s.tool === 'rect') {
        node = document.createElementNS(SVG_NS, 'rect');
        node.setAttribute('x', String(Math.min(s.from[0], s.to[0])));
        node.setAttribute('y', String(Math.min(s.from[1], s.to[1])));
        node.setAttribute('width', String(Math.abs(s.to[0] - s.from[0])));
        node.setAttribute('height', String(Math.abs(s.to[1] - s.from[1])));
      } else {
        node = document.createElementNS(SVG_NS, 'circle');
        node.setAttribute('cx', String((s.from[0] + s.to[0]) / 2));
        node.setAttribute('cy', String((s.from[1] + s.to[1]) / 2));
        node.setAttribute('r', String(Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) / 2));
      }
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', s.color);
      node.setAttribute('stroke-width', String(s.width));
      node.setAttribute('stroke-linecap', 'round');
      node.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(node);
    }
    return svg;
  }

  async function csrfToken() {
    const res = await fetch('/write/api/session', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.csrf || null;
  }

  async function moderate(id, action, card) {
    const token = await csrfToken();
    if (!token) {
      statusEl.textContent = 'Sign in again to review sketches.';
      return;
    }
    statusEl.textContent = action === 'approve' ? 'Publishing approved sketch...' : 'Removing sketch...';
    const res = await fetch(`/write/api/sketches/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-writer-csrf': token },
      body: JSON.stringify({ id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      statusEl.textContent = body.error || 'Could not update sketch.';
      return;
    }
    card.remove();
    statusEl.textContent = action === 'approve' ? 'Sketch published to /sketch/.' : 'Sketch deleted.';
    if (!listEl.children.length) statusEl.textContent = 'No pending sketches.';
  }

  async function loadQueue() {
    try {
      const res = await fetch('/write/api/sketches', { cache: 'no-store' });
      if (!res.ok) return;
      const { sketches = [] } = await res.json();
      listEl.replaceChildren();
      if (!sketches.length) {
        statusEl.textContent = 'No pending sketches.';
        return;
      }
      statusEl.textContent = `${sketches.length} pending sketch${sketches.length === 1 ? '' : 'es'} to review.`;
      for (const item of sketches) {
        const li = document.createElement('li');
        li.className = 'sketch-queue-item';
        li.appendChild(renderSvg(item.strokes));

        const meta = document.createElement('p');
        meta.textContent = item.author ? `${item.title} — ${item.author}` : item.title;
        li.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'sketch-queue-actions';
        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'primary';
        approveBtn.textContent = 'Approve';
        approveBtn.addEventListener('click', () => moderate(item.id, 'approve', li));

        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'secondary';
        rejectBtn.textContent = 'Delete';
        rejectBtn.addEventListener('click', () => moderate(item.id, 'reject', li));

        actions.append(approveBtn, rejectBtn);
        li.appendChild(actions);
        listEl.appendChild(li);
      }
    } catch { /* ignore when offline */ }
  }

  loadQueue();
})();
