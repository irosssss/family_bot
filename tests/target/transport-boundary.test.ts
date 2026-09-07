import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { closedBootstrapGate, createTargetAccessApp, startTargetAccessServer } from '../../src/target/transport/http';
import { accessRoutes, type AccessServices } from '../../src/target/transport/routes';
import { parseBody } from '../../src/target/transport/contracts';

const bearer = Buffer.alloc(32,3).toString('base64url');
const launch = { id:'01951d56-b400-7000-8000-000000000001', account_id:'01951d56-b400-7000-8000-000000000002', expires_at:'2026-09-07T10:00:00.000Z' };
const command = vi.fn(async (): Promise<unknown> => Object.defineProperty({ ok:true, launch, private_record:{ verifier:'secret' } },'bearer',{ value:bearer }));
// Every service seam uses one counter: rejected envelopes must dispatch no command at all.
const methods = new Proxy({}, { get:() => command });
const services = { exchange:methods, lifecycle:new Proxy({}, { get:(_t,key) => key === 'adult'
  ? new Proxy({}, { get:(_a,name) => name === 'sessions' ? methods : command }) : command }) } as AccessServices;

describe('G03-G closed HTTP transport boundary',() => {
  let server: Awaited<ReturnType<typeof startTargetAccessServer>>;
  const audits: unknown[] = [];
  beforeAll(async () => { server = await startTargetAccessServer(services,{ bootstrapGate:closedBootstrapGate, audit:event => audits.push(event) }); });
  afterAll(async () => { await server?.close(); });
  function request(path='/access/v1/identity/exchange',body='{"init_data":"synthetic-secret"}',extra:Record<string,string>={},method='POST') {
    return fetch(server.origin+path,{ method, headers:{ Origin:server.origin,'Content-Type':'application/json','X-RPG-Credential':'none',...extra },
      ...(method === 'GET' || method === 'HEAD' ? {} : { body }) });
  }
  async function rejected(path:string,body:string,extra:Record<string,string>,status:number,method='POST') {
    const before=command.mock.calls.length,r=await request(path,body,extra,method);
    expect(r.status).toBe(status);expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('set-cookie')).toBeNull();expect(r.headers.get('access-control-allow-origin')).toBeNull();
    await r.text();expect(command.mock.calls.length).toBe(before);
  }
  it('delivers a non-enumerable bearer explicitly, excludes records and never creates an ETag',async()=>{
    const r=await request();expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true,launch,bearer});
    expect(r.headers.get('etag')).toBeNull();expect(r.headers.get('x-powered-by')).toBeNull();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it.each([
    ['missing origin',{Origin:''},403],['foreign origin',{Origin:'https://example.invalid'},403],['null origin',{Origin:'null'},403],
    ['forwarded',{Forwarded:'for=127.0.0.1'},403],
    ['forwarded host',{'X-Forwarded-Host':'127.0.0.1'},403],['cookie',{Cookie:'bearer=private'},403],
    ['content encoding',{'Content-Encoding':'gzip'},403],['cross site',{'Sec-Fetch-Site':'cross-site'},403],
    ['method override',{'X-HTTP-Method-Override':'GET'},403],['wrong mime',{'Content-Type':'text/plain'},415],
    ['wrong charset',{'Content-Type':'application/json; charset=latin1'},415],['extra bearer',{Authorization:`Bearer ${bearer}`},401],
    ['wrong scope',{'X-RPG-Credential':'session'},401],
  ])('rejects %s before dispatch',async(_label,headers,status)=>{
    await rejected('/access/v1/identity/exchange','{"init_data":"secret"}',headers as Record<string,string>,status as number);
  });
  it.each(['[]','null','{}','{"init_data":3}','{"init_data":"x","actorId":1}',
    '{"init_data":"x","init_data":"y"}','{"init_data":"x","init_\\u0064ata":"y"}',
    '{"init_data":"x","__proto__":{}}','{"init_data":"\\ud800"}','{"init_data":',
    '{"init_data":"x","account_id":"forged"}'])('rejects invalid JSON/closed input %s',async body=>{
    await rejected('/access/v1/identity/exchange',body,{},400);
  });
  it.each(['/access/v1/identity/exchange?bearer=secret','/access/v1/identity/exchange/',
    '/access/v1/Identity/exchange','/access/v1/activatePolicy','/access/v1/internal','/api/users'])('rejects non-exact route %s',async path=>{
    await rejected(path,'{}',{},404);
  });
  it.each(['GET','HEAD','PUT','DELETE','OPTIONS'])('rejects method %s',async method=>{
    await rejected('/access/v1/identity/exchange','{}',{},405,method);
  });
  it('rejects oversized envelopes before dispatch',async()=>{
    await rejected('/access/v1/identity/exchange',JSON.stringify({init_data:'x'.repeat(25000)}),{},413);
  });
  it('validates each protected scope and extra fields before dispatch',async()=>{
    for (const [path,route] of accessRoutes(services)) {
      if(route.credential==='none')continue;
      await rejected(path,'{}',{'X-RPG-Credential':route.credential},401);
      await rejected(path,'{}',{'X-RPG-Credential':'none',Authorization:`Bearer ${bearer}`},401);
      await rejected(path,'{"actorId":"forged"}',{'X-RPG-Credential':route.credential,Authorization:`Bearer ${bearer}`},400);
    }
  });
  it('keeps bootstrap closed and rejects client consent/gate overrides',async()=>{
    const auth={'X-RPG-Credential':'launch',Authorization:`Bearer ${bearer}`};
    await rejected('/access/v1/family/bootstrap','{}',auth,503);
    await rejected('/access/v1/family/bootstrap','{"consent":true,"gate":"synthetic"}',auth,400);
    expect(()=>createTargetAccessApp(services,{origin:server.origin,bootstrapGate:{state:'open'} as never})).toThrow();
    expect(()=>createTargetAccessApp(services,{origin:'https://example.invalid',bootstrapGate:closedBootstrapGate})).toThrow();
  });
  it('redacts thrown dependencies and unknown error keys, and logs only fixed route/status',async()=>{
    command.mockRejectedValueOnce(new Error('PIN=001234 initData=private bearer=private SQL=private'));
    let r=await request();expect(r.status).toBe(503);expect(await r.json()).toEqual({ok:false,error_key:'transport.unavailable'});
    command.mockResolvedValueOnce({ok:false,error_key:'private-query-and-token'});
    r=await request();expect(await r.json()).toEqual({ok:false,error_key:'transport.unavailable'});
    expect(JSON.stringify(audits)).not.toMatch(/synthetic-secret|001234|bearer|private|init_data/);
    for(const event of audits)expect(Object.keys(event as object).sort()).toEqual(['route','status']);
  });
  it('does not serialize unexpected nested output',async()=>{
    command.mockResolvedValueOnce({ok:true,launch:{...launch,id:{secret:'private'}}});
    const r=await request();expect(r.status).toBe(503);expect(await r.json()).toEqual({ok:false,error_key:'transport.unavailable'});
  });
  it('rejects malformed UTF-8 and duplicate raw headers without dispatch',async()=>{
    const before=command.mock.calls.length;
    const status=await new Promise<number>((resolve,reject)=>{
      const req=httpRequest(server.origin+'/access/v1/identity/exchange',{method:'POST',headers:{Origin:server.origin,
        'Content-Type':'application/json','X-RPG-Credential':'none','Content-Length':2}},res=>{res.resume();resolve(res.statusCode!);});
      req.on('error',reject);req.end(Buffer.from([0xc0,0xaf]));
    });expect(status).toBe(400);
    const port=Number(new URL(server.origin).port);
    const response=await new Promise<string>((resolve,reject)=>{
      const socket=connect(port,'127.0.0.1',()=>socket.write(`POST /access/v1/session/read HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${server.origin}\r\nContent-Type: application/json\r\nX-RPG-Credential: session\r\nAuthorization: Bearer ${bearer}\r\nAuthorization: Bearer ${bearer}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}`));
      let output='';socket.on('data',chunk=>output+=chunk.toString());socket.on('end',()=>resolve(output));socket.on('error',reject);
    });expect(response).toMatch(/^HTTP\/1.1 403/);expect(command.mock.calls.length).toBe(before);
  });
  it('rejects a foreign Host sent by a raw HTTP client (fetch replaces Host)',async()=>{
    const before=command.mock.calls.length;
    const status=await new Promise<number>((resolve,reject)=>{
      const req=httpRequest(server.origin+'/access/v1/identity/exchange',{method:'POST',headers:{Host:'example.invalid',Origin:server.origin,
        'Content-Type':'application/json','X-RPG-Credential':'none','Content-Length':17}},res=>{res.resume();resolve(res.statusCode!);});
      req.on('error',reject);req.end('{"init_data":"x"}');
    });expect(status).toBe(403);expect(command.mock.calls.length).toBe(before);
  });
  it('fails closed if a successful dependency omits a required bearer',async()=>{
    command.mockResolvedValueOnce({ok:true,launch});
    const r=await request();expect(r.status).toBe(503);expect(await r.json()).toEqual({ok:false,error_key:'transport.unavailable'});
  });
  it('bounds nested JSON before dispatch',()=>{
    expect(()=>parseBody(Buffer.from('{"x":'.repeat(10)+'0'+'}'.repeat(10)))).toThrow();
    expect(()=>parseBody(Buffer.from('{"x":{"y":1,"\\u0079":2}}'))).toThrow();
  });
});
