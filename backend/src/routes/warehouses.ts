import type { FastifyInstance } from "fastify";
import { getDataset } from "../dataset.js";

export default async function (server: FastifyInstance): Promise<void> {
  server.get("/warehouses", {
    schema: {
      response: {
        200: {
          type: "array",
          items: { $ref: "Warehouse" },
        },
      },
    },
  }, async () => {
    return getDataset().warehouses;
  });
}
