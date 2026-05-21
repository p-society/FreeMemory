import { GenerateEmbedding } from "../ai-sdk/index";
import { db } from "../db/db";
import { memories, sectors } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { searchMemories } from "../hnsw/createHnswIndex";
import { HMDDecay } from "./decay";
import { graphIndex } from "./graphIndex";

export interface TraversedEdge {
    targetId: string;
    strength: number;
    relationshipType: string;
}

export interface RetrievalResult {
    id: string;
    content: string;
    score: number;
    similarity: number;
    strength: number;
    sectorId: string | null;
    createdAt: Date;
    relationships: TraversedEdge[];
}

interface GraphPathNode {
    id: string;
    pathStrength: number;
    propagatedSimilarity: number;
    hop: number;
}

/**
 * Retrieves memories using hybrid semantic search and graph-based expansion,
 * scoped to a single user and active chat session.
 */
export async function RetrieveMemories({
    query,
    userId,
    chatId,
    k = 10,
}: {
    query: string;
    userId: string;
    chatId: string;
    k?: number;
}): Promise<RetrievalResult[]> {
    // 1. Generate query embedding
    const queryVector = await GenerateEmbedding(query);

    // 2. Query HNSW index for candidates
    const knnResults = searchMemories(queryVector, 20);
    if (knnResults.length === 0) {
        return [];
    }

    const knnIds = knnResults.map((r) => r.memoryId);

    // 3. Fetch candidate memories from SQLite (filtered by userId and chatId)
    const primaryDbMemories = await db
        .select()
        .from(memories)
        .where(
            and(
                eq(memories.userId, userId),
                eq(memories.chatId, chatId),
                eq(memories.archived, false),
                inArray(memories.id, knnIds)
            )
        );

    if (primaryDbMemories.length === 0) {
        return [];
    }

    const similarityMap = new Map(knnResults.map((r) => [r.memoryId, 1 - r.distance]));
    const allCandidates = new Map<string, { memory: typeof memories.$inferSelect; similarity: number; score: number }>();

    // Calculate score for primary candidates
    for (const memory of primaryDbMemories) {
        const similarity = similarityMap.get(memory.id) || 0.0;
        const score = HMDDecay.calculateQueryScore(memory, similarity);
        allCandidates.set(memory.id, { memory, similarity, score });
    }

    // 4. Graph expansion (Multi-hop traversal up to 2 hops)
    // Start with the top 5 primary candidates
    const sortedPrimary = [...allCandidates.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    const visited = new Map<string, { pathStrength: number; propagatedSimilarity: number }>();
    const queue: GraphPathNode[] = [];

    // Initialize BFS queue with top primary candidates
    for (const item of sortedPrimary) {
        queue.push({
            id: item.memory.id,
            pathStrength: 1.0,
            propagatedSimilarity: item.similarity,
            hop: 0,
        });
        visited.set(item.memory.id, {
            pathStrength: 1.0,
            propagatedSimilarity: item.similarity,
        });
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr.hop >= 2) continue;

        const neighbors = graphIndex.getNeighbors(chatId, curr.id);
        for (const edge of neighbors) {
            const nextPathStrength = curr.pathStrength * edge.strength;
            const nextPropagatedSim = curr.propagatedSimilarity * edge.strength;

            // Only traverse strong paths (strength > 0.3)
            if (nextPathStrength <= 0.3) continue;

            const existing = visited.get(edge.targetId);
            if (!existing || nextPathStrength > existing.pathStrength) {
                visited.set(edge.targetId, {
                    pathStrength: nextPathStrength,
                    propagatedSimilarity: nextPropagatedSim,
                });
                queue.push({
                    id: edge.targetId,
                    pathStrength: nextPathStrength,
                    propagatedSimilarity: nextPropagatedSim,
                    hop: curr.hop + 1,
                });
            }
        }
    }

    // Identify which reached nodes are missing from the loaded candidates
    const missingIds: string[] = [];
    for (const [id] of visited) {
        if (!allCandidates.has(id)) {
            missingIds.push(id);
        }
    }

    // Batch load missing memories
    if (missingIds.length > 0) {
        const missingDbMemories = await db
            .select()
            .from(memories)
            .where(
                and(
                    eq(memories.userId, userId),
                    eq(memories.chatId, chatId),
                    eq(memories.archived, false),
                    inArray(memories.id, missingIds)
                )
            );

        for (const memory of missingDbMemories) {
            const visitData = visited.get(memory.id)!;
            const score = HMDDecay.calculateQueryScore(memory, visitData.propagatedSimilarity);
            allCandidates.set(memory.id, {
                memory,
                similarity: visitData.propagatedSimilarity,
                score: score * visitData.pathStrength,
            });
        }
    }

    // 5. Re-rank and format the results
    const rankedResults = [...allCandidates.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, k);

    const finalResultIds = new Set(rankedResults.map((r) => r.memory.id));

    // Map traversed relationships that connect output memories
    return rankedResults.map((r): RetrievalResult => {
        const rawMemory = r.memory;
        const memoryStrength = HMDDecay.calculateCurrentStrength(rawMemory);

        // Fetch neighbors and filter for target IDs included in the final results list
        const activeNeighbors = graphIndex.getNeighbors(chatId, rawMemory.id)
            .filter((n) => finalResultIds.has(n.targetId))
            .map((n) => ({
                targetId: n.targetId,
                strength: n.strength,
                relationshipType: n.type,
            }));

        return {
            id: rawMemory.id,
            content: rawMemory.content,
            score: r.score,
            similarity: r.similarity,
            strength: memoryStrength,
            sectorId: rawMemory.sectorId,
            createdAt: rawMemory.createdAt || new Date(),
            relationships: activeNeighbors,
        };
    });
}
