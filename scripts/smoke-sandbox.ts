import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ModelProvider } from '../apps/server/model';
import { SqliteWorldRepository } from '../apps/server/repository';
import { GameService } from '../apps/server/service';

mkdirSync('data/smoke-sandbox', { recursive: true });
const file = 'data/smoke-sandbox/worlds.sqlite';
let repository = new SqliteWorldRepository(file);
const model = new ModelProvider();
let calls = 0;
const service = new GameService(repository, { structured: async (schema, system, input, timeout) => {
  calls++;
  const start = performance.now();
  const result = await model.structured(schema, system, input, timeout);
  console.log(JSON.stringify({ modelSeconds: Math.round((performance.now() - start) / 1000), proposal: result }));
  return result;
} });
try {
  const created = await service.create({ premise: '', tone: '', protagonist: '', messages: [] }, 'demo', 'sandbox');
  const { worldId, token } = created.session;
  const request = { requestId: randomUUID(), expectedRevision: 0, text: 'I become a red dragon and breathe fire straight forward to the east, setting both dry wooden crates in front of me on fire. The sentinel sees this and reacts.' };
  const result = await service.dm(worldId, token, request);
  assert(result.ok, result.ok ? '' : result.error.message);
  assert(result.view.entities.rowan.tags.some(tag => /form:.*dragon/i.test(tag)), 'Dragon form was not committed.');
  assert(result.view.entities.rowan.assetId.startsWith('form-'), 'Form artwork reference did not change.');
  for (const id of ['wooden-crate', 'wooden-crate-2']) assert(result.view.entities[id]?.statuses.includes('burning'), `${id} did not ignite.`);
  assert.notEqual(result.view.entities.sentinel.emotion, created.view.entities.sentinel.emotion, 'Witness emotion did not change.');
  const callsBeforeReplay = calls;
  assert((await service.dm(worldId, token, request)).ok);
  assert.equal(calls, callsBeforeReplay, 'Retry re-ran the model.');
  const water = await service.dm(worldId, token, { requestId: randomUUID(), expectedRevision: result.view.revision, text: 'I conjure a broad wave of water over both burning wooden crates in front of me, putting their fire out and leaving the wood wet.' });
  assert(water.ok, water.ok ? '' : water.error.message);
  for (const id of ['wooden-crate', 'wooden-crate-2']) {
    assert(!water.view.entities[id]?.statuses.includes('burning'), `${id} is still burning.`);
    assert(water.view.entities[id]?.statuses.includes('wet'), `${id} was not made wet.`);
  }
  assert.equal(water.view.status, 'active');
  repository.close(); repository = new SqliteWorldRepository(file);
  assert.equal(repository.load(worldId)?.revision, water.view.revision);
  assert.equal(repository.load(worldId)?.entities.rowan.assetId, water.view.entities.rowan.assetId);
  console.log(JSON.stringify({ worldId, revision: water.view.revision, entityCount: Object.keys(water.view.entities).length, dragon: true, fire: true, water: true, witness: true, retryDeduplicated: true, persistedAcrossReopen: true }));
} finally { repository.close(); }
