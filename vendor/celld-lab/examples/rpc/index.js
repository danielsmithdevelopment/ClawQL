import { DurableObject } from "cloudflare:workers";

export class Counter extends DurableObject {
  async increment(amount) {
    const count = ((await this.ctx.storage.get("count")) ?? 0) + amount;
    await this.ctx.storage.put("count", count);
    return count;
  }

  async value() {
    return (await this.ctx.storage.get("count")) ?? 0;
  }
}

export default {
  async fetch(request, env, ctx) {
    const counter = env.COUNTER.getByName("counter");
    if (request.method === "POST") {
      return Response.json({ count: await counter.increment(1) });
    }
    return Response.json({ count: await counter.value() });
  },
};
