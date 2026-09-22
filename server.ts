/** Serves the V3 local-state preview; prepared family APIs are not exposed. */
import express from 'express';
import path from 'node:path';
const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
app.get('/api/health', (_req, res) => res.json({status: 'ok', mode: 'v3-local-preview'}));
app.use('/api', (_req, res) => res.status(404).json({error: 'API_NOT_ENABLED'}));
app.use(express.static(path.resolve('dist'), {index: 'index.html'}));
app.listen(port, host, () => console.log(`V3 preview: http://${host}:${port}`));
