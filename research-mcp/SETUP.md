# Research summary MCP server

One local MCP tool, `research_documents`, stores Markdown learning summaries and searches their passages by semantic similarity. It uses real 384-dimensional MiniLM sentence embeddings and a persistent SQLite vector database powered by `sqlite-vec`. No API key or external document service is required. Initial setup downloads public packages and model weights; normal server calls load the cached model and compute embeddings locally without uploading document text.

## Install and run

Requirements: Node.js 24+, pnpm 11.25.0, Windows x64 for the binaries verified on this machine. Dependency versions are pinned in `package.json` and `pnpm-lock.yaml`.

In PowerShell, from this directory:

```powershell
& .\scripts\pnpm.ps1 install --frozen-lockfile
& .\scripts\pnpm.ps1 run build
& .\scripts\pnpm.ps1 run prepare-model
& .\scripts\pnpm.ps1 run check
& .\scripts\pnpm.ps1 test
& .\scripts\pnpm.ps1 run test:integration
```

The wrapper keeps downloads and temporary data on D:. Use a PowerShell environment that permits local scripts; alternatively run the same `pnpm` commands directly with your temporary/cache directories on a drive with space. The model is pinned to `Xenova/all-MiniLM-L6-v2` revision `751bff37182d3f1213fa05d7196b954e230abad9`, q8 CPU inference, mean pooling, and normalization. `prepare-model` downloads/caches it; the MCP server itself uses `local_files_only: true` and does not silently download missing models.

Start with `pnpm start`. The server waits for messages on stdin; this is normal. Protocol messages alone go to stdout, and errors go to stderr.

Defaults are independent of the shell's current directory:

- Document root: the parent `hw8_v2` directory. New files go in `hw8_v2/summaries/`.
- Vector database: `research-mcp/data/summaries.sqlite`.
- Model cache: `research-mcp/models/`.

Override these with absolute `RESEARCH_DOCS_ROOT`, `RESEARCH_DB_PATH`, and `RESEARCH_MODEL_CACHE` environment variables. Imports and edits are limited to regular UTF-8 `.md`/`.markdown` files inside the document root; hidden paths and paths resolving outside the root are rejected. Place an existing summary inside that root before importing it, or intentionally configure a different root.

## Registration and skill routing

`examples/codex-config.toml` contains this machine's verified absolute paths. On another machine, change the Node executable and project paths. Merge the server table into your existing `~/.codex/config.toml`, preserving other settings. `scripts/register.ps1` performs that merge on this machine and updates the previously installed research skill. It saves backups under `.temp/`, refuses a duplicate `research_mcp` registration, and does not change any other server table.

After registration, restart/reconnect Codex if necessary. Confirm `research_mcp` exposes `research_documents`. The updated `research-skill` instructs the assistant to call the tool for summary docs, study sheets, prior-summary retrieval, and requests to add a summary/MCP doc to the database. The server cannot force an assistant to make a call; the skill and tool description supply the routing instructions. It does not monitor chats or access conversations that were never saved.

## One tool, four actions

Every call has an outer `request` object. Examples below are arguments to `research_documents`.

Search relevant passages without loading all documents:

```json
{"request":{"action":"search","query":"GPU register pressure and occupancy","limit":5}}
```

Read a selected document before updating it:

```json
{"request":{"action":"read","document_id":"RETURNED_DOCUMENT_ID","max_chars":8000}}
```

Create a new summary when none of the existing documents is relevant:

```json
{"request":{"action":"save","request_id":"gpu-summary-unique-1","topic":"GPU architecture","title":"GPU learning summary","content":"## Main ideas\n...\n\n## Sticking points\n...\n\n## Sources and verification\n..."}}
```

When new content belongs to a relevant existing summary, use `save` with `document_id` and the latest read's `content_hash` as `expected_hash`. `content` contains just the new material. Existing text, including handwritten edits, is preserved exactly, then a dated update is appended and the complete current document is re-embedded.

