import type { FastifyInstance } from "fastify";
import { getDataset, getProductById } from "../dataset.js";

export default async function (server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: { category?: string; q?: string; minPrice?: string; maxPrice?: string } }>("/products", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          category: { type: "string" },
          q: { type: "string" },
          minPrice: { type: "string" },
          maxPrice: { type: "string" },
        },
        additionalProperties: true,
      },
      response: {
        200: {
          type: "array",
          items: { $ref: "Product" },
        },
      },
    },
  }, async (request) => {
    const { category, q, minPrice, maxPrice } = request.query;
    let products = getDataset().products;

    if (category) {
      products = products.filter(p => p.categoryId === category);
    }

    if (q) {
      const lowerQ = q.toLowerCase();
      products = products.filter(p =>
        p.name.toLowerCase().includes(lowerQ) ||
        p.description.toLowerCase().includes(lowerQ) ||
        (p.brand ?? "").toLowerCase().includes(lowerQ) ||
        p.tags.some(t => t.toLowerCase().includes(lowerQ))
      );
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      const min = minPrice !== undefined ? Number(minPrice) : -Infinity;
      const max = maxPrice !== undefined ? Number(maxPrice) : Infinity;
      products = products.filter(p =>
        p.variants.some(v =>
          v.offers.some(o => o.price >= min && o.price <= max)
        )
      );
    }

    return products;
  });

  server.get<{ Params: { id: string } }>("/products/:id", {
    schema: {
      params: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      response: {
        200: { $ref: "Product" },
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
    const product = getProductById().get(request.params.id);
    if (!product) {
      reply.code(404);
      return { statusCode: 404, error: "Not Found", message: "Product not found" };
    }
    return product;
  });
}
