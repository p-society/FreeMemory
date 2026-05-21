import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from './src/routes/index.js';
import { loadIndexFromDB } from './src/hnsw/createHnswIndex';
import { graphIndex } from './src/utils/graphIndex';

const hono = new Hono();
hono.use('*', cors());
hono.route('/api', routes);

// Load indices on startup
Promise.all([
    loadIndexFromDB().then((count) => {
        console.log(`[Startup] HNSW index ready with ${count} vectors`);
    }),
    graphIndex.loadFromDB().then((count) => {
        console.log(`[Startup] Graph index ready with ${count} edges`);
    })
]).then(() => {
    // Schedule background waypoint pruning job every 24 hours
    setInterval(() => {
        graphIndex.pruneWaypoints()
            .then((count) => {
                if (count > 0) console.log(`[Scheduler] Pruned ${count} weak waypoints`);
            })
            .catch((err) => console.error('[Scheduler] Waypoint pruning error:', err));
    }, 24 * 60 * 60 * 1000);
}).catch((err) => {
    console.error('[Startup] Failed to load indices from DB:', err);
});

export default hono;
