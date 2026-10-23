const LINEAR_API = "https://api.linear.app/graphql";
const WORKSPACE_URL_KEY = "siig";

type FetchLike = typeof fetch;

export async function authorize(request: Request, fetchImpl: FetchLike = fetch): Promise<Response | null> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  const token = match?.[1]?.trim() ?? "";
  if (token === "") return new Response("Unauthorized", { status: 401 });

  let response: Response;
  try {
    response = await fetchImpl(LINEAR_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "{ viewer { organization { urlKey } } }" }),
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!response.ok) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const record = body as { errors?: unknown; data?: { viewer?: { organization?: { urlKey?: string } } } };
  if (record.errors) return new Response("Unauthorized", { status: 401 });
  const urlKey = record.data?.viewer?.organization?.urlKey;
  if (urlKey !== WORKSPACE_URL_KEY) return new Response("Forbidden", { status: 403 });
  return null;
}
