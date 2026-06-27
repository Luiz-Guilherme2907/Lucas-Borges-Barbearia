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

// ── GALERIA — CARROSSEL CENTRALIZADO ──
(function () {
  const carousel  = document.getElementById('galeria-carousel');
  if (!carousel) return;

  const slide     = document.getElementById('gal-slide');
  const label     = document.getElementById('gal-label');
  const dotsWrap  = document.getElementById('gal-dots');
  const btnPrev   = carousel.querySelector('.gal-prev');
  const btnNext   = carousel.querySelector('.gal-next');

  let todasFotos  = [];
  let filtradas   = [];
  let catAtiva    = 'todas';
  let indiceAtual = 0;

  async function carregarGaleria() {
    try {
      const r = await fetch('/api/fotos', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      todasFotos = await r.json();
    } catch {
      todasFotos = [];
    }
    renderCarrossel();
  }

  function renderCarrossel() {
    filtradas = catAtiva === 'todas' ? todasFotos : todasFotos.filter(f => f.categoria === catAtiva);
    indiceAtual = 0;

    dotsWrap.innerHTML = '';

    if (!filtradas.length) {
      slide.innerHTML = '<div class="galeria-placeholder"><span>📷</span><p>Em breve</p></div>';
      label.textContent = '';
      btnPrev.hidden = true;
      btnNext.hidden = true;
      return;
    }

    btnPrev.hidden = false;
    btnNext.hidden = false;

    filtradas.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'gal-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Foto ${i + 1}`);
      dot.addEventListener('click', () => mostrarSlide(i));
      dotsWrap.appendChild(dot);
    });

    mostrarSlide(0);
  }

  function mostrarSlide(i) {
    indiceAtual = (i + filtradas.length) % filtradas.length;
    const foto = filtradas[indiceAtual];

    const img = document.createElement('img');
    img.src = foto.url;
    img.alt = foto.titulo || '';
    img.loading = 'lazy';
    img.style.opacity = '0';
    img.onload = () => { img.style.opacity = '1'; };
    img.onerror = () => {
      filtradas.splice(indiceAtual, 1);
      renderCarrossel();
    };

    slide.innerHTML = '';
    slide.appendChild(img);
    label.textContent = foto.titulo || '';

    dotsWrap.querySelectorAll('.gal-dot').forEach((d, idx) => {
      d.classList.toggle('active', idx === indiceAtual);
    });
  }

  btnPrev.addEventListener('click', () => mostrarSlide(indiceAtual - 1));
  btnNext.addEventListener('click', () => mostrarSlide(indiceAtual + 1));

  // teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  mostrarSlide(indiceAtual - 1);
    if (e.key === 'ArrowRight') mostrarSlide(indiceAtual + 1);
  });

  // swipe touch
  let touchX = null;
  carousel.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', e => {
    if (touchX === null) return;
    const delta = touchX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) mostrarSlide(indiceAtual + (delta > 0 ? 1 : -1));
    touchX = null;
  }, { passive: true });

  // filtros
  document.querySelectorAll('.gal-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gal-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      catAtiva = btn.dataset.cat;
      renderCarrossel();
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

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CUPOM PRESENTE — TEMPORARIAMENTE DESATIVADO                               ║
// ║                                                                            ║
// ║  O que faz:                                                                ║
// ║    Após 2.5s do carregamento da página, verifica via API se o usuário      ║
// ║    (identificado pelo IP) já resgatou o cupom de desconto. Se não tiver,   ║
// ║    exibe um overlay com um ícone de presente animado. Ao clicar no         ║
// ║    presente, abre um card com formulário (nome + telefone). Ao enviar,     ║
// ║    registra o resgate no banco e exibe a tela de sucesso com o cupom.      ║
// ║    O estado é salvo no localStorage (chave 'borges_cupom_v1') para não     ║
// ║    exibir novamente no mesmo navegador.                                    ║
// ║                                                                            ║
// ║  Para reativar: remova o bloco de comentário /* ... */ abaixo.             ║
// ║  O HTML correspondente está em index.html (procure por #cupom-overlay).   ║
// ║  As rotas de API estão em server.js (/api/cupom/elegivel e /resgatar).     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/*
// ── CUPOM PRESENTE ──
(function () {
  const LS_KEY = 'borges_cupom_v1';
  if (localStorage.getItem(LS_KEY)) return;

  const overlay  = document.getElementById('cupom-overlay');
  const gift     = document.getElementById('cupom-gift');
  const card     = document.getElementById('cupom-card');
  const sucesso  = document.getElementById('cupom-sucesso');
  const form     = document.getElementById('cupom-form');
  const erroEl   = document.getElementById('cupom-erro');
  const fecharEl = document.getElementById('cupom-fechar');
  if (!overlay) return;

  function mostrar(el) { el.classList.add('visivel'); }
  function ocultar(el) { el.classList.remove('visivel'); }

  function fechar() {
    ocultar(overlay);
    setTimeout(() => {
      ocultar(gift); ocultar(card); ocultar(sucesso);
      gift.classList.remove('abrindo');
    }, 400);
  }

  function abrirPresente() {
    gift.classList.add('abrindo');
    setTimeout(() => {
      ocultar(gift);
      mostrar(card);
    }, 580);
  }

  async function init() {
    try {
      const r = await fetch('/api/cupom/elegivel');
      if (!r.ok) return;
      const { elegivel } = await r.json();
      if (!elegivel) { localStorage.setItem(LS_KEY, '1'); return; }
    } catch { return; }

    mostrar(overlay);
    mostrar(gift);
  }

  // dispara após 2.5s
  setTimeout(init, 2500);

  // abrir ao clicar no presente
  gift.addEventListener('click', abrirPresente);
  gift.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') abrirPresente(); });

  // fechar ao clicar no X ou no backdrop
  fecharEl.addEventListener('click', fechar);
  overlay.querySelector('.cupom-backdrop').addEventListener('click', fechar);

  // submit do form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erroEl.textContent = '';
    const btn = form.querySelector('.cupom-btn');
    const nome     = form.nome.value.trim();
    const telefone = form.telefone.value.trim();

    if (nome.length < 3)     { erroEl.textContent = 'Informe seu nome completo.'; return; }
    if (telefone.length < 8) { erroEl.textContent = 'Informe um telefone válido.'; return; }

    btn.disabled = true;
    btn.textContent = 'Enviando…';

    try {
      const r = await fetch('/api/cupom/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone })
      });
      const data = await r.json();

      if (r.ok) {
        localStorage.setItem(LS_KEY, '1');
        ocultar(card);
        mostrar(sucesso);
      } else if (r.status === 409) {
        localStorage.setItem(LS_KEY, '1');
        fechar();
      } else {
        erroEl.textContent = data.error || 'Erro ao resgatar. Tente novamente.';
        btn.disabled = false;
        btn.textContent = 'Resgatar meu cupom';
      }
    } catch {
      erroEl.textContent = 'Sem conexão. Tente novamente.';
      btn.disabled = false;
      btn.textContent = 'Resgatar meu cupom';
    }
  });
})();
*/

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

