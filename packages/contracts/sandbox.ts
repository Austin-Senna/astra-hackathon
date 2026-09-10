import { z } from 'zod';

const id = z.string().min(1).max(160);
const shortText = z.string().min(1).max(1600);
const words = z.array(z.string().min(1).max(160)).max(64);
export const FacingSchema = z.enum(['north', 'east', 'south', 'west']);
export const PropertiesSchema = z.record(z.string().min(1).max(80), z.union([z.string().max(1000), z.number().finite(), z.boolean()]));
export const SandboxStateSchema = z.object({
  enabled: z.literal(true),
  rules: z.array(z.object({ id, version: z.number().int().positive(), mapId: id, description: shortText }).strict()).max(128),
  forms: z.array(z.object({ actorId: id, assetId: id, description: z.string().max(12000), tags: words, grantedAbilities: words }).strict()).max(32),
}).strict();

const values = z.object({
  name: shortText.optional(), description: shortText.optional(),
  kind: z.enum(['npc', 'item', 'fixture']).optional(),
  tags: words.optional(), statuses: words.optional(),
  abilities: words.optional(), hp: z.number().int().min(0).max(10000).optional(), maxHp: z.number().int().min(1).max(10000).optional(),
  stamina: z.number().int().min(0).max(100).optional(), hunger: z.number().int().min(0).max(100).optional(),
  emotion: shortText.optional(), solid: z.boolean().optional(), portable: z.boolean().optional(),
  intent: z.enum(['idle', 'follow', 'guard', 'hostile', 'flee']).optional(),
  properties: PropertiesSchema.optional(), facing: FacingSchema.optional(),
}).strict();

export const SandboxProposalSchema = z.object({
  changes: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('update'), targetId: id, values }).strict(),
    z.object({ type: z.literal('spawn'), id: id.max(140), count: z.number().int().min(1).max(64).optional(), name: shortText, description: shortText, assetId: id,
      kind: z.enum(['npc', 'item', 'fixture']), x: z.number().int(), y: z.number().int(), tags: words,
      solid: z.boolean(), portable: z.boolean(), properties: PropertiesSchema }).strict(),
    z.object({ type: z.literal('relocate'), targetId: id, x: z.number().int(), y: z.number().int(), mode: z.enum(['walk', 'teleport', 'fly']) }).strict(),
    z.object({ type: z.literal('transfer'), targetId: id, recipientId: id.nullable() }).strict(),
    z.object({ type: z.literal('remove'), targetId: id }).strict(),
    z.object({ type: z.literal('open'), targetId: id }).strict(),
    z.object({ type: z.literal('terrain'), x: z.number().int(), y: z.number().int(), terrain: z.enum(['floor', 'wall', 'water']), state: z.string().max(160) }).strict(),
    z.object({ type: z.literal('encounter'), enemyIds: z.array(id).max(12), outcome: z.enum(['active', 'won', 'fled', 'lost']) }).strict(),
    z.object({ type: z.literal('transform'), targetId: id, form: shortText, description: shortText, abilities: words }).strict(),
    z.object({ type: z.literal('revert'), targetId: id }).strict(),
    z.object({ type: z.literal('social'), targetId: id, emotion: shortText, relationshipDelta: z.number().int().min(-10).max(10), memory: shortText }).strict(),
  ])).max(48),
  dialogue: z.array(z.object({ kind: z.enum(['speech', 'thought', 'narration']), speakerId: id.nullable(), text: shortText }).strict()).max(8),
  rules: z.array(z.object({ id, description: shortText }).strict()).max(8),
}).strict();
export type SandboxProposal = z.infer<typeof SandboxProposalSchema>;
