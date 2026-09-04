import 'dotenv/config';
import postgres, { type Sql } from 'postgres';

const dbName = `family_chores_migration_test_${Date.now()}_${Math.floor(Math.random() * 100_000)}`;
if (!/^family_chores_migration_test_\d+_\d+$/.test(dbName)) {
  throw new Error('Unsafe temporary database name');
}

const connection = {
  host: process.env.SQL_HOST || 'localhost',
  port: Number(process.env.SQL_PORT || 5432),
  username: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
  password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
  ssl: false as const,
};

if (!connection.username) {
  throw new Error('SQL_ADMIN_USER or SQL_USER is required');
}

const admin = postgres({ ...connection, database: 'postgres', max: 1 });
let verifier: Sql | undefined;
let migrationClient: Sql | undefined;

try {
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  process.env.SQL_DB_NAME = dbName;

  const [{ runMigrations }, dbModule] = await Promise.all([
    import('../src/db/migrate'),
    import('../src/db/index'),
  ]);
  migrationClient = dbModule.client;
  await runMigrations();
  const [{ seedDatabase }, { ensureCatalogInDb }] = await Promise.all([
    import('../src/db/seed'),
    import('../src/db/backfillCatalog'),
  ]);
  await seedDatabase();
  await ensureCatalogInDb();
  const [hydration, familyHydration, progress, state] = await Promise.all([
    import('../src/services/userStateHydration'),
    import('../src/services/familyGameStateService'),
    import('../src/services/progressService'),
    import('../src/services/stateService'),
  ]);
  await hydration.hydrateUsersFromDb();
  await familyHydration.hydrateFamilyGameStatesFromDb();
  const child = state.appState.users.find((user) => user.family_role !== 'parent');
  const task = state.appState.tasks.find((candidate) => candidate.family_id === child?.family_id);
  if (!child || !task) throw new Error('Bootstrap did not create a child and task for transaction probe');
  const completed = await progress.completeTaskAtomic(child, task);
  if (completed.status !== 'completed') {
    throw new Error(`Atomic completion probe failed: ${completed.status}`);
  }
  const undone = await progress.undoTaskCompletionAtomic(child, task);
  if (undone.status !== 'undone') {
    throw new Error(`Atomic undo probe failed: ${undone.status}`);
  }

  verifier = postgres({ ...connection, database: dbName, max: 1 });
  const requiredTables = [
    'families',
    'users',
    'tasks',
    'completions',
    'rewards',
    'purchases',
    'bosses',
    'challenges',
    'family_challenges',
    'payments',
  ];
  const tables = await verifier<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ${verifier(requiredTables)}
  `;
  const presentTables = new Set(tables.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !presentTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(`Missing tables: ${missingTables.join(', ')}`);
  }

  const columns = await verifier<{ table_name: string; column_name: string; is_nullable: string }[]>`
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('users', 'family_id'),
        ('tasks', 'family_id'),
        ('rewards', 'family_id'),
        ('bosses', 'family_id'),
        ('pets', 'code'),
        ('completions', 'effects'),
        ('users', 'family_pro_until')
      )
  `;
  const presentColumns = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  const requiredColumns = [
    'users.family_id',
    'tasks.family_id',
    'rewards.family_id',
    'bosses.family_id',
    'pets.code',
    'completions.effects',
    'users.family_pro_until',
  ];
  const missingColumns = requiredColumns.filter((column) => !presentColumns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
  }

  const indexes = await verifier<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('uq_completions_user_task_day', 'uq_bosses_family_id')
  `;
  if (indexes.length !== 2) {
    throw new Error(`Expected 2 critical indexes, found ${indexes.length}`);
  }

  const migrationRows = await verifier<{ name: string }[]>`
    SELECT name FROM __migrations WHERE name IN ('0001_initial_schema.sql', '0014_completions_unique_index.sql')
  `;
  if (migrationRows.length !== 2) {
    throw new Error('Migration journal does not contain the current baseline and completion index');
  }

  const bootstrapCounts = await verifier<{
    families: number;
    users: number;
    tasks: number;
    items: number;
    rewards: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM families) AS families,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM tasks) AS tasks,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM rewards) AS rewards
  `;
  const counts = bootstrapCounts[0];
  if (!counts || Object.values(counts).some((count) => count <= 0)) {
    throw new Error(`Bootstrap left empty tables: ${JSON.stringify(counts)}`);
  }
  const generatedReward = await verifier<{ id: number }[]>`
    INSERT INTO rewards (title, cost, reward_type, active)
    VALUES ('Sequence probe', 1, 'personal', 0)
    RETURNING id
  `;
  if (!generatedReward[0]?.id) throw new Error('Reward SERIAL sequence is not usable');

  console.log(
    `[db:verify-clean] OK: ${requiredTables.length} tables, ${requiredColumns.length} columns, 2 indexes, bootstrap and completion rollback`,
  );
} finally {
  await verifier?.end({ timeout: 1 });
  await migrationClient?.end({ timeout: 1 });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end({ timeout: 1 });
}
