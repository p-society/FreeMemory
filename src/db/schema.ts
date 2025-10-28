import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  index,
  check
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  embeddingId: integer('embedding_id'),
  strength: real('strength').notNull().default(0.8),
  decayRate: real('decay_rate').notNull().default(0.95),
  initialStrength: real('initial_strength').notNull(),
  accessCount: integer('access_count').default(0),
  reinforcementCount: integer('reinforcement_count').default(0),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }).default(new Date()),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  sectorId: text('sector_id'),
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  strengthIdx: index('idx_memories_strength').on(table.strength),
  sectorIdx: index('idx_memories_sector').on(table.sectorId),
  lastAccessedIdx: index('idx_memories_last_accessed').on(table.lastAccessed),
  createdAtIdx: index('idx_memories_created').on(table.createdAt),
  sectorStrengthIdx: index('idx_memories_sector_strength').on(table.sectorId, table.strength),
  decayIdx: index('idx_memories_decay').on(table.lastAccessed, table.decayRate),
  strengthCheck: check('strength_check', sql`${table.strength} >= 0.0 AND ${table.strength} <= 1.0`),
  decayRateCheck: check('decay_rate_check', sql`${table.decayRate} >= 0.85 AND ${table.decayRate} <= 0.99`),
  initialStrengthCheck: check('initial_strength_check', sql`${table.initialStrength} >= 0.0 AND ${table.initialStrength} <= 1.0`),
}));

export const sectors = sqliteTable('sectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  decayMultiplier: real('decay_multiplier').default(1.0),
  memoryCount: integer('memory_count').default(0),
  topics: text('topics', { mode: 'json' }),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  parentIdx: index('idx_sectors_parent').on(table.parentId),
  nameIdx: index('idx_sectors_name').on(table.name),
  lastAccessedIdx: index('idx_sectors_last_accessed').on(table.lastAccessed),
}));

export const waypoints = sqliteTable('waypoints', {
  id: text('id').primaryKey(),
  sourceMemoryId: text('source_memory_id').notNull(),
  targetMemoryId: text('target_memory_id').notNull(),
  relationshipType: text('relationship_type').notNull(),
  strength: real('strength').notNull().default(0.8),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  metadata: text('metadata', { mode: 'json' }),
}, (table) => ({
  sourceIdx: index('idx_waypoints_source').on(table.sourceMemoryId),
  targetIdx: index('idx_waypoints_target').on(table.targetMemoryId),
  strengthIdx: index('idx_waypoints_strength').on(table.strength),
  typeIdx: index('idx_waypoints_type').on(table.relationshipType),
  compositeIdx: index('idx_waypoints_composite').on(table.sourceMemoryId, table.targetMemoryId, table.strength),
  pathIdx: index('idx_waypoints_path').on(table.sourceMemoryId, table.strength, table.relationshipType),
  noSelfReference: check('no_self_reference', sql`${table.sourceMemoryId} != ${table.targetMemoryId}`),
  strengthCheck: check('waypoint_strength_check', sql`${table.strength} >= 0.0 AND ${table.strength} <= 1.0`),
}));

export const vectorIndex = sqliteTable('vector_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memoryId: text('memory_id').notNull().unique(),
  vectorBytes: blob('vector_bytes'),
  dimension: integer('dimension').notNull().default(1536),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
}, (table) => ({
  memoryIdx: index('idx_vector_memory').on(table.memoryId),
}));

export const memoryAccessLog = sqliteTable('memory_access_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memoryId: text('memory_id').notNull(),
  accessType: text('access_type').notNull(),
  queryContext: text('query_context'),
  strengthBefore: real('strength_before'),
  strengthAfter: real('strength_after'),
  accessedAt: integer('accessed_at', { mode: 'timestamp' }).default(new Date()),
}, (table) => ({
  memoryIdx: index('idx_access_log_memory').on(table.memoryId),
  timeIdx: index('idx_access_log_time').on(table.accessedAt),
  typeIdx: index('idx_access_log_type').on(table.accessType),
}));

