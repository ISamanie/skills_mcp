import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const DIMENSIONS = 384;
export const MODEL_KEY = `${MODEL}@${MODEL_REVISION}:q8:mean:normalized`;

function absolute(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  return resolve(value);
}

export function configuration() {
  return {
    root: absolute('RESEARCH_DOCS_ROOT', resolve(projectRoot, '..')),
    database: absolute('RESEARCH_DB_PATH', resolve(projectRoot, 'data/summaries.sqlite')),
    models: absolute('RESEARCH_MODEL_CACHE', resolve(projectRoot, 'models')),
  };
}
