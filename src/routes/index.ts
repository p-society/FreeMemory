import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';
import { addMemory } from '../hnsw/createHnswIndex';
import { db } from '../db/db'
import { memories, sectors } from '../db/schema';
import { uuidv7 } from "uuidv7";
import { GenerateSectorObject } from '../ai-sdk/index.js';
import { sectorPrompt } from '../constants/index.js';
import { CreateWaypoints } from '../utils/CreateWaypoints.js';

const router = new Hono();

router.post('/memory/add', async (c) => {
    const { userId, chatId, userType, content } = await c.req.json();
    const result = memorySchema.safeParse({ userId, chatId, userType, content });
    if (!result.success) {
        return c.json({ error: result.error.format() }, 400);
    }

    const label = await addMemory(userId, content, chatId, userType);
    const s = await GenerateSectorObject(content, sectorPrompt);

    let sourceMemoryId: string;
    let memory1time;
    await db.transaction(async (tx) => {
        const sectorResult = await tx.insert(sectors).values({
            id: uuidv7(),
            name: s.name,
            lastAccessed: new Date(),
            topics: s.topics
        }).returning();
        const sectorId = sectorResult[0]?.id;
        if (!sectorId) throw new Error('Failed to insert sector');
        const insertedMemory = await tx.insert(memories).values({
            id: uuidv7(),
            content,
            userId,
            chatId,
            userType,
            embeddingId: label,
            initialStrength: 0.75,
            sectorId,
        }).returning();
        sourceMemoryId = insertedMemory[0]!.id;
        memory1time = insertedMemory[0]?.createdAt;
    });
    const memory1 = `${content}\n AT \n${memory1time}`;
    const waypointStats = await CreateWaypoints(sourceMemoryId!, memory1, userId, chatId);
    console.log(waypointStats);

    return c.json({ status: 'ok', waypointStats });
});

router.get('/memory/get', (c) => {
    return c.json({ status: 'ok' });
});

export default router;