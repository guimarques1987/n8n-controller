const { Client } = require('pg');
(async () => {
    const client = new Client({ connectionString: 'postgres://postgres:96f5f11c0b0c9ac2dab0@paineleasypanel.cardapioclick.com.br:5332/banco-dados?sslmode=disable' });
    try {
        await client.connect();
        // Create the plano column
        await client.query("ALTER TABLE \"Clientes\" ADD COLUMN IF NOT EXISTS plano TEXT DEFAULT 'basico'");
        console.log('Column plano added successfully.');

        // Print types
        const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Clientes' AND column_name IN ('ativa-robo', 'ativa-ia', 'status-recuperador', 'status-lembrete', 'plano')");
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.end();
    }
})();
