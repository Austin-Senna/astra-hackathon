import { mkdirSync, writeFileSync } from 'node:fs';
import { ModelProvider } from '../apps/server/model';

const provider=new ModelProvider();const start=Date.now();
console.log(`Generating pixel artwork through ${provider.provider}`);
const art=await provider.artwork('A silver telescope eyepiece, coral star detail, readable top-down game item');
mkdirSync('data/smoke',{recursive:true});writeFileSync('data/smoke/eyepiece.png',art);
console.log(JSON.stringify({artBytes:art.length,png:art.subarray(1,4).toString(),seconds:Math.round((Date.now()-start)/1000)}));
