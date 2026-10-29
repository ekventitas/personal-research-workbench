import { apiError, requireApiOwner } from "@/lib/server-auth";
import { allRows, runSql, sha256Text, uid } from "@/lib/repository";

export const dynamic = "force-dynamic";

const expected = ["type","title","date","weekday","start_time","end_time","start_date","end_date","priority","project","notes"];

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = ""; if (row.some(Boolean)) rows.push(row); row = []; continue;
    }
    cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function weekdayNumber(value: string) {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, number> = { "1":1,"一":1,"周一":1,"monday":1,"mon":1,"2":2,"二":2,"周二":2,"tuesday":2,"tue":2,"3":3,"三":3,"周三":3,"wednesday":3,"wed":3,"4":4,"四":4,"周四":4,"thursday":4,"thu":4,"5":5,"五":5,"周五":5,"friday":5,"fri":5,"6":6,"六":6,"周六":6,"saturday":6,"sat":6,"7":7,"日":7,"周日":7,"sunday":7,"sun":7 };
  return map[normalized] ?? null;
}

export async function POST(request: Request) {
  try {
    const user = await requireApiOwner();
    const { csv, mode = "preview" } = await request.json() as { csv?: string; mode?: string };
    const rows = parseCsv(csv ?? "");
    if (rows.length < 2) return Response.json({ error: "CSV 至少需要表头和一条数据" }, { status: 400 });
    const headers = rows[0].map((value) => value.toLowerCase());
    const index = Object.fromEntries(expected.map((name) => [name, headers.indexOf(name)]));
    if (index.type < 0 || index.title < 0) return Response.json({ error: "CSV 必须包含 type 与 title 列" }, { status: 400 });
    const existing = new Set((await allRows<{ import_hash: string }>(`SELECT import_hash FROM schedule_items WHERE owner_id=? AND deleted_at IS NULL`, user.userId)).map((row) => row.import_hash));
    const accepted: Record<string, unknown>[] = []; const errors: Record<string, unknown>[] = []; const duplicates: Record<string, unknown>[] = [];
    for (let offset = 1; offset < rows.length; offset++) {
      const raw = rows[offset]; const get = (name: string) => index[name] >= 0 ? (raw[index[name]] ?? "").trim() : "";
      const type = get("type").toLowerCase(); const title = get("title"); const weekday = weekdayNumber(get("weekday"));
      const record = { kind: type, title, date: get("date") || null, weekday, startTime: get("start_time") || null, endTime: get("end_time") || null, startDate: get("start_date") || null, endDate: get("end_date") || null, priority: get("priority") || "medium", project: get("project") || null, notes: get("notes") };
      const issue = !["course","ddl","todo"].includes(type) ? "type 必须为 course、ddl 或 todo" : !title ? "title 不能为空" : type === "course" && (!weekday || !record.startTime || !record.endTime || !record.startDate || !record.endDate) ? "课表缺少星期、时间或学期日期" : type === "ddl" && !record.date ? "DDL 缺少 date" : null;
      if (issue) { errors.push({ line: offset + 1, issue, record }); continue; }
      const importHash = await sha256Text(JSON.stringify({ kind: type, title, date: record.date, weekday, startTime: record.startTime, endTime: record.endTime, startDate: record.startDate, endDate: record.endDate, project: record.project }));
      const item = { ...record, importHash, line: offset + 1 };
      if (existing.has(importHash)) duplicates.push(item); else { accepted.push(item); existing.add(importHash); }
    }
    if (mode === "commit") {
      for (const item of accepted) await runSql(`INSERT OR IGNORE INTO schedule_items (id,owner_id,kind,title,date,weekday,start_time,end_time,start_date,end_date,priority,status,notes,import_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, uid("sch"), user.userId, item.kind, item.title, item.date, item.weekday, item.startTime, item.endTime, item.startDate, item.endDate, item.priority, "open", item.notes, item.importHash);
    }
    return Response.json({ headers, accepted, errors, duplicates, committed: mode === "commit" ? accepted.length : 0 });
  } catch (error) { return apiError(error); }
}
