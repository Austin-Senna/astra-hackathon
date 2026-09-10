import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ActionRequestSchema, AdventureBriefSchema, DMCommandSchema, type ActionRequest, type ActionResponse, type AdventureBrief, type AssetDefinition, type DMCommand, type WorldEvent, type WorldState, type WorldView } from '../../packages/contracts';
import { applyCommandBatch, projectWorld } from '../../packages/engine';
import { createDungeonWorld, createHouseWorld } from '../../packages/engine/fixtures';
import { assetCatalog } from '../../packages/assets/catalog';
import { generateAdventure, type StructuredModel } from './generation';
import type { CommitResult, Membership, WorldRepository } from './repository';
import { createSandboxWorld } from '../../packages/engine/sandbox-fixture';
import { resolveSandboxPrompt } from './sandbox-dm';

export const DMRequestSchema = z.object({ requestId: z.string().min(1).max(160), expectedRevision: z.number().int().nonnegative(), text: z.string().min(1).max(2000), targetId: z.string().max(160).optional() }).strict();
export const RestoreRequestSchema = DMRequestSchema.omit({ text: true, targetId: true });
type DMRequest = z.infer<typeof DMRequestSchema>;
const DMPlanSchema = z.object({ commands: z.array(DMCommandSchema).min(1).max(6) }).strict();
const ChatSchema = z.object({ premise: z.string().max(3000), tone: z.string().max(200), protagonist: z.string().max(400), reply: z.string().max(1200), suggestions: z.array(z.string().max(200)).max(3) }).strict();
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const userErrors: Record<string,string> = { STALE_REVISION: 'The world changed. Your view has refreshed; try again.', WORLD_BUSY: 'The DM is resolving this moment. Try again shortly.', IDEMPOTENCY_CONFLICT: 'This request ID was already used for another action.', UNAUTHORIZED: 'This saved session is not authorized.', OWNER_ONLY: 'Only the adventure owner can restore a checkpoint.' };

export function visibleEvents(world: WorldState, actorId: string, events: WorldEvent[]): WorldEvent[] {
  const view = projectWorld(world,actorId);
  const actor = view.entities[actorId];
  const witnessed = new Set(actor?.memories.map(m => m.eventId) ?? []);
  return events.filter(event => {
    if(event.type === 'thought') return event.targetId === actorId;
    if(['speech','narration'].includes(event.type)) return witnessed.has(event.id) || event.actorId === actorId;
    if(event.targetId && !Object.hasOwn(view.entities,event.targetId)) return false;
    return event.actorId === actorId || event.mapId === actor?.location?.mapId;
  }).map(event => ({ ...event, data: Object.fromEntries(Object.entries(event.data).filter(([key]) => ['amount','status','location','fromMapId','toMapId'].includes(key))) }));
}

