const LINEAR_API = "https://api.linear.app/graphql";

/**
 * The Pages environment the saved-view routes read.
 *
 * The workspace that may use the saved views is a deployment setting, so a
 * different workspace is configured by setting the variable and redeploying.
 */
export interface ViewsEnv {
  /** The url key of the workspace that owns the saved views. */
  VIEWS_WORKSPACE_URL_KEY?: string;
}

type FetchLike = typeof fetch;

export async function authorize(request: Request, env: ViewsEnv, fetchImpl: FetchLike = fetch): Promise<Response | null> {
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

  // The token is a real one, so the deployment is what decides now. A missing
  // workspace url key is a configuration error: the request is refused
  // instead of every workspace being let in.
  const workspaceUrlKey = env?.VIEWS_WORKSPACE_URL_KEY?.trim() ?? "";
  if (workspaceUrlKey === "") {
    return new Response(
      "Saved views are not configured: set VIEWS_WORKSPACE_URL_KEY to the url key of the workspace that owns them.",
      { status: 500 },
    );
  }

  if (urlKey !== workspaceUrlKey) return new Response("Forbidden", { status: 403 });
  return null;
}
