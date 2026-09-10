import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModelProvider } from './model';
import { SqliteWorldRepository } from './repository';
import { GameService } from './service';
import { AssetQueue } from './assets';
import { createGameServer } from './http';

if(existsSync('.env')) process.loadEnvFile('.env');
const directory=resolve(process.env.DATA_DIR??'./data');mkdirSync(directory,{recursive:true});
const provider=new ModelProvider();
const repository=new SqliteWorldRepository(resolve(directory,'worlds.sqlite'));
const service=new GameService(repository,provider);
const assets=new AssetQueue(repository,provider,resolve(directory,'generated'));
const {server}=createGameServer(service,provider,assets,{generatedDir:resolve(directory,'generated'),publicDir:existsSync('dist/index.html')?resolve('dist'):undefined});
const port=Number(process.env.PORT??8790);const host=process.env.HOST??'127.0.0.1';
server.listen(port,host,()=>{console.log(`Game server http://${host}:${port} | ${provider.provider} / ${provider.model} | ${provider.available?'available':'not configured'}`);assets.resume();});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{assets.stop();server.close(()=>{repository.close();process.exit(0);});setTimeout(()=>process.exit(0),1500).unref();});
