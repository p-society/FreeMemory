import { HierarchicalNSW } from 'hnswlib-node';
import { GenerateEmbedding } from '../ai-sdk/index';
import { db } from '../db/db';
import { vectorIndex } from '../db/schema';

const VECTOR_DIMENSION = 768;
const INITIAL_CAPACITY = 10_000;

const hnswIndex = new HierarchicalNSW('cosine', VECTOR_DIMENSION);

let indexInitialized = false;
let nextLabel = 0;

// Maps HNSW label <-> memoryId for bidirectional lookup
const labelToMemoryId = new Map<number, string>();
const memoryIdToLabel = new Map<string, number>();

/**
 * Loads all existing vectors from the vector_index table into the HNSW index.
 * Called once on startup to rebuild the in-memory index from SQLite.
 */
export async function loadIndexFromDB(): Promise<number> {
    const rows = await db.select().from(vectorIndex);

    if (rows.length === 0) {
        hnswIndex.initIndex(INITIAL_CAPACITY);
        indexInitialized = true;
        return 0;
    }

    const capacity = Math.max(INITIAL_CAPACITY, rows.length + 1000);
    hnswIndex.initIndex(capacity);
    indexInitialized = true;

    let loaded = 0;
    for (const row of rows) {
        if (!row.vectorBytes || !row.memoryId) continue;

        const float32 = new Float32Array(
            (row.vectorBytes as Buffer).buffer,
            (row.vectorBytes as Buffer).byteOffset,
            VECTOR_DIMENSION
        );
        const vector = Array.from(float32);

        const label = nextLabel++;
        hnswIndex.addPoint(vector, label);
        labelToMemoryId.set(label, row.memoryId);
        memoryIdToLabel.set(row.memoryId, label);
        loaded++;
    }

    console.log(`[HNSW] Loaded ${loaded} vectors from database`);
    return loaded;
}

function ensureIndexInitialized() {
    if (!indexInitialized) {
        hnswIndex.initIndex(INITIAL_CAPACITY);
        indexInitialized = true;
        return;
    }

    const currentCount = hnswIndex.getCurrentCount();
    const maxElements = hnswIndex.getMaxElements();

    if (currentCount >= maxElements) {
        hnswIndex.resizeIndex(maxElements + INITIAL_CAPACITY);
    }
}

/**
 * Generates an embedding for content and adds it to the HNSW index.
 * Returns the embedding vector so the caller can persist it to vector_index in the same DB transaction.
 */
export async function addMemory(
    content: string,
    userId: string,
    chatId: string,
    userType: string,
    memoryId: string
): Promise<{ label: number; embedding: number[] }> {
    ensureIndexInitialized();

    const embedding = await GenerateEmbedding(content);
    const label = nextLabel++;
    hnswIndex.addPoint(embedding, label);

    labelToMemoryId.set(label, memoryId);
    memoryIdToLabel.set(memoryId, label);

    return { label, embedding };
}

/**
 * Searches the HNSW index for the k nearest neighbors of the given query vector.
 * Returns memoryIds and their distances (cosine distance: 0 = identical, 2 = opposite).
 */
export function searchMemories(
    queryVector: number[],
    k: number = 10
): { memoryId: string; distance: number }[] {
    ensureIndexInitialized();

    const currentCount = hnswIndex.getCurrentCount();
    if (currentCount === 0) return [];

    const numNeighbors = Math.min(k, currentCount);
    const result = hnswIndex.searchKnn(queryVector, numNeighbors);

    const matches: { memoryId: string; distance: number }[] = [];
    for (let i = 0; i < result.neighbors.length; i++) {
        const label = result.neighbors[i]!;
        const distance = result.distances[i]!;
        const memoryId = labelToMemoryId.get(label);
        if (memoryId) {
            matches.push({ memoryId, distance });
        }
    }

    return matches;
}

/**
 * Convert a number[] embedding to a Buffer for storing as BLOB in SQLite.
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
    const float32 = new Float32Array(embedding);
    return Buffer.from(float32.buffer);
}

/**
 * Get the current count of vectors in the index.
 */
export function getIndexCount(): number {
    if (!indexInitialized) return 0;
    return hnswIndex.getCurrentCount();
}