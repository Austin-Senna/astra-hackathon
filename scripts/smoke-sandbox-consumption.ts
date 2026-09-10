import { strict as assert } from 'node:assert';
import { ModelProvider } from '../apps/server/model';
import { SqliteWorldRepository } from '../apps/server/repository';
import { GameService } from '../apps/server/service';
import { createSandboxWorld } from '../packages/engine/sandbox-fixture';
import { SandboxProposalSchema } from '../packages/contracts/sandbox';

const repository = new SqliteWorldRepository(':memory:');
const provider = new ModelProvider();
let lastProposal: unknown;
const service = new GameService(repository, { structured: async (schema, system, input, timeout) => {
  const start = performance.now();
  const result = await provider.structured(schema, system, input, timeout);
  lastProposal = result;
  console.log(JSON.stringify({ seconds: Math.round((performance.now() - start) / 1000), proposal: result }));
  return result;
} });
try {
  const world = createSandboxWorld('consumption-smoke');
  world.entities.rowan.hp = 3;
  world.entities.rowan.properties = { mp: 1, maxMp: 20 };
  const session = repository.createWorld(world, 'rowan', 'sandbox');
  const result = await service.dm(world.id, session.token, { requestId: 'feast', expectedRevision: 0,
    text: 'I spawn ten chickens, magically turn them into a delicious roast and restorative broth, then eat and drink all ten to restore my HP and MP.' });
  assert(result.ok, result.ok ? '' : result.error.message);
  const saved = repository.load(world.id)!;
  const proposedChickens = SandboxProposalSchema.parse(lastProposal).changes.filter(change => change.type === 'spawn' && change.kind === 'npc' && /chicken|hen|rooster/i.test(change.name + ' ' + change.description));
  assert.equal(proposedChickens.reduce((count, change) => count + (change.type === 'spawn' ? change.count ?? 1 : 0), 0), 10, 'Must create ten NEW chickens, not count the existing one.');
  assert(!saved.entities.chicken.properties?.removed, 'The existing courtyard chicken was consumed without being requested.');
  const spawned = Object.values(saved.entities).filter(entity => !Object.hasOwn(world.entities, entity.id));
  assert(spawned.length >= 10, 'Ten distinct new instances were not recorded.');
  assert(repository.eventsSince(world.id, 0).filter(event => event.type === 'spawn').length >= 10);
  assert(repository.eventsSince(world.id, 0).filter(event => event.type === 'remove').length >= 10, 'Consumption did not remove the instances.');
  assert(saved.entities.rowan.hp > 3, 'HP was not restored.');
  assert(Number(saved.entities.rowan.properties?.mp) > 1, 'MP was not restored.');
  assert.equal(saved.status, 'active');
  console.log(JSON.stringify({ spawned: spawned.length, hp: saved.entities.rowan.hp, mp: saved.entities.rowan.properties?.mp, revision: saved.revision, tick: saved.tick, persistentConsumption: true }));
} finally { repository.close(); }
