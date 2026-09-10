import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { AdventureBriefSchema, type ClientMessage } from '../../packages/contracts';
import { assetCatalog } from '../../packages/assets/catalog';
import { projectWorld } from '../../packages/engine';
import { GameService, visibleEvents } from './service';
import type { ModelProvider } from './model';
import type { AssetQueue } from './assets';

const CreateSchema = z.object({brief:AdventureBriefSchema,mode:z.enum(['live','demo']),preset:z.enum(['sandbox','house','dungeon']).default('sandbox')}).strict();
const ChatSchema = z.object({brief:AdventureBriefSchema,message:z.string().min(1).max(2000)}).strict();
const SubscribeSchema = z.object({type:z.literal('subscribe'),worldId:z.string().max(160),token:z.string().max(160),after:z.number().int().nonnegative().default(0)}).strict();
async function body(request: IncomingMessage): Promise<unknown> {
  let size=0; const chunks:Buffer[]=[];
  for await(const chunk of request) {size+=chunk.length;if(size>64_000)throw new Error('Request is too large.');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function send(response:ServerResponse,status:number,payload:unknown) {response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(payload));}
function safeOrigin(origin?:string) {
  if(!origin) return true;
  try {const url=new URL(origin);return ['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&['http:','https:'].includes(url.protocol);} catch{return false;}
}
export function createGameServer(service:GameService, provider:Pick<ModelProvider,'provider'|'model'|'available'>, assets:AssetQueue, options:{generatedDir:string;publicDir?:string}) {
  const connections = new Map<WebSocket,{worldId:string;actorId:string}>();
  const rate = new Map<string,{start:number;count:number}>();
  const server=createServer(async(request,response)=>{
    response.setHeader('x-content-type-options','nosniff');
    if(!safeOrigin(request.headers.origin)) {send(response,403,{error:'Origin is not allowed.'});return;}
    try {
      const url = new URL(request.url??'/','http://localhost');
      if(request.method==='GET'&&url.pathname==='/api/info') {send(response,200,{provider:provider.provider,model:provider.model,available:provider.available,assets:assetCatalog});return;}
      if(request.method==='POST'&&['/api/chat','/api/worlds'].includes(url.pathname)) {
        const key=request.socket.remoteAddress??'local';let entry=rate.get(key);const now=Date.now();
        if(!entry||now-entry.start>60_000){entry={start:now,count:0};rate.set(key,entry);}
        if(++entry.count>12){send(response,429,{error:'Please wait a moment before creating another request.'});return;}
        if(url.pathname==='/api/chat'){const input=ChatSchema.parse(await body(request));send(response,200,await service.chat(input.brief,input.message));return;}
        const input=CreateSchema.parse(await body(request));send(response,201,await service.create(input.brief,input.mode,input.preset));return;
      }
      const match=url.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/(actions|dm|restore|events|assets))?$/);
      if(match) {
        const [,worldId,route]=match;const token=request.headers.authorization?.replace(/^Bearer /,'')??'';
        service.authorize(worldId,token);
        if(request.method==='GET'&&!route){send(response,200,service.snapshot(worldId,token));return;}
        if(request.method==='GET'&&route==='events'){const after=z.coerce.number().int().nonnegative().parse(url.searchParams.get('after')??0);send(response,200,service.events(worldId,token,after));return;}
        if(request.method==='POST'&&route==='actions'){send(response,200,await service.action(worldId,token,await body(request) as never));return;}
        if(request.method==='POST'&&route==='dm'){send(response,200,await service.dm(worldId,token,await body(request) as never));return;}
        if(request.method==='POST'&&route==='restore'){send(response,200,await service.restore(worldId,token,await body(request) as never));return;}
        if(request.method==='POST'&&route==='assets'){
          const input=z.object({assetId:z.string().max(160)}).strict().parse(await body(request));
          if(!service.snapshot(worldId,token).assets.some(asset=>asset.id===input.assetId))throw new Error('Unknown asset.');
          assets.retry(worldId,input.assetId);send(response,202,{ok:true});return;
        }
      }
      if(request.method==='GET'&&(url.pathname.startsWith('/generated/')||options.publicDir)) {
        const generated=url.pathname.startsWith('/generated/'); const directory=resolve(generated?options.generatedDir:options.publicDir!);
        const relative=decodeURIComponent(generated?url.pathname.slice(11):url.pathname==='/'?'index.html':url.pathname.slice(1));
        const path=resolve(directory,relative);
        if(!path.startsWith(directory+sep)){send(response,403,{error:'Invalid path.'});return;}
        try {const data=await readFile(path);const mime:Record<string,string>={'.png':'image/png','.ogg':'audio/ogg','.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};response.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','cache-control':generated?'private, max-age=3600':'no-cache'});response.end(data);return;}catch{/* Return a normal 404 below. */}
      }
      send(response,404,{error:'Not found.'});
    }catch(error){const message=error instanceof Error?error.message:'Request failed.';const invalidUrl=error instanceof TypeError&&'code' in error&&error.code==='ERR_INVALID_URL';send(response,message==='UNAUTHORIZED'?401:error instanceof z.ZodError||invalidUrl?400:500,{error:message==='UNAUTHORIZED'?'Session is not authorized.':message});}
  });
  const websocket=new WebSocketServer({noServer:true,maxPayload:4096});
  server.on('upgrade',(request,socket,head)=>{
    if(request.url!=='/ws'||!safeOrigin(request.headers.origin)){socket.destroy();return;}
    websocket.handleUpgrade(request,socket,head,ws=>websocket.emit('connection',ws,request));
  });
  const transmit=(socket:WebSocket,message:ClientMessage)=>{if(socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>2_000_000)socket.close(1013,'Reconnect to synchronize');else socket.send(JSON.stringify(message));}};
  websocket.on('connection',socket=>{
    const timeout=setTimeout(()=>{if(!connections.has(socket))socket.close(1008,'Subscription required');},5000);
    socket.on('message',raw=>{
      try {const input=SubscribeSchema.parse(JSON.parse(raw.toString()));const member=service.authorize(input.worldId,input.token);connections.set(socket,{worldId:input.worldId,actorId:member.actorId});clearTimeout(timeout);transmit(socket,{type:'snapshot',...service.events(input.worldId,input.token,input.after)});}
      catch{transmit(socket,{type:'error',error:'Subscription is not authorized.'});socket.close(1008);}
    });
    socket.on('error',()=>{});socket.on('close',()=>{clearTimeout(timeout);connections.delete(socket);});
  });
  service.onCommit=(world,events)=>{const cursor=service.repository.latestSequence(world.id);for(const [socket,member] of connections)if(member.worldId===world.id)transmit(socket,{type:'commit',view:projectWorld(world,member.actorId),events:visibleEvents(world,member.actorId,events),cursor});};
  service.onWorldCreated=world=>assets.enqueue(world);
  assets.onReady=(worldId,asset)=>{for(const [socket,member] of connections)if(member.worldId===worldId){const world=service.repository.load(worldId)!;if(Object.values(projectWorld(world,member.actorId).entities).some(entity=>entity.assetId===asset.id))transmit(socket,{type:'asset',asset});}};
  server.on('close',()=>{assets.stop();for(const socket of connections.keys())socket.terminate();websocket.close();});
  return {server,websocket};
}
