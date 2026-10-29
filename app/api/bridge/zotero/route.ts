import { allRows, oneRow, runSql, uid } from "@/lib/repository";
import { apiError } from "@/lib/server-auth";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

function bridgeAuthorized(request: Request) {
  const expected = env.WORKBENCH_BRIDGE_SECRET;
  const supplied = request.headers.get("x-workbench-bridge-authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || expected.length !== supplied.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
}

async function ensureBridgeOwner() {
  const ownerId = env.WORKBENCH_OWNER_ID?.trim();
  const ownerEmail = env.WORKBENCH_OWNER_EMAIL?.trim();
  if (!ownerId || !ownerEmail) throw new Error("Workbench bridge owner is not configured");
  await runSql(
    `INSERT INTO owners (id,email,display_name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,updated_at=CURRENT_TIMESTAMP`,
    ownerId,
    ownerEmail,
    env.WORKBENCH_OWNER_NAME?.trim() || "Owner",
  );
  return ownerId;
}

export async function POST(request: Request) {
  try {
    if (!bridgeAuthorized(request)) return Response.json({ error: "Bridge authentication required" }, { status: 401 });
    const ownerId = await ensureBridgeOwner();
    const owner = await allRows<{ id: string }>(`SELECT id FROM owners WHERE id=? LIMIT 1`, ownerId);
    const payload = await request.json() as { papers?: Record<string, unknown>[] };
    const papers = Array.isArray(payload.papers) ? payload.papers.slice(0, 5000) : [];
    let imported = 0;
    for (const paper of papers) {
      if (!String(paper.zoteroKey ?? "").trim() || !String(paper.title ?? "").trim()) continue;
      const libraryId = Number(paper.libraryId ?? 1);
      const zoteroVersion = Number(paper.zoteroVersion ?? 0);
      const existing = await oneRow<{ zotero_version: number }>(`SELECT zotero_version FROM papers WHERE owner_id=? AND library_id=? AND zotero_key=?`, owner[0].id, libraryId, paper.zoteroKey);
      if (existing && existing.zotero_version >= zoteroVersion) continue;
      const id = uid("paper");
      await runSql(`INSERT INTO papers (id,owner_id,zotero_key,zotero_version,library_id,title,authors_json,year,publication_title,doi,url,abstract,tags_json,collections_json,source_path_fingerprint,attachment_hash,synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(owner_id,library_id,zotero_key) DO UPDATE SET zotero_version=excluded.zotero_version,title=excluded.title,authors_json=excluded.authors_json,year=excluded.year,publication_title=excluded.publication_title,doi=excluded.doi,url=excluded.url,abstract=excluded.abstract,tags_json=excluded.tags_json,collections_json=excluded.collections_json,source_path_fingerprint=excluded.source_path_fingerprint,attachment_hash=excluded.attachment_hash,synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`, id, owner[0].id, paper.zoteroKey, zoteroVersion, libraryId, paper.title, JSON.stringify(paper.authors ?? []), paper.year ?? null, paper.publicationTitle ?? null, paper.doi ?? null, paper.url ?? null, paper.abstract ?? "", JSON.stringify(paper.tags ?? []), JSON.stringify(paper.collections ?? []), paper.sourcePathFingerprint ?? null, paper.attachmentHash ?? null);
      imported++;
    }
    return Response.json({ ok: true, imported });
  } catch (error) { return apiError(error); }
}
