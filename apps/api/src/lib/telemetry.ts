import { metrics, trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";

export const tracer = trace.getTracer("meetspace-api");
const meter = metrics.getMeter("meetspace-api");

export const checkinsCounter = meter.createCounter("game.checkins", { description: "Accepted booth check-ins" });
export const checkinsRejected = meter.createCounter("game.checkins.rejected", { description: "Rejected check-ins by reason" });
export const pointsHistogram = meter.createHistogram("game.checkin.xp", { description: "XP awarded per check-in" });
export const playersJoined = meter.createCounter("game.players.joined", { description: "Players who joined the game" });
export const circleChanges = meter.createCounter("game.circle.changes", { description: "Organizer circle moves and shrinks" });

/** Latest known game numbers, exported as gauges for the Dash0 game dashboard. */
export const gauges = { radiusM: 0, boothsInZone: 0, boothsTotal: 0 };
meter.createObservableGauge("game.circle.radius", { unit: "m", description: "Current safe-zone radius" }).addCallback((r) => r.observe(gauges.radiusM));
meter.createObservableGauge("game.booths.in_zone", { description: "Booths inside the safe zone" }).addCallback((r) => r.observe(gauges.boothsInZone));
meter.createObservableGauge("game.booths.total", { description: "Booths on the floor" }).addCallback((r) => r.observe(gauges.boothsTotal));

export async function withSpan<T>(name: string, attributes: Attributes, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function setSpanAttributes(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}
