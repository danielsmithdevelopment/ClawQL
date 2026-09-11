/**
 * Three-arm burst load (§13.2) — identical stream for Arms A/B/C.
 *
 * Timeline:
 *   0–1 min:   1_000_000 events
 *   1–11 min:  hard zero (10 minutes)
 *   11–12 min: 2_000_000 events
 *   12+ min:   drain / observe
 *
 * Requires: k6. Set BASE_URL to the arm's ingest endpoint.
 * Optional: ARM=A|B|C for metric tags; RESULT_DIR for JSON summary.
 *
 * This script is a scaffold — scale stages are approximate; tune
 * VUs so total POSTs match the §13.2 counts on your hardware.
 * Do not treat default VU counts as a completed §12 measurement.
 *
 * @see docs/streams/aws-celld-burst.md §13
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8080/webhook/burst";
const ARM = __ENV.ARM || "A";

const dropped = new Counter("burst_dropped_or_failed");
const latency = new Trend("burst_request_duration_ms", true);

export const options = {
  tags: { arm: ARM, test: "aws-celld-burst-1m-gap-2m" },
  // Approximate stages — operators must calibrate VUs to hit exact
  // 1M / 2M totals before claiming §12 complete.
  stages: [
    { duration: "1m", target: 2000 }, // ramp into first burst
    { duration: "10m", target: 0 }, // hard zero gap
    { duration: "1m", target: 4000 }, // second burst (~2× rate)
    { duration: "2m", target: 0 }, // drain
  ],
  thresholds: {
    // Thresholds are observational defaults, not pass/fail marketing gates.
    http_req_failed: ["rate<0.5"],
  },
};

export default function () {
  const eventId = `burst-${ARM}-${__VU}-${__ITER}-${Date.now()}`;
  const res = http.post(
    BASE_URL,
    JSON.stringify({
      probe: true,
      mode: "three-arm-burst",
      arm: ARM,
      eventId,
    }),
    {
      headers: {
        "content-type": "application/json",
        "x-clawql-event-id": eventId,
        "x-clawql-burst-arm": ARM,
      },
      tags: { arm: ARM, phase: "load" },
    }
  );

  latency.add(res.timings.duration);
  const ok = check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
  });
  if (!ok) dropped.add(1);

  // Tiny yield so the event loop can schedule; not a pacing model.
  sleep(0.001);
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify(
      {
        arm: ARM,
        note: "Scaffold summary only — calibrate VUs and attach Cost Explorer before publishing §13.5",
        metrics: {
          http_reqs: data.metrics.http_reqs?.values,
          http_req_duration: data.metrics.http_req_duration?.values,
          burst_dropped_or_failed: data.metrics.burst_dropped_or_failed?.values,
        },
      },
      null,
      2
    ),
  };
}
