import { describe, expect, it } from "vitest";
import { authorize } from "./viewsAuth";

function request(): Request {
  return new Request("https://planner.example/api/views", {
    headers: { Authorization: "Bearer token" },
  });
}

function linearFetch(urlKey: string): typeof fetch {
  return (async (url: string | URL | Request) => {
    expect(String(url)).toBe("https://api.linear.app/graphql");
    return new Response(
      JSON.stringify({ data: { viewer: { organization: { urlKey } } } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
}

describe("authorize", () => {
  it("returns 403 when the viewer urlKey is not siig", async () => {
    const response = await authorize(request(), linearFetch("other"));
    expect(response?.status).toBe(403);
  });

  it("continues when the viewer urlKey is siig", async () => {
    const response = await authorize(request(), linearFetch("siig"));
    expect(response).toBeNull();
  });
});
