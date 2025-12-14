import { GenerateGraph } from "../ai-sdk/index.js";
import { db } from "../db/db.js";
import { desc, eq, and, ne } from "drizzle-orm";
import { memories, waypoints } from "../db/schema";
import { uuidv7 } from "uuidv7";

interface WaypointResult {
    sourceMemoryId: string;
    targetMemoryId: string;
    relation: string | null;
}

export async function CreateWaypoints(
    sourceMemoryId: string,
    memory1Content: string,
    userId: string,
    chatId: string
) {
    const [perchatMemories, normalMemories] = await Promise.all([
        db.select().from(memories)
            .where(and(eq(memories.userId, userId), eq(memories.chatId, chatId)))
            .orderBy(desc(memories.createdAt))
            .limit(10),
        db.select().from(memories)
            .where(and(eq(memories.userId, userId), ne(memories.chatId, chatId)))
            .orderBy(desc(memories.createdAt))
            .limit(10)
    ]);

    const allMemories = [...perchatMemories, ...normalMemories];

    const graphPromises = allMemories.map(async (m): Promise<WaypointResult> => {
        const memory2 = `${m.content}\n AT \n${m.createdAt}`;
        const relation = await GenerateGraph(memory1Content, memory2);
        return {
            sourceMemoryId,
            targetMemoryId: m.id,
            relation: relation === "null" ? null : relation
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
            strength: 0.8,
        }));

    if (validWaypoints.length > 0) {
        db.insert(waypoints).values(validWaypoints)
            .then(() => console.log(`Inserted ${validWaypoints.length} waypoints`))
            .catch((err) => console.error("Waypoint insertion error:", err));
    }

    return {
        total: results.length,
        inserted: validWaypoints.length,
        skipped: results.length - validWaypoints.length
    };
}