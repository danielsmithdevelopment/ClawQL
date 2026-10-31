export class Echo {
  constructor(state, env) {
    this.state = state;
  }
  async fetch(request) {
    if (request.method === "POST" || request.method === "PUT") {
      const data = await request.json();
      let sum = (await this.state.storage.get("sum")) ?? 0;
      sum += data.n ?? 0;
      await this.state.storage.put("sum", sum);
      return Response.json({ echoed: data, sum });
    }
    const text = await request.text();
    return Response.json({ method: request.method, bodyLen: text.length });
  }
}
export default {
  async fetch(request, env) {
    const name = new URL(request.url).pathname.slice(1) || "default";
    return env.ECHO.get(env.ECHO.idFromName(name)).fetch(request);
  },
};
