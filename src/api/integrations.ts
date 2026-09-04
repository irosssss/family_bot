import { Request, Response, Router } from 'express';
import { google } from 'googleapis';
import { db } from '../db';
import * as schema from '../db/schema';
import fs from 'fs';
import path from 'path';
import { eq, inArray } from 'drizzle-orm';
import { type AuthedRequest, getAuthFamilyId, requireAdmin } from '../utils/apiAuth';

export const integrationsRouter = Router();

/**
 * SEC-02 FIX: все /api/integrations/* требуют tma-сессию (глобальный guard больше
 * не исключает этот роутер) + права admin. Bearer Google-токен по-прежнему нужен,
 * но поверх проверенной сессии — слить БД в чужой Drive больше нельзя.
 */
integrationsRouter.use((req: AuthedRequest, res: Response, next: () => void) => {
  if (!requireAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden: admin only' });
  }
  next();
});

// Helper to get OAuth2 client
const getOAuth2Client = (req: Request) => {
  // Authorization занят TMA-сессией приложения. Google OAuth передаётся отдельно.
  const rawHeader = req.headers['x-google-access-token'];
  const token = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!token) throw new Error('Unauthorized: No token provided');
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });
  return oauth2Client;
};

// 1. Backup DB to Google Drive
integrationsRouter.post('/drive/backup', async (req: Request, res: Response) => {
  try {
    const oauth2Client = getOAuth2Client(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const familyId = getAuthFamilyId(req as AuthedRequest);
    if (familyId === null) return res.status(403).json({ error: 'Forbidden: user has no family' });

    // Fetch data
    const families = await db.select().from(schema.families).where(eq(schema.families.id, familyId));
    const users = await db.select().from(schema.users).where(eq(schema.users.family_id, familyId));
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.family_id, familyId));
    const items = await db.select().from(schema.items);

    const backupData = {
      timestamp: new Date().toISOString(),
      data: { families, users, tasks, items }
    };
    const fileContent = JSON.stringify(backupData, null, 2);
    
    // Check if folder exists
    let folderId = '';
    const folderRes = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Family Chores Backups' and trashed=false",
      fields: 'files(id, name)'
    });
    
    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: 'Family Chores Backups',
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id'
      });
      folderId = folder.data.id!;
    }

    const fileName = `backup-${new Date().toISOString().split('T')[0]}.json`;
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json'
      },
      media: {
        mimeType: 'application/json',
        body: fileContent
      },
      fields: 'id'
    });

    res.json({ success: true, message: 'Backup created successfully' });
  } catch (error: any) {
    console.error('Backup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Sync Assets to Google Drive
integrationsRouter.post('/drive/assets', async (req: Request, res: Response) => {
  try {
    const oauth2Client = getOAuth2Client(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let folderId = '';
    const folderRes = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Family Chores Assets' and trashed=false",
      fields: 'files(id, name)'
    });
    
    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: 'Family Chores Assets',
          mimeType: 'application/vnd.google-apps.folder'
        },
        fields: 'id'
      });
      folderId = folder.data.id!;
    }

    // Function to recursively find files
    const findFiles = (dir: string, fileList: string[] = []) => {
      if (!fs.existsSync(dir)) return fileList;
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          findFiles(filePath, fileList);
        } else {
          fileList.push(filePath);
        }
      });
      return fileList;
    };

    const assetsDir = path.join(process.cwd(), 'public');
    const allFiles = findFiles(assetsDir);
    let uploaded = 0;

    for (const filePath of allFiles) {
      if (!filePath.match(/\.(png|jpg|jpeg|gif|svg|zip)$/i)) continue;
      
      const fileName = path.basename(filePath);
      const mimeType = filePath.endsWith('.zip') ? 'application/zip' : 'image/png';
      
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: fs.createReadStream(filePath)
        },
        fields: 'id'
      });
      uploaded++;
    }

    res.json({ success: true, message: `Successfully synced ${uploaded} assets` });
  } catch (error: any) {
    console.error('Assets sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Export Reports to Google Sheets
integrationsRouter.post('/sheets/reports', async (req: Request, res: Response) => {
  try {
    const oauth2Client = getOAuth2Client(req);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const familyId = getAuthFamilyId(req as AuthedRequest);
    if (familyId === null) return res.status(403).json({ error: 'Forbidden: user has no family' });
    
    // Fetch data
    const familyUsers = await db.select({ id: schema.users.id }).from(schema.users)
      .where(eq(schema.users.family_id, familyId));
    const userIds = familyUsers.map((user) => user.id);
    const completionsData = userIds.length > 0
      ? await db.select().from(schema.completions).where(inArray(schema.completions.user_id, userIds))
      : [];
    const purchasesData = userIds.length > 0
      ? await db.select().from(schema.purchases).where(inArray(schema.purchases.user_id, userIds))
      : [];
    
    // Create new spreadsheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `Family Chores Report - ${new Date().toISOString().split('T')[0]}` },
        sheets: [
          { properties: { title: 'Completed Tasks' } },
          { properties: { title: 'Purchases (Expenses)' } }
        ]
      }
    });
    
    const spreadsheetId = spreadsheet.data.spreadsheetId!;
    
    // Prepare Tasks Data
    const tasksRows = [['ID', 'User ID', 'Task ID', 'Completed At', 'Points']];
    completionsData.forEach((c: any) => {
      tasksRows.push([c.id.toString(), c.user_id.toString(), c.task_id.toString(), c.completed_at, c.points?.toString() || '0']);
    });
    
    // Prepare Purchases Data
    const purchasesRows = [['ID', 'User ID', 'Reward ID', 'Reward Title', 'Created At']];
    purchasesData.forEach((p: any) => {
      purchasesRows.push([p.id.toString(), p.user_id.toString(), p.reward_id.toString(), p.reward_title || '', p.created_at]);
    });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Completed Tasks'!A1",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: tasksRows }
    });
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Purchases (Expenses)'!A1",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: purchasesRows }
    });

    res.json({ success: true, message: 'Reports exported successfully', spreadsheetUrl: spreadsheet.data.spreadsheetUrl });
  } catch (error: any) {
    console.error('Reports export error:', error);
    res.status(500).json({ error: error.message });
  }
});
