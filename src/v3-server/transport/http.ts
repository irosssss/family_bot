import express, { type Request, type Response, type NextFunction } from 'express';
import type { V3Database } from '../db/client.js';
import { createIdentityService, createFamilyAdminService, type LoginVerifier } from '../auth/service.js';
import { V3Error } from '../contracts/errors.js';
import { parseStrictJson } from '../contracts/envelope.js';
import { createGameService } from '../game/service.js';
import { GameError } from '../game/errors.js';
import type { VerifiedActor } from '../access/service.js';

export type V3HttpOptions = { database: V3Database; origin: string; mode: 'local' | 'telegram'; verifyIdentity: LoginVerifier };
const cookieName = 'family_v3_session';
function cookie(req: Request): string {
  const matches=(req.headers.cookie??'').split(';').map(c=>c.trim()).filter(c=>c.startsWith(cookieName+'='));
  if(matches.length!==1)throw new V3Error('FORBIDDEN');
  return matches[0].slice(cookieName.length+1);
}
export function createV3HttpApp(options: V3HttpOptions) {
  const origin=new URL(options.origin);
  if(origin.origin!==options.origin || !['http:','https:'].includes(origin.protocol) ||
    (options.mode==='local' && !['127.0.0.1','localhost'].includes(origin.hostname)) ||
    (options.mode==='telegram' && origin.protocol!=='https:')) throw new Error('v3.http_origin_invalid');
  const identity=createIdentityService(options.database,options.verifyIdentity);
  const game=createGameService(identity.access), admin=createFamilyAdminService(identity.access);
  const app=express();
  app.disable('x-powered-by');
  app.use('/v3/api',(req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    if(req.headers.host!==origin.host)return res.status(403).json({code:'FORBIDDEN',message:'Адрес запроса не разрешён.'});
    if(req.headers.origin && req.headers.origin!==options.origin)return res.status(403).json({code:'FORBIDDEN',message:'Источник запроса не разрешён.'});
    if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({code:'FORBIDDEN',message:'Источник запроса не разрешён.'});
    if(req.method!=='GET' && (req.headers.origin!==options.origin || req.headers['x-v3-request']!=='1'))
      return res.status(403).json({code:'FORBIDDEN',message:'Откройте приложение заново.'});
    next();
  });
  app.use('/v3/api',(req,res,next)=>{
    if(req.method==='POST' && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))
      return res.status(415).json({code:'VALIDATION',message:'Неверный формат запроса.'});
    next();
  });
  app.use('/v3/api',express.text({type:'application/json',limit:'64kb'}));
  const attempts=new Map<string,{count:number;until:number}>();
  app.use('/v3/api/auth',(req,res,next)=>{
    const key=req.socket.remoteAddress??'unknown', now=Date.now();
    for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);
    if(attempts.size>=1024&&!attempts.has(key))return res.status(429).json({code:'RATE_LIMIT',message:'Повторите позже.'});
    const current=attempts.get(key)??{count:0,until:now+60_000};
    current.count++;attempts.set(key,current);
    if(current.count>30)return res.status(429).json({code:'RATE_LIMIT',message:'Слишком много попыток. Подождите минуту.'});
    next();
  });
  const route=(handler:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{
    void handler(req,res).catch(next);
  };
  const input=(req:Request)=>parseStrictJson(req.body);
  const authenticate=async(req:Request)=>identity.access.authenticate(cookie(req));
  const setSession=(res:Response,session:{token:string})=>{
    res.cookie(cookieName,session.token,{httpOnly:true,sameSite:'strict',secure:origin.protocol==='https:',path:'/v3/api',maxAge:7*24*60*60*1000});
  };
  app.get('/v3/api/meta',(_req,res)=>res.json({mode:options.mode,contract:'family_life_v3.commands',version:'0.1'}));
  app.get('/v3/api/health',route(async(_req,res)=>{
    await options.database.sql`select 1`;
    res.json({ok:true,mode:options.mode});
  }));
  app.post('/v3/api/auth/login',route(async(req,res)=>{
    const result=await identity.login(input(req));setSession(res,result);
    res.json({recoveryCode:result.recoveryCode});
  }));
  app.post('/v3/api/auth/recover',route(async(req,res)=>{
    const result=await identity.recover(input(req));setSession(res,result);
    res.json({recoveryCode:result.recoveryCode});
  }));
  app.post('/v3/api/auth/switch',route(async(req,res)=>{
    const result=await identity.switchProfile(await authenticate(req),cookie(req),input(req));
    setSession(res,result);res.json({ok:true});
  }));
  app.post('/v3/api/auth/logout',route(async(req,res)=>{
    await identity.logout(await authenticate(req),cookie(req));
    res.clearCookie(cookieName,{path:'/v3/api',httpOnly:true,sameSite:'strict',secure:origin.protocol==='https:'});
    res.json({ok:true});
  }));
  app.get('/v3/api/session',route(async(req,res)=>res.json(await identity.describe(await authenticate(req),cookie(req)))));
  app.get('/v3/api/game',route(async(req,res)=>res.json(await game.read(await authenticate(req)))));
  app.post('/v3/api/commands',route(async(req,res)=>res.json(await game.dispatch(await authenticate(req),req.body))));
  const adminRoutes: Record<string,(actor:VerifiedActor,value:unknown)=>Promise<unknown>> = {
    'add-member':admin.addMember,'update-member':admin.updateMember,'invite':admin.invite,
  };
  for(const [path,method] of Object.entries(adminRoutes))
    app.post('/v3/api/family/'+path,route(async(req,res)=>res.json(await method(await authenticate(req),input(req))??{ok:true})));
  app.get('/v3/api/family/roster',route(async(req,res)=>res.json(await admin.roster(await authenticate(req)))));
  app.use('/v3/api',(_req,res)=>res.status(404).json({code:'NOT_FOUND',message:'Маршрут не найден.'}));
  app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof V3Error) {
      const status=error.code==='VALIDATION'?400:error.code==='CONFLICT'||error.code==='STALE_ACTOR'?409:403;
      return res.status(status).json({code:error.code,message:error.code==='FORBIDDEN'?'Войдите в профиль или проверьте PIN. После пяти ошибок действует пауза 15 минут.':
        error.code==='VALIDATION'?'Проверьте заполненные поля.':'Данные изменились. Обновите экран.'});
    }
    if(error instanceof GameError)return res.status(error.code==='VALIDATION'?400:409).json({code:error.code,message:error.message});
    if((error as {type?:string})?.type==='entity.too.large')return res.status(413).json({code:'VALIDATION',message:'Запрос слишком большой.'});
    return res.status(500).json({code:'UNAVAILABLE',message:'Не удалось подтвердить результат. Повторите тот же запрос.'});
  });
  return app;
}
