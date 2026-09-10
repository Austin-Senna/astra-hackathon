import { ModelProvider } from '../apps/server/model';
import { SqliteWorldRepository } from '../apps/server/repository';
import { GameService } from '../apps/server/service';
import { createHouseWorld } from '../packages/engine/fixtures';

const repository=new SqliteWorldRepository(':memory:');const provider=new ModelProvider();
try{
  const world=createHouseWorld('dm-smoke');const session=repository.createWorld(world,'rowan','demo');
  const service=new GameService(repository,{structured:async(schema,system,input,timeout)=>{
    const result=await provider.structured(schema,system,input,timeout);
    console.log(JSON.stringify({proposal:result}));
    return result;
  }});
  const result=await service.dm(world.id,session.token,{requestId:'pocket-key',expectedRevision:0,text:'I pocket the brass key beside me, then take a breath and think about finding Nell.'});
  if(!result.ok)throw new Error(result.error.message);
  if(!result.view.entities.rowan.inventory.includes('brass-key'))throw new Error('The DM did not execute the requested pickup.');
  console.log(JSON.stringify({provider:provider.provider,revision:result.view.revision,tick:result.view.tick,keyHeld:true,thought:result.view.dialogue.at(-1)?.text}));
}finally{repository.close();}
