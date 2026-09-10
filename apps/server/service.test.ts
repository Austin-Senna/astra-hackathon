import { afterEach, describe, expect, it } from 'vitest';
import { SqliteWorldRepository } from './repository';
import { GameService, visibleEvents } from './service';
import { createHouseWorld } from '../../packages/engine/fixtures';
import type { StructuredModel } from './generation';
import type { WorldState, WorldEvent } from '../../packages/contracts';

const repos: SqliteWorldRepository[] = [];
afterEach(() => repos.splice(0).forEach(r => r.close()));
function setup(model: StructuredModel = { structured: async () => { throw new Error('Model unavailable'); } }, configure: (world: WorldState) => void = () => {}) {
  const repo = new SqliteWorldRepository(':memory:'); repos.push(repo);
  const service = new GameService(repo, model);
  const world = createHouseWorld('shared');
  configure(world);
  const session = repo.createWorld(world, 'rowan', 'demo');
  return { repo, service, session, world };
}
describe('authoritative service', () => {
  it('provides the rejected commands and engine error when repairing a DM plan', async () => {
    const prompts: string[] = [];
    const {service,session} = setup({structured:async(schema,_system,input)=>{
      prompts.push(input);
      return schema.parse({commands:[{type:'pickUp',targetId:prompts.length===1?'nell':'brass-key'}]});
    }});
    const response = await service.dm('shared',session.token,{requestId:'repair',expectedRevision:0,text:'Take the nearby key'});
    expect(response.ok).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(JSON.parse(prompts[1])).toMatchObject({rejectedCommands:[{type:'pickUp',targetId:'nell'}]});
    expect(JSON.parse(prompts[1]).rejection).toContain('OUT_OF_REACH');
    expect(response.ok && response.view.entities.rowan.inventory).toContain('brass-key');
  });
  it('sends only actor knowledge and nearby public NPC dialogue to the DM', async () => {
    let prompt = '';
    const {service,session} = setup({structured: async (schema, _system, input) => {
      prompt = input;
      return schema.parse({commands:[{type:'say',speakerId:'keeper',text:'The public greeting.'}]});
    }}, world => {
      world.secrets.private = 'UNREVEALED_SECRET';
      world.entities['hidden-letter'].description = 'HIDDEN_LETTER_CONTENT';
      world.entities.keeper.location = {...world.entities.rowan.location!, x:5};
      world.entities.keeper.dialogue = ['The public greeting.'];
      world.entities.keeper.memories = [{eventId:'private-npc',kind:'observation',text:'PRIVATE_NPC_MEMORY'}];
      world.entities.nell.dialogue = ['REMOTE_NPC_DIALOGUE'];
      world.entities.echo.location = {...world.entities.rowan.location!,x:20};
      world.entities.echo.dialogue = ['DISTANT_NPC_DIALOGUE'];
      world.memories.push({eventId:'private-world',kind:'observation',text:'PRIVATE_WORLD_MEMORY'});
      world.entities.guest = {...structuredClone(world.entities.rowan),id:'guest',dialogue:['PRIVATE_PLAYER_DIALOGUE'],memories:[{eventId:'private-player',kind:'observation',text:'PRIVATE_PLAYER_MEMORY'}]};
      world.actorIds.push('guest');
      world.entities.rowan.memories.push({eventId:'own-memory',kind:'observation',text:'MY_WITNESSED_MEMORY'});
    });
    const result = await service.dm('shared',session.token,{requestId:'private-context',expectedRevision:0,text:'Greet the keeper',targetId:'keeper'});
    expect(result.ok).toBe(true);
    for(const hidden of ['UNREVEALED_SECRET','HIDDEN_LETTER_CONTENT','PRIVATE_NPC_MEMORY','PRIVATE_PLAYER_MEMORY','PRIVATE_WORLD_MEMORY','PRIVATE_PLAYER_DIALOGUE','REMOTE_NPC_DIALOGUE','DISTANT_NPC_DIALOGUE','hidden-letter']) expect(prompt).not.toContain(hidden);
    expect(prompt).toContain('MY_WITNESSED_MEMORY');
    expect(prompt).toContain('The public greeting.');
    expect(JSON.parse(prompt).world).not.toHaveProperty('secrets');
    expect(JSON.parse(prompt).world).not.toHaveProperty('facts');
  });
  it('never exposes a hidden burning object through destruction events', async () => {
    const {service,session} = setup(undefined, world => {
      world.entities['hidden-letter'].statuses.push('burning');
      world.entities['hidden-letter'].hp = 2;
      world.entities['brass-key'].statuses.push('burning');
      world.entities['brass-key'].hp = 2;
    });
    const response = await service.action('shared',session.token,{requestId:'burn',expectedRevision:0,intent:{type:'wait'}});
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain('Folded lullaby');
    expect(JSON.stringify(response)).not.toContain('hidden-letter');
    expect(response.ok && response.events.some(event=>event.type==='death'&&event.targetId==='brass-key')).toBe(true);
    expect(JSON.stringify(service.events('shared',session.token,0))).not.toContain('hidden-letter');
  });
  it('recovers past a page of private events with a bounded tail and server cursor', () => {
    const {service,session,repo,world} = setup();
    const privateEvents: WorldEvent[] = Array.from({length:1000},(_,i)=>({id:`private-${i}`,seq:0,revision:1,tick:1,type:'thought',actorId:'keeper',targetId:'keeper',mapId:'hall',text:'PRIVATE_PAYLOAD',data:{}}));
    const publicEvent: WorldEvent = {id:'public',seq:0,revision:1,tick:1,type:'wait',actorId:'rowan',targetId:null,mapId:'bedroom',text:'Rowan waits.',data:{}};
    repo.commit('shared','rowan','history','history',0,{...world,revision:1},[...privateEvents,publicEvent]);
    const recovery = service.events('shared',session.token,0);
    expect(recovery.events.map(event=>event.id)).toEqual(['public']);
    expect(recovery).toMatchObject({cursor:1001,reset:true,view:{revision:1}});
    expect(JSON.stringify(recovery)).not.toContain('PRIVATE_PAYLOAD');
    expect(service.events('shared',session.token,1001)).toMatchObject({cursor:1001,reset:false,events:[]});
    expect(service.events('shared',session.token,2000)).toMatchObject({cursor:1001,reset:true,events:[]});
    expect(repo.eventsSince('shared',0)).toHaveLength(1000);
  });
  it('advances the server cursor even when every new event is private', () => {
    const {service,session,repo,world} = setup();
    repo.commit('shared','rowan','private','private',0,{...world,revision:1},[{id:'secret',seq:0,revision:1,tick:1,type:'thought',actorId:'keeper',targetId:'keeper',mapId:'hall',text:'PRIVATE_PAYLOAD',data:{}}]);
    expect(service.events('shared',session.token,0)).toMatchObject({events:[],cursor:1,reset:false});
    expect(service.snapshot('shared',session.token)).toMatchObject({cursor:1});
  });
  it('keeps the witnessed use event after consuming a held item', async () => {
    const {service,session} = setup(undefined,world=>{
      const food = world.entities['brass-key'];
      food.name = 'Bread';
      food.interaction!.type = 'food';
      food.location = null;
      food.holderId = 'rowan';
      world.entities.rowan.inventory.push(food.id);
    });
    const response = await service.action('shared',session.token,{requestId:'eat',expectedRevision:0,intent:{type:'use',itemId:'brass-key'}});
    expect(response.ok).toBe(true);
    if(!response.ok) return;
    expect(response.view.entities).not.toHaveProperty('brass-key');
    expect(response.events).toEqual(expect.arrayContaining([expect.objectContaining({type:'use',text:'Rowan uses Bread.',targetId:'rowan'})]));
  });
  it('authenticates and projects snapshots without secrets', () => {
    const { service, session } = setup();
    expect(() => service.snapshot('shared', 'invalid')).toThrow('UNAUTHORIZED');
    const snapshot = service.snapshot('shared', session.token);
    expect(snapshot.view).not.toHaveProperty('secrets');
    expect(snapshot.view.entities).not.toHaveProperty('nell');
    expect(snapshot.view.entities).not.toHaveProperty('hidden-letter');
  });
  it('deduplicates retries and rejects stale competing actions', async () => {
    const { service, session, repo } = setup();
    const request = { requestId: 'one', expectedRevision: 0, intent: { type: 'pickUp' as const, targetId: 'brass-key' } };
    const a = await service.action('shared', session.token, request);
    const b = await service.action('shared', session.token, request);
    expect(a.ok && b.ok && a.view.revision === b.view.revision).toBe(true);
    const stale = await service.action('shared', session.token, { ...request, requestId: 'two' });
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.error.code).toBe('STALE_REVISION');
    expect(repo.load('shared')!.entities.rowan.inventory).toEqual(['brass-key']);
  });
  it('leaves state unchanged on model failure and clears the world lock', async () => {
    const { service, session, repo } = setup();
    const result = await service.dm('shared', session.token, { requestId: 'dm1', expectedRevision: 0, text: 'Talk to the house' });
    expect(result.ok).toBe(false); expect(repo.load('shared')!.revision).toBe(0);
    expect((await service.action('shared', session.token, { requestId: 'walk', expectedRevision: 0, intent: { type: 'move', x: 3, y: 8 } })).ok).toBe(true);
  });
  it('restores checkpoints at a new revision and keeps action receipts', async () => {
    const { service, session, repo } = setup();
    await service.action('shared',session.token,{ requestId:'walk', expectedRevision:0, intent:{type:'move',x:3,y:8} });
    const restored = await service.restore('shared',session.token,{requestId:'restore',expectedRevision:1});
    expect(restored.ok && restored.view.revision).toBe(2);
    expect(repo.load('shared')!.entities.rowan.location!.x).toBe(4);
  });
  it('does not let retries change their action payload',async()=>{
    const {service,session}=setup();
    await service.action('shared',session.token,{requestId:'same',expectedRevision:0,intent:{type:'move',x:3,y:8}});
    const result=await service.action('shared',session.token,{requestId:'same',expectedRevision:1,intent:{type:'move',x:4,y:8}});
    expect(!result.ok&&result.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  it('serializes a busy world without blocking another world',async()=>{
    let release!:(value:unknown)=>void;
    const {service,session,repo}=setup({structured:<T>()=>new Promise<T>(resolve=>{release=value=>resolve(value as T);})});
    const second=repo.createWorld(createHouseWorld('other'),'rowan','demo');
    const pending=service.dm('shared',session.token,{requestId:'thinking',expectedRevision:0,text:'Think'});
    const blocked=await service.action('shared',session.token,{requestId:'busy',expectedRevision:0,intent:{type:'wait'}});
    expect(!blocked.ok&&blocked.error.code).toBe('WORLD_BUSY');
    expect((await service.action('other',second.token,{requestId:'free',expectedRevision:0,intent:{type:'wait'}})).ok).toBe(true);
    release({commands:[{type:'think',speakerId:'rowan',text:'I remember the rain.'}]});
    expect((await pending).ok).toBe(true);
  });
  it('filters private thoughts and remote events from another actor',()=>{
    const {world}=setup();
    const privateEvent={id:'secret-thought',seq:1,revision:1,tick:1,type:'thought',actorId:'rowan',targetId:'keeper',mapId:'hall',text:'A secret',data:{secret:'never send'}};
    expect(visibleEvents(world,'rowan',[privateEvent])).toEqual([]);
    expect(visibleEvents(world,'rowan',[{...privateEvent,type:'move',actorId:'keeper',targetId:'keeper'}])).toEqual([]);
  });
});
