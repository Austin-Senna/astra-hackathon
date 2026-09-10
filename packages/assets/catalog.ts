import type { AssetDefinition } from '../contracts';

export const heroNames = ['player', 'nell', 'keeper', 'echo', 'enemy', 'bed', 'rug', 'table', 'chair', 'wardrobe', 'chest', 'key', 'letter', 'book', 'candle', 'lamp', 'plant', 'flower', 'fountain', 'door', 'window', 'crate', 'barrel', 'crowbar', 'apple', 'bottle', 'keepsake', 'stairs', 'mirror', 'clock', 'sword', 'shield', 'torch', 'stone', 'bone', 'mushrooms', 'item'] as const;
const characters = new Set(['player', 'nell', 'keeper', 'echo', 'enemy']);
const furniture = new Set(['bed', 'rug', 'table', 'chair', 'wardrobe', 'chest', 'lamp', 'door', 'window', 'mirror', 'clock']);
export const assetCatalog: AssetDefinition[] = [
  ...heroNames.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), tags: [id, characters.has(id) ? 'character' : furniture.has(id) ? 'furniture' : 'object'], width: 32, height: 32, status: 'ready' as const, variants: { sprite: { url: `/art/hero/${id}.png` } } })),
  ...(['town', 'dungeon'] as const).flatMap(pack => Array.from({ length: 132 }, (_, index) => ({ id: `${pack}-${index}`, name: `${pack} tile ${index}`, tags: [pack, 'pixel', index < 48 ? 'terrain' : index < 96 ? 'object' : 'character'], width: 16, height: 16, status: 'ready' as const, variants: { sprite: { url: `/art/${pack}/tile_${String(index).padStart(4, '0')}.png` } } }))),
];
