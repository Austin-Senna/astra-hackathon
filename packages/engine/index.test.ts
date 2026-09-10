import { describe, expect, it } from 'vitest';
import { applyCommandBatch, instantiateBlueprint, projectWorld, validateBlueprint } from './index';
import { createDungeonWorld, createHouseWorld } from './fixtures';
import type { DMCommand, WorldState } from '../contracts';

function act(w: WorldState, ...commands: DMCommand[]): WorldState {
  const r = applyCommandBatch(w, 'rowan', commands);
  if (!r.ok) throw new Error(r.error.message);
  return r.world;
}
function walk(w: WorldState, x: number, y: number): WorldState {
  while (w.entities.rowan.location!.x !== x) w = act(w, { type: 'move', x: w.entities.rowan.location!.x + Math.sign(x - w.entities.rowan.location!.x), y: w.entities.rowan.location!.y });
  while (w.entities.rowan.location!.y !== y) w = act(w, { type: 'move', x, y: w.entities.rowan.location!.y + Math.sign(y - w.entities.rowan.location!.y) });
  return w;
}
function solveHouse(alternative = false) {
  let w = createHouseWorld();
  w = act(w, { type: 'interact', targetId: alternative ? 'crowbar' : 'brass-key' });
  w = walk(w, 21, 8);
  w = act(w, { type: 'move', x: 22, y: 8 });
  expect(w.entities.rowan.location!.mapId).toBe('hall');
  w = walk(w, 20, 8);
  w = act(w, { type: 'use', itemId: alternative ? 'crowbar' : 'brass-key', targetId: 'garden-door' });
  w = walk(w, 21, 8);
  w = act(w, { type: 'move', x: 22, y: 8 });
  expect(w.entities.rowan.location!.mapId).toBe('conservatory');
  w = walk(w, 20, 8);
  w = act(w, { type: 'move', x: 21, y: 8 });
  expect(w.entities.rowan.location!.mapId).toBe('attic');
  w = walk(w, 9, 8);
  return act(w, { type: 'interact', targetId: 'nell' });
}

