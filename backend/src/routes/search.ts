import type { FastifyInstance } from "fastify";
import { getDataset } from "../dataset.js";
import { DEFAULT_LIMIT, MAX_LIMIT, resolveCategory, searchProducts } from "../search.js";
import type { SearchQuery } from "../types.js";

const errorSchema = {
  type: "object",
  properties: {
    statusCode: { type: "number" },
    error: { type: "string" },
    message: { type: "string" },
  },
};

export default async function (server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: SearchQuery }>("/search", {
    schema: {
      description:
        "Ähnlichkeitssuche: versteht deutsche Begriffe, toleriert Tippfehler, gewichtet Name > Marke/Attribute > Beschreibung. " +
        "Liefert höchstens `limit` Treffer, dazu die Gesamtzahl und Facetten zum Eingrenzen.",
      querystring: {
        type: "object",
        properties: {
          q: { type: "string", description: "Suchbegriffe, z. B. „Regenjacke“ oder „rain jacket“" },
          category: { type: "string", description: "Kategorie-ID oder Kategoriename" },
          gender: { type: "string", enum: ["male", "female", "unisex"] },
          color: { type: "string" },
          size: { type: "string" },
          minPrice: { type: "integer", minimum: 0, description: "in Cent" },
          maxPrice: { type: "integer", minimum: 0, description: "in Cent" },
          matchAll: { type: "boolean", default: false, description: "nur Produkte, die alle Suchbegriffe abdecken" },
          limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
        },
        additionalProperties: false,
      },
      response: {
        200: { $ref: "SearchResponse" },
        400: errorSchema,
      },
    },
  }, async (request, reply) => {
    const query = request.query;
    if (query.category && !resolveCategory(getDataset(), query.category)) {
      reply.code(400);
      return { statusCode: 400, error: "Bad Request", message: `Unknown category: ${query.category}` };
    }
    if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
      reply.code(400);
      return { statusCode: 400, error: "Bad Request", message: "minPrice must not be greater than maxPrice" };
    }
    return searchProducts(getDataset(), query);
  });
}
