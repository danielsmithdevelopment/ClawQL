import type { ListedMcpTool } from "mcp-grpc-transport";

function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeFieldName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name);
}

export type McpUiFormMode = "flat" | "jsonBag";

function isFlatFormField(propSchema: Record<string, unknown>): boolean {
  if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
    return propSchema.enum.every((v) => typeof v === "string" || typeof v === "number");
  }
  const t = propSchema.type;
  return t === "string" || t === "number" || t === "integer" || t === "boolean";
}

/** Flat-safe properties only (string/number/boolean/enum with safe names). */
export function flatPropertiesFromInputSchema(
  inputSchema: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const props = inputSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || typeof props !== "object") return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!isSafeFieldName(key)) continue;
    if (!isFlatFormField(propSchema ?? {})) continue;
    out[key] = propSchema ?? {};
  }
  return out;
}

/**
 * Prefer flat forms when at least one property is renderable as a control.
 * Complex properties (object/array) are omitted from the form in flat mode.
 * Fall back to a JSON bag when nothing flat is available.
 */
export function formModeFromInputSchema(inputSchema: Record<string, unknown>): McpUiFormMode {
  const flat = flatPropertiesFromInputSchema(inputSchema);
  return Object.keys(flat).length > 0 ? "flat" : "jsonBag";
}

function inputTypeForString(propSchema: Record<string, unknown>): string {
  const format = typeof propSchema.format === "string" ? propSchema.format : "";
  if (format === "date") return "date";
  if (format === "date-time" || format === "datetime") return "datetime-local";
  if (format === "email") return "email";
  if (format === "uri" || format === "url") return "url";
  return "text";
}

function renderFieldControl(
  name: string,
  propSchema: Record<string, unknown>,
  required: boolean
): string {
  const label = typeof propSchema.title === "string" ? propSchema.title : name;
  const description =
    typeof propSchema.description === "string" ? propSchema.description : undefined;
  const defaultValue = propSchema.default;
  const reqAttr = required ? " required" : "";
  const descHtml = description
    ? `<p class="field-help">${escHtml(description)}</p>`
    : "";

  const enumValues = Array.isArray(propSchema.enum) ? propSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const options = enumValues
      .map((value) => {
        const selected =
          defaultValue !== undefined && String(defaultValue) === String(value)
            ? " selected"
            : "";
        return `<option value="${escHtml(String(value))}"${selected}>${escHtml(String(value))}</option>`;
      })
      .join("");
    return `<label class="field">
  <span class="field-label">${escHtml(label)}${required ? " *" : ""}</span>
  <select name="${escHtml(name)}"${reqAttr}>${options}</select>
  ${descHtml}
</label>`;
  }

  const type = propSchema.type;
  if (type === "boolean") {
    const checked = defaultValue === true ? " checked" : "";
    return `<label class="field field--checkbox">
  <input type="checkbox" name="${escHtml(name)}" value="true"${checked}${reqAttr} />
  <span class="field-label">${escHtml(label)}${required ? " *" : ""}</span>
  ${descHtml}
</label>`;
  }

  if (type === "number" || type === "integer") {
    const step = type === "integer" ? ' step="1"' : ' step="any"';
    const valueAttr =
      typeof defaultValue === "number" ? ` value="${escHtml(String(defaultValue))}"` : "";
    return `<label class="field">
  <span class="field-label">${escHtml(label)}${required ? " *" : ""}</span>
  <input type="number" name="${escHtml(name)}"${step}${valueAttr}${reqAttr} />
  ${descHtml}
</label>`;
  }

  const inputType = inputTypeForString(propSchema);
  const valueAttr =
    defaultValue !== undefined ? ` value="${escHtml(String(defaultValue))}"` : "";
  return `<label class="field">
  <span class="field-label">${escHtml(label)}${required ? " *" : ""}</span>
  <input type="${inputType}" name="${escHtml(name)}"${valueAttr}${reqAttr} />
  ${descHtml}
</label>`;
}

export function renderToolFormFields(tool: ListedMcpTool): { mode: McpUiFormMode; html: string } {
  const inputSchema = tool.inputSchema ?? { type: "object", properties: {} };
  const mode = formModeFromInputSchema(inputSchema);

  if (mode === "jsonBag") {
    return {
      mode,
      html: `<label class="field">
  <span class="field-label">Arguments (JSON object)</span>
  <textarea name="__json_args" rows="6" placeholder="{}">{}</textarea>
  <p class="field-help">Pass a JSON object matching the tool input schema.</p>
</label>`,
    };
  }

  const flatProps = flatPropertiesFromInputSchema(inputSchema);
  const allProps = (inputSchema.properties as Record<string, unknown>) ?? {};
  const omitted = Object.keys(allProps).filter((k) => !(k in flatProps));
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];

  const fields = Object.entries(flatProps)
    .map(([key, propSchema]) =>
      renderFieldControl(key, propSchema ?? {}, requiredList.includes(key))
    )
    .join("\n");

  const omitNote =
    omitted.length > 0
      ? `<p class="field-help">Optional complex fields omitted from this form: ${escHtml(omitted.join(", "))}. Use REST <code>POST /${escHtml(tool.name)}</code> for full args.</p>`
      : "";

  return { mode, html: `${fields}\n${omitNote}` };
}

function parseFieldValue(
  propSchema: Record<string, unknown>,
  raw: unknown
): unknown {
  const type = propSchema.type;
  if (type === "boolean") {
    if (raw === "true" || raw === true || raw === "on") return true;
    if (raw === "false" || raw === false) return false;
    return false;
  }
  if (type === "number") {
    const text = String(raw ?? "").trim();
    if (text === "") return undefined;
    const n = Number.parseFloat(text);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === "integer") {
    const text = String(raw ?? "").trim();
    if (text === "") return undefined;
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) ? n : raw;
  }
  if (Array.isArray(propSchema.enum)) {
    const match = propSchema.enum.find((v) => String(v) === String(raw));
    return match ?? String(raw ?? "");
  }
  const text = String(raw ?? "");
  return text.length === 0 ? undefined : text;
}

export function parseFormArgs(
  body: Record<string, unknown>,
  inputSchema: Record<string, unknown>
): Record<string, unknown> {
  const mode = formModeFromInputSchema(inputSchema);
  if (mode === "jsonBag") {
    const raw = body.__json_args;
    if (raw == null || String(raw).trim() === "") return {};
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  const flatProps = flatPropertiesFromInputSchema(inputSchema);
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];
  const args: Record<string, unknown> = {};

  for (const [key, propSchema] of Object.entries(flatProps)) {
    const hasValue = Object.prototype.hasOwnProperty.call(body, key);
    if (propSchema.type === "boolean") {
      args[key] = hasValue ? parseFieldValue(propSchema, body[key]) : false;
      continue;
    }
    if (!hasValue) {
      if (requiredList.includes(key)) {
        throw new Error(`Missing required field: ${key}`);
      }
      continue;
    }
    const value = parseFieldValue(propSchema, body[key]);
    if (value !== undefined) args[key] = value;
  }

  return args;
}

export { escHtml as escapeMcpUiHtml };
