import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';
import { addMemory, embeddingToBuffer } from '../hnsw/createHnswIndex';
import { db } from '../db/db'
import { memories, sectors, vectorIndex, decaySchedule } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
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

    const memoryId = uuidv7();

    const [{ label, embedding }, s] = await Promise.all([
        addMemory(content, userId, chatId, userType, memoryId),
        GenerateSectorObject(content, sectorPrompt),
    ]);

    let memory1time;
    await db.transaction(async (tx) => {
        const sectorName = s.name.toLowerCase().trim();
        let sectorId: string;

        const existing = await tx.select()
            .from(sectors)
            .where(eq(sectors.name, sectorName))
            .limit(1);

        if (existing.length > 0 && existing[0]) {
            sectorId = existing[0].id;

            const existingTopics = (existing[0].topics as string[]) || [];
            const newTopics = (s.topics || []).filter(
                (t: string) => !existingTopics.includes(t)
            );
            if (newTopics.length > 0) {
                await tx.update(sectors)
                    .set({ topics: [...existingTopics, ...newTopics] })
                    .where(eq(sectors.id, sectorId));
            }

            await tx.update(sectors)
                .set({
                    lastAccessed: new Date(),
                    memoryCount: sql`${sectors.memoryCount} + 1`,
                })
                .where(eq(sectors.id, sectorId));
        } else {
            const sectorResult = await tx.insert(sectors).values({
                id: uuidv7(),
                name: sectorName,
                lastAccessed: new Date(),
                topics: s.topics,
                memoryCount: 1,
            }).returning();
            sectorId = sectorResult[0]!.id;
        }

        const insertedMemory = await tx.insert(memories).values({
            id: memoryId,
            content,
            userId,
            chatId,
            userType,
            embeddingId: label,
            initialStrength: 0.75,
            sectorId,
        }).returning();
        memory1time = insertedMemory[0]?.createdAt;

        await tx.insert(vectorIndex).values({
            memoryId,
            vectorBytes: embeddingToBuffer(embedding),
            dimension: 768,
        });

        const now = new Date();
        const nextDecay = new Date(now.getTime() + 1 * 60 * 60 * 1000);
        await tx.insert(decaySchedule).values({
            memoryId,
            lastDecayAt: now,
            nextDecayAt: nextDecay,
            decayIntervalHours: 1,
            isActive: true,
        });
    });

    const memory1 = `${content}\n AT \n${memory1time}`;
    CreateWaypoints(memoryId, memory1, userId, chatId)
        .then((stats) => console.log(`[Waypoints] ${stats.inserted}/${stats.total} created for ${memoryId}`))
        .catch((err) => console.error('[Waypoints] Error:', err));

    return c.json({ status: 'ok', memoryId });
});

router.get('/memory/get', (c) => {
    return c.json({ status: 'ok' });
});

export default router;