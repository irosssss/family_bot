import { withTargetTestEnvironment } from '../../scripts/target/test-environment';
import { readTargetConfig } from '../../src/target/config';
import { createTargetClient } from '../../src/target/db/client';
import { openTargetDatabase } from '../../src/target/db/database';
import { runTargetMigrations } from '../../src/target/db/migrator';
import { retentionPolicyRevisions } from '../../src/target/db/schema/foundation';
import { createIdentityExchangeService } from '../../src/target/access/identityExchange';
import { createAccessLifecycleService } from '../../src/target/access/accessLifecycle';
import { closedBootstrapGate, startTargetAccessServer } from '../../src/target/transport/http';
import { exchangeConfig, startMs } from '../../tests/target/identity-exchange-fixtures';
import { adultConfig, syntheticPepper } from '../../tests/target/adult-fixtures';
import { retentionFixture } from '../../tests/target/foundation-fixtures';

// Reproducible short-lived browser probe. Every key/policy is an explicit synthetic fixture.
await withTargetTestEnvironment(async env => {
  const config=readTargetConfig(env),raw=createTargetClient(config);
  const database=await openTargetDatabase(config);
  let server:Awaited<ReturnType<typeof startTargetAccessServer>>|undefined;
  try {
    await runTargetMigrations(raw,config,'migrations/target');
    await database.db.insert(retentionPolicyRevisions).values(retentionFixture());
    const exchange=createIdentityExchangeService(database.db,exchangeConfig(()=>startMs));
    const lifecycle=createAccessLifecycleService(database.db,exchange,adultConfig(()=>startMs),syntheticPepper());
    if(!(await exchange.activatePolicy(0)).ok || !(await lifecycle.adult.activatePolicy(0)).ok)throw new Error('probe.policy_failed');
    server=await startTargetAccessServer({exchange,lifecycle},{bootstrapGate:closedBootstrapGate});
    console.info(JSON.stringify({browserProbe:`${server.origin}/access/v1/session/read`,expected:'403 transport.boundary_denied for browser navigation without Origin',automaticCloseSeconds:90}));
    await new Promise<void>(resolve=>setTimeout(resolve,90000));
  } finally { await server?.close();await database.close();await raw.end({timeout:5}); }
});
