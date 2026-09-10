import { expect, it } from 'vitest';
import { AssetQueue } from './assets';
import { SqliteWorldRepository } from './repository';
import { createSandboxWorld } from '../../packages/engine/sandbox-fixture';

it('queues every missing visual from a multi-object sandbox turn, deduplicated by asset ID', () => {
  const repository = new SqliteWorldRepository(':memory:');
  const queue = new AssetQueue(repository, { artwork: async () => { throw new Error('Queue is stopped in this test'); } }, '/tmp/unused-sandbox-art');
  queue.stop();
  try {
    const world = createSandboxWorld('asset-test');
    world.entities.rowan.assetId = 'form-dragon';
    world.entities['wooden-crate'].assetId = 'sculpt-crystal';
    world.entities['wooden-crate-2'].assetId = 'sculpt-crystal';
    world.entities.sentinel.assetId = 'sculpt-marble';
    repository.createWorld(world, 'rowan', 'sandbox');
    queue.enqueue(world);
    expect(repository.assetJobs(world.id).map(job => job.assetId).sort()).toEqual(['form-dragon', 'sculpt-crystal', 'sculpt-marble']);
    queue.enqueue(world);
    expect(repository.assetJobs(world.id)).toHaveLength(3);
  } finally { repository.close(); }
});
