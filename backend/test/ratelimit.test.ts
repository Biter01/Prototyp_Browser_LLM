import { describe, it, expect } from "vitest";
import { buildServer } from "../src/server.js";

describe("rate limit on POST /validate", () => {
  it("429 after 5 requests from same IP within a minute", async () => {
    const server = await buildServer();
    const body = { items: [{ offerId: "test", quantity: 1 }] };
    const opts = {
      method: "POST" as const,
      url: "/validate",
      body,
      headers: { "content-type": "application/json" },
    };

    for (let i = 0; i < 5; i++) {
      const res = await server.inject(opts);
      expect(res.statusCode).toBe(200);
    }

    const res6 = await server.inject(opts);
    expect(res6.statusCode).toBe(429);

    await server.close();
  });
});
