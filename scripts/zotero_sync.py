#!/usr/bin/env python3
"""Read Zotero 7 safely and optionally push metadata to the private workbench.

This program never writes to zotero.sqlite. It copies the SQLite database plus
WAL/SHM sidecars into a temporary directory, queries the snapshot, and removes it.
"""
from __future__ import annotations

import argparse, hashlib, json, os, shutil, sqlite3, subprocess, tempfile, urllib.request
from pathlib import Path

FIELDS = {"title", "abstractNote", "publicationTitle", "date", "DOI", "url"}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def text_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def snapshot(database: Path) -> tuple[tempfile.TemporaryDirectory[str], Path]:
    temp = tempfile.TemporaryDirectory(prefix="research-workbench-zotero-")
    target = Path(temp.name) / "zotero.sqlite"
    shutil.copy2(database, target)
    for suffix in ("-wal", "-shm"):
        source = Path(str(database) + suffix)
        if source.exists(): shutil.copy2(source, Path(str(target) + suffix))
    return temp, target

def resolve_attachment(data_dir: Path, key: str, stored_path: str | None) -> Path | None:
    if not stored_path: return None
    if stored_path.startswith("storage:"):
        candidate = data_dir / "storage" / key / stored_path.removeprefix("storage:")
    else: candidate = Path(stored_path).expanduser()
    return candidate.resolve() if candidate.exists() else None

def export(database: Path, hash_attachments: bool = True) -> list[dict]:
    temp, copy = snapshot(database)
    try:
        db = sqlite3.connect(f"file:{copy}?mode=ro", uri=True)
        db.row_factory = sqlite3.Row
        items = db.execute("""
          SELECT i.itemID,i.libraryID,i.key,i.version,it.typeName
          FROM items i JOIN itemTypes it ON it.itemTypeID=i.itemTypeID
          LEFT JOIN deletedItems d ON d.itemID=i.itemID
          WHERE d.itemID IS NULL AND it.typeName NOT IN ('attachment','note','annotation')
        """).fetchall()
        ids = [row["itemID"] for row in items]
        output = {row["itemID"]: {"libraryId": row["libraryID"], "zoteroKey": row["key"], "zoteroVersion": row["version"], "itemType": row["typeName"], "authors": [], "tags": [], "collections": []} for row in items}
        if not ids: return []
        marks = ",".join("?" for _ in ids)
        for row in db.execute(f"SELECT d.itemID,f.fieldName,v.value FROM itemData d JOIN fieldsCombined f ON f.fieldID=d.fieldID JOIN itemDataValues v ON v.valueID=d.valueID WHERE d.itemID IN ({marks})", ids):
            if row["fieldName"] in FIELDS: output[row["itemID"]][row["fieldName"]] = row["value"]
        for row in db.execute(f"SELECT ic.itemID,c.firstName,c.lastName,ic.orderIndex FROM itemCreators ic JOIN creators c ON c.creatorID=ic.creatorID WHERE ic.itemID IN ({marks}) ORDER BY ic.itemID,ic.orderIndex", ids):
            output[row["itemID"]]["authors"].append(" ".join(filter(None, [row["firstName"], row["lastName"]])).strip())
        for row in db.execute(f"SELECT it.itemID,t.name FROM itemTags it JOIN tags t ON t.tagID=it.tagID WHERE it.itemID IN ({marks})", ids): output[row["itemID"]]["tags"].append(row["name"])
        for row in db.execute(f"SELECT ci.itemID,c.collectionName FROM collectionItems ci JOIN collections c ON c.collectionID=ci.collectionID WHERE ci.itemID IN ({marks})", ids): output[row["itemID"]]["collections"].append(row["collectionName"])
        attachments = db.execute(f"SELECT a.parentItemID,a.path,a.contentType,i.key FROM itemAttachments a JOIN items i ON i.itemID=a.itemID WHERE a.parentItemID IN ({marks}) AND a.contentType='application/pdf'", ids).fetchall()
        data_dir = database.parent
        for row in attachments:
            item = output.get(row["parentItemID"])
            if not item or item.get("attachmentPath"): continue
            path = resolve_attachment(data_dir, row["key"], row["path"])
            if path:
                item["attachmentPath"] = str(path)
                item["sourcePathFingerprint"] = text_fingerprint(str(path))
                if hash_attachments: item["attachmentHash"] = sha256(path)
        papers = []
        for item in output.values():
            title = str(item.pop("title", "")).strip()
            if not title: continue
            date = str(item.pop("date", "")); year = next((part[:4] for part in date.replace("/", "-").split("-") if len(part) >= 4 and part[:4].isdigit()), None)
            publication_title = item.pop("publicationTitle", None)
            doi = item.pop("DOI", None)
            url = item.pop("url", None)
            abstract = item.pop("abstractNote", "")
            papers.append({**item, "title": title, "year": year, "publicationTitle": publication_title, "doi": doi, "url": url, "abstract": abstract})
        return papers
    finally:
        temp.cleanup()

def keychain_token() -> str:
    result = subprocess.run(["security", "find-generic-password", "-s", "research-workbench-site-token", "-w"], check=True, capture_output=True, text=True)
    return result.stdout.strip()

def push(input_path: Path, site: str) -> dict:
    document = json.loads(input_path.read_text(encoding="utf-8"))
    for paper in document.get("papers", []):
        path = paper.pop("attachmentPath", None)
        if path and not paper.get("sourcePathFingerprint"):
            paper["sourcePathFingerprint"] = text_fingerprint(path)
    payload = json.dumps(document, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(site.rstrip("/") + "/api/bridge/zotero", data=payload, method="POST", headers={"content-type": "application/json", "OAI-Sites-Authorization": f"Bearer {keychain_token()}"})
    with urllib.request.urlopen(request, timeout=120) as response: return json.loads(response.read())

def main() -> None:
    parser = argparse.ArgumentParser()
    subs = parser.add_subparsers(dest="command", required=True)
    exp = subs.add_parser("export"); exp.add_argument("--database", type=Path, required=True); exp.add_argument("--output", type=Path, required=True); exp.add_argument("--skip-attachment-hash", action="store_true")
    send = subs.add_parser("push"); send.add_argument("--input", type=Path, required=True); send.add_argument("--site", required=True)
    args = parser.parse_args()
    if args.command == "export":
        papers = export(args.database.expanduser().resolve(), not args.skip_attachment_hash)
        args.output.write_text(json.dumps({"papers": papers}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"exported": len(papers), "output": str(args.output)}, ensure_ascii=False))
    else: print(json.dumps(push(args.input, args.site), ensure_ascii=False))

if __name__ == "__main__": main()
