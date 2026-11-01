export default {
  async fetch(request, env) {
    return new Response("Hello from cells! url=" + request.url, {
      status: 200,
    });
  },
};
