import { mkdirSync, writeFileSync } from 'node:fs';
import { ModelProvider } from '../apps/server/model';
import { GameService } from '../apps/server/service';
import { SqliteWorldRepository } from '../apps/server/repository';
import { verifySolution } from '../apps/server/generation';

if(process.env.LOAD_ENV)process.loadEnvFile('.env');
mkdirSync('data/smoke',{recursive:true});
const provider=new ModelProvider();
const repository=new SqliteWorldRepository('data/smoke/worlds.sqlite');
const service=new GameService(repository,provider);
try{
  console.log('Generating live chapter through '+provider.provider+' / '+provider.model);
  const chapter=await service.create({premise:'A lighthouse keeper has to return a stolen star before dawn on a tiny island. The mystery should be wistful, not horror.',tone:'quiet wonder',protagonist:'Iona, a practical astronomer who repairs small things',messages:[]},'live','house');
  const world=repository.load(chapter.session.worldId)!;
  console.log(JSON.stringify({title:world.title,worldId:world.id,maps:Object.keys(world.maps).length,entities:Object.keys(world.entities).length,replayedSolution:verifySolution(world)}));
  const reply=await service.dm(world.id,chapter.session.token,{requestId:'live-thought',expectedRevision:0,text:'I study the key beside me. What does it remind me of?'});
  console.log(JSON.stringify({dm:reply.ok,...(reply.ok?{revision:reply.view.revision,dialogue:reply.view.dialogue.slice(-2)}:{error:reply.error})}));
  if(!reply.ok)throw new Error('Live DM failed');
  const art=await provider.artwork('A silver telescope eyepiece with a tiny coral star engraved on the side');
  writeFileSync('data/smoke/eyepiece.png',art);console.log(JSON.stringify({artBytes:art.length,png:art.subarray(1,4).toString()}));
}finally{repository.close();}
