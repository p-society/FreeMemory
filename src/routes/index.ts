import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';
import { addMemory } from '../hnsw/createHnswIndex';
import { db } from '../db/db'
import { memories } from '../db/schema';
import { uuidv7 } from "uuidv7";
import {GenerateText} from '../ai-sdk/index.js';
import { sectorPrompt } from '../constants/index.js';

const router = new Hono();

router.post('/memory/add', async (c) => {
    const { userId, chatId, userType, content } = await c.req.json();
    const result = memorySchema.safeParse({ userId, chatId, userType, content });
    if (!result.success) {
        return c.json({ error: result.error.format() }, 400);
    }  

    const label = await addMemory(userId, content, chatId, userType);
    const sector = await GenerateText(content, sectorPrompt);
        await db.insert(memories).values({
            id: uuidv7(),
            content,
            userId,
            chatId,
            userType,
            embeddingId: label,
            initialStrength: 0.75,
            sectorId: 'programming',
            metadata: { type: 'problem', difficulty: 'advanced' }
        })

});

router.get('/memory/get', (c) => {
    return c.json({ status: 'ok' });
});

export default router;