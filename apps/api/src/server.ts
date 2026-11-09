import { loadConfig } from "./config";
import { createEsClient } from "./es/client";
import { buildApp } from "./app";

const config = loadConfig();
if (config.organizerToken === "dev-organizer" && process.env.NODE_ENV === "production") {
  console.error("ORGANIZER_TOKEN must be set in production");
  process.exit(1);
}
const app = buildApp({ es: createEsClient(config), config });

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
