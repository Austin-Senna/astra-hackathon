import { Path } from 'rot-js';
import { ActionResponseSchema, type PlayerIntent, type SessionInfo, type WorldView } from '../packages/contracts';

const base=process.env.GAME_URL??'http://127.0.0.1:8790';
async function request(path:string,body?:unknown,session?:SessionInfo) {
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(session?{authorization:`Bearer ${session.token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));return value;
}
const created=await request('/api/worlds',{brief:{premise:'house',tone:'quiet',protagonist:'Rowan',messages:[]},mode:'demo',preset:'house'});
const session:SessionInfo=created.session;let view:WorldView=created.view;let actions=0;
async function act(intent:PlayerIntent) {
  const result=ActionResponseSchema.parse(await request(`/api/worlds/${session.worldId}/actions`,{requestId:crypto.randomUUID(),expectedRevision:view.revision,intent},session));
  if(!result.ok)throw new Error(result.error.message);view=result.view;actions++;
}
async function walk(x:number,y:number) {
  const position=view.entities[session.actorId].location!;const map=view.maps[position.mapId];const points:number[][]=[];
  new Path.AStar(x,y,(tx,ty)=>map.tiles[ty]?.[tx]!==undefined&&map.tiles[ty][tx]!=='#'&&!Object.values(view.entities).some(e=>e.solid&&e.location?.mapId===map.id&&e.location.x===tx&&e.location.y===ty),{topology:4}).compute(position.x,position.y,(tx,ty)=>points.push([tx,ty]));
  if(!points.length)throw new Error('No path');for(const [tx,ty] of points.slice(1))await act({type:'move',x:tx,y:ty});
}
await act({type:'pickUp',targetId:'brass-key'});
await walk(7,8);await act({type:'pickUp',targetId:'keepsake'});
await walk(22,8);await walk(8,7);await act({type:'give',itemId:'keepsake',targetId:'keeper'});await act({type:'interact',targetId:'keeper'});
await walk(20,8);await act({type:'use',itemId:'brass-key',targetId:'garden-door'});await walk(22,8);await walk(21,8);await walk(9,8);await act({type:'interact',targetId:'nell'});
const restored=await request(`/api/worlds/${session.worldId}`,undefined,session);
if(restored.view.status!=='won'||!restored.view.memories.some((memory:{kind:string})=>memory.kind==='help'))throw new Error('Goal or remembered kindness did not persist.');
console.log(JSON.stringify({worldId:session.worldId,actions,status:restored.view.status,revision:restored.view.revision,maps:Object.keys(restored.view.maps).length,rememberedKindness:true}));
