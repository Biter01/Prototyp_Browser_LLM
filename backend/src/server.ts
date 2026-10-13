import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rateLimit from "@fastify/rate-limit";
import { loadDataset } from "./dataset.js";
import healthRoute from "./routes/health.js";
import categoriesRoute from "./routes/categories.js";
import productsRoute from "./routes/products.js";
import vendorsRoute from "./routes/vendors.js";
import warehousesRoute from "./routes/warehouses.js";
import validateRoute from "./routes/validate.js";
import searchRoute from "./routes/search.js";

export async function buildServer(): Promise<FastifyInstance> {
  loadDataset();

  const server = Fastify({ logger: false });

  await server.register(swagger, {
    openapi: {
      info: {
        title: "Webshop Backend API",
        version: "1.0.0",
      },
    },
  });

  await server.register(swaggerUi, {
    routePrefix: "/docs",
  });

  await server.register(rateLimit, { global: false });

  server.addSchema({
    $id: "Category",
    type: "object",
    required: ["id", "name", "description"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
    },
  });

  server.addSchema({
    $id: "Offer",
    type: "object",
    required: ["id", "vendorId", "warehouseId", "price", "currency", "shippingCost", "deliveryDays", "stock"],
    properties: {
      id: { type: "string" },
      vendorId: { type: "string" },
      warehouseId: { type: "string" },
      price: { type: "number" },
      currency: { type: "string", enum: ["EUR"] },
      shippingCost: { type: "number" },
      freeShippingThreshold: { type: "number" },
      deliveryDays: {
        type: "object",
        required: ["min", "max"],
        properties: {
          min: { type: "number" },
          max: { type: "number" },
        },
      },
      stock: { type: "string", enum: ["NO", "LITTLE", "ALOT"] },
    },
  });

  server.addSchema({
    $id: "Variant",
    type: "object",
    required: ["id", "sku", "name", "offers"],
    properties: {
      id: { type: "string" },
      sku: { type: "string" },
      name: { type: "string" },
      attributes: { type: "object" },
      offers: {
        type: "array",
        items: { $ref: "Offer" },
      },
    },
  });

  server.addSchema({
    $id: "Product",
    type: "object",
    required: ["id", "categoryId", "name", "description", "tags", "variants"],
    properties: {
      id: { type: "string" },
      categoryId: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      brand: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      attributes: { type: "object" },
      variants: {
        type: "array",
        items: { $ref: "Variant" },
      },
    },
  });

  server.addSchema({
    $id: "Vendor",
    type: "object",
    required: ["id", "name", "rating"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      rating: { type: "number" },
    },
  });

  server.addSchema({
    $id: "Warehouse",
    type: "object",
    required: ["id", "name", "country"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      country: { type: "string" },
      packageTax: { type: "number" },
    },
  });

  server.addSchema({
    $id: "CartIssue",
    type: "object",
    required: ["code", "message"],
    properties: {
      code: {
        type: "string",
        enum: ["OFFER_NOT_FOUND", "INVALID_QUANTITY", "OUT_OF_STOCK", "VOUCHER_NOT_FOUND", "VOUCHER_EXPIRED", "VOUCHER_MIN_ORDER_NOT_MET"],
      },
      message: { type: "string" },
      offerId: { type: "string" },
    },
  });

  server.addSchema({
    $id: "ShipmentItem",
    type: "object",
    required: ["offerId", "productId", "variantId", "productName", "variantName", "quantity", "unitPrice", "lineTotal"],
    properties: {
      offerId: { type: "string" },
      productId: { type: "string" },
      variantId: { type: "string" },
      productName: { type: "string" },
      variantName: { type: "string" },
      quantity: { type: "integer" },
      unitPrice: { type: "number" },
      lineTotal: { type: "number" },
    },
  });

  server.addSchema({
    $id: "Shipment",
    type: "object",
    required: ["vendorId", "warehouseId", "items", "itemsSubtotal", "shippingCost", "packageTax", "deliveryDays"],
    properties: {
      vendorId: { type: "string" },
      warehouseId: { type: "string" },
      items: {
        type: "array",
        items: { $ref: "ShipmentItem" },
      },
      itemsSubtotal: { type: "number" },
      shippingCost: { type: "number" },
      packageTax: { type: "number" },
      deliveryDays: {
        type: "object",
        required: ["min", "max"],
        properties: {
          min: { type: "number" },
          max: { type: "number" },
        },
      },
    },
  });

  server.addSchema({
    $id: "Totals",
    type: "object",
    required: ["items", "shipping", "discount", "grand"],
    properties: {
      items: { type: "number" },
      shipping: { type: "number" },
      discount: { type: "number" },
      grand: { type: "number" },
    },
  });

  server.addSchema({
    $id: "ValidateResponse",
    type: "object",
    required: ["valid", "issues", "shipments", "totals", "packageCount"],
    properties: {
      valid: { type: "boolean" },
      issues: { type: "array", items: { $ref: "CartIssue" } },
      shipments: { type: "array", items: { $ref: "Shipment" } },
      totals: { $ref: "Totals" },
      deliveryDays: {
        nullable: true,
        type: "object",
        required: ["min", "max"],
        properties: {
          min: { type: "number" },
          max: { type: "number" },
        },
      },
      packageCount: { type: "integer" },
    },
  });

  server.addSchema({
    $id: "SearchHit",
    type: "object",
    required: ["id", "name", "categoryId", "categoryName", "priceFrom", "colors", "sizes", "genders", "score", "variants"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      brand: { type: "string" },
      categoryId: { type: "string" },
      categoryName: { type: "string" },
      priceFrom: { type: "number", nullable: true },
      colors: { type: "array", items: { type: "string" } },
      sizes: { type: "array", items: { type: "string" } },
      genders: { type: "array", items: { type: "string" } },
      score: { type: "number" },
      variants: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "name", "priceFrom", "offerId"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            priceFrom: { type: "number", nullable: true },
            offerId: { type: "string", nullable: true },
          },
        },
      },
    },
  });

  const countMap = { type: "object", additionalProperties: { type: "integer" } };
  server.addSchema({
    $id: "SearchResponse",
    type: "object",
    required: ["status", "total", "limit", "results", "facets"],
    properties: {
      status: { type: "string", enum: ["ok", "too_many", "not_found"] },
      total: { type: "integer" },
      limit: { type: "integer" },
      results: { type: "array", items: { $ref: "SearchHit" } },
      facets: {
        type: "object",
        required: ["category", "color", "size", "gender", "withColor", "withSize"],
        properties: {
          category: countMap, color: countMap, size: countMap, gender: countMap,
          withColor: { type: "integer" }, withSize: { type: "integer" },
        },
      },
    },
  });

  await server.register(healthRoute);
  await server.register(categoriesRoute);
  await server.register(productsRoute);
  await server.register(vendorsRoute);
  await server.register(warehousesRoute);
  await server.register(validateRoute);
  await server.register(searchRoute);

  return server;
}
