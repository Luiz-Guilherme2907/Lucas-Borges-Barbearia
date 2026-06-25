const API = '/api';
let token = '';
let filtroAtivo = 'todas';

// ── LOGIN ──
const loginScreen = document.getElementById('login-screen');
const painel      = document.getElementById('painel');
const loginForm   = document.getElementById('login-form');
const loginErr    = document.getElementById('login-err');

function showErr(el, msg) {
  el.textContent = msg;
  el.hidden = false;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function addEyeToggle(btnId, inputId) {
  document.getElementById(btnId).addEventListener('click', () => {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}
addEyeToggle('btn-eye', 'login-pwd');

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    return r;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Servidor não respondeu. Verifique se ele está rodando.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function setBtnEntrar(loading) {
  const btn     = document.getElementById('btn-entrar');
  const btnText = document.getElementById('btn-entrar-text');
  const btnSpin = document.getElementById('btn-entrar-spin');
  btn.disabled    = loading;
  btnText.hidden  = loading;
  btnSpin.hidden  = !loading;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErr.hidden = true;
  setBtnEntrar(true);

  try {
    const r = await apiFetch(`${API}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('login-pwd').value }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Senha incorreta');
    token = data.token;
    setBtnEntrar(false);
    showPainel();
  } catch (err) {
    setBtnEntrar(false);
    showErr(loginErr, err.message);
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch(`${API}/admin/logout`, { method: 'POST', headers: { 'x-admin-token': token } }).catch(() => {});
  token = '';
  painel.hidden = true;
  loginScreen.hidden = false;
  loginErr.hidden = true;
  document.getElementById('login-pwd').value = '';
});

function showPainel() {
  loginScreen.hidden = true;
  painel.hidden = false;
  carregarFotos();
}

// ── UPLOAD ──
const uploadArea    = document.getElementById('upload-area');
const uploadTrigger = document.getElementById('upload-trigger');
const uploadPreview = document.getElementById('upload-preview');
const previewImg    = document.getElementById('preview-img');
const fileInput     = document.getElementById('f-file');
const clearBtn      = document.getElementById('clear-upload');
let uploadedBase64  = '';

uploadTrigger.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--gold)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedBase64 = e.target.result;
    previewImg.src = uploadedBase64;
    uploadTrigger.hidden = true;
    uploadPreview.hidden = false;
    document.getElementById('f-url').value = '';
  };
  reader.readAsDataURL(file);
}

clearBtn.addEventListener('click', () => {
  uploadedBase64 = '';
  previewImg.src = '';
  fileInput.value = '';
  uploadTrigger.hidden = false;
  uploadPreview.hidden = true;
});

// ── ADICIONAR FOTO ──
document.getElementById('btn-add').addEventListener('click', async () => {
  const url      = uploadedBase64 || document.getElementById('f-url').value.trim();
  const categoria = document.getElementById('f-cat').value;
  const titulo   = document.getElementById('f-titulo').value.trim();

  if (!url) { mostrarStatus('Adicione uma URL ou faça upload de uma imagem.', 'error'); return; }

  const btn = document.getElementById('btn-add');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  try {
    const r = await fetch(`${API}/admin/fotos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ url, titulo, categoria, ordem: 0 }),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    mostrarStatus('Foto adicionada com sucesso!', 'success');
    document.getElementById('f-url').value = '';
    document.getElementById('f-titulo').value = '';
    clearBtn.click();
    carregarFotos();
  } catch (e) {
    mostrarStatus(`Erro: ${e.message}`, 'error');
  } finally {
    btn.textContent = 'Adicionar foto';
    btn.disabled = false;
  }
});

function mostrarStatus(msg, tipo) {
  const el = document.getElementById('form-status');
  el.textContent = msg;
  el.className = `form-status ${tipo}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

// ── FILTROS ──
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroAtivo = btn.dataset.cat;
    carregarFotos();
  });
});

// ── CARREGAR FOTOS ──
const CAT_LABELS = {
  corte: '✂ Corte + Fade',
  barba: '🧔 Barba',
  ambiente: '💈 Ambiente',
  antes_depois: '⭐ Before/After',
  acabamento: '✨ Acabamento',
  esp_corte_americano: '★ Esp: Corte Americano',
  esp_fade_clean: '★ Esp: Fade Clean',
  esp_barba_ozonio: '★ Esp: Barba com Ozônio',
  esp_corte_afro: '★ Esp: Corte Afro + Nudred Sponge',
  esp_detalhes_finos: '★ Esp: Detalhes Finos',
  esp_corte_infantil: '★ Esp: Corte Infantil',
};

async function carregarFotos() {
  const grid    = document.getElementById('fotos-grid');
  const loading = document.getElementById('loading-msg');
  grid.innerHTML = '';
  grid.appendChild(loading);
  loading.hidden = false;
  loading.textContent = 'Carregando fotos...';

  try {
    const url = filtroAtivo === 'todas'
      ? `${API}/admin/fotos`
      : `${API}/admin/fotos?categoria=${filtroAtivo}`;
    const r = await fetch(url, { headers: { 'x-admin-token': token } });
    const fotos = await r.json();

    loading.hidden = true;

    const filtered = filtroAtivo === 'todas' ? fotos : fotos.filter(f => f.categoria === filtroAtivo);

    if (!filtered.length) {
      loading.textContent = 'Nenhuma foto encontrada.';
      loading.hidden = false;
      return;
    }

    filtered.forEach(foto => {
      const card = document.createElement('div');
      card.className = `foto-card${foto.ativa ? '' : ' inativa'}`;
      card.dataset.id = foto.id;
      const svgEye     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      const svgEyeOff  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      const svgTrash   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      card.innerHTML = `
        <img class="foto-thumb" src="${foto.url}" alt="${foto.titulo || ''}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'"/>
        <div class="foto-info">
          <div class="foto-cat">${CAT_LABELS[foto.categoria] || foto.categoria}</div>
          <div class="foto-titulo">${foto.titulo || '(sem legenda)'}</div>
          <div class="foto-actions">
            <button class="btn-toggle" aria-label="${foto.ativa ? 'Ocultar' : 'Exibir'} foto">
              ${foto.ativa ? svgEye : svgEyeOff}
              <span class="btn-label">${foto.ativa ? 'Visível' : 'Oculta'}</span>
            </button>
            <button class="btn-del" aria-label="Apagar foto">
              ${svgTrash}
              <span class="btn-label">Apagar</span>
            </button>
          </div>
        </div>
      `;
      card.querySelector('.btn-toggle').addEventListener('click', () => toggleFoto(foto.id, !foto.ativa));
      card.querySelector('.btn-del').addEventListener('click', () => deletarFoto(foto.id));
      grid.appendChild(card);
    });
  } catch (e) {
    loading.textContent = `Erro ao carregar: ${e.message}`;
    loading.hidden = false;
  }
}

async function toggleFoto(id, ativa) {
  await fetch(`${API}/admin/fotos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify({ ativa }),
  });
  carregarFotos();
}

async function deletarFoto(id) {
  if (!confirm('Apagar esta foto permanentemente?')) return;
  await fetch(`${API}/admin/fotos/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': token },
  });
  carregarFotos();
}
