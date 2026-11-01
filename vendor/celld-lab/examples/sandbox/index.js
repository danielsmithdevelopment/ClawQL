import { getSandbox, Sandbox } from "@cloudflare/sandbox";

export { Sandbox };

// One sandbox per `id`: a Linux environment with a shell, a filesystem,
// and background processes, supervised by the Durable Object.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const sandbox = getSandbox(env.Sandbox, url.searchParams.get("id") ?? "demo");
    switch (url.pathname) {
      case "/exec": {
        const command = url.searchParams.get("cmd") ?? "uname -a";
        const result = await sandbox.exec(command);
        return Response.json({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
        });
      }
      case "/write": {
        await sandbox.writeFile("/workspace/note.txt", `written at ${new Date().toISOString()}\n`);
        const file = await sandbox.readFile("/workspace/note.txt");
        return Response.json({ content: file.content });
      }
      case "/serve": {
        // A background process that outlives this request: a small HTTP
        // server. It uses node, which the Sandbox image ships, rather than a
        // language the image may not carry.
        const process = await sandbox.startProcess(
          `node -e "require('http').createServer((_req, res) => res.end('served from the sandbox')).listen(8787, '0.0.0.0')"`,
        );
        return Response.json({ id: process.id, status: process.status });
      }
      case "/processes": {
        const list = await sandbox.listProcesses();
        return Response.json(list.map((process) => ({ id: process.id, status: process.status })));
      }
      default:
        return new Response(
          "Try /exec?cmd=..., /write, /serve, or /processes, with ?id=<sandbox>\n",
          { headers: { "content-type": "text/plain" } },
        );
    }
  },
};
