import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';

// Ключевые слова для поиска нужной папки по названию архива
const ARCHIVE_MAP = [
  { key: 'Character Asset Pack', folder: 'characters/bases' },
  { key: 'Hand Items', folder: 'equipment/hand_items' },
  { key: 'Female Clothing', folder: 'characters/clothing' },
  { key: 'Male Clothing', folder: 'characters/clothing' },
  { key: 'Hair', folder: 'characters/hair' },
  { key: 'Elven ears', folder: 'characters/ears' },
  { key: 'Hats', folder: 'characters/hats_masks' },
  { key: 'Masks', folder: 'characters/hats_masks' },
  { key: 'Back layers', folder: 'characters/layers' },
  { key: 'Arm Layers', folder: 'characters/layers' },
  { key: 'Slime Enemy', folder: 'entities/bosses' },
  { key: 'Pet companion', folder: 'entities/pets' },
  { key: 'Emojis and Icons', folder: 'ui/icons' },
  { key: 'character effects', folder: 'ui/effects' },
  { key: 'FREE NPC', folder: 'npcs' },
  { key: 'FREE Warrior', folder: 'npcs' }
];

// Функция приведения имен файлов к аккуратному виду (snake_case)
const toSnakeCase = (str: string) =>
  str
    .replace(/\W+/g, ' ')
    .trim()
    .split(' ')
    .join('_')
    .toLowerCase()
    .replace(/_png$/, '.png');

function processArchives() {
  const archivesDir = path.join(process.cwd(), 'raw_archives');
  const publicAssetsDir = path.join(process.cwd(), 'public/assets/game');

  if (!fs.existsSync(archivesDir)) {
    console.error(`❌ Папка ${archivesDir} не найдена. Создай папку raw_archives и положи туда ZIP-архивы.`);
    return;
  }

  const files = fs.readdirSync(archivesDir).filter(f => f.endsWith('.zip'));

  if (files.length === 0) {
    console.log(`⚠️ В папке raw_archives нет ZIP-файлов.`);
    return;
  }

  for (const file of files) {
    // Находим нужную папку по ключевому слову в названии файла
    const mapping = ARCHIVE_MAP.find(m => file.includes(m.key));
    const targetFolder = mapping ? mapping.folder : 'misc';
    const extractPath = path.join(publicAssetsDir, targetFolder);
    const zipPath = path.join(archivesDir, file);
    
    console.log(`\n📦 Распаковка: ${file} -> public/assets/game/${targetFolder}/`);
    
    // Создаем папку, если ее нет
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      // Игнорируем папки и всё, кроме PNG картинок
      if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.png')) continue;
      
      const fileName = path.basename(entry.entryName);
      const safeName = toSnakeCase(fileName.replace('.png', '')) + '.png';
      const finalFilePath = path.join(extractPath, safeName);
      
      const fileBuffer = entry.getData();
      
      try {
        fs.writeFileSync(finalFilePath, fileBuffer);
        console.log(`  ✅ Сохранено: ${safeName}`);
      } catch (err) {
        console.error(`  ❌ Ошибка сохранения ${safeName}:`, err);
      }
    }
  }
  console.log('\n🎉 Все ассеты успешно распакованы в папку public!');
}

processArchives();
