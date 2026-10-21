CREATE TABLE `community_flags` (
	`report_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`report_id`, `actor_key`),
	FOREIGN KEY (`report_id`) REFERENCES `community_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `community_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`segment_id` text NOT NULL,
	`category` text NOT NULL,
	`impact` text NOT NULL,
	`message` text NOT NULL,
	`author_name` text NOT NULL,
	`author_key` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`photo_key` text,
	`status` text DEFAULT 'visible' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_segment_created` ON `community_reports` (`segment_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_author_created` ON `community_reports` (`author_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_votes` (
	`report_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`reaction` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`report_id`, `actor_key`),
	FOREIGN KEY (`report_id`) REFERENCES `community_reports`(`id`) ON UPDATE no action ON DELETE no action
);
