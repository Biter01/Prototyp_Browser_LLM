import type { FastifyInstance } from "fastify";
import type { ValidateRequest } from "../types.js";
import { getDataset } from "../dataset.js";
import { validateCart } from "../validate.js";

export default async function (server: FastifyInstance): Promise<void> {
  server.post("/validate", {
    schema: {
      description: "Validate cart items and voucher code. Rate-limited to 5 requests per minute per IP.",
      body: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["offerId", "quantity"],
              properties: {
                offerId: { type: "string" },
                quantity: { type: "integer", minimum: 1 },
              },
            },
          },
          voucherCode: { type: "string" },
        },
      },
      response: {
        200: { $ref: "ValidateResponse" },
        429: {
          description: "Rate limit exceeded. Maximum 5 requests per minute per IP.",
          type: "object",
          properties: {
            statusCode: { type: "number" },
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60_000,
      },
    },
  }, async (request) => {
    const body = request.body as ValidateRequest;
    return validateCart(body, getDataset());
  });
}
