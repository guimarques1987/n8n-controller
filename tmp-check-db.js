require('dotenv').config();
const { Client } = require('pg');

async function checkDb() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        const res = await client.query('SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != \'pg_catalog\' AND schemaname != \'information_schema\';');
        console.log("Tables:", res.rows.map(r => r.tablename));
        
        // Find columns in lojista
        const res2 = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'lojista';
        `);
        console.log("Lojista columns:", res2.rows);

    } finally {
        await client.end();
    }
}
checkDb();
