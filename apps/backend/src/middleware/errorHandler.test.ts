import express from "express";
import request from "supertest";

// NODE_ENV is read per request through a getter so each test can switch it.
let mockNodeEnv: "development" | "production" | "test" = "production";
jest.mock("../config/env", () => ({
  env: {
    get NODE_ENV() {
      return mockNodeEnv;
    },
  },
}));

jest.mock("../lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock("../lib/sentry", () => ({
  Sentry: { captureException: jest.fn() },
}));

import { AppError, errorHandler } from "./errorHandler";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";

const SECRET_DETAIL = "db password=hunter2 at /srv/app/internal.ts:42";

function buildApp() {
  const app = express();
  app.use(express.json());

  app.get("/app-error", () => {
    throw new AppError(404, "ESCROW_NOT_FOUND", "Escrow abc not found");
  });
  app.get("/cors", () => {
    throw new Error("CORS: origin https://evil.example not allowed");
  });
  app.post("/json", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/boom", () => {
    throw new Error(SECRET_DETAIL);
  });
  app.get("/boom-non-error", () => {
    throw "a raw string was thrown";
  });

  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockNodeEnv = "production";
});

describe("errorHandler — consistent error shape", () => {
  it("maps AppError to its status and { error: { code, message } }", async () => {
    const res = await request(buildApp()).get("/app-error");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: { code: "ESCROW_NOT_FOUND", message: "Escrow abc not found" },
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("maps CORS rejections to 403 CORS_FORBIDDEN without echoing the origin", async () => {
    const res = await request(buildApp()).get("/cors");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "CORS_FORBIDDEN", message: "Cross-origin request blocked." },
    });
    expect(JSON.stringify(res.body)).not.toContain("evil.example");
  });

  it("maps malformed JSON bodies to 400 INVALID_JSON", async () => {
    const res = await request(buildApp())
      .post("/json")
      .set("Content-Type", "application/json")
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body contains invalid JSON." },
    });
  });

  it("maps unknown errors to a generic 500", async () => {
    const res = await request(buildApp()).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred. Please try again later.",
      },
    });
  });

  it("handles thrown non-Error values with the same generic 500 shape", async () => {
    const res = await request(buildApp()).get("/boom-non-error");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(res.body.error).not.toHaveProperty("stack");
    expect(JSON.stringify(res.body)).not.toContain("raw string");
  });
});

describe("errorHandler — no internals leaked outside development", () => {
  it.each(["production", "test"] as const)(
    "omits the stack trace and original message when NODE_ENV=%s",
    async (nodeEnv) => {
      mockNodeEnv = nodeEnv;
      const res = await request(buildApp()).get("/boom");

      expect(res.status).toBe(500);
      expect(res.body.error).not.toHaveProperty("stack");
      expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
      expect(res.text).not.toContain("hunter2");
      expect(res.text).not.toContain("internal.ts");
    }
  );

  it("includes the stack trace only when NODE_ENV=development", async () => {
    mockNodeEnv = "development";
    const res = await request(buildApp()).get("/boom");

    expect(res.status).toBe(500);
    expect(typeof res.body.error.stack).toBe("string");
    expect(res.body.error.stack).toContain(SECRET_DETAIL);
  });

  it("still logs and reports the full error server-side", async () => {
    await request(buildApp()).get("/boom");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Unhandled error"
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: SECRET_DETAIL })
    );
  });
});
