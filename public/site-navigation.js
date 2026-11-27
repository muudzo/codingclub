(() => {
  const menu = document.querySelector('.site-menu');
  const summary = menu.querySelector('summary');
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); }
  });
  document.addEventListener('click', event => {
    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('focusout', () => {
    setTimeout(() => { if (!menu.contains(document.activeElement)) menu.open = false; }, 0);
  });
  const ownerTools = document.querySelector('.owner-tools');
  let checking = false;
  async function checkOwner() {
    if (checking) return;
    checking = true;
    ownerTools.hidden = true;
    document.body.classList.remove('has-owner-tools');
    try {
      const response = await fetch('/write/api/session', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (response.ok && typeof (await response.json()).csrf === 'string') {
        ownerTools.hidden = false;
        document.body.classList.add('has-owner-tools');
      }
    } catch { /* Public browsing remains available when the writer is offline. */ }
    finally { checking = false; }
  }
  window.addEventListener('pageshow', checkOwner);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkOwner(); });
  checkOwner();

  const photoList = document.querySelector('.photo-list');
  if (photoList) {
    const overlay = document.querySelector('.darkroom-overlay');
    const openBtn = document.querySelector('.darkroom-open');
    const closeBtn = overlay?.querySelector('.darkroom-close');
    const prevBtn = overlay?.querySelector('.darkroom-prev');
    const nextBtn = overlay?.querySelector('.darkroom-next');
    const stageImg = overlay?.querySelector('.darkroom-image');
    const stageTitle = overlay?.querySelector('.darkroom-title');
    const counter = overlay?.querySelector('.darkroom-counter');
    const cards = [...photoList.querySelectorAll('.entry-link')];
    const photos = cards
      .map(card => {
        const img = card.querySelector('img');
        const heading = card.querySelector('h2');
        if (!img) return null;
        const slug = (card.getAttribute('href') || '').split('/').filter(Boolean).pop() || '';
        return {
          src: img.currentSrc || img.getAttribute('src') || '',
          srcset: img.getAttribute('srcset') || '',
          alt: img.getAttribute('alt') || '',
          title: heading ? heading.textContent.trim() : '',
          slug,
        };
      })
      .filter(Boolean);

    if (overlay && openBtn && closeBtn && prevBtn && nextBtn && stageImg && stageTitle && counter && photos.length > 0) {
      let currentIndex = 0;
      let lastFocused = null;

      function renderPhoto(index) {
        currentIndex = (index + photos.length) % photos.length;
        const item = photos[currentIndex];
        stageImg.setAttribute('src', item.src);
        if (item.srcset) stageImg.setAttribute('srcset', item.srcset);
        else stageImg.removeAttribute('srcset');
        stageImg.setAttribute('sizes', '92vw');
        stageImg.setAttribute('alt', item.alt);
        stageTitle.textContent = item.title;
        counter.textContent = `${currentIndex + 1} / ${photos.length}`;
        const single = photos.length <= 1;
        prevBtn.disabled = single;
        nextBtn.disabled = single;
        if (item.slug) history.replaceState(null, '', `#darkroom-${encodeURIComponent(item.slug)}`);
      }

      function openDarkroom(index = 0) {
        lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : openBtn;
        renderPhoto(index);
        overlay.hidden = false;
        document.body.classList.add('has-darkroom-open');
        closeBtn.focus();
      }

      function closeDarkroom() {
        if (overlay.hidden) return;
        overlay.hidden = true;
        document.body.classList.remove('has-darkroom-open');
        if (window.location.hash.startsWith('#darkroom-')) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      }

      if (window.location.hash.startsWith('#darkroom-')) {
        const targetSlug = decodeURIComponent(window.location.hash.slice('#darkroom-'.length));
        const idx = photos.findIndex(item => item.slug === targetSlug);
        if (idx !== -1) openDarkroom(idx);
      }

      openBtn.addEventListener('click', () => openDarkroom(0));
      closeBtn.addEventListener('click', closeDarkroom);
      prevBtn.addEventListener('click', () => renderPhoto(currentIndex - 1));
      nextBtn.addEventListener('click', () => renderPhoto(currentIndex + 1));
      overlay.addEventListener('click', event => {
        if (event.target === overlay) closeDarkroom();
      });

      cards.forEach((card, index) => {
        card.addEventListener('click', event => {
          if (document.body.classList.contains('has-darkroom-open') || photoList.dataset.darkroom === 'true') {
            event.preventDefault();
            openDarkroom(index);
          }
        });
      });

      document.addEventListener('keydown', event => {
        if (overlay.hidden) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          closeDarkroom();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          renderPhoto(currentIndex - 1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          renderPhoto(currentIndex + 1);
        }
      });
    }
  }
})();
