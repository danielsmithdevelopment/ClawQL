/**
 * Creates the demo task against demo/webhooks-service (once the API + coordinator are live).
 *
 *   DECISIONS_URL=… npx tsx demo/seed.ts --api https://… 
 */

const API = process.env.ATTEMPTS_API ?? "http://127.0.0.1:8787";

const prompt = `Fix the retry storm in webhook delivery (src/delivery.js).
On HTTP 429/5xx, honor Retry-After when present, otherwise use exponential backoff.
Do not call any host outside the egress allowlist in delivery.js.
Keep the Vitest suite green (update the retry-storm assertion to expect backoff).`;

async function main() {
  const res = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repo: "webhooks-service",
      prompt,
      attempts: 3,
    }),
  });
  if (!res.ok) {
    console.error(await res.text());
    process.exit(1);
  }
  const task = await res.json();
  console.log(JSON.stringify(task, null, 2));
}

main();
