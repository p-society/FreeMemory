import { Hono } from 'hono';
import { memorySchema } from '../dtos/main.dto.js';

const router = new Hono();

router.post('/memory', async (c) => {
    const { userId, chatId, userRole, content } = await c.req.json();
    const result = memorySchema.safeParse({ userId, chatId, userRole, content });
    if (!result.success) {
        return c.json({ error: result.error.format() }, 400);
    }
});

export default router;