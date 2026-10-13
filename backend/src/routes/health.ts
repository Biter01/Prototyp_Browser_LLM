import type { FastifyInstance } from "fastify";

export default async function (server: FastifyInstance): Promise<void> {
  server.get("/health", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
          },
        },
      },
    },
  }, async () => {
    return { status: "ok" };
  });
}
