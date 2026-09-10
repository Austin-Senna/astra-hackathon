import { strict as assert } from 'node:assert';
import { ModelProvider } from '../apps/server/model';
import { SqliteWorldRepository } from '../apps/server/repository';
import { GameService } from '../apps/server/service';

const repository = new SqliteWorldRepository(':memory:');
const provider = new ModelProvider();
const service = new GameService(repository, { structured: async (schema, system, input, timeout) => {
  const start = performance.now();
  const result = await provider.structured(schema, system, input, timeout);
  console.log(JSON.stringify({ seconds: Math.round((performance.now() - start) / 1000), proposal: result }));
  return result;
} });
try {
  const created = await service.create({ premise: '', tone: '', protagonist: '', messages: [] }, 'demo', 'sandbox');
  const { worldId, token } = created.session;
  const result = await service.dm(worldId, token, { requestId: 'invent', expectedRevision: 0,
    text: 'I invent a new power right now: I become WEIGHTLESS, pull the iron hammer directly into my hand with telekinesis without moving, and turn the west wall tile at (0, 8) into a walkable flowering archway.' });
  assert(result.ok, result.ok ? '' : result.error.message);
  assert(result.view.entities.rowan.statuses.some(status => /weightless/i.test(status)));
  assert(result.view.entities.rowan.inventory.includes('hammer'));
  assert.deepEqual(result.view.entities.rowan.location, created.view.entities.rowan.location);
  assert.equal(result.view.maps.courtyard.tiles[8][0], '.');
  assert(result.view.maps.courtyard.tileStates?.['0,8']);
  console.log(JSON.stringify({ customCondition: true, telekineticPickup: true, noForcedMovement: true, terrainChanged: true, revision: result.view.revision }));
} finally { repository.close(); }
