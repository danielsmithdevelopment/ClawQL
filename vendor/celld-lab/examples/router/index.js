export class Counter {
  constructor(state, env) {
    this.state = state;
  }
  async fetch(request) {
    const name = new URL(request.url).pathname.slice(1) || "default";
    let n = (await this.state.storage.get("n")) ?? 0;
    n++;
    await this.state.storage.put("n", n);
    return Response.json({ name, n });
  }
}
export default {
  async fetch(request, env) {
    const name = new URL(request.url).pathname.slice(1) || "default";
    const id = env.COUNTER.idFromName(name);
    return env.COUNTER.get(id).fetch(request);
  },
};
