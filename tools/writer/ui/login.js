(() => {
  const form = document.querySelector('#login-form');
  const password = document.querySelector('#password');
  const button = document.querySelector('#sign-in');
  const status = document.querySelector('#status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Signing in…';
    status.classList.remove('error');
    try {
      const response = await fetch('/write/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password.value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in did not finish. Please try again.');
      password.value = '';
      location.assign('/write/');
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? 'The connection was interrupted. Please try again.' : error.message;
      status.classList.add('error');
      status.setAttribute('role', 'alert');
      password.focus();
    } finally { button.disabled = false; }
  });
})();
