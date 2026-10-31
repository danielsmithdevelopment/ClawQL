export class Client {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const target = url.searchParams.get("url");
      if (!target) {
        return new Response("The url parameter is required.", { status: 400 });
      }

      const socket = new WebSocket(target);
      socket.addEventListener("open", () => socket.send("hello"));
      socket.addEventListener("message", async (event) => {
        await this.state.storage.put("message", event.data);
        socket.close(1000, "done");
      });
      return new Response(null, { status: 202 });
    }

    return Response.json({
      message: (await this.state.storage.get("message")) ?? null,
    });
  }
}

export default {
  async fetch(request, env) {
    return env.CLIENT.getByName("client").fetch(request);
  },
};
