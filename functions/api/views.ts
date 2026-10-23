import { authorize } from "../viewsAuth";
import {
  json,
  rejectMode,
  rejectName,
  rejectQuery,
  rowToView,
  type ViewRow,
  type ViewsDb,
} from "../viewRows";

interface PagesContext {
  request: Request;
  env: { VIEWS_DB: ViewsDb };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Not found", { status: 404 });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const denied = await authorize(context.request);
  if (denied) return denied;
  const listed = await context.env.VIEWS_DB.prepare(
    "SELECT id, name, query_json, mode, updated_at FROM views ORDER BY name",
  ).all<ViewRow>();
  const views = listed.results.flatMap((row) => {
    const view = rowToView(row);
    return view ? [view] : [];
  });
  return json(views);
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const denied = await authorize(context.request);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const input = body as { name?: unknown; query?: unknown; mode?: unknown };
  const nameError = rejectName(input.name);
  if (nameError) return nameError;
  const query = rejectQuery(input.query);
  if (query instanceof Response) return query;
  const mode = rejectMode(input.mode);
  if (mode instanceof Response) return mode;

  const id = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  await context.env.VIEWS_DB.prepare(
    "INSERT INTO views (id, name, query_json, mode, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, input.name, JSON.stringify(query), mode, updatedAt).run();

  return json({ id, name: input.name, query, mode }, 201);
}
