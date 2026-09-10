import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { SqliteWorldRepository } from './repository';
import { GameService } from './service';
import { AssetQueue } from './assets';
import { createGameServer } from './http';
import { ClientMessageSchema, type WorldEvent } from '../../packages/contracts';

const cleanups: (()=>Promise<void>)[]=[];
afterEach(async()=>{for(const cleanup of cleanups.splice(0))await cleanup();});
async function setup() {
  const repo=new SqliteWorldRepository(':memory:');
  const service=new GameService(repo,{structured:async()=>{throw new Error('Test model offline');}});
  const queue=new AssetQueue(repo,{artwork:async()=>Buffer.alloc(0)},'/tmp/house-test-art');
  const {server,websocket}=createGameServer(service,{provider:'claude-cli',model:'test',available:true},queue,{generatedDir:'/tmp/house-test-art'});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  cleanups.push(async()=>{queue.stop();for(const ws of websocket.clients)ws.terminate();server.close();await once(server,'close');repo.close();});
  const created=await fetch(`${url}/api/worlds`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({brief:{premise:'house',tone:'quiet',protagonist:'Rowan',messages:[]},mode:'demo',preset:'house'})}).then(r=>r.json());
  return {repo,service,url,created,server};
}
describe('HTTP and synchronized clients',()=>{
  it('returns 400 for malformed request targets and continues serving requests', async()=>{
    const {server,url} = await setup();
    const request = {url:'//[',method:'GET',headers:{}} as IncomingMessage;
    let status = 0;
    let payload = '';
    const response = {setHeader:()=>{},writeHead:(code:number)=>{status=code;},end:(body:string)=>{payload=body;}} as unknown as ServerResponse;
    const listener = server.listeners('request')[0];
    await listener(request,response);
    expect(status).toBe(400);
    expect(JSON.parse(payload)).toHaveProperty('error');
    expect((await fetch(`${url}/api/info`)).status).toBe(200);
  });
  it('requires actor credentials and rejects cross-site model requests',async()=>{
    const {url,created}=await setup();
    expect((await fetch(`${url}/api/worlds/${created.session.worldId}`)).status).toBe(401);
    expect((await fetch(`${url}/api/worlds`,{method:'POST',headers:{origin:'https://untrusted.example'}})).status).toBe(403);
    const info=await fetch(`${url}/api/info`).then(r=>r.json());expect(info.provider).toBe('claude-cli');expect(info.assets.length).toBeGreaterThan(100);
  });
  it('recovers HTTP and WebSocket subscribers beyond a private event page',async()=>{
    const {repo,url,created,service} = await setup();
    const {session} = created;
    const world = repo.load(session.worldId)!;
    const privateEvents: WorldEvent[] = Array.from({length:1000},(_,i)=>({id:`private-${i}`,seq:0,revision:1,tick:1,type:'thought',actorId:'keeper',targetId:'keeper',mapId:'hall',text:'PRIVATE_PAYLOAD',data:{}}));
    const publicEvent: WorldEvent = {id:'public',seq:0,revision:1,tick:1,type:'wait',actorId:'rowan',targetId:null,mapId:'bedroom',text:'Rowan waits.',data:{}};
    repo.commit(world.id,'rowan','history','history',0,{...world,revision:1},[...privateEvents,publicEvent]);
    const response = await fetch(`${url}/api/worlds/${world.id}/events?after=0`,{headers:{authorization:`Bearer ${session.token}`}}).then(r=>r.json());
    expect(response).toMatchObject({cursor:1001,reset:true,view:{revision:1}});
    expect(response.events.map((event:WorldEvent)=>event.id)).toEqual(['public']);
    expect(JSON.stringify(response)).not.toContain('PRIVATE_PAYLOAD');
    const ws = new WebSocket(url.replace('http:','ws:')+'/ws');
    await once(ws,'open');
    const next = once(ws,'message');
    ws.send(JSON.stringify({type:'subscribe',worldId:world.id,token:session.token,after:0}));
    const [raw] = await next;
    expect(ClientMessageSchema.parse(JSON.parse(raw.toString()))).toEqual({type:'snapshot',...response});
    const privateCommit = repo.commit(world.id,'rowan','hidden','hidden',1,{...world,revision:2},[{...privateEvents[0],id:'private-next',revision:2}]);
    const live = once(ws,'message');
    service.onCommit(privateCommit.world,privateCommit.events);
    const [liveRaw] = await live;
    expect(ClientMessageSchema.parse(JSON.parse(liveRaw.toString()))).toMatchObject({type:'commit',cursor:1002,events:[],view:{revision:2}});
    ws.terminate();
  });
  it('broadcasts identical committed revisions to two clients and reconciles reconnect',async()=>{
    const {url,created}=await setup();const {session}=created;
    const subscribe=async(after=0)=>{const ws=new WebSocket(url.replace('http:','ws:')+'/ws');await once(ws,'open');const next=once(ws,'message');ws.send(JSON.stringify({type:'subscribe',...session,actorId:undefined,after}));const [raw]=await next;return {ws,message:JSON.parse(raw.toString())};};
    const a=await subscribe();const b=await subscribe();expect(a.message.view).not.toHaveProperty('secrets');expect(a.message.cursor).toBe(0);
    const first=once(a.ws,'message');const second=once(b.ws,'message');
    const response=await fetch(`${url}/api/worlds/${session.worldId}/actions`,{method:'POST',headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json'},body:JSON.stringify({requestId:'move-1',expectedRevision:0,intent:{type:'move',x:3,y:8}})}).then(r=>r.json());
    const [rawA]=await first;const [rawB]=await second;const commitA=JSON.parse(rawA.toString());const commitB=JSON.parse(rawB.toString());
    expect(commitA.view).toEqual(commitB.view);expect(commitA.view.revision).toBe(response.view.revision);expect(commitA.view.entities.rowan.location.x).toBe(3);
    expect(commitA.cursor).toBe(response.cursor);expect(commitA.cursor).toBeGreaterThan(0);
    a.ws.terminate();b.ws.terminate();
    const resumed=await subscribe(0);expect(resumed.message.view.revision).toBe(1);expect(resumed.message.events.length).toBeGreaterThan(0);expect(resumed.message.cursor).toBe(commitA.cursor);resumed.ws.terminate();
  });
});