Add an existing Markdown document:

```json
{"request":{"action":"import","request_id":"import-gpu-unique-1","file_path":"summaries/my-gpu-notes.md","topic":"GPU architecture","title":"GPU notes"}}
```

Adding a document also checks relevance. The assistant searches and reads first. If the source belongs in an existing summary, `import` accepts that target's `document_id` and `expected_hash`, appends the source content there, and leaves the source file intact. A case/whitespace-insensitive exact topic match is reused automatically. If that implicit target needs a hash, a conflict response supplies its ID so the assistant can read and retry; the user does not need to request an edit separately. Different topic labels can still merge when the assistant selects a relevant target. Similarity alone does not prove that topics belong together. Reimporting the indexed file itself refreshes its vectors without appending it to itself.

An explicit request to update a summary uses the same append workflow. The tool has no replace or file-deletion operation.

## Correctness and limits

- Mutations require unique `request_id` values. Reuse an ID with identical arguments for a retry; a conflicting reuse is rejected. Reimport changed source material with a new ID.
- Existing-target appends require the current file hash. External file changes during embedding cause a conflict before the database changes. The assistant should read again and prepare a fresh request.
- Each revision retains its full text and passage vectors. Search joins only the current revision, so superseded passages do not leak into results. There is no automatic deletion or cleanup.
- Database content and vectors commit atomically before file publication. If file writing fails, the result explicitly says `file_synced: false`. Retry the same request after addressing the reported condition. A pending target blocks further updates. A changed file is never overwritten to resolve a conflict.
- Search uses exact cosine-distance calculations through `sqlite-vec` over the current passages. This is real vector retrieval, with a full scan appropriate to a small personal notebook rather than an approximate large-scale index. Lower distance means greater similarity; the assistant must judge relevance. Up to 10 passages, each at most 700 characters, are returned.
- Read responses are paginated (default 8,000, maximum 20,000 characters). Follow `next_offset` to continue. A manually edited file is flagged as changed since indexing; reimport it to refresh vectors.
- Maximum full document: 512,000 UTF-8 bytes. Generated additions: 100,000 characters. Topic/title: 200 characters. Query: 2,000 characters. Unknown or mismatched fields are rejected.
- The server stores text and retrieves it; the assistant writes summaries, chooses related topics, and checks sources. Stored statements are not automatically verified truth. No raw chat history is imported automatically.

## Validation and HW8 scope

Unit tests exercise preservation, same-topic automatic additions, idempotency, conflict detection, persistence, publication recovery, path constraints, pagination, and exclusion of old vectors. The integration test uses a real SDK client over stdio and the real cached MiniLM model to save GPU and baking summaries, rank a GPU query, merge a related document, and retrieve the result after restarting the server. Test documents are synthetic fixtures kept in isolated `.test-data/` directories; they are not claims of completed student demonstrations.

The first integration attempt exposed an actual offline-model configuration failure: local-only loading had been combined with `allowLocalModels: false`. Enabling local model loading and using the configured cache fixed it; the real-model test then passed. This is an implementation finding, not evidence of the assignment's separate skill-failure requirement.

The [HW8 assignment](https://www.cs.cmu.edu/~113/hw8.html) also requires a checker skill run in a separate fresh session, two demonstrations on real work, prompt-log evidence, a documented skill failure/revision, and the student's submission write-up. The current research skill guides learning and summary creation; it does not by itself meet the checker requirement. This implementation and its synthetic tests do not establish that the full assignment is complete.

Implementation references: [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [sqlite-vec Node integration](https://alexgarcia.xyz/sqlite-vec/js.html), [MiniLM model usage](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [Codex MCP registration](https://learn.chatgpt.com/docs/extend/mcp). The SDK is pinned to the locally verified 2.4.0 API (`StdioServerTransport`); current online examples may use a newer `serveStdio` API.
