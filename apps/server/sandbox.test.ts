import { afterEach, describe, expect, it } from 'vitest';
import { GameService } from './service';
import { SqliteWorldRepository } from './repository';
import type { StructuredModel } from './generation';
import { createSandboxWorld } from '../../packages/engine/sandbox-fixture';
import { applyCommandBatch, validateBlueprint, projectWorld } from '../../packages/engine';

const repositories: SqliteWorldRepository[] = [];
afterEach(() => repositories.splice(0).forEach(repo => repo.close()));
const brief = { premise: '', tone: '', protagonist: '', messages: [] };
const plan = { changes: [{ type: 'transform', targetId: 'rowan', form: 'dragon', description: 'A red dragon.', abilities: ['breathe-fire'] }], rules: [], dialogue: [] };

function setup(model: StructuredModel) {
  const repository = new SqliteWorldRepository(':memory:'); repositories.push(repository);
  const service = new GameService(repository, model);
  return { repository, service };
}

describe('map sandbox service', () => {
  it('creates a dense playable map without preset abilities or a mandatory goal', async () => {
    const { service } = setup({ structured: async () => { throw new Error('Not needed'); } });
    const created = await service.create(brief, 'demo', 'sandbox');
    expect(created.view.sandbox?.enabled).toBe(true);
    expect(Object.keys(created.view.maps)).toHaveLength(1);
    expect(Object.keys(created.view.entities).length).toBeGreaterThanOrEqual(18);
    expect(created.view.entities.rowan.abilities).toEqual([]);
    expect(created.view.entities.rowan.properties).toMatchObject({ mp: 20, maxMp: 20 });
    expect(created.view.goal).toBe('');
    expect(validateBlueprint(createSandboxWorld()).ok).toBe(true);
  });

  it('does not finish a sandbox when the legacy objective is satisfied', () => {
    const world = createSandboxWorld();
    world.objective = { type: 'reach', mapId: 'courtyard', targetId: null, factId: null };
    const result = applyCommandBatch(world, 'rowan', [{ type: 'wait' }]);
    expect(result.ok && result.world.status).toBe('active');
    expect(result.ok && result.world.phase).toBe('exploring');
  });

  it('persists a prompt result, deduplicates retries and rejects a stale competing prompt', async () => {
    let calls = 0;
    const { service, repository } = setup({ structured: async schema => { calls++; return schema.parse(plan); } });
    const created = await service.create(brief, 'demo', 'sandbox');
    const { worldId, token } = created.session;
    const request = { requestId: 'dragon', expectedRevision: 0, text: 'I become a dragon.' };
    const result = await service.dm(worldId, token, request);
    expect(result.ok).toBe(true);
    expect(repository.load(worldId)?.entities.rowan.tags).toContain('form:dragon');
    expect(service.snapshot(worldId, token).view.entities.rowan.assetId).toMatch(/^form-/);
    expect((await service.dm(worldId, token, request)).ok).toBe(true);
    expect(calls).toBe(1);
    const stale = await service.dm(worldId, token, { ...request, requestId: 'competing' });
    expect(!stale.ok && stale.error.code).toBe('STALE_REVISION');
  });

  it('repairs concrete state errors and excludes private context from the prompt', async () => {
    const contexts: string[] = [];
    const { service, repository } = setup({ structured: async (schema, system, input) => {
      expect(system).not.toContain('only supported IDs');
      contexts.push(input);
      return schema.parse(contexts.length === 1 ? { changes: [{ type: 'update', targetId: 'missing', values: { hp: 1 } }], dialogue: [], rules: [] } : plan);
    } });
    const world = createSandboxWorld('private'); world.secrets.hidden = 'PRIVATE_SECRET';
    world.entities.sentinel.memories = [{ eventId: 'private', text: 'PRIVATE_MEMORY', kind: 'observation' }];
    const session = repository.createWorld(world, 'rowan', 'sandbox');
    const result = await service.dm(world.id, session.token, { requestId: 'repair', expectedRevision: 0, text: 'Become a dragon.' });
    expect(result.ok).toBe(true);
    expect(contexts).toHaveLength(2);
    expect(contexts.join('')).not.toMatch(/PRIVATE_SECRET|PRIVATE_MEMORY/);
    expect(JSON.parse(contexts[1]).rejection).toContain('Target is not visible');
  });

  it('keeps state unchanged when the model fails', async () => {
    const { service, repository } = setup({ structured: async () => { throw new Error('Unavailable'); } });
    const created = await service.create(brief, 'demo', 'sandbox');
    const result = await service.dm(created.session.worldId, created.session.token, { requestId: 'failed', expectedRevision: 0, text: 'Fly.' });
    expect(result.ok).toBe(false);
    expect(repository.load(created.session.worldId)?.revision).toBe(0);
  });

  it('omits rule and form metadata for undiscovered maps and hidden entities', () => {
    const world = createSandboxWorld();
    world.sandbox!.rules.push({ id: 'secret', version: 1, mapId: 'undiscovered', description: 'SECRET_RULE' });
    world.sandbox!.forms.push({ actorId: 'hidden', assetId: 'hidden', description: 'SECRET_FORM', tags: [], grantedAbilities: [] });
    expect(JSON.stringify(projectWorld(world, 'rowan'))).not.toMatch(/SECRET_RULE|SECRET_FORM/);
  });
});
