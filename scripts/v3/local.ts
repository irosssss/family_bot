import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import express from 'express';
import react from '@vitejs/plugin-react';
import { createServer as createViteServer } from 'vite';
import { connectV3Database, type V3Database } from '../../src/v3-server/db/client.js';
import { parseV3DatabaseConfig, type V3DatabaseConfig } from '../../src/v3-server/db/config.js';
import { migrateV3Database } from '../../src/v3-server/db/migrate.js';
import { createV3HttpApp } from '../../src/v3-server/transport/http.js';
import { digest } from '../../src/v3-server/auth/crypto.js';
import { V3Error } from '../../src/v3-server/contracts/errors.js';
import { V3_TEST_IMAGE, v3FoundationChildEnvironment } from './verify-foundation.js';

const root=fileURLToPath(new URL('../../',import.meta.url)),directory=resolve(root,'work/v3-local'),statePath=resolve(directory,'state.json');
const owner='family-v3-local',port=3003,origin='http://127.0.0.1:'+port;
const exec=promisify(execFile);
type LocalState={version:1;containerId:string;config:V3DatabaseConfig};
async function docker(args:string[],extra:NodeJS.ProcessEnv={}) {
  try {return (await exec('docker',args,{env:{...v3FoundationChildEnvironment(process.env),...extra},timeout:30000,maxBuffer:1024*1024})).stdout.trim();}
  catch {throw new Error('v3.local_docker_failed');}
}
async function assertOwned(state:LocalState) {
  if(!/^[a-f0-9]{64}$/.test(state.containerId))throw new Error('v3.local_owner_invalid');
  const raw=await docker(['inspect','--format','{{json .Id}} {{json .Config.Labels}}',state.containerId]);
  const at=raw.indexOf(' '),id=JSON.parse(raw.slice(0,at)),labels=JSON.parse(raw.slice(at+1));
  if(id!==state.containerId||labels?.['org.family-v3.owner']!==owner||labels?.['org.family-v3.run']!==state.config.runId)
    throw new Error('v3.local_owner_invalid');
}
async function readState():Promise<LocalState|null> {
  let info;
  try {info=await stat(statePath);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  if((info.mode&0o077)!==0)throw new Error('v3.local_config_permissions');
  const raw=JSON.parse(await readFile(statePath,'utf8'));
  if(raw.version!==1||typeof raw.containerId!=='string'||Object.keys(raw).sort().join(',')!=='config,containerId,version')
    throw new Error('v3.local_config_invalid');
  const state:LocalState={version:1,containerId:raw.containerId,config:parseV3DatabaseConfig(raw.config)};
  await assertOwned(state);return state;
}
async function startDatabase(state:LocalState):Promise<LocalState> {
  await assertOwned(state);await docker(['start',state.containerId]);
  const binding=/^127\.0\.0\.1:([0-9]+)$/.exec(await docker(['port',state.containerId,'5432/tcp']));
  if(!binding)throw new Error('v3.local_binding_invalid');
  const next={...state,config:parseV3DatabaseConfig({...state.config,port:Number(binding[1])})};
  const temporary=statePath+'.'+randomBytes(8).toString('hex')+'.tmp';
  await writeFile(temporary,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,statePath);
  return next;
}
async function prepare():Promise<LocalState> {
  const existing=await readState();
  if(existing)return startDatabase(existing);
  await mkdir(directory,{recursive:true,mode:0o700});
  // Lock creation across two local starts. It contains no secret and is removed only by its owner.
  const {open,unlink}=await import('node:fs/promises');
  const lock=resolve(directory,'create.lock');
  let handle;
  try {handle=await open(lock,'wx',0o600);}catch{throw new Error('v3.local_creation_in_progress');}
  try {
    const next=await readState();if(next)return startDatabase(next);
    const runId=randomBytes(16).toString('hex'),password=randomBytes(32).toString('hex');
    const database='family_v3_31_'+runId,clusterName='family-v3-31-'+runId;
    const id=await docker(['create','--name',owner+'-'+runId,'--label','org.family-v3.owner='+owner,
      '--label','org.family-v3.run='+runId,'--publish','127.0.0.1::5432',
      '--env','POSTGRES_PASSWORD','--env','POSTGRES_USER','--env','POSTGRES_DB',V3_TEST_IMAGE,
      'postgres','-c','cluster_name='+clusterName,'-c','min_wal_size=32MB','-c','max_wal_size=64MB'],
      {POSTGRES_PASSWORD:password,POSTGRES_USER:'family_v3_31',POSTGRES_DB:database});
    if(!/^[a-f0-9]{64}$/.test(id))throw new Error('v3.local_container_invalid');
    // Record ownership and the generated credential before starting the container;
    // a subsequent run can resume a failed start without guessing container names.
    const config=parseV3DatabaseConfig({mode:'synthetic',host:'127.0.0.1',port:1,database,user:'family_v3_31',password,runId,clusterName});
    const state:LocalState={version:1,containerId:id,config};await assertOwned(state);
    await writeFile(statePath,JSON.stringify(state)+'\n',{mode:0o600,flag:'wx'});
    return startDatabase(state);
  } finally {await handle.close();await unlink(lock);}
}
export async function runV3Local(action='run') {
  if(!['run','status','stop'].includes(action))throw new Error('v3.local_action_invalid');
  if(action!=='run'){
    const state=await readState();
    if(!state){console.info('V3 local: ещё не создан.');return;}
    if(action==='stop'){await docker(['stop',state.containerId]);console.info('V3 local: PostgreSQL остановлен, данные сохранены.');return;}
    const running=await docker(['inspect','--format','{{.State.Running}}',state.containerId]);
    console.info(JSON.stringify({mode:'synthetic',container:state.containerId,databaseRunning:running==='true',url:origin+'/family-life-v3.html'}));
    return;
  }
  const state=await prepare();let database:V3Database|undefined;
  for(let i=0;i<40;i++){try{database=await connectV3Database(state.config);break;}catch{await new Promise(r=>setTimeout(r,250));}}
  if(!database)throw new Error('v3.local_database_not_ready');
  await migrateV3Database(database);
  const app=createV3HttpApp({database,origin,mode:'local',verifyIdentity:async credential=>{
    if(!['local-owner','local-second','local-third'].includes(String(credential)))throw new V3Error('FORBIDDEN');
    return digest('synthetic:'+state.config.runId+':'+credential);
  }});
  app.use((req,res,next)=>{
    if(req.headers.host!==new URL(origin).host){res.status(403).end();return;}
    next();
  });
  app.use('/assets/game/family_life_v3',express.static(resolve(root,'public/assets/game/family_life_v3'),{dotfiles:'deny',fallthrough:false}));
  app.get('/',(_req,res)=>res.redirect('/family-life-v3.html'));
  const vite=await createViteServer({root,configFile:false,envDir:false,envPrefix:'V3_PUBLIC_DISABLED_',publicDir:false,
    plugins:[react()],server:{middlewareMode:true,hmr:false},appType:'mpa'});
  app.use(vite.middlewares);
  const server=createServer(app);
  try {await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});}
  catch(error){await vite.close();await database.close();throw error;}
  console.info('V3 local: '+origin+'/family-life-v3.html');
  console.info('Синтетическая семья сохраняется в отдельном PostgreSQL. PIN задаётся при первом входе.');
  let closing=false;
  const close=async()=>{if(closing)return;closing=true;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await vite.close();await database!.close();};
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  runV3Local(process.argv[2]).catch(()=>{console.error('V3 local: запуск не завершён. Проверьте Docker, порт 3003 и собственный локальный конфиг.');process.exitCode=1;});
