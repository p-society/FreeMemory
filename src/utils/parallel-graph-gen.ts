import { GenerateGraph } from "../ai-sdk/index.js";
import { db } from "../db/db";
import { desc, eq } from "drizzle-orm";
import { memories } from "../db/schema";


export async function generateGraphs(memory1: string, userId: string) {
    const mem2 = await db.select().from(memories).where(eq(memories.userId, userId)).orderBy(desc(memories.createdAt)).limit(10);
    const graphPromises = mem2.map(async (m) => {
        const memory2 = `${m.content}\n AT \n${m.createdAt}`;
        return GenerateGraph(memory1, memory2);
    });
    const graphs = await Promise.all(graphPromises);
    console.log(graphs);
    return graphs;
}