export default {
  async fetch(request, env) {
    return new Response("The cron runs once a minute.\n");
  },
  async scheduled(controller, env, ctx) {
    console.log("cron", controller.scheduledTime);
  },
};
