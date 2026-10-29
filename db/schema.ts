import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  deletedAt: text("deleted_at"),
};

export const owners = sqliteTable("owners", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const scheduleItems = sqliteTable("schedule_items", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(),
  kind: text("kind", { enum: ["course", "ddl", "todo"] }).notNull(), title: text("title").notNull(),
  date: text("date"), weekday: integer("weekday"), startTime: text("start_time"), endTime: text("end_time"),
  startDate: text("start_date"), endDate: text("end_date"), priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"), projectId: text("project_id"), notes: text("notes").notNull().default(""),
  importHash: text("import_hash").notNull(), ...timestamps,
}, (table) => [uniqueIndex("schedule_owner_hash_idx").on(table.ownerId, table.importHash)]);

export const papers = sqliteTable("papers", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), zoteroKey: text("zotero_key").notNull(),
  zoteroVersion: integer("zotero_version").notNull().default(0), libraryId: integer("library_id").notNull().default(1),
  title: text("title").notNull(), authorsJson: text("authors_json").notNull().default("[]"), year: text("year"),
  publicationTitle: text("publication_title"), doi: text("doi"), url: text("url"), abstract: text("abstract").notNull().default(""),
  tagsJson: text("tags_json").notNull().default("[]"), collectionsJson: text("collections_json").notNull().default("[]"),
  attachmentPath: text("attachment_path"), sourcePathFingerprint: text("source_path_fingerprint"), attachmentHash: text("attachment_hash"), cloudArtifactId: text("cloud_artifact_id"),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`), ...timestamps,
}, (table) => [uniqueIndex("papers_owner_zotero_idx").on(table.ownerId, table.libraryId, table.zoteroKey)]);

export const paperSelections = sqliteTable("paper_selections", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(),
  paperIdsJson: text("paper_ids_json").notNull().default("[]"), ...timestamps,
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(),
  researchQuestion: text("research_question").notNull().default(""), domain: text("domain").notNull().default("ai_cs"),
  status: text("status").notNull().default("active"), repoFullName: text("repo_full_name"),
  defaultBranch: text("default_branch").notNull().default("main"), localPath: text("local_path"), nextStep: text("next_step").notNull().default(""),
  ...timestamps,
});

export const projectActivities = sqliteTable("project_activities", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), projectId: text("project_id"),
  kind: text("kind").notNull(), title: text("title").notNull(), occurredAt: text("occurred_at").notNull(),
  contentJson: text("content_json").notNull().default("{}"), sourceRefsJson: text("source_refs_json").notNull().default("[]"), ...timestamps,
});

export const ideaAssessments = sqliteTable("idea_assessments", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), projectId: text("project_id"), idea: text("idea").notNull(),
  route: text("route").notNull(), disposition: text("disposition").notNull().default("UNKNOWN"), evidenceJson: text("evidence_json").notNull().default("{}"), ...timestamps,
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), kind: text("kind").notNull(), status: text("status").notNull().default("draft"),
  title: text("title").notNull(), projectId: text("project_id"), sourceIdsJson: text("source_ids_json").notNull().default("[]"),
  parametersJson: text("parameters_json").notNull().default("{}"), inputSnapshotJson: text("input_snapshot_json").notNull().default("{}"),
  summary: text("summary").notNull().default(""), qaJson: text("qa_json").notNull().default("{}"), skillName: text("skill_name"), ...timestamps,
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), jobId: text("job_id"), projectId: text("project_id"), paperId: text("paper_id"),
  kind: text("kind").notNull(), filename: text("filename").notNull(), mimeType: text("mime_type").notNull(), objectKey: text("object_key").notNull(),
  sha256: text("sha256").notNull(), sizeBytes: integer("size_bytes").notNull(), version: text("version").notNull(), metadataJson: text("metadata_json").notNull().default("{}"), ...timestamps,
});

export const pptTemplates = sqliteTable("ppt_templates", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(), artifactId: text("artifact_id").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false), ...timestamps,
});

export const datasetManifests = sqliteTable("dataset_manifests", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), projectId: text("project_id").notNull(), name: text("name").notNull(),
  version: text("version").notNull(), gitCommit: text("git_commit"), entriesJson: text("entries_json").notNull().default("[]"), ...timestamps,
});

export const weeklyReports = sqliteTable("weekly_reports", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), jobId: text("job_id"), weekStart: text("week_start").notNull(), weekEnd: text("week_end").notNull(),
  markdown: text("markdown").notNull(), includedActivityIdsJson: text("included_activity_ids_json").notNull().default("[]"), version: integer("version").notNull().default(1),
  artifactId: text("artifact_id"), ...timestamps,
});
