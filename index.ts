import { Hono } from "hono";
import routes from './src/routes/index.js';

const hono = new Hono();
hono.route('/api', routes);

export default hono;