# FreeMemory - Basic Todo

The goal: **similarity search + graph hopping + decay = working product**.
Then MCP server + plugins for different harnesses.

---

## DONE

- [x] Memory add endpoint (`POST /api/memory/add`)
- [x] Embedding generation (Google text-embedding-004, 768d)
- [x] HNSW index (add + search + persistence from SQLite)
- [x] Sector classification via LLM (reuses existing sectors)
- [x] Waypoint creation via LLM (fire-and-forget)
- [x] Decay schedule row on memory add
- [x] Sector memory_count tracking
- [x] Vector bytes stored in `vector_index` table
- [x] HNSW index rebuilt from DB on startup
- [x] DB schema (7 tables, indexes, constraints, relations)
- [x] HMD v2 decay algorithm (implemented, not wired into retrieval yet)
- [x] Parallel embedding + sector classification during add
- [x] Dockerfile + docker-compose

---

## Phase 1: Fix Waypoint Creation (make it fast + smart)

Current: 20 LLM calls per memory add. Slow, expensive, noisy.
Target: HNSW similarity first, LLM only for high-sim pairs.

- [x] **Rewrite `CreateWaypoints` to use embedding similarity**
  - HNSW search for top-10 similar memories to the new one (instant, ~1ms)
  - Filter: only pairs with cosine similarity >= 0.70
  - For remaining (typically 2-5): LLM call to get relationship TYPE
  - Waypoint strength = actual similarity score (not flat 0.8)
  - LLM fallback only for high-similarity pairs, not every memory

- [x] **Build in-memory adjacency map for graph traversal**
  - On startup: load all waypoints into a `Map<memoryId, [{targetId, strength, type}]>`
  - Query BOTH directions (source and target) since connection is implicit bidirectional
  - Update map when new waypoints are inserted
  - Graph traversal becomes Map lookups (microseconds, no DB queries)

---

## Phase 2: Retrieval Pipeline (the core)

- [x] **Build the retrieval function** (`src/utils/retrieve.ts`)
  ```
  query -> embed -> HNSW top-K -> hydrate from DB -> decay score -> graph expand -> rank -> return
  ```
  Steps:
  1. `GenerateEmbedding(query)` -> query vector
  2. `searchMemories(vector, k=20)` -> candidate memoryIds + distances
  3. Fetch full memory rows from DB (batch by IDs)
  4. `HMDDecay.calculateQueryScore(memory, similarity)` for each
  5. Graph expand: for each top result, follow waypoints 1-2 hops via adjacency map
     - Hop score = parent_score * waypoint_strength
     - Only follow if hop score > 0.3
     - Deduplicate
  6. Re-rank all results by composite score
  7. Return top-K

- [x] **Wire reinforcement on retrieval**
  - `HMDDecay.reinforceMemory()` for accessed memories
  - Update `access_count`, `last_accessed` in DB
  - Boost waypoint strength by +0.05 for traversed edges
  - Log to `memory_access_log`

- [x] **`POST /api/memory/query`** endpoint
  - Input: `{ query, userId, k?, filters? }`
  - Returns: `{ results: [{ id, content, score, similarity, strength, sector, relationships }] }`

- [x] **`GET /api/memory/get/:id`** endpoint
  - Returns single memory with full details (sector, waypoints, decay info)

---

## Phase 3: Essential CRUD

- [x] `DELETE /api/memory/:id` (soft delete -> set archived=true)
- [x] `GET /api/memory/all` (paginated list, filter by userId/sector/archived)
- [x] `GET /api/sectors` (list sectors with stats: count, avg strength)
- [x] `GET /api/health` (version, index count, DB stats)

---

## Phase 4: Decay Scheduler

- [ ] Background job: runs every hour
  - Query `decay_schedule` where `next_decay_at <= now`
  - `HMDDecay.batchUpdateStrengths()` for due memories
  - Archive memories below threshold (strength < 0.1)
  - Update `next_decay_at`
- [x] Waypoint pruning: every 24h, remove waypoints with strength < 0.05

---

## Phase 5: MCP Server + Plugins

- [ ] MCP server wrapper around the REST API
  - Tools: `memory_store`, `memory_query`, `memory_forget`, `memory_profile`
  - Works with Claude Desktop, Cursor, etc.
- [ ] OpenClaw plugin (replace supermemory.ai with our local API)
- [ ] LangChain/LangGraph integration
- [ ] Python SDK
- [ ] JS/TS SDK

---

## Future (post-MVP)

- Memory consolidation (merge similar memories periodically)
- Importance scoring at ingestion via LLM
- Contradiction detection + resolution
- User profile extraction from high-strength memories
- Multi-provider embeddings (OpenAI, Ollama, local)
- Document ingestion (PDF, DOCX, URL)
- Per-user decay calibration
