import type { Entity, WorldState } from '../contracts';
import { fixtureEntity } from './fixtures';

export function createSandboxWorld(id = 'sandbox', seed = 4103): WorldState {
  const mapId = 'courtyard';
  const world: WorldState = {
    schemaVersion: 1, id, title: 'The Unwritten Courtyard', seed, rng: seed >>> 0, revision: 0, tick: 0,
    premise: 'A courtyard where imagination changes matter. The people here remember what you do.', goal: '',
    phase: 'exploring', status: 'active', actorIds: ['rowan'], entities: {},
    maps: { [mapId]: { id: mapId, name: 'The Unwritten Courtyard', description: 'Water splashes beside a workshop. Dry crates crowd the sunlit cobbles; a sentinel watches a cook argue with a stubborn kettle.', width: 24, height: 16,
      tiles: Array.from({ length: 16 }, (_, y) => y === 0 || y === 15 ? '#'.repeat(24) : '#' + '.'.repeat(22) + '#'),
      discovered: true, ambience: 'courtyard', exits: [], palette: { floor: '#7d9280', wall: '#45454f', accent: '#ddb875' } } },
    objective: { type: 'reach', mapId, targetId: null, factId: null },
    facts: {}, knownFacts: [], secrets: {}, memories: [], dialogue: [], encounter: null,
    style: { accent: '#ddb875', ambience: 'courtyard' },
    sandbox: { enabled: true, forms: [], rules: [
      { id: 'fire-and-water', version: 1, mapId, description: 'Water extinguishes ordinary fire and makes objects wet; wet objects resist ignition until dried. Resolve the affected entity states when this interaction occurs.' },
      { id: 'wood-and-wind', version: 1, mapId, description: 'Dry wood and cloth can burn. Wind can carry existing fire toward nearby dry fuel in its specified direction, but not through stone walls.' },
      { id: 'creative-forms', version: 1, mapId, description: 'People can invent and adopt forms or abilities by intention. No class, unlock quest, or prerequisite is required. Changes and their consequences persist.' },
    ] },
  };
  const add = (entityId: string, name: string, asset: string, x: number, y: number, extra: Partial<Entity> = {}) => {
    world.entities[entityId] = fixtureEntity(entityId, name, asset, mapId, x, y, extra);
  };
  const use = (type: 'npc' | 'water' | 'food' | 'container' | 'fire') => ({ type, requiresItemId: null, grantsFact: null, targetId: null });
  add('rowan', 'Rowan', 'player', 4, 8, { kind: 'player', hp: 30, maxHp: 30, abilities: [], facing: 'east', properties: { mp: 20, maxMp: 20 }, description: 'A curious visitor whose form and possibilities are not fixed.', emotion: 'curious' });
  add('sentinel', 'The Sentinel', 'enemy', 5, 7, { kind: 'npc', hp: 30, maxHp: 30, interaction: use('npc'), description: 'A living stone guardian with an unexpectedly expressive face.', dialogue: ['I was told to expect the unexpected. I am not sure I believed them.'], properties: { material: 'stone' } });
  add('cook', 'Mira', 'keeper', 13, 9, { kind: 'npc', interaction: use('npc'), description: 'A practical cook who cares about the courtyard and will remember who helps or damages it.', dialogue: ['That kettle has opinions. I wish it would keep them to itself.'] });
  add('wooden-crate', 'Dry wooden crate', 'crate', 7, 8, { solid: true, tags: ['wood', 'flammable', 'pushable'], description: 'A loose wooden crate, dry enough to catch a spark. It can be moved, broken, burned, or repurposed.' });
  add('wooden-crate-2', 'Stacked kindling', 'crate', 9, 8, { tags: ['wood', 'flammable', 'fuel'], description: 'Thin strips of dry wood spill onto the cobbles.' });
  add('water-barrel', 'Open water barrel', 'barrel', 6, 10, { solid: true, tags: ['water', 'container'], interaction: use('water'), properties: { water: 40 }, description: 'An open barrel of water. Plenty for splashing, filling a vessel, or putting out a fire.' });
  add('fountain', 'Stone fountain', 'fountain', 12, 4, { solid: true, tags: ['water', 'stone'], interaction: use('water'), description: 'Running water spills into a shallow stone basin.' });
  add('bucket', 'Empty bucket', 'bottle', 4, 9, { kind: 'item', portable: true, tags: ['vessel'], properties: { water: 0 }, description: 'A sturdy empty bucket that can carry water or anything small enough to fit.' });
  add('torch', 'Burning torch', 'torch', 3, 7, { kind: 'item', portable: true, tags: ['fire', 'wood'], interaction: use('fire') });
  add('cloth', 'Red cloth', 'rug', 8, 10, { kind: 'item', portable: true, tags: ['cloth', 'flammable'], description: 'A bright square of cloth. It can be soaked, tied, worn, or set alight.' });
  add('fan', 'Workshop bellows', 'book', 9, 5, { kind: 'item', portable: true, tags: ['wind', 'tool'], description: 'Leather bellows push a directed gust of air.' });
  add('chicken', 'Courtyard chicken', 'item', 10, 9, { kind: 'npc', tags: ['animal', 'cookable'], description: 'A plump white chicken investigates crumbs beside the cooking fire.' });
  add('apple', 'Red apple', 'apple', 5, 8, { kind: 'item', portable: true, tags: ['food'], interaction: use('food') });
  add('bread', 'Fresh bread', 'apple', 14, 9, { kind: 'item', portable: true, tags: ['food'], interaction: use('food') });
  add('workbench', 'Workshop bench', 'table', 17, 5, { solid: true, tags: ['wood', 'flammable'], description: 'A work surface for combining, repairing, or inventing things.' });
  add('hammer', 'Iron hammer', 'crowbar', 16, 6, { kind: 'item', portable: true, tags: ['metal', 'tool'], description: 'A heavy tool for shaping metal or breaking brittle objects.' });
  add('stone', 'Loose stone', 'stone', 15, 7, { kind: 'item', portable: true, tags: ['stone'], description: 'A smooth stone with a hollow that could hold a little liquid.' });
  add('flower', 'Blue flowers', 'flower', 18, 11, { tags: ['plant', 'flammable'], description: 'Sweet-smelling flowers grow between the cobbles.' });
  add('chest', 'Open supply chest', 'chest', 18, 8, { solid: true, tags: ['wood', 'flammable'], interaction: use('container'), description: 'An unlocked chest suitable for storing collected materials.' });
  add('kettle', 'Opinionated kettle', 'bottle', 12, 9, { tags: ['metal', 'vessel'], properties: { water: 2, temperature: 70 }, description: 'A kettle rattles and whistles little complaints. It holds hot water.' });
  add('bench', 'Garden bench', 'chair', 5, 12, { solid: true, tags: ['wood', 'rest', 'flammable'] });
  world.dialogue = [{ id: `${id}:intro`, speakerId: 'rowan', speaker: 'Rowan', kind: 'thought', text: 'Something feels different here. For a moment I could almost feel wings on my back.' }];
  return world;
}
