import { describe, expect, it } from "vitest";
import { telemetryEndpoint } from "./otel.js";

describe("telemetryEndpoint", () => {
  it("is null when nothing is configured, which is how telemetry stays off", () => {
    /* Tests run without a collector, and so does a deployment that has not
       been given one. Both have to be a no-op rather than a connection
       refused on every span. */
    expect(telemetryEndpoint({})).toBe(null);
  });

  it("reads the standard OTel variable, so no Mercury-specific name exists", () => {
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://lgtm:4318" })).toBe("http://lgtm:4318");
  });

  it("treats an empty value as absent", () => {
    /* Coolify writes an empty string for a variable somebody cleared rather
       than removing the key, and .env.example ships it empty. */
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "" })).toBe(null);
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " })).toBe(null);
  });

  it("trims, so a copied-in value with a trailing space still works", () => {
    expect(telemetryEndpoint({ OTEL_EXPORTER_OTLP_ENDPOINT: " http://lgtm:4318 " })).toBe("http://lgtm:4318");
  });
});
