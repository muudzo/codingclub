// Keep these names scoped to this script rather than the browser's legacy globals.
(async () => {
const form = document.querySelector('#post-form');
const fields = document.querySelector('#fields');
const title = document.querySelector('#title');
const text = document.querySelector('#text');
const input = document.querySelector('#photos');
const attach = document.querySelector('#attach');
const list = document.querySelector('#photo-list');
const statusElement = document.querySelector('#status');
const publish = document.querySelector('#publish');
const remote = document.body.dataset.mode === 'remote';
const token = remote ? undefined : location.hash.slice(1) || sessionStorage.getItem('composer-token');
if (token) sessionStorage.setItem('composer-token', token);
history.replaceState(null, '', location.pathname);
let id = crypto.randomUUID(), csrf, attempted = false;
let photos = [], busy = false, dirty = false;
let draftQueue = Promise.resolve(true), draftTimer, draftReady = false, completed = false;
const draftStatus = document.querySelector('#draft-status');
const signInAgain = document.querySelector('#sign-in-again');
const publishLabel = remote ? 'Publish' : 'Publish post';
function requireSignIn() {
  csrf = undefined;
  publish.disabled = true;
  if (signInAgain) signInAgain.hidden = false;
}
function saveDraft() {
  if (!remote || !draftReady || completed) return draftQueue;
  clearTimeout(draftTimer);
  const snapshot = { id, attempted, title: title.value, text: text.value, photos: photos.map(photo => ({ key: photo.key, alt: photo.alt, file: photo.file })) };
  draftQueue = draftQueue.then(() => window.WriterDraft.save(snapshot)).then(() => {
    draftStatus.textContent = 'Draft saved on this device.';
    return true;
  }).catch(() => { draftStatus.textContent = 'Draft could not be saved on this device. Keep this page open.'; return false; });
  return draftQueue;
}
const imageBytes = (remote ? 10 : 15) * 1024 * 1024;
document.querySelector('#today').textContent = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

function message(value, error = false) {
  statusElement.textContent = value;
  statusElement.classList.toggle('error', error);
  statusElement.setAttribute('role', error ? 'alert' : 'status');
  if (error) statusElement.scrollIntoView({ block: 'nearest' });
}
function markDirty() {
  dirty = true;
  if (attempted) { id = crypto.randomUUID(); attempted = false; }
  if (remote && draftReady) { draftStatus.textContent = 'Saving draft…'; clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 200); }
}
function countWords() {
  const count = text.value.trim().split(/\s+/).filter(Boolean).length;
  document.querySelector('#words').textContent = `${count} ${count === 1 ? 'word' : 'words'}`;
}
function renderPhotos() {
  list.replaceChildren();
  document.querySelector('#empty-photos').hidden = photos.length > 0;
  document.querySelector('#photo-count').textContent = `${photos.length} of 8`;
  attach.disabled = photos.length >= 8;
  for (const [index, photo] of photos.entries()) {
    const item = document.createElement('li'); item.className = 'photo-item';
    const img = document.createElement('img'); img.src = photo.url; img.alt = photo.alt || `Selected photograph ${index + 1}`;
    const label = document.createElement('label'); label.htmlFor = `photo-${photo.key}`; label.textContent = `Describe photo ${index + 1}`;
    const description = document.createElement('textarea'); description.id = label.htmlFor; description.required = true; description.maxLength = 400; description.value = photo.alt;
    description.addEventListener('input', () => { photo.alt = description.value; img.alt = photo.alt; markDirty(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove'; remove.textContent = 'Remove photo'; remove.setAttribute('aria-label', `Remove photo ${index + 1}`);
    remove.addEventListener('click', () => { URL.revokeObjectURL(photo.url); photos = photos.filter(p => p !== photo); markDirty(); renderPhotos(); attach.focus(); });
    item.append(img, label, description, remove); list.append(item);
  }
}
attach.addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  const selected = [...input.files]; input.value = '';
  if (photos.length + selected.length > 8) return message('Choose up to 8 photos in total.', true);
  if (selected.some(file => file.size > imageBytes)) return message(`Each photo must be smaller than ${remote ? 10 : 15} MB.`, true);
  if (selected.some(file => !/\.(jpe?g|png|webp|avif)$/i.test(file.name))) return message('Choose JPG, PNG, WebP or AVIF photographs.', true);
  for (const file of selected) photos.push({ file, key: crypto.randomUUID(), alt: '', url: URL.createObjectURL(file) });
  markDirty(); renderPhotos(); message('Add a short description for each photo.');
});
form.addEventListener('input', () => {
  markDirty();
  countWords();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  if (remote ? !csrf : !token) {
    if (remote) requireSignIn();
    return message(remote ? 'Sign in again to resume this draft.' : 'Open this composer using your laptop shortcut, then try again.', true);
  }
  if (!title.value.trim() || !text.value.trim()) return message('Add a title and write your post.', true);
  const data = new FormData();
  data.set('id', id); data.set('title', title.value); data.set('text', text.value);
  for (const photo of photos) { data.append('photos', photo.file); data.append('alt', photo.alt); }
  attempted = true;
  busy = true; fields.disabled = true; publish.disabled = true; publish.textContent = 'Publishing…';
  await saveDraft();
  message('Preparing your post and photographs. This can take a moment.');
  try {
    const response = await fetch(remote ? '/write/api/publish' : '/api/publish', { method: 'POST', headers: remote ? { 'X-Writer-CSRF': csrf } : { 'X-Composer-Token': token }, body: data });
    const result = await response.json().catch(() => ({ error: 'The connection was interrupted. Retry this draft to check whether it published.' }));
    if (remote && [401, 403].includes(response.status)) requireSignIn();
    if (!response.ok || typeof result.url !== 'string') throw new Error(result.error || 'Your post could not be published. Try again.');
    completed = true; clearTimeout(draftTimer);
    if (remote) { await draftQueue; await window.WriterDraft.clear().catch(() => {}); }
    dirty = false; busy = false; message('Published. Opening your post…');
    location.assign(result.url);
  } catch (error) {
    message(error.message === 'Failed to fetch' ? 'The connection was interrupted. Your writing and photos are still here. Retry the same draft to check whether it published.' : error.message, true);
  } finally {
    busy = false; fields.disabled = false; publish.disabled = remote && !csrf; publish.textContent = publishLabel;
  }
});
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (!busy) form.requestSubmit(); }
});
window.addEventListener('beforeunload', event => { if (dirty || busy) event.preventDefault(); });
if (remote) {
  fields.disabled = true;
  publish.disabled = true;
  try {
    const draft = await window.WriterDraft.load();
    if (draft) {
      id = draft.id; attempted = draft.attempted; title.value = draft.title; text.value = draft.text;
      photos = draft.photos.filter(photo => photo.file).map(photo => ({ ...photo, url: URL.createObjectURL(photo.file) }));
      dirty = true; renderPhotos(); countWords(); draftStatus.textContent = 'Draft restored from this device.';
    }
  } catch { draftStatus.textContent = 'Draft storage is unavailable. Keep this page open while writing.'; }
  draftReady = true; fields.disabled = false;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); });
  for (const link of [document.querySelector('#back-to-site'), signInAgain].filter(Boolean)) {
    link.addEventListener('click', async event => {
      event.preventDefault();
      if (busy) return message('Please wait for publishing to finish before leaving.', true);
      if (!await saveDraft()) return message('This draft could not be saved. Keep this page open and try again.', true);
      dirty = false;
      location.assign(link.href);
    });
  }
  document.querySelector('#discard-draft').addEventListener('click', async () => {
    if (busy || !confirm('Discard this draft and its attached photos from this device?')) return;
    clearTimeout(draftTimer); await draftQueue;
    try { await window.WriterDraft.clear(); }
    catch { return message('The saved draft could not be removed. Please try again.', true); }
    photos.forEach(photo => URL.revokeObjectURL(photo.url)); photos = []; title.value = ''; text.value = '';
    id = crypto.randomUUID(); attempted = false; dirty = false; renderPhotos(); countWords(); draftStatus.textContent = 'Draft discarded.';
  });
  fetch('/write/api/session').then(async response => {
    if (!response.ok) { requireSignIn(); throw new Error('Sign in again to resume this draft.'); }
    csrf = (await response.json()).csrf;
    publish.disabled = false;
  }).catch(error => message(error.message, true));
  document.querySelector('#sign-out').addEventListener('click', async () => {
    if (!csrf || busy) return;
    try {
      if (!await saveDraft()) throw new Error('This draft could not be saved. Keep this page open and try again.');
      const response = await fetch('/write/api/logout', { method: 'POST', headers: { 'X-Writer-CSRF': csrf } });
      if (!response.ok) throw new Error('Sign-out did not finish. Please try again.');
      dirty = false; location.assign('/write/login');
    } catch (error) { message(error.message, true); }
  });
} else if (!token) message('Open this composer using your laptop shortcut to publish a post.', true);
})();
