import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadPending,prepareCommand,savePending,sendPrepared} from '../../src/v3/live/transport';
describe('V3 browser command retry contract',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('preserves the exact body and UUIDv7 through a lost response and explicit retry',async()=>{
    const prepared=prepareCommand('member','SubmitCompletion',{allocationId:'unchanged'},'Выполнение');
    expect(JSON.parse(prepared.body).idempotencyKey).toMatch(/^[a-f0-9-]{14}7[a-f0-9-]{3}-[89ab]/);
    const fetchMock=vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response(JSON.stringify({outcome:'already_applied'}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    await expect(sendPrepared(prepared)).rejects.toMatchObject({unknownResult:true});
    expect(await sendPrepared(prepared)).toEqual({outcome:'already_applied'});
    expect(fetchMock.mock.calls.map(c=>c[1].body)).toEqual([prepared.body,prepared.body]);
    expect(fetchMock.mock.calls.map(c=>c[1].headers['X-V3-Expected-Member'])).toEqual(['member','member']);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('same-origin');
  });
  it('distinguishes unknown server failures from a definitive validation result',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('{"code":"UNAVAILABLE","message":"Retry"}',{status:500}))
      .mockResolvedValueOnce(new Response('{"code":"VALIDATION","message":"Invalid"}',{status:400})));
    const p=prepareCommand('member','OpenToday',{},'День');
    await expect(sendPrepared(p)).rejects.toMatchObject({unknownResult:true});
    await expect(sendPrepared(p)).rejects.toMatchObject({unknownResult:false,code:'VALIDATION'});
  });
  it('restores a pending operation without a new key and never stores authentication credentials',()=>{
    const store=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v),removeItem:(k:string)=>store.delete(k)});
    const p=prepareCommand('member','OpenToday',{},'День');savePending(p);
    expect(loadPending()).toEqual(p);expect([...store.values()].join()).not.toMatch(/cookie|pin|credential|token/);
    savePending(null);expect(loadPending()).toBeNull();
    savePending({...p,path:'https://evil.test/collect'});expect(loadPending()).toBeNull();
  });
});
