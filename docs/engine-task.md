# Engine Implementation Task

Own ONLY packages/contracts/** and packages/engine/**. Do not edit other files, install packages, commit, or delegate. Root handles server/client/assets concurrently. Read docs/implementation-plan.md for product requirements. Create tests first and run them before implementation, then implement and verify.

## Deliverables

1. Define packages/contracts/index.ts with types and Zod schemas. Notify root as soon as this file exists so server/client can consume the stable boundary.
2. packages/engine/index.ts exports applyCommandBatch, projectWorld, validateBlueprint, instantiateBlueprint; packages/engine/fixtures.ts exports createHouseWorld(worldId = 'house', seed = 4103), createDungeonWorld(worldId = 'dungeon', seed = 7103).
3. Focused engine/fixture tests. Detailed test report in docs/engine-report.md is the one permitted doc outside your ownership.

## Frozen interfaces

Use string IDs and integer logical coordinates. No renderer, network, wall clock, or database dependency. rot-js may supply A* and seeded RNG. Prefer simple typed data.

WorldState: { schemaVersion:1, id, title, premise, goal, seed:number, rng:number, revision:number, tick:number, phase:'exploring'|'dm'|'encounter'|'ended', status:'active'|'won'|'lost', maps:Record<string,MapState>, entities:Record<string,Entity>, actorIds:string[], objective:Objective, facts:Record<string,string>, knownFacts:string[], secrets:Record<string,string>, memories:Memory[], dialogue:DialogueLine[], encounter:EncounterState|null, style:{accent:string,ambience:string} }.

MapState: {id,name,description,width,height,tiles:string[],discovered:boolean,ambience:string,exits:Array<{x,y,toMapId,toX,toY}>,palette:{floor:string,wall:string,accent:string}}. Tiles '#' blocks; '.' floor, '~' water, ',' garden. World coordinates = {mapId,x,y,elevation:number}.

Entity: {id,name,description,kind:'player'|'npc'|'item'|'fixture',assetId:string,location:Position|null,holderId:string|null,inventory:string[],tags:string[],hp:number,maxHp:number,weight:number,solid:boolean,portable:boolean,statuses:Status[],abilities:string[],stamina:number,hunger:number,emotion:string,traits:{kindness:number,curiosity:number,courage:number},relationships:Record<string,number>,knowledge:string[],memories:Memory[],intent:'idle'|'follow'|'guard'|'hostile'|'flee',dialogue:string[],interaction:Interaction|null}.

Interaction: {type:'inspect'|'container'|'door'|'switch'|'clue'|'exit'|'food'|'water'|'fire'|'npc',requiresItemId:string|null,grantsFact:string|null,targetId:string|null}. Extend with OPTIONAL fields only if needed and tell root. Status: 'wet'|'burning'|'asleep'|'afraid'|'dead'|'broken'|'open'|'locked'|'hidden'.

Objective: {type:'fact'|'reach'|'possess',targetId:string|null,factId:string|null,mapId:string|null}. Memory: {eventId:string,text:string,kind:'help'|'harm'|'discovery'|'promise'|'observation'}. DialogueLine: {id:string,speakerId:string|null,speaker:string,text:string,kind:'speech'|'thought'|'narration'}.

EncounterState: {id:string,mapId:string,participantIds:string[],turnActorId:string,round:number,status:'active'|'won'|'fled'|'lost'}.

PlayerIntent schema: {type:'move'|'inspect'|'interact'|'pickUp'|'drop'|'give'|'use'|'push'|'attack'|'useAbility'|'wait',targetId?:string,itemId?:string,x?:number,y?:number,mapId?:string,abilityId?:string,text?:string}. Reject unknown fields. No client raw world patch or arbitrary spawn.

DMCommand = PlayerIntent | {type:'spawn',entity:Entity} | {type:'setNpcIntent',targetId:string,intent:Entity['intent']} | {type:'say'|'think'|'narrate',speakerId:string|null,text:string}. Allow at most 2 DM spawns per batch; actors must still obey capabilities/reach. If supporting more consequences, place them behind validated mechanics rather than arbitrary DM effects.

WorldEvent: {id:string,seq:number,revision:number,tick:number,type:string,actorId:string|null,targetId:string|null,mapId:string|null,text:string,data:Record<string,unknown>}. Every committed action emits events; IDs deterministic from world+revision+index.

EngineResult discriminated union: {ok:true,world:WorldState,events:WorldEvent[]} | {ok:false,error:{code:string,message:string}}. applyCommandBatch(world:WorldState,actorId:string,commands:DMCommand[],options?:{dm?:boolean}):EngineResult. Pure inputs; whole batch atomic; increment revision once per successful batch, deterministic effects. Server handles membership and idempotency. move must be adjacent; click path is SDK repeated adjacent moves. Exits transfer map, reveal room; adjacency checked and no teleport.

WorldView = Omit<WorldState,'objective'|'facts'|'secrets'>; projectWorld(world, actorId):WorldView must remove hidden entities and unvisited map contents and NPC private knowledge/memories. Client sees actor's knowledge via knownFacts as IDs? Use knownFacts string[] as readable fact texts in view if desired but tell root. Initial primary actor ID 'rowan'; dungeon 'rowan' too. actorIds list supports more humans; do not assume only one actor during engine logic.

WorldBlueprint = WorldState (generation fills revision/tick/etc deterministically during instantiateBlueprint; schema usable with z.toJSONSchema for structured model generation); validateBlueprint(world:unknown): {ok:true,world:WorldState}|{ok:false,errors:string[]}; instantiateBlueprint(blueprint:WorldState,id:string,seed:number):WorldState.

Also export AdventureBrief {premise:string,tone:string,protagonist:string,messages:Array<{role:'user'|'assistant',content:string}>}; AssetDefinition {id:string,name:string,tags:string[],width:number,height:number,status:'ready'|'pending'|'failed',variants:{sprite?:{url:string,frame?:{x:number,y:number,w:number,h:number}},portrait?:string,icon?:string,model?:string}}; SessionInfo {worldId:string,actorId:string,token:string}; ActionRequest {requestId:string,expectedRevision:number,intent:PlayerIntent}; ActionResponse = {ok:true,view:WorldView,events:WorldEvent[]}|{ok:false,error:{code:string,message:string},view?:WorldView}; ClientMessage {type:'snapshot'|'commit'|'asset'|'error',view?:WorldView,events?:WorldEvent[],asset?:AssetDefinition,error?:string}; schemas for external payloads.

## Mechanics and fixtures

Make a genuinely playable four-map house chapter: bedroom, hall, conservatory, attic. Goal find sister Nell. 24x16 maps, 8-12 visually useful entities per room, about three NPCs. Bedroom intro first-person goal. Starting nearby key with automatic click/interact pickup, locked room portal, clues, movable objects, containers, tools, food, at least one environmental alternative route through matching key OR levering/breaking latch with a crowbar. NPC keeper recalls returned keepsake. Reaching Nell and interacting grants fact and wins; epilogue reflects memories. Provide playable solution action sequences in tests; no unavoidable combat. A contrasting dungeon fixture tests generic mechanics and can be used as a second explicitly authored demo.

Use asset IDs root will provide: player, nell, keeper, echo, enemy, bed, rug, table, chair, wardrobe, chest, key, letter, book, candle, lamp, plant, flower, fountain, door, window, crate, barrel, crowbar, apple, bottle, keepsake, stairs, mirror, clock, sword, shield, torch, stone, bone, mushrooms. Unknowns use item proxy and runtime asset queue.

Implement inventory transfer/capacity8, bound moves, doors matched by IDs, interact auto-pickup, inspect facts, npc speech/reaction, use food heals/rest, push, attack and deterministic light encounter, abilities tied to role, fire/water interactions, statuses, memories with witnesses, objective and death. Instantiated world remains solvable: validate map dimensions/IDs/references/positions/entrances/reachability and critical route constraints; tests replay fixture solutions. Do not claim a generic proof of arbitrary narrative solvability.

Verify rejection atomicity, duplicate ownership prevention, persistent travel and reload serialization, deterministic replay, hidden-state filtering, two actors, combat and surrender/flee, key alternative and goal, malformed blueprints.
