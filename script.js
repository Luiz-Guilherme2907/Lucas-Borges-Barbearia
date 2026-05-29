// ── INTRO SCISSORS ──
(function () {
  const intro = document.getElementById('intro');
  const wrap  = document.querySelector('.scissors-wrap');
  if (!intro || !wrap) return;

  document.body.classList.add('intro-active');

  wrap.addEventListener('animationend', () => {
    intro.classList.add('splitting');

    const onEnd = (e) => {
      if (!e.target.classList.contains('intro-half')) return;
      intro.removeEventListener('transitionend', onEnd);
      intro.remove();
      document.body.classList.remove('intro-active');
      initScrollCuts(); // só inicia após intro completo
    };
    intro.addEventListener('transitionend', onEnd);
  }, { once: true });
})();

// ── NAV SCROLL EFFECT ──
const nav = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// ── SCROLL REVEAL (fade genérico) ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 80);
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── SMOOTH ANCHOR SCROLL ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── SCROLL CUT (tesoura por seção) ──
function initScrollCuts() {
  const sections = document.querySelectorAll('[data-cut]');
  if (!sections.length) return;

  const svgHTML = `<svg class="scissors-svg" viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g class="sc-blade-top">
      <path d="M70,40 L188,11 L192,17 L74,41 Z"/>
      <circle cx="38" cy="27" r="17" fill="none" stroke-width="4.5"/>
      <circle cx="38" cy="27" r="9" fill="none" stroke-width="2" opacity=".35"/>
    </g>
    <g class="sc-blade-bot">
      <path d="M70,40 L188,69 L192,63 L74,39 Z"/>
      <circle cx="38" cy="53" r="17" fill="none" stroke-width="4.5"/>
      <circle cx="38" cy="53" r="9" fill="none" stroke-width="2" opacity=".35"/>
    </g>
    <circle cx="70" cy="40" r="4" class="sc-pivot"/>
    <line x1="67.5" y1="37.5" x2="72.5" y2="42.5" stroke-width="1.5" stroke-linecap="round" class="sc-screw"/>
    <line x1="72.5" y1="37.5" x2="67.5" y2="42.5" stroke-width="1.5" stroke-linecap="round" class="sc-screw"/>
  </svg>`;

  // injeta véu em cada seção
  sections.forEach(section => {
    const veil = document.createElement('div');
    veil.className = 'sc-veil';
    veil.setAttribute('aria-hidden', 'true');
    veil.innerHTML = `<div class="sc-veil-scissors">${svgHTML}</div>`;
    section.prepend(veil);
  });

  const cutObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      // só dispara se a seção está vindo de baixo (top > 100px do viewport)
      // evita disparo imediato em seções já parcialmente visíveis ao iniciar
      if (entry.boundingClientRect.top < 100) {
        cutObs.unobserve(entry.target);
        const veil = entry.target.querySelector('.sc-veil');
        if (veil) veil.remove();
        return;
      }

      const section = entry.target;
      const veil = section.querySelector('.sc-veil');
      if (!veil) return;

      // tesoura corta
      section.classList.add('sc-cutting');

      // após tesoura cruzar (~0.85s), véu cai
      setTimeout(() => {
        section.classList.add('sc-cut');
        setTimeout(() => {
          veil.remove();
          section.classList.remove('sc-cutting', 'sc-cut');
        }, 520);
      }, 720);

      cutObs.unobserve(section);
    });
  }, { threshold: 0.15 });

  sections.forEach(s => cutObs.observe(s));
}

// ── GALERIA DINÂMICA ──
(function () {
  const grid = document.getElementById('galeria-grid');
  if (!grid) return;

  let todasFotos = [];
  let catAtiva = 'todas';

  async function carregarGaleria() {
    try {
      const r = await fetch('/api/fotos', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      todasFotos = await r.json();
    } catch {
      todasFotos = [];
    }
    renderGaleria();
  }

  function renderGaleria() {
    const filtered = catAtiva === 'todas' ? todasFotos : todasFotos.filter(f => f.categoria === catAtiva);
    grid.innerHTML = '';

    if (!filtered.length) {
      grid.innerHTML = '<div class="galeria-item galeria-placeholder-item"><div class="galeria-placeholder"><span>📷</span><p>Em breve</p></div></div>';
      return;
    }

    filtered.forEach(foto => {
      const item = document.createElement('div');
      item.className = 'galeria-item';
      item.innerHTML = `
        <img src="${foto.url}" alt="${foto.titulo || ''}" loading="lazy" />
        <div class="galeria-label-overlay">${foto.titulo || ''}</div>
      `;
      grid.appendChild(item);
    });

    // re-observar reveal
    grid.querySelectorAll('.galeria-item img').forEach(img => {
      img.onerror = function () { this.closest('.galeria-item').remove(); };
    });
  }

  // filtros
  document.querySelectorAll('.gal-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gal-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      catAtiva = btn.dataset.cat;
      renderGaleria();
    });
  });

  carregarGaleria();
})();

// ── HERO BUBBLES — click para destaque permanente (toggle independente por bolha) ──
(function () {
  const bubbles = document.querySelectorAll('.hero-bubble');
  if (!bubbles.length) return;

  bubbles.forEach(bubble => {
    bubble.addEventListener('click', e => {
      bubble.classList.toggle('bubble-active');
      e.stopPropagation();
    });
  });

  document.addEventListener('click', () => {
    bubbles.forEach(b => b.classList.remove('bubble-active'));
  });
})();

// ── MOBILE NAV TOGGLE ──
const hamburger = document.querySelector('.nav-hamburger');
const navMenu = document.getElementById('nav-menu');
if (hamburger && navMenu) {
  hamburger.addEventListener('click', () => {
    const open = navMenu.classList.toggle('open');
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', open);
  });
  navMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navMenu.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', false);
    });
  });
}
