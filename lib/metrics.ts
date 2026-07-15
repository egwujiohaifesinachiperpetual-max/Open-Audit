import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from "@opentelemetry/api";

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "open_audit_",
  timeout: 5000,
});

export const eventsIngestedTotal = new Counter({
  name: "open_audit_events_ingested_total",
  help: "Number of events ingested by contract and status.",
  labelNames: ["contract_id", "status"] as const,
  registers: [metricsRegistry],
});

export const rpcRequestDurationSeconds = new Histogram({
  name: "open_audit_rpc_request_duration_seconds",
  help: "Duration of Stellar RPC getEvents requests in seconds.",
  labelNames: ["contract_id"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const translationProcessingMs = new Histogram({
  name: "open_audit_translation_processing_ms",
  help: "Translation processing time in milliseconds per contract.",
  labelNames: ["contract_id"] as const,
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [metricsRegistry],
});

// OTLP gRPC endpoint — Jaeger 1.35+ accepts OTLP natively on port 4317.
// Set OTEL_EXPORTER_OTLP_ENDPOINT in your environment to override (e.g. "http://jaeger:4317").
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4317";
const serviceName = process.env.OTEL_SERVICE_NAME ?? "open-audit";

export const tracer = trace.getTracer("open-audit");

let telemetrySdk: { start: () => Promise<void>; shutdown: () => Promise<void> } | null = null;

export async function startTelemetry(): Promise<void> {
  if (telemetrySdk) {
    return;
  }

  try {
    const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }, { resourceFromAttributes }, { SemanticResourceAttributes }] = await Promise.all([
      import("@opentelemetry/sdk-node"),
      import("@opentelemetry/exporter-trace-otlp-grpc"),
      import("@opentelemetry/instrumentation-http"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);

    telemetrySdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: otlpEndpoint,
      }),
      instrumentations: [new HttpInstrumentation()],
      resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      }),
    });

    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    await telemetrySdk.start();
    console.log(`[telemetry] OpenTelemetry initialized (OTLP endpoint=${otlpEndpoint})`);
  } catch (error) {
    console.warn("[telemetry] OpenTelemetry initialization skipped:", error);
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!telemetrySdk) {
    return;
  }

  await telemetrySdk.shutdown();
  telemetrySdk = null;
  console.log("[telemetry] OpenTelemetry shutdown complete");
}

export async function metricsHandler(res: import("http").ServerResponse): Promise<void> {
  try {
    const metrics = await metricsRegistry.metrics();
    res.writeHead(200, {
      "Content-Type": metricsRegistry.contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.end(metrics);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Unable to collect metrics: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function traceRpcRequest<T>(contractId: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(
    "open_audit_rpc_request",
    { attributes: { contract_id: contractId } },
    async (span) => {
      const start = Date.now();
      try {
        return await fn();
      } catch (error) {
        span.recordException(error);
        throw error;
      } finally {
        span.end();
        rpcRequestDurationSeconds.labels(contractId).observe((Date.now() - start) / 1000);
      }
    }
  );
}

export function traceSyncSpan<T>(name: string, attributes: Record<string, string>, fn: () => T): T {
  const span = tracer.startSpan(name, { attributes });
  try {
    return fn();
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}

export function recordTranslationDuration<T>(contractId: string, fn: () => T): T {
  const start = Date.now();
  try {
    return fn();
  } finally {
    translationProcessingMs.labels(contractId).observe(Date.now() - start);
  }
}
