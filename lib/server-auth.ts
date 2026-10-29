import { getChatGPTUser } from "@/app/chatgpt-auth";
export async function requireApiOwner() {
  const user = await getChatGPTUser();
  if (!user) throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}
export function apiError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
}
