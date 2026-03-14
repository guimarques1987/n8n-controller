import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config();

const client = new Client({ 
  connectionString: process.env.EXTERNAL_DATABASE_URL || 'postgres://postgres:96f5f11c0b0c9ac2dab0@paineleasypanel.cardapioclick.com.br:5332/banco-dados?sslmode=disable', 
  ssl: { rejectUnauthorized: false } 
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to DB');

    // Add necessary columns if they do not exist
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "ativa-robo" BOOLEAN DEFAULT false');
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "ativa-ia" BOOLEAN DEFAULT false');
    
    try { await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "msg-saudacao" TEXT DEFAULT \'\''); } catch (e) {}
    try { await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "msg-fechado" TEXT DEFAULT \'\''); } catch (e) {}
    
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "link-foto-aberto" TEXT DEFAULT \'\'');
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "link-foto-fechado" TEXT DEFAULT \'\'');
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "tipo_mensagem_aberto" TEXT DEFAULT \'texto\'');
    await client.query('ALTER TABLE "Clientes" ADD COLUMN IF NOT EXISTS "tipo_mensagem_fechado" TEXT DEFAULT \'texto\'');
    
    console.log('Migration complete. You can now update the server code.');
  } catch (err) {
    console.error('Migration failed', err);
  } finally {
    await client.end();
  }
}

migrate();
