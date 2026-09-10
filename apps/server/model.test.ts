import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseClaudeResult, claudeArgs, decodePixelArt, ModelProvider } from './model';
import { PNG } from 'pngjs';
import { z } from 'zod';
import { DMCommandSchema } from '../../packages/contracts';

afterEach(()=>vi.unstubAllGlobals());

function openAIResponse(output: string) {
  return new Response(JSON.stringify({id:'resp_test',object:'response',created_at:0,status:'completed',model:'offline-model',output:[{id:'msg_test',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:output,annotations:[]}]}]}), {headers:{'content-type':'application/json'}});
}

describe('OpenAI JSON transport',()=>{
  const planSchema = z.object({commands:z.array(DMCommandSchema)}).strict();
  it('sends optional DM command fields through the installed SDK and validates the returned plan',async()=>{
    let requestBody = '';
    vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{
      requestBody = String(init.body);
      return openAIResponse('{"commands":[{"type":"pickUp","targetId":"brass-key"}]}');
    });
    const provider = new ModelProvider({provider:'openai',apiKey:'offline-test-key',model:'offline-model'});
    const result = await provider.structured(planSchema,'Act as Rowan.','Take the key.');
    expect(result).toEqual({commands:[{type:'pickUp',targetId:'brass-key'}]});
    const request = JSON.parse(requestBody);
    expect(request.text.format).toEqual({type:'json_object'});
    expect(request.input[0].content).toContain('Act as Rowan.');
    expect(request.input[0].content).toContain('JSON');
    expect(request.input[0].content).toContain('"pickUp"');
    expect(request.input[0].content).toContain('"required"');
  });
  it.each([
    ['not JSON', SyntaxError],
    ['{"commands":[{"type":"pickUp","itemId":"brass-key"}]}', z.ZodError],
    ['{"commands":[{"type":"pickUp","targetId":null}]}', z.ZodError],
  ])('rejects malformed provider output %s locally',async(output,errorType)=>{
    vi.stubGlobal('fetch',async()=>openAIResponse(output));
    const provider = new ModelProvider({provider:'openai',apiKey:'offline-test-key',model:'offline-model'});
    await expect(provider.structured(planSchema,'Act as Rowan.','Take the key.')).rejects.toBeInstanceOf(errorType);
  });
});

describe('headless model boundary', () => {
  it('reads schema output and rejects failed CLI results', () => {
    expect(parseClaudeResult(JSON.stringify({ type: 'result', structured_output: { reply: 'Hello' } }))).toEqual({ reply: 'Hello' });
    expect(parseClaudeResult(JSON.stringify({ result: '{"reply":"Hello"}' }))).toEqual({ reply: 'Hello' });
    expect(() => parseClaudeResult(JSON.stringify({ is_error: true, result: 'No login' }))).toThrow();
  });
  it('disables interactive tools and passes prompts as arguments rather than shell code', () => {
    const prompt = 'A world with $(secret) and `commands`';
    const args = claudeArgs('sonnet', prompt, { type: 'object' });
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--system-prompt') + 1]).toBe(prompt);
    expect(args).toContain('--no-session-persistence');
    expect(args).not.toContain('--bare');
  });
  it('upscales a 16-pixel sprite to a 32-pixel PNG preserving color and transparency', () => {
    const art = { palette: ['#000000', '#ab12ef'], rows: ['01'.repeat(8), ...Array.from({ length: 15 }, () => '1'.repeat(16))] };
    const png = PNG.sync.read(decodePixelArt(art));
    expect(png.width).toBe(32);expect(png.height).toBe(32);
    for(const [x,y,color] of [[0,0,[0,0,0,0]],[1,1,[0,0,0,0]],[2,0,[171,18,239,255]],[3,1,[171,18,239,255]],[0,2,[171,18,239,255]],[31,31,[171,18,239,255]]] as const) {
      expect([...png.data.subarray((y*32+x)*4,(y*32+x)*4+4)]).toEqual(color);
    }
  });
  it('rejects malformed sprite dimensions and missing palette colors', () => {
    const art = { palette: ['#000000', '#ffffff'], rows: Array.from({ length: 16 }, () => '1'.repeat(16)) };
    expect(() => decodePixelArt({ ...art, rows: ['bad'] })).toThrow();
    expect(() => decodePixelArt({ ...art, rows: Array.from({ length: 16 }, () => 'f'.repeat(16)) })).toThrow('missing palette color');
    expect(() => decodePixelArt({ ...art, rows: Array.from({ length: 32 }, () => '1'.repeat(32)) })).toThrow();
    expect(() => decodePixelArt({ ...art, rows: Array.from({ length: 16 }, () => '1'.repeat(15)) })).toThrow();
    expect(() => decodePixelArt({ ...art, rows: art.rows.slice(1) })).toThrow();
  });
});
