export class Palette {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS colors USING vec0(rgb float[3], +name text)",
    );
  }

  async fetch(request) {
    const path = new URL(request.url).pathname.slice(1);
    const rgb = request.method === "PUT"
      ? await request.json()
      : path.split(",").map(Number);
    if (
      !Array.isArray(rgb) ||
      rgb.length !== 3 ||
      rgb.some((n) => !Number.isFinite(n) || n < 0 || n > 255) ||
      (request.method === "PUT" && !path)
    ) {
      return new Response(
        "Use an RGB array with three values from 0 through 255.\n",
        { status: 400 },
      );
    }
    const vector = JSON.stringify(rgb.map((n) => n / 255));
    if (request.method === "PUT") {
      this.sql.exec(
        "INSERT INTO colors(rgb, name) VALUES (?, ?)",
        vector,
        decodeURIComponent(path),
      );
      return new Response(null, { status: 201 });
    }
    const match = this.sql.exec(
      "SELECT name, distance FROM colors WHERE rgb MATCH ? AND k = 1",
      vector,
    ).toArray()[0];
    return match
      ? Response.json(match)
      : new Response("The palette is empty.\n", { status: 404 });
  }
}

export default {
  fetch(request, env) {
    return env.PALETTE.getByName("colors").fetch(request);
  },
};
