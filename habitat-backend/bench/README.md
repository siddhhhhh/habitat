# Performance benchmarks

Smoke-grade only — meant to demo the cache layer under modest load, not to
certify a production SLO.

- `perf.mjs` — autocannon-based, zero infra. Run it directly with `node`.
- `e2e-smoke.mjs` — end-to-end socket flow (admin posts a notice, resident
  receives it over Socket.IO). Useful sanity check after wiring changes.

## Quick run

```bash
# 1. Boot the backend (REDIS_URL optional — falls back to in-memory cache):
npm run dev

# 2. Run the bench. It registers its own resident, warms the cache, then hits
#    /api/amenities, /api/notices, /api/auth/me.
node bench/perf.mjs
```

## Reference numbers

Measured locally on WSL2 with the in-memory cache store (no Redis), MongoDB
Atlas remote, 25 connections × 10 s, after a single warm-up GET per endpoint.
These are illustrative — your hardware and the Atlas RTT will dominate.

| Endpoint              | rps  | p50 | p95 | p99 | max  |
| --------------------- | ---- | --- | --- | --- | ---- |
| `GET /api/amenities`  | 690  | 34  | 58  | 70  | 326  |
| `GET /api/notices`    | 801  | 31  | 41  | 45  | 140  |
| `GET /api/auth/me`    | 636  | 39  | 47  | 50  | 87   |

p99 stayed under 150 ms across the board. The amenities `max` of 326 ms was a
single cold outlier — pino-http first-line init plus the in-memory store's
first write contend on the same tick.
