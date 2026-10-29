import { allRows, cleanRecord, oneRow, runSql, uid } from "@/lib/repository";

export const dynamic = "force-dynamic";

const VERSION = "2026-07-28";
const entityTables: Record<string, string> = {
  schedule: "schedule_items", papers: "papers", projects: "projects", activities: "project_activities",
  jobs: "jobs", artifacts: "artifacts", templates: "ppt_templates", datasets: "dataset_manifests", reports: "weekly_reports",
};

const tools = [
  {
    name: "list_workbench_items", title: "读取科研工作台记录",
    description: "当用户需要查看个人科研工作台中的日程、文献、项目、活动、任务、产物、模板、数据版本或周报时使用。只读取私有工作台数据。",
    inputSchema: { type: "object", properties: { entity: { type: "string", enum: Object.keys(entityTables) }, limit: { type: "integer", minimum: 1, maximum: 200 }, status: { type: "string" }, project_id: { type: "string" } }, required: ["entity"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "get_job_bundle", title: "取得 Codex 任务包",
    description: "在运行 Nature skill 前使用。读取指定任务、输入快照、源文献、默认 PPT 模板和已有产物；不会启动或修改任务。",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "append_project_activity", title: "记录科研进展",
    description: "用户明确要求把阅读、Idea、实验、代码、写作或其他进展保存到科研项目时使用。这会新增一条活动记录。",
    inputSchema: { type: "object", properties: { project_id: { type: ["string","null"] }, kind: { type: "string", enum: ["reading","idea","experiment","code","writing","other"] }, title: { type: "string", minLength: 1 }, occurred_at: { type: "string" }, content: { type: "object" }, source_refs: { type: "array", items: { type: "string" } } }, required: ["kind","title"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
  {
    name: "collect_weekly_inputs", title: "收集周报素材",
    description: "生成周报前使用。按日期范围读取活动和关联项目，保留原始记录供用户筛选，不会写入周报。",
    inputSchema: { type: "object", properties: { week_start: { type: "string", format: "date" }, week_end: { type: "string", format: "date" }, project_ids: { type: "array", items: { type: "string" } } }, required: ["week_start","week_end"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "record_job_result", title: "回写 Codex 任务结果",
    description: "Nature skill 或其他 Codex 工作流完成后使用。更新任务状态、摘要、QA 与已上传产物 ID；调用前必须让用户确认写入。",
    inputSchema: { type: "object", properties: { job_id: { type: "string" }, status: { type: "string", enum: ["running","needs_input","completed","failed","cancelled"] }, summary: { type: "string" }, artifact_ids: { type: "array", items: { type: "string" } }, qa: { type: "object" } }, required: ["job_id","status"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  },
  {
    name: "save_weekly_report", title: "保存 Markdown 周报",
    description: "用户审阅并确认周报 Markdown 后使用。保存新版本并关联纳入的活动记录。",
    inputSchema: { type: "object", properties: { job_id: { type: "string" }, week_start: { type: "string", format: "date" }, week_end: { type: "string", format: "date" }, markdown: { type: "string", minLength: 1 }, included_activity_ids: { type: "array", items: { type: "string" } } }, required: ["job_id","week_start","week_end","markdown","included_activity_ids"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
];

function rpc(id: unknown, result?: unknown, error?: { code: number; message: string; data?: unknown }) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, ...(error ? { error } : { result }) }, { headers: { "cache-control": "private, no-store" } });
}

async function ownerId(request: Request) {
  const header = request.headers.get("oai-authenticated-user-id");
  if (header) return header;
  const owners = await allRows<{ id: string }>(`SELECT id FROM owners ORDER BY created_at LIMIT 2`);
  if (owners.length === 1) return owners[0].id;
  throw new Error("Authenticated owner identity is required");
}

async function callTool(owner: string, name: string, args: Record<string, unknown>) {
  if (name === "list_workbench_items") {
    const table = entityTables[String(args.entity ?? "")]; if (!table) throw new Error("Unsupported entity");
    const bindings: unknown[] = [owner]; let where = "owner_id=? AND deleted_at IS NULL";
    if (args.status) { where += " AND status=?"; bindings.push(args.status); }
    if (args.project_id && ["projects","project_activities","jobs","artifacts","dataset_manifests"].includes(table)) { where += table === "projects" ? " AND id=?" : " AND project_id=?"; bindings.push(args.project_id); }
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200); bindings.push(limit);
    const items = (await allRows(`SELECT * FROM ${table} WHERE ${where} ORDER BY created_at DESC LIMIT ?`, ...bindings)).map(cleanRecord);
    return { items };
  }
  if (name === "get_job_bundle") {
    const job = await oneRow<Record<string, unknown>>(`SELECT * FROM jobs WHERE id=? AND owner_id=? AND deleted_at IS NULL`, args.job_id, owner);
    if (!job) throw new Error("Job not found");
    const sourceIds = JSON.parse(String(job.source_ids_json ?? "[]")) as string[];
    const papers = sourceIds.length ? await allRows(`SELECT * FROM papers WHERE owner_id=? AND deleted_at IS NULL AND id IN (${sourceIds.map(() => "?").join(",")})`, owner, ...sourceIds) : [];
    const artifacts = await allRows(`SELECT id,job_id,paper_id,kind,filename,mime_type,sha256,size_bytes,version,created_at FROM artifacts WHERE owner_id=? AND deleted_at IS NULL AND (job_id=? OR paper_id IN (${sourceIds.length ? sourceIds.map(() => "?").join(",") : "NULL"}))`, owner, args.job_id, ...sourceIds);
    const templates = await allRows(`SELECT t.*,a.filename,a.sha256,a.version FROM ppt_templates t JOIN artifacts a ON a.id=t.artifact_id WHERE t.owner_id=? AND t.deleted_at IS NULL ORDER BY t.is_default DESC,t.created_at DESC`, owner);
    return { job: cleanRecord(job), papers: papers.map(cleanRecord), artifacts, templates };
  }
  if (name === "append_project_activity") {
    const id = uid("act");
    await runSql(`INSERT INTO project_activities (id,owner_id,project_id,kind,title,occurred_at,content_json,source_refs_json) VALUES (?,?,?,?,?,?,?,?)`, id, owner, args.project_id ?? null, args.kind, args.title, args.occurred_at ?? new Date().toISOString(), JSON.stringify(args.content ?? {}), JSON.stringify(args.source_refs ?? []));
    return { id, saved: true };
  }
  if (name === "collect_weekly_inputs") {
    const bindings: unknown[] = [owner, args.week_start, args.week_end]; let extra = "";
    const projectIds = Array.isArray(args.project_ids) ? args.project_ids : [];
    if (projectIds.length) { extra = ` AND project_id IN (${projectIds.map(() => "?").join(",")})`; bindings.push(...projectIds); }
    const activities = (await allRows(`SELECT * FROM project_activities WHERE owner_id=? AND deleted_at IS NULL AND substr(occurred_at,1,10) BETWEEN ? AND ?${extra} ORDER BY occurred_at`, ...bindings)).map(cleanRecord);
    const projects = await allRows(`SELECT * FROM projects WHERE owner_id=? AND deleted_at IS NULL`, owner);
    return { week_start: args.week_start, week_end: args.week_end, activities, projects };
  }
  if (name === "record_job_result") {
    await runSql(`UPDATE jobs SET status=?,summary=?,qa_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND deleted_at IS NULL`, args.status, args.summary ?? "", JSON.stringify({ ...(args.qa as object ?? {}), artifactIds: args.artifact_ids ?? [] }), args.job_id, owner);
    return { saved: true, job_id: args.job_id, status: args.status };
  }
  if (name === "save_weekly_report") {
    const id = uid("report");
    const previous = await oneRow<{ version: number }>(`SELECT version FROM weekly_reports WHERE owner_id=? AND week_start=? AND week_end=? ORDER BY version DESC LIMIT 1`, owner, args.week_start, args.week_end);
    const version = (previous?.version ?? 0) + 1;
    await runSql(`INSERT INTO weekly_reports (id,owner_id,job_id,week_start,week_end,markdown,included_activity_ids_json,version) VALUES (?,?,?,?,?,?,?,?)`, id, owner, args.job_id, args.week_start, args.week_end, args.markdown, JSON.stringify(args.included_activity_ids), version);
    await runSql(`UPDATE jobs SET status='completed',summary=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?`, `周报已保存为第 ${version} 版`, args.job_id, owner);
    return { saved: true, report_id: id, version };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function POST(request: Request) {
  let payload: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try { payload = await request.json(); } catch { return rpc(null, undefined, { code: -32700, message: "Parse error" }); }
  try {
    if (payload.method === "initialize") return rpc(payload.id, { protocolVersion: VERSION, capabilities: { tools: {} }, serverInfo: { name: "personal-research-workbench", version: "1.0.0" }, instructions: "先读取任务包再运行对应 Nature skill。只在用户确认后写入活动、任务结果或周报；不把未知信息补写成事实。" });
    if (payload.method === "server/discover") return rpc(payload.id, { supportedVersions: [VERSION], capabilities: { tools: {} } });
    if (payload.method === "tools/list") return rpc(payload.id, { tools });
    if (payload.method === "tools/call") {
      const params = payload.params ?? {}; const name = String(params.name ?? ""); const args = (params.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(await ownerId(request), name, args);
      return rpc(payload.id, { structuredContent: result, content: [{ type: "text", text: `${name} 完成。` }] });
    }
    return rpc(payload.id, undefined, { code: -32601, message: "Method not found" });
  } catch (error) {
    return rpc(payload.id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed" }] });
  }
}
