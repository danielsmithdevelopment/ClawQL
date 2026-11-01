const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_at ON entries (at DESC);
`;

export default {
  async fetch(request, env) {
    await env.DB.exec(SCHEMA);
    const url = new URL(request.url);

    if (request.method === "POST") {
      const { name, message } = await request.json();
      const written = await env.DB
        .prepare("INSERT INTO entries (name, message, at) VALUES (?, ?, ?)")
        .bind(name, message, Date.now())
        .run();
      return Response.json({
        id: written.meta.last_row_id,
        changes: written.meta.changes,
      }, { status: 201 });
    }

    const count = await env.DB
      .prepare("SELECT count(*) AS n FROM entries")
      .first("n");
    if (url.pathname === "/count") return Response.json({ count });

    const { results } = await env.DB
      .prepare(
        "SELECT id, name, message, at FROM entries ORDER BY at DESC LIMIT ?",
      )
      .bind(20)
      .all();
    return Response.json({ count, entries: results });
  },
};
