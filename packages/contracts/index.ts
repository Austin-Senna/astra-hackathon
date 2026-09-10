import { z } from 'zod';

const id = z.string().min(1).max(160);
const text = z.string().max(12000);
const integer = z.number().int();
export const PositionSchema = z.object({ mapId: id, x: integer, y: integer, elevation: integer }).strict();
export type Position = z.infer<typeof PositionSchema>;
export const StatusSchema = z.enum(['wet', 'burning', 'asleep', 'afraid', 'dead', 'broken', 'open', 'locked', 'hidden']);
export type Status = z.infer<typeof StatusSchema>;
export const MemorySchema = z.object({ eventId: id, text, kind: z.enum(['help', 'harm', 'discovery', 'promise', 'observation']) }).strict();
export type Memory = z.infer<typeof MemorySchema>;
export const InteractionSchema = z.object({ type: z.enum(['inspect', 'container', 'door', 'switch', 'clue', 'exit', 'food', 'water', 'fire', 'npc']), requiresItemId: id.nullable(), grantsFact: id.nullable(), targetId: id.nullable() }).strict();
export type Interaction = z.infer<typeof InteractionSchema>;
export const EntitySchema = z.object({
  id, name: text, description: text, kind: z.enum(['player', 'npc', 'item', 'fixture']), assetId: id,
  location: PositionSchema.nullable(), holderId: id.nullable(), inventory: z.array(id), tags: z.array(text),
  hp: integer.min(0), maxHp: integer.positive(), weight: z.number().nonnegative(), solid: z.boolean(), portable: z.boolean(),
  statuses: z.array(StatusSchema), abilities: z.array(id), stamina: integer.min(0).max(100), hunger: integer.min(0).max(100),
  emotion: text, traits: z.object({ kindness: z.number(), curiosity: z.number(), courage: z.number() }).strict(),
  relationships: z.record(z.string(), z.number()), knowledge: z.array(id), memories: z.array(MemorySchema),
  intent: z.enum(['idle', 'follow', 'guard', 'hostile', 'flee']), dialogue: z.array(text), interaction: InteractionSchema.nullable(),
}).strict();
export type Entity = z.infer<typeof EntitySchema>;
export const MapStateSchema = z.object({ id, name: text, description: text, width: integer.positive().max(128), height: integer.positive().max(128), tiles: z.array(z.string()), discovered: z.boolean(), ambience: text, exits: z.array(z.object({ x: integer, y: integer, toMapId: id, toX: integer, toY: integer }).strict()), palette: z.object({ floor: text, wall: text, accent: text }).strict() }).strict();
export type MapState = z.infer<typeof MapStateSchema>;
export const ObjectiveSchema = z.object({ type: z.enum(['fact', 'reach', 'possess']), targetId: id.nullable(), factId: id.nullable(), mapId: id.nullable() }).strict();
export type Objective = z.infer<typeof ObjectiveSchema>;
export const DialogueLineSchema = z.object({ id, speakerId: id.nullable(), speaker: text, text, kind: z.enum(['speech', 'thought', 'narration']) }).strict();
export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export const EncounterStateSchema = z.object({ id, mapId: id, participantIds: z.array(id), turnActorId: id, round: integer.positive(), status: z.enum(['active', 'won', 'fled', 'lost']) }).strict();
export type EncounterState = z.infer<typeof EncounterStateSchema>;
export const WorldStateSchema = z.object({ schemaVersion: z.literal(1), id, title: text, premise: text, goal: text, seed: integer, rng: integer, revision: integer.nonnegative(), tick: integer.nonnegative(), phase: z.enum(['exploring', 'dm', 'encounter', 'ended']), status: z.enum(['active', 'won', 'lost']), maps: z.record(z.string(), MapStateSchema), entities: z.record(z.string(), EntitySchema), actorIds: z.array(id), objective: ObjectiveSchema, facts: z.record(z.string(), text), knownFacts: z.array(id), secrets: z.record(z.string(), text), memories: z.array(MemorySchema), dialogue: z.array(DialogueLineSchema), encounter: EncounterStateSchema.nullable(), style: z.object({ accent: text, ambience: text }).strict() }).strict();
export type WorldState = z.infer<typeof WorldStateSchema>;
export const WorldBlueprintSchema = WorldStateSchema;
export type WorldBlueprint = WorldState;
const IntentFieldsSchema = z.object({ targetId: id.optional(), itemId: id.optional(), x: integer.optional(), y: integer.optional(), mapId: id.optional(), abilityId: id.optional(), text: text.optional() }).strict();
export const PlayerIntentSchema = z.union([
  z.discriminatedUnion('type', [
    IntentFieldsSchema.extend({ type: z.literal('move'), x: integer, y: integer }),
    IntentFieldsSchema.extend({ type: z.literal('inspect'), targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('interact'), targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('pickUp'), targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('push'), targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('attack'), targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('give'), itemId: id, targetId: id }),
    IntentFieldsSchema.extend({ type: z.literal('drop'), itemId: id }),
    IntentFieldsSchema.extend({ type: z.literal('use'), itemId: id }),
    IntentFieldsSchema.extend({ type: z.literal('useAbility'), abilityId: id }),
    IntentFieldsSchema.extend({ type: z.literal('wait') }),
  ]),
  // Keep the existing held-item alias explicit in the provider's JSON schema.
  IntentFieldsSchema.extend({ type: z.enum(['drop', 'use']), targetId: id }),
]);
export type PlayerIntent = z.infer<typeof PlayerIntentSchema>;
export const DMCommandSchema = z.union([PlayerIntentSchema, z.object({ type: z.literal('spawn'), entity: EntitySchema }).strict(), z.object({ type: z.literal('setNpcIntent'), targetId: id, intent: EntitySchema.shape.intent }).strict(), z.object({ type: z.enum(['say', 'think', 'narrate']), speakerId: id.nullable(), text }).strict()]);
export type DMCommand = z.infer<typeof DMCommandSchema>;
export const WorldEventSchema = z.object({ id, seq: integer, revision: integer, tick: integer, type: id, actorId: id.nullable(), targetId: id.nullable(), mapId: id.nullable(), text, data: z.record(z.string(), z.unknown()) }).strict();
export type WorldEvent = z.infer<typeof WorldEventSchema>;
export const WorldViewSchema = WorldStateSchema.omit({ objective: true, facts: true, secrets: true }).extend({ knownFacts: z.array(text) });
export type WorldView = z.infer<typeof WorldViewSchema>;
export type EngineResult = { ok: true; world: WorldState; events: WorldEvent[] } | { ok: false; error: { code: string; message: string } };
export const AdventureBriefSchema = z.object({ premise: text, tone: text, protagonist: text, messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: text }).strict()) }).strict();
export type AdventureBrief = z.infer<typeof AdventureBriefSchema>;
export const AssetDefinitionSchema = z.object({ id, name: text, tags: z.array(text), width: integer.positive(), height: integer.positive(), status: z.enum(['ready', 'pending', 'failed']), variants: z.object({ sprite: z.object({ url: text, frame: z.object({ x: integer, y: integer, w: integer.positive(), h: integer.positive() }).strict().optional() }).strict().optional(), portrait: text.optional(), icon: text.optional(), model: text.optional() }).strict() }).strict();
export type AssetDefinition = z.infer<typeof AssetDefinitionSchema>;
export const SessionInfoSchema = z.object({ worldId: id, actorId: id, token: id }).strict();
export type SessionInfo = z.infer<typeof SessionInfoSchema>;
export const ActionRequestSchema = z.object({ requestId: id, expectedRevision: integer.nonnegative(), intent: PlayerIntentSchema }).strict();
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
const ErrorSchema = z.object({ code: id, message: text }).strict();
export const ActionResponseSchema = z.union([z.object({ ok: z.literal(true), view: WorldViewSchema, events: z.array(WorldEventSchema), cursor: integer.nonnegative().optional() }).strict(), z.object({ ok: z.literal(false), error: ErrorSchema, view: WorldViewSchema.optional() }).strict()]);
export type ActionResponse = z.infer<typeof ActionResponseSchema>;
export const ClientMessageSchema = z.object({ type: z.enum(['snapshot', 'commit', 'asset', 'error']), view: WorldViewSchema.optional(), events: z.array(WorldEventSchema).optional(), cursor: integer.nonnegative().optional(), reset: z.boolean().optional(), asset: AssetDefinitionSchema.optional(), error: text.optional() }).strict();
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