describe('deterministic authoritative engine', () => {
  it.each(['constructor', '__proto__', 'toString'])('rejects inherited object references for %s without throwing', id => {
    const w = createHouseWorld();
    expect(applyCommandBatch(w, id, [{ type: 'wait' }])).toMatchObject({ ok: false });
    expect(applyCommandBatch(w, 'rowan', [{ type: 'inspect', targetId: id }])).toMatchObject({ ok: false });
    expect(applyCommandBatch(w, 'rowan', [{ type: 'use', itemId: id }])).toMatchObject({ ok: false });
    expect(projectWorld(w, id).knownFacts).toEqual([]);
    const badHolder = createHouseWorld(); badHolder.entities['brass-key'].location = null; badHolder.entities['brass-key'].holderId = id;
    expect(validateBlueprint(badHolder).ok).toBe(false);
    const badMap = createHouseWorld(); badMap.entities.rowan.location!.mapId = id;
    expect(validateBlueprint(badMap).ok).toBe(false);
    const badFact = createHouseWorld(); badFact.entities.rowan.knowledge.push(id);
    expect(validateBlueprint(badFact).ok).toBe(false);
  });
  it('rejects a hidden loose key but accepts a key revealed by its accessible container', () => {
    const w = createHouseWorld(); w.entities['brass-key'].statuses.push('hidden'); w.entities.crowbar.tags = [];
    expect(validateBlueprint(w).ok).toBe(false);
    w.entities['brass-key'].location = null; w.entities['brass-key'].holderId = 'bedroom-chest'; w.entities['bedroom-chest'].inventory.push('brass-key');
    expect(validateBlueprint(w).ok).toBe(true);
    let opened = walk(w, 9, 6); opened = act(opened, { type: 'interact', targetId: 'bedroom-chest' }, { type: 'pickUp', targetId: 'brass-key' });
    expect(opened.entities.rowan.inventory).toContain('brass-key');
  });
  it('rejects attacks and strike abilities from nonparticipants in an active encounter', () => {
    let w = createDungeonWorld(); w.entities.second = { ...structuredClone(w.entities.rowan), id: 'second', location: { mapId: 'crypt', x: 5, y: 7, elevation: 0 } }; w.actorIds.push('second');
    w = act(w, { type: 'attack', targetId: 'sentinel' }); const before = JSON.stringify(w);
    for (const command of [{ type: 'attack', targetId: 'sentinel' }, { type: 'useAbility', abilityId: 'strike', targetId: 'sentinel' }] as DMCommand[]) {
      expect(applyCommandBatch(w, 'second', [command])).toMatchObject({ ok: false });
      expect(applyCommandBatch(w, 'second', [command], { dm: true })).toMatchObject({ ok: false });
    }
    expect(JSON.stringify(w)).toBe(before);
  });
  it('rejects an active blueprint without a living playable actor', () => {
    const w = createHouseWorld(); w.entities.rowan.hp = 0; expect(validateBlueprint(w).ok).toBe(false);
    w.entities.rowan.hp = 20; w.entities.rowan.statuses.push('dead'); expect(validateBlueprint(w).ok).toBe(false);
    w.entities.second = { ...structuredClone(w.entities.rowan), id: 'second', statuses: [] }; w.actorIds.push('second');
    expect(validateBlueprint(w).ok).toBe(true);
  });
  it('rejects instantiating an ended blueprint with no living actor', () => {
    const w = createHouseWorld(); w.entities.rowan.hp = 0; w.status = 'lost'; w.phase = 'ended';
    expect(validateBlueprint(w).ok).toBe(true);
    expect(() => instantiateBlueprint(w, 'fresh', 33)).toThrow('living playable actor');
    expect(w.status).toBe('lost'); expect(w.phase).toBe('ended');
  });
  it('commits DM presentation without advancing time, hazards, or retaliation', () => {
    let w = act(createDungeonWorld(), { type: 'attack', targetId: 'sentinel' });
    w.entities.rowan.statuses.push('burning'); const before = structuredClone(w);
    const result = applyCommandBatch(w, 'rowan', [{ type: 'narrate', speakerId: null, text: 'The sentinel hesitates.' }, { type: 'say', speakerId: 'sentinel', text: 'Why have you come?' }, { type: 'think', speakerId: 'rowan', text: 'There may be another way.' }], { dm: true });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.world.tick).toBe(before.tick); expect(result.world.rng).toBe(before.rng); expect(result.world.encounter).toEqual(before.encounter);
    expect(result.world.entities.rowan.hp).toBe(before.entities.rowan.hp); expect(result.world.entities.rowan.hunger).toBe(before.entities.rowan.hunger);
    expect(result.world.revision).toBe(before.revision + 1); expect(result.events).toHaveLength(3); expect(result.events.every(e => e.tick === before.tick)).toBe(true);
    const physical = applyCommandBatch(w, 'rowan', [{ type: 'narrate', speakerId: null, text: 'A heartbeat passes.' }, { type: 'wait' }], { dm: true });
    expect(physical.ok && physical.world.tick).toBe(before.tick + 1); expect(physical.ok && physical.world.entities.rowan.hp).toBeLessThan(before.entities.rowan.hp);
  });
  it('rejects a whole batch without mutating inputs', () => {
    const w = createHouseWorld(); const before = JSON.stringify(w);
    const r = applyCommandBatch(w, 'rowan', [{ type: 'interact', targetId: 'brass-key' }, { type: 'move', x: 23, y: 8 }]);
    expect(r.ok).toBe(false); expect(JSON.stringify(w)).toBe(before);
  });
  it('replays deterministically and increments revision once per batch', () => {
    const w = createHouseWorld(); const commands: DMCommand[] = [{ type: 'interact', targetId: 'brass-key' }, { type: 'wait' }];
    const a = applyCommandBatch(w, 'rowan', commands); expect(a).toEqual(applyCommandBatch(w, 'rowan', commands));
    expect(a.ok && a.world.revision).toBe(1); expect(a.ok && a.events.length).toBeGreaterThanOrEqual(2);
  });
  it('prevents duplicate ownership and enforces proximity', () => {
    let w = act(createHouseWorld(), { type: 'pickUp', targetId: 'brass-key' });
    expect(w.entities['brass-key'].location).toBe(null); expect(w.entities.rowan.inventory).toEqual(['brass-key']);
    expect(applyCommandBatch(w, 'rowan', [{ type: 'pickUp', targetId: 'brass-key' }]).ok).toBe(false);
    expect(applyCommandBatch(w, 'rowan', [{ type: 'interact', targetId: 'nell' }]).ok).toBe(false);
    w = act(w, { type: 'drop', itemId: 'brass-key' }); expect(w.entities['brass-key'].holderId).toBe(null);
  });
  it('supports both complete house solution routes across four persistent maps', () => {
    for (const alternative of [false, true]) {
      const w = solveHouse(alternative); expect(w.status).toBe('won');
      expect(Object.values(w.maps).every(m => m.discovered)).toBe(true);
      expect(JSON.parse(JSON.stringify(w))).toEqual(w);
      expect(w.entities['garden-door'].statuses).toContain('open');
    }
  });
  it('makes the conservatory latch a required gate without a walk-around', () => {
    let w = walk(createHouseWorld(), 21, 8); w = act(w, { type: 'move', x: 22, y: 8 });
    w = walk(w, 20, 8);
    expect(applyCommandBatch(w, 'rowan', [{ type: 'move', x: 21, y: 8 }]).ok).toBe(false);
    w = act(w, { type: 'move', x: 20, y: 7 });
    expect(applyCommandBatch(w, 'rowan', [{ type: 'move', x: 21, y: 7 }]).ok).toBe(false);
  });
  it('rejects a lock whose key is beyond its own gate', () => {
    const w = createHouseWorld(); w.entities['brass-key'].location = { mapId: 'attic', x: 6, y: 8, elevation: 0 };
    w.entities.crowbar.tags = [];
    expect(validateBlueprint(w).ok).toBe(false);
  });
  it('filters hidden rooms, secrets, other actors and NPC knowledge', () => {
    const w = createHouseWorld(); w.entities.keeper.knowledge.push('private');
    const view = projectWorld(w, 'rowan');
    expect(view).not.toHaveProperty('secrets'); expect(view).not.toHaveProperty('facts');
    expect(view.entities.nell).toBeUndefined(); expect(view.maps.attic).toBeUndefined();
    expect(view.entities['hidden-letter']).toBeUndefined();
    w.maps.hall.discovered = true; expect(projectWorld(w, 'rowan').entities.keeper.knowledge).toEqual([]);
  });
  it('rejects raw DM spawn and caps validated introductions', () => {
    const w = createHouseWorld(); const entity = { ...w.entities['brass-key'], id: 'new-key' };
    expect(applyCommandBatch(w, 'rowan', [{ type: 'spawn', entity }]).ok).toBe(false);
    expect(applyCommandBatch(w, 'rowan', [1,2,3].map(i => ({ type: 'spawn', entity: { ...entity, id: `key-${i}` } })), { dm: true }).ok).toBe(false);
  });
  it('validates fixtures and rejects malformed references and ownership', () => {
    for (const w of [createHouseWorld(), createDungeonWorld()]) expect(validateBlueprint(w)).toMatchObject({ ok: true });
    const w = createHouseWorld(); w.entities['brass-key'].holderId = 'missing';
    expect(validateBlueprint(w).ok).toBe(false);
    const bad = createHouseWorld(); bad.maps.bedroom.tiles[1] = '#'; expect(validateBlueprint(bad).ok).toBe(false);
    const blocked = createHouseWorld(); blocked.maps.bedroom.tiles = blocked.maps.bedroom.tiles.map(row => row.slice(0, 12) + '#' + row.slice(13)); expect(validateBlueprint(blocked).ok).toBe(false);
    const instance = instantiateBlueprint(createHouseWorld(), 'fresh', 33); expect(instance.id).toBe('fresh'); expect(instance.revision).toBe(0);
  });
  it('allows a second human actor with independent inventory', () => {
    let w = createHouseWorld(); w.entities.second = { ...structuredClone(w.entities.rowan), id: 'second', name: 'Second' }; w.actorIds.push('second');
    const r = applyCommandBatch(w, 'second', [{ type: 'pickUp', targetId: 'brass-key' }]); expect(r.ok).toBe(true);
    if (!r.ok) return; w = r.world; expect(w.entities.second.inventory).toEqual(['brass-key']); expect(w.entities.rowan.inventory).toEqual([]);
  });
  it('resolves combat, abilities, and fleeing with persistent health', () => {
    let w = createDungeonWorld(); w = act(w, { type: 'attack', targetId: 'sentinel' });
    expect(w.encounter?.status).toBe('active'); expect(w.entities.sentinel.hp).toBeLessThan(w.entities.sentinel.maxHp);
    expect(applyCommandBatch(w, 'rowan', [{ type: 'useAbility', abilityId: 'infinite-heal' }]).ok).toBe(false);
    w = act(w, { type: 'useAbility', abilityId: 'flee' }); expect(w.encounter?.status).toBe('fled');
    const surrender = act(act(createDungeonWorld(), { type: 'attack', targetId: 'sentinel' }), { type: 'useAbility', abilityId: 'surrender' }); expect(surrender.encounter?.status).toBe('fled');
  });
  it('enforces capacity and remembers a returned keepsake after travel and reload', () => {
    let w = createHouseWorld(); w = walk(w, 7, 8); w = act(w, { type: 'pickUp', targetId: 'keepsake' });
    w = walk(w, 21, 8); w = act(w, { type: 'move', x: 22, y: 8 }); w = walk(w, 8, 7);
    w = act(w, { type: 'give', itemId: 'keepsake', targetId: 'keeper' });
    expect(w.entities.keeper.relationships.rowan).toBe(3); expect(w.entities.keeper.memories.some(m => m.kind === 'help')).toBe(true);
    w = JSON.parse(JSON.stringify(w)); w = act(w, { type: 'interact', targetId: 'keeper' });
    expect(w.dialogue.some(line => line.text.startsWith('I remember:'))).toBe(true);
    const full = createHouseWorld(); for (let i = 0; i < 8; i++) { const item = structuredClone(full.entities['brass-key']); item.id = `owned-${i}`; item.location = null; item.holderId = 'rowan'; full.entities[item.id] = item; full.entities.rowan.inventory.push(item.id); }
    expect(applyCommandBatch(full, 'rowan', [{ type: 'pickUp', targetId: 'brass-key' }])).toMatchObject({ ok: false, error: { code: 'INVENTORY_FULL' } });
  });
  it('opens containers, moves crates, consumes food, and applies water and fire', () => {
    let w = createHouseWorld(); w = walk(w, 9, 6); w = act(w, { type: 'interact', targetId: 'bedroom-chest' });
    expect(w.entities['hidden-letter'].holderId).toBeNull(); expect(w.entities['hidden-letter'].statuses).not.toContain('hidden');
    w = act(w, { type: 'pickUp', targetId: 'hidden-letter' }); expect(w.entities.rowan.knowledge).toContain('attic-song');
    w.entities.rowan.location = { mapId: 'hall', x: 11, y: 10, elevation: 0 };
    w = act(w, { type: 'push', targetId: 'hall-crate' }); expect(w.entities['hall-crate'].location?.x).toBe(13);
    w.entities.rowan.location = { mapId: 'hall', x: 5, y: 8, elevation: 0 }; w.entities.rowan.hp = 10;
    w = act(w, { type: 'pickUp', targetId: 'apple' }, { type: 'use', itemId: 'apple' }); expect(w.entities.rowan.hp).toBe(15); expect(w.entities.apple).toBeUndefined();
    w.entities.rowan.location = { mapId: 'conservatory', x: 5, y: 8, elevation: 0 }; w.entities.rowan.statuses.push('burning');
    w = act(w, { type: 'pickUp', targetId: 'bottle' }, { type: 'use', itemId: 'bottle' });
    expect(w.entities.rowan.statuses).toContain('wet'); expect(w.entities.rowan.statuses).not.toContain('burning');
  });
  it('can win combat and dungeon objective, and ends when the only actor dies', () => {
    let w = createDungeonWorld(); w.entities.sentinel.hp = 1; w = act(w, { type: 'attack', targetId: 'sentinel' });
    expect(w.encounter?.status).toBe('won'); expect(w.entities.sentinel.statuses).toContain('dead');
    for (let i = 0; i < 3; i++) { w = walk(w, 21, 8); w = act(w, { type: 'move', x: 22, y: 8 }); }
    w = walk(w, 9, 8); w = act(w, { type: 'pickUp', targetId: 'ember' }); expect(w.status).toBe('won');
    const doomed = createDungeonWorld(); doomed.entities.rowan.hp = 1;
    const dead = act(doomed, { type: 'attack', targetId: 'sentinel' }); expect(dead.status).toBe('lost'); expect(dead.encounter?.status).toBe('lost');
  });
  it('rejects duplicate IDs, ownership cycles, bad exits, and critical blocked entrances', () => {
    const duplicate = createHouseWorld(); duplicate.entities.rowan.inventory = ['brass-key', 'brass-key']; expect(validateBlueprint(duplicate).ok).toBe(false);
    const cycle = createHouseWorld(); cycle.entities['brass-key'].location = null; cycle.entities['brass-key'].holderId = 'brass-key'; cycle.entities['brass-key'].inventory = ['brass-key']; expect(validateBlueprint(cycle).ok).toBe(false);
    const exit = createHouseWorld(); exit.maps.bedroom.exits[0].toMapId = 'missing'; expect(validateBlueprint(exit).ok).toBe(false);
    const entrance = createHouseWorld(); entrance.entities.bed.location = { mapId: 'hall', x: 2, y: 8, elevation: 0 }; expect(validateBlueprint(entrance).ok).toBe(false);
  });
  it('keeps an unwitnessed discovery out of another actor dialogue', () => {
    let w = createHouseWorld(); w.entities.second = { ...structuredClone(w.entities.rowan), id: 'second', location: { mapId: 'hall', x: 3, y: 8, elevation: 0 } }; w.actorIds.push('second');
    w = walk(w, 6, 8); w = act(w, { type: 'interact', targetId: 'nell-letter' });
    expect(projectWorld(w, 'rowan').knownFacts).toContain(w.facts['nell-note']);
    expect(projectWorld(w, 'second').dialogue.some(line => line.text === w.facts['nell-note'])).toBe(false);
  });
  it('does not freeze an unrelated actor when another actor encounters an enemy', () => {
    let w = createDungeonWorld(); w.entities.second = { ...structuredClone(w.entities.rowan), id: 'second', location: { mapId: 'grotto', x: 3, y: 8, elevation: 0 } }; w.actorIds.push('second');
    w = act(w, { type: 'attack', targetId: 'sentinel' });
    const r = applyCommandBatch(w, 'second', [{ type: 'wait' }]); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.world.encounter?.turnActorId).toBe('rowan'); expect(r.world.encounter?.status).toBe('active'); }
    expect(applyCommandBatch(w, 'second', [{ type: 'useAbility', abilityId: 'flee' }]).ok).toBe(false);
    w.entities.second.location = { mapId: 'grotto', x: 21, y: 8, elevation: 0 };
    const travel = applyCommandBatch(w, 'second', [{ type: 'move', x: 22, y: 8 }]);
    expect(travel.ok && travel.world.encounter?.status).toBe('active');
  });
  it('burns a targeted object and rejects actions while asleep', () => {
    let w = createHouseWorld(); const candle = w.entities['bedroom-candle']; candle.kind = 'item'; candle.portable = true; candle.location = { ...w.entities.rowan.location! };
    w = act(w, { type: 'pickUp', targetId: candle.id }, { type: 'use', itemId: candle.id, targetId: 'crowbar' });
    expect(w.entities.crowbar.statuses).toContain('burning'); expect(w.entities.crowbar.hp).toBe(8);
    w.entities.rowan.statuses.push('asleep'); expect(applyCommandBatch(w, 'rowan', [{ type: 'move', x: 3, y: 8 }]).ok).toBe(false);
  });
  it('rejects solid obstructions on a critical route and objectives trapped in locked containers', () => {
    const blocked = createHouseWorld(); blocked.entities['hall-chair'].location = { mapId: 'hall', x: 20, y: 8, elevation: 0 };
    blocked.maps.hall.tiles = blocked.maps.hall.tiles.map((row, y) => y === 8 ? row : row.slice(0, 20) + '#' + row.slice(21));
    expect(validateBlueprint(blocked).ok).toBe(false);
    const trapped = createDungeonWorld(); trapped.entities.ember.location = null; trapped.entities.ember.holderId = 'vault-chest'; trapped.entities['vault-chest'].inventory = ['ember']; trapped.entities['vault-chest'].statuses = ['locked'];
    expect(validateBlueprint(trapped).ok).toBe(false);
  });
});
