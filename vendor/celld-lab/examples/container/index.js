import { Container, getContainer, getRandom } from "@cloudflare/containers";

export class MyContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
  envVars = { MESSAGE: "passed in by the Container class" };

  onStart() {
    console.log("container started");
  }
  onStop() {
    console.log("container stopped");
  }
  onError(error) {
    console.log("container error:", error);
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/container/")) {
      // One container per path: each name is its own object and process.
      return getContainer(env.MY_CONTAINER, pathname).fetch(request);
    }
    if (pathname.startsWith("/lb")) {
      // Spread requests over three containers.
      const container = await getRandom(env.MY_CONTAINER, 3);
      return container.fetch(request);
    }
    if (pathname.startsWith("/singleton")) {
      return getContainer(env.MY_CONTAINER).fetch(request);
    }
    return new Response(
      "Try /container/<name>, /lb, or /singleton\n",
      { headers: { "content-type": "text/plain" } },
    );
  },
};
