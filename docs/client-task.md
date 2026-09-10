# Client, SDK, And Renderer Task

Own apps/client/**, packages/client-sdk/**, packages/presentation/** and docs/client-report.md ONLY. Do not edit contracts, engine, server, root configs, asset catalog or public/art. Do not install packages, commit, or delegate. Root handles server and assets while you build the complete frontend. Use apply_patch. Test shared SDK behavior appropriately and run typecheck (report unrelated failures).

## Product and visuals

Build an actual sophisticated, polished narrative game UI, not a dashboard or landing page. User chose a mystery house as the first example but wants a creation chat that generates different adventures, direct WASD/click exploration, immediate object interactions, a large bottom dialogue/thought box, inventory, coherent audio, memories and one goal. Server owns truth. Four 24x16 tile maps with stable entities. UI modular renderer so later AI can create 2.5D/3D. Separate battle presentation must be an optional working adapter (can implement React battle stage overlay via same SDK, no duplicate state).

An original gorgeous gouache illustration already exists at /art/house-cover.png (1536x1024). Use it full-bleed as the creation-chat background, with usable unframed chat content on left, house visible on right. NOT a marketing hero, no cards around the principal experience, no fake feature copy. Set compact serif display title, elegant high-contrast body type, coral/jade/ivory accents, sparse ink details. All labels should be game content or functional commands. Local system fonts okay (Georgia and system sans). Text letter-spacing=0. Keep tone intimate, mysterious, humane. No purple gradients or decorative orbs.

Gameplay should be nearly full-viewport world with a slim header and generous readable bottom dialogue region; compact inventory strip, map/journal/character/settings drawers. Avoid card/dashboard styling. Header includes world name, room name, connection/save status, pause/settings etc icons via lucide-react. World is visually rich; use static terrain layers with varied patterned wood/stone/garden tiles, wall depth, windows, shadows, rugs and real item sprites. Default maps are 24x16. Client renderer must make maps feel like rooms not scattered tokens. Sprite scale, depth, actor idle bob, move interpolation, highlights and particles should be stable and attractive. Keep assets sharp and actual object recognizability. No map text overlays colliding with content. Use canvas rendering with PixiJS8. Root generates custom 32px hero sprites plus full Kenney catalog; GET /api/info provides catalog.

Available art IDs: player,nell,keeper,echo,enemy,bed,rug,table,chair,wardrobe,chest,key,letter,book,candle,lamp,plant,flower,fountain,door,window,crate,barrel,crowbar,apple,bottle,keepsake,stairs,mirror,clock,sword,shield,torch,stone,bone,mushrooms,item. Fetch AssetDefinitions from API; prefer sprite URLs. Root will add /art/hero/{id}.png. Kenney raw assets exist /art/town/tile_0000.png .. tile_0131.png and same dungeon. Use semantic hero sprites over raw tile guesses.

Audio files /audio/rpg/footstep00.ogg, footstep01.ogg, bookOpen.ogg, bookFlip1.ogg, metalLatch.ogg, handleCoins.ogg, doorOpen_1.ogg, knifeSlice.ogg, creak1.ogg, chop.ogg, cloth1.ogg. Need actual audio manager with user-gesture unlock, music/ambience/SFX settings, short synthesized soft background score and effects fallback if file fails. No voice required.

## Exact server APIs root implements

- GET /api/info -> {provider:'claude-cli'|'openai',model:string,available:boolean,assets:AssetDefinition[]}
- POST /api/chat {brief:AdventureBrief,message:string} -> {brief:AdventureBrief,reply:string,suggestions:string[]}. Uses live model, preserves input on failure. Initial client local first DM greeting, user message sent with existing brief. Editing premise/tone/protagonist updates brief. An authored demo can skip chat.
- POST /api/worlds {brief:AdventureBrief,mode:'live'|'demo',preset:'house'|'dungeon'} -> {session:SessionInfo,view:WorldView,source:string,assets:AssetDefinition[]}. Live generation can take 90s; show real progress/pending scene animation, preserve editable conversation and failure retry. Explicit demo button labeled 'Play authored chapter'.
- GET /api/worlds/:worldId with Authorization: Bearer <session.token> -> {view,assets,source}
- POST /api/worlds/:worldId/actions with bearer and ActionRequest -> ActionResponse (defined in contracts).
- POST /api/worlds/:worldId/dm with bearer {requestId,expectedRevision,text,targetId?:string} -> ActionResponse. No fake fallback. For demo worlds typed input still uses live DM if provider available.
- POST /api/worlds/:worldId/restore with bearer {requestId,expectedRevision} -> ActionResponse (checkpoint retry).
- GET /api/worlds/:worldId/events?after=<seq> bearer -> {view,events,cursor,reset}. Filtered per actor. cursor is the authoritative scanned sequence even when events is empty. reset means the suffix was truncated to a bounded recent tail or the submitted cursor was ahead; replace state with view and do not expect a complete historical animation replay.
- WS /ws then send {type:'subscribe',worldId,token,after:number}. Server sends ClientMessage snapshots/commits/assets/errors; commit includes view and events, asset includes AssetDefinition. On reconnect subscribe after lastSeq; complete snapshot always reconciles. Never interpolate token in URL.

Persist only credentials/summary metadata of saved sessions in localStorage, never authoritative world state. Each browser tab can load a saved session; live WebSocket updates show same world. Creation mode and current session may be UI state. Saved adventures drawer lists locally held sessions with title, source, updatedAt and resume. Do not implement a misleading backend global listing.

## SDK and behavior

- Export GameClient from packages/client-sdk/index.ts. Keep it independent of React/Pixi/server/database.
- connect(session), disconnect(), subscribe(listener), getSnapshot(), submit(intent), askDM(text,targetId?), restore(), walkTo(x,y,targetId?), cancelWalk(). SDK snapshot includes view, assets, session, connection ('connecting'|'online'|'offline'), busy, error, latestEvents.
- Parse network payloads with shared schemas, ignore older revisions, deduplicate events by ID/sequence. Authoritative snapshots should correct predictions; do not mutate canonical state locally. Reconnect with bounded exponential delay and snapshot recovery. Connection unavailable rejects actions without discarding typed text. Snapshot/create responses, action success, and WS snapshot/commit include cursor. Track max(previousCursor,message.cursor) independently of visible events; accept an authoritative reset cursor on reset. Never derive the only reconnect cursor from visible events, since hidden/private events also advance the shared sequence. On reset, discard queued stale animations and use the full snapshot.
- Movement: use rot-js AStar to emit adjacent moves sequentially with latest server revision. Clicking entity walks to nearest reachable adjacent cell then interacts. For portability, actorId comes from SessionInfo, not hardcoded rowan. Cancel stale walk path when new walk/input, room changes or command rejected. Never focus/consume WASD when in an input/contenteditable/modal. Keyboard E interacts nearest entity; inventory use target command carries itemId+targetId; dropping uses current actor coordinates; give contextual NPC action; inspect does not require typed input.
- Free text preserves user input until success. Actor capability buttons derive abilities (mend/rest/flee/etc), don't invent affordances. Status text from actual events; thought/narration comes world.dialogue. Dismiss advances dialogue queue, not world time. Display failures professionally without fake successful narration.
- Drawers: inventory actions use/drop/give; journal knownFacts and memories; character abilities/traits/mood; map visited maps; settings volume and battle presentation mode ('In world'/'Battle stage'). Accessible labels/tooltips for icons. Escape closes drawer. Mobile touch movement through click-map plus interaction button; portrait layout never overlaps bottom dialogue.

## Renderer boundary and dev mode

Define renderer-neutral GameViewAdapter and BattleViewAdapter in packages/presentation/interfaces.ts. mount container+callbacks/assets; update view+actorId; play events; resize; dispose. BattleViewAdapter consumes encounter and same entity snapshot. No direct API calls or state mutations inside adapters.

Use separate files for renderer layers/assets/input and UI components; don't create one huge main component. Root index.html already points to apps/client/main.tsx. Root Vite proxy/server exists port5174/backend8790. Add ?dev=renderer screen with a mock SDK loading /fixtures/house.json (root supplies projected snapshot and assets) so another AI can exercise presentation without server. The mock can replay canned views/events, clearly marked as renderer preview. Do not import backend or engine into production UI.

## Verification and report

Run focused SDK tests for stale view rejection, event dedup, path cancellation/failures and typing/input safety where meaningful. Root will do full Playwright visual/game verification. Do not claim browser testing unless performed. Write docs/client-report.md with modules, commands/tests and concerns. Notify root when files are ready for running server/build. No full git workflows.
