/**
 * End-to-end smoke tests for every mounted backend route (#261).
 *
 * These don't test business logic. They build the real Express app from
 * `createApp()` and hit each route's basic contract, so CI fails if:
 *   - the app can't be built (a broken import or route wiring), or
 *   - a route loses its auth guard or its basic response shape.
 *
 * Run on their own with `yarn workspace @truestub/backend test:smoke`.
 * `backend-ci.yml` also boots the compiled server and checks `/health`.
 */
import request from "supertest";
import type { Express } from "express";

// Must be set before the app (and config/env.ts) is loaded, so the webhook
// route reaches its signature check instead of failing on missing config.
process.env.TRUSTLESS_WORK_WEBHOOK_SECRET = "smoke-test-secret";
process.env.LOG_LEVEL = "silent";

const { createApp } = require("./index") as typeof import("./index");

let app: Express;

beforeAll(() => {
  app = createApp();
});

/**
 * One representative request per auth-protected route. Every one of these
 * must be rejected with 401 when no token, or an invalid token, is sent.
 * (In NODE_ENV=test Firebase Admin rejects every token, so no network call
 * is made.)
 */
const PROTECTED_ROUTES: Array<{ method: "get" | "post" | "delete"; path: string }> = [
  // listings: reads are public, writes need auth
  { method: "post", path: "/api/listings" },
  { method: "get", path: "/api/saved-searches" },
  { method: "post", path: "/api/saved-searches" },
  { method: "get", path: "/api/watchlist" },
  { method: "post", path: "/api/watchlist" },
  { method: "post", path: "/api/refunds/claim" },
  { method: "get", path: "/api/refunds/claim/smoke-refund" },
  { method: "post", path: "/api/transfers/initiate" },
  { method: "get", path: "/api/transfers/smoke-transfer" },
  { method: "post", path: "/api/changelog" },
  { method: "get", path: "/api/changelog/smoke-entry" },
  { method: "get", path: "/api/changelog/resource/smoke-resource" },
  { method: "post", path: "/api/disputes" },
  { method: "get", path: "/api/disputes/mine" },
  { method: "get", path: "/api/disputes/smoke-dispute" },
  { method: "post", path: "/api/users/reviews" },
  { method: "delete", path: "/api/users/me" },
];

describe("backend smoke: app boots", () => {
  it("GET /health returns 200 with the service name", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "truestub-backend" });
  });

  it("returns 404 for an unknown route instead of crashing", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
  });
});

describe("backend smoke: auth-required routes", () => {
  it.each(PROTECTED_ROUTES)(
    "$method $path returns 401 without a token",
    async ({ method, path }) => {
      const res = await request(app)[method](path).send({});

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    },
  );

  it.each(PROTECTED_ROUTES)(
    "$method $path returns 401 with an invalid token",
    async ({ method, path }) => {
      const res = await request(app)[method](path)
        .set("Authorization", "Bearer not-a-real-token")
        .send({});

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    },
  );
});

describe("backend smoke: webhooks", () => {
  it("POST /webhooks/escrow-status rejects a request with no signature", async () => {
    const res = await request(app)
      .post("/webhooks/escrow-status")
      .send({ contractId: "smoke", status: "funded" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /webhooks/escrow-status rejects a request with a bad signature", async () => {
    const res = await request(app)
      .post("/webhooks/escrow-status")
      .set("x-trustless-work-signature", "sha256=deadbeef")
      .send({ contractId: "smoke", status: "funded" });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });
});