// ── MODAL DE ESPECIALIDADES ──
(function () {
  const overlay  = document.getElementById('esp-modal-overlay');
  if (!overlay) return;

  const backdrop = overlay.querySelector('.esp-modal-backdrop');
  const titulo   = document.getElementById('esp-modal-titulo');
  const fecharBtn= document.getElementById('esp-modal-fechar');
  const loading  = document.getElementById('esp-modal-loading');
  const vazio    = document.getElementById('esp-modal-vazio');
  const carousel = document.getElementById('esp-carousel');
  const img      = document.getElementById('esp-carousel-img');
  const legenda  = document.getElementById('esp-carousel-legenda');
  const dotsEl   = document.getElementById('esp-carousel-dots');
  const prevBtn  = carousel.querySelector('.esp-prev');
  const nextBtn  = carousel.querySelector('.esp-next');

  let fotos = [];
  let idx   = 0;

  function renderDots() {
    dotsEl.innerHTML = '';
    fotos.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'esp-dot' + (i === idx ? ' ativo' : '');
      d.setAttribute('aria-label', `Foto ${i + 1}`);
      d.addEventListener('click', () => goTo(i));
      dotsEl.appendChild(d);
    });
  }

  function goTo(n) {
    idx = (n + fotos.length) % fotos.length;
    img.src = fotos[idx].url;
    img.alt = fotos[idx].titulo || '';
    legenda.textContent = fotos[idx].titulo || '';
    legenda.hidden = !fotos[idx].titulo;
    renderDots();
    const multi = fotos.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
    dotsEl.style.display  = multi ? '' : 'none';
  }

  async function abrirModal(especialidade, nome) {
    titulo.textContent = nome;
    vazio.hidden    = true;
    carousel.hidden = true;
    loading.hidden  = false;
    overlay.hidden  = false;
    document.body.classList.add('modal-aberto');

    try {
      const r = await fetch(`/api/fotos?categoria=${especialidade}`);
      fotos = await r.json();
    } catch { fotos = []; }

    loading.hidden = true;
    if (!fotos.length) { vazio.hidden = false; return; }
    carousel.hidden = false;
    goTo(0);
  }

  function fecharModal() {
    overlay.hidden = true;
    document.body.classList.remove('modal-aberto');
    img.src = '';
    fotos = [];
  }

  document.querySelectorAll('.servico-row[data-especialidade]').forEach(row => {
    row.addEventListener('click', () => abrirModal(row.dataset.especialidade, row.dataset.nome));
  });

  fecharBtn.addEventListener('click', fecharModal);
  backdrop.addEventListener('click', fecharModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) fecharModal(); });
  prevBtn.addEventListener('click', () => goTo(idx - 1));
  nextBtn.addEventListener('click', () => goTo(idx + 1));
})();
