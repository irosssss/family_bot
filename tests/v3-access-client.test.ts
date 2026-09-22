import {describe,it,expect,vi} from 'vitest';
import {createAccessClient,AccessError} from '../src/v3/access/client';
const secret='a'.repeat(42)+'A';
const ok=(extra={})=>new Response(JSON.stringify({ok:true,...extra}),{status:200});
describe('V3 G03 browser adapter',()=>{
 it('exchanges identity without cookies or authorization and keeps bearer private',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(ok({bearer:secret,launch:{id:'launch'}})).mockResolvedValueOnce(ok({bearer:secret,session:{id:'session'}}));
  const api=createAccessClient(fetcher,'http://127.0.0.1:3217');
  expect(await api.exchange('synthetic')).not.toHaveProperty('bearer');
  const first=fetcher.mock.calls[0][1];expect(first.credentials).toBe('omit');expect(first.redirect).toBe('error');expect(first.headers).not.toHaveProperty('Authorization');
  await api.login('family','binding','123456');
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${secret}`);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({family_id:'family',binding_id:'binding',pin:'123456'});
 });
 it('does not retry uncertain commands',async()=>{const f=vi.fn().mockRejectedValue(Error('private failure'));const api=createAccessClient(f,'http://127.0.0.1:3217');await expect(api.exchange('synthetic')).rejects.toMatchObject({uncertain:true});expect(f).toHaveBeenCalledTimes(1);});
 it('rejects missing sessions without a network request',async()=>{const f=vi.fn();await expect(createAccessClient(f,'http://127.0.0.1:3217').readSession()).rejects.toBeInstanceOf(AccessError);expect(f).not.toHaveBeenCalled();});
 it('rejects malformed success credentials',async()=>{const f=vi.fn().mockResolvedValue(ok({bearer:'bad'}));await expect(createAccessClient(f,'http://127.0.0.1:3217').exchange('synthetic')).rejects.toMatchObject({uncertain:true});});
 it('rejects unsupported hosts',()=>{expect(()=>createAccessClient(vi.fn(),'https://example.com')).toThrow();});
 it('clears local credentials explicitly',async()=>{const f=vi.fn().mockResolvedValue(ok({bearer:secret}));const a=createAccessClient(f,'http://127.0.0.1:3217');await a.exchange('synthetic');a.clearLocalCredentials();await expect(a.login('f','b','123456')).rejects.toThrow();expect(f).toHaveBeenCalledTimes(1);});
});
it('removes an invalid session on a server 401',async()=>{
 const f=vi.fn().mockResolvedValueOnce(ok({bearer:secret})).mockResolvedValueOnce(ok({bearer:secret})).mockResolvedValueOnce(new Response(JSON.stringify({ok:false,error_key:'family.session_invalid'}),{status:401}));
 const a=createAccessClient(f,'http://127.0.0.1:3217');await a.exchange('synthetic');await a.login('f','b','123456');await expect(a.readSession()).rejects.toThrow();await expect(a.readSession()).rejects.toThrow();expect(f).toHaveBeenCalledTimes(3);
});
it('serializes mutations while a response is pending',async()=>{
 let finish!:(response:Response)=>void;const f=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));const a=createAccessClient(f,'http://127.0.0.1:3217');const pending=a.exchange('synthetic');await expect(a.exchange('synthetic')).rejects.toMatchObject({key:'client.busy'});finish(ok({bearer:secret}));await pending;expect(f).toHaveBeenCalledTimes(1);
});
