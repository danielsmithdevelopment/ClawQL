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

export type FormFieldError = {
  field?: string;
  message: string;
};

export class FormValidationError extends Error {
  readonly fields: FormFieldError[];
  constructor(message: string, fields: FormFieldError[] = []) {
    super(message);
    this.name = "FormValidationError";
    this.fields = fields.length > 0 ? fields : [{ message }];
  }
}

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

function shortPlaceholder(description: string | undefined, max = 90): string {
  if (!description) return "";
  const oneLine = description.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

/** True when a flat string field should render as `<input type="file">`. */
export function looksLikeFileField(
  name: string,
  propSchema: Record<string, unknown>,
  asFile?: boolean
): boolean {
  if (asFile) return true;
  if (propSchema.format === "binary" || propSchema.format === "byte") return true;
  if (propSchema.contentMediaType != null) return true;
  // Exact arg names used by IDP / document tools (not *File path strings).
  if (/^(file|upload|pdf_base64|base64)$/i.test(name)) return true;
  if (/_base64$/i.test(name)) return true;
  return false;
}

function labelBadge(required: boolean): string {
  return required
    ? `<span class="badge badge--required">Required</span>`
    : `<span class="badge badge--optional">Optional</span>`;
}

export type RenderFieldOptions = {
  name: string;
  propSchema: Record<string, unknown>;
  required: boolean;
  /** Override prefilled value (template defaults). */
  prefills?: Record<string, unknown>;
  /** Force textarea for long text. */
  asTextarea?: boolean;
  /** Render as file upload. */
  asFile?: boolean;
  /** Extra hint under the field (template op guidance). */
  hint?: string;
  /** Highlight this field after a validation error. */
  errorMessage?: string;
};

export function renderFieldControl(options: RenderFieldOptions): string {
  const { name, propSchema, required, prefills, asTextarea, asFile, hint, errorMessage } = options;
  const label = typeof propSchema.title === "string" ? propSchema.title : name;
  const description =
    typeof propSchema.description === "string" ? propSchema.description : undefined;
  const defaultValue = prefills && name in prefills ? prefills[name] : propSchema.default;
  const reqAttr = required && propSchema.type !== "boolean" ? " required" : "";
  const errClass = errorMessage ? " field--error" : "";
  const placeholder = shortPlaceholder(description);
  const placeholderAttr = placeholder ? ` placeholder="${escHtml(placeholder)}"` : "";
  const hintHtml = hint
    ? `<p class="field-help">${escHtml(hint)}</p>`
    : description && description.length > 90
      ? `<p class="field-help">${escHtml(description)}</p>`
      : "";
  const errHtml = errorMessage
    ? `<p class="field-error" role="alert">${escHtml(errorMessage)}</p>`
    : "";

  if (looksLikeFileField(name, propSchema, asFile)) {
    return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <input type="file" name="${escHtml(name)}" accept="*/*"${reqAttr} />
  ${hintHtml || `<p class="field-help">Uploaded files are base64-encoded into the tool arguments before CallTool.</p>`}${errHtml}
</label>`;
  }

  const enumValues = Array.isArray(propSchema.enum) ? propSchema.enum : undefined;
  if (enumValues && enumValues.length > 0) {
    const blank =
      required
        ? `<option value="" disabled${defaultValue === undefined ? " selected" : ""}>— select —</option>`
        : `<option value=""${defaultValue === undefined ? " selected" : ""}>—</option>`;
    const options = enumValues
      .map((value) => {
        const selected =
          defaultValue !== undefined && String(defaultValue) === String(value)
            ? " selected"
            : "";
        return `<option value="${escHtml(String(value))}"${selected}>${escHtml(String(value))}</option>`;
      })
      .join("");
    return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <select name="${escHtml(name)}"${reqAttr}>${blank}${options}</select>
  ${hintHtml}${errHtml}
</label>`;
  }

  const type = propSchema.type;
  if (type === "boolean") {
    const checked = defaultValue === true ? " checked" : "";
    return `<label class="field field--checkbox${errClass}">
  <input type="checkbox" name="${escHtml(name)}" value="true"${checked} />
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  ${hintHtml}${errHtml}
</label>`;
  }

  if (type === "number" || type === "integer") {
    const step = type === "integer" ? ' step="1"' : ' step="any"';
    const valueAttr =
      typeof defaultValue === "number" ? ` value="${escHtml(String(defaultValue))}"` : "";
    return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <input type="number" name="${escHtml(name)}"${step}${valueAttr}${placeholderAttr}${reqAttr} />
  ${hintHtml}${errHtml}
</label>`;
  }

  if (asTextarea || (typeof description === "string" && /transcript|markdown|body|insights|summary|conversation/i.test(description + name))) {
    const body =
      defaultValue !== undefined && defaultValue !== null ? escHtml(String(defaultValue)) : "";
    return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <textarea name="${escHtml(name)}" rows="5"${placeholderAttr}${reqAttr}>${body}</textarea>
  ${hintHtml}${errHtml}
</label>`;
  }

  const inputType = inputTypeForString(propSchema);
  const valueAttr =
    defaultValue !== undefined && defaultValue !== null
      ? ` value="${escHtml(String(defaultValue))}"`
      : "";
  return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <input type="${inputType}" name="${escHtml(name)}"${valueAttr}${placeholderAttr}${reqAttr} />
  ${hintHtml}${errHtml}
</label>`;
}

export type FormRenderHints = {
  /** Fields shown outside the Advanced disclosure. */
  primary?: string[];
  /** Extra defaults layered on schema defaults. */
  defaults?: Record<string, unknown>;
  /** Force textarea for these field names. */
  textareas?: string[];
  /** Force file input for these field names. */
  fileFields?: string[];
  /** Per-field helper copy. */
  hints?: Record<string, string>;
  /** Field-level errors to highlight. */
  fieldErrors?: Record<string, string>;
};

function partitionFields(
  flatProps: Record<string, Record<string, unknown>>,
  requiredList: string[],
  primary?: string[]
): { primaryKeys: string[]; advancedKeys: string[] } {
  const keys = Object.keys(flatProps);
  if (primary && primary.length > 0) {
    const primaryKeys = primary.filter((k) => k in flatProps);
    const advancedKeys = keys.filter((k) => !primaryKeys.includes(k));
    return { primaryKeys, advancedKeys };
  }

  const requiredKeys = keys.filter((k) => requiredList.includes(k));
  const withDefaults = keys.filter(
    (k) => !requiredList.includes(k) && flatProps[k]?.default !== undefined
  );
  const rest = keys.filter((k) => !requiredKeys.includes(k) && !withDefaults.includes(k));
  return {
    primaryKeys: [...requiredKeys, ...withDefaults],
    advancedKeys: rest,
  };
}

export function renderToolFormFields(
  tool: ListedMcpTool,
  hints: FormRenderHints = {}
): { mode: McpUiFormMode; html: string; hasFileFields: boolean } {
  const inputSchema = tool.inputSchema ?? { type: "object", properties: {} };
  const mode = formModeFromInputSchema(inputSchema);

  if (mode === "jsonBag") {
    const err = hints.fieldErrors?.__json_args;
    return {
      mode,
      hasFileFields: false,
      html: `<label class="field${err ? " field--error" : ""}">
  <span class="field-label">Arguments (JSON object) ${labelBadge(true)}</span>
  <textarea name="__json_args" rows="6" placeholder="{}">{}</textarea>
  <p class="field-help">Pass a JSON object matching the tool input schema.</p>
  ${err ? `<p class="field-error" role="alert">${escHtml(err)}</p>` : ""}
</label>`,
    };
  }

  const flatProps = flatPropertiesFromInputSchema(inputSchema);
  const allProps = (inputSchema.properties as Record<string, unknown>) ?? {};
  const omitted = Object.keys(allProps).filter((k) => !(k in flatProps));
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];
  const prefills = { ...(hints.defaults ?? {}) };
  const { primaryKeys, advancedKeys } = partitionFields(flatProps, requiredList, hints.primary);

  const renderKeys = (keys: string[]) =>
    keys
      .map((key) =>
        renderFieldControl({
          name: key,
          propSchema: flatProps[key] ?? {},
          required: requiredList.includes(key),
          prefills,
          asTextarea: hints.textareas?.includes(key),
          asFile: hints.fileFields?.includes(key),
          hint: hints.hints?.[key],
          errorMessage: hints.fieldErrors?.[key],
        })
      )
      .join("\n");

  const primaryHtml = renderKeys(primaryKeys);
  const advancedHtml =
    advancedKeys.length > 0
      ? `<details class="advanced">
  <summary>Advanced <span class="badge badge--optional">${advancedKeys.length} optional</span></summary>
  <div class="advanced__body">
    ${renderKeys(advancedKeys)}
  </div>
</details>`
      : "";

  const omitNote =
    omitted.length > 0
      ? `<p class="field-help">Complex fields omitted: ${escHtml(omitted.join(", "))}. Use REST <code>POST /${escHtml(tool.name)}</code> for full args.</p>`
      : "";

  const hasFileFields =
    (hints.fileFields?.length ?? 0) > 0 ||
    Object.entries(flatProps).some(([key, schema]) =>
      looksLikeFileField(key, schema, hints.fileFields?.includes(key))
    );

  return { mode, hasFileFields, html: `${primaryHtml}\n${advancedHtml}\n${omitNote}` };
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
    const text = String(raw ?? "").trim();
    if (text === "") return undefined;
    const match = propSchema.enum.find((v) => String(v) === text);
    return match ?? text;
  }
  const text = String(raw ?? "").trim();
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
    try {
      const parsed = JSON.parse(String(raw)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new FormValidationError("Arguments must be a JSON object", [
          { field: "__json_args", message: "Arguments must be a JSON object" },
        ]);
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof FormValidationError) throw err;
      throw new FormValidationError("Invalid JSON in arguments", [
        { field: "__json_args", message: "Invalid JSON" },
      ]);
    }
  }

  const flatProps = flatPropertiesFromInputSchema(inputSchema);
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];
  const args: Record<string, unknown> = {};
  const fieldErrors: FormFieldError[] = [];

  for (const [key, propSchema] of Object.entries(flatProps)) {
    const hasValue = Object.prototype.hasOwnProperty.call(body, key);
    const required = requiredList.includes(key);

    if (propSchema.type === "boolean") {
      if (hasValue) {
        args[key] = true;
      } else if (required) {
        args[key] = false;
      }
      // optional unchecked → omit
      continue;
    }

    if (!hasValue) {
      if (required) {
        fieldErrors.push({ field: key, message: `Missing required field: ${key}` });
      }
      continue;
    }

    const value = parseFieldValue(propSchema, body[key]);
    if (value === undefined) {
      if (required) {
        fieldErrors.push({ field: key, message: `Missing required field: ${key}` });
      }
      continue;
    }
    args[key] = value;
  }

  if (fieldErrors.length > 0) {
    throw new FormValidationError(fieldErrors[0]!.message, fieldErrors);
  }

  return args;
}

/** Best-effort extract of a field name from MCP / AJV style messages. */
export function fieldErrorFromMessage(message: string): FormFieldError {
  const atMatch = message.match(/\bat\s+([A-Za-z0-9_.-]+)\b/i);
  if (atMatch?.[1]) {
    const field = atMatch[1].split(".").pop()!;
    return { field, message };
  }
  const missing = message.match(/Missing required field:\s*([A-Za-z0-9_-]+)/i);
  if (missing?.[1]) return { field: missing[1], message };
  const expected = message.match(/for\s+(?:tool\s+\S+\s+)?(?:at\s+)?([A-Za-z0-9_-]+)\b/i);
  if (expected?.[1] && !["tool", "input", "Invalid"].includes(expected[1])) {
    return { field: expected[1], message };
  }
  return { message };
}

export { escHtml as escapeMcpUiHtml };
