CREATE TABLE `decay_schedule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`last_decay_at` integer DEFAULT '"2025-10-28T05:32:30.794Z"',
	`next_decay_at` integer,
	`decay_interval_hours` integer DEFAULT 1,
	`is_active` integer DEFAULT true
);
--> statement-breakpoint
CREATE INDEX `idx_decay_schedule_next` ON `decay_schedule` (`next_decay_at`);--> statement-breakpoint
CREATE INDEX `idx_decay_schedule_memory` ON `decay_schedule` (`memory_id`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`embedding_id` integer,
	`strength` real DEFAULT 0.8 NOT NULL,
	`decay_rate` real DEFAULT 0.95 NOT NULL,
	`initial_strength` real NOT NULL,
	`access_count` integer DEFAULT 0,
	`reinforcement_count` integer DEFAULT 0,
	`last_accessed` integer DEFAULT '"2025-10-28T05:32:30.793Z"',
	`created_at` integer DEFAULT '"2025-10-28T05:32:30.793Z"',
	`sector_id` text,
	`metadata` text,
	CONSTRAINT "strength_check" CHECK("memories"."strength" >= 0.0 AND "memories"."strength" <= 1.0),
	CONSTRAINT "decay_rate_check" CHECK("memories"."decay_rate" >= 0.85 AND "memories"."decay_rate" <= 0.99),
	CONSTRAINT "initial_strength_check" CHECK("memories"."initial_strength" >= 0.0 AND "memories"."initial_strength" <= 1.0)
);
--> statement-breakpoint
CREATE INDEX `idx_memories_strength` ON `memories` (`strength`);--> statement-breakpoint
CREATE INDEX `idx_memories_sector` ON `memories` (`sector_id`);--> statement-breakpoint
CREATE INDEX `idx_memories_last_accessed` ON `memories` (`last_accessed`);--> statement-breakpoint
CREATE INDEX `idx_memories_created` ON `memories` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_memories_sector_strength` ON `memories` (`sector_id`,`strength`);--> statement-breakpoint
CREATE INDEX `idx_memories_decay` ON `memories` (`last_accessed`,`decay_rate`);--> statement-breakpoint
CREATE TABLE `memory_access_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`access_type` text NOT NULL,
	`query_context` text,
	`strength_before` real,
	`strength_after` real,
	`accessed_at` integer DEFAULT '"2025-10-28T05:32:30.794Z"'
);
--> statement-breakpoint
CREATE INDEX `idx_access_log_memory` ON `memory_access_log` (`memory_id`);--> statement-breakpoint
CREATE INDEX `idx_access_log_time` ON `memory_access_log` (`accessed_at`);--> statement-breakpoint
CREATE INDEX `idx_access_log_type` ON `memory_access_log` (`access_type`);--> statement-breakpoint
CREATE TABLE `sectors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`decay_multiplier` real DEFAULT 1,
	`memory_count` integer DEFAULT 0,
	`topics` text,
	`last_accessed` integer,
	`created_at` integer DEFAULT '"2025-10-28T05:32:30.793Z"',
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `idx_sectors_parent` ON `sectors` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_sectors_name` ON `sectors` (`name`);--> statement-breakpoint
CREATE INDEX `idx_sectors_last_accessed` ON `sectors` (`last_accessed`);--> statement-breakpoint
CREATE TABLE `system_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`value_type` text DEFAULT 'string',
	`updated_at` integer DEFAULT '"2025-10-28T05:32:30.794Z"'
);
--> statement-breakpoint
CREATE TABLE `vector_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memory_id` text NOT NULL,
	`vector_bytes` blob,
	`dimension` integer DEFAULT 1536 NOT NULL,
	`created_at` integer DEFAULT '"2025-10-28T05:32:30.793Z"',
	`updated_at` integer DEFAULT '"2025-10-28T05:32:30.793Z"'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vector_index_memory_id_unique` ON `vector_index` (`memory_id`);--> statement-breakpoint
CREATE INDEX `idx_vector_memory` ON `vector_index` (`memory_id`);--> statement-breakpoint
CREATE TABLE `waypoints` (
	`id` text PRIMARY KEY NOT NULL,
	`source_memory_id` text NOT NULL,
	`target_memory_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`strength` real DEFAULT 0.8 NOT NULL,
	`created_at` integer DEFAULT '"2025-10-28T05:32:30.793Z"',
	`metadata` text,
	CONSTRAINT "no_self_reference" CHECK("waypoints"."source_memory_id" != "waypoints"."target_memory_id"),
	CONSTRAINT "waypoint_strength_check" CHECK("waypoints"."strength" >= 0.0 AND "waypoints"."strength" <= 1.0)
);
--> statement-breakpoint
CREATE INDEX `idx_waypoints_source` ON `waypoints` (`source_memory_id`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_target` ON `waypoints` (`target_memory_id`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_strength` ON `waypoints` (`strength`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_type` ON `waypoints` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_composite` ON `waypoints` (`source_memory_id`,`target_memory_id`,`strength`);--> statement-breakpoint
CREATE INDEX `idx_waypoints_path` ON `waypoints` (`source_memory_id`,`strength`,`relationship_type`);