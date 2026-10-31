import { authorize, type ViewsEnv } from "../../viewsAuth";
import {
  json,
  rejectMode,
  rejectName,
  rejectQuery,
  rowToView,
  type ViewRow,
  type ViewsDb,
} from "../../viewRows";

interface PagesContext {
  request: Request;
  env: ViewsEnv & { VIEWS_DB: ViewsDb };
  params: { id: string };
}

async function readRow(db: ViewsDb, id: string): Promise<ViewRow | null> {
  return db.prepare(
    "SELECT id, name, query_json, mode, updated_at FROM views WHERE id = ?",
  ).bind(id).first<ViewRow>();
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return new Response("Not found", { status: 404 });
}

export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const denied = await authorize(context.request, context.env);
  if (denied) return denied;
  const existing = await readRow(context.env.VIEWS_DB, context.params.id);
  if (!existing) return json({ error: "Not found" }, 404);
  const current = rowToView(existing);
  if (!current) return json({ error: "Not found" }, 404);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const patch = body as { name?: unknown; query?: unknown; mode?: unknown };
  let name = current.name;
  let query = current.query;
  let mode = current.mode;
  if ("name" in patch) {
    const nameError = rejectName(patch.name);
    if (nameError) return nameError;
    name = patch.name as string;
  }
  if ("query" in patch) {
    const parsed = rejectQuery(patch.query);
    if (parsed instanceof Response) return parsed;
    query = parsed;
  }
  if ("mode" in patch) {
    const parsed = rejectMode(patch.mode);
    if (parsed instanceof Response) return parsed;
    mode = parsed;
  }

  const updatedAt = new Date().toISOString();
  await context.env.VIEWS_DB.prepare(
    "UPDATE views SET name = ?, query_json = ?, mode = ?, updated_at = ? WHERE id = ?",
  ).bind(name, JSON.stringify(query), mode, updatedAt, context.params.id).run();
  return json({ id: context.params.id, name, query, mode });
}

export async function onRequestDelete(context: PagesContext): Promise<Response> {
  const denied = await authorize(context.request, context.env);
  if (denied) return denied;
  const existing = await readRow(context.env.VIEWS_DB, context.params.id);
  if (!existing) return json({ error: "Not found" }, 404);
  await context.env.VIEWS_DB.prepare("DELETE FROM views WHERE id = ?").bind(context.params.id).run();
  return new Response(null, { status: 204 });
}
