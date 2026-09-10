import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import type { SessionInfo, WorldState, WorldEvent } from '../../packages/contracts';

export type AssetJob = { id: string; worldId: string; assetId: string; name: string; status: 'pending' | 'working' | 'ready' | 'failed'; url: string | null; error: string | null };
export type CommitResult = { world: WorldState; events: WorldEvent[]; replayed: boolean };
export type Membership = { actorId: string; role: 'owner' | 'player' };
export interface WorldRepository {
  load(id: string): WorldState | null;
  authorize(worldId: string, token: string): Membership | null;
  createWorld(world: WorldState, actorId: string, source: string): SessionInfo;
  addMember(worldId: string, actorId: string): SessionInfo;
  receipt(worldId: string, actorId: string, requestId: string, fingerprint: string): CommitResult | null;
  commit(worldId: string, actorId: string, requestId: string, fingerprint: string, expectedRevision: number, world: WorldState, events: WorldEvent[]): CommitResult;
  eventsSince(worldId: string, sequence: number): WorldEvent[];
  latestSequence(worldId: string): number;
  saveCheckpoint(worldId: string, world: WorldState): void;
  checkpoint(worldId: string): WorldState | null;
  source(worldId: string): string;
  putAssetJob(job: AssetJob): void;
  assetJobs(worldId?: string): AssetJob[];
  close(): void;
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export class SqliteWorldRepository implements WorldRepository {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS worlds (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL, source TEXT NOT NULL, checkpoint TEXT, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships (token_hash TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), actor_id TEXT NOT NULL, role TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (world_id TEXT NOT NULL REFERENCES worlds(id), actor_id TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(world_id, actor_id, request_id));
      CREATE TABLE IF NOT EXISTS events (world_id TEXT NOT NULL REFERENCES worlds(id), seq INTEGER NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(world_id, seq), UNIQUE(world_id, event_id));
      CREATE TABLE IF NOT EXISTS asset_jobs (id TEXT PRIMARY KEY, world_id TEXT NOT NULL REFERENCES worlds(id), asset_id TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(world_id, asset_id));
    `);
  }
  close() { this.db.close(); }
  load(id: string): WorldState | null {
    const row = this.db.prepare('SELECT state FROM worlds WHERE id = ?').get(id) as { state: string } | undefined;
    return row ? JSON.parse(row.state) : null;
  }
  source(id: string) {
    return (this.db.prepare('SELECT source FROM worlds WHERE id = ?').get(id) as { source: string } | undefined)?.source ?? 'unknown';
  }
  private membership(worldId: string, actorId: string, role: Membership['role']): SessionInfo {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO memberships VALUES (?, ?, ?, ?)').run(digest(token), worldId, actorId, role);
    return { worldId, actorId, token };
  }
  createWorld(world: WorldState, actorId: string, source: string) {
    if (!world.actorIds.includes(actorId)) throw new Error('NO_SUCH_ACTOR');
    return this.transaction(() => {
      const state = JSON.stringify(world);
      this.db.prepare('INSERT INTO worlds VALUES (?, ?, ?, ?, ?, ?)').run(world.id, world.revision, state, source, state, new Date().toISOString());
      return this.membership(world.id, actorId, 'owner');
    });
  }
  addMember(worldId: string, actorId: string) {
    if (!this.load(worldId)?.actorIds.includes(actorId)) throw new Error('NO_SUCH_ACTOR');
    return this.membership(worldId, actorId, 'player');
  }
  authorize(worldId: string, token: string): Membership | null {
    const row = this.db.prepare('SELECT actor_id, role FROM memberships WHERE world_id = ? AND token_hash = ?').get(worldId, digest(token)) as { actor_id: string; role: Membership['role'] } | undefined;
    return row ? { actorId: row.actor_id, role: row.role } : null;
  }
  receipt(worldId: string, actorId: string, requestId: string, fingerprint: string): CommitResult | null {
    const row = this.db.prepare('SELECT fingerprint, response FROM receipts WHERE world_id = ? AND actor_id = ? AND request_id = ?').get(worldId, actorId, requestId) as { fingerprint: string; response: string } | undefined;
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
    return { ...JSON.parse(row.response), replayed: true };
  }
  commit(worldId: string, actorId: string, requestId: string, fingerprint: string, expectedRevision: number, world: WorldState, events: WorldEvent[]): CommitResult {
    return this.transaction(() => {
      const receipt = this.receipt(worldId, actorId, requestId, fingerprint);
      if (receipt) return receipt;
      const current = this.load(worldId);
      if (!current) throw new Error('NO_SUCH_WORLD');
      if (current.revision !== expectedRevision) throw new Error('STALE_REVISION');
      if (world.id !== worldId || world.revision !== expectedRevision + 1) throw new Error('INVALID_REVISION');
      let sequence = Number((this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE world_id = ?').get(worldId) as { seq: number }).seq);
      const ordered = events.map(event => ({ ...event, seq: ++sequence }));
      this.db.prepare('UPDATE worlds SET revision = ?, state = ?, updated_at = ? WHERE id = ?').run(world.revision, JSON.stringify(world), new Date().toISOString(), worldId);
      const insert = this.db.prepare('INSERT INTO events VALUES (?, ?, ?, ?)');
      for (const event of ordered) insert.run(worldId, event.seq, event.id, JSON.stringify(event));
      const result = { world, events: ordered, replayed: false };
      this.db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?)').run(worldId, actorId, requestId, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  eventsSince(worldId: string, sequence: number): WorldEvent[] {
    // Recovery uses the newest bounded tail alongside a canonical snapshot.
    const rows = this.db.prepare('SELECT payload FROM (SELECT seq, payload FROM events WHERE world_id = ? AND seq > ? ORDER BY seq DESC LIMIT 1000) ORDER BY seq').all(worldId, sequence) as { payload: string }[];
    return rows.map(row => JSON.parse(row.payload));
  }
  latestSequence(worldId: string): number {
    return Number((this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events WHERE world_id = ?').get(worldId) as {seq:number}).seq);
  }
  saveCheckpoint(worldId: string, world: WorldState) { this.db.prepare('UPDATE worlds SET checkpoint = ? WHERE id = ?').run(JSON.stringify(world), worldId); }
  checkpoint(worldId: string): WorldState | null {
    const row = this.db.prepare('SELECT checkpoint FROM worlds WHERE id = ?').get(worldId) as { checkpoint: string | null } | undefined;
    return row?.checkpoint ? JSON.parse(row.checkpoint) : null;
  }
  putAssetJob(job: AssetJob) {
    this.db.prepare('INSERT INTO asset_jobs VALUES (?, ?, ?, ?) ON CONFLICT(world_id, asset_id) DO UPDATE SET payload = excluded.payload').run(job.id, job.worldId, job.assetId, JSON.stringify(job));
  }
  assetJobs(worldId?: string): AssetJob[] {
    const rows = (worldId ? this.db.prepare('SELECT payload FROM asset_jobs WHERE world_id = ?').all(worldId) : this.db.prepare('SELECT payload FROM asset_jobs').all()) as { payload: string }[];
    return rows.map(row => JSON.parse(row.payload));
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
