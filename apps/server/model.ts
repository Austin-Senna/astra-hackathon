import { spawn, spawnSync } from 'node:child_process';
import { z } from 'zod';
import OpenAI from 'openai';
import { PNG } from 'pngjs';
import { WorkLimiter } from './limiter';

export function parseClaudeResult(stdout: string): unknown {
  const lines = stdout.trim().split('\n');
  const result = JSON.parse(lines.at(-1) ?? '{}') as { is_error?: boolean; result?: string; structured_output?: unknown };
  if (result.is_error) throw new Error('Claude Code could not complete the request. Check its local login.');
  if (result.structured_output !== undefined) return result.structured_output;
  if (result.result) {
    const content = result.result.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(content);
  }
  throw new Error('Claude Code returned no structured result.');
}
export function claudeArgs(model: string, system: string, schema: unknown): string[] {
  return ['-p', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--permission-mode', 'dontAsk', '--tools', '', '--output-format', 'json', '--model', model, '--max-turns', '3', '--system-prompt', system, '--json-schema', JSON.stringify(schema), '--effort', 'low'];
}

export const PixelArtSchema = z.object({ palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(16), rows: z.array(z.string().regex(/^[0-9a-f]{16}$/)).length(16) }).strict();
export function decodePixelArt(input: unknown): Buffer {
  const art = PixelArtSchema.parse(input);
  const png = new PNG({ width: 32, height: 32 });
  art.rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    const index = parseInt(pixel, 16);
    if (!art.palette[index]) throw new Error('Artwork references a missing palette color.');
    const color = parseInt(art.palette[index].slice(1), 16);
    for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) {
      const offset = ((y*2+dy) * 32 + x*2+dx) * 4;
      png.data[offset] = color >> 16; png.data[offset + 1] = (color >> 8) & 255; png.data[offset + 2] = color & 255; png.data[offset + 3] = index === 0 ? 0 : 255;
    }
  }));
  return PNG.sync.write(png);
}

export type ModelConfiguration = { provider?: 'claude-cli' | 'openai'; claudeBin?: string; claudeModel?: string; apiKey?: string; model?: string; imageModel?: string };
export class ModelProvider {
  readonly provider: 'claude-cli' | 'openai';
  readonly model: string;
  readonly available: boolean;
  private config: ModelConfiguration;
  private limiter = new WorkLimiter(2, 8);
  constructor(configuration: ModelConfiguration = {}) {
    this.config = {
      provider: process.env.MODEL_PROVIDER === 'openai' ? 'openai' : 'claude-cli',
      claudeBin: process.env.CLAUDE_BIN || 'claude', claudeModel: process.env.CLAUDE_MODEL || 'sonnet',
      apiKey: process.env.OPENAI_API_KEY, model: process.env.ASTRA_MODEL || 'gpt-6-astra', imageModel: process.env.IMAGE_MODEL || 'gpt-image-2.5-flare',
      ...configuration,
    };
    this.provider = this.config.provider!;
    this.model = this.provider === 'claude-cli' ? this.config.claudeModel! : this.config.model!;
    this.available = this.provider === 'openai' ? !!this.config.apiKey : spawnSync('which', [this.config.claudeBin!], { encoding: 'utf8' }).status === 0;
  }
  async structured<T>(schema: z.ZodType<T>, system: string, input: string, timeoutMs = 90000): Promise<T> {
    return this.limiter.run(() => this.request(schema, system, input, timeoutMs));
  }
  private async request<T>(schema: z.ZodType<T>, system: string, input: string, timeoutMs: number): Promise<T> {
    if (!this.available) throw new Error('The selected model provider is not configured.');
    if (this.provider === 'openai') {
      const client = new OpenAI({ apiKey: this.config.apiKey, timeout: timeoutMs, maxRetries: 0 });
      // JSON mode preserves optional command fields; the public schema validates locally.
      const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
      const instructions = `${system}\nReturn one JSON object conforming to this JSON schema:\n${JSON.stringify(jsonSchema)}`;
      const response = await client.responses.create({ model: this.model, input: [{ role: 'system', content: instructions }, { role: 'user', content: input }], text: { format: { type: 'json_object' } }, reasoning: { effort: 'low' } });
      if (!response.output_text) throw new Error('The model returned no usable result.');
      return schema.parse(JSON.parse(response.output_text));
    }
    const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.config.claudeBin!, claudeArgs(this.model, system, jsonSchema), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CLAUDECODE: '' } });
      let output = ''; let failure = ''; let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
      child.stdout.on('data', chunk => { output += String(chunk); if (output.length > 8_000_000) { failure = 'Model response exceeded the size limit.'; child.kill('SIGKILL'); } });
      child.stderr.on('data', () => {});
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); if (timedOut) reject(new Error('The DM took too long. Your world is unchanged; try again.')); else if (failure || code !== 0) reject(new Error(failure || `Claude Code exited with code ${code}. Check its local login.`)); else resolve(output); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
    return schema.parse(parseClaudeResult(stdout));
  }
  async artwork(name: string): Promise<Buffer> {
    if (this.provider === 'openai') {
      const response = await new OpenAI({ apiKey: this.config.apiKey, timeout: 150000, maxRetries: 0 }).images.generate({ model: this.config.imageModel!, prompt: `A single game sprite: ${name}. Readable top-down pixel art, muted jade, coral, ivory, ink outline. Centered complete object, transparent background, no text or scenery.`, background: 'transparent', output_format: 'png', size: '1024x1024', quality: 'low' });
      const encoded = response.data?.[0]?.b64_json;
      if (!encoded) throw new Error('No image was returned.');
      return Buffer.from(encoded, 'base64');
    }
    const art = await this.structured(PixelArtSchema, 'You are a pixel artist for an original narrative RPG. Draw one recognizable 16x16 pixel sprite using a palette of up to 16 hex colors. Return exactly 16 rows, each exactly 16 hexadecimal digits indexing the palette. Palette index 0 is always transparent. Use an ink outline, readable highlights, muted jade/coral/ivory colors, top-down 3/4 perspective. Center the entire object. No text. Return only the structured artwork.', name, 120000);
    return decodePixelArt(art);
  }
}
