import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssetDefinition, WorldState } from '../../packages/contracts';
import { assetCatalog } from '../../packages/assets/catalog';
import type { AssetJob, WorldRepository } from './repository';

export class AssetQueue {
  private running = false;
  private stopped = false;
  onReady: (worldId: string, asset: AssetDefinition) => void = () => {};
  constructor(private repository: WorldRepository, private model: {artwork(name:string):Promise<Buffer>}, private directory: string) {}
  resume() {
    for(const job of this.repository.assetJobs()) if(job.status === 'working') this.repository.putAssetJob({...job,status:'pending'});
    void this.drain();
  }
  stop() { this.stopped = true; }
  enqueue(world: WorldState) {
    const existing = new Set([...assetCatalog.map(a=>a.id),...this.repository.assetJobs(world.id).map(j=>j.assetId)]);
    const missing = Object.values(world.entities).filter(entity=>!existing.has(entity.assetId)).slice(0,2);
    for(const entity of missing) {
      existing.add(entity.assetId);
      this.repository.putAssetJob({id:randomUUID(),worldId:world.id,assetId:entity.assetId,name:entity.name,status:'pending',url:null,error:null});
    }
    void this.drain();
  }
  retry(worldId: string, assetId: string) {
    const job = this.repository.assetJobs(worldId).find(job=>job.assetId===assetId);
    if(!job || job.status !== 'failed') throw new Error('Only failed artwork can be retried.');
    this.repository.putAssetJob({...job,status:'pending',error:null}); void this.drain();
  }
  private async drain() {
    if(this.running || this.stopped) return;
    this.running = true;
    try {
      let job: AssetJob|undefined;
      while(!this.stopped && (job=this.repository.assetJobs().find(j=>j.status==='pending'))) {
        this.repository.putAssetJob({...job,status:'working'});
        try {
          const buffer = await this.model.artwork(job.name);
          await mkdir(this.directory,{recursive:true});
          const filename = `${job.id}.png`;
          await writeFile(join(this.directory,`${filename}.tmp`),buffer);
          await rename(join(this.directory,`${filename}.tmp`),join(this.directory,filename));
          if(this.stopped) return;
          this.repository.putAssetJob({...job,status:'ready',url:`/generated/${filename}`,error:null});
          this.onReady(job.worldId,{id:job.assetId,name:job.name,tags:['generated'],width:32,height:32,status:'ready',variants:{sprite:{url:`/generated/${filename}`}}});
        } catch(error) {
          if(this.stopped) return;
          this.repository.putAssetJob({...job,status:'failed',error:error instanceof Error?error.message:'Artwork failed'});
          this.onReady(job.worldId,{id:job.assetId,name:job.name,tags:['generated'],width:32,height:32,status:'failed',variants:{sprite:{url:'/art/hero/item.png'}}});
        }
      }
    } finally {this.running=false;}
  }
}
