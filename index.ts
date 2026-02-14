import { Hono } from "hono";
import routes from './src/routes/index.js';
import { loadIndexFromDB } from './src/hnsw/createHnswIndex';

const hono = new Hono();
hono.route('/api', routes);

// Load HNSW index from vector_index table on startup
loadIndexFromDB().then((count) => {
    console.log(`[Startup] HNSW index ready with ${count} vectors`);
}).catch((err) => {
    console.error('[Startup] Failed to load HNSW index from DB:', err);
});

export default hono;
