import { DIMENSIONS, MODEL, MODEL_REVISION } from './config.js';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

export class LocalEmbedder implements Embedder {
  private extractor?: Promise<any>;

  constructor(private cache: string, private allowDownload = false) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    this.extractor ??= this.load();
    let extractor;
    try { extractor = await this.extractor; }
    catch (error) { this.extractor = undefined; throw error; }
    const result: number[][] = [];
    for (let start = 0; start < texts.length; start += 8) {
      const output = await extractor(texts.slice(start, start + 8), {
        pooling: 'mean', normalize: true, truncation: true, max_length: 256,
      });
      result.push(...output.tolist());
    }
    if (result.length !== texts.length || result.some(vector => vector.length !== DIMENSIONS ||
        vector.some(value => !Number.isFinite(value)) || !vector.some(value => value !== 0))) {
      throw new Error('The embedding model returned invalid vectors.');
    }
    return result;
  }

  private async load() {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = this.cache;
    env.allowLocalModels = true;
    env.localModelPath = this.cache;
    try {
      return await pipeline('feature-extraction', MODEL, {
        revision: MODEL_REVISION, dtype: 'q8', device: 'cpu',
        local_files_only: !this.allowDownload,
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
      });
    } catch (error) {
      throw new Error(`Embedding model unavailable. Run the documented prepare-model command first. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
