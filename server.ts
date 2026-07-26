import express from "express";
// Vite import moved to dynamic import inside startServer for better bundling
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pg from 'pg';
import FormData from 'form-data';
import multer from 'multer';
import { google } from 'googleapis';
import AdmZip from 'adm-zip';
import pathModule from 'path';
import { GoogleGenAI } from '@google/genai';
import os from 'os';
import { initDb, query, externalQuery, isDbReady, provisionShops } from "./src/db";

const envPath = pathModule.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.log('--- WARNING: .env file not found at', envPath);
}

// Default to production if not specified (important for Hostinger)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = process.env.npm_lifecycle_event === 'dev' ? 'development' : 'production';
}

const LOG_FILE = pathModule.join(process.cwd(), "logs", "server.log");
function logToFile(msg: string) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[LOG] ${msg}`);
    return;
  }
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
  } catch (e) {
    console.error("Log failed", e);
  }
}

// WHITELIST ABSOLUTA - APENAS O QUE O N8N ACEITA OFICIALMENTE
const ALLOWED_ROOT = ['name', 'nodes', 'connections', 'settings', 'staticData', 'meta'];
const ALLOWED_NODE = ['id', 'name', 'type', 'typeVersion', 'position', 'parameters', 'webhookId', 'credentials', 'notes', 'disabled', 'alwaysOutputData', 'onError', 'notesInFlow', 'retryOnFail', 'maxRetries', 'retryDelay', 'executeOnce', 'visibility'];
const ALLOWED_SETTINGS = ['executionOrder', 'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'errorWorkflow', 'callerPolicy'];

function strictClean(obj: any, mode: 'root' | 'node' | 'settings' | 'other' = 'root'): any {
  if (Array.isArray(obj)) {
    return obj.map(item => strictClean(item, mode === 'root' ? 'node' : 'other'));
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (mode === 'root' && !ALLOWED_ROOT.includes(key)) continue;
      if (mode === 'node' && !ALLOWED_NODE.includes(key)) continue;
      if (mode === 'settings' && !ALLOWED_SETTINGS.includes(key)) continue;
      let nextMode: any = 'other';
      if (mode === 'root' && key === 'settings') nextMode = 'settings';
      newObj[key] = strictClean(obj[key], nextMode);
    }
    return newObj;
  }
  return obj;
}

// ─── Pool do banco de clientes (externo) ─────────────────────────────────────
// ─── Banco de dados unificado via src/db ─────────────────────────────────────
// Redundant pool removed. Using externalQuery and query from ./src/db

async function startServer() {
  const app = express();
  const rawPort = process.env.PORT || 3001;
  const isPipe = typeof rawPort === 'string' && isNaN(Number(rawPort));
  const PORT = isPipe ? rawPort : Number(rawPort);
  const JWT_SECRET = process.env.JWT_SECRET || 'n8n-controller-saas-secret-2024';

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));
  app.use('/uploads', express.static(pathModule.join(process.cwd(), 'uploads')));
  // Keep-alive para reduzir latência de conexão
  app.use((_req, res, next) => {
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=30');
    next();
  });


  console.log('--- STARTUP DEBUG ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
  console.log('EXTERNAL_DATABASE_URL present:', !!process.env.EXTERNAL_DATABASE_URL);
  console.log('----------------------');

  try { await initDb(); } catch (e) { console.error("DB Init failed:", e); }

  const memoryInstances: Record<string, any> = {
    '1': { 
      baseUrl: process.env.N8N_INSTANCE_1_URL || 'https://n8n.cardapioclick.com.br', 
      apiKey: process.env.N8N_INSTANCE_1_KEY || '', 
      templates: [] 
    },
    '2': {
      baseUrl: process.env.N8N_INSTANCE_2_URL || 'https://n8npro.gdautomacao.com',
      apiKey: process.env.N8N_INSTANCE_2_KEY || '',
      templates: []
    }
  };

  // ─── Inicialização de Tabelas ────────────────────────────────────────────────
  try {
    await externalQuery(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value JSONB
      )
    `);
    console.log('Tabela system_config verificada/criada.');
  } catch (err: any) {
    console.error('Erro ao inicializar tabelas:', err.message);
  }

  // ─── JWT Helpers ─────────────────────────────────────────────────────────────
  function signJwt(payload: object): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24h
    })).toString('base64url');
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  }

  function verifyJwt(token: string): any {
    try {
      const [header, body, sig] = token.split('.');
      const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
      if (sig !== expectedSig) return null;
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      return payload;
    } catch { return null; }
  }

  // ─── Auth Middlewares ─────────────────────────────────────────────────────────
  function requireAuth(req: any, res: any, next: any) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    const token = auth.slice(7);
    const payload = verifyJwt(token);
    if (!payload) return res.status(401).json({ error: 'Token inválido ou expirado' });
    req.user = payload;
    next();
  }

  function requireAdmin(req: any, res: any, next: any) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
  }

  // ─── AUTH ROUTES (públicas) ───────────────────────────────────────────────────

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const identifier = email.toLowerCase().trim();
    try {
      // ── 1. Tentar como ADMIN (banco Supabase) ──────────────────────────────
      const adminResult = await query('SELECT * FROM users WHERE email = $1', [identifier]);
      if (adminResult.rowCount > 0) {
        const user = adminResult.rows[0];
        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Email ou senha incorretos' });
        const token = signJwt({ id: user.id, email: user.email, role: user.role, name: user.name });
        return res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      }

      // ── 2. Tentar como LOJISTA (banco externo Clientes) ───────────────────
      // Busca por email ou celular
      const numParam = identifier.replace(/\D/g, '');
      const hasNum = numParam.length > 0;
      
      const clienteResult = await externalQuery(
        `SELECT id, "cod-cliente", celular, email, "pushName", "nome-estabelecimento", "id-loja", "senha-app"
         FROM "Clientes"
         WHERE LOWER(TRIM(email)) = $1 OR ($2 AND TRIM(celular) = $3)
         LIMIT 1`,
        [identifier, hasNum, numParam]
      );

      if (clienteResult.rowCount === 0) {
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      }

      const cliente = clienteResult.rows[0];

      // Senha: usa senha-app se preenchida; senão usa o celular como senha padrão
      const senhaCadastrada = cliente['senha-app'];
      const senhaEsperada = senhaCadastrada && senhaCadastrada.trim() !== ''
        ? senhaCadastrada
        : cliente.celular; // senha padrão = número do celular

      if (password !== senhaEsperada) {
        return res.status(401).json({ error: 'Email ou senha incorretos' });
      }

      const nome = cliente['nome-estabelecimento'] || cliente['pushName'] || 'Lojista';
      const token = signJwt({
        id: String(cliente.id),
        email: cliente.email || identifier,
        role: 'lojista',
        name: nome,
        codCliente: cliente['cod-cliente'],
        idLoja: cliente['id-loja'],
        celular: cliente.celular,
      });
      return res.json({
        token,
        user: {
          id: String(cliente.id),
          email: cliente.email || identifier,
          role: 'lojista',
          name: nome,
          codCliente: cliente['cod-cliente'],
          idLoja: cliente['id-loja'],
        }
      });
    } catch (e: any) {
      console.error('Login error:', e);
      res.status(500).json({ error: 'Erro interno no servidor' });
    }
  });

  app.get("/api/auth/me", requireAuth, (req: any, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.json({ success: true });
  });

  // Primeiro cadastro de senha (público - sem autenticação)
  app.post("/api/auth/setup-password", async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;
    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Preencha todos os campos' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'As senhas não coincidem' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const identifier = email.toLowerCase().trim();
    try {
      // Verificar se email existe na tabela Clientes
      const result = await externalQuery(
        `SELECT id, "cod-cliente", celular, email, "pushName", "nome-estabelecimento", "senha-app"
         FROM "Clientes"
         WHERE LOWER(TRIM(email)) = $1
         LIMIT 1`,
        [identifier]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          error: 'E-mail não encontrado. Contate o suporte da Cardápio Click.'
        });
      }

      const cliente = result.rows[0];

      // Salvar nova senha
      await externalQuery(
        'UPDATE "Clientes" SET "senha-app" = $1 WHERE id = $2',
        [newPassword, cliente.id]
      );

      return res.json({ success: true, message: 'Senha cadastrada com sucesso!' });
    } catch (e: any) {
      console.error('Setup password error:', e);
      return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
    }
  });

  // Cadastrar / alterar senha do lojista
  app.post("/api/auth/change-password", requireAuth, async (req: any, res) => {
    const { newPassword, confirmPassword } = req.body;
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Nova senha e confirmação são obrigatórias' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'As senhas não coincidem' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
    }

    const user = req.user;

    // Admin: atualizar no Supabase
    if (user.role === 'admin') {
      try {
        const hash = bcrypt.hashSync(newPassword, 10);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
        return res.json({ success: true });
      } catch (e: any) {
        return res.status(500).json({ error: 'Erro ao salvar senha: ' + e.message });
      }
    }

    // Lojista: atualizar no banco externo Clientes
    try {
      const result = await externalQuery(
        'UPDATE "Clientes" SET "senha-app" = $1 WHERE id = $2',
        [newPassword, parseInt(user.id)]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.json({ success: true });
    } catch (e: any) {
      console.error('Change password error:', e);
      res.status(500).json({ error: 'Erro ao salvar senha: ' + e.message });
    }
  });

  app.post("/api/auth/change-email", requireAuth, async (req: any, res) => {
    const { newEmail } = req.body;
    if (!newEmail || !newEmail.includes('@')) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    const email = newEmail.trim().toLowerCase();
    const user = req.user;

    if (user.role === 'admin') {
      try {
        // Verifica se email já existe
        const exists = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, user.id]);
        if (exists.rows.length > 0) return res.status(400).json({ error: 'Este email já está em uso' });
        await query('UPDATE users SET email = $1 WHERE id = $2', [email, user.id]);
        return res.json({ success: true });
      } catch (e: any) {
        return res.status(500).json({ error: 'Erro ao salvar email: ' + e.message });
      }
    }

    // Lojista: atualizar no banco externo Clientes
    try {
      const result = await externalQuery(
        'UPDATE "Clientes" SET "email" = $1 WHERE id = $2',
        [email, parseInt(user.id)]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.json({ success: true });
    } catch (e: any) {
      console.error('Change email error:', e);
      res.status(500).json({ error: 'Erro ao salvar email: ' + e.message });
    }
  });

  // ─── CONFIG DO ROBÔ ────────────────────────────────────────────────────────────


  // Setup multer for image uploads
  const multer = (await import('multer')).default;
  const path = (await import('path')).default;
  const uploadsDir = path.join(process.cwd(), 'uploads', 'fotos');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req: any, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      // resolvedCodCliente é preenchido pelo middleware abaixo (sempre o cod-cliente real)
      const codCliente = req.resolvedCodCliente || 'unknown';
      const tipo = (req.query?.tipo === 'fechado') ? 'fotodespedida' : 'fotosaudacao';
      cb(null, `lojista-${codCliente}-${tipo}${ext}`);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 }, // 500kb
    fileFilter: (_req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) cb(null, true);
      else cb(new Error('Formato não permitido. Use jpg, jpeg, png ou webp'));
    },
  });

  // Middleware que resolve o cod-cliente ANTES do multer (para nome de arquivo padronizado)
  const resolveCodCliente = async (req: any, res: any, next: any) => {
    try {
      if (req.user?.role === 'admin' && req.query?.lojistaId) {
        // Admin editando lojista: busca cod-cliente no banco pelo id do lojista
        const result = await externalQuery(
          'SELECT "cod-cliente" FROM "Clientes" WHERE id = $1',
          [parseInt(req.query.lojistaId as string)]
        );
        req.resolvedCodCliente = result.rows[0]?.['cod-cliente'] || req.query.lojistaId;
      } else {
        // Lojista logado: cod-cliente já vem no JWT
        req.resolvedCodCliente = req.user?.codCliente || req.user?.id || 'unknown';
      }
    } catch (_) {
      req.resolvedCodCliente = req.user?.codCliente || req.user?.id || 'unknown';
    }
    next();
  };

  // Serve uploads folder estaticamente
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // GET /api/robo-config — retorna config do lojista logado (ou específico se admin)
  app.get('/api/robo-config', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? parseInt(req.query.lojistaId as string) : parseInt(req.user.id);
      const result = await externalQuery(
        'SELECT "ativa-robo", "ativa-ia", "msg-saudacao", "msg-despedida", "link-foto-aberto", "link-foto-fechado", "tipo_mensagem_aberto", "tipo_mensagem_fechado", "status-recuperador", "status-lembrete", "qtd-dias", "qtd-dias-maximo", "plano", "msg-paga", "horario-recuperador" FROM "Clientes" WHERE id = $1',
        [targetId]
      );
      if (result.rowCount === 0) {
        // retorna defaults
        return res.json({
          'ativa-robo': 1,
          'ativa-ia': 1,
          'msg-saudacao': '',
          'msg-despedida': '',
          'link-foto-aberto': '',
          'link-foto-fechado': '',
          tipo_mensagem_aberto: 'texto',
          tipo_mensagem_fechado: 'texto',
          plano: 'basico'
        });
      }
      const row = result.rows[0];

      let roboConfig: any = {};
      try {
        const roboRes = await query('SELECT * FROM config_robo WHERE lojista_id = $1', [String(targetId)]);
        if (roboRes.rows.length > 0) {
          roboConfig = {
            'status-recuperador': roboRes.rows[0]['status-recuperador'],
            'qtd-dias': roboRes.rows[0]['qtd-dias'],
            'qtd-dias-maximo': roboRes.rows[0]['qtd-dias-maximo'],
            'status-lembrete': roboRes.rows[0]['status-lembrete'],
            'recuperador-msg': roboRes.rows[0]['recuperador-msg'] || '',
            'lembrar-cliente': roboRes.rows[0]['lembrar-cliente'] || '',
            'horario-recuperador': roboRes.rows[0]['horario-recuperador'] || '',
            'msg-paga': roboRes.rows[0]['msg-paga'] !== undefined ? parseInt(roboRes.rows[0]['msg-paga'], 10) : 0,
          };
        }
      } catch (err) {
        console.error('Erro ao buscar config_robo complementar no GET', err);
      }

      // Format everything to strict 1 (Ligado) or 0 (Desligado) according to User Rule
      // activa-robo is integer, activa-ia is text. (0 = desligado, 1 = ligado)
      const ativaRobo = row['ativa-robo'] !== null ? parseInt(row['ativa-robo'], 10) : 1;
      const ativaIa = row['ativa-ia'] !== null ? parseInt(row['ativa-ia'], 10) : 1;

      const statusRecuperador = row['status-recuperador'] !== null && row['status-recuperador'] !== undefined ? parseInt(row['status-recuperador'], 10) : (roboConfig['status-recuperador'] || 1);
      const statusLembrete = row['status-lembrete'] !== null && row['status-lembrete'] !== undefined ? parseInt(row['status-lembrete'], 10) : (roboConfig['status-lembrete'] || 1);

      const qtdDias = row['qtd-dias'] !== null && row['qtd-dias'] !== undefined ? parseInt(row['qtd-dias'], 10) : (roboConfig['qtd-dias'] || 0);
      const qtdDiasMaximo = row['qtd-dias-maximo'] !== null && row['qtd-dias-maximo'] !== undefined ? parseInt(row['qtd-dias-maximo'], 10) : (roboConfig['qtd-dias-maximo'] || 0);

      return res.json({
        ...row,
        'ativa-robo': ativaRobo,
        'ativa-ia': ativaIa,
        'status-recuperador': statusRecuperador,
        'status-lembrete': statusLembrete,
        'qtd-dias': qtdDias,
        'qtd-dias-maximo': qtdDiasMaximo,
        'recuperador-msg': roboConfig['recuperador-msg'] || row['recuperador-msg'] || '',
        'lembrar-cliente': roboConfig['lembrar-cliente'] || row['lembrar-cliente'] || '',
        'msg-paga': roboConfig['msg-paga'] !== undefined ? roboConfig['msg-paga'] : (row['msg-paga'] !== undefined ? parseInt(row['msg-paga'], 10) : 0),
        'horario-recuperador': roboConfig['horario-recuperador'] || row['horario-recuperador'] || '',
        'plano': row.plano || 'basico'
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/robo-config — salva configuração
  app.post('/api/robo-config', requireAuth, async (req: any, res) => {
    const {
      'ativa-robo': ativaRobo,
      'ativa-ia': ativaIa,
      'msg-saudacao': msgSaudacao,
      'msg-despedida': msgDespedida,
      'link-foto-aberto': linkFotoAberto,
      'link-foto-fechado': linkFotoFechado,
      tipo_mensagem_aberto,
      tipo_mensagem_fechado,
      lojistaId
    } = req.body;

    const targetId = (req.user.role === 'admin' && lojistaId) ? parseInt(lojistaId) : parseInt(req.user.id);
    console.log(`\n[ROBO-CONFIG SAVE] Lojista ${targetId} | linkFotoAberto: "${linkFotoAberto}" | linkFotoFechado: "${linkFotoFechado}"`);
    console.log(`[ROBO-CONFIG SAVE] tipo_aberto: ${tipo_mensagem_aberto} | tipo_fechado: ${tipo_mensagem_fechado}`);


    try {
      const config = req.body;
      const sql = `
        INSERT INTO config_robo (
          lojista_id, "ativa-robo", "ativa-ia", "msg-saudacao", "msg-despedida", 
          "link-foto-aberto", "link-foto-fechado", tipo_mensagem_aberto, tipo_mensagem_fechado,
          "status-recuperador", "qtd-dias", "qtd-dias-maximo", "status-lembrete",
          "recuperador-msg", "lembrar-cliente", "msg-paga", "horario-recuperador",
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (lojista_id) DO UPDATE SET
          "ativa-robo" = EXCLUDED."ativa-robo",
          "ativa-ia" = EXCLUDED."ativa-ia",
          "msg-saudacao" = EXCLUDED."msg-saudacao",
          "msg-despedida" = EXCLUDED."msg-despedida",
          "link-foto-aberto" = EXCLUDED."link-foto-aberto",
          "link-foto-fechado" = EXCLUDED."link-foto-fechado",
          tipo_mensagem_aberto = EXCLUDED.tipo_mensagem_aberto,
          tipo_mensagem_fechado = EXCLUDED.tipo_mensagem_fechado,
          "status-recuperador" = EXCLUDED."status-recuperador",
          "qtd-dias" = EXCLUDED."qtd-dias",
          "qtd-dias-maximo" = EXCLUDED."qtd-dias-maximo",
          "status-lembrete" = EXCLUDED."status-lembrete",
          "recuperador-msg" = EXCLUDED."recuperador-msg",
          "lembrar-cliente" = EXCLUDED."lembrar-cliente",
          "msg-paga" = EXCLUDED."msg-paga",
          "horario-recuperador" = EXCLUDED."horario-recuperador",
          updated_at = NOW()
      `;

      // Conversions: frontend will pass integers (0 or 1). 
      // If booleans leak in, ensure they are casted correctly: 1 for truthy, 0 for falsy.
      const parseToggle = (val: any) => val === 1 || val === true || val === '1' ? 1 : 0;

      let valRobo = parseToggle(ativaRobo);
      let valIa = parseToggle(ativaIa);
      let valRec = parseToggle(config['status-recuperador']);
      let valLemb = parseToggle(config['status-lembrete']);
      let valMsgPaga = parseToggle(config['msg-paga']);
      let tMsgAberto = config.tipo_mensagem_aberto || 'texto';
      let tMsgFechado = config.tipo_mensagem_fechado || 'texto';

      // Segurança: Obter o plano real se não for Admin (evita bypass no frontend)
      let activePlano = config.plano || 'basico';
      if (req.user.role !== 'admin') {
        const { rows: pRows } = await externalQuery('SELECT plano FROM "Clientes" WHERE id = $1', [targetId]);
        if (pRows.length > 0) {
          activePlano = pRows[0].plano || 'basico';
        }
      }

      // Aplica restrições estritas baseadas no Plano
      if (activePlano === 'basico') {
        valIa = 0;
        valRec = 0;
        valLemb = 0;
        tMsgAberto = 'texto';
        tMsgFechado = 'texto';
      } else if (activePlano === 'avancado') {
        valRec = 0;
        valLemb = 0;
        tMsgAberto = 'texto';
        tMsgFechado = 'texto';
      }

      await query(sql, [
        String(targetId),
        valRobo,
        valIa,
        msgSaudacao || '',
        msgDespedida || '',
        linkFotoAberto || '',
        linkFotoFechado || '',
        tMsgAberto,
        tMsgFechado,
        valRec,
        config['qtd-dias'] ? parseInt(config['qtd-dias'], 10) : 0,
        config['qtd-dias-maximo'] ? parseInt(config['qtd-dias-maximo'], 10) : 0,
        valLemb,
        config['recuperador-msg'] || '',
        config['lembrar-cliente'] || '',
        valMsgPaga,
        config['horario-recuperador'] || ''
      ]);

      // Execute UPDATE conditionally based on whether plano was provided.
      // Usually, only the admin form transmits 'plano', but let's safely fall back.
      if (req.user.role === 'admin' && typeof config.plano === 'string') {
        await externalQuery(
          `UPDATE "Clientes" SET 
             "ativa-robo" = $1, 
             "ativa-ia" = $2, 
             "msg-saudacao" = $3, 
             "msg-despedida" = $4,
             "link-foto-aberto" = $5, 
             "link-foto-fechado" = $6, 
             "tipo_mensagem_aberto" = $7, 
             "tipo_mensagem_fechado" = $8,
             "status-recuperador" = $9,
             "status-lembrete" = $10,
             "qtd-dias" = $11,
             "qtd-dias-maximo" = $12,
             "plano" = $13,
             "recuperador-msg" = $14,
             "lembrar-cliente" = $15,
             "msg-paga" = $16,
             "horario-recuperador" = $17
           WHERE id = $18`,
          [
            valRobo,
            String(valIa),
            msgSaudacao ?? '',
            msgDespedida ?? '',
            linkFotoAberto ?? '',
            linkFotoFechado ?? '',
            tMsgAberto,
            tMsgFechado,
            valRec,
            String(valLemb),
            String(config['qtd-dias'] ? parseInt(config['qtd-dias'], 10) : 0),
            String(config['qtd-dias-maximo'] ? parseInt(config['qtd-dias-maximo'], 10) : 0),
            activePlano,
            config['recuperador-msg'] || '',
            config['lembrar-cliente'] || '',
            valMsgPaga,
            config['horario-recuperador'] || '',
            targetId
          ]
        );
      } else {
        await externalQuery(
          `UPDATE "Clientes" SET 
             "ativa-robo" = $1, 
             "ativa-ia" = $2, 
             "msg-saudacao" = $3, 
             "msg-despedida" = $4,
             "link-foto-aberto" = $5, 
             "link-foto-fechado" = $6, 
             "tipo_mensagem_aberto" = $7, 
             "tipo_mensagem_fechado" = $8,
             "status-recuperador" = $9,
             "status-lembrete" = $10,
             "qtd-dias" = $11,
             "qtd-dias-maximo" = $12,
             "recuperador-msg" = $13,
             "lembrar-cliente" = $14,
             "msg-paga" = $15,
             "horario-recuperador" = $16
           WHERE id = $17`,
          [
            valRobo,
            String(valIa),
            msgSaudacao ?? '',
            msgDespedida ?? '',
            linkFotoAberto ?? '',
            linkFotoFechado ?? '',
            tMsgAberto,
            tMsgFechado,
            valRec,
            String(valLemb),
            String(config['qtd-dias'] || 0),
            String(config['qtd-dias-maximo'] || 0),
            config['recuperador-msg'] || '',
            config['lembrar-cliente'] || '',
            valMsgPaga,
            config['horario-recuperador'] || '',
            targetId
          ]
        );
      }

      // Sincronizar as fotos no Baserow (Tabela 799 "Fotos") em background para não travar o carregamento
      (async () => {
        try {
          const idLojaRes = await externalQuery('SELECT "id-loja" FROM "Clientes" WHERE id = $1', [targetId]);
          const idLojaSync = idLojaRes.rows[0]?.['id-loja'] || targetId;

          const urlAberto = linkFotoAberto || '';
          const urlFechado = linkFotoFechado || '';

          const fileObjAberto = urlAberto.includes('banco-dados-baserow') ? [{ name: urlAberto.split('/').pop() }] : [];
          const fileObjFechado = urlFechado.includes('banco-dados-baserow') ? [{ name: urlFechado.split('/').pop() }] : [];

          const searchRes = await axios.get(`https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/799/?user_field_names=true&filter__field_7656__equal=${idLojaSync}`, {
            headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ' }
          });

          const payload = {
            "id-loja": parseInt(idLojaSync),
            "foto-aberta": fileObjAberto,
            "foto-fechado": fileObjFechado
          };

          if (searchRes.data.results.length > 0) {
            const rowId = searchRes.data.results[0].id;
            await axios.patch(`https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/799/${rowId}/?user_field_names=true`, payload, {
              headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ', 'Content-Type': 'application/json' }
            });
          } else {
            await axios.post(`https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/799/?user_field_names=true`, payload, {
              headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ', 'Content-Type': 'application/json' }
            });
          }
        } catch (err: any) {
          console.error('Erro ao sincronizar com Baserow Table 799:', err.response?.data || err.message);
        }
      })();

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/robo-config/upload — faz upload de imagem, salva no disco e retorna URL
  app.post('/api/robo-config/upload', requireAuth, resolveCodCliente, (req: any, res: any) => {
    upload.single('foto')(req, res, async (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'O arquivo deve ter no máximo 500kb' });
        }
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

      try {
        // Montar URL pública a partir do host da requisição
        const host = req.get('host') || 'robo.cardapioclick.com.br';
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const fileUrl = `${protocol}://${host}/uploads/fotos/${req.file.filename}`;

        console.log(`[UPLOAD] Imagem salva: ${req.file.path} -> URL: ${fileUrl}`);
        // Nome fixo por tipo: não precisa de limpeza, o multer já sobrescreve o arquivo anterior

        res.json({ success: true, url: fileUrl, name: req.file.originalname });
      } catch (e: any) {
        console.error('Upload error:', e.message);
        res.status(500).json({ error: 'Erro ao processar imagem' });
      }
    });
  });

  // ─── GOOGLE API KEY ────────────────────────────────────────────────────────────

  // Migração: adicionar coluna google_api_key se não existir
  try {
    await externalQuery(`ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS google_api_key TEXT DEFAULT ''`);
  } catch (_) { /* ignora se já existe */ }

  // ─── MASS CAMPAIGNS TABLE ─────────────────────────────────────────────────────
  try {
    await externalQuery(`
      CREATE TABLE IF NOT EXISTS mass_campaigns (
        id SERIAL PRIMARY KEY,
        lojista_id TEXT NOT NULL,
        nome TEXT NOT NULL,
        template_name TEXT NOT NULL,
        template_lang TEXT NOT NULL DEFAULT 'pt_BR',
        phone_from TEXT NOT NULL,
        recipients JSONB NOT NULL DEFAULT '[]',
        components JSONB DEFAULT '[]',
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',
        total INT DEFAULT 0,
        total_sent INT DEFAULT 0,
        total_failed INT DEFAULT 0,
        error_log TEXT,
        message_ids JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS message_ids JSONB DEFAULT '[]'`);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS error_log TEXT`);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS total_sent INT DEFAULT 0`);
    await externalQuery(`ALTER TABLE mass_campaigns ADD COLUMN IF NOT EXISTS total_failed INT DEFAULT 0`);
  } catch (e) { console.error('Erro ao criar tabela mass_campaigns:', e); }

  // GET /api/google-api-key — busca a chave salva do lojista
  app.get('/api/google-api-key', requireAuth, async (req: any, res) => {
    try {
      const role = req.user.role;
      const lojistaQueryId = req.query.lojistaId;
      
      // Admins podem consultar a chave de um lojista específico via ?lojistaId=
      const userId = (role === 'admin' && lojistaQueryId)
        ? parseInt(lojistaQueryId as string)
        : parseInt(req.user.id);

      console.log(`[API /google-api-key] Request by ${role} (ID ${req.user.id}). Target Lojista: ${userId}`);

      const result = await externalQuery(
        `SELECT google_api_key FROM "Clientes" WHERE id = $1`,
        [userId]
      );
      const key = result.rows[0]?.google_api_key || '';
      // Retorna a chave mascarada para exibição + a chave real para uso no SDK client-side
      const masked = key.length > 8 ? key.slice(0, 6) + '••••••••' + key.slice(-4) : key;
      res.json({ 
        hasKey: !!key, 
        maskedKey: masked, 
        apiKey: key,
        debug: { role, targetId: userId, found: !!key } // Ajuda no debug frontal
      });
    } catch (e: any) {
      console.error('[API /google-api-key] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/google-api-key — salva a chave do lojista no banco
  app.post('/api/google-api-key', requireAuth, async (req: any, res) => {
    const { apiKey, lojistaId } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'Chave de API inválida' });
    }
    try {
      // Admins podem salvar a chave de um lojista específico via body.lojistaId
      const userId = (req.user.role === 'admin' && lojistaId)
        ? parseInt(lojistaId)
        : parseInt(req.user.id);
      await externalQuery(
        `UPDATE "Clientes" SET google_api_key = $1 WHERE id = $2`,
        [apiKey.trim(), userId]
      );
      res.json({ success: true, message: 'Chave API salva com sucesso!' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/generate-image — gera imagem com IA (exclusivo Premium)
  app.post('/api/generate-image', requireAuth, async (req: any, res) => {
    try {
      const userId = parseInt(req.user.id);
      const { prompt, logoBase64, model: requestedModel, mode, style } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: 'Prompt é obrigatário' });
      }

      // 1. Verificar plano e chave no banco
      const planoRes = await externalQuery(
        `SELECT plano, google_api_key FROM "Clientes" WHERE id = $1`,
        [userId]
      );
      const userLevel = planoRes.rows[0]?.plano || 'basico';
      const userApiKey = planoRes.rows[0]?.google_api_key;

      // Prioridade de chave: Usuário > Global (se houver)
      const apiKey = userApiKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Chave de API do Google não configurada. Por favor, insira sua chave no painel.' 
        });
      }

      const genai = new GoogleGenAI({ apiKey });
      
      // Lógica de Modelo (Imagen 3 Oficial)
      // O Google usa nomes específicos na API pública. 
      // O modelo 'gemini-3.1-flash-image' do app Studio costuma ter quota zero em chaves novas/free.
      const modelsToTry = requestedModel === 'gemini-3.1-flash-image-preview' 
        ? ['imagen-3.0-generate-001', 'imagen-3.0-fast-generate-001'] 
        : ['imagen-3.0-fast-generate-001', 'imagen-3.0-generate-001'];

      // ── CONTEXTO E PROMPT (Extraído do App Local) ───────────────────────────
      const isPresencial = mode === 'presencial';
      const styleDesc = style ? `Estilo Visual: ${style}.` : '';
      
      const context = isPresencial 
        ? "OBJETIVO: Uso presencial em balcão, mesa ou placa física. Alta visibilidade e legibilidade à distância."
        : "OBJETIVO: Redes sociais (Instagram/WhatsApp). Estilo vibrante, atraente e moderno.";

      const fullPrompt = `Crie uma imagem de propaganda profissional para restaurante ou loja.
      
PEDIDO DO USUÁRIO: "${prompt}"

INSTRUÇÕES CRÍTICAS:
1. TEXTO NA IMAGEM: Escreva o texto solicitado pelo usuário DIRETAMENTE NA IMAGEM. Texto grande e legivel.
2. VISUAL: Alta qualidade fotográfica, cena apetitosa e profissional.
3. CONTEXTO: ${context}
4. ${styleDesc}
5. LAYOUT: Deixe um espaço vazio (negative space) em um dos cantos para inserção futura de logo.
${logoBase64 ? `6. IDENTIDADE VISUAL: Use o estilo e cores do logo anexo como inspiração para a arte.` : ''}`;

      const contents: any[] = [];
      const parts: any[] = [];

      if (logoBase64) {
        const [meta, data] = logoBase64.split(',');
        const mimeType = meta.match(/data:(.+);base64/)?.[1] || 'image/png';
        parts.push({ inlineData: { mimeType, data } });
      }
      
      parts.push({ text: fullPrompt });
      contents.push({ role: 'user', parts });

      let imageBase64: string | null = null;
      let imageMime = 'image/png';
      let lastError = '';

      for (const modelToTry of modelsToTry) {
        try {
          const result = await genai.models.generateContent({
            model: modelToTry,
            contents: { parts },
            config: { 
              // @ts-ignore
              imageConfig: { aspectRatio: "1:1" }
            }
          });

          if (result.candidates?.[0]?.content?.parts) {
            for (const part of result.candidates[0].content.parts) {
              if (part.inlineData) {
                imageBase64 = part.inlineData.data || null;
                imageMime = part.inlineData.mimeType || 'image/png';
                break;
              }
            }
          }
          if (imageBase64) break;
        } catch (modelErr: any) {
          lastError = modelErr?.message || String(modelErr);
          console.error(`Erro ao gerar com ${modelToTry}:`, lastError);
        }
      }

      if (!imageBase64) {
        return res.status(500).json({ error: lastError || 'IA não retornou imagem. Tente um prompt diferente.' });
      }
      return res.json({ imageBase64, mimeType: imageMime });

    } catch (e: any) {
      console.error('Erro ao gerar imagem:', e.message);
      res.status(500).json({ error: e.message || 'Erro ao gerar imagem.' });
    }
  });

  // ─── INTEGRAÇÃO UAZAPI ────────────────────────────────────────────────────────
  const UAZAPI_URL = process.env.UAZAPI_URL || 'https://deliverypronto.uazapi.com';
  const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_TOKEN || '24qAlRGyStzVS5g0U3udhcq318zT4YnPHDMaWgrVVm7s4R0tWY';

  // Helper para buscar a instância correspondente ao número do Lojista
  async function ensureUazapiInstance(lojistaRawId: string) {
    try {
      // 0. Verificar se já existe um vínculo manual na config_robo
      const configRes = await query('SELECT instance_id FROM config_robo WHERE lojista_id = $1', [lojistaRawId]);
      const manualInstanceId = configRes.rows[0]?.instance_id;

      // 1. Obter celular e nome da loja do banco para o Lojista
      const clientRes = await externalQuery('SELECT celular, "nome-estabelecimento" FROM "Clientes" WHERE id = $1', [lojistaRawId]);
      if (clientRes.rows.length === 0) throw new Error('Lojista não encontrado no banco principal');

      let celular = clientRes.rows[0].celular || '';
      celular = celular.replace(/\D/g, ''); // Somente números

      let nomeEstabelecimento = clientRes.rows[0]['nome-estabelecimento'] || '';
      let cleanName = nomeEstabelecimento.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanName) cleanName = `lojista${lojistaRawId}`;

      // 2. Buscar todas instâncias na UazAPI
      const fetchReq = await axios.get(`${UAZAPI_URL}/instance/all`, {
        headers: { admintoken: UAZAPI_ADMIN_TOKEN }
      });
      const instances = fetchReq.data || [];

      // 3. Matching prioritário: Se houver vínculo manual, usa ele
      if (manualInstanceId) {
        const manualInstance = instances.find((i: any) => i.name === manualInstanceId);
        if (manualInstance) {
          return { success: true, instanceName: manualInstance.name, state: manualInstance.status, instanceData: manualInstance };
        }
      }

      // 4. Matching subsidiário pelo número (celular)
      let matchedInstance = null;
      if (celular && celular.length >= 10) {
        matchedInstance = instances.find((i: any) => {
          if (!i.owner) return false;
          const cleanOwner = i.owner.replace(/\D/g, '');
          return cleanOwner === celular || cleanOwner === `55${celular}` || `55${cleanOwner}` === celular;
        });
      }

      // Se achou pelo número, é a instância dele
      if (matchedInstance) {
        return { success: true, instanceName: matchedInstance.name, state: matchedInstance.status, instanceData: matchedInstance };
      } else {
        // Se não achou, usar nome fallback (ou o manual se existia mas não estava no /instance/all)
        return { success: true, instanceName: manualInstanceId || cleanName, state: 'close', instanceData: null };
      }
    } catch (e: any) {
      console.error('Erro ao mapear instância Uazapi:', e.stack);
      return { success: false, error: e.stack || e.message };
    }
  }

  // --- Endpoints Admin para Gestão de WhatsApp ---
  app.get('/api/admin/whatsapp/instances', requireAuth, requireAdmin, async (req, res) => {
    try {
      const fetchReq = await axios.get(`${UAZAPI_URL}/instance/all`, {
        headers: { admintoken: UAZAPI_ADMIN_TOKEN }
      });
      res.json(fetchReq.data || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/whatsapp/assign-instance', requireAuth, requireAdmin, async (req, res) => {
    const { lojistaId, instanceName } = req.body;
    if (!lojistaId) return res.status(400).json({ error: 'Faltando lojistaId' });
    try {
      await externalQuery(
        'UPDATE config_robo SET instance_id = $1 WHERE lojista_id = $2',
        [instanceName, lojistaId]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/whatsapp/create-instance', requireAuth, requireAdmin, async (req: any, res: any) => {
    const { instanceName } = req.body;
    if (!instanceName) return res.status(400).json({ error: 'Faltando instanceName' });
    try {
      const createReq = await axios.post(`${UAZAPI_URL}/instance/init`, {
        name: instanceName
      }, {
        headers: { admintoken: UAZAPI_ADMIN_TOKEN }
      });
      res.json(createReq.data);
    } catch (e: any) {
      console.error('Erro ao criar instância na UazAPI:', e.response?.data || e.message);
      res.status(500).json({ error: e.response?.data?.message || e.message });
    }
  });

  app.post('/api/admin/whatsapp/auto-link-all', requireAuth, requireAdmin, async (req, res) => {
    try {
      // 1. Buscar todas instâncias na UazAPI
      const fetchReq = await axios.get(`${UAZAPI_URL}/instance/all`, {
        headers: { admintoken: UAZAPI_ADMIN_TOKEN }
      });
      const instances = fetchReq.data || [];

      // 2. Buscar todos os lojistas do banco principal
      const lojistasRes = await externalQuery('SELECT id, celular FROM "Clientes" WHERE celular IS NOT NULL AND celular != \'\'');
      const lojistas = lojistasRes.rows;

      let linkedCount = 0;
      const results = [];

      // 3. Cruzar dados
      for (const lojista of lojistas) {
        const rawCelular = lojista.celular.replace(/\D/g, '');
        if (rawCelular.length < 10) continue;

        const matched = instances.find((i: any) => {
          if (!i.owner) return false;
          const cleanOwner = i.owner.replace(/\D/g, '');
          return cleanOwner === rawCelular || cleanOwner === `55${rawCelular}` || `55${cleanOwner}` === rawCelular;
        });

        if (matched) {
          // Salvar vínculo na config_robo
          await externalQuery(
            'INSERT INTO config_robo (lojista_id, instance_id) VALUES ($1, $2) ON CONFLICT (lojista_id) DO UPDATE SET instance_id = EXCLUDED.instance_id',
            [String(lojista.id), matched.name]
          );
          linkedCount++;
          results.push({ lojistaId: lojista.id, instance: matched.name });
        }
      }

      res.json({ success: true, linkedCount, results });
    } catch (e: any) {
      console.error('Erro no auto-link:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ─── Backup System Endpoints ────────────────────────────────────────────────

  async function uploadToDrive(filePath: string, fileName: string) {
    const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
    if (configRes.rows.length === 0) throw new Error('Google Drive não configurado.');

    const config = configRes.rows[0].value;
    let auth: any;

    if (config.method === 'oauth2') {
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      oauth2Client.setCredentials({ refresh_token: config.refreshToken });
      auth = oauth2Client;
    } else {
      auth = new google.auth.GoogleAuth({
        credentials: config.serviceAccountJson,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
    }

    const drive = google.drive({ version: 'v3', auth });
    const fileMetadata = {
      name: fileName,
      parents: [config.folderId]
    };
    const media = {
      mimeType: fileName.endsWith('.zip') ? 'application/zip' : 'application/json',
      body: fs.createReadStream(filePath)
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
      supportsAllDrives: true
    } as any);
    return file.data.id;
  }

  app.get('/api/admin/backup/drive/config', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      res.json({ config: result.rows[0]?.value || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/backup/drive/config', requireAuth, requireAdmin, async (req, res) => {
    const { method, serviceAccountJson, clientId, clientSecret, folderId } = req.body;
    try {
      const existing = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      const currentConfig = existing.rows[0]?.value || {};

      const newConfig = {
        ...currentConfig,
        method: method || 'service_account',
        serviceAccountJson,
        clientId,
        clientSecret,
        folderId
      };

      await externalQuery(
        "INSERT INTO system_config (key, value) VALUES ('google_drive', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [JSON.stringify(newConfig)]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/backup/drive/auth-url', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      const config = configRes.rows[0]?.value;
      if (!config || !config.clientId || !config.clientSecret) {
        return res.status(400).json({ error: 'Configure Client ID e Secret primeiro.' });
      }

      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.file'],
        prompt: 'consent'
      });
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/backup/drive/exchange-code', requireAuth, requireAdmin, async (req, res) => {
    const { code } = req.body;
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      const config = configRes.rows[0]?.value;

      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        'urn:ietf:wg:oauth:2.0:oob'
      );

      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        throw new Error('Não recebi o Refresh Token. Tente revogar o acesso no Google e autorizar de novo.');
      }

      const updatedConfig = { ...config, refreshToken: tokens.refresh_token };
      await externalQuery("UPDATE system_config SET value = $1 WHERE key = 'google_drive'", [JSON.stringify(updatedConfig)]);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.get('/api/admin/backup/drive/list', requireAuth, requireAdmin, async (req, res) => {
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      const config = configRes.rows[0]?.value;
      if (!config || !config.folderId) return res.status(400).json({ error: 'Google Drive não configurado.' });

      let auth: any;
      if (config.method === 'oauth2') {
        const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
        oauth2Client.setCredentials({ refresh_token: config.refreshToken });
        auth = oauth2Client;
      } else {
        auth = new google.auth.GoogleAuth({ credentials: config.serviceAccountJson, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
      }

      const drive = google.drive({ version: 'v3', auth });
      const response = await drive.files.list({
        q: `'${config.folderId}' in parents and trashed = false`,
        fields: 'files(id, name, createdTime, size, mimeType)',
        orderBy: 'createdTime desc',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      res.json({ files: response.data.files });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/backup/drive/restore/:fileId', requireAuth, requireAdmin, async (req, res) => {
    const { fileId } = req.params;
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'google_drive'");
      const config = configRes.rows[0]?.value;
      
      let auth: any;
      if (config.method === 'oauth2') {
        const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
        oauth2Client.setCredentials({ refresh_token: config.refreshToken });
        auth = oauth2Client;
      } else {
        auth = new google.auth.GoogleAuth({ credentials: config.serviceAccountJson, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
      }

      const drive = google.drive({ version: 'v3', auth });
      const fileMeta = await drive.files.get({ fileId, fields: 'name', supportsAllDrives: true });
      const fileName = fileMeta.data.name || 'backup_download';
      
      const tmpPath = pathModule.join(process.cwd(), `restore_${Date.now()}_${fileName}`);
      const dest = fs.createWriteStream(tmpPath);
      
      const response = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );

      await new Promise((resolve, reject) => {
        response.data
          .on('end', () => resolve(true))
          .on('error', (err: any) => reject(err))
          .pipe(dest);
      });

      // Lógica de Restauração baseada no tipo de arquivo
      if (fileName.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
        const tables = Object.keys(data);
        for (const table of tables) {
          await externalQuery(`DELETE FROM "${table}"`);
          const rows = data[table];
          if (rows.length > 0) {
            const columns = Object.keys(rows[0]).map(c => `"${c}"`).join(', ');
            for (const row of rows) {
              const values = Object.values(row);
              const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
              await externalQuery(`INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`, values);
            }
          }
        }
        fs.unlinkSync(tmpPath);
        res.json({ success: true, message: 'Banco de dados restaurado com sucesso!' });
      } else if (fileName.endsWith('.zip')) {
        // Apenas salva o arquivo ZIP na pasta raiz para o usuário tratar manualmente ou implementar extração
        const finalPath = pathModule.join(process.cwd(), fileName);
        fs.copyFileSync(tmpPath, finalPath);
        fs.unlinkSync(tmpPath);
        res.json({ success: true, message: `Arquivo baixado como ${fileName}. A extração automática de ZIP requer intervenção manual do admin por segurança.` });
      } else {
        fs.unlinkSync(tmpPath);
        res.status(400).json({ error: 'Formato de arquivo não suportado para restauração automática.' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });


  app.post('/api/admin/backup/export-db', requireAuth, requireAdmin, async (req, res) => {
    try {
      const tables = ['Clientes', 'config_robo', 'lojista_workflows'];
      const backupData: any = {};

      for (const table of tables) {
        const result = await externalQuery(`SELECT * FROM "${table}"`);
        backupData[table] = result.rows;
      }

      const backupStr = JSON.stringify(backupData, null, 2);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="database_backup_${Date.now()}.json"`);
      res.send(backupStr);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/backup/export-files', requireAuth, requireAdmin, async (req, res) => {
    try {
      const zip = new AdmZip();

      // Adicionar arquivos importantes
      const filesToInclude = ['server.ts', 'package.json', 'vite.config.ts', 'tsconfig.json'];
      filesToInclude.forEach(f => {
        if (fs.existsSync(f)) zip.addLocalFile(f);
      });

      // Adicionar pastas (exceto node_modules e dist)
      const dirsToInclude = ['src', 'public'];
      dirsToInclude.forEach(d => {
        if (fs.existsSync(d)) zip.addLocalFolder(d, d);
      });

      const buffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="system_backup_${Date.now()}.zip"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/backup/drive/sync', requireAuth, requireAdmin, async (req, res) => {
    const tmpFile = pathModule.join(process.cwd(), `backup_temp_${Date.now()}.zip`);
    try {
      const zip = new AdmZip();

      // 1. Banco de Dados
      const tables = ['Clientes', 'config_robo', 'lojista_workflows'];
      const backupData: any = {};
      for (const table of tables) {
        const result = await externalQuery(`SELECT * FROM "${table}"`);
        backupData[table] = result.rows;
      }
      zip.addFile('database.json', Buffer.from(JSON.stringify(backupData, null, 2)));

      // 2. Arquivos do Sistema
      const filesToInclude = ['server.ts', 'package.json', '.env'];
      filesToInclude.forEach(f => { if (fs.existsSync(f)) zip.addLocalFile(f); });
      if (fs.existsSync('src')) zip.addLocalFolder('src', 'src');

      zip.writeZip(tmpFile);

      // 3. Upload para Drive
      const fileName = `backup_auto_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
      const fileId = await uploadToDrive(tmpFile, fileName);

      res.json({ success: true, fileId });
    } catch (e: any) {
      console.error('Erro na sincronização:', e.message);
      res.status(500).json({ error: e.message });
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  app.get('/api/whatsapp/status', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? req.query.lojistaId : req.user.id;

      const guaranteed = await ensureUazapiInstance(targetId);
      if (!guaranteed.success) return res.status(500).json({ error: guaranteed.error });

      // O state já vem preenchido diretamente do cache `/instance/all`!
      const state = guaranteed.state || 'close';
      const data = guaranteed.instanceData || {};

      return res.json({
        status: state,
        name: guaranteed.instanceName,
        number: data.owner || '',
        profilePic: data.profilePictureUrl || data.profilePicUrl || ''
      });
    } catch (e: any) {
      console.error('Erro ao buscar status Uazapi:', e.response?.data || e.message);
      return res.status(500).json({ status: 'error', message: 'Serviço temporariamente indisponível.' });
    }
  });

  app.get('/api/whatsapp/connect', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? req.query.lojistaId : req.user.id;
      const guaranteed = await ensureUazapiInstance(targetId);
      if (!guaranteed.success) return res.status(500).json({ error: guaranteed.error });

      let activeName = guaranteed.instanceName;
      let activeToken = guaranteed.instanceData?.token;

      // 1. Se a instância não existe na Uazapi (novo lojista), criamos ela agora.
      if (!guaranteed.instanceData) {
        try {
          const createReq = await axios.post(`${UAZAPI_URL}/instance/create`, {
            name: activeName
          }, {
            headers: { admintoken: UAZAPI_ADMIN_TOKEN }
          });

          if (!createReq.data?.instance?.token) {
            throw new Error("Token não retornado pela Uazapi na criação");
          }
          activeToken = createReq.data.instance.token;

          // SALVA NO BANCO O VÍNCULO PARA NÃO PERDER
          try {
            const checkRobo = await query('SELECT lojista_id FROM config_robo WHERE lojista_id = $1', [targetId]);
            if (checkRobo.rows.length > 0) {
              await query('UPDATE config_robo SET instance_id = $1 WHERE lojista_id = $2', [activeName, targetId]);
            } else {
              await query('INSERT INTO config_robo (lojista_id, instance_id) VALUES ($1, $2)', [targetId, activeName]);
            }
          } catch (err: any) {
             console.error("Erro ao salvar config_robo auto:", err.message);
          }
        } catch (err: any) {
          console.error("Erro ao tentar criar nova instância na Uazapi:", err.response?.data || err.message);
          throw new Error("Não foi possível criar a instância no servidor WhatsApp.");
        }
      }

      // 2. Dispara a geração de QR Code via POST /instance/connect passando o TOKEN da instância
      try {
        await axios.post(`${UAZAPI_URL}/instance/connect`, {
          name: activeName
        }, {
          headers: { token: activeToken },
          timeout: 10000
        });
      } catch (err: any) {
        console.error("Erro ao disparar connect na Uazapi:", err.response?.data || err.message);
        // Não jogamos erro aqui, pois às vezes o connect já está em curso e retorna 400, mas o QR ainda não apareceu em /instance/all
      }

      // 3 & 4. Busca em /instance/all com RETRY para pegar o Base64 gerado
      let base64Qr = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          console.log(`Buscando QR Code na Uazapi (tentativa ${attempt}/10) para ${activeName}...`);
          const allReq = await axios.get(`${UAZAPI_URL}/instance/all`, {
            headers: { admintoken: UAZAPI_ADMIN_TOKEN },
            timeout: 5000
          });
          const freshInstance = (allReq.data || []).find((i: any) => i.name === activeName);
          base64Qr = freshInstance?.qrcode || null;

          if (base64Qr) {
            console.log(`QR Code obtido com sucesso na tentativa ${attempt}!`);
            break;
          }
        } catch (err: any) {
          console.error(`Erro ao buscar QR code na tentativa ${attempt}:`, err.message);
        }
        // Aguarda 1s entre tentativas
        await new Promise(r => setTimeout(r, 1000));
      }

      if (base64Qr) {
        return res.json({ qrCode: base64Qr });
      }

      return res.status(400).json({ error: 'Nenhum QR Code retornado pela API (pode já estar conectado ou aguardando init).' });
    } catch (e: any) {
      console.error('Erro ao gerar QR Code Uazapi:', e.response?.data || e.message);
      return res.status(500).json({ error: 'Erro de comunicação ao gerar conexão.' });
    }
  });

  app.delete('/api/whatsapp/disconnect', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? req.query.lojistaId : req.user.id;
      const guaranteed = await ensureUazapiInstance(targetId);
      if (!guaranteed.success || !guaranteed.instanceData) {
        return res.status(404).json({ error: 'Nenhuma instância encontrada para desconectar.' });
      }

      await axios.post(`${UAZAPI_URL}/instance/disconnect`, {
        name: guaranteed.instanceName
      }, {
        headers: { token: guaranteed.instanceData.token }
      });

      return res.json({ success: true });
    } catch (e: any) {
      console.error('Erro ao desconectar Uazapi:', e.response?.data || e.message);
      return res.status(500).json({ error: 'Falha ao desconectar instância.' });
    }
  });


  // ─── ADMIN & PUBLIC ROUTES ──────────────────────────────────────────────────

  app.get('/api/public/login-config', async (_req, res) => {
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'login_config'");
      if (configRes.rows && configRes.rows.length > 0 && configRes.rows[0].value) {
        const row = typeof configRes.rows[0].value === 'string' ? JSON.parse(configRes.rows[0].value) : configRes.rows[0].value;
        let jsonConfig = {};
        if (row.jsonConfig) {
          try { jsonConfig = JSON.parse(row.jsonConfig); } catch(e){}
        }
        return res.json({
          urlLogo: row.urlLogo || '',
          titulo: row.titulo || 'Cardápio Click Bot',
          corFundo: row.corFundo || '#0B0F19',
          ...jsonConfig
        });
      }
      res.json({ urlLogo: '', titulo: 'Cardápio Click Bot', corFundo: '#0B0F19' });
    } catch (e: any) {
      console.error('Erro ao buscar config de login:', e.message);
      res.json({ urlLogo: '', titulo: 'n8n Controller', corFundo: '#0B0F19' });
    }
  });

  app.get('/manifest.json', async (_req, res) => {
    try {
      const configRes = await externalQuery("SELECT value FROM system_config WHERE key = 'login_config'");
      let urlLogo = '/vite.svg';
      let titulo = 'Cardápio Click Bot';

      if (configRes.rows && configRes.rows.length > 0 && configRes.rows[0].value) {
        const row = typeof configRes.rows[0].value === 'string' ? JSON.parse(configRes.rows[0].value) : configRes.rows[0].value;
        if (row.urlLogo) {
          urlLogo = row.urlLogo;
        }
        if (row.titulo) {
          titulo = row.titulo;
        }
      }

      res.json({
        "name": titulo,
        "short_name": titulo,
        "description": "Plataforma de Automação para Lojistas",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0B0F19",
        "theme_color": "#6366f1",
        "icons": [
          {
            "src": urlLogo,
            "sizes": "192x192",
            "type": urlLogo.endsWith('.svg') ? "image/svg+xml" : "image/png",
            "purpose": "any maskable"
          },
          {
            "src": urlLogo,
            "sizes": "512x512",
            "type": urlLogo.endsWith('.svg') ? "image/svg+xml" : "image/png",
            "purpose": "any maskable"
          }
        ]
      });
    } catch (e: any) {
      res.json({
        "name": "Cardápio Click Bot",
        "short_name": "Cardápio Bot",
        "start_url": "/",
        "display": "standalone",
        "icons": [{ "src": "/vite.svg", "sizes": "512x512", "type": "image/svg+xml" }]
      });
    }
  });

  // Configuração de upload para o sistema (maior e aceita .zip/.js/.cjs)
  const updateUpload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (['.js', '.cjs', '.zip'].includes(ext)) cb(null, true);
      else cb(new Error('Apenas arquivos .js, .cjs ou .zip são permitidos.'));
    }
  });

  app.post('/api/admin/system/update', requireAuth, requireAdmin, (req: any, res: any) => {
    updateUpload.single('file')(req, res, async (err: any) => {
      if (err) {
        logToFile(`[UPDATE] Erro no upload: ${err.message}`);
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'O arquivo deve ter no máximo 50MB.' });
        return res.status(500).json({ error: 'Erro no upload' });
      }
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

      const filePath = req.file.path;
      const fileName = req.file.originalname.toLowerCase();
      const rootDir = process.cwd();

      logToFile(`[UPDATE] Iniciando processamento do arquivo: ${fileName}`);

      try {
        if (fileName.endsWith('.js') || fileName.endsWith('.cjs')) {
          const isCjs = fileName.endsWith('.cjs');
          const finalName = isCjs ? 'server-js-dist.cjs' : 'server-js-dist.js';
          const targetPath = pathModule.join(rootDir, finalName);
          const tempTarget = targetPath + '.tmp';

          logToFile(`[UPDATE] Atualizando servidor: ${finalName}`);
          fs.copyFileSync(filePath, tempTarget);
          try { fs.chmodSync(tempTarget, 0o755); } catch (e) { }
          fs.renameSync(tempTarget, targetPath);

          // Tenta tocar nos possíveis arquivos de entrada para forçar restart na Hostinger
          const restartFiles = ['server.js', 'app.js', 'server.cjs', 'server.ts'];
          restartFiles.forEach(f => {
            try {
              const p = pathModule.join(rootDir, f);
              if (fs.existsSync(p)) {
                const now = new Date();
                fs.utimesSync(p, now, now);
                logToFile(`[UPDATE] Touched restart file: ${f}`);
              }
            } catch (e) { }
          });

          // Hostinger Passenger Restart (Restart.txt)
          try {
            const tmpDir = pathModule.join(rootDir, 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            fs.writeFileSync(pathModule.join(tmpDir, 'restart.txt'), String(Date.now()));
            logToFile(`[UPDATE] Criado tmp/restart.txt para Passenger`);
          } catch (e) { }

          fs.unlinkSync(filePath);
          return res.json({ success: true, message: `Servidor atualizado (${fileName}). O sistema deve reiniciar automaticamente.` });

        } else if (fileName.endsWith('.zip')) {
          logToFile(`[UPDATE] Extraindo ZIP do frontend...`);
          const zip = new AdmZip(filePath);
          const distPath = pathModule.join(rootDir, 'dist');
          const tempExtractPath = pathModule.join(rootDir, 'dist_new_' + Date.now());
          const backupPath = pathModule.join(rootDir, 'dist_old_' + Date.now());

          if (!fs.existsSync(tempExtractPath)) fs.mkdirSync(tempExtractPath, { recursive: true });
          zip.extractAllTo(tempExtractPath, true);

          // Verifica se o ZIP contém uma pasta 'dist' dentro ou se são os arquivos direto
          const zipEntries = fs.readdirSync(tempExtractPath);
          const hasInnerDist = zipEntries.length === 1 && zipEntries[0] === 'dist';
          const sourcePath = hasInnerDist ? pathModule.join(tempExtractPath, 'dist') : tempExtractPath;

          logToFile(`[UPDATE] Aplicando swap atômico da pasta dist...`);
          
          // Swap atômico para evitar site quebrado durante a cópia lenta
          if (fs.existsSync(distPath)) {
            fs.renameSync(distPath, backupPath);
          }
          
          try {
            fs.renameSync(sourcePath, distPath);
            logToFile(`[UPDATE] Pasta dist atualizada com sucesso.`);
          } catch (copyErr: any) {
            logToFile(`[UPDATE] Erro no rename da dist: ${copyErr.message}. Tentando restaurar backup...`);
            if (fs.existsSync(backupPath)) fs.renameSync(backupPath, distPath);
            throw copyErr;
          }

          // Limpeza assíncrona/segura
          const safeCleanup = (p: string) => {
            try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch(e){}
          };
          
          safeCleanup(tempExtractPath);
          safeCleanup(backupPath);
          fs.unlinkSync(filePath);

          return res.json({ success: true, message: 'Interface do sistema atualizada com sucesso!' });
        } else {
          fs.unlinkSync(filePath);
          return res.status(400).json({ error: 'Formato não suportado. Use .js/.cjs (servidor) ou .zip (dist).' });
        }
      } catch (e: any) {
        logToFile(`[UPDATE] ERRO CRÍTICO: ${e.message}`);
        console.error('Erro na atualização:', e);
        res.status(500).json({ error: 'Erro ao processar: ' + e.message });
      }
    });
  });

  app.post('/api/admin/login-config', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { urlLogo, titulo, corFundo, ...jsonConfig } = req.body;
    try {
      const payload = {
        urlLogo: urlLogo || '',
        titulo: titulo || '',
        corFundo: corFundo || '',
        jsonConfig: Object.keys(jsonConfig).length > 0 ? JSON.stringify(jsonConfig) : ''
      };

      await externalQuery(`
        INSERT INTO system_config (key, value)
        VALUES ('login_config', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [JSON.stringify(payload)]);

      res.json({ success: true });
    } catch (e: any) {
      console.error('Erro ao salvar config de login no Postgres:', e.message);
      res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
  });

  app.get('/api/admin/lojistas', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      // Provisionamento já ocorre em background no startup e no cron, não precisa atrasar a requisição
      provisionShops().catch(e => console.error('Erro no provisionShops background:', e.message));
      // 2. Busca lista limpa
      const result = await externalQuery('SELECT id, "nome-estabelecimento" as nome, "id-loja" as "idLoja", "cod-cliente" as "codCliente" FROM "Clientes" ORDER BY id ASC');
      res.json(result.rows);
    } catch (e: any) {
      console.error('Erro ao buscar lojistas:', e.message);
      res.status(500).json({ error: 'Erro ao buscar lojistas' });
    }
  });

  // Novos endpoints para Gerenciamento de Vínculos
  app.get('/api/admin/workflows-all', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const fetchWfs = async (inst: string) => {
        const client = await getClient(inst);
        if (!client) return [];
        const resp = await client.get("/workflows?limit=250");
        const list = Array.isArray(resp.data) ? resp.data : (resp.data.data || []);

        // Busca a baseUrl e webhookUrl real para este instanceId
        let baseUrl = '';
        let webhookBaseUrl = '';
        if (isDbReady()) {
          const resInst = await query('SELECT base_url, webhook_url FROM instances WHERE id = $1', [inst]);
          if (resInst.rows.length > 0) {
            baseUrl = resInst.rows[0].base_url;
            webhookBaseUrl = resInst.rows[0].webhook_url || baseUrl;
          }
        }
        if (!baseUrl) {
          baseUrl = memoryInstances[inst]?.baseUrl || '';
          webhookBaseUrl = baseUrl;
        }

        return list.map((w: any) => ({
          ...w,
          instanceId: inst,
          instanceUrl: baseUrl,
          webhookBaseUrl: webhookBaseUrl
        }));
      };
      const [w1, w2] = await Promise.all([fetchWfs('1'), fetchWfs('2')]);
      res.json([...w1, ...w2]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/assign-workflow', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { lojistaId, workflowId, instanceId, webhookUrl, workflowName } = req.body;
    if (!lojistaId || !workflowId || !instanceId) {
      return res.status(400).json({ error: 'Lojista, Fluxo e Instância são obrigatórios' });
    }

    try {
      // Também salva na config_robo para compatibilidade legada por enquanto
      await externalQuery(`
        INSERT INTO config_robo (lojista_id, workflow_id, instance_id, webhook_url, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (lojista_id) DO UPDATE SET
          workflow_id = EXCLUDED.workflow_id,
          instance_id = EXCLUDED.instance_id,
          webhook_url = EXCLUDED.webhook_url,
          updated_at = NOW()
      `, [String(lojistaId), workflowId, instanceId, webhookUrl || '']);

      // Salva na nova tabela de múltiplos fluxos
      await externalQuery(`
        INSERT INTO lojista_workflows (lojista_id, workflow_id, instance_id, webhook_url, workflow_name)
        VALUES ($1, $2, $3, $4, $5)
      `, [String(lojistaId), workflowId, instanceId, webhookUrl || '', workflowName || 'Fluxo sem nome']);

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/lojista-workflows/:lojistaId', requireAuth, async (req: any, res) => {
    try {
      const { lojistaId } = req.params;
      const result = await externalQuery(`SELECT * FROM lojista_workflows WHERE lojista_id = '${Number(lojistaId)}' ORDER BY created_at DESC`);

      // Mapeia os fluxos para incluir a URL de manutenção
      const workflows = await Promise.all(result.rows.map(async (row: any) => {
        // Tenta descobrir a webhook_url e base_url da instância
        let baseUrl = '';
        let webhookBaseUrl = '';
        if (isDbReady()) {
          const resInst = await query('SELECT base_url, webhook_url FROM instances WHERE id = $1', [row.instance_id]);
          if (resInst.rows.length > 0) {
            baseUrl = resInst.rows[0].base_url;
            webhookBaseUrl = resInst.rows[0].webhook_url || baseUrl;
          }
        }
        if (!baseUrl) {
          baseUrl = memoryInstances[row.instance_id]?.baseUrl || '';
          webhookBaseUrl = baseUrl;
        }

        let webhookUrl = row.webhook_url;
        if (webhookUrl && !webhookUrl.startsWith('http') && webhookBaseUrl) {
          const cleanBase = webhookBaseUrl.endsWith('/') ? webhookBaseUrl.slice(0, -1) : webhookBaseUrl;
          const cleanPath = webhookUrl.startsWith('/') ? webhookUrl.slice(1) : webhookUrl;
          webhookUrl = `${cleanBase}/webhook/${cleanPath}`;
        }

        return {
          ...row,
          webhook_url: webhookUrl,
          maintenanceUrl: baseUrl ? `${baseUrl}/workflow/${row.workflow_id}` : ''
        };
      }));

      res.json(workflows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/lojista/workflows', requireAuth, async (req: any, res) => {
    try {
      const lojistaId = req.user.id;
      const result = await externalQuery(`SELECT * FROM lojista_workflows WHERE lojista_id = '${Number(lojistaId)}' ORDER BY created_at DESC`);

      const workflows = await Promise.all(result.rows.map(async (row: any) => {
        // Tenta descobrir a webhook_url e base_url da instância
        let baseUrl = '';
        let webhookBaseUrl = '';
        if (isDbReady()) {
          const resInst = await query('SELECT base_url, webhook_url FROM instances WHERE id = $1', [row.instance_id]);
          if (resInst.rows.length > 0) {
            baseUrl = resInst.rows[0].base_url;
            webhookBaseUrl = resInst.rows[0].webhook_url || baseUrl;
          }
        }
        if (!baseUrl) {
          baseUrl = memoryInstances[row.instance_id]?.baseUrl || '';
          webhookBaseUrl = baseUrl;
        }

        let webhookUrl = row.webhook_url;
        if (webhookUrl && !webhookUrl.startsWith('http') && webhookBaseUrl) {
          const cleanBase = webhookBaseUrl.endsWith('/') ? webhookBaseUrl.slice(0, -1) : webhookBaseUrl;
          const cleanPath = webhookUrl.startsWith('/') ? webhookUrl.slice(1) : webhookUrl;
          webhookUrl = `${cleanBase}/webhook/${cleanPath}`;
        }

        return {
          ...row,
          webhook_url: webhookUrl,
          maintenanceUrl: baseUrl ? `${baseUrl}/workflow/${row.workflow_id}` : ''
        };
      }));

      res.json(workflows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/admin/lojista-workflows/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const lojistaId = req.user.id;
      const role = req.user.role;

      // Se for admin, deleta direto. Se for lojista, verifica se o fluxo pertence a ele.
      if (role === 'admin') {
        await externalQuery('DELETE FROM lojista_workflows WHERE id = $1', [id]);
      } else {
        await externalQuery('DELETE FROM lojista_workflows WHERE id = $1 AND lojista_id = $2', [id, String(lojistaId)]);
      }

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── HELPER: n8n Client ───────────────────────────────────────────────────────

  const getClient = async (instanceId: string) => {
    let config;
    if (isDbReady()) {
      try {
        const res = await query('SELECT base_url, api_key FROM instances WHERE id = $1', [instanceId]);
        if (res.rows.length > 0) config = { baseUrl: res.rows[0].base_url, apiKey: res.rows[0].api_key };
      } catch (e) { console.error("DB Query failed", e); }
    }
    if (!config) config = memoryInstances[instanceId];
    if (!config || !config.baseUrl || !config.apiKey) return null;
    const baseURL = config.baseUrl.endsWith('/api/v1') ? config.baseUrl : `${config.baseUrl.replace(/\/$/, '')}/api/v1`;
    return axios.create({ baseURL, headers: { "X-N8N-API-KEY": config.apiKey }, timeout: 8000 });
  };

  // ─── API ROUTES (protegidas) ──────────────────────────────────────────────────

  app.get("/api/config", requireAuth, async (_req, res) => {
    try {
      if (isDbReady()) {
        const result = await query('SELECT * FROM instances');
        const config: Record<string, any> = {};
        result.rows.forEach(row => {
          let templates = row.templates || {};
          if (typeof templates === 'string') { try { templates = JSON.parse(templates); } catch (e) { templates = {}; } }
          if (Array.isArray(templates)) {
             templates = {}; // Corrige o bug do array vazio
          }

          console.log(`[CONFIG DBG] Instance ${row.id} parsed templates:`, JSON.stringify(templates, null, 2));

          config[row.id] = {
            name: row.id === '1' ? 'Robô Delivery' : 'Robô de Status',
            baseUrl: row.base_url,
            webhookUrl: row.webhook_url || '',
            hasApiKey: !!row.api_key,
            templates
          };
        });
        return res.json({ ...config, _dbConnected: true });
      }
    } catch (e) { console.error("Config fetch error", e); }
    res.json({ '1': { ...memoryInstances['1'], name: 'Robô Delivery (Memory)' }, '2': { ...memoryInstances['2'], name: 'Robô de Status (Memory)' }, _dbConnected: false });
  });

  // ─── CONFIG SAVE ROUTE ──────────────────────────────────────────────────────

  app.post("/api/config", requireAuth, requireAdmin, async (req, res) => {
    try {
      for (const [id, data] of Object.entries(req.body) as [string, any][]) {
        if (!['1', '2'].includes(id)) continue;
        let templates = data.templates || {};
        if (Array.isArray(templates)) templates = {};
        memoryInstances[id] = {
          ...memoryInstances[id],
          baseUrl: data.baseUrl,
          apiKey: data.apiKey || memoryInstances[id]?.apiKey || '',
          webhookUrl: data.webhookUrl || null,
          templates
        };
      }
    } catch (e) {
      console.error('[CONFIG SAVE] Erro ao atualizar memória:', e);
    }

    if (isDbReady()) {
      try {
        for (const [id, data] of Object.entries(req.body) as [string, any][]) {
          if (!['1', '2'].includes(id)) continue;
          let templates = data.templates || {};
          if (Array.isArray(templates)) templates = {};
          await query(
            `INSERT INTO instances (id, base_url, api_key, templates, webhook_url)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               base_url = EXCLUDED.base_url,
               api_key = CASE WHEN EXCLUDED.api_key IS NULL OR EXCLUDED.api_key = '' THEN instances.api_key ELSE EXCLUDED.api_key END,
               templates = EXCLUDED.templates,
               webhook_url = EXCLUDED.webhook_url`,
            [id, data.baseUrl, data.apiKey || null, JSON.stringify(templates), data.webhookUrl || null]
          );
        }
        return res.json({ success: true });
      } catch (e: any) { return res.status(500).json({ error: "DB Save failed: " + e.message }); }
    }
    res.json({ success: true, warning: "Memory only" });
  });

  app.get("/api/:instance/projects", requireAuth, async (req, res) => {
    const client = await getClient(req.params.instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      const response = await client.get("/projects");
      const data = response.data;
      const projects = Array.isArray(data) ? data : (data.data || []);
      res.json({ data: projects });
    } catch (e: any) {
      res.json({ data: [] });
    }
  });

  app.get("/api/:instance/workflows", requireAuth, async (req, res) => {
    const client = await getClient(req.params.instance);
    if (!client) return res.json({ data: [], projects: [], error: "Config missing" });
    try {
      let projects: any[] = [];
      try {
        const projResp = await client.get("/projects");
        const projData = projResp.data;
        projects = Array.isArray(projData) ? projData : (projData.data || []);
      } catch (_) { }

      const fetchAllFromScope = async (projectId?: string) => {
        let results: any[] = [];
        let cursor: string | undefined = undefined;
        do {
          const params: any = { limit: 100 };
          if (cursor) params.cursor = cursor;
          if (projectId) params.projectId = projectId;
          const resp = await client.get("/workflows", { params });
          const d = resp.data;
          const items = Array.isArray(d) ? d : (d.data || []);
          items.forEach((w: any) => {
            if (projectId && !w.projectId) w.__projectId = projectId;
          });
          results = results.concat(items);
          cursor = d.nextCursor || null;
        } while (cursor);
        return results;
      };

      let allWorkflows: any[] = [];

      if (projects.length > 0) {
        const perProject = await Promise.all(
          projects.map(p => fetchAllFromScope(p.id).then(wfs =>
            wfs.map((w: any) => ({ ...w, __projectId: p.id, __projectName: p.name }))
          ))
        );
        const personal = await fetchAllFromScope();
        const seen = new Set<string>();
        [...personal, ...perProject.flat()].forEach(w => {
          if (!seen.has(w.id)) { seen.add(w.id); allWorkflows.push(w); }
        });
      } else {
        allWorkflows = await fetchAllFromScope();
      }

      res.json({ data: allWorkflows, projects });
    } catch (e: any) { res.status(e.response?.status || 500).json({ error: e.message }); }
  });

  app.get("/api/:instance/workflows/:id", requireAuth, async (req, res) => {
    const client = await getClient(req.params.instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      const response = await client.get(`/workflows/${req.params.id}`);
      res.json(response.data);
    } catch (e: any) { res.status(e.response?.status || 500).json({ error: e.message }); }
  });

  app.put("/api/:instance/workflows/:id", requireAuth, requireAdmin, async (req, res) => {
    const { instance, id } = req.params;
    const client = await getClient(instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      const response = await client.put(`/workflows/${id}`, req.body);
      res.json(response.data);
    } catch (e: any) {
      const errorData = e.response?.data;
      res.status(e.response?.status || 500).json(errorData || { message: e.message });
    }
  });

  app.post("/api/:instance/workflows", requireAuth, requireAdmin, async (req, res) => {
    const { instance } = req.params;
    const client = await getClient(instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      const { name, nodes, connections, settings } = req.body;
      const rawPayload = {
        name: name || "Novo Fluxo",
        nodes: nodes || [],
        connections: connections || {},
        settings: settings || {}
      };
      const payload = strictClean(rawPayload, 'root');
      logToFile(`[ENVIO] Processando "${payload.name}" para n8n.`);
      const response = await client.post("/workflows", payload);
      logToFile(`[SUCESSO] Fluxo criado com ID: ${response.data.id}`);
      res.json(response.data);
    } catch (e: any) {
      const errorData = e.response?.data;
      logToFile(`[ERRO] Falha no n8n: ${JSON.stringify(errorData || e.message)}`);
      res.status(e.response?.status || 500).json(errorData || { message: e.message });
    }
  });

  app.patch("/api/:instance/workflows/:id", requireAuth, async (req, res) => {
    const client = await getClient(req.params.instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      const { active } = req.body;
      try {
        if (active) await client.post(`/workflows/${req.params.id}/activate`, {});
        else await client.post(`/workflows/${req.params.id}/deactivate`, {});
      } catch (err: any) {
        if (err.response?.status === 404) await client.patch(`/workflows/${req.params.id}`, { active });
        else throw err;
      }
      res.json({ id: req.params.id, active, success: true });
    } catch (e: any) { res.status(e.response?.status || 500).json({ error: e.message }); }
  });

  app.delete("/api/:instance/workflows/:id", requireAuth, requireAdmin, async (req, res) => {
    const client = await getClient(req.params.instance);
    if (!client) return res.status(500).json({ error: "Config missing" });
    try {
      await client.delete(`/workflows/${req.params.id}`);
      res.json({ success: true });
    } catch (e: any) { res.status(e.response?.status || 500).json({ error: e.message }); }
  });

  // ─── Auto Backup Scheduler (Daily/Monthly at 3 AM) ────────────────────────
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      const isMonthly = now.getDate() === 1;
      console.log(`Iniciando backup automático ${isMonthly ? 'MENSAL COMPLETO' : 'DIÁRIO LEVE'}...`);
      const tmpFileAuto = pathModule.join(process.cwd(), `backup_auto_${Date.now()}.zip`);

      try {
        const zip = new AdmZip();

        // 1. Banco de Dados
        const tables = ['Clientes', 'config_robo', 'lojista_workflows'];
        const backupData: any = {};
        for (const table of tables) {
          const result = await externalQuery(`SELECT * FROM "${table}"`);
          backupData[table] = result.rows;
        }
        zip.addFile('database.json', Buffer.from(JSON.stringify(backupData, null, 2)));

        // 2. Arquivos (CORE)
        const coreFiles = ['server.ts', 'package.json', '.env'];
        coreFiles.forEach(f => { if (fs.existsSync(f)) zip.addLocalFile(f); });
        if (fs.existsSync('src')) zip.addLocalFolder('src', 'src');

        // 3. Arquivos Extras (Somente no Mensal)
        if (isMonthly) {
          const extraFiles = ['vite.config.ts', 'tsconfig.json', 'index.html', 'server-js-dist.cjs'];
          extraFiles.forEach(f => { if (fs.existsSync(f)) zip.addLocalFile(f); });
          if (fs.existsSync('public')) zip.addLocalFolder('public', 'public');
          if (fs.existsSync('dist')) zip.addLocalFolder('dist', 'dist');
        }

        zip.writeZip(tmpFileAuto);

        const type = isMonthly ? 'mensal' : 'diario';
        const fileName = `backup_${type}_${now.toISOString().split('T')[0]}.zip`;
        await uploadToDrive(tmpFileAuto, fileName);
        console.log(`Backup ${type} enviado com sucesso: ${fileName}`);
      } catch (e: any) {
        console.error('Falha no backup agendado:', e.message);
      } finally {
        if (fs.existsSync(tmpFileAuto)) fs.unlinkSync(tmpFileAuto);
      }
    }
  }, 60000);

  // ─── YCLOUD DISPARO EM MASSA ───────────────────────────────────────────────

  // Helper: resolve o ID externo para cod-cliente se for admin
  const getLojistaCodeForYCloud = async (req: any): Promise<number | null> => {
    if (req.user.role === 'admin' && req.query.lojistaId) {
      const id = parseInt(req.query.lojistaId as string);
      const res = await externalQuery('SELECT "cod-cliente" FROM "Clientes" WHERE id = $1', [id]);
      return res.rows[0]?.['cod-cliente'] || null;
    }
    return parseInt(req.user.codCliente);
  };

  // Helper: busca tokens e provedor ativo do lojista
  const getProviderAuth = async (req: any) => {
    const codCliente = await getLojistaCodeForYCloud(req);
    if (!codCliente) return null;
    const res = await externalQuery('SELECT "token-ycloud", "token-api-oficial", "phone-id-oficial", "waba-id-oficial", "provedor-disparo" FROM "Clientes" WHERE "cod-cliente" = $1', [codCliente]);
    const row = res.rows[0];
    if (!row) return null;
    
    return {
      lojistaId: codCliente,
      provedor: row['provedor-disparo'] || 'YCLOUD',
      ycToken: row['token-ycloud'] || '',
      metaToken: row['token-api-oficial'] || '',
      metaPhoneId: row['phone-id-oficial'] || '',
      metaWabaId: row['waba-id-oficial'] || ''
    };
  };

  // GET /api/ycloud/phone-numbers — lista números do lojista
  app.get('/api/ycloud/phone-numbers', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Configuração não encontrada.' });
      
      if (auth.provedor === 'META') {
        if (!auth.metaToken || !auth.metaPhoneId) return res.status(400).json({ error: 'Token ou Phone ID Meta não configurados.' });
        // Simula a resposta da YCloud com o único número conhecido da Meta
        return res.json({
          items: [{
            id: auth.metaPhoneId,
            phoneNumber: auth.metaPhoneId,
            displayPhoneNumber: "WhatsApp Oficial",
            verifiedName: "Cloud API",
            wabaId: auth.metaWabaId
          }]
        });
      }

      // YCLOUD
      if (!auth.ycToken) return res.status(400).json({ error: 'Token YCloud não configurado. Configure em Configurações.' });
      const response = await axios.get('https://api.ycloud.com/v2/whatsapp/phoneNumbers', {
        headers: { 'X-API-Key': auth.ycToken }
      });
      res.json(response.data);
    } catch (e: any) {
      res.status(500).json({ error: e.response?.data?.message || e.message });
    }
  });

  // GET /api/ycloud/token — retorna status do token (se existe) e preview mascarado
  app.get('/api/ycloud/token', requireAuth, async (req: any, res) => {
    try {
      const codCliente = await getLojistaCodeForYCloud(req);
      const result = await externalQuery(`SELECT "token-ycloud", "phone-id-oficial", "token-api-oficial", "waba-id-oficial", "provedor-disparo" FROM "Clientes" WHERE "cod-cliente" = $1`, [codCliente]);
      const row = result.rows[0] || {};
      const token = row['token-ycloud'] || '';
      const configured = !!token && token.length > 10;
      const preview = configured ? `${token.substring(0, 8)}${'*'.repeat(12)}${token.slice(-4)}` : '';
      
      const metaToken = row['token-api-oficial'] || '';
      const metaPhoneId = row['phone-id-oficial'] || '';
      const metaWabaId = row['waba-id-oficial'] || '';
      const provedorDisparo = row['provedor-disparo'] || 'YCLOUD';
      
      const metaConfigured = !!metaToken && !!metaPhoneId;
      const metaTokenPreview = metaConfigured ? `${metaToken.substring(0, 8)}${'*'.repeat(12)}${metaToken.slice(-4)}` : '';

      res.json({ 
        configured, preview, 
        metaConfigured, metaTokenPreview, metaPhoneId, metaWabaId,
        provedorDisparo
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/ycloud/token — salva token YCloud do lojista
  app.post('/api/ycloud/token', requireAuth, async (req: any, res) => {
    try {
      const codCliente = await getLojistaCodeForYCloud(req);
      const { token: ycToken, metaToken, metaPhoneId, metaWabaId, provedorDisparo } = req.body;
      
      const updates = [];
      const values = [];
      let i = 1;

      if (ycToken !== undefined) { updates.push(`"token-ycloud" = $${i++}`); values.push(ycToken); }
      if (metaToken !== undefined) { updates.push(`"token-api-oficial" = $${i++}`); values.push(metaToken); }
      if (metaPhoneId !== undefined) { updates.push(`"phone-id-oficial" = $${i++}`); values.push(metaPhoneId); }
      if (metaWabaId !== undefined) { updates.push(`"waba-id-oficial" = $${i++}`); values.push(metaWabaId); }
      if (provedorDisparo !== undefined) { updates.push(`"provedor-disparo" = $${i++}`); values.push(provedorDisparo); }

      if (updates.length > 0) {
        values.push(codCliente);
        await externalQuery(`UPDATE "Clientes" SET ${updates.join(', ')} WHERE "cod-cliente" = $${i}`, values);
      }
      
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: 'Erro ao salvar token' });
    }
  });

  // GET /api/ycloud/timezone — retorna o fuso horário
  app.get('/api/ycloud/timezone', requireAuth, async (req: any, res) => {
    const codCliente = await getLojistaCodeForYCloud(req);
    try {
      const key = `timezone_${codCliente}`;
      const result = await externalQuery(`SELECT value FROM system_config WHERE key = $1`, [key]);
      const timezone = result.rows[0]?.value?.timezone || 'America/Sao_Paulo';
      res.json({ timezone });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ycloud/timezone — salva o fuso horário
  app.post('/api/ycloud/timezone', requireAuth, async (req: any, res) => {
    const codCliente = await getLojistaCodeForYCloud(req);
    const { timezone } = req.body;
    try {
      const key = `timezone_${codCliente}`;
      await externalQuery(
        `INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify({ timezone })]
      );
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/ycloud/webhook-config — retorna o webhook configurado na YCloud
  app.get('/api/ycloud/webhook-config', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.json({ url: '' });
      
      if (auth.provedor === 'META') {
        return res.json({ url: 'Webhook da Meta é configurado no painel da Meta App.', enabledEvents: [], status: 'disabled' });
      }

      const response = await axios.get('https://api.ycloud.com/v2/webhookEndpoints', {
        headers: { 'X-API-Key': auth.ycToken }
      });
      const items = response.data?.items || [];
      const webhook = items[0];
      res.json({ 
        url: webhook ? webhook.url : '', 
        enabledEvents: webhook ? webhook.enabledEvents : [],
        status: webhook ? webhook.status : 'disabled'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ycloud/webhook-config — configura o webhook na YCloud
  app.post('/api/ycloud/webhook-config', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Token não configurado' });
      if (auth.provedor === 'META') return res.status(400).json({ error: 'Webhook da Meta deve ser configurado diretamente no painel de desenvolvedor da Meta.' });
      
      const { url, enabledEvents, status } = req.body;
      if (!url) return res.status(400).json({ error: 'URL obrigatória' });
      
      const response = await axios.get('https://api.ycloud.com/v2/webhookEndpoints', {
        headers: { 'X-API-Key': auth.token }
      });
      const items = response.data?.items || [];
      const webhook = items[0];
      
      const eventsToSave = Array.isArray(enabledEvents) && enabledEvents.length > 0 
                           ? enabledEvents 
                           : ["whatsapp.inbound_message.received", "whatsapp.message.updated"];
      
      const targetStatus = status === 'disabled' ? 'disabled' : 'active';

      if (webhook) {
        await axios.patch(`https://api.ycloud.com/v2/webhookEndpoints/${webhook.id}`, { 
          url, 
          enabledEvents: eventsToSave,
          status: targetStatus
        }, {
          headers: { 'X-API-Key': auth.ycToken, 'Content-Type': 'application/json' }
        });
      } else {
        await axios.post('https://api.ycloud.com/v2/webhookEndpoints', {
          url,
          enabledEvents: eventsToSave,
          status: targetStatus
        }, {
          headers: { 'X-API-Key': auth.ycToken, 'Content-Type': 'application/json' }
        });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.response?.data?.message || err.message });
    }
  });

  // GET /api/ycloud/templates — lista todos os templates do lojista
  app.get('/api/ycloud/templates', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Configuração não encontrada.' });

      if (auth.provedor === 'META') {
        if (!auth.metaToken || !auth.metaWabaId) return res.status(400).json({ error: 'Token ou WABA ID da Meta não configurados.' });
        const response = await axios.get(`https://graph.facebook.com/v19.0/${auth.metaWabaId}/message_templates`, {
          headers: { 'Authorization': `Bearer ${auth.metaToken}` }
        });
        return res.json({ items: response.data?.data || [] });
      }

      if (!auth.ycToken) return res.status(400).json({ error: 'Token YCloud não configurado.' });
      const response = await axios.get('https://api.ycloud.com/v2/whatsapp/templates?pageSize=100', {
        headers: { 'X-API-Key': auth.ycToken }
      });
      res.json(response.data);
    } catch (e: any) {
      res.status(500).json({ error: e.response?.data?.message || e.message });
    }
  });

  // Helper: traduz mensagens de erro do YCloud
  function translateYCloudError(msg: string): string {
    if (!msg) return 'Erro desconhecido ao comunicar com a Meta/YCloud.';
    const lower = msg.toLowerCase();
    
    if (lower.includes('is being deleted')) return 'Um template com esse nome foi excluído recentemente pela Meta. Aguarde 30 dias ou escolha um NOME DIFERENTE para o seu template.';
    if (lower.includes('already exists')) return 'Já existe um template ativo com esse exato nome. Por favor, altere o "Nome do Template".';
    if (lower.includes('invalid parameter')) return 'Parâmetro inválido na requisição. Verifique os dados inseridos.';
    if (lower.includes('must be less than')) return 'O texto inserido excede o limite de caracteres permitido pela Meta.';
    if (lower.includes('language is not supported')) return 'O idioma selecionado não é suportado.';
    if (lower.includes('format is invalid')) return 'O formato do conteúdo é inválido. Verifique se não há pontuações estranhas.';
    if (lower.includes("hasn't bound waba")) return 'Sua conta não tem um número de WhatsApp configurado corretamente.';
    if (lower.includes('variable')) return 'Erro nas variáveis da mensagem. Verifique se foram preenchidas corretamente.';
    if (lower.includes('button')) return 'Erro na configuração do botão. Verifique os campos de texto ou URL/Telefone.';
    
    return `Erro da Meta: ${msg}`;
  }

  // POST /api/ycloud/templates — cria um novo template no YCloud
  app.post('/api/ycloud/templates', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Configuração não encontrada.' });

      const { name, language, category, components } = req.body;
      if (!name || !components) return res.status(400).json({ error: 'Nome e componentes são obrigatórios.' });

      const payload: any = {
        name,
        language: language || 'pt_BR',
        category: category || 'MARKETING',
        components
      };

      if (auth.provedor === 'META') {
        if (!auth.metaToken || !auth.metaWabaId) return res.status(400).json({ error: 'Token ou WABA ID da Meta não configurados.' });
        const response = await axios.post(`https://graph.facebook.com/v19.0/${auth.metaWabaId}/message_templates`, payload, {
          headers: { 'Authorization': `Bearer ${auth.metaToken}`, 'Content-Type': 'application/json' }
        });
        return res.json(response.data);
      }

      if (!auth.ycToken) return res.status(400).json({ error: 'Token YCloud não configurado.' });
      const phoneRes = await axios.get('https://api.ycloud.com/v2/whatsapp/phoneNumbers', {
        headers: { 'X-API-Key': auth.ycToken }
      });
      const phones = phoneRes.data.items || phoneRes.data || [];
      const wabaId = phones.length > 0 ? phones[0].wabaId : undefined;

      if (wabaId) payload.wabaId = wabaId;

      const response = await axios.post('https://api.ycloud.com/v2/whatsapp/templates', payload, {
        headers: { 'X-API-Key': auth.ycToken, 'Content-Type': 'application/json' }
      });
      res.json(response.data);
    } catch (e: any) {
      const errorMsg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      res.status(500).json({ error: translateYCloudError(errorMsg) });
    }
  });

  // GET /api/ycloud/campaigns — lista campanhas do lojista
  app.get('/api/ycloud/campaigns', requireAuth, async (req: any, res) => {
    try {
      const lojistaId = await getLojistaCodeForYCloud(req);
      if (!lojistaId) return res.json([]);
      const result = await externalQuery(
        `SELECT id, nome, template_name, phone_from, scheduled_at, sent_at, status, total, total_sent, total_failed, created_at, error_log FROM mass_campaigns WHERE lojista_id = '${Number(lojistaId)}' ORDER BY created_at DESC LIMIT 50`
      );
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/ycloud/campaigns/:id — cancela agendamento
  app.delete('/api/ycloud/campaigns/:id', requireAuth, async (req: any, res) => {
    try {
      const lojistaId = req.user.role === 'admin' ? null : await getLojistaCodeForYCloud(req);
      const campId = Number(req.params.id);
      if (lojistaId) {
        await externalQuery(`UPDATE mass_campaigns SET status = 'cancelled' WHERE id = ${campId} AND lojista_id = '${lojistaId}' AND status = 'scheduled'`);
      } else {
        await externalQuery(`UPDATE mass_campaigns SET status = 'cancelled' WHERE id = ${campId} AND status = 'scheduled'`);
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Helper: monta components para API YCloud a partir do template e variáveis do destinatário
  function buildComponents(templateComponents: any[], recipientVars: string[]): any[] {
    const result: any[] = [];
    let varIndex = 0;
    for (const comp of templateComponents) {
      if (comp.type === 'HEADER') {
        if (comp.format === 'IMAGE' && comp.imageUrl) {
          result.push({ type: 'header', parameters: [{ type: 'image', image: { link: comp.imageUrl } }] });
        } else if (comp.format === 'VIDEO' && comp.videoUrl) {
          result.push({ type: 'header', parameters: [{ type: 'video', video: { link: comp.videoUrl } }] });
        } else if (comp.format === 'TEXT' && comp.variables?.length) {
          const params = comp.variables.map((_: any) => {
            const val = recipientVars[varIndex++];
            return { type: 'text', text: val ? String(val) : ' ' };
          });
          result.push({ type: 'header', parameters: params });
        }
      } else if (comp.type === 'BODY' && comp.variables?.length) {
        const params = comp.variables.map((_: any) => {
          const val = recipientVars[varIndex++];
          return { type: 'text', text: val ? String(val) : ' ' };
        });
        result.push({ type: 'body', parameters: params });
      } else if (comp.type === 'BUTTONS') {
        comp.buttons?.forEach((btn: any, idx: number) => {
          if (btn.type === 'URL' && btn.url?.includes('{{')) {
            const val = recipientVars[varIndex++];
            result.push({ type: 'button', sub_type: 'url', index: idx, parameters: [{ type: 'text', text: val ? String(val) : ' ' }] });
          }
        });
      }
    }
    return result;
  }

  // POST /api/ycloud/campaigns — cria e dispara ou agenda campanha
  app.post('/api/ycloud/campaigns', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Configuração não encontrada.' });

      const { nome, template_name, template_lang, phone_from, recipients, components, scheduled_at } = req.body;
      if (!nome || !template_name || !phone_from || !recipients?.length) {
        return res.status(400).json({ error: 'Campos obrigatórios: nome, template_name, phone_from, recipients' });
      }

      const lojistaId = String(auth.lojistaId);
      const isScheduled = !!scheduled_at;
      const status = isScheduled ? 'scheduled' : 'sending';

      let finalScheduledAt = null;
      if (isScheduled) {
        // Obter fuso do lojista
        const tzKey = `timezone_${lojistaId}`;
        const tzRes = await externalQuery(`SELECT value FROM system_config WHERE key = '${tzKey}'`);
        const timezone = tzRes.rows[0]?.value?.timezone || 'America/Sao_Paulo';
        
        // Formatar para garantir que seja interpretado corretamente
        const cleanDate = scheduled_at.replace('T', ' ').substring(0, 16);
        const tzConvert = await externalQuery(`SELECT '${cleanDate}'::timestamp AT TIME ZONE '${timezone}' as utc_time`);
        const utcDate = tzConvert.rows[0]?.utc_time;
        finalScheduledAt = utcDate instanceof Date ? utcDate.toISOString() : utcDate;
      }

      const safeNome = nome.replace(/'/g, "''");
      const safeTplName = template_name.replace(/'/g, "''");
      const safeTplLang = (template_lang || 'pt_BR').replace(/'/g, "''");
      const safePhoneFrom = phone_from.replace(/'/g, "''");
      const safeRecipients = JSON.stringify(recipients).replace(/'/g, "''");
      const safeComponents = JSON.stringify(components || []).replace(/'/g, "''");
      const safeScheduled = isScheduled && finalScheduledAt ? `'${String(finalScheduledAt).replace(/'/g, "''")}'` : 'NULL';


      const ins = await externalQuery(
        `INSERT INTO mass_campaigns (lojista_id, nome, template_name, template_lang, phone_from, recipients, components, scheduled_at, status, total)
         VALUES ('${lojistaId}','${safeNome}','${safeTplName}','${safeTplLang}','${safePhoneFrom}','${safeRecipients}','${safeComponents}',${safeScheduled},'${status}',${recipients.length}) RETURNING id`
      );
      const campaignId = ins.rows[0].id;

      if (isScheduled) {
        return res.json({ success: true, campaignId, status: 'scheduled', message: `Campanha agendada para ${scheduled_at}` });
      }

      // Envio imediato em background
      res.json({ success: true, campaignId, status: 'sending', message: 'Disparo iniciado em background' });

      // Background: dispara para cada destinatário
      (async () => {
        let sent = 0; let failed = 0;
        const msgIds: string[] = [];
        const resultsLog: any[] = [];
        for (const recipient of recipients) {
          try {
            if (auth.provedor === 'META') {
              const payload = {
                messaging_product: 'whatsapp',
                to: recipient.phone,
                type: 'template',
                template: {
                  name: template_name,
                  language: { code: template_lang || 'pt_BR' },
                  components: buildComponents(components || [], recipient.vars || [])
                }
              };
              const response = await axios.post(`https://graph.facebook.com/v19.0/${auth.metaPhoneId}/messages`, payload, {
                headers: { 'Authorization': `Bearer ${auth.metaToken}`, 'Content-Type': 'application/json' }
              });
              const msgId = response.data?.messages?.[0]?.id;
              if (msgId) msgIds.push(msgId);
              resultsLog.push({ phone: recipient.phone, status: 'success', id: msgId });
              sent++;
            } else {
              // YCLOUD
              const payload: any = {
                from: phone_from,
                to: recipient.phone,
                type: 'template',
                template: {
                  name: template_name,
                  language: { code: template_lang || 'pt_BR', policy: 'deterministic' },
                  components: buildComponents(components || [], recipient.vars || [])
                }
              };
              const response = await axios.post('https://api.ycloud.com/v2/whatsapp/messages', payload, {
                headers: { 'X-API-Key': auth.ycToken, 'Content-Type': 'application/json' }
              });
              const msgId = response.data?.id;
              if (msgId) msgIds.push(msgId);
              resultsLog.push({ phone: recipient.phone, status: 'success', id: msgId });
              sent++;
            }
          } catch (err: any) {
            const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
            console.error(`[${auth.provedor}] Erro enviando para ${recipient.phone}:`, errorMsg);
            resultsLog.push({ phone: recipient.phone, status: 'failed', error: errorMsg });
            failed++;
          }
          // Rate limiting: 1 msg a cada 100ms
          await new Promise(r => setTimeout(r, 100));
        }
        const safeLog = JSON.stringify(resultsLog).replace(/'/g, "''");
        const safeMsgIds = JSON.stringify(msgIds).replace(/'/g, "''");
        await externalQuery(
          `UPDATE mass_campaigns SET status='done', sent_at=NOW(), total_sent=${sent}, total_failed=${failed}, message_ids='${safeMsgIds}', error_log='${safeLog}' WHERE id=${campaignId}`
        );
        console.log(`[YCLOUD] Campanha ${campaignId} concluída: ${sent} enviados, ${failed} falhas`);
      })();

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // CRON: verifica campanhas agendadas a cada 60 segundos
  setInterval(async () => {
    try {
      const pending = await externalQuery(
        `SELECT mc.*, 
           c."token-ycloud", c."token-api-oficial", c."phone-id-oficial", c."waba-id-oficial", c."provedor-disparo"
         FROM mass_campaigns mc
         JOIN "Clientes" c ON c."cod-cliente"::text = mc.lojista_id
         WHERE mc.status = 'scheduled' AND mc.scheduled_at <= NOW()`,
        []
      );
      for (const campaign of pending.rows) {
        const provedor = campaign['provedor-disparo'] || 'YCLOUD';
        if (provedor === 'YCLOUD' && !campaign['token-ycloud']) continue;
        if (provedor === 'META' && (!campaign['token-api-oficial'] || !campaign['phone-id-oficial'])) continue;

        await externalQuery(`UPDATE mass_campaigns SET status='sending' WHERE id=${Number(campaign.id)}`);
        console.log(`[${provedor} CRON] Disparando campanha agendada ID=${campaign.id} "${campaign.nome}"`);
        (async () => {
          let sent = 0; let failed = 0;
          const msgIds: string[] = [];
          const resultsLog: any[] = [];
          const recipients: any[] = campaign.recipients;
          const comps: any[] = campaign.components || [];
          for (const recipient of recipients) {
            try {
              if (provedor === 'META') {
                const payload = {
                  messaging_product: 'whatsapp',
                  to: recipient.phone,
                  type: 'template',
                  template: {
                    name: campaign.template_name,
                    language: { code: campaign.template_lang },
                    components: buildComponents(comps, recipient.vars || [])
                  }
                };
                const response = await axios.post(`https://graph.facebook.com/v19.0/${campaign['phone-id-oficial']}/messages`, payload, {
                  headers: { 'Authorization': `Bearer ${campaign['token-api-oficial']}`, 'Content-Type': 'application/json' }
                });
                const msgId = response.data?.messages?.[0]?.id;
                if (msgId) msgIds.push(msgId);
                resultsLog.push({ phone: recipient.phone, status: 'success', id: msgId });
                sent++;
              } else {
                const payload = {
                  from: campaign.phone_from,
                  to: recipient.phone,
                  type: 'template',
                  template: {
                    name: campaign.template_name,
                    language: { code: campaign.template_lang, policy: 'deterministic' },
                    components: buildComponents(comps, recipient.vars || [])
                  }
                };
                const response = await axios.post('https://api.ycloud.com/v2/whatsapp/messages', payload, {
                  headers: { 'X-API-Key': campaign['token-ycloud'], 'Content-Type': 'application/json' }
                });
                const msgId = response.data?.id;
                if (msgId) msgIds.push(msgId);
                resultsLog.push({ phone: recipient.phone, status: 'success', id: msgId });
                sent++;
              }
            } catch (err: any) {
              const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message;
              console.error(`[${provedor} CRON] Erro ${recipient.phone}:`, errorMsg);
              resultsLog.push({ phone: recipient.phone, status: 'failed', error: errorMsg });
              failed++;
            }
            await new Promise(r => setTimeout(r, 100));
          }
          const safeLog = JSON.stringify(resultsLog).replace(/'/g, "''");
          const safeMsgIds = JSON.stringify(msgIds).replace(/'/g, "''");
          await externalQuery(
            `UPDATE mass_campaigns SET status='done', sent_at=NOW(), total_sent=${sent}, total_failed=${failed}, message_ids='${safeMsgIds}', error_log='${safeLog}' WHERE id=${campaign.id}`
          );
          console.log(`[YCLOUD CRON] Campanha ${campaign.id} concluída: ${sent} enviados, ${failed} falhas`);
        })();
      }
    } catch (e) {
      console.error('[YCLOUD CRON] Erro ao processar agendamentos:', e);
    }
  }, 60_000);

  // POST /api/ycloud/campaigns/:id/sync - Sincroniza status das mensagens na YCloud/Meta
  app.post('/api/ycloud/campaigns/:id/sync', requireAuth, async (req: any, res) => {
    try {
      const auth = await getProviderAuth(req);
      if (!auth) return res.status(400).json({ error: 'Configuração não encontrada.' });
      
      const campaignId = req.params.id;
      const lojistaId = String(auth.lojistaId);
      
      const campRes = await externalQuery(`SELECT * FROM mass_campaigns WHERE id = ${Number(campaignId)} AND lojista_id = '${lojistaId}'`);
      if (!campRes.rows.length) return res.status(404).json({ error: 'Campanha não encontrada.' });
      const campaign = campRes.rows[0];
      
      if (auth.provedor === 'META') {
        return res.json({ success: true, message: 'Status das mensagens da Meta são atualizados automaticamente via Webhook. Não é necessário sincronizar manualmente.' });
      }

      if (!auth.ycToken) return res.status(400).json({ error: 'Token YCloud não configurado.' });
      const msgIds: string[] = campaign.message_ids || [];
      if (!msgIds.length) {
        return res.json({ success: true, message: 'Nenhum ID de mensagem salvo (talvez seja uma campanha antiga).' });
      }

      let newFailed = 0;
      let newSent = 0;

      for (const id of msgIds) {
        try {
          const mRes = await axios.get(`https://api.ycloud.com/v2/whatsapp/messages/${id}`, {
            headers: { 'X-API-Key': auth.ycToken }
          });
          const mStatus = mRes.data.status;
          if (mStatus === 'failed') newFailed++;
          else newSent++;
        } catch (e) {
          newFailed++;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      await externalQuery(`UPDATE mass_campaigns SET total_sent = ${newSent}, total_failed = ${newFailed} WHERE id = ${Number(campaignId)}`);
      res.json({ success: true, total_sent: newSent, total_failed: newFailed, message: 'Status sincronizado com a YCloud!' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/ycloud/webhook - Recebe os eventos de status da YCloud
  app.post('/api/ycloud/webhook', async (req: any, res) => {
    try {
      console.log('[YCLOUD WEBHOOK] Recebido:', JSON.stringify(req.body, null, 2));
      const payload = req.body;
      
      // O formato do evento da YCloud para WhatsApp
      if (payload.type === 'whatsapp.message.updated' && payload.whatsappMessage) {
        const msg = payload.whatsappMessage;
        const msgId = msg.id; // o id interno da ycloud "6a20..."
        const status = msg.status; // 'failed', 'delivered', 'read', 'sent', etc.
        
        // Verifica se temos alguma campanha que contenha esse msgId
        // O operador @> do jsonb permite checar se o array contém o elemento. Como msgId é string, passamos como JSON string
        const campRes = await externalQuery(
          `SELECT id, total_sent, total_failed, message_ids FROM mass_campaigns WHERE message_ids @> $1::jsonb LIMIT 1`,
          [JSON.stringify(msgId)]
        );

        if (campRes.rows.length > 0) {
          const campaign = campRes.rows[0];
          
          if (status === 'failed') {
            // Em um sistema real, a gente salvaria o status de CADA mensagem para não duplicar contagem.
            // Para simplificar, assumimos que se falhou, a gente deveria recalcular ou apenas incrementar falhas se ainda não constava.
            // A forma mais segura: Como webhook é em tempo real, se deu falha, a gente soma total_failed.
            // Porém o botão "Sincronizar" já faz uma sincronização exata do zero.
            // O ideal seria que total_failed reflicta o estado atual.
            
            console.log(`[YCLOUD WEBHOOK] Mensagem ${msgId} falhou para campanha ${campaign.id}`);
            // Vamos disparar uma rotina assíncrona que executa a mesma lógica do botão "sincronizar" para essa campanha inteira,
            // garantindo que os contadores total_sent e total_failed fiquem perfeitos.
            (async () => {
               try {
                 const msgIds: string[] = campaign.message_ids || [];
                 // Apenas busca no bd novamente o cliente para pegar a API key? Não precisa.
                 // A Ycloud enviou o webhook. Vamos apenas somar +1 nas falhas e -1 nos enviados, de forma burra mas rápida?
                 // Na verdade, o webhook pode chegar multiplas vezes. Para evitar bagunça, faremos isso:
                 // Update total_failed = total_failed + 1, e caso sent > 0 diminui 1
                 await externalQuery(
                   `UPDATE mass_campaigns 
                    SET total_failed = total_failed + 1, 
                        total_sent = GREATEST(total_sent - 1, 0) 
                    WHERE id = $1`, 
                   [campaign.id]
                 );
               } catch(e) {}
            })();
          }
        }
      }

      res.status(200).send('OK');
    } catch (e) {
      console.error('[YCLOUD WEBHOOK] Erro no processamento:', e);
      res.status(500).send('Erro interno');
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const viteMod = "vite";
    const { createServer: createViteServer } = await import(viteMod);
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    // Modo Produção/Build: Tenta usar __dirname (CJS) ou process.cwd() (Fallback)
    const rootDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    let distPath = pathModule.join(rootDir, "dist");

    // Correção para quando o servidor roda de dentro de dist-server/
    if (!fs.existsSync(pathModule.join(distPath, "index.html"))) {
      const parentDist = pathModule.join(rootDir, "..", "dist");
      if (fs.existsSync(pathModule.join(parentDist, "index.html"))) {
        distPath = parentDist;
      }
    }

    console.log(`[SERVER] Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = pathModule.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend build not found (index.html missing). Please check dist/ folder.");
      }
    });
  }

  const listenHandler = () => {
    console.log(`\n\n  --- 🏆 SERVER VERSION 11.0 (SAAS AUTH) IS LIVE ---`);
    console.log(`  JWT Auth + RBAC enabled. Admin: guimarques1987etc@gmail.com`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Local Access: http://localhost:${PORT}`);
    console.log(`\n\n`);
  };

  if (isPipe) {
    // Phusion Passenger injections (Named pipes / Unix sockets)
    app.listen(PORT, listenHandler);
  } else {
    // TCP Port environments (Docker, Nixpacks, Localhost)
    app.listen(PORT as number, "0.0.0.0", listenHandler);
  }

  // --- AUTO PROVISIONING BACKGROUND POLLING ---
  // Verifica por novas lojas na base mestre a cada 3 minutos no background
  setInterval(async () => {
    try {
      await provisionShops();
    } catch (e) {
      console.error('Erro na rotina background de provisionShops:', e);
    }
  }, 3 * 60 * 1000); // 3 minutos
}

startServer().catch(err => {
  console.error("CRITICAL STARTUP ERROR:", err);
  const crashLog = pathModule.join(process.cwd(), "crash.log");
  fs.appendFileSync(crashLog, `[${new Date().toISOString()}] SERVER STARTUP CRASH: ${err.stack || err}\n`);
  process.exit(1);
});
