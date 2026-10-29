// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOAuthScopeError, reauthorizeWithWriteScope, startLogin } from "./auth";

const originalLocation = window.location;

beforeEach(() => {
  vi.stubEnv("VITE_LINEAR_CLIENT_ID", "test-client");
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "http://localhost", href: "http://localhost/" },
  });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("OAuth authorization", () => {
  it("always requests read and write scopes", async () => {
    await startLogin();

    const url = new URL(window.location.href);
    expect(url.searchParams.get("scope")).toBe("read,write");
  });

  it("starts a fresh read and write authorization after a scope failure", async () => {
    localStorage.setItem("linear-planner-auth", "existing-tokens");

    await reauthorizeWithWriteScope(new Error("Invalid scope: write required"));

    const url = new URL(window.location.href);
    expect(url.searchParams.get("scope")).toBe("read,write");
    expect(localStorage.getItem("linear-planner-auth")).toBe("existing-tokens");
  });

  it("does not reauthorize for unrelated failures", async () => {
    localStorage.setItem("linear-planner-auth", "existing-tokens");
    const originalHref = window.location.href;

    await reauthorizeWithWriteScope(new Error("Invalid input: issueId is required"));

    expect(window.location.href).toBe(originalHref);
    expect(localStorage.getItem("linear-planner-auth")).toBe("existing-tokens");
  });
});

describe("isOAuthScopeError", () => {
  it("recognizes Linear's flattened GraphQL scope error", () => {
    expect(isOAuthScopeError(new Error("Invalid scope: write required"))).toBe(true);
    expect(isOAuthScopeError(new Error("Invalid scope: `write` required."))).toBe(true);
  });

  it("recognizes Linear's structured GraphQL scope error", () => {
    const error = {
      status: 400,
      errors: [{
        message: "Invalid scope: write required",
        extensions: { code: "FORBIDDEN" },
      }],
    };

    expect(isOAuthScopeError(error)).toBe(true);
  });

  it("recognizes a scope error embedded in an HTTP error body", () => {
    const body = JSON.stringify({
      errors: [{
        message: "Invalid scope: write required",
        extensions: { code: "FORBIDDEN" },
      }],
    });

    expect(isOAuthScopeError(new Error(`Linear API error 400: ${body}`))).toBe(true);
    expect(isOAuthScopeError(new Error(`Linear API error 403: ${body}`))).toBe(true);
  });

  it("rejects validation errors", () => {
    expect(isOAuthScopeError(new Error("Invalid input: issueId is required"))).toBe(false);
  });

  it("rejects network errors", () => {
    expect(isOAuthScopeError(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("rejects ordinary GraphQL errors", () => {
    expect(isOAuthScopeError(new Error("Entity not found"))).toBe(false);
  });

  it("rejects permission failures that are not scope failures", () => {
    const body = JSON.stringify({
      errors: [{
        message: "You do not have permission to perform this action",
        extensions: { code: "FORBIDDEN" },
      }],
    });

    expect(isOAuthScopeError(new Error(`Linear API error 400: ${body}`))).toBe(false);
  });

  it("rejects server failures even when they contain a forbidden code", () => {
    const body = JSON.stringify({
      errors: [{
        message: "Invalid scope: write required",
        extensions: { code: "FORBIDDEN" },
      }],
    });

    expect(isOAuthScopeError(new Error(`Linear API error 500: ${body}`))).toBe(false);
  });
});
