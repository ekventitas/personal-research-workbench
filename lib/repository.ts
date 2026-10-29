import { env } from "cloudflare:workers";

export async function allRows<T = Record<string, unknown>>(sql: string, ...bindings: unknown[]): Promise<T[]> {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  const result = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

export async function oneRow<T = Record<string, unknown>>(sql: string, ...bindings: unknown[]): Promise<T | null> {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return (await env.DB.prepare(sql).bind(...bindings).first<T>()) ?? null;
}

export async function runSql(sql: string, ...bindings: unknown[]) {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB.prepare(sql).bind(...bindings).run();
}

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function cleanRecord<T extends Record<string, unknown>>(row: T): T {
  const output = { ...row } as Record<string, unknown>;
  for (const key of Object.keys(output)) {
    if (key.endsWith("_json") && typeof output[key] === "string") {
      try { output[key.slice(0, -5)] = JSON.parse(output[key] as string); } catch { output[key.slice(0, -5)] = null; }
    }
  }
  return output as T;
}
