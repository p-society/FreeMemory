import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';
import { addMemory, embeddingToBuffer, getIndexCount } from '../hnsw/createHnswIndex';
import { db } from '../db/db'
import { memories, sectors, vectorIndex, decaySchedule, waypoints, memoryAccessLog } from '../db/schema';
import { eq, sql, and, or } from 'drizzle-orm';
import { uuidv7 } from "uuidv7";
import { GenerateSectorObject } from '../ai-sdk/index.js';
import { sectorPrompt } from '../constants/index.js';
import { CreateWaypoints } from '../utils/CreateWaypoints.js';
import { RetrieveMemories } from '../utils/retrieve';
import { HMDDecay } from '../utils/decay';
import { graphIndex } from '../utils/graphIndex';
import { z } from 'zod';

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
    CreateWaypoints(memoryId, memory1, userId, chatId, embedding)
        .then((stats) => console.log(`[Waypoints] ${stats.inserted}/${stats.total} created for ${memoryId}`))
        .catch((err) => console.error('[Waypoints] Error:', err));

    return c.json({ status: 'ok', memoryId });
});

router.post('/memory/query', async (c) => {
    const body = await c.req.json();
    const result = z.object({
        query: z.string().min(1),
        userId: z.string().uuid(),
        chatId: z.string().uuid(),
        k: z.number().optional().default(10)
    }).safeParse(body);

    if (!result.success) {
        return c.json({ error: result.error.format() }, 400);
    }

    const { query, userId, chatId, k } = result.data;
    const results = await RetrieveMemories({ query, userId, chatId, k });

    if (results.length > 0) {
        await db.transaction(async (tx) => {
            for (const r of results) {
                const [mem] = await tx.select().from(memories).where(eq(memories.id, r.id)).limit(1);
                if (!mem) continue;

                const oldStrength = mem.strength;
                const newStrength = HMDDecay.reinforceMemory(mem, 0.15);

                await tx.update(memories)
                    .set({
                        accessCount: (mem.accessCount || 0) + 1,
                        strength: newStrength,
                        lastAccessed: new Date()
                    })
                    .where(eq(memories.id, r.id));

                await tx.insert(memoryAccessLog).values({
                    memoryId: r.id,
                    accessType: 'query',
                    queryContext: query,
                    strengthBefore: oldStrength,
                    strengthAfter: newStrength,
                    accessedAt: new Date()
                });

                for (const rel of r.relationships) {
                    const newEdgeStrength = Math.min(1.0, rel.strength + 0.05);
                    await tx.update(waypoints)
                        .set({ strength: newEdgeStrength })
                        .where(
                            or(
                                and(eq(waypoints.sourceMemoryId, r.id), eq(waypoints.targetMemoryId, rel.targetId)),
                                and(eq(waypoints.sourceMemoryId, rel.targetId), eq(waypoints.targetMemoryId, r.id))
                            )
                        );
                    graphIndex.updateEdgeStrength(chatId, r.id, rel.targetId, newEdgeStrength);
                }
            }
        });
    }

    return c.json({ results });
});

router.get('/memory/get/:id', async (c) => {
    const id = c.req.param('id');
    const [memory] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    if (!memory) {
        return c.json({ error: 'Memory not found' }, 404);
    }

    let sector = null;
    if (memory.sectorId) {
        const [sec] = await db.select().from(sectors).where(eq(sectors.id, memory.sectorId)).limit(1);
        sector = sec || null;
    }

    const wps = await db.select().from(waypoints).where(
        or(
            eq(waypoints.sourceMemoryId, id),
            eq(waypoints.targetMemoryId, id)
        )
    );

    return c.json({ memory, sector, waypoints: wps });
});

router.delete('/memory/:id', async (c) => {
    const id = c.req.param('id');
    const [memory] = await db.select().from(memories).where(eq(memories.id, id)).limit(1);
    if (!memory) {
        return c.json({ error: 'Memory not found' }, 404);
    }
    await db.update(memories).set({ archived: true }).where(eq(memories.id, id));
    graphIndex.removeMemory(memory.chatId, id);
    return c.json({ status: 'ok' });
});

