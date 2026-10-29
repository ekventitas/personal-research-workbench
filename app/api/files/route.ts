import { env } from "cloudflare:workers";
import { apiError, requireApiOwner } from "@/lib/server-auth";
import { oneRow, runSql, uid } from "@/lib/repository";

export const dynamic = "force-dynamic";

function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export async function POST(request: Request) {
  try {
    const user = await requireApiOwner();
    if (!env.BUCKET) throw new Error("R2 binding BUCKET is unavailable");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择文件" }, { status: 400 });
    if (file.size > 250 * 1024 * 1024) return Response.json({ error: "单文件上限为 250 MB" }, { status: 413 });
    const kind = String(form.get("kind") ?? "artifact");
    if (kind === "paper_pdf" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return Response.json({ error: "文献附件必须是 PDF" }, { status: 415 });
    if (kind === "ppt_template" && !file.name.toLowerCase().endsWith(".pptx")) return Response.json({ error: "组会模板必须是 .pptx 文件" }, { status: 415 });
    const jobId = String(form.get("jobId") ?? "") || null;
    const projectId = String(form.get("projectId") ?? "") || null;
    const paperId = String(form.get("paperId") ?? "") || null;
    const bytes = await file.arrayBuffer();
    const sha256 = hex(await crypto.subtle.digest("SHA-256", bytes));
    const id = uid("art"); const version = `${new Date().toISOString().replaceAll(":", "").slice(0,15)}-${sha256.slice(0,8)}`;
    const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, "_");
    const objectKey = `${user.userId}/${kind}/${id}/${safeName}`;
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" }, customMetadata: { sha256, ownerId: user.userId } });
    await runSql(`INSERT INTO artifacts (id,owner_id,job_id,project_id,paper_id,kind,filename,mime_type,object_key,sha256,size_bytes,version,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, user.userId, jobId, projectId, paperId, kind, file.name, file.type || "application/octet-stream", objectKey, sha256, file.size, version, JSON.stringify({ uploadedFrom: "browser" }));
    if (kind === "ppt_template") {
      await runSql(`UPDATE ppt_templates SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE owner_id=? AND deleted_at IS NULL`, user.userId);
      await runSql(`INSERT INTO ppt_templates (id,owner_id,name,artifact_id,is_default) VALUES (?,?,?,?,1)`, uid("tpl"), user.userId, file.name.replace(/\.pptx$/i, ""), id);
    }
    if (paperId) await runSql(`UPDATE papers SET cloud_artifact_id=?,attachment_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?`, id, sha256, paperId, user.userId);
    return Response.json({ ok: true, artifact: { id, filename: file.name, kind, sha256, sizeBytes: file.size, version } });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const user = await requireApiOwner();
    if (!env.BUCKET) throw new Error("R2 binding BUCKET is unavailable");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    const artifact = await oneRow<{ object_key: string; filename: string; mime_type: string }>(`SELECT object_key,filename,mime_type FROM artifacts WHERE id=? AND owner_id=? AND deleted_at IS NULL`, id, user.userId);
    if (!artifact) return Response.json({ error: "文件不存在" }, { status: 404 });
    const object = await env.BUCKET.get(artifact.object_key);
    if (!object) return Response.json({ error: "对象不存在" }, { status: 404 });
    return new Response(object.body, { headers: { "content-type": artifact.mime_type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`, "cache-control": "private, no-store", etag: object.httpEtag } });
  } catch (error) { return apiError(error); }
}
