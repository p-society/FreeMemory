import { db } from "../db/db";
import { waypoints, memories } from "../db/schema";
import { eq, lt } from "drizzle-orm";

interface GraphEdge {
    targetId: string;
    strength: number;
    type: string;
}

/**
 * In-memory index of memory relationships, segmented by chatId for security and fast traversal.
 */
class InMemoryGraphIndex {
    private adjacencyMap = new Map<string, Map<string, GraphEdge[]>>();

    /**
     * Loads all waypoints from SQLite and populates the in-memory map.
     */
    async loadFromDB(): Promise<number> {
        const rows = await db
            .select({
                sourceId: waypoints.sourceMemoryId,
                targetId: waypoints.targetMemoryId,
                strength: waypoints.strength,
                type: waypoints.relationshipType,
                chatId: memories.chatId,
            })
            .from(waypoints)
            .innerJoin(memories, eq(waypoints.sourceMemoryId, memories.id))
            .where(eq(memories.archived, false));

        let count = 0;
        for (const row of rows) {
            this.addEdge(row.chatId, row.sourceId, row.targetId, row.strength, row.type);
            count++;
        }
        return count;
    }

    /**
     * Adds a bidirectional relationship to the in-memory map.
     */
    addEdge(chatId: string, sourceId: string, targetId: string, strength: number, type: string) {
        if (!this.adjacencyMap.has(chatId)) {
            this.adjacencyMap.set(chatId, new Map());
        }

        const chatMap = this.adjacencyMap.get(chatId)!;

        if (!chatMap.has(sourceId)) {
            chatMap.set(sourceId, []);
        }
        chatMap.get(sourceId)!.push({ targetId, strength, type });

        if (!chatMap.has(targetId)) {
            chatMap.set(targetId, []);
        }
        chatMap.get(targetId)!.push({ targetId: sourceId, strength, type });
    }

    /**
     * Updates an edge strength in the in-memory map in both directions.
     */
    updateEdgeStrength(chatId: string, sourceId: string, targetId: string, strength: number) {
        const chatMap = this.adjacencyMap.get(chatId);
        if (!chatMap) return;

        const sourceEdges = chatMap.get(sourceId);
        if (sourceEdges) {
            const edge = sourceEdges.find((e) => e.targetId === targetId);
            if (edge) edge.strength = strength;
        }

        const targetEdges = chatMap.get(targetId);
        if (targetEdges) {
            const edge = targetEdges.find((e) => e.targetId === sourceId);
            if (edge) edge.strength = strength;
        }
    }

    /**
     * Removes an edge in both directions.
     */
    removeEdge(chatId: string, sourceId: string, targetId: string) {
        const chatMap = this.adjacencyMap.get(chatId);
        if (!chatMap) return;

        const sourceEdges = chatMap.get(sourceId);
        if (sourceEdges) {
            chatMap.set(sourceId, sourceEdges.filter((e) => e.targetId !== targetId));
        }

        const targetEdges = chatMap.get(targetId);
        if (targetEdges) {
            chatMap.set(targetId, targetEdges.filter((e) => e.targetId !== sourceId));
        }
    }

    /**
     * Removes all edges associated with a memory ID in both directions from the in-memory map.
     */
    removeMemory(chatId: string, memoryId: string) {
        const chatMap = this.adjacencyMap.get(chatId);
        if (!chatMap) return;

        const neighbors = chatMap.get(memoryId) || [];
        chatMap.delete(memoryId);

        for (const n of neighbors) {
            const targetEdges = chatMap.get(n.targetId);
            if (targetEdges) {
                chatMap.set(n.targetId, targetEdges.filter((e) => e.targetId !== memoryId));
            }
        }
    }

    /**
     * Gets all edges connected to a memory.
     */
    getNeighbors(chatId: string, memoryId: string): GraphEdge[] {
        return this.adjacencyMap.get(chatId)?.get(memoryId) || [];
    }

    /**
     * Clears all in-memory graph data.
     */
    clear() {
        this.adjacencyMap.clear();
    }

    /**
     * Deletes weak waypoints (strength < 0.05) from the database and updates the in-memory map.
     */
    async pruneWaypoints(): Promise<number> {
        const deleted = await db
            .delete(waypoints)
            .where(lt(waypoints.strength, 0.05))
            .returning();

        if (deleted.length > 0) {
            this.clear();
            await this.loadFromDB();
        }
        return deleted.length;
    }
}

export const graphIndex = new InMemoryGraphIndex();
