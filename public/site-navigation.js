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
})();