export class GameService {
  private busy = new Set<string>();
  onCommit: (world: WorldState, events: WorldEvent[]) => void = () => {};
  onWorldCreated: (world: WorldState) => void = () => {};
  constructor(readonly repository: WorldRepository, readonly model: StructuredModel) {}
  authorize(worldId: string, token: string): Membership {
    const member = this.repository.authorize(worldId,token);
    if(!member) throw new Error('UNAUTHORIZED');
    return member;
  }
  assets(worldId: string, view: WorldView): AssetDefinition[] {
    const visible = new Set(Object.values(view.entities).map(e=>e.assetId));
    return [...assetCatalog, ...this.repository.assetJobs(worldId).filter(job=>visible.has(job.assetId)).map(job=>({ id:job.assetId,name:job.name,tags:['generated'],width:32,height:32,status:job.status==='ready'?'ready' as const:job.status==='failed'?'failed' as const:'pending' as const,variants:{sprite:{url:job.url??'/art/hero/item.png'}} }))];
  }
  snapshot(worldId: string, token: string) {
    const member = this.authorize(worldId,token); const world = this.repository.load(worldId)!;
    const view = projectWorld(world,member.actorId);
    return { view, assets:this.assets(worldId,view), source:this.repository.source(worldId), cursor:this.repository.latestSequence(worldId) };
  }
  events(worldId: string, token: string, after: number) {
    const member = this.authorize(worldId,token); const world = this.repository.load(worldId)!;
    const events = this.repository.eventsSince(worldId,after);
    const cursor = this.repository.latestSequence(worldId);
    const reset = after > cursor || (events.length > 0 && events[0].seq > after + 1);
    return { view:projectWorld(world,member.actorId), events:visibleEvents(world,member.actorId,events), cursor, reset };
  }
  async chat(brief: AdventureBrief, message: string) {
    AdventureBriefSchema.parse(brief);
    const result = await this.model.structured(ChatSchema, 'You are an imaginative, concise RPG dungeon master helping create a playable four-location adventure with one goal. Ask at most one evocative question. Respect the player setting, tone, protagonist, and agency. Update the brief fields with what is established. Suggest 2-3 short possible answers. No tools or implementation discussion.',JSON.stringify({brief,message}));
    return { brief:{premise:result.premise,tone:result.tone,protagonist:result.protagonist,messages:[...brief.messages,{role:'user' as const,content:message},{role:'assistant' as const,content:result.reply}].slice(-20)},reply:result.reply,suggestions:result.suggestions };
  }
  async create(brief: AdventureBrief, mode: 'live'|'demo', preset: 'house'|'dungeon'|'sandbox' = 'sandbox') {
    const id = randomUUID(); const seed = parseInt(randomUUID().slice(0,8),16);
    if (preset === 'sandbox') {
      const world = createSandboxWorld(id, seed);
      if (brief.premise.trim()) world.premise = brief.premise;
      if (brief.protagonist.trim()) world.entities.rowan.description = brief.protagonist;
      if (brief.tone.trim()) world.style.ambience = brief.tone;
      const session = this.repository.createWorld(world, world.actorIds[0], mode === 'live' ? 'Prompt sandbox (live DM)' : 'Authored sandbox (live DM available)');
      this.onWorldCreated(world);
      return { session, ...this.snapshot(id, session.token) };
    }
    const world = mode === 'live' ? await generateAdventure(this.model,brief,id,seed) : preset === 'dungeon' ? createDungeonWorld(id,seed) : createHouseWorld(id,seed);
    const source = mode === 'live' ? 'Live AI adventure' : 'Authored chapter';
    const session = this.repository.createWorld(world,world.actorIds[0],source);
    this.onWorldCreated(world);
    return {session,...this.snapshot(id,session.token)};
  }
  private result(worldId: string, actorId: string, commit: CommitResult): ActionResponse {
    const current = this.repository.load(worldId)!;
    return {ok:true,view:projectWorld(current,actorId),events:visibleEvents(current,actorId,commit.events),cursor:this.repository.latestSequence(worldId)};
  }
  private async mutate(worldId: string, token: string, request: {requestId:string;expectedRevision:number}, identity: unknown, resolve: (world: WorldState, member: Membership) => Promise<{world:WorldState;events:WorldEvent[]}>): Promise<ActionResponse> {
    const member = this.authorize(worldId,token); const key = fingerprint(identity);
    let locked = false;
    try {
      const receipt = this.repository.receipt(worldId,member.actorId,request.requestId,key);
      if(receipt) return this.result(worldId,member.actorId,receipt);
      if(this.busy.has(worldId)) throw new Error('WORLD_BUSY');
      const current = this.repository.load(worldId)!;
      if(current.revision !== request.expectedRevision) throw new Error('STALE_REVISION');
      this.busy.add(worldId); locked = true;
      const resolved = await resolve(current,member);
      const commit = this.repository.commit(worldId,member.actorId,request.requestId,key,request.expectedRevision,resolved.world,resolved.events);
      if(!commit.replayed) { this.onCommit(commit.world,commit.events); this.onWorldCreated(commit.world); }
      return this.result(worldId,member.actorId,commit);
    } catch(error) {
      const message = error instanceof Error ? error.message : 'The action could not be resolved.';
      const code = Object.hasOwn(userErrors,message) ? message : 'ACTION_FAILED';
      return {ok:false,error:{code,message:userErrors[code]??message},view:projectWorld(this.repository.load(worldId)!,member.actorId)};
    } finally { if(locked) this.busy.delete(worldId); }
  }
  action(worldId: string, token: string, input: ActionRequest) {
    const request = ActionRequestSchema.parse(input);
    return this.mutate(worldId,token,request,{route:'action',intent:request.intent},async(world,member)=>{
      const result = applyCommandBatch(world,member.actorId,[request.intent]);
      if(!result.ok) throw new Error(result.error.message);
      return result;
    });
  }
  dm(worldId: string, token: string, input: DMRequest) {
    const request = DMRequestSchema.parse(input);
    return this.mutate(worldId,token,request,{route:'dm',text:request.text,targetId:request.targetId},async(world,member)=>{
      if (world.sandbox?.enabled) {
        const result = await resolveSandboxPrompt(this.model, world, member.actorId, request.text, request.targetId);
        if (!result.ok) throw new Error(result.error.message);
        return result;
      }
      const view = projectWorld(world,member.actorId);
      const location = view.entities[member.actorId].location;
      const nearbyNpcDialogue = Object.values(view.entities).filter(entity => entity.kind === 'npc' && location && entity.location && entity.location.mapId === location.mapId && Math.abs(entity.location.x-location.x) + Math.abs(entity.location.y-location.y) <= 8).map(entity => ({speakerId:entity.id,dialogue:world.entities[entity.id].dialogue}));
      let rejection = '';
      let rejectedCommands: DMCommand[] = [];
      for(let attempt=0;attempt<2;attempt++) {
        const plan = await this.model.structured(DMPlanSchema, `You are the AI dungeon master of a persistent narrative RPG. Translate the player's unusual intention into a SMALL atomic list of legal commands, and respond in character through say/think/narrate. Act as actorId; never move another player or override state. Physical actions require adjacency and held items. Required command fields: move uses x and y; inspect/interact/pickUp/push/attack use targetId; give uses itemId and recipient targetId; drop/use use itemId (use may also specify a separate targetId); useAbility uses abilityId. Example pickup: {"type":"pickUp","targetId":"brass-key"}. If rejectedCommands is nonempty, correct that plan using the rejection error. No teleportation, arbitrary damage, rewrites, new abilities, or additional quests. Player personality is a soft preference, not a moral prohibition; reference witnessed memories. The world contains only the actor's visible context; nearbyNpcDialogue contains public lines nearby NPCs may speak. Do not invent hidden facts. Spawn at most one mundane plausible non-player object in the current room, never a key or objective shortcut. You may set nearby NPC intent. Talk to the targeted nearby NPC through say with their speakerId. If impossible, use a brief character thought explaining the obstacle, without pretending the action succeeded. Narration must only describe the consequences of commands actually present in the batch; never claim an unmodeled action happened. Current mechanics: matching keys and lever tools open doors, food restores needs, water extinguishes fire, containers expose contents, giving records relationships, rest/mend/strike/flee are only abilities when owned.`,JSON.stringify({actorId:member.actorId,text:request.text,targetId:request.targetId,world:view,nearbyNpcDialogue,rejection,rejectedCommands}),90000);
        const commands: DMCommand[] = plan.commands;
        const result = applyCommandBatch(world,member.actorId,commands,{dm:true});
        if(result.ok) return result;
        rejection = `${result.error.code}: ${result.error.message}`;
        rejectedCommands = commands;
      }
      throw new Error(`The DM's proposed action was not legal: ${rejection}`);
    });
  }
  restore(worldId: string, token: string, input: z.infer<typeof RestoreRequestSchema>) {
    const request = RestoreRequestSchema.parse(input);
    return this.mutate(worldId,token,request,{route:'restore'},async(current,member)=>{
      if(member.role !== 'owner') throw new Error('OWNER_ONLY');
      const world = this.repository.checkpoint(worldId)!;
      world.revision = current.revision+1;
      const event: WorldEvent = {id:`${worldId}:${world.revision}:restore`,seq:0,revision:world.revision,tick:world.tick,type:'restore',actorId:member.actorId,targetId:null,mapId:world.entities[member.actorId].location!.mapId,text:'The chapter begins again.',data:{}};
      return {world,events:[event]};
    });
  }
}
