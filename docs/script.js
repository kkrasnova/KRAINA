(() => {
  'use strict';

  const root = document.documentElement;
  const STORAGE_KEY = 'kraina-theme';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isDesktop = window.matchMedia('(min-width: 920px)').matches;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    root.setAttribute('data-theme', prefersLight ? 'light' : 'dark');
  }

  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);

      toggle.classList.remove('ripple');
      void toggle.offsetWidth;
      toggle.classList.add('ripple');
      setTimeout(() => toggle.classList.remove('ripple'), 700);

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'dark' ? '#0A0A0F' : '#FAFAF7');
    });
  }

  const progress = document.getElementById('scrollProgress');
  const updateProgress = () => {
    const h = document.documentElement;
    const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
    if (progress) progress.style.width = `${Math.min(scrolled * 100, 100)}%`;
  };

  const cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && isDesktop && !reduced) {
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let tx = cx;
    let ty = cy;
    document.addEventListener('mousemove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
    });
    const animateGlow = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      cursorGlow.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateGlow);
    };
    animateGlow();
    document.addEventListener('mouseenter', () => {
      cursorGlow.style.opacity = '';
    });
    document.addEventListener('mouseleave', () => {
      cursorGlow.style.opacity = '0';
    });
  }

  const particlesContainer = document.getElementById('particles');
  if (particlesContainer && !reduced) {
    const count = window.innerWidth < 600 ? 12 : 24;
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.setProperty('--dur', `${8 + Math.random() * 10}s`);
      p.style.setProperty('--delay', `${Math.random() * 8}s`);
      p.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      const size = 2 + Math.random() * 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      particlesContainer.appendChild(p);
    }
  }

  if (!reduced && isDesktop) {
    document.querySelectorAll('.tilt').forEach((el) => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const ry = (px - 0.5) * 8;
        const rx = (0.5 - py) * 8;
        el.style.setProperty('--rx', `${rx}deg`);
        el.style.setProperty('--ry', `${ry}deg`);
        el.style.setProperty('--ty', '-4px');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--ty', '0');
      });
    });
  }

  document.querySelectorAll('.spotlight').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });

  if (!reduced && isDesktop) {
    document.querySelectorAll('.magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.2}px, ${y * 0.25}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  const animateCounter = (el) => {
    const target = parseFloat(el.dataset.counter);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();

    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const value = target * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target.toFixed(decimals) + suffix;
    };
    requestAnimationFrame(tick);
  };

  const revealEls = document.querySelectorAll('.reveal');
  const counters = document.querySelectorAll('[data-counter]');

  const showReveal = (el) => {
    el.classList.add('in-view');
  };

  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach(showReveal);
    counters.forEach(animateCounter);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            showReveal(entry.target);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    revealEls.forEach((el) => io.observe(el));

    const counterIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    counters.forEach((c) => counterIo.observe(c));
  }

  const navLinks = document.querySelectorAll('.nav__links a');
  const sections = Array.from(document.querySelectorAll('section[id]'));

  const setActive = () => {
    const y = window.scrollY + 120;
    let current = sections[0]?.id;
    for (const s of sections) {
      if (s.offsetTop <= y) current = s.id;
    }
    navLinks.forEach((l) => {
      const href = l.getAttribute('href') || '';
      l.style.color = href === `#${current}` ? 'var(--accent)' : '';
    });
  };

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateProgress();
          setActive();
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );
  updateProgress();
  setActive();

  const phoneStack = document.querySelector('.phone-stack');
  if (phoneStack && isDesktop && !reduced) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 14;
      const y = (e.clientY / window.innerHeight - 0.5) * 14;
      phoneStack.style.transform = `translate(${x}px, ${y}px)`;
    });
  }

  const vtPlay = document.querySelector('.vt-play');
  if (vtPlay) {
    vtPlay.addEventListener('click', () => {
      vtPlay.animate(
        [
          { transform: 'translate(-50%,-50%) scale(1)' },
          { transform: 'translate(-50%,-50%) scale(1.2)' },
          { transform: 'translate(-50%,-50%) scale(1)' },
        ],
        { duration: 400, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });
  }

  document.querySelectorAll('.loc-filmstrip').forEach((strip) => {
    strip.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const delta = Math.max(220, strip.clientWidth * 0.72);
      strip.scrollBy({ left: dir * delta, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey && document.activeElement === document.body) {
      toggle?.click();
    }
  });

  const playStore = document.documentElement.getAttribute('data-play-store') || '';
  const appStore = document.documentElement.getAttribute('data-app-store') || '';
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

  revealEls.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) showReveal(el);
  });
})();
