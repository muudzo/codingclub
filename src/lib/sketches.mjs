export const SKETCH_WIDTH = 800;
export const SKETCH_HEIGHT = 500;
export const SKETCH_COLORS = ['#7d0c14', '#1f1c1c', '#4a5568', '#9c6b19'];
export const SKETCH_TOOLS = ['pen', 'line', 'rect', 'circle'];
export const SKETCH_WIDTHS = [2, 5, 9];
export const SKETCH_LIMITS = {
  maxBodyBytes: 65536,
  maxStrokes: 300,
  maxPoints: 500,
  maxTitle: 60,
  maxAuthor: 40,
};

const clamp = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;

function readPoint(pair) {
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  const x = Number(pair[0]);
  const y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp(x, 0, SKETCH_WIDTH), clamp(y, 0, SKETCH_HEIGHT)];
}

export function validateSketchPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Sketch data must be an object.' };
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > SKETCH_LIMITS.maxTitle) {
    return { ok: false, error: `Title must be 1–${SKETCH_LIMITS.maxTitle} characters.` };
  }
  const author = typeof input.author === 'string' ? input.author.trim() : '';
  if (author.length > SKETCH_LIMITS.maxAuthor) {
    return { ok: false, error: `Name must be at most ${SKETCH_LIMITS.maxAuthor} characters.` };
  }
  if (!Array.isArray(input.strokes) || input.strokes.length === 0) {
    return { ok: false, error: 'Draw at least one line or shape before posting.' };
  }
  if (input.strokes.length > SKETCH_LIMITS.maxStrokes) {
    return { ok: false, error: `Sketches are limited to ${SKETCH_LIMITS.maxStrokes} strokes.` };
  }
  const strokes = [];
  for (const raw of input.strokes) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid stroke entry.' };
    if (!SKETCH_TOOLS.includes(raw.tool)) return { ok: false, error: 'Unsupported drawing tool.' };
    if (!SKETCH_COLORS.includes(raw.color)) return { ok: false, error: 'Unsupported ink colour.' };
    const width = Number(raw.width);
    if (!SKETCH_WIDTHS.includes(width)) return { ok: false, error: 'Unsupported stroke width.' };
    if (raw.tool === 'pen') {
      if (!Array.isArray(raw.points) || raw.points.length === 0 || raw.points.length > SKETCH_LIMITS.maxPoints) {
        return { ok: false, error: 'Invalid freehand stroke.' };
      }
      const points = [];
      for (const pair of raw.points) {
        const pt = readPoint(pair);
        if (!pt) return { ok: false, error: 'Invalid stroke coordinate.' };
        points.push(pt);
      }
      strokes.push({ tool: 'pen', color: raw.color, width, points });
    } else {
      const from = readPoint(raw.from);
      const to = readPoint(raw.to);
      if (!from || !to) return { ok: false, error: 'Invalid shape coordinates.' };
      strokes.push({ tool: raw.tool, color: raw.color, width, from, to });
    }
  }
  return { ok: true, data: { title, author, strokes } };
}

export function strokeToSvgElement(stroke) {
  const attrs = `fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"`;
  if (stroke.tool === 'pen') {
    if (stroke.points.length === 1) {
      const [x, y] = stroke.points[0];
      return `<circle cx="${x}" cy="${y}" r="${stroke.width / 2}" fill="${stroke.color}" />`;
    }
    const d = stroke.points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
    return `<path d="${d}" ${attrs} />`;
  }
  const [x1, y1] = stroke.from;
  const [x2, y2] = stroke.to;
  if (stroke.tool === 'line') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs} />`;
  }
  if (stroke.tool === 'rect') {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs} />`;
  }
  const cx = Math.round(((x1 + x2) / 2) * 10) / 10;
  const cy = Math.round(((y1 + y2) / 2) * 10) / 10;
  const r = Math.round((Math.hypot(x2 - x1, y2 - y1) / 2) * 10) / 10;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs} />`;
}

export function renderSketchSvgString(strokes, { background = '#f4f4f4' } = {}) {
  const shapes = strokes.map(strokeToSvgElement).join('\n  ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}" width="${SKETCH_WIDTH}" height="${SKETCH_HEIGHT}">`,
    `  <rect width="${SKETCH_WIDTH}" height="${SKETCH_HEIGHT}" fill="${background}" />`,
    `  ${shapes}`,
    '</svg>',
  ].join('\n');
}
