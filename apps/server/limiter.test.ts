import { expect, it } from 'vitest';
import { WorkLimiter } from './limiter';

it('limits expensive work, bounds the waiting queue, and releases on failure',async()=>{
  const limiter=new WorkLimiter(1,1);let release!:()=>void;
  const first=limiter.run(()=>new Promise<void>(resolve=>{release=resolve;}));
  const second=limiter.run(async()=>{throw new Error('model error');});
  await expect(limiter.run(async()=>true)).rejects.toThrow('busy');
  const rejection=expect(second).rejects.toThrow('model error');release();await first;await rejection;
  expect(await limiter.run(async()=>42)).toBe(42);
});
