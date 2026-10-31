export class Counter {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const count = ((await this.state.storage.get("count")) ?? 0) + 1;
    await this.state.storage.put("count", count);
    return Response.json({ count });
  }
}

export default {
  async fetch(request, env) {
    return env.COUNTER.getByName("counter").fetch(request);
  },
};
