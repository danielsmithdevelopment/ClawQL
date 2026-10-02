/** In-memory widget store + get-by-id. */

export const WIDGETS = {
  w1: { id: "w1", name: "Alpha" },
  w2: { id: "w2", name: "Beta" },
};

export function listWidgets() {
  return Object.values(WIDGETS);
}

/**
 * @param {string} id
 * @returns {{ id: string, name: string } | null}
 */
export function getWidgetById(id) {
  if (typeof id !== "string" || id.trim() === "") return null;
  return WIDGETS[id] ?? null;
}
