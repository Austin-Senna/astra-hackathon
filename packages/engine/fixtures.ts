import type { Entity, Interaction, MapState, WorldState } from '../contracts';

const interaction = (type: Interaction['type'], grantsFact: string | null = null, requiresItemId: string | null = null, targetId: string | null = null): Interaction => ({ type, grantsFact, requiresItemId, targetId });
function room(id: string, name: string, description: string, floor: string, wall: string, accent: string, discovered = false): MapState {
  return { id, name, description, width: 24, height: 16, tiles: Array.from({ length: 16 }, (_, y) => y === 0 || y === 15 ? '#'.repeat(24) : '#' + '.'.repeat(22) + '#'), discovered, ambience: id, exits: [], palette: { floor, wall, accent } };
}
export function fixtureEntity(id: string, name: string, assetId: string, mapId: string, x: number, y: number, extra: Partial<Entity> = {}): Entity {
  return { id, name, assetId, description: name, kind: 'fixture', location: { mapId, x, y, elevation: 0 }, holderId: null, inventory: [], tags: [], hp: 10, maxHp: 10, weight: 1, solid: false, portable: false, statuses: [], abilities: [], stamina: 100, hunger: 0, emotion: 'quiet', traits: { kindness: 0.5, curiosity: 0.5, courage: 0.5 }, relationships: {}, knowledge: [], memories: [], intent: 'idle', dialogue: [], interaction: interaction('inspect'), ...extra };
}
function connect(a: MapState, b: MapState, ax = 22, ay = 8) {
  a.exits.push({ x: ax, y: ay, toMapId: b.id, toX: 2, toY: 8 });
  b.exits.push({ x: 1, y: 8, toMapId: a.id, toX: ax - 1, toY: ay });
}
function base(id: string, seed: number, maps: WorldState['maps'], title: string): WorldState {
  return { schemaVersion: 1, id, title, premise: '', goal: '', seed, rng: seed >>> 0, revision: 0, tick: 0, phase: 'exploring', status: 'active', maps, entities: {}, actorIds: ['rowan'], objective: { type: 'fact', targetId: null, factId: 'found-nell', mapId: null }, facts: {}, knownFacts: [], secrets: {}, memories: [], dialogue: [], encounter: null, style: { accent: '#dbac69', ambience: 'gentle-mystery' } };
}
export function createHouseWorld(worldId = 'house', seed = 4103): WorldState {
  const bedroom = room('bedroom', 'The Blue Bedroom', 'Rain against the glass. Nell\'s side of the bed is empty.', '#6c8386', '#34464b', '#e8c995', true);
  const hall = room('hall', 'The Listening Hall', 'A clock without hands keeps time with your footsteps.', '#967966', '#4c454d', '#d7a165');
  hall.tiles = hall.tiles.map((row, y) => y === 8 ? row : row.slice(0, 21) + '#' + row.slice(22));
  const conservatory = room('conservatory', 'The Conservatory', 'Moonlight catches on leaves and the old fountain.', '#6d8a71', '#394e48', '#ccdfa8');
  const attic = room('attic', 'The Starlit Attic', 'Under the rafters, a small lamp is still burning.', '#88798a', '#494454', '#e8ca8a');
  connect(bedroom, hall); connect(hall, conservatory); connect(conservatory, attic, 21);
  const w = base(worldId, seed, { bedroom, hall, conservatory, attic }, 'The House Remembers');
  w.premise = 'A house rearranges itself around the things its inhabitants remember. Your sister Nell has vanished upstairs.';
  w.goal = 'Find your sister Nell.';
  w.facts = { 'nell-note': 'Nell followed the music through the conservatory. The attic stair is beyond the fountain.', 'keeper-hint': 'The brass key fits the conservatory latch. A crowbar could also lever it open.', 'found-nell': 'Nell is safe. She was keeping a forgotten promise to the house.', 'attic-song': 'The tune in the attic is the lullaby your mother sang.' };
  w.secrets = { ending: 'Nell has been repairing the house\'s broken music box.' };
  const add = (id: string, name: string, asset: string, map: string, x: number, y: number, extra: Partial<Entity> = {}) => { w.entities[id] = fixtureEntity(id, name, asset, map, x, y, extra); };
  add('rowan', 'Rowan', 'player', 'bedroom', 4, 8, { kind: 'player', hp: 20, maxHp: 20, abilities: ['rest', 'mend', 'flee', 'surrender'], description: 'Nell\'s older sibling. A patient listener with a practical streak.', emotion: 'concerned' });
  add('brass-key', 'Brass key', 'key', 'bedroom', 4, 7, { kind: 'item', portable: true, tags: ['key'], description: 'A small brass key. Its bow is shaped like a leaf.' });
  add('crowbar', 'Old crowbar', 'crowbar', 'bedroom', 5, 8, { kind: 'item', portable: true, tags: ['lever', 'weapon'], description: 'The iron end is narrow enough to prise a stubborn latch.' });
  add('bed', 'Unmade bed', 'bed', 'bedroom', 6, 4, { solid: true, description: 'Nell\'s quilt is folded back. It is still warm.', tags: ['rest'] });
  add('bedroom-rug', 'Woven rug', 'rug', 'bedroom', 11, 10);
  add('bedroom-table', 'Writing desk', 'table', 'bedroom', 13, 4, { solid: true });
  add('nell-letter', 'Nell\'s letter', 'letter', 'bedroom', 7, 8, { interaction: interaction('clue', 'nell-note'), description: 'The page reads: "I heard our song upstairs. Don\'t worry. N."' });
  add('bedroom-chest', 'Cedar chest', 'chest', 'bedroom', 9, 5, { solid: true, inventory: ['hidden-letter'], interaction: interaction('container'), description: 'An unlocked chest full of old letters.' });
  add('hidden-letter', 'Folded lullaby', 'book', 'bedroom', 9, 5, { kind: 'item', portable: true, location: null, holderId: 'bedroom-chest', statuses: ['hidden'], interaction: interaction('clue', 'attic-song') });
  add('keepsake', 'Keeper\'s locket', 'keepsake', 'bedroom', 8, 8, { kind: 'item', portable: true, tags: ['keepsake'], description: 'The portrait inside matches the keeper in the hall.' });
  add('bedroom-window', 'Rain-streaked window', 'window', 'bedroom', 19, 3);
  add('bedroom-candle', 'Bedside candle', 'candle', 'bedroom', 5, 4, { interaction: interaction('fire'), tags: ['fire'] });
  add('keeper', 'The Keeper', 'keeper', 'hall', 8, 6, { kind: 'npc', interaction: interaction('npc', 'keeper-hint'), dialogue: ['Nell passed through the conservatory. The brass key opens it, but iron and patience work too.'], knowledge: ['keeper-hint'], description: 'An old caretaker turning an empty chain between his fingers.' });
  add('garden-door', 'Conservatory latch', 'door', 'hall', 21, 8, { statuses: ['locked'], solid: true, interaction: interaction('door', null, 'brass-key'), tags: ['leverable'], description: 'A leaf-shaped keyhole. The old wooden latch also looks vulnerable to a crowbar.' });
  add('hall-clock', 'Handless clock', 'clock', 'hall', 12, 3);
  add('hall-mirror', 'Tall mirror', 'mirror', 'hall', 17, 3);
  add('hall-crate', 'Movable crate', 'crate', 'hall', 12, 10, { solid: true, tags: ['pushable'] });
  add('hall-table', 'Console table', 'table', 'hall', 6, 3, { solid: true });
  add('hall-lamp', 'Hall lamp', 'lamp', 'hall', 7, 3);
  add('apple', 'Red apple', 'apple', 'hall', 5, 8, { kind: 'item', portable: true, interaction: interaction('food') });
  add('hall-chair', 'Empty chair', 'chair', 'hall', 15, 11, { solid: true });
  add('hall-book', 'House ledger', 'book', 'hall', 11, 6, { interaction: interaction('clue', 'nell-note') });
  add('echo', 'The Echo', 'echo', 'conservatory', 8, 6, { kind: 'npc', interaction: interaction('npc', 'attic-song'), dialogue: ['She climbed the stair beyond the fountain. She said the house deserved to remember a happy ending.'], description: 'A gentle outline in the mist, humming a familiar tune.' });
  add('fountain', 'Stone fountain', 'fountain', 'conservatory', 12, 5, { solid: true, interaction: interaction('water') });
  add('bottle', 'Water bottle', 'bottle', 'conservatory', 5, 8, { kind: 'item', portable: true, tags: ['water'], interaction: interaction('water') });
  add('garden-plant-1', 'Fern', 'plant', 'conservatory', 5, 4);
  add('garden-plant-2', 'Climbing ivy', 'plant', 'conservatory', 18, 4);
  add('garden-flower', 'White flowers', 'flower', 'conservatory', 15, 11);
  add('garden-bench', 'Garden bench', 'table', 'conservatory', 7, 11, { solid: true });
  add('garden-stone', 'Smooth stone', 'stone', 'conservatory', 16, 6, { kind: 'item', portable: true });
  add('attic-stair', 'Attic stair', 'stairs', 'conservatory', 21, 8, { interaction: interaction('exit'), description: 'The stair rises toward the sound of a music box.' });
  add('garden-window', 'Arched window', 'window', 'conservatory', 12, 2);
  add('nell', 'Nell', 'nell', 'attic', 10, 8, { kind: 'npc', interaction: interaction('npc', 'found-nell'), dialogue: ['You found me. I only wanted to fix the music box. Listen... it remembers us.'], description: 'Your sister kneels beside a music box, safe and smiling.' });
  add('attic-chest', 'Travel trunk', 'chest', 'attic', 5, 4, { interaction: interaction('container'), solid: true });
  add('attic-table', 'Music box table', 'table', 'attic', 12, 7, { solid: true });
  add('attic-lamp', 'Nell\'s lamp', 'lamp', 'attic', 11, 7);
  add('attic-book', 'Lullaby book', 'book', 'attic', 7, 8, { interaction: interaction('clue', 'attic-song') });
  add('attic-chair', 'Little chair', 'chair', 'attic', 14, 9, { solid: true });
  add('attic-window', 'Round window', 'window', 'attic', 12, 2);
  add('attic-crate', 'Dusty crate', 'crate', 'attic', 18, 11, { solid: true, tags: ['pushable'] });
  add('attic-rug', 'Faded rug', 'rug', 'attic', 9, 11);
  add('attic-wardrobe', 'Old wardrobe', 'wardrobe', 'attic', 19, 4, { solid: true });
  w.dialogue = [{ id: `${worldId}:intro`, speakerId: 'rowan', speaker: 'Rowan', kind: 'thought', text: 'Nell\'s gone. I heard her humming somewhere upstairs. I have to find my sister.' }];
  return w;
}

