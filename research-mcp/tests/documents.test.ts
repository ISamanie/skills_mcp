import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { DIMENSIONS } from '../src/config.js';
import { chunks, Documents, hash } from '../src/documents.js';
import type { Embedder } from '../src/embeddings.js';

// Deterministic vectors test persistence/transactions, not model quality.
const embedder: Embedder = { async embed(texts) {
  return texts.map(text => {
    const vector = Array<number>(DIMENSIONS).fill(0);
    vector[0] = /gpu|tensor|register/i.test(text) ? 1 : 0.1;
    vector[1] = /bread|recipe|baking/i.test(text) ? 1 : 0.1;
    return vector;
  });
} };
const testRoot = fileURLToPath(new URL('../../.test-data/', import.meta.url));
function setup(custom: Embedder = embedder) {
  const root = resolve(testRoot, randomUUID());
  mkdirSync(root, { recursive: true });
  const database = resolve(root, 'vectors.sqlite');
  return { root, database, store: new Documents(root, database, custom) };
}
const save = (request_id: string, extra: Record<string, unknown> = {}) => ({
  action: 'save', request_id, topic: 'GPU architecture', title: 'GPU learning',
  content: 'A tensor transfer engine moves data between GPU memory spaces.', ...extra,
});
async function expectCode(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: any) => error.code === code);
}

