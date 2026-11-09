export interface Config {
  port: number;
  esUrl: string;
  esApiKey?: string;
  esTimeoutMs: number;
  organizerToken: string;
  playerSalt: string;
  /**
   * Serve the presence + chat WebSocket from this process. Presence lives in memory, so in a
   * multi-replica deployment exactly ONE replica must serve it (see deploy/k8s/realtime.yaml).
   */
  realtime: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8080),
    esUrl: env.ES_URL ?? "http://localhost:9200",
    esApiKey: env.ES_API_KEY || undefined,
    esTimeoutMs: Number(env.ES_TIMEOUT_MS ?? 5000),
    organizerToken: env.ORGANIZER_TOKEN ?? "dev-organizer",
    playerSalt: env.PLAYER_SALT ?? "meetspace-dev-salt",
    realtime: env.REALTIME_ENABLED !== "false",
  };
}
