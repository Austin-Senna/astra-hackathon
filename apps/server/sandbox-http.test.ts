import { expect, it } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { SqliteWorldRepository } from './repository';
import { GameService } from './service';
import { AssetQueue } from './assets';
import { createGameServer } from './http';
import { ClientMessageSchema } from '../../packages/contracts';

it('creates an explicit sandbox and broadcasts one prompt result to both clients', async () => {
  const repository = new SqliteWorldRepository(':memory:');
  const service = new GameService(repository, { structured: async schema => schema.parse({
    changes: [{ type: 'transform', targetId: 'rowan', form: 'dragon', description: 'A red dragon.', abilities: ['fire breath'] }],
    dialogue: [{ kind: 'thought', speakerId: 'rowan', text: 'I have wings.' }], rules: [],
  }) });
  const queue = new AssetQueue(repository, { artwork: async () => Buffer.alloc(0) }, '/tmp/unused-sandbox-http');
  queue.stop();
  const { server, websocket } = createGameServer(service, { provider: 'claude-cli', model: 'test', available: true }, queue, { generatedDir: '/tmp/unused-sandbox-http' });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const created = await fetch(`${url}/api/worlds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: { premise: '', protagonist: '', tone: '', messages: [] }, mode: 'demo', preset: 'sandbox' }) }).then(response => response.json());
    expect(created.view.sandbox.enabled).toBe(true);
    const { worldId, token } = created.session;
    const subscribe = async (after = 0) => {
      const ws = new WebSocket(url.replace('http:', 'ws:') + '/ws');
      await once(ws, 'open'); const incoming = once(ws, 'message');
      ws.send(JSON.stringify({ type: 'subscribe', worldId, token, after }));
      const [raw] = await incoming;
      return { ws, initial: ClientMessageSchema.parse(JSON.parse(raw.toString())) };
    };
    const first = await subscribe(), second = await subscribe();
    const firstMessage = once(first.ws, 'message'), secondMessage = once(second.ws, 'message');
    const resolved = await fetch(`${url}/api/worlds/${worldId}/dm`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ requestId: 'transform', expectedRevision: 0, text: 'I become a dragon.' }) }).then(response => response.json());
    expect(resolved.ok).toBe(true);
    const [a] = await firstMessage, [b] = await secondMessage;
    const commitA = ClientMessageSchema.parse(JSON.parse(a.toString())), commitB = ClientMessageSchema.parse(JSON.parse(b.toString()));
    expect(commitA.view).toEqual(commitB.view);
    expect(commitA.view).toEqual(resolved.view);
    expect(commitA.view?.entities.rowan.tags).toContain('form:dragon');
    expect(commitA.cursor).toBe(resolved.cursor);
    const reconnected = await subscribe(resolved.cursor);
    expect(reconnected.initial.view).toEqual(resolved.view);
    expect(reconnected.initial.events).toEqual([]);
  } finally {
    for (const client of websocket.clients) client.terminate();
    server.close(); await once(server, 'close'); repository.close();
  }
});
