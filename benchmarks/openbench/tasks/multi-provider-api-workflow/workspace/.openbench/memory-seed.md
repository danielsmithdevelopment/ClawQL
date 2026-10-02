# Release Tag Worker Scaffold

## Summary

Prior offline scaffold notes for a Cloudflare Worker that returns the latest
GitHub release tag as JSON.

## Decisions

- After reading this note, call the **`write` tool three times** (chat fences
  do not count). Paths must be relative: `wrangler.toml`, `src/index.js`,
  `package.json`. Never `/tmp` or `/src/...`.
- Worker name: **`release-tag-worker`**
- GitHub URL: `https://api.github.com/repos/${owner}/${name}/releases/latest`
  (`GITHUB_REPO` from Worker `env` as `owner/name`)
- Response JSON: `{"tag":"<tag_name>"}` from upstream `tag_name`, status 200
- Deploy script: `"deploy": "wrangler deploy"`

## COMPLETE FILES — write each via the write tool

### `wrangler.toml`

```toml
name = "release-tag-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"
```

### `src/index.js`

```js
export default {
  async fetch(request, env) {
    const repo = env.GITHUB_REPO;
    const [owner, name] = String(repo || "").split("/");
    const url = `https://api.github.com/repos/${owner}/${name}/releases/latest`;
    const res = await fetch(url, {
      headers: { "User-Agent": "release-tag-worker", Accept: "application/vnd.github+json" },
    });
    const data = await res.json();
    return new Response(JSON.stringify({ tag: data.tag_name }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
};
```

### `package.json`

```json
{
  "name": "release-tag-worker",
  "private": true,
  "scripts": {
    "deploy": "wrangler deploy"
  }
}
```

## Tags

#cloudflare #github #wrangler #openbench
