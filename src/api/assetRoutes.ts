/**
 * Роуты загрузки ассетов.
 * POST /upload-zips — приём ZIP-архивов спрайт-паков и запуск распаковки.
 *
 * Безопасность (этап 3 аудита):
 *  - только parent/admin: в проде проверяется req.auth из глобального guard'а,
 *    в DEMO MODE — actorId из body (унаследованное поведение);
 *  - имя файла санитизируется: basename + жёсткий whitelist символов →
 *    path traversal невозможен;
 *  - принимаются только .zip, лимит 100 МБ на файл.
 */
import { Request, Response, Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { appState } from '../services/stateService';
import { isAuthEnforced, type AuthedRequest } from '../utils/apiAuth';

export const assetRoutes = Router();

const ARCHIVE_DIR = path.join(process.cwd(), 'raw_archives');
const MAX_ZIP_BYTES = 100 * 1024 * 1024; // 100 МБ

const upload = multer({
  dest: ARCHIVE_DIR,
  limits: { fileSize: MAX_ZIP_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      return cb(null, false); // не-zip просто не принимаются
    }
    cb(null, true);
  },
});

/** Basename + whitelist [A-Za-z0-9._-]; всё остальное → '_', '..' схлопывается. */
function sanitizeArchiveName(originalName: string): string {
  const base = path.basename(originalName).replace(/\.\./g, '_');
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return safe.startsWith('.') ? `_${safe.slice(1)}` : safe;
}

assetRoutes.post('/upload-zips', upload.array('files'), (req: AuthedRequest, res: Response) => {
  // --- Admin-guard: req.auth из глобального guard'а; в dev — actorId из body ---
  let isAdminActor = false;
  if (isAuthEnforced()) {
    isAdminActor = !!req.auth?.isAdmin;
  } else {
    const actor = appState.users.find((u) => u.id === Number((req.body || {}).actorId));
    isAdminActor = !!actor && (actor.is_admin || actor.family_role === 'parent');
  }

  if (!isAdminActor) {
    return res.status(403).json({ error: 'Только родитель (админ) может загружать ассеты' });
  }

  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'No zip files uploaded' });
  }

  uploadedFiles.forEach(file => {
    const safeName = sanitizeArchiveName(file.originalname);
    const newPath = path.join(ARCHIVE_DIR, safeName);
    fs.renameSync(file.path, newPath);
    console.log(` Saved uploaded file: ${safeName}`);
  });

  // Automatically unpack assets
  import('child_process').then(({ exec }) => {
    exec('npx tsx scripts/unpack-local.ts', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error unpacking: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Unpack stderr: ${stderr}`);
        return;
      }
      console.log(`Unpack output: ${stdout}`);
    });
  });

  res.json({ success: true, message: 'Files uploaded and unpacking started!' });
});
