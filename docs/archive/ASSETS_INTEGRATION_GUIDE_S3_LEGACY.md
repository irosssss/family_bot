# Руководство по интеграции ассетов GandalfHardcore (S3 & Drizzle ORM)

В этом документе описан процесс интеграции оригинальных 32-bit RPG ассетов от GandalfHardcore в наше семейное Telegram Mini App. Мы используем S3-совместимое объектное хранилище (например, AWS S3, Cloudflare R2, Yandex Object Storage) для хранения графики, а Drizzle ORM — для связи метаданных ассетов в PostgreSQL.

## 1. Архитектура Хранилища в S3 (Folder Structure)

Для удобной навигации и программного доступа с фронтенда структура S3-бакета должна быть иерархической. Корневая директория — `assets/game/`.

```text
bucket-name/
└── assets/
    └── game/
        ├── characters/
        │   ├── bases/          # Базовые тела (GandalfHardcore Character Asset Pack.zip)
        │   ├── hair/           # Прически (58x Hair.zip)
        │   ├── ears/           # Уши (10x Elven ears.zip)
        │   ├── clothing/       # Одежда (43x Female Clothing.zip, 7x Male Clothing.zip)
        │   ├── layers/         # Слои (Back layers s.zip, 14x Arm Layers.zip)
        │   └── hats_masks/     # Шляпы и маски (39x Hats.zip, Masks.zip)
        ├── equipment/
        │   └── hand_items/     # Оружие, щиты (36x Hand Items.zip)
        ├── entities/
        │   ├── bosses/         # Боссы (Slime Enemy.zip)
        │   └── pets/           # Питомцы (Pet companion.zip)
        ├── ui/                 
        │   ├── icons/          # Иконки (Emojis and Icons.zip)
        │   └── effects/        # Эффекты (character effects.zip)
        └── npcs/               # NPC (FREE NPC.zip, FREE Warrior.zip)
```

**Правила нейминга:**
- Все файлы приводятся к нижнему регистру: `snake_case`.
- Формат: `.png` (спрайт-листы и покадровые анимации).

---

## 2. Сценарий загрузки и парсинга (Node.js)

Данный скрипт автоматизирует распаковку локальных ZIP-архивов и загрузку файлов в S3.
*Перед запуском установите зависимости: `npm i @aws-sdk/client-s3 adm-zip` и `npm i -D @types/adm-zip`.*

Создайте файл `scripts/upload-assets.ts`:

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import mime from 'mime-types'; // Опционально: npm i mime-types

// Настройки S3 (берем из .env)
const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT, // Для кастомных S3 (MinIO, R2, Yandex)
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'my-game-assets';

// Маппинг архивов в S3-папки
const ARCHIVE_MAP: Record<string, string> = {
  'GandalfHardcore Character Asset Pack.zip': 'characters/bases',
  'GandalfHardcore 36x Hand Items.zip': 'equipment/hand_items',
  'GandalfHardcore 43x Female Clothing.zip': 'characters/clothing',
  'GandalfHardcore 58x Hair.zip': 'characters/hair',
  'GandalfHardcore Slime Enemy.zip': 'entities/bosses',
  'Pet companion.zip': 'entities/pets',
  // Добавьте остальные архивы по аналогии...
};

// Функция приведения имен файлов к snake_case
const toSnakeCase = (str: string) =>
  str
    .replace(/\W+/g, ' ')
    .trim()
    .split(' ')
    .join('_')
    .toLowerCase()
    .replace(/_png$/, '.png');

async function processAndUpload() {
  const archivesDir = path.join(__dirname, '../raw_archives'); // Папка с вашими ZIP

  if (!fs.existsSync(archivesDir)) {
    console.error(`Директория ${archivesDir} не найдена.`);
    return;
  }

  const files = fs.readdirSync(archivesDir).filter(f => f.endsWith('.zip'));

  for (const file of files) {
    const s3Folder = ARCHIVE_MAP[file] || 'misc';
    const zipPath = path.join(archivesDir, file);
    
    console.log(`\n📦 Распаковка: ${file} -> assets/game/${s3Folder}/`);
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.isDirectory || !entry.entryName.endsWith('.png')) continue; // Только картинки
      
      const fileName = path.basename(entry.entryName);
      const safeName = toSnakeCase(fileName.replace('.png', '')) + '.png';
      const s3Key = `assets/game/${s3Folder}/${safeName}`;
      
      const fileBuffer = entry.getData();
      
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000', // Кэшируем ассеты на год
          })
        );
        console.log(`  ✅ Загружено: ${s3Key}`);
      } catch (err) {
        console.error(`  ❌ Ошибка загрузки ${s3Key}:`, err);
      }
    }
  }
  console.log('\n🎉 Все ассеты успешно загружены в S3!');
}

processAndUpload().catch(console.error);
```

---

## 3. Расширенная схема Базы Данных (Drizzle ORM)

Дополним наш `src/db/schema.ts` для связи игровых предметов, питомцев и боссов с их файлами в S3. Мы добавим новые поля (`s3_url`, `layer_z_index` и т.д.).

```typescript
// Фрагмент для добавления/обновления в src/db/schema.ts

import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

