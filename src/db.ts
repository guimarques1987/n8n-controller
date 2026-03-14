import { Pool } from 'pg';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

let pool: Pool | null = null;
let sqlite: any = null;
let externalPool: Pool | null = null;

const dbUrl = process.env.DATABASE_URL || 'sqlite://local.db';
const extDbUrl = process.env.EXTERNAL_DATABASE_URL;

function setupDatabase() {
  if (dbUrl.startsWith('sqlite://')) {
    const filename = dbUrl.replace('sqlite://', '');
    console.log(`Initializing SQLite database: ${filename}`);
    sqlite = new Database(filename);
    return;
  }

  try {
    console.log('Initializing PostgreSQL pool...');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PG client', err);
    });
  } catch (e) {
    console.error("Failed to create PG pool, falling back to SQLite", e);
    sqlite = new Database('local.db');
  }

  if (extDbUrl) {
    try {
      console.log('Initializing external PostgreSQL pool...');
      externalPool = new Pool({
        connectionString: extDbUrl,
        ssl: extDbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 5000,
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

    // Initialize default instances if they don't exist
    const res = await query('SELECT * FROM instances WHERE id IN ($1, $2)', ['1', '2']);
    if (res.rowCount === 0) {
      console.log('Seeding default instances...');
      await query(`
        INSERT INTO instances (id, base_url, api_key, templates, webhook_url)
        VALUES 
          ('1', '', '', '[]'::jsonb, null),
          ('2', 'https://n8npro.gdautomacao.com', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2ODM3OS1jZDM3LTQxMWItOTVkYy1iNDBhZTQ0OWQ3NmIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjE0NGU2ZmYtNzEwYS00YjY0LTk0YjEtZGY2ODk5NTE0YWJjIiwiaWF0IjoxNzcxNjg1MTE5fQ.SIF0bqobw-YzEZewboZazwou2gEi6TuIsFr-f6TIzaQ', '[]'::jsonb, null)
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log('Initialized default instances in DB');
    } else {
      console.log('Instances already exist in DB');
    }

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
    const adminCheck = await query('SELECT id FROM users WHERE email = $1', ['guimarques1987etc@gmail.com']);
    if (adminCheck.rowCount === 0) {
      const hash = bcrypt.hashSync('131199@Gui', 10);
      try {
        // Tenta com gen_random_uuid (PostgreSQL)
        await query(
          `INSERT INTO users (id, email, password_hash, role, name) VALUES (gen_random_uuid()::text, $1, $2, 'admin', $3) ON CONFLICT (email) DO NOTHING`,
          ['guimarques1987etc@gmail.com', hash, 'Administrador']
        );
      } catch (_) {
        // Fallback para SQLite com UUID manual
        const uuid = `admin-${Date.now()}`;
        await query(
          `INSERT INTO users (id, email, password_hash, role, name) VALUES ($1, $2, $3, 'admin', $4) ON CONFLICT (email) DO NOTHING`,
          [uuid, 'guimarques1987etc@gmail.com', hash, 'Administrador']
        );
      }
      console.log('Admin user seeded.');
    }

    // Tabela de configuração do robô WhatsApp
    const isPgExt = !!externalPool || !!pool;
    const extQueryFn = externalPool ? externalQuery : query;
    await extQueryFn(`
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
        workflow_id TEXT,
        instance_id TEXT,
        webhook_url TEXT,
        updated_at ${isPgExt ? 'TIMESTAMPTZ DEFAULT NOW()' : 'TEXT DEFAULT current_timestamp'}
      );
    `);

    // Tabela para múltiplos fluxos vinculados
    await extQueryFn(`
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
      try {
        await extQueryFn(`
          ALTER TABLE config_robo 
          ALTER COLUMN "ativa-robo" TYPE INTEGER USING "ativa-robo"::integer,
          ALTER COLUMN "ativa-ia" TYPE INTEGER USING "ativa-ia"::integer;
        `);
      } catch (err) { /* Coluna já pode ser integer ou comando falhou silenciosamente */ }
    }

    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "status-recuperador" INTEGER DEFAULT 0`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "qtd-dias" INTEGER DEFAULT 0`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "qtd-dias-maximo" INTEGER DEFAULT 0`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "status-lembrete" INTEGER DEFAULT 0`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "workflow_id" TEXT`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "instance_id" TEXT`); } catch (err) { }
    try { await extQueryFn(`ALTER TABLE config_robo ADD COLUMN "webhook_url" TEXT`); } catch (err) { }

    // Migração inicial de config_robo para lojista_workflows se houver dados antigos
    try {
      if (isPgExt) {
        await extQueryFn(`
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


  } catch (err) {
    console.error('Error initializing DB:', err);
  }
};
