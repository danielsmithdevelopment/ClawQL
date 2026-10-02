export default {
  async fetch(request, env) {
    const repo = env.GITHUB_REPO || "example/repo";
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "release-tag-worker",
      },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "upstream" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
    const body = await res.json();
    return new Response(JSON.stringify({ tag: body.tag_name }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};
