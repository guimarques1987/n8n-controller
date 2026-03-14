import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import pg from 'pg';
import FormData from 'form-data';
import multer from 'multer';
import pathModule from 'path';
import { initDb, query, externalQuery, isDbReady } from "./src/db";

dotenv.config();

const LOG_FILE = "c:\\Users\\guima\\Downloads\\n8n-controller\\server.log";
function logToFile(msg: string) {
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
const { Pool } = pg;
const clientesPool = new Pool({
  host: 'paineleasypanel.cardapioclick.com.br',
  port: 5332,
  user: 'postgres',
  password: '96f5f11c0b0c9ac2dab0',
  database: 'banco-dados',
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
});
clientesPool.on('error', (err) => console.error('Clientes DB error:', err.message));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const JWT_SECRET = process.env.JWT_SECRET || 'n8n-controller-saas-secret-2024';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use('/uploads', express.static(pathModule.join(process.cwd(), 'uploads')));

  try { await initDb(); } catch (e) { console.error("DB Init failed:", e); }

  const memoryInstances: Record<string, any> = {
    '1': { baseUrl: '', apiKey: '', templates: [] },
    '2': {
      baseUrl: 'https://n8npro.gdautomacao.com',
      apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2ODM3OS1jZDM3LTQxMWItOTVkYy1iNDBhZTQ0OWQ3NmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjE0NGU2ZmYtNzEwYS00YjY0LTk0YjEtZGY2ODk5NTE0YWJjIiwiaWF0IjoxNzcxNjg1MTE5fQ.SIF0bqobw-YzEZewboZazwou2gEi6TuIsFr-f6TIzaQ',
      templates: []
    }
  };

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
      const clienteResult = await clientesPool.query(
        `SELECT id, "cod-cliente", celular, email, "pushName", "nome-estabelecimento", "id-loja", "senha-app"
         FROM "Clientes"
         WHERE LOWER(TRIM(email)) = $1 OR TRIM(celular) = $2
         LIMIT 1`,
        [identifier, identifier.replace(/\D/g, '')]
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
      const result = await clientesPool.query(
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
      await clientesPool.query(
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
      const result = await clientesPool.query(
        'UPDATE "Clientes" SET "senha-app" = $1 WHERE id = $2',
        [newPassword, parseInt(user.id)]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.json({ success: true });
    } catch (e: any) {
      console.error('Change password error:', e);
      return res.status(500).json({ error: 'Erro ao salvar senha: ' + e.message });
    }
  });

  // ─── CONFIG DO ROBÔ ────────────────────────────────────────────────────────────

  // Setup multer for image uploads
  const multer = (await import('multer')).default;
  const path = (await import('path')).default;
  const uploadsDir = 'uploads';
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
      cb(null, unique + ext);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 300 * 1024 }, // 300kb
    fileFilter: (_req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(ext)) cb(null, true);
      else cb(new Error('Formato não permitido. Use jpg, jpeg, png ou webp'));
    },
  });

  // Serve uploads statically
  app.use('/uploads', express.static(uploadsDir));

  // GET /api/robo-config — retorna config do lojista logado (ou específico se admin)
  app.get('/api/robo-config', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? parseInt(req.query.lojistaId as string) : parseInt(req.user.id);
      const result = await clientesPool.query(
        'SELECT "ativa-robo", "ativa-ia", "msg-saudacao", "msg-despedida", "link-foto-aberto", "link-foto-fechado", "tipo_mensagem_aberto", "tipo_mensagem_fechado", "status-recuperador", "status-lembrete", "qtd-dias", "qtd-dias-maximo", "plano" FROM "Clientes" WHERE id = $1',
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
    console.log(`\n[API /robo-config] Salvando config na tabela Clientes para lojista ID ${targetId}:`, req.body);

    try {
      const config = req.body;
      const sql = `
        INSERT INTO config_robo (
          lojista_id, "ativa-robo", "postgres-ia", "msg-saudacao", "msg-fechado", 
          "link-foto-aberto", "link-foto-fechado", tipo_mensagem_aberto, tipo_mensagem_fechado,
          "status-recuperador", "qtd-dias", "qtd-dias-maximo", "status-lembrete",
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (lojista_id) DO UPDATE SET
          "ativa-robo" = EXCLUDED."ativa-robo",
          "postgres-ia" = EXCLUDED."postgres-ia",
          "msg-saudacao" = EXCLUDED."msg-saudacao",
          "msg-fechado" = EXCLUDED."msg-fechado",
          "link-foto-aberto" = EXCLUDED."link-foto-aberto",
          "link-foto-fechado" = EXCLUDED."link-foto-fechado",
          tipo_mensagem_aberto = EXCLUDED.tipo_mensagem_aberto,
          tipo_mensagem_fechado = EXCLUDED.tipo_mensagem_fechado,
          "status-recuperador" = EXCLUDED."status-recuperador",
          "qtd-dias" = EXCLUDED."qtd-dias",
          "qtd-dias-maximo" = EXCLUDED."qtd-dias-maximo",
          "status-lembrete" = EXCLUDED."status-lembrete",
          updated_at = NOW()
      `;

      // Conversions: frontend will pass integers (0 or 1). 
      // If booleans leak in, ensure they are casted correctly: 1 for truthy, 0 for falsy.
      const parseToggle = (val: any) => val === 1 || val === true || val === '1' ? 1 : 0;

      let valRobo = parseToggle(ativaRobo);
      let valIa = parseToggle(ativaIa);
      let valRec = parseToggle(config['status-recuperador']);
      let valLemb = parseToggle(config['status-lembrete']);
      let tMsgAberto = config.tipo_mensagem_aberto || 'texto';
      let tMsgFechado = config.tipo_mensagem_fechado || 'texto';

      // Segurança: Obter o plano real se não for Admin (evita bypass no frontend)
      let activePlano = config.plano || 'basico';
      if (req.user.role !== 'admin') {
        const { rows: pRows } = await clientesPool.query('SELECT plano FROM "Clientes" WHERE id = $1', [targetId]);
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
        valLemb
      ]);

      // Execute UPDATE conditionally based on whether plano was provided.
      // Usually, only the admin form transmits 'plano', but let's safely fall back.
      if (req.user.role === 'admin' && typeof config.plano === 'string') {
        await clientesPool.query(
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
             "plano" = $13
           WHERE id = $14`,
          [
            valRobo,
            valIa,
            msgSaudacao ?? '',
            msgDespedida ?? '',
            linkFotoAberto ?? '',
            linkFotoFechado ?? '',
            tMsgAberto,
            tMsgFechado,
            valRec,
            valLemb,
            config['qtd-dias'] ? parseInt(config['qtd-dias'], 10) : 0,
            config['qtd-dias-maximo'] ? parseInt(config['qtd-dias-maximo'], 10) : 0,
            activePlano,
            targetId
          ]
        );
      } else {
        await clientesPool.query(
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
             "qtd-dias-maximo" = $12
           WHERE id = $13`,
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
            targetId
          ]
        );
      }

      // Sincronizar as fotos no Baserow (Tabela 799 "Fotos")
      try {
        const idLojaRes = await clientesPool.query('SELECT "id-loja" FROM "Clientes" WHERE id = $1', [targetId]);
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

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/robo-config/upload — faz upload de imagem e retorna URL
  app.post('/api/robo-config/upload', requireAuth, (req: any, res: any) => {
    upload.single('foto')(req, res, async (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'O arquivo deve ter no máximo 300kb' });
        }
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));

        const baserowRes = await axios.post('https://banco-dados-baserow.9gbztf.easypanel.host/api/user-files/upload-file/', formData, {
          headers: {
            ...formData.getHeaders(),
            'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ'
          }
        });

        // Tentar apagar arquivo local para não ocupar espaço
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        const data = baserowRes.data;
        res.json({ success: true, url: data.url, name: data.name });
      } catch (e: any) {
        console.error('Baserow upload error:', e.response?.data || e.message);
        res.status(500).json({ error: 'Erro ao enviar para Baserow' });
      }
    });
  });

  // ─── INTEGRAÇÃO UAZAPI ────────────────────────────────────────────────────────
  const UAZAPI_URL = 'https://cardapioclick.uazapi.com';
  const UAZAPI_ADMIN_TOKEN = 'ln3ZJiO6sp8DTxb4DuyJOqAPAt5Rft0zonS6d32yrnwJ280g80';

  // Helper para buscar a instância correspondente ao número do Lojista
  async function ensureUazapiInstance(lojistaRawId: string) {
    try {
      // 1. Obter celular do banco para o Lojista
      const clientRes = await clientesPool.query('SELECT celular FROM "Clientes" WHERE id = $1', [lojistaRawId]);
      if (clientRes.rows.length === 0) throw new Error('Lojista não encontrado no banco principal');

      let celular = clientRes.rows[0].celular || '';
      celular = celular.replace(/\D/g, ''); // Somente números

      // 2. Buscar todas instâncias na UazAPI
      const fetchReq = await axios.get(`${UAZAPI_URL}/instance/all`, {
        headers: { admintoken: UAZAPI_ADMIN_TOKEN }
      });
      const instances = fetchReq.data || [];

      // 3. Matching estrito (evitar que celular "55" ou "16" dê match genérico)
      let matchedInstance = null;
      if (celular && celular.length >= 10) {
        matchedInstance = instances.find((i: any) => {
          if (!i.owner) return false;
          const cleanOwner = i.owner.replace(/\D/g, '');
          // O owner da evolução é geralmente 5516999999999.
          // Comparamos as 3 formas: igual, adicionando 55 ao nosso celular, ou adicionando 55 ao owner se o nosso já tiver.
          return cleanOwner === celular || cleanOwner === `55${celular}` || `55${cleanOwner}` === celular;
        });
      }

      // Se achou pelo número, é a instância dele
      if (matchedInstance) {
        return { success: true, instanceName: matchedInstance.name, state: matchedInstance.status, instanceData: matchedInstance };
      } else {
        // Se não achou, usar nome fallback (provavelmente desconectado e precisará de criação caso a UAZAPI requeira)
        return { success: true, instanceName: `lojista_${lojistaRawId}`, state: 'close', instanceData: null };
      }
    } catch (e: any) {
      console.error('Erro ao mapear instância Uazapi:', e.stack);
      return { success: false, error: e.stack || e.message };
    }
  }

  app.get('/api/whatsapp/status', requireAuth, async (req: any, res) => {
    try {
      const targetId = (req.user.role === 'admin' && req.query.lojistaId) ? req.query.lojistaId : req.user.id;

      const guaranteed = await ensureUazapiInstance(targetId);
      if (!guaranteed.success) return res.status(500).json({ error: guaranteed.error });

      // O state já vem preenchido diretamente do cache `/instance/all`!
      const state = guaranteed.state || 'close';
      return res.json({ status: state });
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
      const baserowRes = await axios.get('https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/800/?user_field_names=true', {
        headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ' }
      });
      if (baserowRes.data.results && baserowRes.data.results.length > 0) {
        const row = baserowRes.data.results[0];
        const urlLogo = row['url-logo'] && row['url-logo'].length > 0 ? row['url-logo'][0].url : '';
        let jsonConfig = {};
        if (row['json-config']) {
          try {
            jsonConfig = JSON.parse(row['json-config']);
          } catch (e) { console.error('Error parsing json-config from Baserow', e); }
        }
        return res.json({
          urlLogo,
          titulo: row['titulo'] || 'Cardápio Click Bot',
          corFundo: row['cor-fundo'] || '#0B0F19',
          ...jsonConfig
        });
      }
      res.json({ urlLogo: '', titulo: 'Cardápio Click Bot', corFundo: '#0B0F19' });
    } catch (e: any) {
      console.error('Erro ao buscar config de login:', e.message);
      res.json({ urlLogo: '', titulo: 'n8n Controller', corFundo: '#0B0F19' });
    }
  });

  app.post('/api/admin/login-config', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    const { urlLogo, titulo, corFundo, ...jsonConfig } = req.body;
    try {
      const searchRes = await axios.get('https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/800/?user_field_names=true', {
        headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ' }
      });

      const fileObj = urlLogo ? [{ name: urlLogo.split('/').pop() }] : [];
      const payload = {
        'url-logo': fileObj,
        'titulo': titulo || '',
        'cor-fundo': corFundo || '',
        'json-config': Object.keys(jsonConfig).length > 0 ? JSON.stringify(jsonConfig) : ''
      };

      if (searchRes.data.results.length > 0) {
        const rowId = searchRes.data.results[0].id;
        await axios.patch(`https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/800/${rowId}/?user_field_names=true`, payload, {
          headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ', 'Content-Type': 'application/json' }
        });
      } else {
        await axios.post('https://banco-dados-baserow.9gbztf.easypanel.host/api/database/rows/table/800/?user_field_names=true', payload, {
          headers: { 'Authorization': 'Token jL0bLcMPAIgEHVDQ6M8ndjP1gbchugVJ', 'Content-Type': 'application/json' }
        });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error('Erro ao salvar config de login no Baserow:', e.response?.data || e.message);
      res.status(500).json({ error: 'Erro ao salvar configurações' });
    }
  });

  app.get('/api/admin/lojistas', requireAuth, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    try {
      const result = await clientesPool.query('SELECT id, "nome-estabelecimento" as nome, "id-loja" as "idLoja" FROM "Clientes" ORDER BY id ASC');
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
      const result = await externalQuery('SELECT * FROM lojista_workflows WHERE lojista_id = $1 ORDER BY created_at DESC', [lojistaId]);

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
      const result = await externalQuery('SELECT * FROM lojista_workflows WHERE lojista_id = $1 ORDER BY created_at DESC', [String(lojistaId)]);

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
    return axios.create({ baseURL, headers: { "X-N8N-API-KEY": config.apiKey } });
  };

  // ─── API ROUTES (protegidas) ──────────────────────────────────────────────────

  app.get("/api/config", requireAuth, async (_req, res) => {
    try {
      if (isDbReady()) {
        const result = await query('SELECT * FROM instances');
        const config: Record<string, any> = {};
        result.rows.forEach(row => {
          let templates = row.templates || [];
          if (typeof templates === 'string') { try { templates = JSON.parse(templates); } catch (e) { templates = []; } }

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

  // ─── ROBO CONFIG ROUTES ─────────────────────────────────────────────────────

  app.get('/api/robo-config', requireAuth, async (req: any, res) => {
    try {
      const lojistaId = (req.user.role === 'admin' && req.query.lojistaId) ? req.query.lojistaId : req.user.id;
      const result = await query('SELECT * FROM config_robo WHERE lojista_id = $1', [String(lojistaId)]);
      if (result.rows.length === 0) {
        return res.json({});
      }
      const row = result.rows[0];
      row['msg-despedida'] = row['msg-fechado'] || '';
      res.json(row);
    } catch (e: any) {
      console.error('Erro ao buscar robo-config:', e.message);
      res.status(500).json({ error: 'Erro ao buscar configurações do robô' });
    }
  });



  // Upload local de imagem para o robô
  app.post('/api/robo-config/upload', requireAuth, (req: any, res) => {
    const upload = multer({ dest: 'uploads/' }).single('file');
    upload(req, res, (err) => {
      if (err) return res.status(500).json({ error: 'Erro no upload' });
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const url = `/uploads/${req.file.filename}`;
      res.json({ url });
    });
  });

  app.post("/api/config", requireAuth, requireAdmin, async (req, res) => {
    if (isDbReady()) {
      try {
        for (const [id, data] of Object.entries(req.body) as [string, any][]) {
          if (!['1', '2'].includes(id)) continue;
          await query(
            `INSERT INTO instances (id, base_url, api_key, templates, webhook_url)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               base_url = EXCLUDED.base_url,
               api_key = CASE WHEN EXCLUDED.api_key IS NULL OR EXCLUDED.api_key = '' THEN instances.api_key ELSE EXCLUDED.api_key END,
               templates = EXCLUDED.templates,
               webhook_url = EXCLUDED.webhook_url`,
            [id, data.baseUrl, data.apiKey || null, JSON.stringify(data.templates || []), data.webhookUrl || null]
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
    if (!client) return res.status(500).json({ error: "Config missing" });
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

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = pathModule.resolve("dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(pathModule.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n\n  --- 🏆 SERVER VERSION 11.0 (SAAS AUTH) IS LIVE ---`);
    console.log(`  JWT Auth + RBAC enabled. Admin: guimarques1987etc@gmail.com`);
    console.log(`  Port: ${PORT}\n\n`);
  });
}

startServer();
