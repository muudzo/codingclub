// Drafts stay in this browser. Passwords and session credentials are never stored here.
window.WriterDraft = (() => {
  let database, stored = new Set();
  const opened = new Promise((resolve, reject) => {
    const request = indexedDB.open('tatenda-writing', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('draft');
      request.result.createObjectStore('photos');
    };
    request.onsuccess = () => { database = request.result; resolve(); };
    request.onerror = () => reject(request.error);
  });
  async function transaction(mode, work) {
    await opened;
    return new Promise((resolve, reject) => {
      const tx = database.transaction(['draft', 'photos'], mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Draft storage failed'));
      work(tx, value => { result = value; });
    });
  }
  return {
    async load() {
      return transaction('readonly', (tx, done) => {
        const request = tx.objectStore('draft').get('current');
        request.onsuccess = () => {
          const draft = request.result;
          if (!draft) return done(null);
          const photos = draft.photos;
          let remaining = photos.length;
          stored = new Set(photos.map(photo => photo.key));
          if (!remaining) done(draft);
          photos.forEach(photo => {
            const file = tx.objectStore('photos').get(photo.key);
            file.onsuccess = () => { photo.file = file.result; if (!--remaining) done(draft); };
          });
        };
      });
    },
    async save(draft) {
      const keys = new Set(draft.photos.map(photo => photo.key));
      await transaction('readwrite', tx => {
        const photos = tx.objectStore('photos');
        for (const photo of draft.photos) if (!stored.has(photo.key)) photos.put(photo.file, photo.key);
        for (const key of stored) if (!keys.has(key)) photos.delete(key);
        tx.objectStore('draft').put({ ...draft, photos: draft.photos.map(({ key, alt }) => ({ key, alt })) }, 'current');
      });
      stored = keys;
    },
    async clear() {
      await transaction('readwrite', tx => { tx.objectStore('draft').clear(); tx.objectStore('photos').clear(); });
      stored.clear();
    },
  };
})();
