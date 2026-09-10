import { z } from 'zod';
import { ModelProvider } from '../apps/server/model';

const provider = new ModelProvider();
console.log(JSON.stringify({ provider: provider.provider, model: provider.model, available: provider.available }));
const result = await provider.structured(z.object({ reply: z.string() }).strict(), 'Return a short in-character thought for a mystery game. No tools.', 'Rowan wakes up and realizes Nell is missing.', 60000);
console.log(JSON.stringify(result));
