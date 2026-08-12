import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

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
  '7x Male Clothing.zip': 'characters/clothing',
  'GandalfHardcore 58x Hair.zip': 'characters/hair',
  '10x Elven ears.zip': 'characters/ears',
  'GandalfHardcore 39x Hats.zip': 'characters/hats_masks',
  'Masks.zip': 'characters/hats_masks',
  'GandalfHardcore Back layers s.zip': 'characters/layers',
  '14x Arm Layers.zip': 'characters/layers',
  'GandalfHardcore Slime Enemy.zip': 'entities/bosses',
  'Pet companion.zip': 'entities/pets',
  'GandalfHardcore Emojis and Icons.zip': 'ui/icons',
  'character effects.zip': 'ui/effects',
  'GandalfHardcore FREE NPC.zip': 'npcs',
  'FREE Warrior.zip': 'npcs'
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
  const archivesDir = path.join(__dirname, '../raw_archives');

  if (!fs.existsSync(archivesDir)) {
    console.error(`Директория ${archivesDir} не найдена. Создайте папку raw_archives и положите туда ZIP-файлы.`);
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
      if (entry.isDirectory || !entry.entryName.endsWith('.png')) continue;
      
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
            CacheControl: 'public, max-age=31536000',
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
