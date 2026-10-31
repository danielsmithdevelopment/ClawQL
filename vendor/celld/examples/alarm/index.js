export class Agent {
  constructor(state, env) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/arm") {
      await this.state.storage.setAlarm(Date.now() + 2000);
      return Response.json({
        armed: true,
        at: await this.state.storage.getAlarm(),
      });
    }
    const fires = (await this.state.storage.get("fires")) ?? 0;
    return Response.json({
      fires,
      pendingAlarm: await this.state.storage.getAlarm(),
    });
  }
  async alarm(info) {
    const fires = (await this.state.storage.get("fires")) ?? 0;
    await this.state.storage.put("fires", fires + 1);
    await this.state.storage.put("lastRetry", info.retryCount);
  }
}
export default {
  async fetch(request, env) {
    const id = env.AGENT.idFromName("a1");
    return env.AGENT.get(id).fetch(request);
  },
};
