import { configuration, MODEL_KEY } from './config.js';
import { LocalEmbedder } from './embeddings.js';

console.error(`Downloading/caching the public embedding model: ${MODEL_KEY}`);
const result = await new LocalEmbedder(configuration().models, true).embed(['Model readiness check.']);
console.error(`Ready: ${result[0]?.length} dimensions. Normal server operation uses the local cache only.`);
