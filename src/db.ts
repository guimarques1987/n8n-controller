import { Pool } from 'pg';
// better-sqlite3 import moved to dynamic inside setupDatabase for better bundling
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

// Carrega .env com path explícito para garantir funcionamento em qualquer cwd
const _envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(_envPath)) {
  dotenv.config({ path: _envPath });
} else {
  // Fallback: tenta carregar do diretório pai (caso o bundle esteja em subpasta)
  const _parentEnvPath = path.join(process.cwd(), '..', '.env');
  if (fs.existsSync(_parentEnvPath)) {
    dotenv.config({ path: _parentEnvPath });
  } else {
    dotenv.config(); // último recurso
  }
}

let pool: Pool | null = null;
let sqlite: any = null;
let externalPool: Pool | null = null;

const dbUrl = process.env.DATABASE_URL || 'sqlite://local.db';
const extDbUrl = process.env.EXTERNAL_DATABASE_URL;

function setupDatabase() {
  if (dbUrl.startsWith('sqlite://')) {
    const filename = dbUrl.replace('sqlite://', '');
    console.log(`Initializing SQLite database: ${filename}`);
// Fallback code removed for better-sqlite3
    return;
  }

  try {
    console.log('Initializing PostgreSQL pool...');
    console.log('[DB] Connecting to:', dbUrl.replace(/:[^:@]+@/, ':***@')); // log sem senha
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 15000, // 15s para suportar latência de rede em containers
      idleTimeoutMillis: 30000,
      max: 10,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PG client', err);
    });
  } catch (e) {
    console.error("Failed to create PG pool, falling back to SQLite", e);
    console.error('Failed to load better-sqlite3 fallback (SQLite module removed)');
  }

  if (extDbUrl) {
    try {
      console.log('Initializing external PostgreSQL pool...');
      console.log('[DB] External connecting to:', extDbUrl.replace(/:[^:@]+@/, ':***@'));
      externalPool = new Pool({
        connectionString: extDbUrl,
        ssl: extDbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
        max: 10,
      });
      externalPool.on('error', (err) => console.error('External PG error', err));
    } catch (e) {
      console.error("Failed to create external PG pool", e);
    }
  }
}

setupDatabase();

export const query = async (text: string, params?: any[]) => {
  if (sqlite) {
    // Translate PG-style ($1, $2) to SQLite-style (?)
    let sqliteQuery = text.replace(/\$(\d+)/g, '?');

    // Fix JSONB casts for SQLite
    sqliteQuery = sqliteQuery.replace(/::jsonb/gi, '');

    // Handle INSERT ... ON CONFLICT (...) DO UPDATE SET — normalize for SQLite
    if (sqliteQuery.includes('ON CONFLICT')) {
      sqliteQuery = sqliteQuery.replace(/ON CONFLICT\s*\((\w+)\)\s*DO UPDATE SET/gi, 'ON CONFLICT($1) DO UPDATE SET');
      // Also handle DO NOTHING
      sqliteQuery = sqliteQuery.replace(/ON CONFLICT\s*\((\w+)\)\s*DO NOTHING/gi, 'ON CONFLICT($1) DO NOTHING');
    }

    const sqliteParams = (params || []).map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
    const stmt = sqlite.prepare(sqliteQuery);
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      const rows = stmt.all(sqliteParams);
      return { rows, rowCount: rows.length };
    } else {
      const result = stmt.run(sqliteParams);
      return { rows: [], rowCount: result.changes };
    }
  }

  if (!pool) {
    throw new Error("Database not initialized");
  }
  return pool.query(text, params);
};

export const externalQuery = async (text: string, params?: any[]) => {
  if (!externalPool) {
    return query(text, params);
  }
  return externalPool.query(text, params);
};

export const isDbReady = () => !!pool || !!sqlite;

