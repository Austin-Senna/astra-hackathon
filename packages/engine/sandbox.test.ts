import { describe, expect, it } from 'vitest';
import { createHouseWorld, fixtureEntity } from './fixtures';
import { resolveSandboxTurn } from './sandbox';
import { applyCommandBatch, validateBlueprint } from './index';

const world = () => createHouseWorld('sandbox-test');
const proposal = (changes: unknown[], extra = {}) => ({ changes, dialogue: [], rules: [], ...extra });

describe('prompt sandbox resolver', () => {
  it('commits an invented form and concrete object changes with exact replay', () => {
    const before = world();
    const input = proposal([
      { type: 'transform', targetId: 'rowan', form: 'dragon', description: 'A red dragon with golden horns.', abilities: ['forward-flame'] },
      { type: 'update', targetId: 'bed', values: { statuses: ['burning'], hp: 6 } },
    ], { rules: [{ id: 'forward-flame', description: 'The dragon can breathe fire along its saved facing, igniting dry wood.' }] });
    const result = resolveSandboxTurn(before, 'rowan', input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.world.entities.rowan).toMatchObject({ id: 'rowan', abilities: expect.arrayContaining(['forward-flame']), assetId: expect.stringMatching(/^form-/) });
    expect(result.world.entities.bed).toMatchObject({ hp: 6, statuses: ['burning'] });
    expect(result.world.sandbox?.rules[0].id).toBe('forward-flame');
    expect(result.world).toMatchObject({ revision: 1, tick: 1, status: 'active' });
    expect(resolveSandboxTurn(before, 'rowan', input)).toEqual(result);
    expect(before).toEqual(world());
  });

  it('rejects a whole proposal if a later edit targets a hidden object', () => {
    const before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'update', targetId: 'bed', values: { hp: 1 } },
      { type: 'update', targetId: 'hidden-letter', values: { name: 'Revealed' } },
    ]));
    expect(result.ok).toBe(false);
    expect(before.entities.bed.hp).toBe(10);
  });

  it('rejects arbitrary properties, remote targets and other player changes', () => {
    const before = world();
    before.entities.guest = fixtureEntity('guest', 'Guest', 'player', 'bedroom', 3, 8, { kind: 'player' });
    before.actorIds.push('guest');
    for (const change of [
      { type: 'update', targetId: 'rowan', values: { inventory: ['brass-key'] } },
      { type: 'update', targetId: 'nell', values: { emotion: 'surprised' } },
      { type: 'transform', targetId: 'guest', form: 'stone', description: 'Stone', abilities: [] },
      { type: 'update', targetId: 'constructor', values: { hp: 1 } },
    ]) expect(resolveSandboxTurn(before, 'rowan', proposal([change])).ok).toBe(false);
  });

  it('removes objects without rewriting remote references or losing their historical identity', () => {
    const before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'remove', targetId: 'brass-key' }]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities['garden-door']).toEqual(before.entities['garden-door']);
    expect(result.world.entities['brass-key']).toMatchObject({ id: 'brass-key', hp: 0, solid: false, properties: { removed: true } });
    expect(result.world.entities['brass-key'].statuses).toContain('hidden');
    expect(resolveSandboxTurn(result.world, 'rowan', proposal([{ type: 'update', targetId: 'brass-key', values: { hp: 10 } }])).ok).toBe(false);
  });

  it('allows a non-solid effect on a solid object but rejects walls and colliding solid spawns', () => {
    const before = world();
    const spawn = { type: 'spawn', id: 'new-fire', name: 'Fire', description: 'Fire on the bed.', assetId: 'torch', kind: 'fixture', x: 6, y: 4, tags: ['fire'], solid: false, portable: false, properties: {} };
    const result = resolveSandboxTurn(before, 'rowan', proposal([spawn]));
    expect(result.ok).toBe(true);
    expect(result.ok && result.world.entities['new-fire'].location).toMatchObject({ x: 6, y: 4 });
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ ...spawn, solid: true }])).ok).toBe(false);
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ ...spawn, x: 0, y: 0 }])).ok).toBe(false);
  });

  it('rejects an update that creates intersecting solid objects', () => {
    const before = world();
    before.entities.spark = fixtureEntity('spark', 'Spark', 'torch', 'bedroom', 6, 4);
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'update', targetId: 'spark', values: { solid: true } }])).ok).toBe(false);
  });

  it('places a dropped solid item on a free adjacent tile instead of intersecting its holder', () => {
    const before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'update', targetId: 'rowan', values: { solid: true } },
      { type: 'update', targetId: 'brass-key', values: { solid: true } },
      { type: 'transfer', targetId: 'brass-key', recipientId: 'rowan' },
      { type: 'transfer', targetId: 'brass-key', recipientId: null },
    ]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities['brass-key'].location).not.toEqual(result.world.entities.rowan.location);
    expect(result.world.entities['brass-key'].holderId).toBe(null);
    expect(result.world.entities.rowan.inventory).toEqual([]);
  });

  it('opens a nearby container through the prompt path without reading hidden contents beforehand', () => {
    const before = world();
    before.entities.rowan.location = { mapId: 'bedroom', x: 8, y: 5, elevation: 0 };
    const result = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'open', targetId: 'bedroom-chest' }]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities['bedroom-chest'].inventory).toEqual([]);
    expect(result.world.entities['hidden-letter']).toMatchObject({ holderId: null, location: { mapId: 'bedroom', x: 9, y: 5 }, statuses: [] });
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'open', targetId: 'rowan' }])).ok).toBe(false);
  });

  it('accepts free-text conditions, remote item conjuration and more than eight carried items', () => {
    const before = world();
    for (let i = 0; i < 9; i++) {
      const id = `owned-${i}`;
      before.entities[id] = fixtureEntity(id, 'Pebble', 'stone', 'bedroom', 4, 8, { kind: 'item', portable: true, holderId: 'rowan', location: null });
      before.entities.rowan.inventory.push(id);
    }
    before.entities['brass-key'].location = { mapId: 'bedroom', x: 20, y: 10, elevation: 0 };
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'update', targetId: 'rowan', values: { statuses: ['WEIGHTLESS', 'GLORIOUSLY_CONFUSED'] } },
      { type: 'transfer', targetId: 'brass-key', recipientId: 'rowan' },
    ]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities.rowan.statuses).toContain('WEIGHTLESS');
    expect(result.world.entities.rowan.inventory).toHaveLength(10);
    expect(validateBlueprint(result.world).ok).toBe(true);
  });

  it('lets the DM turn a wall into flowers and then move through its committed terrain', () => {
    const before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'terrain', x: 0, y: 8, terrain: 'floor', state: 'FLOWERING' },
      { type: 'relocate', targetId: 'rowan', x: 0, y: 8, mode: 'teleport' },
    ]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.maps.bedroom.tiles[8][0]).toBe('.');
    expect(result.world.maps.bedroom.tileStates?.['0,8']).toBe('FLOWERING');
    expect(result.world.entities.rowan.location?.x).toBe(0);
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'terrain', x: 999, y: 8, terrain: 'floor', state: 'FLOWERING' }])).ok).toBe(false);
  });

  it('keeps the addressed NPC memory even for a long-distance social interaction', () => {
    const before = world();
    before.entities.keeper.location = { mapId: 'bedroom', x: 20, y: 10, elevation: 0 };
    const result = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'social', targetId: 'keeper', emotion: 'amused', relationshipDelta: 1, memory: 'Rowan sent me a telepathic joke.' }]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities.keeper.memories.some(memory => memory.text.includes('telepathic joke'))).toBe(true);
  });

  it('keeps the sandbox prompt available after a fatal direct-action consequence', () => {
    const before = world(); before.sandbox = { enabled: true, rules: [], forms: [] };
    before.entities.rowan.hp = 2; before.entities.rowan.statuses = ['burning'];
    const result = applyCommandBatch(before, 'rowan', [{ type: 'wait' }]);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities.rowan.hp).toBe(0);
    expect(result.world.status).toBe('active');
    const revived = resolveSandboxTurn(result.world, 'rowan', proposal([{ type: 'update', targetId: 'rowan', values: { hp: 20, statuses: ['REBORN'] } }]));
    expect(revived.ok && revived.world.entities.rowan.hp).toBe(20);
  });

  it('can spawn ten creatures, consume them, and restore arbitrary character resources in one turn', () => {
    const before = world(); before.entities.rowan.hp = 2; before.entities.rowan.properties = { mp: 1, maxMp: 20 };
    const changes: unknown[] = Array.from({ length: 10 }, (_, i) => ({ type: 'spawn', id: `chicken-${i}`, name: 'Conjured chicken', description: 'A plump conjured chicken.', assetId: 'chicken', kind: 'npc', x: 5 + i, y: 8, tags: ['chicken', 'edible'], solid: false, portable: false, properties: {} }));
    changes.push(...Array.from({ length: 10 }, (_, i) => ({ type: 'remove', targetId: `chicken-${i}` })));
    changes.push({ type: 'update', targetId: 'rowan', values: { hp: 20, properties: { mp: 20, maxMp: 20 } } });
    const result = resolveSandboxTurn(before, 'rowan', proposal(changes));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.events.filter(event => event.type === 'spawn')).toHaveLength(10);
    expect(result.events.filter(event => event.type === 'remove')).toHaveLength(10);
    expect(result.world.entities.rowan).toMatchObject({ hp: 20, properties: { mp: 20 } });
    expect(result.world.tick).toBe(1);
  });

  it('expands a counted spawn into ten distinct persistent instances sharing one asset', () => {
    const result = resolveSandboxTurn(world(), 'rowan', proposal([{ type: 'spawn', id: 'flock', count: 10, name: 'Chicken', description: 'A conjured white chicken.', assetId: 'chicken', kind: 'npc', x: 10, y: 8, tags: ['chicken'], solid: false, portable: false, properties: {} }]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    const flock = Object.values(result.world.entities).filter(entity => entity.id.startsWith('flock-'));
    expect(flock).toHaveLength(10);
    expect(flock.map(entity => entity.id)).toContain('flock-10');
    expect(new Set(flock.map(entity => `${entity.location?.x},${entity.location?.y}`)).size).toBe(10);
    expect(new Set(flock.map(entity => entity.assetId))).toEqual(new Set(['chicken']));
    expect(result.events.filter(event => event.type === 'spawn')).toHaveLength(10);
  });

  it('starts and resolves an encounter from a dialogue outcome without a predefined attack', () => {
    const before = world(); before.entities.keeper.location = { mapId: 'bedroom', x: 5, y: 8, elevation: 0 };
    const started = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'encounter', enemyIds: ['keeper'], outcome: 'active' }], { dialogue: [{ kind: 'speech', speakerId: 'keeper', text: 'You have gone too far.' }] }));
    expect(started.ok).toBe(true); if (!started.ok) return;
    expect(started.world).toMatchObject({ phase: 'encounter', encounter: { participantIds: ['rowan', 'keeper'], status: 'active' } });
    const ended = resolveSandboxTurn(started.world, 'rowan', proposal([{ type: 'encounter', enemyIds: [], outcome: 'fled' }], { dialogue: [{ kind: 'speech', speakerId: 'keeper', text: 'Actually, I accept your apology.' }] }));
    expect(ended.ok && ended.world.phase).toBe('exploring');
    expect(ended.ok && ended.world.encounter?.status).toBe('fled');
  });

  it('does not advance another party encounter through unrelated changes', () => {
    const before = world();
    before.entities.guest = fixtureEntity('guest', 'Guest', 'player', 'hall', 3, 8, { kind: 'player' });
    before.actorIds.push('guest');
    before.encounter = { id: 'guest-fight', mapId: 'hall', participantIds: ['guest', 'keeper'], turnActorId: 'guest', round: 3, status: 'active' };
    const result = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'update', targetId: 'rowan', values: { emotion: 'curious' } }]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.encounter).toEqual(before.encounter);
  });

  it('protects another party active participants from indirect encounter edits', () => {
    const before = world();
    before.entities.guest = fixtureEntity('guest', 'Guest', 'player', 'bedroom', 3, 8, { kind: 'player' });
    before.entities.keeper.location = { mapId: 'bedroom', x: 5, y: 8, elevation: 0 };
    before.actorIds.push('guest');
    before.encounter = { id: 'guest-fight', mapId: 'bedroom', participantIds: ['guest', 'keeper'], turnActorId: 'guest', round: 3, status: 'active' };
    for (const change of [
      { type: 'remove', targetId: 'keeper' },
      { type: 'update', targetId: 'keeper', values: { hp: 0 } },
    ]) expect(resolveSandboxTurn(before, 'rowan', proposal([change])).ok).toBe(false);
    expect(before.encounter.status).toBe('active');
  });

  it('accepts a carried item arrival animation without giving it a second location', () => {
    const before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'transfer', targetId: 'brass-key', recipientId: 'rowan' },
      { type: 'relocate', targetId: 'brass-key', x: 4, y: 8, mode: 'fly' },
    ]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities['brass-key']).toMatchObject({ location: null, holderId: 'rowan' });
  });

  it('does not put terrain through hidden occupants', () => {
    const before = world(); before.entities.secret = fixtureEntity('secret', 'Secret', 'keeper', 'bedroom', 2, 2, { kind: 'npc', statuses: ['hidden'] });
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'terrain', x: 2, y: 2, terrain: 'wall', state: 'stone' }])).ok).toBe(false);
  });

  it('transfers one owned item and preserves inventory through transformation and reversion', () => {
    let before = world();
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'transfer', targetId: 'brass-key', recipientId: 'rowan' },
      { type: 'transform', targetId: 'rowan', form: 'dragon', description: 'A red dragon.', abilities: ['flame'] },
    ]));
    expect(result.ok).toBe(true); if (!result.ok) return;
    before = result.world;
    expect(before.entities.rowan.inventory).toEqual(['brass-key']);
    expect(before.entities['brass-key']).toMatchObject({ location: null, holderId: 'rowan' });
    const reverted = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'revert', targetId: 'rowan' }]));
    expect(reverted.ok).toBe(true); if (!reverted.ok) return;
    expect(reverted.world.entities.rowan).toMatchObject({ assetId: 'player', abilities: world().entities.rowan.abilities, inventory: ['brass-key'] });
    expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'remove', targetId: 'rowan' }])).ok).toBe(false);
  });

  it('validates walk paths and updates facing without requiring individual movement commands', () => {
    const before = world();
    const moved = resolveSandboxTurn(before, 'rowan', proposal([{ type: 'relocate', targetId: 'rowan', x: 9, y: 8, mode: 'walk' }]));
    expect(moved.ok).toBe(true); if (!moved.ok) return;
    expect(moved.world.entities.rowan.location).toMatchObject({ x: 9, y: 8 });
    expect(moved.world.entities.rowan.facing).toBe('east');
    for (const [x, y] of [[0, 0], [1000, 8], [6, 4]]) {
      expect(resolveSandboxTurn(before, 'rowan', proposal([{ type: 'relocate', targetId: 'rowan', x, y, mode: 'teleport' }])).ok).toBe(false);
    }
  });

  it('persists social consequences and keeps private dialogue private without advancing time for speech alone', () => {
    const before = world();
    before.entities.keeper.location = { ...before.entities.rowan.location!, x: 5 };
    const result = resolveSandboxTurn(before, 'rowan', proposal([
      { type: 'social', targetId: 'keeper', emotion: 'surprised', relationshipDelta: 1, memory: 'Rowan kissed my cheek; I laughed.' },
    ], { dialogue: [{ kind: 'speech', speakerId: 'keeper', text: 'Well, that was unexpected.' }] }));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.entities.keeper.relationships.rowan).toBe(1);
    expect(result.world.entities.keeper.memories.at(-2)?.text).toContain('kissed');
    const thought = resolveSandboxTurn(before, 'rowan', proposal([], { dialogue: [{ kind: 'thought', speakerId: 'rowan', text: 'I remember.' }] }));
    expect(thought.ok && thought.world.tick).toBe(0);
    expect(resolveSandboxTurn(before, 'rowan', proposal([], { dialogue: [{ kind: 'thought', speakerId: 'keeper', text: 'Private.' }] })).ok).toBe(false);
  });
});