export const decaySchedule = sqliteTable('decay_schedule', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memoryId: text('memory_id').notNull(),
  lastDecayAt: integer('last_decay_at', { mode: 'timestamp' }).default(new Date()),
  nextDecayAt: integer('next_decay_at', { mode: 'timestamp' }),
  decayIntervalHours: integer('decay_interval_hours').default(1),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
}, (table) => ({
  nextDecayIdx: index('idx_decay_schedule_next').on(table.nextDecayAt),
  memoryIdx: index('idx_decay_schedule_memory').on(table.memoryId),
}));

export const systemConfig = sqliteTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  valueType: text('value_type').default('string'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
});

export const memoriesRelations = relations(memories, ({ one, many }) => ({
  sector: one(sectors, {
    fields: [memories.sectorId],
    references: [sectors.id],
  }),
  vectorIndex: one(vectorIndex, {
    fields: [memories.id],
    references: [vectorIndex.memoryId],
  }),
  sourceWaypoints: many(waypoints, { relationName: 'sourceMemory' }),
  targetWaypoints: many(waypoints, { relationName: 'targetMemory' }),
  accessLogs: many(memoryAccessLog),
  decaySchedule: one(decaySchedule, {
    fields: [memories.id],
    references: [decaySchedule.memoryId],
  }),
}));

export const sectorsRelations = relations(sectors, ({ one, many }) => ({
  parent: one(sectors, {
    fields: [sectors.parentId],
    references: [sectors.id],
    relationName: 'parentSector',
  }),
  children: many(sectors, { relationName: 'parentSector' }),
  memories: many(memories),
}));

export const waypointsRelations = relations(waypoints, ({ one }) => ({
  sourceMemory: one(memories, {
    fields: [waypoints.sourceMemoryId],
    references: [memories.id],
    relationName: 'sourceMemory',
  }),
  targetMemory: one(memories, {
    fields: [waypoints.targetMemoryId],
    references: [memories.id],
    relationName: 'targetMemory',
  }),
}));

export const vectorIndexRelations = relations(vectorIndex, ({ one }) => ({
  memory: one(memories, {
    fields: [vectorIndex.memoryId],
    references: [memories.id],
  }),
}));

export const memoryAccessLogRelations = relations(memoryAccessLog, ({ one }) => ({
  memory: one(memories, {
    fields: [memoryAccessLog.memoryId],
    references: [memories.id],
  }),
}));

export const decayScheduleRelations = relations(decaySchedule, ({ one }) => ({
  memory: one(memories, {
    fields: [decaySchedule.memoryId],
    references: [memories.id],
  }),
}));

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type Sector = typeof sectors.$inferSelect;
export type NewSector = typeof sectors.$inferInsert;

export type Waypoint = typeof waypoints.$inferSelect;
export type NewWaypoint = typeof waypoints.$inferInsert;

export type VectorIndex = typeof vectorIndex.$inferSelect;
export type NewVectorIndex = typeof vectorIndex.$inferInsert;

export type MemoryAccessLog = typeof memoryAccessLog.$inferSelect;
export type NewMemoryAccessLog = typeof memoryAccessLog.$inferInsert;

export type DecaySchedule = typeof decaySchedule.$inferSelect;
export type NewDecaySchedule = typeof decaySchedule.$inferInsert;

export type SystemConfig = typeof systemConfig.$inferSelect;
export type NewSystemConfig = typeof systemConfig.$inferInsert;

export const RELATIONSHIP_TYPES = {
  SEMANTIC: 'semantic',
  TEMPORAL: 'temporal',
  CAUSAL: 'causal',
  REFERENCE: 'reference',
  ELABORATION: 'elaboration',
  CONTRADICTION: 'contradiction',
} as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[keyof typeof RELATIONSHIP_TYPES];

export const ACCESS_TYPES = {
  QUERY: 'query',
  REINFORCE: 'reinforce',
  MANUAL: 'manual',
  AUTO: 'auto',
} as const;

export type AccessType = typeof ACCESS_TYPES[keyof typeof ACCESS_TYPES];

export const VALUE_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  JSON: 'json',
} as const;

export type ValueType = typeof VALUE_TYPES[keyof typeof VALUE_TYPES];