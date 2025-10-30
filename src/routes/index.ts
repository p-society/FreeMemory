import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';
import { addMemory } from '../hnsw/createHnswIndex';

const router = new Hono();

router.post('/memory/add', async (c) => {
    const { userId, chatId, userType, content } = await c.req.json();
    const result = memorySchema.safeParse({ userId, chatId, userType, content });
    if (!result.success) {
        return c.json({ error: result.error.format() }, 400);
    }
    try {
        const r = await addMemory(userId, content, chatId, userType);
    } catch (err) {
        return c.json({ error: err }, 400);
    }
});

router.get('/memory/get', (c) => {
    return c.json({ status: 'ok' });
});

export default router;