import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { heroNames, assetCatalog } from '../packages/assets/catalog';
import { createHouseWorld } from '../packages/engine/fixtures';
import { projectWorld } from '../packages/engine';

mkdirSync('public/art/hero', { recursive: true });
mkdirSync('public/fixtures', { recursive: true });
const ink = '#29343a', wood = '#966652', gold = '#e7bd70', paper = '#f2e5c8', jade = '#619486', coral = '#d87c72';
for (const id of heroNames) {
  const png = new PNG({ width: 32, height: 32 });
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    const rgb = parseInt(color.slice(1), 16);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= 32 || yy >= 32) continue;
      const i = (yy * 32 + xx) * 4;
      png.data[i] = rgb >> 16; png.data[i + 1] = rgb >> 8 & 255; png.data[i + 2] = rgb & 255; png.data[i + 3] = 255;
    }
  };
  const box = (x: number, y: number, w: number, h: number, color: string) => { rect(x,y,w,h,ink); rect(x+1,y+1,w-2,h-2,color); };
  if (['player','nell','keeper','echo','enemy'].includes(id)) {
    const coat = id === 'nell' ? coral : id === 'keeper' ? '#ad976e' : id === 'enemy' ? '#8d696f' : jade;
    rect(8,28,17,2,ink); rect(11,23,4,6,ink); rect(18,23,4,6,ink);
    box(9,15,15,11,coat); rect(11,17,2,7,paper); rect(20,17,2,7,paper);
    box(10,4,13,13,id === 'echo' ? '#c1dacf' : '#eac6aa');
    rect(10,3,13,5,id === 'nell' ? '#714f49' : '#42444c'); rect(10,7,2,5,ink);
    rect(13,10,2,2,ink); rect(19,10,2,2,ink); rect(15,14,3,1,coral);
    if(id==='keeper') {rect(8,3,17,3,gold);rect(11,0,11,3,ink);}
  } else if (id === 'bed') {
    box(4,2,24,28,wood); box(6,5,20,23,paper); box(8,6,16,6,'#fcf5df'); box(6,13,20,14,coral); rect(8,15,2,10,'#e6a294'); rect(24,29,3,3,ink); rect(5,29,3,3,ink);
  } else if (id === 'rug') {
    box(1,6,30,21,coral); box(4,9,24,15,gold); box(6,11,20,11,jade); rect(14,13,4,7,paper);
  } else if (['table','chair'].includes(id)) {
    rect(6,19,3,11,ink); rect(24,19,3,11,ink); box(3,7,27,16,wood); rect(6,9,21,2,gold); if(id==='chair') box(7,1,18,9,wood);
  } else if (['wardrobe','door','chest','crate'].includes(id)) {
    box(4,id==='chest'?12:2,24,id==='chest'?18:28,wood); rect(7,5,2,21,'#ba8870'); rect(15,4,1,24,ink); rect(24,16,2,3,gold); if(id==='chest') {rect(5,19,22,2,ink);box(14,18,5,5,gold);} if(id==='crate') {rect(5,6,22,3,gold);rect(5,23,22,3,gold);}
  } else if (['window','mirror'].includes(id)) {
    box(5,1,22,29,gold); box(7,3,18,25,'#83adaf'); rect(10,6,3,12,'#c1d9cf'); if(id==='window') {rect(15,3,2,25,wood);rect(7,15,18,2,wood);}
  } else if (['plant','flower','mushrooms'].includes(id)) {
    box(10,20,13,10,wood); rect(15,9,2,14,jade); box(4,9,10,7,jade); box(18,6,10,9,jade); box(12,3,8,9,id==='plant'?jade:coral); if(id==='flower') rect(15,5,3,3,gold);
  } else if (['key','crowbar','sword','bone'].includes(id)) {
    const c = id==='key'?gold:paper;
    box(13,8,5,21,c); if(id==='key'){box(9,2,13,11,gold);rect(13,5,5,4,ink);rect(18,22,5,3,gold);} else if(id==='sword') {rect(6,21,20,3,gold);rect(14,25,3,6,wood);} else {rect(17,5,7,4,c);rect(20,6,4,7,c);}
  } else if (['letter','book'].includes(id)) {
    box(5,7,22,20,id==='book'?jade:paper); rect(8,9,2,16,id==='book'?gold:wood); rect(13,12,10,1,wood);rect(13,15,8,1,wood);rect(13,18,9,1,wood); if(id==='letter')box(17,19,5,5,coral);
  } else if (['candle','lamp','torch'].includes(id)) {
    box(12,13,8,15,id==='torch'?wood:paper); rect(7,27,18,3,gold); rect(14,4,4,10,coral);rect(12,7,8,6,gold);rect(15,8,2,5,paper);if(id==='lamp')box(6,5,20,11,gold);
  } else if (id==='stairs') {
    for(let i=0;i<5;i++)box(3+i,3+i*5,26-i*2,7,i%2?paper:'#b7b4a3');
  } else if (id==='fountain') {
    box(2,18,28,12,'#a6b7b3');box(4,18,24,7,'#7bafb3');box(13,5,7,19,paper);box(7,5,19,6,'#a6b7b3');rect(10,6,13,2,'#7bafb3');
  } else if (id==='bottle') {
    box(13,3,7,7,gold);box(9,10,15,20,jade);rect(12,13,2,10,paper);box(10,20,13,5,paper);
  } else if (id==='apple') {
    rect(16,5,2,7,wood);rect(18,5,6,3,jade);box(6,12,21,14,coral);rect(10,13,3,5,'#edaa94');
  } else if (id==='clock') {
    box(8,1,17,30,wood);box(10,3,13,13,paper);rect(16,5,1,7,ink);rect(16,10,5,1,ink);rect(16,19,2,8,gold);
  } else if (id==='barrel') {
    box(7,3,19,27,wood);rect(8,7,17,3,'#a3b0aa');rect(8,23,17,3,'#a3b0aa');rect(16,5,1,24,ink);
  } else if (id==='shield') {
    box(6,4,21,22,jade);box(11,22,11,7,jade);rect(15,7,3,17,gold);rect(9,13,15,3,gold);
  } else {
    box(8,9,18,17,id==='stone'?'#a7b7b0':gold);box(11,12,12,11,id==='keepsake'?coral:jade);rect(13,13,3,3,paper);
  }
  writeFileSync(`public/art/hero/${id}.png`, PNG.sync.write(png));
}
const world = createHouseWorld();
writeFileSync('public/fixtures/house.json', JSON.stringify({ view: projectWorld(world,world.actorIds[0]), assets: assetCatalog, actorId: world.actorIds[0] }));
console.log(`Built ${heroNames.length} original sprites and renderer fixture; catalog has ${assetCatalog.length} assets.`);