export function createDungeonWorld(worldId = 'dungeon', seed = 7103): WorldState {
  const crypt = room('crypt', 'The Sunken Crypt', 'A sentinel guards the path to the stolen ember.', '#65767d', '#303c47', '#8ed0c3', true);
  const passage = room('passage', 'The Broken Passage', 'Torches reveal a route beneath the old city.', '#77716f', '#403c48', '#e4a06c');
  const grotto = room('grotto', 'The Quiet Grotto', 'Cool water runs around luminous mushrooms.', '#567f79', '#31474a', '#96d9a3');
  const vault = room('vault', 'The Ember Vault', 'A last spark waits to be brought home.', '#85768b', '#443c51', '#e8c17c');
  connect(crypt, passage); connect(passage, grotto); connect(grotto, vault);
  const w = base(worldId, seed, { crypt, passage, grotto, vault }, 'The Last Ember');
  w.premise = 'Retrieve the last ember from a forgotten underground sanctuary.'; w.goal = 'Bring the last ember out of the vault.';
  w.objective = { type: 'possess', targetId: 'ember', factId: null, mapId: null }; w.style = { accent: '#8ed0c3', ambience: 'underground' };
  w.entities.rowan = fixtureEntity('rowan', 'Rowan', 'player', 'crypt', 4, 8, { kind: 'player', hp: 24, maxHp: 24, abilities: ['rest', 'mend', 'strike', 'flee', 'surrender'] });
  w.entities.sentinel = fixtureEntity('sentinel', 'Stone Sentinel', 'enemy', 'crypt', 5, 8, { kind: 'npc', hp: 18, maxHp: 18, intent: 'guard', solid: true, dialogue: ['Lay down your anger and the path is yours.'], interaction: interaction('npc') });
  for (const map of Object.values(w.maps)) {
    for (const [i, asset] of ['torch', 'stone', 'bone', 'barrel', 'mushrooms', 'chest', 'shield', 'book'].entries()) {
      const id = `${map.id}-${asset}`;
      w.entities[id] = fixtureEntity(id, asset[0].toUpperCase() + asset.slice(1), asset, map.id, 5 + (i % 4) * 4, i < 4 ? 4 : 11, { kind: ['shield', 'book', 'bone'].includes(asset) ? 'item' : 'fixture', portable: ['shield', 'book', 'bone'].includes(asset), interaction: interaction(asset === 'torch' ? 'fire' : asset === 'chest' ? 'container' : 'inspect') });
    }
  }
  w.entities.ember = fixtureEntity('ember', 'Last ember', 'candle', 'vault', 10, 8, { kind: 'item', portable: true });
  w.dialogue = [{ id: `${worldId}:intro`, speakerId: 'rowan', speaker: 'Rowan', kind: 'thought', text: 'Four chambers beneath the city. Somewhere ahead, the last ember is still alive.' }];
  return w;
}
