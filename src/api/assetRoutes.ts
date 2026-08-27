/**
 * Роуты загрузки ассетов.
 * POST /upload-zips — приём ZIP-архивов спрайт-паков и запуск распаковки.
 */
import { Request, Response, Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

export const assetRoutes = Router();

const upload = multer({ dest: path.join(process.cwd(), 'raw_archives') });

assetRoutes.post('/upload-zips', upload.array('files'), (req: Request, res: Response) => {
 if (!req.files || req.files.length === 0) {
 return res.status(400).json({ error: 'No files uploaded' });
 }

 // Rename uploaded files to keep .zip extension
 const uploadedFiles = req.files as Express.Multer.File[];
 uploadedFiles.forEach(file => {
 const newPath = path.join(process.cwd(), 'raw_archives', file.originalname);
 fs.renameSync(file.path, newPath);
 console.log(` Saved uploaded file: ${file.originalname}`);
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