test('create, append, preserve manual edits, retry, and reopen a persistent vector database', async () => {
  const { store, root, database } = setup();
  let created: any;
  try {
    created = await store.execute(save('create'));
    assert.equal(created.file_synced, true);
    const first = readFileSync(created.file_path, 'utf8');
    writeFileSync(created.file_path, `${first}\nMy handwritten note.\n`, 'utf8');
    const read = await store.execute({ action: 'read', document_id: created.document_id });
    assert.match(String(read.warning), /changed since indexing/);
    const request = save('append', {
      document_id: created.document_id, expected_hash: read.content_hash,
      content: 'Register pressure reduces occupancy and may require spilling.',
    });
    const appended = await store.execute(request);
    assert.equal(appended.operation, 'appended');
    const file = readFileSync(created.file_path, 'utf8');
    assert.ok(file.startsWith(`${first}\nMy handwritten note.\n`));
    assert.match(file, /Register pressure/);
    await store.execute(request);
    assert.equal(readFileSync(created.file_path, 'utf8'), file, 'a retry appended content twice');
    await expectCode(store.execute({ ...request, content: 'Conflicting retry.' }), 'CONFLICT');
    const search = await store.execute({ action: 'search', query: 'GPU register bottlenecks' });
    assert.equal((search.matches as any[])[0].document_id, created.document_id);
    assert.equal((search.matches as any[])[0].file_changed_since_index, false);
    assert.equal(store.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM revisions').get()!.n, 2);
  } finally { store.close(); }
  const reopened = new Documents(root, database, embedder);
  try {
    const found = await reopened.execute({ action: 'search', query: 'register pressure' });
    assert.equal((found.matches as any[])[0].document_id, created.document_id);
    const text = await reopened.execute({ action: 'read', document_id: created.document_id });
    assert.match(String(text.content), /My handwritten note/);
  } finally { reopened.close(); }
});

test('adding a same-topic document appends to the relevant file and leaves the source intact', async () => {
  const { store, root } = setup();
  try {
    const existing = await store.execute(save('existing'));
    const original = readFileSync(String(existing.file_path), 'utf8');
    const source = resolve(root, 'new-gpu-notes.md');
    const sourceText = '# New GPU notes\nNVLink connects GPUs for communication.\n';
    writeFileSync(source, sourceText);
    const request = { action: 'import', request_id: 'import-related',
      topic: '  GPU   ARCHITECTURE ', title: 'Communication notes',
      file_path: source, expected_hash: existing.content_hash };
    const added = await store.execute(request);
    assert.equal(added.operation, 'appended');
    assert.equal(added.document_id, existing.document_id);
    assert.equal(readFileSync(source, 'utf8'), sourceText);
    const current = readFileSync(String(existing.file_path), 'utf8');
    assert.ok(current.startsWith(original));
    assert.match(current, /NVLink/);
    await store.execute(request);
    assert.equal(readFileSync(String(existing.file_path), 'utf8'), current);
    assert.equal(store.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM documents').get()!.n, 1);
  } finally { store.close(); }
});

test('imports index current file content; reimports omit superseded vectors from search', async () => {
  const { store, root } = setup();
  try {
    const source = resolve(root, 'notes.md');
    writeFileSync(source, '# Notes\nOLD_SENTINEL GPU information.');
    const input = { action: 'import', request_id: 'first', topic: 'GPUs', title: 'Notes', file_path: source };
    const doc = await store.execute(input);
    writeFileSync(source, '# Notes\nNEW_SENTINEL tensor information.');
    const next = await store.execute({ ...input, request_id: 'second' });
    assert.equal(next.operation, 'reindexed');
    assert.equal(next.document_id, doc.document_id);
    const found = await store.execute({ action: 'search', query: 'GPU' });
    assert.ok(!JSON.stringify(found).includes('OLD_SENTINEL'));
    assert.match(JSON.stringify(found), /NEW_SENTINEL/);
    assert.equal(store.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM revisions').get()!.n, 2);
  } finally { store.close(); }
});

test('an existing topic is reused for save and requires its current hash before append', async () => {
  const { store } = setup();
  try {
    const created = await store.execute(save('first'));
    await expectCode(store.execute(save('unsafe', { content: 'More.' })), 'CONFLICT');
    const appended = await store.execute(save('second', { expected_hash: created.content_hash, content: 'More.' }));
    assert.equal(appended.document_id, created.document_id);
    assert.equal(appended.operation, 'appended');
    await expectCode(store.execute(save('stale', { document_id: created.document_id, expected_hash: created.content_hash })), 'CONFLICT');
  } finally { store.close(); }
});

test('embedding failure and concurrent file changes cause no partial database write', async () => {
  const { store, root } = setup({ async embed() { throw new Error('inference failed'); } });
  try {
    await assert.rejects(store.execute(save('fail')), /inference failed/);
    assert.equal(store.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM documents').get()!.n, 0);
    assert.equal(existsSync(resolve(root, 'summaries')), false);
  } finally { store.close(); }
  let onEmbed = () => {};
  const second = setup({ async embed(texts) { onEmbed(); return embedder.embed(texts); } });
  try {
    const existing = await second.store.execute(save('first'));
    onEmbed = () => { writeFileSync(String(existing.file_path), 'User edited during embedding.'); };
    await expectCode(second.store.execute(save('conflict', { document_id: existing.document_id, expected_hash: existing.content_hash })), 'CONFLICT');
    assert.equal(second.store.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM revisions').get()!.n, 1);
    assert.equal(readFileSync(String(existing.file_path), 'utf8'), 'User edited during embedding.');
  } finally { second.store.close(); }
});

test('a database commit with pending file publication can recover after restart without duplication', async () => {
  const { store, root, database } = setup();
  const request = save('recover');
  let filePath: string;
  try {
    // Simulate a disk outage after the database transaction has committed.
    (store as any).publish = () => 'Simulated disk outage.';
    const result = await store.execute(request);
    assert.equal(result.file_synced, false);
    filePath = String(result.file_path);
    assert.equal(existsSync(filePath), false);
    await expectCode(store.execute(save('blocked')), 'PENDING_FILE');
  } finally { store.close(); }
  const reopened = new Documents(root, database, embedder);
  try {
    const recovered = await reopened.execute(request);
    assert.equal(recovered.file_synced, true);
    assert.match(readFileSync(filePath!, 'utf8'), /tensor transfer/);
    const count = reopened.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM revisions').get()!.n;
    await reopened.execute(request);
    assert.equal(reopened.db.prepare<[], { n: number }>('SELECT count(*) AS n FROM revisions').get()!.n, count);
  } finally { reopened.close(); }
});

test('path boundaries, pagination, unknown fields, and empty search are enforced', async () => {
  const { store, root } = setup();
  try {
    assert.deepEqual((await store.execute({ action: 'search', query: 'anything' })).matches, []);
    await expectCode(store.execute({ action: 'import', request_id: 'escape', topic: 'x', title: 'x', file_path: '../outside.md' }), 'INVALID_PATH');
    writeFileSync(resolve(root, '.hidden.md'), 'hidden');
    await expectCode(store.execute({ action: 'import', request_id: 'hidden', topic: 'x', title: 'x', file_path: '.hidden.md' }), 'INVALID_PATH');
    writeFileSync(resolve(root, 'invalid.md'), Buffer.from([0xff]));
    await expectCode(store.execute({ action: 'import', request_id: 'encoding', topic: 'x', title: 'x', file_path: 'invalid.md' }), 'INVALID_ENCODING');
    await assert.rejects(store.execute({ action: 'search', query: 'x', unknown: true }));
    const created = await store.execute(save('create'));
    const read = await store.execute({ action: 'read', document_id: created.document_id, max_chars: 10 });
    assert.equal(String(read.content).length, 10);
    assert.equal(read.next_offset, 10);
    assert.equal(read.content_hash, hash(readFileSync(String(created.file_path), 'utf8')));
    const content = 'Paragraph text with spaces.\n'.repeat(150);
    const pieces = chunks(content);
    assert.ok(pieces.length > 1);
    assert.equal(pieces[0]!.start, 0);
    assert.equal(pieces.at(-1)!.end, content.length);
    pieces.forEach((piece, i) => {
      assert.equal(piece.text, content.slice(piece.start, piece.end));
      assert.ok(piece.text.length <= 700);
      if (i) assert.ok(piece.start < pieces[i - 1]!.end);
    });
  } finally { store.close(); }
});
