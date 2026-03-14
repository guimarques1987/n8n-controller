import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgres://postgres:96f5f11c0b0c9ac2dab0@paineleasypanel.cardapioclick.com.br:5332/banco-dados?sslmode=disable' });
client.connect().then(async () => {
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Clientes'");
    const cols = res.rows.filter(c => ['ativa-robo', 'ativa-ia', 'fechado-aberto'].includes(c.column_name));
    console.log(cols);
}).catch(e => console.error(e)).finally(() => client.end());
