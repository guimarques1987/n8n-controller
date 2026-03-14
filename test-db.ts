import { initDb, query, isDbReady } from './src/db';

async function test() {
  console.log('Testing database connection...');

  try {
    await initDb();

    if (!isDbReady()) {
      console.error('Database is not ready.');
      process.exit(1);
    }

    console.log('Successfully connected/initialized database!');
    const res = await query('SELECT CURRENT_TIMESTAMP as now');
    console.log('Current time from DB:', res.rows[0]);

    const count = await query('SELECT count(*) as count FROM instances');
    console.log('Instance count:', count.rows[0].count);

    console.log('Test completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

test();
