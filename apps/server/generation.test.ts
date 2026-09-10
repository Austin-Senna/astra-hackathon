import { describe, expect, it } from 'vitest';
import { compileAdventure, AdventureDesignSchema, verifySolution } from './generation';
import { projectWorld } from '../../packages/engine';

export const design = () => ({
  title: 'The Tidal Observatory', premise: 'Restore a vanished star.', goal: 'Find the star keeper.', protagonist: { name: 'Iona', description: 'A careful astronomer.', opening: 'The sky is empty. I must find the keeper before dawn.', abilities: ['rest', 'mend', 'flee'] },
  keyName: 'Telescope key', gateName: 'Observatory seal', toolName: 'Lens lever', ending: 'The star keeper is safe, and the sky has returned.', secret: 'The keeper hid the stars from the storm.',
  rooms: Array.from({ length: 4 }, (_, i) => ({ name: ['Cabin', 'Pier', 'Garden', 'Observatory'][i], description: `The ${i}th room holds a clue.`, ambience: 'rain', palette: { floor: '#648586', wall: '#314b4d', accent: '#ebb88c' }, objects: Array.from({ length: 8 }, (_, n) => ({ name: `Object ${i}-${n}`, description: 'A well used object.', assetId: 'book', kind: 'item', interaction: 'inspect', portable: true, x: 5 + n * 2, y: 4, dialogue: '', fact: '', tags: [] })) })),
});
describe('adventure compilation', () => {
  it('compiles new content into furnished rooms with a replayable objective', () => {
    const parsed = AdventureDesignSchema.parse(design());
    const world = compileAdventure(parsed, 'tidal', 12);
    expect(Object.keys(world.maps)).toHaveLength(4);
    expect(Object.keys(world.entities).length).toBeGreaterThan(36);
    expect(verifySolution(world)).toBe(true);
    expect(projectWorld(world, 'player').knownFacts).not.toContain(parsed.ending);
  });
  it('rejects overlapping placement and unsupported abilities instead of making broken worlds', () => {
    const bad = design(); bad.rooms[0].objects[1].x = bad.rooms[0].objects[0].x;
    expect(() => compileAdventure(AdventureDesignSchema.parse(bad), 'bad', 12)).toThrow();
    bad.protagonist.abilities = ['teleport']; expect(AdventureDesignSchema.safeParse(bad).success).toBe(false);
  });
});
