import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteWorldRepository } from './repository';
import type { WorldState, WorldEvent } from '../../packages/contracts';

const world = (): WorldState => ({ schemaVersion: 1, id: 'world-a', title: 'A house', premise: 'Find someone', goal: 'Find Nell', seed: 42, rng: 42, revision: 0, tick: 0, phase: 'exploring', status: 'active', maps: {}, entities: {}, actorIds: ['rowan', 'guest'], objective: { type: 'fact', factId: 'found', targetId: null, mapId: null }, facts: { found: 'Nell is safe.' }, knownFacts: [], secrets: {}, memories: [], dialogue: [], encounter: null, style: { accent: '#aabbcc', ambience: 'house' } });
const event = (revision: number): WorldEvent => ({ id: `event-${revision}`, revision, seq: 0, tick: revision, type: 'moved', actorId: 'rowan', targetId: null, mapId: null, text: 'A footstep.', data: {} });
const repositories: SqliteWorldRepository[] = [];
const directories: string[] = [];
function repo(path = ':memory:') { const repository = new SqliteWorldRepository(path); repositories.push(repository); return repository; }
afterEach(() => { for (const r of repositories.splice(0)) r.close(); for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('authoritative world repository', () => {
  it('persists state and memberships across reopening', () => {
    const dir = mkdtempSync(join(tmpdir(), 'house-db-')); directories.push(dir);
    const first = repo(join(dir, 'world.sqlite'));
    const session = first.createWorld(world(), 'rowan', 'demo');
    first.close(); repositories.splice(repositories.indexOf(first), 1);
    const second = repo(join(dir, 'world.sqlite'));
    expect(second.load('world-a')?.title).toBe('A house');
    expect(second.authorize('world-a', session.token)).toEqual({ actorId: 'rowan', role: 'owner' });
    expect(second.authorize('world-a', 'wrong')).toBeNull();
    expect(second.authorize('other-world', session.token)).toBeNull();
  });
  it('commits state and ordered events together and deduplicates request IDs', () => {
    const r = repo(); r.createWorld(world(), 'rowan', 'demo');
    const next = { ...world(), revision: 1, tick: 1 };
    const first = r.commit('world-a', 'rowan', 'request-1', 'move', 0, next, [event(1)]);
    const duplicate = r.commit('world-a', 'rowan', 'request-1', 'move', 0, next, [event(1)]);
    expect(first.replayed).toBe(false); expect(duplicate.replayed).toBe(true);
    expect(r.eventsSince('world-a', 0)).toHaveLength(1);
    expect(r.load('world-a')?.revision).toBe(1);
    expect(() => r.commit('world-a', 'rowan', 'request-1', 'different', 0, next, [])).toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('rejects stale competing writes without leaking their events', () => {
    const r = repo(); r.createWorld(world(), 'rowan', 'demo');
    r.commit('world-a', 'rowan', 'a', 'move', 0, { ...world(), revision: 1 }, [event(1)]);
    expect(() => r.commit('world-a', 'guest', 'b', 'wait', 0, { ...world(), revision: 1, title: 'Wrong' }, [event(2)])).toThrow('STALE_REVISION');
    expect(r.load('world-a')?.title).toBe('A house');
    expect(r.eventsSince('world-a', 0)).toHaveLength(1);
  });
  it('gives each actor its own scoped credential and revokes invalid actors', () => {
    const r = repo(); const owner = r.createWorld(world(), 'rowan', 'demo');
    const guest = r.addMember('world-a', 'guest');
    expect(guest.token).not.toBe(owner.token);
    expect(r.authorize('world-a', guest.token)?.actorId).toBe('guest');
    expect(() => r.addMember('world-a', 'invented')).toThrow('NO_SUCH_ACTOR');
  });
  it('retains an independent checkpoint and durable asset jobs', () => {
    const r = repo(); r.createWorld(world(), 'rowan', 'demo');
    r.saveCheckpoint('world-a', world());
    r.commit('world-a', 'rowan', 'a', 'wait', 0, { ...world(), revision: 1, status: 'lost' }, []);
    expect(r.checkpoint('world-a')?.status).toBe('active');
    r.putAssetJob({ id: 'job', worldId: 'world-a', assetId: 'new-clock', name: 'A clock', status: 'pending', url: null, error: null });
    expect(r.assetJobs('world-a')[0].status).toBe('pending');
  });
});
