import { WorkflowEntrypoint } from "cloudflare:workers";

export class ReportBuilder extends WorkflowEntrypoint {
  async run(event, step) {
    // A completed step returns its stored result when the Workflow resumes.
    return await step.do("build report", async () => {
      const response = await fetch(event.payload.url);
      if (!response.ok) throw new Error(`source answered ${response.status}`);
      const text = await response.text();
      return { bytes: text.length, lines: text.split("\n").length };
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (url.pathname === "/create") {
      const instance = await env.REPORTS.create({
        params: { url: url.searchParams.get("url") ?? "https://example.com" },
      });
      return Response.json({ id: instance.id });
    }

    if (url.pathname === "/status" && id) {
      const instance = await env.REPORTS.get(id);
      return Response.json(await instance.status());
    }

    return new Response("Use /create?url=URL or /status?id=ID.", {
      status: 404,
    });
  },
};
