import { listWidgets } from "./handler.js";

/**
 * Minimal router table.
 * Missing: GET /widgets/:id → getWidgetById (check codegraph impact of handler.js).
 */
export const routes = [
  { method: "GET", path: "/widgets", handlerName: "listWidgets", handler: listWidgets },
];

export function matchRoute(method, path) {
  const exact = routes.find((r) => r.method === method && r.path === path);
  if (exact) return exact;
  return null;
}
