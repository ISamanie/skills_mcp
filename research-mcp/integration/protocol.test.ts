import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
async function connect(root: string) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env.RESEARCH_DOCS_ROOT = root;
  env.RESEARCH_DB_PATH = resolve(root, 'vectors.sqlite');
  env.RESEARCH_MODEL_CACHE = resolve(project, 'models');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve(project, 'dist/index.js')], cwd: project, env, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  const client = new Client({ name: 'research-mcp-integration', version: '0.1.0' });
  try { await client.connect(transport); }
  catch (error) { await transport.close(); throw error; }
  return { client, stderr: () => stderr };
}
async function call(client: Client, request: Record<string, unknown>) {
  const result = await client.callTool({ name: 'research_documents', arguments: { request } });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent as Record<string, any>;
}

test('real local embeddings work through MCP; add-to-topic appends and persists across server restart', { timeout: 120000 }, async () => {
  const root = resolve(project, '.test-data', `real-model-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  const first = await connect(root);
  let gpu: Record<string, any>;
  try {
    assert.deepEqual((await first.client.listTools()).tools.map(tool => tool.name), ['research_documents']);
    gpu = await call(first.client, { action: 'save', request_id: 'gpu-create',
      topic: 'GPU architecture', title: 'Tensor transfers',
      content: 'A tensor memory accelerator copies multidimensional arrays from device global memory into on-chip shared memory asynchronously. The programmer can overlap data movement and arithmetic.' });
    await call(first.client, { action: 'save', request_id: 'bread-create',
      topic: 'Baking', title: 'Bread dough', content: 'Yeast ferments sugar in dough. Bread rises as fermentation produces carbon dioxide. Kneading develops gluten before baking in a hot oven.' });
    const search = await call(first.client, { action: 'search', query: 'Which hardware transfers tensors to the GPU scratchpad while computation continues?', limit: 2 });
    assert.equal(search.matches[0].document_id, gpu.document_id, JSON.stringify(search));
    assert.equal(search.matches[0].file_changed_since_index, false);
    assert.ok(search.matches[0].distance < search.matches[1].distance);
    assert.ok(search.matches[0].passage.length <= 700);
    const source = resolve(root, 'registers.md');
    const incoming = '# Register pressure\nRegister allocation limits the number of resident warps. Spilling can increase memory traffic.\n';
    writeFileSync(source, incoming);
    const original = readFileSync(gpu.file_path, 'utf8');
    const request = { action: 'import', request_id: 'add-related', file_path: source,
      topic: 'GPU architecture', title: 'Register pressure', expected_hash: gpu.content_hash };
    const updated = await call(first.client, request);
    assert.equal(updated.operation, 'appended');
    assert.equal(updated.document_id, gpu.document_id);
    assert.equal(updated.file_synced, true);
    assert.ok(readFileSync(gpu.file_path, 'utf8').startsWith(original));
    assert.equal(readFileSync(source, 'utf8'), incoming);
    const beforeRetry = readFileSync(gpu.file_path, 'utf8');
    await call(first.client, request);
    assert.equal(readFileSync(gpu.file_path, 'utf8'), beforeRetry);
    for (const invalid of [ { action: 'search', query: 'x', limit: 99 }, { action: 'read', document_id: gpu.document_id, unexpected: true } ]) {
      let rejected = false;
      try { rejected = Boolean((await first.client.callTool({ name: 'research_documents', arguments: { request: invalid } })).isError); }
      catch { rejected = true; }
      assert.ok(rejected, 'invalid request accepted');
    }
    assert.equal(first.stderr(), '', 'diagnostic output during successful operation');
  } finally { await first.client.close(); }
  const second = await connect(root);
  try {
    const recalled = await call(second.client, { action: 'search', query: 'How does register allocation limit resident warps?', limit: 1 });
    assert.equal(recalled.matches[0].document_id, gpu!.document_id);
    assert.match(recalled.matches[0].passage, /Register allocation/);
    const read = await call(second.client, { action: 'read', document_id: gpu!.document_id });
    assert.match(read.content, /tensor memory accelerator/);
    assert.match(read.content, /Register pressure/);
    assert.equal(second.stderr(), '');
  } finally { await second.client.close(); }
});
