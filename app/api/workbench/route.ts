import { apiError, requireApiOwner } from "@/lib/server-auth";
import { allRows, cleanRecord, oneRow, runSql, sha256Text, uid } from "@/lib/repository";
import { JOB_KINDS, SKILL_BY_JOB, type JobKind } from "@/lib/workbench-types";

export const dynamic = "force-dynamic";

const TABLES = ["schedule_items", "papers", "paper_selections", "projects", "project_activities", "idea_assessments", "jobs", "artifacts", "ppt_templates", "dataset_manifests", "weekly_reports"] as const;

function activityContent(row: Record<string, unknown>) {
  try { return JSON.parse(String(row.content_json ?? "{}")) as Record<string, unknown>; }
  catch { return {}; }
}

function text(value: unknown) { return String(value ?? "").trim(); }

function optionalBullet(label: string, value: unknown) {
  return text(value) ? `- **${label}：** ${text(value)}` : "";
}

function renderWeeklyDraft(activities: Record<string, unknown>[], plans: Record<string, unknown>[]) {
  const reading = activities.filter((row) => row.kind === "reading");
  const ideas = activities.filter((row) => row.kind === "idea");
  const experiments = activities.filter((row) => row.kind === "experiment");
  const other = activities.filter((row) => !["reading", "idea", "experiment"].includes(String(row.kind)));

  const overview = activities.length
    ? `本周共记录 ${activities.length} 项已确认进展：${activities.map((row) => text(row.title)).filter(Boolean).join("、")}。关键结论和待解决问题仅在对应记录中有明确内容时由 Codex 补充。`
    : "本周无";

  const readingGroups = new Map<string, Record<string, unknown>[]>();
  for (const row of reading) {
    const domain = text(activityContent(row).domain) || "未分类";
    readingGroups.set(domain, [...(readingGroups.get(domain) ?? []), row]);
  }
  const readingMarkdown = reading.length ? [...readingGroups.entries()].map(([domain, rows], groupIndex) => {
    const papers = rows.map((row, index) => {
      const content = activityContent(row);
      const bullets = [
        optionalBullet("发表信息", content.publication),
        optionalBullet("主要单位", content.organization),
        optionalBullet("论文链接", content.link),
        optionalBullet("摘要翻译/自己总结/心得", content.summary),
      ].filter(Boolean).join("\n");
      return `**${index + 1}. 论文标题：${text(row.title)}**${bullets ? `\n\n${bullets}` : ""}`;
    }).join("\n\n");
    return `**（${"一二三四五六七八九十"[groupIndex] ?? groupIndex + 1}）${domain}**\n\n${papers}`;
  }).join("\n\n") : "本周无";

  const ideaMarkdown = ideas.length ? ideas.map((row, index) => {
    const content = activityContent(row);
    const bullets = [
      optionalBullet("Motivation", content.motivation),
      optionalBullet("具体修改内容", content.changes),
      optionalBullet("当前进展", content.progress),
    ].filter(Boolean).join("\n");
    return `**${index + 1}. 设计/改进内容：${text(row.title)}**${bullets ? `\n\n${bullets}` : ""}`;
  }).join("\n\n") : "本周无";

  const experimentMarkdown = experiments.length ? experiments.map((row, index) => {
    const content = activityContent(row);
    const sections = [
      text(content.setup) ? `**实验设置：** ${text(content.setup)}` : "",
      text(content.metricsMarkdown) ? text(content.metricsMarkdown) : "",
      optionalBullet("结果分析", content.analysis),
      optionalBullet("当前结论", content.conclusion),
      optionalBullet("后续处理", content.next),
    ].filter(Boolean).join("\n\n");
    return `**${index + 1}. 实验名称/目的：${text(row.title)}**${sections ? `\n\n${sections}` : ""}`;
  }).join("\n\n") : "本周无";

  const otherMarkdown = other.length ? other.map((row) => `- **${text(row.title)}**（${text(row.kind)}）`).join("\n") : "本周无";
  const planMarkdown = plans.length ? plans.map((row, index) => `${index + 1}. **${text(row.title)}：** ${text(row.notes) || "待确认预期产出"}`).join("\n") : "本周无";

  return `#### 一、本周进展概述\n\n${overview}\n\n#### 二、论文阅读\n\n${readingMarkdown}\n\n#### 三、Our Method 设计/改进\n\n${ideaMarkdown}\n\n#### 四、实验进展\n\n${experimentMarkdown}\n\n#### 五、其他工作进展\n\n${otherMarkdown}\n\n#### 六、下周计划\n\n${planMarkdown}\n`;
}

