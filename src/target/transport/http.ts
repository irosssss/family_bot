import express from 'express';
import { createServer } from 'node:http';
import { isBearer } from '../access/adultCrypto';
import { reject } from '../contracts/errors';
import { parseBody, parseShape, project } from './contracts';
import { accessRoutes, type AccessServices } from './routes';

export interface TransportConfig {
  readonly origin: string;
  /** No enabled production variant until O01/O09 are decided. Fixtures live only in tests. */
  readonly bootstrapGate: { readonly state: 'closed'; readonly blockers: readonly ['O01', 'O09'] };
  readonly audit?: (event: Readonly<{ route: string; status: number }>) => void;
}
export const closedBootstrapGate = Object.freeze({ state:'closed' as const, blockers:Object.freeze(['O01','O09'] as const) });
const failures = new Map<string, number>([
  ['access.identity_invalid',401], ['access.identity_expired',401], ['access.identity_replayed',409],
  ['access.launch_invalid',401], ['access.policy_mismatch',503], ['access.exchange_unavailable',503],
  ['family.session_invalid',401], ['family.access_denied',403], ['family.binding_unavailable',403],
  ['family.context_changed',409], ['family.protection_required',403], ['family.adult_lifecycle_required',403],
  ['family.access_unavailable',503], ['adult.access_denied',403], ['adult.setup_invalid',403],
  ['adult.proof_invalid',403], ['adult.pin_invalid',400], ['adult.recovery_invalid',403],
  ['adult.context_changed',409], ['adult.operation_conflict',409], ['adult.retry_later',429],
  ['adult.busy',503], ['adult.policy_mismatch',503], ['adult.access_unavailable',503],
  ['access.lifecycle_denied',403],
]);
const maxBodyBytes = 24576;

export function createTargetAccessApp(services: AccessServices, config: TransportConfig) {
  let origin: URL;
  try { origin = new URL(config.origin); } catch { return reject('transport.config_invalid'); }
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.origin !== config.origin
    || config.bootstrapGate?.state !== 'closed' || config.bootstrapGate.blockers?.join(',') !== 'O01,O09') reject('transport.config_invalid');
  const expectedOrigin = origin.origin, expectedHost = origin.host, audit = config.audit;
  const routes = accessRoutes(services), app = express();
  app.disable('x-powered-by'); app.disable('etag'); app.set('trust proxy', false);
  const send = (res: express.Response, status: number, error: string) => res.status(status).json({ ok:false, error_key:error });
  app.use((req,res,next) => {
    res.set({ 'Cache-Control':'no-store', 'Pragma':'no-cache', 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'" });
    const route = routes.has(req.url) || req.url === '/access/v1/family/bootstrap' ? req.url : 'unmatched';
    res.once('finish',() => { try { audit?.(Object.freeze({ route, status:res.statusCode })); } catch { /* Logging cannot change commit/result. */ } });
    const raw = new Map<string, number>();
    for (let i=0; i<req.rawHeaders.length; i+=2) {
      const name = req.rawHeaders[i].toLowerCase(); raw.set(name,(raw.get(name) ?? 0)+1);
    }
    if ([...raw.values()].some(count => count !== 1)
      || [...raw.keys()].some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name === 'cookie'
        || name === 'x-http-method-override' || name === 'transfer-encoding' || name === 'content-encoding' || name === 'expect')
      || req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== expectedHost
      || req.headers.origin !== expectedOrigin || req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') {
      send(res,403,'transport.boundary_denied'); return;
    }
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); send(res,405,'transport.method_denied'); return; }
    if (route === 'unmatched') { send(res,404,'transport.route_not_found'); return; }
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) { send(res,415,'transport.content_type_invalid'); return; }
    const size = req.headers['content-length'];
    if (typeof size !== 'string' || !/^(0|[1-9][0-9]*)$/.test(size)) { send(res,400,'transport.length_required'); return; }
    if (Number(size) > maxBodyBytes) { send(res,413,'transport.body_too_large'); return; }
    const scope = routes.get(req.url)?.credential ?? 'launch';
    if (req.headers['x-rpg-credential'] !== scope) { send(res,401,'transport.credential_invalid'); return; }
    const auth = req.headers.authorization;
    if (scope === 'none' ? auth !== undefined : typeof auth !== 'string' || !auth.startsWith('Bearer ') || !isBearer(auth.slice(7))) {
      send(res,401,'transport.credential_invalid'); return;
    }
    next();
  });
  app.use(express.raw({ type:() => true, limit:maxBodyBytes, inflate:false }));
  app.use(async (req,res) => {
    let input: Record<string, unknown>;
    const route = routes.get(req.url);
    try { input = parseShape(parseBody(req.body),route?.input ?? {}); }
    catch { send(res,400,'transport.request_invalid'); return; }
    if (!route) { send(res,503,'transport.bootstrap_closed'); return; }
    try {
      const result = await route.run(req.headers.authorization?.slice(7) ?? '',input);
      if (!result || typeof result !== 'object' || !('ok' in result)) throw new Error();
      if (result.ok !== true) {
        const key = 'error_key' in result && typeof result.error_key === 'string' ? result.error_key : '';
        const status = failures.get(key);
        send(res,status ?? 503,status ? key : 'transport.unavailable'); return;
      }
      res.status(200).json(project(result,route.output));
    } catch { send(res,503,'transport.unavailable'); }
  });
  app.use((_error: unknown,_req: express.Request,res: express.Response,_next: express.NextFunction) => {
    send(res,400,'transport.request_invalid');
  });
  return app;
}

/** Explicit startup only. No env, fixtures, migration, policy activation or network on import. */
export async function startTargetAccessServer(services: AccessServices, config: Omit<TransportConfig,'origin'>) {
  const server = createServer({ maxHeaderSize:8192, headersTimeout:5000, requestTimeout:10000 });
  // Bound accepted headers/body lifetime even when a peer stalls before HTTP parsing finishes.
  server.setTimeout(10000, socket => socket.destroy()); server.keepAliveTimeout = 1000;
  server.on('clientError',(_error,socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n');
  });
  try {
    await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('transport.listen_failed');
    const origin = `http://127.0.0.1:${address.port}`;
    server.on('request',createTargetAccessApp(services,{ ...config, origin }));
    return { origin, server, close:async () => {
      server.closeIdleConnections();
      await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
    } };
  } catch (error) { server.close(); throw error; }
}
