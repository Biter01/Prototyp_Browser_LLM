import type { FastifyInstance } from "fastify";
import { getDataset, getCategoryById } from "../dataset.js";

export default async function (server: FastifyInstance): Promise<void> {
  server.get("/categories", {
    schema: {
      response: {
        200: {
          type: "array",
          items: { $ref: "Category" },
        },
      },
    },
  }, async () => {
    return getDataset().categories;
  });

  server.get<{ Params: { id: string } }>("/categories/:id/products", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      response: {
        200: {
          type: "array",
          items: { $ref: "Product" },
        },
        404: {
          type: "object",
          properties: {
            statusCode: { type: "number" },
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  }, async (request, reply) => {
    const category = getCategoryById().get(request.params.id);
    if (!category) {
      reply.code(404);
      return { statusCode: 404, error: "Not Found", message: "Category not found" };
    }
    return getDataset().products.filter(p => p.categoryId === request.params.id);
  });
}