// --- ITEMS (Оружие, броня, одежда, шляпы) ---
export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'weapon', 'clothing', 'hat', 'hair'
  s3_url: text('s3_url').notNull(), // Путь в S3, например: https://bucket.url/assets/game/equipment/hand_items/iron_sword.png
  layer_z_index: integer('layer_z_index').default(10), // Порядок наложения (z-index при рендере)
  stats_modifier: jsonb('stats_modifier').default({}), // Модификаторы статов ({"atk": 5})
  cost_coins: integer('cost_coins').notNull().default(0), // Цена в золоте
  is_premium: boolean('is_premium').default(false),
  created_at: timestamp('created_at').defaultNow(),
});

// --- PETS (Питомцы компаньоны) ---
export const pets = pgTable('pets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  s3_sprite_url: text('s3_sprite_url').notNull(), // Путь к спрайт-листу питомца
  animation_frames: integer('animation_frames').notNull().default(4), // Количество кадров анимации в спрайт-листе
  evolution_stage: integer('evolution_stage').notNull().default(1),
  cost_coins: integer('cost_coins').notNull().default(0),
  created_at: timestamp('created_at').defaultNow(),
});

// --- BOSSES (Сюжетные/еженедельные боссы) ---
export const bosses = pgTable('bosses', {
  id: serial('id').primaryKey(),
  week_key: text('week_key').notNull(),
  name: text('name').notNull(),
  s3_sprite_url: text('s3_sprite_url'), // Ссылка на спрайт слизня/босса в S3
  emoji: text('emoji').notNull(), 
  max_hp: integer('max_hp').notNull().default(100), // Максимальное здоровье
  hp: integer('hp').notNull(), // Текущее здоровье
  damage: integer('damage').notNull().default(0), // Урон по игрокам
  defeated: integer('defeated').notNull().default(0),
});
```

*(Обратите внимание: если эти таблицы уже есть в базе, потребуется миграция через `drizzle-kit generate` и `drizzle-kit push`)*

---

## 4. SQL-скрипт Сидирования (Database Seed)

Исторический пример. Скрипт `src/db/seed-assets.ts` удалён как устаревший и не является
частью текущего проекта; этот блок оставлен только для истории интеграции.

```typescript
import { db } from './index'; // Экземпляр подключения drizzle
import { items, pets, bosses } from './schema';
import 'dotenv/config';

// Укажите базовый URL вашего S3-бакета
const S3_BASE_URL = process.env.S3_PUBLIC_URL || 'https://my-bucket.s3.us-east-1.amazonaws.com';

const seedAssets = async () => {
  console.log('🌱 Начинаем сидирование ассетов GandalfHardcore...');

  // 1. Сидирование экипировки (Items)
  const seedItems = [
    {
      name: 'Меч новичка',
      type: 'weapon',
      s3_url: `${S3_BASE_URL}/assets/game/equipment/hand_items/basic_sword.png`,
      layer_z_index: 20,
      cost_coins: 50,
      stats_modifier: { atk: 2 },
    },
    {
      name: 'Шляпа мага',
      type: 'hat',
      s3_url: `${S3_BASE_URL}/assets/game/characters/hats_masks/wizard_hat.png`,
      layer_z_index: 30,
      cost_coins: 150,
      stats_modifier: { mp: 10 },
    },
    {
      name: 'Туника странника',
      type: 'clothing',
      s3_url: `${S3_BASE_URL}/assets/game/characters/clothing/male_tunic_01.png`,
      layer_z_index: 10,
      cost_coins: 100,
      stats_modifier: { hp: 5 },
    }
  ];

  for (const item of seedItems) {
    await db.insert(items).values(item).onConflictDoNothing();
  }
  console.log('✅ Экипировка добавлена.');

  // 2. Сидирование питомцев (Pets)
  const seedPets = [
    {
      name: 'Огонек Wisp',
      s3_sprite_url: `${S3_BASE_URL}/assets/game/entities/pets/wisp_idle.png`,
      animation_frames: 6,
      evolution_stage: 1,
      cost_coins: 500,
    },
    {
      name: 'Малый Слайм',
      s3_sprite_url: `${S3_BASE_URL}/assets/game/entities/pets/slime_companion.png`,
      animation_frames: 4,
      evolution_stage: 1,
      cost_coins: 300,
    }
  ];

  for (const pet of seedPets) {
    await db.insert(pets).values(pet).onConflictDoNothing();
  }
  console.log('✅ Питомцы добавлены.');

  // 3. Сидирование босса (Slime Boss)
  const slimeBoss = {
    week_key: 'week_1_slime',
    name: 'Король Слизней',
    emoji: '🦠',
    max_hp: 5000,
    hp: 5000,
    damage: 15,
    s3_sprite_url: `${S3_BASE_URL}/assets/game/entities/bosses/giant_slime_boss.png`,
  };

  await db.insert(bosses).values(slimeBoss).onConflictDoNothing();
  console.log('✅ Босс "Король Слизней" добавлен.');

  console.log('🎉 Сидирование успешно завершено!');
};

seedAssets()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Ошибка сидирования:', err);
    process.exit(1);
  });
```

### Использование:
1. Загрузите архивы в папку `raw_archives/`.
2. Настройте S3 переменные окружения в `.env`.
3. Запустите uploader: `npx tsx scripts/upload-assets.ts`
4. Обновите схему БД: `npm run db:push`
5. Не запускайте исторический seed: `src/db/seed-assets.ts` удалён.
