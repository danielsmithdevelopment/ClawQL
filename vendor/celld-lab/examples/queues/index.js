export default {
  async fetch(request, env) {
    const job = {
      path: new URL(request.url).pathname,
      createdAt: new Date().toISOString(),
    };
    await env.JOBS.send(job);
    return Response.json({ queued: job });
  },

  async queue(batch) {
    for (const message of batch.messages) {
      if (batch.queue === "example-jobs-dead-letter") {
        console.log("dead job", message.body);
        message.ack();
        continue;
      }

      if (message.body.path.endsWith("/fail")) {
        console.log("retrying job", message.body, message.attempts);
        message.retry({ delaySeconds: 1 });
        continue;
      }

      console.log("processing job", message.body);
      message.ack();
    }
  },
};
