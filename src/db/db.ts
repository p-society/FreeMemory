import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

const sqlite = new Database('memory.db');
export const db = drizzle({
  client: sqlite,
  schema
});

export type DrizzleDB = typeof db;
export default db;