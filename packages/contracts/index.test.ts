import { describe, expect, it } from 'vitest';
import { PlayerIntentSchema, ActionRequestSchema } from './index';
import { z } from 'zod';

describe('external contracts', () => {
  it('accepts bounded intention data and rejects world patches', () => {
    expect(PlayerIntentSchema.safeParse({ type: 'move', x: 2, y: 3 }).success).toBe(true);
    expect(PlayerIntentSchema.safeParse({ type: 'move', x: 2, world: {} }).success).toBe(false);
    expect(PlayerIntentSchema.safeParse({ type: 'spawn', entity: {} }).success).toBe(false);
    expect(ActionRequestSchema.safeParse({ requestId: 'r1', expectedRevision: 0, intent: { type: 'wait' } }).success).toBe(true);
  });
  it.each(['inspect','interact','pickUp','push','attack'])('requires targetId for %s instead of treating itemId as its target', type => {
    expect(PlayerIntentSchema.safeParse({type,itemId:'brass-key'}).success).toBe(false);
    expect(PlayerIntentSchema.safeParse({type,targetId:'brass-key'}).success).toBe(true);
  });
  it.each([
    [{type:'move',x:2},{type:'move',x:2,y:3}],
    [{type:'move',y:3},{type:'move',x:2,y:3}],
    [{type:'give',itemId:'key'},{type:'give',itemId:'key',targetId:'keeper'}],
    [{type:'give',targetId:'keeper'},{type:'give',itemId:'key',targetId:'keeper'}],
    [{type:'useAbility'},{type:'useAbility',abilityId:'rest'}],
    [{type:'use'},{type:'use',itemId:'key'}],
    [{type:'drop'},{type:'drop',itemId:'key'}],
  ])('rejects incomplete command %j and accepts its complete form', (invalid,valid) => {
    expect(PlayerIntentSchema.safeParse(invalid).success).toBe(false);
    expect(PlayerIntentSchema.safeParse(valid).success).toBe(true);
  });
  it.each(['use','drop'])('preserves the targetId alias for %s', type => {
    expect(PlayerIntentSchema.safeParse({type,targetId:'key'}).success).toBe(true);
  });
  it('exports pickup target requirements to the model JSON schema', () => {
    const schema = z.toJSONSchema(PlayerIntentSchema, {target:'draft-7'});
    const branches: {properties?:{type?:{const?:string}};required?:string[]}[] = [];
    const visit = (node: unknown) => {
      if(!node || typeof node !== 'object') return;
      if('properties' in node) branches.push(node as typeof branches[number]);
      for(const value of Object.values(node)) if(Array.isArray(value)) value.forEach(visit); else if(value && typeof value === 'object') visit(value);
    };
    visit(schema);
    const pickup = branches.filter(branch=>branch.properties?.type?.const === 'pickUp');
    expect(pickup.length).toBeGreaterThan(0);
    for(const branch of pickup) expect(branch.required).toContain('targetId');
  });
});
