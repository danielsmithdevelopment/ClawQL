import { listWidgets, getWidgetById } from "./handler.js";
import { parseWidgetParams } from "./schema.js";

export const routes = [
  { method: "GET", path: "/widgets", handlerName: "listWidgets", handler: listWidgets },
  {
    method: "GET",
    path: "/widgets/:id",
    handlerName: "getWidgetById",
    handler: (params) => getWidgetById(parseWidgetParams(params).id),
  },
];

export function matchRoute(method, path) {
  const exact = routes.find((r) => r.method === method && r.path === path);
  if (exact) return exact;
  const m = path.match(/^\/widgets\/([^/]+)$/);
  if (method === "GET" && m) {
    return {
      method: "GET",
      path: "/widgets/:id",
      handlerName: "getWidgetById",
      handler: () => getWidgetById(m[1]),
      params: { id: m[1] },
    };
  }
  return null;
}
