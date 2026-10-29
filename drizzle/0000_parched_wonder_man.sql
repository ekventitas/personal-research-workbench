CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text,
	`project_id` text,
	`paper_id` text,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`version` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `dataset_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`git_commit` text,
	`entries_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `idea_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`idea` text NOT NULL,
	`route` text NOT NULL,
	`disposition` text DEFAULT 'UNKNOWN' NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text NOT NULL,
	`project_id` text,
	`source_ids_json` text DEFAULT '[]' NOT NULL,
	`parameters_json` text DEFAULT '{}' NOT NULL,
	`input_snapshot_json` text DEFAULT '{}' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`qa_json` text DEFAULT '{}' NOT NULL,
	`skill_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `owners` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paper_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`paper_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`zotero_key` text NOT NULL,
	`zotero_version` integer DEFAULT 0 NOT NULL,
	`library_id` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`authors_json` text DEFAULT '[]' NOT NULL,
	`year` text,
	`publication_title` text,
	`doi` text,
	`url` text,
	`abstract` text DEFAULT '' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`collections_json` text DEFAULT '[]' NOT NULL,
	`attachment_path` text,
	`attachment_hash` text,
	`cloud_artifact_id` text,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `papers_owner_zotero_idx` ON `papers` (`owner_id`,`library_id`,`zotero_key`);--> statement-breakpoint
CREATE TABLE `ppt_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`artifact_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `project_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`occurred_at` text NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`source_refs_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`research_question` text DEFAULT '' NOT NULL,
	`domain` text DEFAULT 'ai_cs' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`repo_full_name` text,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`local_path` text,
	`next_step` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `schedule_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`date` text,
	`weekday` integer,
	`start_time` text,
	`end_time` text,
	`start_date` text,
	`end_date` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`project_id` text,
	`notes` text DEFAULT '' NOT NULL,
	`import_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_owner_hash_idx` ON `schedule_items` (`owner_id`,`import_hash`);--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`job_id` text,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`markdown` text NOT NULL,
	`included_activity_ids_json` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`artifact_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
