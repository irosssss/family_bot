/** Attach legacy Telegram credentials only to this application's legacy API. */
export function withLegacyApiAuth(fetcher:typeof fetch,origin:string,readInitData:()=>string):typeof fetch {
 return (input,init)=>{
  const target=new URL(input instanceof Request?input.url:String(input),origin);
  if(target.origin!==origin||!target.pathname.startsWith('/api/'))return fetcher(input,init);
  const initData=readInitData();
  if(!initData)return fetcher(input,init);
  const headers=new Headers(init?.headers??(input instanceof Request?input.headers:undefined));
  if(!headers.has('Authorization'))headers.set('Authorization',`tma ${initData}`);
  return fetcher(input,{...init,headers});
 };
}
