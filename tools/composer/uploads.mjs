import { PublishError, limits } from './publish.mjs';

export function readBody(req, maximum) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > maximum) { req.resume(); reject(new PublishError('This upload is too large.', 413)); return; }
    let bytes = 0, failed = false;
    const chunks = [];
    req.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > maximum) { failed = true; chunks.length = 0; reject(new PublishError('This upload is too large.', 413)); }
      else chunks.push(chunk);
    });
    req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.once('error', () => reject(new PublishError('The upload was interrupted. Please retry your draft.', 400)));
  });
}

export async function readPostForm(req, origin, { bodyBytes = limits.bodyBytes, imageBytes = limits.imageBytes } = {}) {
  if (!req.headers['content-type']?.startsWith('multipart/form-data;')) throw new PublishError('Choose the post and photos in the composer.');
  const bytes = await readBody(req, bodyBytes);
  let form;
  try { form = await new Request(origin, { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] }, body: bytes }).formData(); }
  catch { throw new PublishError('The upload could not be read. Please try again.'); }
  const uploads = form.getAll('photos');
  if (uploads.length > limits.photos) throw new PublishError('Attach no more than 8 photos.');
  const alts = form.getAll('alt');
  const photos = await Promise.all(uploads.map(async (file, index) => {
    if (typeof file === 'string' || file.size > imageBytes) throw new PublishError(`Each photo must be smaller than ${imageBytes / 1024 / 1024} MB.`);
    return { bytes: Buffer.from(await file.arrayBuffer()), alt: alts[index] };
  }));
  return { id: form.get('id'), title: form.get('title'), text: form.get('text'), photos };
}
