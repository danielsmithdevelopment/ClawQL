export default {
  async fetch(request, env) {
    const key = new URL(request.url).pathname.slice(1);
    if (!key) return new Response("Use /KEY.", { status: 400 });

    if (request.method === "PUT") {
      await env.FILES.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get("content-type") ??
            "application/octet-stream",
        },
      });
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      await env.FILES.delete(key);
      return new Response(null, { status: 204 });
    }

    if (request.method === "GET") {
      const object = await env.FILES.get(key);
      if (object === null) return new Response("Not found.", { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    return new Response("Method not allowed.", { status: 405 });
  },
};