router.get('/memory/all', async (c) => {
    const userId = c.req.query('userId');
    const sectorId = c.req.query('sectorId');
    const archivedStr = c.req.query('archived');
    const limitStr = c.req.query('limit');
    const offsetStr = c.req.query('offset');

    const archived = archivedStr === 'true';
    const limit = limitStr ? Math.min(100, Math.max(1, parseInt(limitStr, 10))) : 20;
    const offset = offsetStr ? Math.max(0, parseInt(offsetStr, 10)) : 0;

    const conditions = [eq(memories.archived, archived)];
    if (userId) {
        conditions.push(eq(memories.userId, userId));
    }
    if (sectorId) {
        conditions.push(eq(memories.sectorId, sectorId));
    }

    const whereClause = and(...conditions);
    const [memList, countResult] = await Promise.all([
        db.select()
            .from(memories)
            .where(whereClause)
            .orderBy(sql`${memories.createdAt} DESC`)
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(${memories.id})` })
            .from(memories)
            .where(whereClause)
    ]);

    const total = countResult[0]?.count || 0;
    return c.json({ memories: memList, total });
});

router.get('/sectors', async (c) => {
    const results = await db.select({
        id: sectors.id,
        name: sectors.name,
        topics: sectors.topics,
        memoryCount: sql<number>`count(${memories.id})`,
        averageStrength: sql<number>`avg(${memories.strength})`
    })
    .from(sectors)
    .leftJoin(memories, and(eq(memories.sectorId, sectors.id), eq(memories.archived, false)))
    .groupBy(sectors.id);

    return c.json({ sectors: results });
});

router.get('/health', async (c) => {
    const [memoriesCount, activeCount, sectorsCount, waypointsCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(memories),
        db.select({ count: sql<number>`count(*)` }).from(memories).where(eq(memories.archived, false)),
        db.select({ count: sql<number>`count(*)` }).from(sectors),
        db.select({ count: sql<number>`count(*)` }).from(waypoints)
    ]);

    const indexCount = getIndexCount();
    return c.json({
        version: '1.0.0',
        indexCount,
        dbStats: {
            totalMemories: memoriesCount[0]?.count || 0,
            activeMemories: activeCount[0]?.count || 0,
            totalSectors: sectorsCount[0]?.count || 0,
            totalWaypoints: waypointsCount[0]?.count || 0
        }
    });
});

router.get('/chats', async (c) => {
    const results = await db.select({
        chatId: memories.chatId,
        count: sql<number>`count(${memories.id})`
    })
    .from(memories)
    .where(eq(memories.archived, false))
    .groupBy(memories.chatId);

    return c.json({ chats: results });
});

router.get('/graph/:chatId', async (c) => {
    const chatId = c.req.param('chatId');

    const activeMemories = await db.select()
        .from(memories)
        .where(and(eq(memories.chatId, chatId), eq(memories.archived, false)));

    const memoryIds = activeMemories.map((m) => m.id);

    if (memoryIds.length === 0) {
        return c.json({ nodes: [], edges: [] });
    }

    const activeEdges = await db.select({
        id: waypoints.id,
        source: waypoints.sourceMemoryId,
        target: waypoints.targetMemoryId,
        strength: waypoints.strength,
        type: waypoints.relationshipType
    })
    .from(waypoints)
    .innerJoin(memories, eq(waypoints.sourceMemoryId, memories.id))
    .where(and(
        eq(memories.chatId, chatId),
        eq(memories.archived, false)
    ));

    const idSet = new Set(memoryIds);
    const filteredEdges = activeEdges.filter(
        (e) => idSet.has(e.source) && idSet.has(e.target)
    );

    return c.json({
        nodes: activeMemories,
        edges: filteredEdges
    });
});

export default router;