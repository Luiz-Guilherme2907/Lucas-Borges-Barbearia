import 'dotenv/config';
import express from 'express';
import { neon } from '@neondatabase/serverless';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const sql = neon(process.env.DATABASE_URL);

const CATEGORIAS_VALIDAS = ['corte', 'barba', 'ambiente', 'antes_depois', 'acabamento'];

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-admin-token']
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

const SESSION_TTL_INTERVAL = '24 hours';

async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS admin_config (
      id         SERIAL PRIMARY KEY,
      senha_hash TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fotos (
      id         SERIAL PRIMARY KEY,
      url        TEXT NOT NULL,
      titulo     TEXT,
      categoria  TEXT NOT NULL DEFAULT 'corte',
      ordem      INTEGER NOT NULL DEFAULT 0,
      ativa      BOOLEAN NOT NULL DEFAULT true,
      criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`DELETE FROM sessions WHERE expires_at < NOW()`;
}

initDB().catch(console.error);

// ── HELPERS ──

async function auth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ error: 'Não autorizado' });
  try {
    const [session] = await sql`
      SELECT token FROM sessions WHERE token = ${token} AND expires_at > NOW()
    `;
    if (!session) return res.status(401).json({ error: 'Não autorizado' });
    next();
  } catch {
    return res.status(401).json({ error: 'Não autorizado' });
  }
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validatePassword(pwd) {
  if (!pwd || pwd.length < 12) return 'Senha deve ter pelo menos 12 caracteres';
  if (!/[A-Z]/.test(pwd)) return 'Senha deve conter pelo menos uma letra maiúscula';
  if (!/[0-9]/.test(pwd)) return 'Senha deve conter pelo menos um número';
  return null;
}

// ── PUBLIC ──

app.get('/api/fotos', async (req, res) => {
  try {
    const { categoria } = req.query;
    const rows = categoria
      ? await sql`SELECT * FROM fotos WHERE ativa = true AND categoria = ${categoria} ORDER BY ordem ASC, criado_em DESC`
      : await sql`SELECT * FROM fotos WHERE ativa = true ORDER BY categoria, ordem ASC, criado_em DESC`;
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (e) {
    console.error('[GET /api/fotos]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// ── LOGIN / SETUP ──

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
  try {
    const [config] = await sql`SELECT senha_hash FROM admin_config LIMIT 1`;
    if (!config) return res.status(404).json({ error: 'setup_needed' });

    const ok = await bcrypt.compare(password, config.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });

    const token = crypto.randomBytes(32).toString('hex');
    await sql`
      INSERT INTO sessions (token, expires_at)
      VALUES (${token}, NOW() + INTERVAL '24 hours')
    `;
    res.json({ token });
  } catch (e) {
    console.error('[POST /api/admin/login]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.get('/api/admin/status', async (req, res) => {
  try {
    const [row] = await sql`SELECT id FROM admin_config LIMIT 1`;
    res.json({ configurado: !!row });
  } catch (e) {
    console.error('[GET /api/admin/status]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Apenas funciona se ainda não há senha cadastrada
app.post('/api/admin/setup-senha', async (req, res) => {
  const { password } = req.body;
  const pwdErr = validatePassword(password);
  if (pwdErr) return res.status(400).json({ error: pwdErr });
  try {
    const existing = await sql`SELECT id FROM admin_config LIMIT 1`;
    if (existing.length) return res.status(400).json({ error: 'Senha já configurada. Use o painel para alterar.' });

    const hash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO admin_config (senha_hash) VALUES (${hash})`;
    res.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/admin/setup-senha]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.post('/api/admin/alterar-senha', auth, async (req, res) => {
  const { novaSenha } = req.body;
  const pwdErr = validatePassword(novaSenha);
  if (pwdErr) return res.status(400).json({ error: pwdErr });
  try {
    const hash = await bcrypt.hash(novaSenha, 10);
    await sql`UPDATE admin_config SET senha_hash = ${hash}`;
    await sql`DELETE FROM sessions`;
    res.json({ ok: true });
  } catch (e) {
    console.error('[POST /api/admin/alterar-senha]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.post('/api/admin/logout', auth, async (req, res) => {
  const token = req.headers['x-admin-token'];
  try {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
  } catch (e) {
    console.error('[POST /api/admin/logout]', e);
  }
  res.json({ ok: true });
});

// ── ADMIN FOTOS ──

app.get('/api/admin/fotos', auth, async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM fotos ORDER BY criado_em DESC`;
    res.json(rows);
  } catch (e) {
    console.error('[GET /api/admin/fotos]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.post('/api/admin/fotos', auth, async (req, res) => {
  try {
    const { url, titulo, categoria, ordem } = req.body;
    if (!url || !categoria) return res.status(400).json({ error: 'url e categoria são obrigatórios' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'URL inválida. Use http:// ou https://' });
    if (!CATEGORIAS_VALIDAS.includes(categoria)) return res.status(400).json({ error: 'Categoria inválida' });
    if (titulo && titulo.length > 255) return res.status(400).json({ error: 'Título muito longo (máx 255 caracteres)' });

    const [row] = await sql`
      INSERT INTO fotos (url, titulo, categoria, ordem)
      VALUES (${url}, ${titulo || null}, ${categoria}, ${ordem ?? 0})
      RETURNING *
    `;
    res.json(row);
  } catch (e) {
    console.error('[POST /api/admin/fotos]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.patch('/api/admin/fotos/:id', auth, async (req, res) => {
  try {
    const { titulo, categoria, ativa, ordem } = req.body;
    if (categoria !== undefined && !CATEGORIAS_VALIDAS.includes(categoria)) {
      return res.status(400).json({ error: 'Categoria inválida' });
    }
    if (titulo && titulo.length > 255) return res.status(400).json({ error: 'Título muito longo (máx 255 caracteres)' });

    const [row] = await sql`
      UPDATE fotos SET
        titulo    = COALESCE(${titulo ?? null}, titulo),
        categoria = COALESCE(${categoria ?? null}, categoria),
        ativa     = COALESCE(${ativa ?? null}, ativa),
        ordem     = COALESCE(${ordem ?? null}, ordem)
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json(row);
  } catch (e) {
    console.error('[PATCH /api/admin/fotos]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

app.delete('/api/admin/fotos/:id', auth, async (req, res) => {
  try {
    await sql`DELETE FROM fotos WHERE id = ${req.params.id}`;
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/admin/fotos]', e);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Borges Barber API rodando na porta ${PORT}`));
}

export default app;
