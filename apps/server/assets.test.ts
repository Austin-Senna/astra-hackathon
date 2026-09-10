import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SqliteWorldRepository } from './repository';
import { AssetQueue } from './assets';
import { createHouseWorld } from '../../packages/engine/fixtures';
import { decodePixelArt } from './model';

describe('persistent artwork jobs',()=>{
  it('keeps failed proxies, retries, and writes a complete raster before publishing',async()=>{
    const repo=new SqliteWorldRepository(':memory:');const world=createHouseWorld('art');
    world.entities.keepsake.assetId='new-locket';repo.createWorld(world,'rowan','demo');
    const png=decodePixelArt({palette:['#000000','#ffffff'],rows:Array(16).fill('1'.repeat(16))});
    const model={artwork:vi.fn().mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValue(png)};
    const directory=mkdtempSync(join(tmpdir(),'house-art-'));
    const queue=new AssetQueue(repo,model,directory);const ready=vi.fn();queue.onReady=ready;
    try{
      queue.enqueue(world);
      await vi.waitFor(()=>expect(repo.assetJobs('art')[0].status).toBe('failed'));
      expect(ready.mock.calls[0][1].variants.sprite.url).toBe('/art/hero/item.png');
      queue.retry('art','new-locket');
      await vi.waitFor(()=>expect(repo.assetJobs('art')[0].status).toBe('ready'));
      const job=repo.assetJobs('art')[0];expect(readFileSync(join(directory,`${job.id}.png`))).toEqual(png);
      queue.enqueue(world);expect(repo.assetJobs('art')).toHaveLength(1);
    }finally{queue.stop();repo.close();}
  });
  it('recovers an interrupted working job after restart',async()=>{
    const repo=new SqliteWorldRepository(':memory:');repo.createWorld(createHouseWorld('recover'),'rowan','demo');
    repo.putAssetJob({id:'interrupted',worldId:'recover',assetId:'art',name:'book',status:'working',url:null,error:null});
    const queue=new AssetQueue(repo,{artwork:async()=>{throw new Error('Offline');}},mkdtempSync(join(tmpdir(),'house-art-')));
    try{queue.resume();await vi.waitFor(()=>expect(repo.assetJobs()[0].status).toBe('failed'));}finally{queue.stop();repo.close();}
  });
});
