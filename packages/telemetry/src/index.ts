/**
 * OpenTelemetry bootstrap shared by every Node service.
 *
 * Import this module FIRST in a service entry point so auto-instrumentation
 * (http, fastify, undici, pino, ...) can patch modules before they load.
 * Signals go over OTLP/HTTP to the collector (OTEL_EXPORTER_OTLP_ENDPOINT),
 * which forwards to Dash0.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | undefined;

export function startTelemetry(defaultServiceName: string): void {
  if (sdk || process.env.OTEL_SDK_DISABLED === "true") return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? defaultServiceName,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? "dev",
      "deployment.environment.name": process.env.DEPLOYMENT_ENVIRONMENT ?? "local",
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: 10_000 }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });
  sdk.start();

  const shutdown = () => {
    sdk?.shutdown().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
