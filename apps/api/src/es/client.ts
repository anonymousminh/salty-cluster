import { Client } from "@elastic/elasticsearch";
import type { Config } from "../config";

export type Es = Client;

export function createEsClient(config: Pick<Config, "esUrl" | "esApiKey" | "esTimeoutMs">): Client {
  // The client emits OpenTelemetry spans for every request when an OTel SDK is registered,
  // so each Elasticsearch call shows up inside the API trace in Dash0.
  return new Client({
    node: config.esUrl,
    auth: config.esApiKey ? { apiKey: config.esApiKey } : undefined,
    requestTimeout: config.esTimeoutMs,
    maxRetries: 1,
  });
}