export const initDb = async () => {
  if (!isDbReady()) {
    console.warn("Skipping DB init: No valid connection");
    return;
  }

  try {
    console.log('Initializing schema...');

    // Use PG-compatible syntax for the base queries
    await query(`
      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        base_url TEXT,
        api_key TEXT,
        templates JSONB DEFAULT '[]'::jsonb,
        webhook_url TEXT
      );
    `);

    // Migração: adicionar webhook_url se não existir (DBs antigos)
    try {
      await query(`ALTER TABLE instances ADD COLUMN webhook_url TEXT`);
    } catch (_) { /* coluna já existe — ignorar erro */ }

    // Always upsert instances so env var keys are always applied
    console.log('Upserting default instances from env vars...');
    await query(`
      INSERT INTO instances (id, base_url, api_key, templates, webhook_url)
      VALUES 
        ('1', $1, $2, '{}'::jsonb, null),
        ('2', $3, $4, '{}'::jsonb, null)
      ON CONFLICT (id) DO UPDATE SET 
        base_url = EXCLUDED.base_url,
        api_key = EXCLUDED.api_key;
    `, [
      process.env.N8N_INSTANCE_1_URL || 'https://n8n.cardapioclick.com.br',
      process.env.N8N_INSTANCE_1_KEY || '',
      process.env.N8N_INSTANCE_2_URL || 'https://n8npro.gdautomacao.com',
      process.env.N8N_INSTANCE_2_KEY || ''
    ]);
      console.log('Instances upserted successfully');

    // Tabela de usuários (SaaS)
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'lojista',
        name TEXT NOT NULL DEFAULT '',
        created_at TEXT DEFAULT current_timestamp
      );
    `);

    // SQLite não tem gen_random_uuid — fallback
    try {
      await query(`ALTER TABLE users ADD COLUMN id TEXT PRIMARY KEY`);
    } catch (_) { /* coluna já existe */ }

    // Seed do admin padrão
    const ADMIN_EMAIL = 'guimarques1987etc@gmail.com';
    const ADMIN_NAME  = 'Guilherme Marques';
    const ADMIN_PASS  = '131199@Gui';
    const adminCheck = await query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
    if (adminCheck.rowCount === 0) {
      const hash = bcrypt.hashSync(ADMIN_PASS, 10);
      try {
        await query(
          `INSERT INTO users (id, email, password_hash, role, name) VALUES (gen_random_uuid()::text, $1, $2, 'admin', $3) ON CONFLICT (email) DO NOTHING`,
          [ADMIN_EMAIL, hash, ADMIN_NAME]
        );
      } catch (_) {
        const uuid = `admin-${Date.now()}`;
        await query(
          `INSERT INTO users (id, email, password_hash, role, name) VALUES ($1, $2, $3, 'admin', $4) ON CONFLICT (email) DO NOTHING`,
          [uuid, ADMIN_EMAIL, hash, ADMIN_NAME]
        );
      }
      console.log(`Admin user seeded (${ADMIN_EMAIL}).`);
    }

    // Tabela de configuração do robô WhatsApp
    const isPgExt = !!externalPool || !!pool;

    const configRoboSchema = `
      CREATE TABLE IF NOT EXISTS config_robo (
        id ${isPgExt ? 'SERIAL' : 'INTEGER'} PRIMARY KEY,
        lojista_id TEXT NOT NULL UNIQUE,
        "ativa-robo" INTEGER DEFAULT 1,
        "ativa-ia" INTEGER DEFAULT 1,
        "msg-saudacao" TEXT DEFAULT '',
        "msg-despedida" TEXT DEFAULT '',
        "link-foto-aberto" TEXT DEFAULT '',
        "link-foto-fechado" TEXT DEFAULT '',
        tipo_mensagem_aberto TEXT DEFAULT 'texto',
        tipo_mensagem_fechado TEXT DEFAULT 'texto',
        "status-recuperador" INTEGER DEFAULT 0,
        "qtd-dias" INTEGER DEFAULT 0,
        "qtd-dias-maximo" INTEGER DEFAULT 0,
        "status-lembrete" INTEGER DEFAULT 0,
        "recuperador-msg" TEXT DEFAULT '',
        "lembrar-cliente" TEXT DEFAULT '',
        "msg-paga" INTEGER DEFAULT 0,
        workflow_id TEXT,
        instance_id TEXT,
        webhook_url TEXT,
        updated_at ${isPgExt ? 'TIMESTAMPTZ DEFAULT NOW()' : 'TEXT DEFAULT current_timestamp'}
      );
    `;

    await runOnAll(configRoboSchema);

    // Tabela para múltiplos fluxos vinculados
    await runOnAll(`
      CREATE TABLE IF NOT EXISTS lojista_workflows (
        id ${isPgExt ? 'SERIAL' : 'INTEGER'} PRIMARY KEY,
        lojista_id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        workflow_name TEXT,
        instance_id TEXT NOT NULL,
        webhook_url TEXT,
        created_at ${isPgExt ? 'TIMESTAMPTZ DEFAULT NOW()' : 'TEXT DEFAULT current_timestamp'}
      );
    `);

    // Migração de BOOLEAN para INTEGER no PostgreSQL se necessário
    if (isPgExt) {
      await runOnAll(`
        ALTER TABLE config_robo 
        ALTER COLUMN "ativa-robo" TYPE INTEGER USING "ativa-robo"::integer;
      `);
      // A segunda alteração de ativa-ia pode falhar se a coluna não existir ainda,
      // então rodaremos os ADD COLUMN primeiro.
    }

    // Garante que todas as colunas existem (Migrações progressivas)
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "ativa-robo" INTEGER DEFAULT 1`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "ativa-ia" INTEGER DEFAULT 1`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "msg-saudacao" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "msg-despedida" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "msg-fechado" TEXT DEFAULT ''`); // fallback redundante
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "link-foto-aberto" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "link-foto-fechado" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "tipo_mensagem_aberto" TEXT DEFAULT 'texto'`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "tipo_mensagem_fechado" TEXT DEFAULT 'texto'`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "status-recuperador" INTEGER DEFAULT 0`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "qtd-dias" INTEGER DEFAULT 0`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "qtd-dias-maximo" INTEGER DEFAULT 0`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "status-lembrete" INTEGER DEFAULT 0`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "recuperador-msg" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "lembrar-cliente" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "msg-paga" INTEGER DEFAULT 0`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "horario-recuperador" TEXT DEFAULT ''`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "workflow_id" TEXT`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "instance_id" TEXT`);
    await runOnAll(`ALTER TABLE config_robo ADD COLUMN IF NOT EXISTS "webhook_url" TEXT`);

    // Casting if they were boolean (now that we're sure they exist)
    if (isPgExt) {
      await runOnAll(`
        ALTER TABLE config_robo 
        ALTER COLUMN "ativa-ia" TYPE INTEGER USING "ativa-ia"::integer;
      `);
    }

    // Migração inicial de config_robo para lojista_workflows se houver dados antigos
    try {
      if (isPgExt) {
        await runOnAll(`
          INSERT INTO lojista_workflows (lojista_id, workflow_id, instance_id, webhook_url, workflow_name)
          SELECT lojista_id, workflow_id, instance_id, webhook_url, 'Fluxo Principal'
          FROM config_robo
          WHERE workflow_id IS NOT NULL 
          AND NOT EXISTS (
            SELECT 1 FROM lojista_workflows lw 
            WHERE lw.lojista_id = config_robo.lojista_id 
            AND lw.workflow_id = config_robo.workflow_id
          )
        `);
      }
    } catch (e) { /* Migração falhou ou já ocorreu */ }

    // --- MIGRATION: Tabela "Clientes" (Banco Externo) ---
    if (externalPool) {
      console.log('Verificando migrações na tabela Clientes (Banco Externo)...');
      try {
        // Garante colunas essenciais
        const columns = [
          { name: 'ativa-robo', type: 'INTEGER DEFAULT 1' },
          { name: 'ativa-ia', type: 'INTEGER DEFAULT 1' },
          { name: 'msg-saudacao', type: 'TEXT DEFAULT \'\'' },
          { name: 'msg-despedida', type: 'TEXT DEFAULT \'\'' },
          { name: 'link-foto-aberto', type: 'TEXT DEFAULT \'\'' },
          { name: 'link-foto-fechado', type: 'TEXT DEFAULT \'\'' },
          { name: 'tipo_mensagem_aberto', type: 'TEXT DEFAULT \'texto\'' },
          { name: 'tipo_mensagem_fechado', type: 'TEXT DEFAULT \'texto\'' },
          { name: 'status-recuperador', type: 'INTEGER DEFAULT 0' },
          { name: 'status-lembrete', type: 'INTEGER DEFAULT 0' },
          { name: 'qtd-dias', type: 'INTEGER DEFAULT 0' },
          { name: 'qtd-dias-maximo', type: 'INTEGER DEFAULT 0' },
          { name: 'recuperador-msg', type: 'TEXT DEFAULT \'\'' },
          { name: 'lembrar-cliente', type: 'TEXT DEFAULT \'\'' },
          { name: 'google_api_key', type: 'TEXT DEFAULT \'\'' },
          { name: 'plano', type: 'TEXT DEFAULT \'basico\'' },
          { name: 'msg-paga', type: 'INTEGER DEFAULT 0' },
          { name: 'horario-recuperador', type: 'TEXT DEFAULT \'\'' }
        ];

        for (const col of columns) {
          try {
            await externalQuery(`ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
          } catch (err: any) {
             // Se falhar porque já existe ou outro erro, logamos discretamente
             // console.log(`Nota: Coluna ${col.name} já existe ou erro: ${err.message}`);
          }
        }
        
        // Conversão de tipo se necessário (ex: de BOOLEAN/TEXT para INTEGER para ativa-ia)
        try {
          await externalQuery(`ALTER TABLE "Clientes" ALTER COLUMN "ativa-ia" TYPE INTEGER USING "ativa-ia"::integer`);
        } catch (_) {}

        console.log('✅ Migrações da tabela Clientes concluídas.');
      } catch (err: any) {
        console.error('Erro ao migrar a tabela Clientes:', err.message);
      }
    }

    // Provisionar tabelas de lojas automaticamente (Background)
    provisionShops();

  } catch (err) {
    console.error('Error initializing DB:', err);
  }
};

// Helper to run migration on both internal and external pools if they exist
const runOnAll = async (sql: string, params: any[] = []) => {
  try { await query(sql, params); } catch (e) { /* silent fail on one if it exists or fails */ }
  if (externalPool) {
    try { await externalQuery(sql, params); } catch (e) { /* silent fail */ }
  }
};

/**
 * Converte nomes de estabelecimentos em nomes de tabelas válidos.
 * Ex: "Hamburgueria São Paulo" -> "hamburgueriasaopaulo"
 */
export const slugify = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // Remove tudo que não for letra ou número
};

export const provisionShops = async () => {
  if (!externalPool) return;
  try {
    // Listar tabelas para conferência
    const { rows: publicTables } = await externalQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    const tableNames = publicTables.map((t: any) => t.table_name);
    
    // Log para debug se necessário
    if (tableNames.length === 0) {
      console.warn('[PROVISION] ATENÇÃO: Nenhuma tabela encontrada no schema public!');
    }

    // Determinar o nome correto (preferindo "Clientes" com C maiúsculo se existir)
    const targetTable = tableNames.find(n => n.toLowerCase() === 'clientes') || 'Clientes';
    const quotedTable = `"${targetTable}"`;

    const { rows: clientes } = await externalQuery(`SELECT id, "nome-estabelecimento" FROM ${quotedTable} WHERE "nome-estabelecimento" IS NOT NULL`);
    
    let createdCount = 0;
    for (const cliente of clientes) {
      const rawName = cliente['nome-estabelecimento'];
      const lojistaId = String(cliente.id);
      const slug = slugify(rawName);

      if (!slug) continue;

      // 1. Criar a tabela da loja se não existir no banco EXTERNO (mestre)
      const shopTableSchema = `
        CREATE TABLE IF NOT EXISTS "${slug}" (
          "id" SERIAL PRIMARY KEY,
          "celular" TEXT,
          "Nome Cliente" TEXT,
          "MSG 1" TEXT,
          "MSG 2" TEXT,
          "Data compra" TEXT,
          "Estabelecimento" TEXT,
          "MSG enviada" TEXT
        );
      `;
      
      try {
        const checkTb = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [slug]);
        if (checkTb.rowCount === 0) {
          await query(shopTableSchema); 
          createdCount++;
          console.log(`✅ [PROVISION] Nova tabela garantida no BD local para: ${slug}`);
        }
      } catch (err: any) {
        console.error(`[PROVISION] Erro ao criar tabela para ${slug}:`, err.message);
      }

      // 2. Garantir entrada na config_robo
      try {
        await runOnAll(`
          INSERT INTO config_robo (lojista_id, "ativa-robo", "ativa-ia")
          VALUES ($1, 1, 1)
          ON CONFLICT (lojista_id) DO NOTHING
        `, [lojistaId]);
      } catch (err: any) {
        console.error(`[PROVISION] Erro ao criar config_robo para ${lojistaId}:`, err.message);
      }
    }

    if (createdCount > 0) {
       console.log(`✅ [AUTO-PROVISION] Realizado o auto-provisionamento de ${createdCount} nova(s) loja(s).`);
    }
  } catch (err: any) {
    console.error('[PROVISION] Erro crítico na rotina de provisionamento:', err.message);
  }
};
