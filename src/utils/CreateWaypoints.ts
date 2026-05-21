import { GenerateGraph } from "../ai-sdk/index.js";
import { db } from "../db/db.js";
import { eq, and, inArray } from "drizzle-orm";
import { memories, waypoints } from "../db/schema";
import { uuidv7 } from "uuidv7";
import { searchMemories } from "../hnsw/createHnswIndex";
import { graphIndex } from "./graphIndex";

interface WaypointResult {
    sourceMemoryId: string;
    targetMemoryId: string;
    relation: string | null;
    similarity: number;
}

export async function CreateWaypoints(
    sourceMemoryId: string,
    memory1Content: string,
    userId: string,
    chatId: string,
    embedding: number[]
) {
    const knnResults = searchMemories(embedding, 50);
    if (knnResults.length === 0) {
        return { total: 0, inserted: 0, skipped: 0 };
    }

    const candidateIds = knnResults
        .map((r) => r.memoryId)
        .filter((id) => id !== sourceMemoryId);

    if (candidateIds.length === 0) {
        return { total: 0, inserted: 0, skipped: 0 };
    }

    const dbMemories = await db
        .select({
            id: memories.id,
            content: memories.content,
            createdAt: memories.createdAt,
        })
        .from(memories)
        .where(
            and(
                eq(memories.userId, userId),
                eq(memories.chatId, chatId),
                inArray(memories.id, candidateIds)
            )
        );

    const memoryMap = new Map(dbMemories.map((m) => [m.id, m]));
    const highSimCandidates: { memoryId: string; content: string; createdAt: Date; similarity: number }[] = [];

    for (const r of knnResults) {
        const similarity = 1 - r.distance;
        if (similarity >= 0.50) {
            const m = memoryMap.get(r.memoryId);
            if (m) {
                highSimCandidates.push({
                    memoryId: m.id,
                    content: m.content,
                    createdAt: m.createdAt || new Date(),
                    similarity,
                });
            }
        }
    }

    // Limit potential LLM calls to top 5 to prevent rate limits or latency spikes
    const targetsToProcess = highSimCandidates.slice(0, 5);

    const graphPromises = targetsToProcess.map(async (t): Promise<WaypointResult> => {
        const memory2 = `${t.content}\n AT \n${t.createdAt.toISOString()}`;
        const relation = await GenerateGraph(memory1Content, memory2);
        return {
            sourceMemoryId,
            targetMemoryId: t.memoryId,
            relation: relation === "null" ? null : relation,
            similarity: t.similarity,
        };
    });

    const results = await Promise.all(graphPromises);

    const validWaypoints = results
        .filter((r): r is WaypointResult & { relation: string } => r.relation !== null)
        .map((r) => ({
            id: uuidv7(),
            sourceMemoryId: r.sourceMemoryId,
            targetMemoryId: r.targetMemoryId,
            relationshipType: r.relation,
            strength: r.similarity,
        }));

    if (validWaypoints.length > 0) {
        await db.insert(waypoints).values(validWaypoints);
        for (const wp of validWaypoints) {
            graphIndex.addEdge(chatId, wp.sourceMemoryId, wp.targetMemoryId, wp.strength, wp.relationshipType);
        }
    }

    return {
        total: results.length,
        inserted: validWaypoints.length,
        skipped: results.length - validWaypoints.length
    };
}