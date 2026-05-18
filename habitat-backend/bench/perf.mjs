// Lightweight perf bench against the cached read endpoints.
//
// Usage:
//   node bench/perf.mjs
//
// Talks to http://localhost:5000 by default; override with BASE_URL.

import autocannon from "autocannon";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const DURATION = Number(process.env.DURATION_SECS || 10);
const CONNECTIONS = Number(process.env.CONNECTIONS || 25);

const register = async () => {
  const email = `perf-${Date.now()}@test.com`;
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Perf Bot", email, password: "perfpass-1234", role: "resident" }),
  });
  if (!res.ok) throw new Error(`register: ${res.status}`);
  const body = await res.json();
  return body.data.token;
};

const warm = async (token, path) => {
  await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
};

const bench = async (token, path, label) => {
  console.log(`\n--- ${label}: GET ${path} ---`);
  const result = await autocannon({
    url: `${BASE}${path}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: { authorization: `Bearer ${token}` },
  });
  const { latency, throughput, requests, non2xx } = result;
  console.log(
    JSON.stringify(
      {
        rps_avg: requests.average,
        latency_ms_p50: latency.p50,
        latency_ms_p95: latency.p97_5 ?? latency.p95,
        latency_ms_p99: latency.p99,
        latency_ms_max: latency.max,
        bytes_per_sec: throughput.average,
        non2xx,
        duration_secs: result.duration,
        connections: result.connections,
      },
      null,
      2
    )
  );
  return { label, latency, throughput, requests, non2xx };
};

const main = async () => {
  console.log(`Bench target: ${BASE}, ${CONNECTIONS} conns x ${DURATION}s`);
  const token = await register();
  await warm(token, "/api/amenities");
  await warm(token, "/api/notices");

  await bench(token, "/api/amenities", "amenities (cached list)");
  await bench(token, "/api/notices", "notices (cached list)");
  await bench(token, "/api/auth/me", "auth/me (no cache, baseline)");
};

main().catch((err) => {
  console.error("perf bench failed:", err.message);
  process.exit(1);
});
