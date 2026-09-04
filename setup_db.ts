import { seedDatabase } from './src/db/seed';

export async function initializeDatabase() {
  console.log('Initializing database connection...');
  // Demo-профили нужны только локальной песочнице. В production первая семья
  // создаётся первым верифицированным Telegram-пользователем, без фейковых
  // родителей с заранее известными telegram_id.
  if (process.env.NODE_ENV === 'production') {
    console.log('Production database: demo seed skipped.');
    return;
  }
  await seedDatabase();
}
