import { Hono } from 'hono';

const router = new Hono();

router.post('/memory', async (c) => {
    // Handle POST /memory
});

export default router;