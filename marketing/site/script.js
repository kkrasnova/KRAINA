(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'kraina-theme';

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else {
    root.setAttribute('data-theme', 'dark');
  }

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#000000' : '#F2F2EA');
    });
  }

  const animateCounter = (el) => {
    const target = parseFloat(el.dataset.counter);
    if (Number.isNaN(target)) return;
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1200;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = (target * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals) + suffix;
    };
    requestAnimationFrame(tick);
  };

  document.querySelectorAll('[data-counter]').forEach(animateCounter);

  document.querySelectorAll('.loc-filmstrip').forEach((strip) => {
    strip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      strip.scrollBy({ left: dir * Math.max(220, strip.clientWidth * 0.75), behavior: 'smooth' });
    });
  });

  const playStore = root.getAttribute('data-play-store') || '';
  const appStore = root.getAttribute('data-app-store') || '';
  document.querySelectorAll('[data-store-link="google"]').forEach((a) => {
    if (!playStore) return;
    a.href = playStore;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  document.querySelectorAll('[data-store-link="apple"]').forEach((a) => {
    if (!appStore) return;
    a.href = appStore;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });

  document.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => img.classList.add('img--missing'), { once: true });
  });
})();
