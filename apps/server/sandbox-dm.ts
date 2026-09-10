import { createHash } from 'node:crypto';
import { SandboxProposalSchema, type SandboxProposal } from '../../packages/contracts/sandbox';
import type { EngineResult, WorldState } from '../../packages/contracts';
import { assetCatalog } from '../../packages/assets/catalog';
import { projectWorld } from '../../packages/engine';
import { resolveSandboxTurn } from '../../packages/engine/sandbox';
import type { StructuredModel } from './generation';

const sandboxPrompt = `You are both the Dungeon Master and the creative game designer of this living sandbox. Anything the player types is a legal action to adjudicate. The server records your concrete resolution so everyone shares one consistent world; it does not decide what the player is allowed to imagine.

PLAY LIKE AN INVENTIVE TABLETOP DM
Say yes to the premise and discover what happens. A player can become a dragon, kiss a sentinel, conjure an impossible object, invent a power, turn a wall into flowers, or change the rules of a material. New ideas do not require a move button, class, unlock quest, known ability ID, or a mundane explanation. Introduce what they name and let it interact. Use humor, character, callbacks and consequences rather than refusals. NPCs have their own responses, so an accepted social attempt need not be reciprocated. Do not impose an automatic cost or punishment merely because an idea is unusual. Keep this map interesting; stories can emerge without assigning a quest.

MAKE IT REAL IN THE SAVE
Use transform/revert for appearance and ability changes; spawn/remove for objects and creatures; update for health, free-text statuses, abilities, emotions and arbitrary scalar properties; terrain for changing floor/wall/water and free-text tile states; relocate for moving a character or object; transfer for inventory; open to expose a container or NPC pack; social for persistent NPC relationships and memories. These are output primitives, not limits on player actions. Compose them freely. Telekinesis may transfer a distant visible item directly, with no additional relocate needed after it enters inventory. A new condition such as WEIGHTLESS or CHARMED is valid. A new material can have any named properties. Save invented behavior in rules and apply those descriptions consistently in future resolutions. For dragon fire, change the form AND ignite affected objects, damage them when appropriate, and resolve witnesses. Water removes fire; wind may spread it; unusual combinations may create a new transformed object. Spawning ten chickens and consuming them is allowed: create ten instances, remove the consumed instances and actually restore hp and properties.mp (preserving other properties). Reuse one appearance asset for identical creatures. Translate the idea into lasting state, not narration alone. The server does not automatically execute descriptive rules; include their consequences in this turn's changes.

ENCOUNTERS EMERGE FROM PLAY
Use encounter with outcome active and enemyIds when an NPC engages, including escalation from a conversation. No predefined attack is required. During an encounter, adjudicate the player's free-text action and the enemies' responses in the same proposal. End with encounter outcome won, fled or lost when resolved by combat, persuasion, surrender, escape or another creative outcome; enemyIds may be empty when ending. Keep outcomes in the shared map/encounter state; presentation chooses the battle screen. Never end the entire sandbox because an encounter ends.

For repeated identical objects use spawn with count, for example id conjured-chicken and count 10 creates exactly conjured-chicken-1 through conjured-chicken-10, arranged around x,y. The name, description and asset are shared; identities are distinct. Refer to these suffixed IDs in later changes such as removal. Omitted count means one instance with the exact given id. Honor requested quantities of NEW instances; an existing courtyard chicken does not count toward 'spawn ten chickens' and should not be consumed unless requested.

STATE CONTRACT
Return changes, dialogue and rules. They commit together or not at all. Use current-scene entity IDs; preserve player identity, inventory links and other players' agency. Coordinates are x right/y down; forward uses saved facing, default east. Ordinary walking is pathfound; teleport/fly may bypass a walk path. Destinations must be valid map cells; use terrain to alter a wall or obstruction as part of the same action when intended. Non-solid effects may share object tiles. Array fields and properties maps in update replace their previous values, so retain unrelated state. Health is 0..maxHp. Portable objects are items; transfer manages holder/inventory links. Opening exposes contents through the server, so do not guess hidden item IDs. Use lowercase burning/wet/dead/open/locked for those established statuses; other conditions are free text. No source code, credentials, arbitrary property paths, or external asset URLs. Thoughts belong only to actorId; narrator uses null speakerId; NPC speech uses that NPC's ID.

Respond in brief, vivid character dialogue and narration grounded in the resolved changes. If a previous proposal was rejected, repair its representation while preserving the player's creative intent. An absent custom ability is a reason to invent its consequences, not to refuse. Reuse familiar asset IDs; give novel things a new descriptive asset ID and visual description for background generation. Proxies appear before finished artwork.`;

export async function resolveSandboxPrompt(model: StructuredModel, world: WorldState, actorId: string, text: string, targetId?: string): Promise<EngineResult> {
  const view = projectWorld(world, actorId);
  const actor = view.entities[actorId];
  const mapId = actor.location?.mapId;
  // The sandbox authoring scope is the current scene, even after other maps are discovered.
  view.maps = Object.fromEntries(Object.entries(view.maps).filter(([id]) => id === mapId));
  view.entities = Object.fromEntries(Object.entries(view.entities).filter(([, entity]) => entity.location?.mapId === mapId || entity.holderId === actorId));
  if (view.sandbox) {
    view.sandbox.rules = view.sandbox.rules.filter(rule => rule.mapId === mapId);
    view.sandbox.forms = view.sandbox.forms.filter(form => Object.hasOwn(view.entities, form.actorId));
  }
  let rejection = '';
  let previousProposal: SandboxProposal | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await model.structured(SandboxProposalSchema, sandboxPrompt, JSON.stringify({ actorId, text, targetId, world: view, assets: assetCatalog.filter(asset => !asset.id.startsWith('town-') && !asset.id.startsWith('dungeon-')).map(asset => asset.id), rejection, previousProposal }), 90000);
    const proposal = SandboxProposalSchema.parse(raw);
    const knownAssets = new Set([...assetCatalog.map(asset => asset.id), ...Object.values(view.entities).map(entity => entity.assetId)]);
    const introducedAssets = new Map<string, string>();
    proposal.changes = proposal.changes.map(change => {
      if (change.type !== 'spawn' || knownAssets.has(change.assetId)) return change;
      const assetId = introducedAssets.get(change.assetId) ?? `sculpt-${createHash('sha256').update(JSON.stringify({ name: change.name, description: change.description })).digest('hex').slice(0, 24)}`;
      introducedAssets.set(change.assetId, assetId);
      return { ...change, assetId };
    });
    const result = resolveSandboxTurn(world, actorId, proposal);
    if (result.ok) return result;
    rejection = `${result.error.code}: ${result.error.message}`;
    previousProposal = proposal;
  }
  return { ok: false, error: { code: 'SANDBOX_REJECTED', message: rejection } };
}
