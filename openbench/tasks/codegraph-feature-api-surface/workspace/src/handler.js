/** In-memory widget store. GET /widgets/:id is not implemented yet. */

export const WIDGETS = {
  w1: { id: "w1", name: "Alpha" },
  w2: { id: "w2", name: "Beta" },
};

export function listWidgets() {
  return Object.values(WIDGETS);
}

/**
 * TODO: product wants GET /widgets/:id — implement lookup.
 * @param {string} id
 * @returns {{ id: string, name: string } | null}
 */
export function getWidgetById(id) {
  throw new Error("not implemented: getWidgetById");
}
