import { buildServer } from "../src/server.js";
import { writeFileSync } from "node:fs";

const server = await buildServer();
await server.ready();
const yamlSpec: string = server.swagger({ yaml: true });
writeFileSync("openapi.yaml", yamlSpec);
await server.close();
