import { seedDatabase } from './src/db/seed';

export function initializeDatabase() {
  console.log('Initializing database connection...');
  seedDatabase();
}