export async function GET() {
  try {
    const user = await requireApiOwner();
    await runSql(`INSERT INTO owners (id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`, user.userId, user.email, user.displayName);
    const values = await Promise.all(TABLES.map((table) => allRows(`SELECT * FROM ${table} WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`, user.userId)));
    return Response.json(Object.fromEntries(TABLES.map((table, index) => [table, values[index].map(cleanRecord)])), { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiOwner();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "create_schedule") {
      const item = (body.item ?? {}) as Record<string, unknown>;
      const kind = String(item.kind ?? "todo");
      const title = String(item.title ?? "").trim();
      if (!title || !["course", "ddl", "todo"].includes(kind)) return Response.json({ error: "标题或类型无效" }, { status: 400 });
      if (kind === "course" && (!item.weekday || !item.startTime || !item.endTime || !item.startDate || !item.endDate)) return Response.json({ error: "课表需要星期、时间和学期起止日期" }, { status: 400 });
      if (kind === "ddl" && !item.date) return Response.json({ error: "DDL 需要具体日期" }, { status: 400 });
      const normalized = JSON.stringify({ kind, title, date: item.date ?? null, weekday: item.weekday ?? null, startTime: item.startTime ?? null, endTime: item.endTime ?? null, startDate: item.startDate ?? null, endDate: item.endDate ?? null, projectId: item.projectId ?? null });
      const importHash = await sha256Text(normalized);
      const id = uid("sch");
      await runSql(`INSERT OR IGNORE INTO schedule_items (id,owner_id,kind,title,date,weekday,start_time,end_time,start_date,end_date,priority,status,project_id,notes,import_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, user.userId, kind, title, item.date ?? null, item.weekday ? Number(item.weekday) : null, item.startTime ?? null, item.endTime ?? null, item.startDate ?? null, item.endDate ?? null, item.priority ?? "medium", "open", item.projectId ?? null, item.notes ?? "", importHash);
      return Response.json({ ok: true, id });
    }

    if (action === "create_project") {
      const project = (body.project ?? {}) as Record<string, unknown>;
      if (!String(project.name ?? "").trim()) return Response.json({ error: "项目名称不能为空" }, { status: 400 });
      const id = uid("prj");
      await runSql(`INSERT INTO projects (id,owner_id,name,research_question,domain,status,repo_full_name,default_branch,local_path,next_step) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, user.userId, project.name, project.researchQuestion ?? "", project.domain ?? "ai_cs", "active", project.repoFullName ?? null, project.defaultBranch ?? "main", project.localPath ?? null, project.nextStep ?? "");
      return Response.json({ ok: true, id });
    }

    if (action === "create_activity") {
      const activity = (body.activity ?? {}) as Record<string, unknown>;
      if (!String(activity.title ?? "").trim()) return Response.json({ error: "活动标题不能为空" }, { status: 400 });
      const id = uid("act");
      await runSql(`INSERT INTO project_activities (id,owner_id,project_id,kind,title,occurred_at,content_json,source_refs_json) VALUES (?,?,?,?,?,?,?,?)`, id, user.userId, activity.projectId ?? null, activity.kind ?? "other", activity.title, activity.occurredAt ?? new Date().toISOString(), JSON.stringify(activity.content ?? {}), JSON.stringify(activity.sourceRefs ?? []));
      return Response.json({ ok: true, id });
    }

    if (action === "create_job") {
      const job = (body.job ?? {}) as Record<string, unknown>;
      const kind = String(job.kind ?? "") as JobKind;
      if (!JOB_KINDS.includes(kind)) return Response.json({ error: "不支持的任务类型" }, { status: 400 });
      const id = uid("job");
      const sourceIds = Array.isArray(job.sourceIds) ? job.sourceIds : [];
      await runSql(`INSERT INTO jobs (id,owner_id,kind,status,title,project_id,source_ids_json,parameters_json,input_snapshot_json,skill_name) VALUES (?,?,?,?,?,?,?,?,?,?)`, id, user.userId, kind, "ready", job.title ?? kind, job.projectId ?? null, JSON.stringify(sourceIds), JSON.stringify(job.parameters ?? {}), JSON.stringify({ sourceIds, capturedAt: new Date().toISOString() }), SKILL_BY_JOB[kind]);
      return Response.json({ ok: true, id });
    }

    if (action === "update_job") {
      const status = String(body.status ?? "");
      if (!["draft","ready","running","needs_input","completed","failed","cancelled"].includes(status)) return Response.json({ error: "任务状态无效" }, { status: 400 });
      await runSql(`UPDATE jobs SET status=?,summary=?,qa_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND deleted_at IS NULL`, status, body.summary ?? "", JSON.stringify(body.qa ?? {}), body.id, user.userId);
      return Response.json({ ok: true });
    }

    if (action === "save_selection") {
      const id = uid("sel");
      await runSql(`INSERT INTO paper_selections (id,owner_id,name,paper_ids_json) VALUES (?,?,?,?)`, id, user.userId, body.name ?? "未命名文献集合", JSON.stringify(body.paperIds ?? []));
      return Response.json({ ok: true, id });
    }

    if (action === "create_dataset_manifest") {
      const manifest = (body.manifest ?? {}) as Record<string, unknown>;
      const id = uid("data");
      const digest = (await sha256Text(JSON.stringify(manifest.entries ?? []))).slice(0, 8);
      const version = `${new Date().toISOString().slice(0,10).replaceAll("-", ".")}-${digest}`;
      await runSql(`INSERT INTO dataset_manifests (id,owner_id,project_id,name,version,git_commit,entries_json) VALUES (?,?,?,?,?,?,?)`, id, user.userId, manifest.projectId, manifest.name ?? "dataset", version, manifest.gitCommit ?? null, JSON.stringify(manifest.entries ?? []));
      return Response.json({ ok: true, id, version });
    }

    if (action === "generate_weekly_draft") {
      const weekStart = String(body.weekStart ?? ""); const weekEnd = String(body.weekEnd ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd) || weekStart > weekEnd) return Response.json({ error: "周报日期区间无效" }, { status: 400 });
      const activities = await allRows<Record<string, unknown>>(`SELECT * FROM project_activities WHERE owner_id=? AND deleted_at IS NULL AND substr(occurred_at,1,10) BETWEEN ? AND ? ORDER BY occurred_at`, user.userId, weekStart, weekEnd);
      const plans = await allRows<Record<string, unknown>>(`SELECT * FROM schedule_items WHERE owner_id=? AND deleted_at IS NULL AND kind='todo' AND status!='done' ORDER BY priority DESC,created_at`, user.userId);
      const ids = activities.map((row) => row.id);
      const markdown = renderWeeklyDraft(activities, plans);
      const jobId = uid("job"); const reportId = uid("report");
      const previous = await oneRow<{ version: number }>(`SELECT version FROM weekly_reports WHERE owner_id=? AND week_start=? AND week_end=? ORDER BY version DESC LIMIT 1`, user.userId, weekStart, weekEnd);
      const version = (previous?.version ?? 0) + 1;
      await runSql(`INSERT INTO jobs (id,owner_id,kind,status,title,source_ids_json,parameters_json,input_snapshot_json,skill_name) VALUES (?,?,?,?,?,?,?,?,?)`, jobId, user.userId, "weekly_report", "ready", `周报 ${weekStart} — ${weekEnd}`, JSON.stringify(ids), JSON.stringify({ weekStart, weekEnd }), JSON.stringify({ activityIds: ids, capturedAt: new Date().toISOString() }), SKILL_BY_JOB.weekly_report);
      await runSql(`INSERT INTO weekly_reports (id,owner_id,job_id,week_start,week_end,markdown,included_activity_ids_json,version) VALUES (?,?,?,?,?,?,?,?)`, reportId, user.userId, jobId, weekStart, weekEnd, markdown, JSON.stringify(ids), version);
      return Response.json({ ok: true, jobId, reportId, version, markdown });
    }

    if (action === "save_weekly_report") {
      const source = await oneRow<Record<string, unknown>>(`SELECT * FROM weekly_reports WHERE id=? AND owner_id=? AND deleted_at IS NULL`, body.id, user.userId);
      if (!source) return Response.json({ error: "周报不存在" }, { status: 404 });
      const id = uid("report"); const version = Number(source.version ?? 1) + 1;
      await runSql(`INSERT INTO weekly_reports (id,owner_id,job_id,week_start,week_end,markdown,included_activity_ids_json,version) VALUES (?,?,?,?,?,?,?,?)`, id, user.userId, source.job_id, source.week_start, source.week_end, body.markdown ?? "", source.included_activity_ids_json ?? "[]", version);
      return Response.json({ ok: true, id, version });
    }

    if (action === "soft_delete") {
      const allowed = new Set(TABLES); const table = String(body.table ?? "");
      if (!allowed.has(table as (typeof TABLES)[number])) return Response.json({ error: "无效实体" }, { status: 400 });
      await runSql(`UPDATE ${table} SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?`, body.id, user.userId);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "未知操作" }, { status: 400 });
  } catch (error) { return apiError(error); }
}
