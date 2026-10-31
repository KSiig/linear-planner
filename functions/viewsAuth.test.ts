import { describe, expect, it } from "vitest";
import { authorize } from "./viewsAuth";

const SIIG_ENV = { VIEWS_WORKSPACE_URL_KEY: "siig" };

function request(token = "token"): Request {
  return new Request("https://planner.example/api/views", {
    headers: { Authorization: `Bearer ${token}` },
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
  it("returns 403 when the viewer urlKey is not the configured workspace", async () => {
    const response = await authorize(request(), SIIG_ENV, linearFetch("other"));
    expect(response?.status).toBe(403);
  });

  it("continues when the viewer urlKey is the configured workspace", async () => {
    const response = await authorize(request(), SIIG_ENV, linearFetch("siig"));
    expect(response).toBeNull();
  });

  it("authorizes another workspace when the deployment points at it", async () => {
    const response = await authorize(request(), { VIEWS_WORKSPACE_URL_KEY: "other" }, linearFetch("other"));
    expect(response).toBeNull();
  });

  it("returns a configuration error when the deployment has no workspace url key", async () => {
    const response = await authorize(request(), {}, linearFetch("siig"));
    expect(response?.status).toBe(500);
    expect(await response?.text()).toContain("VIEWS_WORKSPACE_URL_KEY");
  });

  it("returns a configuration error when the deployment value is blank", async () => {
    const response = await authorize(request(), { VIEWS_WORKSPACE_URL_KEY: "  " }, linearFetch("siig"));
    expect(response?.status).toBe(500);
    expect(await response?.text()).toContain("VIEWS_WORKSPACE_URL_KEY");
  });

  it("returns 401 when the request carries no bearer token", async () => {
    const response = await authorize(new Request("https://planner.example/api/views"), SIIG_ENV, linearFetch("siig"));
    expect(response?.status).toBe(401);
  });
});
