export default {
  async fetch(request, env) {
    const key = new URL(request.url).pathname.slice(1);
    if (!key) return new Response("Use /KEY.", { status: 400 });

    if (request.method === "PUT") {
      await env.VALUES.put(key, request.body);
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      await env.VALUES.delete(key);
      return new Response(null, { status: 204 });
    }

    const value = await env.VALUES.get(key);
    return value === null
      ? new Response("Not found.", { status: 404 })
      : new Response(value);
  },
};
