import {it,expect,vi} from 'vitest';
import {withLegacyApiAuth} from '../src/utils/legacyApiAuth';
it('limits legacy credentials to same-origin /api routes',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response());const read=vi.fn(()=> 'synthetic');const f=withLegacyApiAuth(fetcher,'http://127.0.0.1:3217',read);
 for(const path of ['https://example.com/api/state','/access/v1/identity/exchange','/assets/image.png'])await f(path);
 expect(read).not.toHaveBeenCalled();
 await f('/api/state');expect(new Headers(fetcher.mock.calls[3][1].headers).get('Authorization')).toBe('tma synthetic');
});
it('preserves explicit request headers and existing bearer',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response());const f=withLegacyApiAuth(fetcher,'http://127.0.0.1:3217',()=> 'synthetic');
 await f(new Request('http://127.0.0.1:3217/api/state',{headers:{Authorization:'Bearer existing','X-Test':'kept'}}));
 const headers=new Headers(fetcher.mock.calls[0][1].headers);expect(headers.get('Authorization')).toBe('Bearer existing');expect(headers.get('X-Test')).toBe('kept');
});
