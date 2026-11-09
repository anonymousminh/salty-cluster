// Telemetry must start before fastify, pino and the Elasticsearch client are loaded.
import { startTelemetry } from "@meetspace/telemetry";
startTelemetry("api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./server");
