import 'dotenv/config';
import express from 'express';
import { neon } from '@neondatabase/serverless';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const app = express();
const sql = neon(process.env.DATABASE_URL);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('.'));

// Sessões em memória: token -> expiresAt
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

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

  // Se não há senha no banco e ADMIN_PASSWORD está no .env, cria automaticamente
  const [existing] = await sql`SELECT id FROM admin_config LIMIT 1`;
  if (!existing && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await sql`INSERT INTO admin_config (senha_hash) VALUES (${hash})`;
    console.log('Senha admin criada a partir do .env');
  }
}

initDB().catch(console.error);

// ── AUTH ──

function auth(req, res, next) {
  const token = req.headers['x-admin-token'];
  const session = sessions.get(token);
  if (!session || Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// ── PUBLIC ──

app.get('/api/fotos', async (req, res) => {
  try {
    const { categoria } = req.query;
    const rows = categoria
      ? await sql`SELECT * FROM fotos WHERE ativa = true AND categoria = ${categoria} ORDER BY ordem ASC, criado_em DESC`
      : await sql`SELECT * FROM fotos WHERE ativa = true ORDER BY categoria, ordem ASC, criado_em DESC`;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LOGIN / SETUP ──

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
  try {
    const [config] = await sql`SELECT senha_hash FROM admin_config LIMIT 1`;
    if (!config) return res.status(404).json({ error: 'setup_needed' });

    const ok = await bcrypt.compare(password, config.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta' });

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Informa se o painel já foi configurado (sem expor dados sensíveis)
app.get('/api/admin/status', async (req, res) => {
  try {
    const [row] = await sql`SELECT id FROM admin_config LIMIT 1`;
    res.json({ configurado: !!row });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Apenas funciona se ainda não há senha cadastrada
app.post('/api/admin/setup-senha', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  try {
    const existing = await sql`SELECT id FROM admin_config LIMIT 1`;
    if (existing.length) return res.status(400).json({ error: 'Senha já configurada. Use o painel para alterar.' });

    const hash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO admin_config (senha_hash) VALUES (${hash})`;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/alterar-senha', auth, async (req, res) => {
  const { novaSenha } = req.body;
  if (!novaSenha || novaSenha.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  try {
    const hash = await bcrypt.hash(novaSenha, 10);
    await sql`UPDATE admin_config SET senha_hash = ${hash}`;
    sessions.clear();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/logout', auth, (req, res) => {
  const token = req.headers['x-admin-token'];
  sessions.delete(token);
  res.json({ ok: true });
});

// ── ADMIN FOTOS ──

app.get('/api/admin/fotos', auth, async (req, res) => {
  try {
    const rows = await sql`SELECT * FROM fotos ORDER BY criado_em DESC`;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/fotos', auth, async (req, res) => {
  try {
    const { url, titulo, categoria, ordem } = req.body;
    if (!url || !categoria) return res.status(400).json({ error: 'url e categoria são obrigatórios' });
    const [row] = await sql`
      INSERT INTO fotos (url, titulo, categoria, ordem)
      VALUES (${url}, ${titulo || null}, ${categoria}, ${ordem ?? 0})
      RETURNING *
    `;
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/admin/fotos/:id', auth, async (req, res) => {
  try {
    const { titulo, categoria, ativa, ordem } = req.body;
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
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/fotos/:id', auth, async (req, res) => {
  try {
    await sql`DELETE FROM fotos WHERE id = ${req.params.id}`;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Borges Barber API rodando na porta ${PORT}`));
}

export default app;
