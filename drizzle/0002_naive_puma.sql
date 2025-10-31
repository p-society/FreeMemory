PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_decay_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`last_decay_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"',
	`next_decay_at` integer,
	`decay_interval_hours` integer DEFAULT 1,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
INSERT INTO `__new_decay_schedule`("id", "memory_id", "last_decay_at", "next_decay_at", "decay_interval_hours", "is_active") SELECT "id", "memory_id", "last_decay_at", "next_decay_at", "decay_interval_hours", "is_active" FROM `decay_schedule`;--> statement-breakpoint
DROP TABLE `decay_schedule`;--> statement-breakpoint
ALTER TABLE `__new_decay_schedule` RENAME TO `decay_schedule`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_decay_schedule_next` ON `decay_schedule` (`next_decay_at`);--> statement-breakpoint
CREATE INDEX `idx_decay_schedule_memory` ON `decay_schedule` (`memory_id`);--> statement-breakpoint
CREATE TABLE `__new_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`embedding_id` integer,
	`user_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`user_type` text NOT NULL,
	`strength` real DEFAULT 0.8 NOT NULL,
	`decay_rate` real DEFAULT 0.95 NOT NULL,
	`initial_strength` real NOT NULL,
	`access_count` integer DEFAULT 0,
	`reinforcement_count` integer DEFAULT 0,
	`last_accessed` integer DEFAULT '"2025-10-31T17:37:21.743Z"',
	`created_at` integer DEFAULT '"2025-10-31T17:37:21.743Z"',
	`sector_id` text,
	`memory_type` text DEFAULT 'REGULAR',
	`archived` integer DEFAULT false,
	`metadata` text,
	CONSTRAINT "strength_check" CHECK("__new_memories"."strength" >= 0.0 AND "__new_memories"."strength" <= 1.0),
	CONSTRAINT "decay_rate_check" CHECK("__new_memories"."decay_rate" >= 0.85 AND "__new_memories"."decay_rate" <= 0.99),
	CONSTRAINT "initial_strength_check" CHECK("__new_memories"."initial_strength" >= 0.0 AND "__new_memories"."initial_strength" <= 1.0)
);
--> statement-breakpoint
INSERT INTO `__new_memories`("id", "content", "embedding_id", "user_id", "chat_id", "user_type", "strength", "decay_rate", "initial_strength", "access_count", "reinforcement_count", "last_accessed", "created_at", "sector_id", "memory_type", "archived", "metadata") SELECT "id", "content", "embedding_id", "user_id", "chat_id", "user_type", "strength", "decay_rate", "initial_strength", "access_count", "reinforcement_count", "last_accessed", "created_at", "sector_id", "memory_type", "archived", "metadata" FROM `memories`;--> statement-breakpoint
DROP TABLE `memories`;--> statement-breakpoint
ALTER TABLE `__new_memories` RENAME TO `memories`;--> statement-breakpoint
CREATE INDEX `idx_memories_strength` ON `memories` (`strength`);--> statement-breakpoint
CREATE INDEX `idx_memories_user_id` ON `memories` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_chat_id` ON `memories` (`chat_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_sector` ON `memories` (`sector_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_last_accessed` ON `memories` (`last_accessed`);--> statement-breakpoint
CREATE INDEX `idx_memories_created` ON `memories` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_memories_type` ON `memories` (`memory_type`);--> statement-breakpoint
CREATE INDEX `idx_memories_archived` ON `memories` (`archived`);--> statement-breakpoint
CREATE INDEX `idx_memories_sector_strength` ON `memories` (`sector_id`,`strength`);--> statement-breakpoint
CREATE INDEX `idx_memories_decay` ON `memories` (`last_accessed`,`decay_rate`);--> statement-breakpoint
CREATE TABLE `__new_memory_access_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`access_type` text NOT NULL,
	`query_context` text,
	`strength_before` real,
	`strength_after` real,
	`accessed_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"'
);
--> statement-breakpoint
INSERT INTO `__new_memory_access_log`("id", "memory_id", "access_type", "query_context", "strength_before", "strength_after", "accessed_at") SELECT "id", "memory_id", "access_type", "query_context", "strength_before", "strength_after", "accessed_at" FROM `memory_access_log`;--> statement-breakpoint
DROP TABLE `memory_access_log`;--> statement-breakpoint
ALTER TABLE `__new_memory_access_log` RENAME TO `memory_access_log`;--> statement-breakpoint
CREATE INDEX `idx_access_log_memory` ON `memory_access_log` (`memory_id`);--> statement-breakpoint
CREATE INDEX `idx_access_log_time` ON `memory_access_log` (`accessed_at`);--> statement-breakpoint
CREATE INDEX `idx_access_log_type` ON `memory_access_log` (`access_type`);--> statement-breakpoint
CREATE TABLE `__new_sectors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`decay_multiplier` real DEFAULT 1,
	`memory_count` integer DEFAULT 0,
	`topics` text,
	`last_accessed` integer,
	`created_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"',
	`metadata` text
);
--> statement-breakpoint
INSERT INTO `__new_sectors`("id", "name", "parent_id", "decay_multiplier", "memory_count", "topics", "last_accessed", "created_at", "metadata") SELECT "id", "name", "parent_id", "decay_multiplier", "memory_count", "topics", "last_accessed", "created_at", "metadata" FROM `sectors`;--> statement-breakpoint
DROP TABLE `sectors`;--> statement-breakpoint
ALTER TABLE `__new_sectors` RENAME TO `sectors`;--> statement-breakpoint
CREATE INDEX `idx_sectors_parent` ON `sectors` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_sectors_name` ON `sectors` (`name`);--> statement-breakpoint
CREATE INDEX `idx_sectors_last_accessed` ON `sectors` (`last_accessed`);--> statement-breakpoint
CREATE TABLE `__new_system_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'string',
	`updated_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"'
);
--> statement-breakpoint
INSERT INTO `__new_system_config`("key", "value", "value_type", "updated_at") SELECT "key", "value", "value_type", "updated_at" FROM `system_config`;--> statement-breakpoint
DROP TABLE `system_config`;--> statement-breakpoint
ALTER TABLE `__new_system_config` RENAME TO `system_config`;--> statement-breakpoint
CREATE TABLE `__new_vector_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`vector_bytes` blob,
	`dimension` integer DEFAULT 1536 NOT NULL,
	`created_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"',
	`updated_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"'
);
--> statement-breakpoint
INSERT INTO `__new_vector_index`("id", "memory_id", "vector_bytes", "dimension", "created_at", "updated_at") SELECT "id", "memory_id", "vector_bytes", "dimension", "created_at", "updated_at" FROM `vector_index`;--> statement-breakpoint
DROP TABLE `vector_index`;--> statement-breakpoint
ALTER TABLE `__new_vector_index` RENAME TO `vector_index`;--> statement-breakpoint
CREATE UNIQUE INDEX `vector_index_memory_id_unique` ON `vector_index` (`memory_id`);--> statement-breakpoint
CREATE INDEX `idx_vector_memory` ON `vector_index` (`memory_id`);--> statement-breakpoint
CREATE TABLE `__new_waypoints` (
	`id` text PRIMARY KEY NOT NULL,
	`source_memory_id` text NOT NULL,
	`target_memory_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`strength` real DEFAULT 0.8 NOT NULL,
	`created_at` integer DEFAULT '"2025-10-31T17:37:21.744Z"',
	`metadata` text,
	CONSTRAINT "no_self_reference" CHECK("__new_waypoints"."source_memory_id" != "__new_waypoints"."target_memory_id"),
	CONSTRAINT "waypoint_strength_check" CHECK("__new_waypoints"."strength" >= 0.0 AND "__new_waypoints"."strength" <= 1.0)
);
--> statement-breakpoint
INSERT INTO `__new_waypoints`("id", "source_memory_id", "target_memory_id", "relationship_type", "strength", "created_at", "metadata") SELECT "id", "source_memory_id", "target_memory_id", "relationship_type", "strength", "created_at", "metadata" FROM `waypoints`;--> statement-breakpoint
DROP TABLE `waypoints`;--> statement-breakpoint
ALTER TABLE `__new_waypoints` RENAME TO `waypoints`;--> statement-breakpoint
CREATE INDEX `idx_waypoints_source` ON `waypoints` (`source_memory_id`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_target` ON `waypoints` (`target_memory_id`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_strength` ON `waypoints` (`strength`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_type` ON `waypoints` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_composite` ON `waypoints` (`source_memory_id`,`target_memory_id`,`strength`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_path` ON `waypoints` (`source_memory_id`,`strength`,`relationship_type`);