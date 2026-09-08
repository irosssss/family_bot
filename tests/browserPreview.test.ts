import { describe, expect, it } from 'vitest';
import { createBrowserDemoTransport } from '../src/preview/browserDemo';
import type { DemoState } from '../src/demo/types';

describe('browser visual preview', () => {
  it('opens a synthetic home and keeps page instances independent', async () => {
    const first = createBrowserDemoTransport(), other = createBrowserDemoTransport();
    const {state}: {state: DemoState} = await (await first('/api/demo/state')).json();
    const child = state.users.find(user => user.role === 'child')!;
    const task = state.tasks.find(task => task.enabled && (!task.assigneeIds.length || task.assigneeIds.includes(child.id)))!;
    const request = { method:'POST', json:{action:'completeTask',actorId:child.id,taskId:task.id,requestId:'browser-preview-test'} };
    const response = await first('/api/demo/action', request);
    expect(response.status).toBe(200);
    const result = await response.json();expect(result.state.revision).toBe(state.revision+1);
    expect((await (await first('/api/demo/action', request)).json()).state.revision).toBe(result.state.revision);
    expect((await (await other('/api/demo/state')).json()).state.revision).toBe(state.revision);
  });
  it('rejects unsupported routes, catalog writes and invalid actions', async () => {
    const request = createBrowserDemoTransport();
    expect((await request('/api/users')).status).toBe(404);
    expect((await request('/api/demo/action', {method:'POST',json:{action:'saveCatalog'}})).status).toBe(403);
    expect((await request('/api/demo/action', {method:'POST',json:null})).status).toBe(400);
  });
});
