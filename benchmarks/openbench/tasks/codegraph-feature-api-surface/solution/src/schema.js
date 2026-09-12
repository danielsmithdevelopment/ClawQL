/** Request validation for widget routes. */

export function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

/** @param {{ id?: string }} params */
export function parseWidgetParams(params) {
  return { id: assertNonEmptyString(params?.id, "id") };
}

export const WidgetParams = { id: "string" };
