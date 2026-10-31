export class W {
  constructor(state, env) {
    this.state = state;
  }
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("websocket upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const server = pair[0];
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: pair[1] });
  }
  async webSocketMessage(ws, msg) {
    let count = (await this.state.storage.get("count")) ?? 0;
    count++;
    await this.state.storage.put("count", count);
    ws.send(JSON.stringify({ echo: msg, count }));
  }
}
export default {
  async fetch(request, env) {
    return env.W.get(env.W.idFromName("w")).fetch(request);
  },
};
