import type { ListedMcpTool } from "mcp-grpc-transport";

const MAX_NEST_DEPTH = 2;

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

function asPropSchema(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Whether a schema node can be rendered as structured HTML (flat / object / array). */
export function isRenderableSchema(
  propSchema: Record<string, unknown>,
  depth = 0
): boolean {
  if (depth > MAX_NEST_DEPTH) return false;
  if (isFlatFormField(propSchema)) return true;

  if (propSchema.type === "object" || propSchema.properties) {
    const props = propSchema.properties as Record<string, unknown> | undefined;
    if (!props || typeof props !== "object") return false;
    return Object.entries(props).some(
      ([key, child]) => isSafeFieldName(key) && isRenderableSchema(asPropSchema(child), depth + 1)
    );
  }

  if (propSchema.type === "array") {
    const items = asPropSchema(propSchema.items);
    if (!propSchema.items || typeof propSchema.items !== "object") return false;
    return isRenderableSchema(items, depth + 1);
  }

  return false;
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

/** Top-level properties that have a structured HTML control (including nested). */
export function structuredPropertiesFromInputSchema(
  inputSchema: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const props = inputSchema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props || typeof props !== "object") return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, propSchema] of Object.entries(props)) {
    if (!isSafeFieldName(key)) continue;
    if (!isRenderableSchema(propSchema ?? {}, 0)) continue;
    out[key] = propSchema ?? {};
  }
  return out;
}

/**
 * Prefer structured forms when at least one property is renderable.
 * Fall back to a JSON bag when nothing structured is available.
 */
export function formModeFromInputSchema(inputSchema: Record<string, unknown>): McpUiFormMode {
  const structured = structuredPropertiesFromInputSchema(inputSchema);
  return Object.keys(structured).length > 0 ? "flat" : "jsonBag";
}

function inputTypeForString(propSchema: Record<string, unknown>): string {
  const format = typeof propSchema.format === "string" ? propSchema.format : "";
  if (format === "date") return "date";
  if (format === "date-time" || format === "datetime") return "datetime-local";
  if (format === "email") return "email";
  if (format === "uri" || format === "url") return "url";
  return "text";
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
  const leaf = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  const leafClean = leaf.replace(/\[\d+\]/g, "");
  if (/^(file|upload|pdf_base64|base64)$/i.test(leafClean)) return true;
  if (/_base64$/i.test(leafClean)) return true;
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
  /** Nesting depth (root = 0). */
  depth?: number;
};

function childPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function arrayItemPath(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

export function renderFieldControl(options: RenderFieldOptions): string {
  const {
    name,
    propSchema,
    required,
    prefills,
    asTextarea,
    asFile,
    hint,
    errorMessage,
    depth = 0,
  } = options;
  const label = typeof propSchema.title === "string" ? propSchema.title : name.split(".").pop()!;
  const description =
    typeof propSchema.description === "string" ? propSchema.description : undefined;
  const defaultValue =
    prefills && name in prefills
      ? prefills[name]
      : prefills && Object.prototype.hasOwnProperty.call(prefills, name.split(".").pop()!)
        ? prefills[name.split(".").pop()!]
        : propSchema.default;
  const reqAttr = required && propSchema.type !== "boolean" ? " required" : "";
  const errClass = errorMessage ? " field--error" : "";
  const hintHtml = hint
    ? `<p class="field-help">${escHtml(hint)}</p>`
    : description
      ? `<p class="field-help">${escHtml(description)}</p>`
      : "";
  const errHtml = errorMessage
    ? `<p class="field-error" role="alert">${escHtml(errorMessage)}</p>`
    : "";

  if (depth <= MAX_NEST_DEPTH && (propSchema.type === "object" || propSchema.properties)) {
    return renderObjectFieldset({
      name,
      propSchema,
      required,
      prefills,
      asTextarea,
      asFile,
      hint,
      errorMessage,
      depth,
    });
  }

  if (depth <= MAX_NEST_DEPTH && propSchema.type === "array") {
    return renderArrayField({
      name,
      propSchema,
      required,
      prefills,
      depth,
      hint,
      errorMessage,
    });
  }

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
    const optionsHtml = enumValues
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
  <select name="${escHtml(name)}"${reqAttr}>${blank}${optionsHtml}</select>
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

  if (asTextarea || (typeof description === "string" && description.length > 160)) {
    const text =
      defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : "";
    return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <textarea name="${escHtml(name)}" rows="4"${reqAttr}>${escHtml(text)}</textarea>
  ${hintHtml}${errHtml}
</label>`;
  }

  const inputType =
    type === "number" || type === "integer" ? "number" : inputTypeForString(propSchema);
  const valueAttr =
    defaultValue !== undefined && defaultValue !== null
      ? ` value="${escHtml(String(defaultValue))}"`
      : "";
  return `<label class="field${errClass}">
  <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
  <input type="${inputType}" name="${escHtml(name)}"${valueAttr}${reqAttr} />
  ${hintHtml}${errHtml}
</label>`;
}

function renderObjectFieldset(options: RenderFieldOptions): string {
  const { name, propSchema, required, prefills, depth = 0, hint, errorMessage } = options;
  const label = typeof propSchema.title === "string" ? propSchema.title : name.split(".").pop()!;
  const props = (propSchema.properties as Record<string, unknown>) ?? {};
  const requiredList = Array.isArray(propSchema.required)
    ? (propSchema.required as string[])
    : [];
  const nestedPrefill =
    prefills && name in prefills && prefills[name] && typeof prefills[name] === "object"
      ? (prefills[name] as Record<string, unknown>)
      : prefills;

  const children = Object.entries(props)
    .filter(([key, child]) => isSafeFieldName(key) && isRenderableSchema(asPropSchema(child), depth + 1))
    .map(([key, child]) =>
      renderFieldControl({
        name: childPath(name, key),
        propSchema: asPropSchema(child),
        required: requiredList.includes(key),
        prefills: nestedPrefill,
        depth: depth + 1,
      })
    )
    .join("\n");

  const omitted = Object.keys(props).filter(
    (key) =>
      !isSafeFieldName(key) || !isRenderableSchema(asPropSchema(props[key]), depth + 1)
  );
  const omitNote =
    omitted.length > 0
      ? `<p class="field-help">Nested fields as JSON only: ${escHtml(omitted.join(", "))}</p>`
      : "";

  return `<fieldset class="fieldset" data-object="${escHtml(name)}">
  <legend>${escHtml(label)} ${labelBadge(required)}</legend>
  ${hint ? `<p class="field-help">${escHtml(hint)}</p>` : ""}
  ${children}
  ${omitNote}
  ${errorMessage ? `<p class="field-error" role="alert">${escHtml(errorMessage)}</p>` : ""}
</fieldset>`;
}

function renderArrayRow(
  baseName: string,
  index: number,
  itemSchema: Record<string, unknown>,
  depth: number
): string {
  const path = arrayItemPath(baseName, index);
  const leafLabel = baseName.split(".").pop()!;
  if (isFlatFormField(itemSchema)) {
    return `<div class="array-row" data-index="${index}">
  ${renderFieldControl({
    name: path,
    propSchema: { ...itemSchema, title: `${leafLabel}[${index}]` },
    required: false,
    depth: depth + 1,
  })}
  <button type="button" class="array-remove" data-role="remove" aria-label="Remove row">Remove</button>
</div>`;
  }

  // Object items: render nested fields under steps[0].tool style names
  const props = (itemSchema.properties as Record<string, unknown>) ?? {};
  const requiredList = Array.isArray(itemSchema.required)
    ? (itemSchema.required as string[])
    : [];
  const children = Object.entries(props)
    .filter(([key, child]) => isSafeFieldName(key) && isRenderableSchema(asPropSchema(child), depth + 1))
    .map(([key, child]) =>
      renderFieldControl({
        name: childPath(path, key),
        propSchema: asPropSchema(child),
        required: requiredList.includes(key),
        depth: depth + 1,
      })
    )
    .join("\n");

  return `<div class="array-row" data-index="${index}">
  <fieldset class="fieldset fieldset--row">
    <legend>${escHtml(leafLabel)}[${index}]</legend>
    ${children}
  </fieldset>
  <button type="button" class="array-remove" data-role="remove" aria-label="Remove row">Remove</button>
</div>`;
}

function renderArrayField(options: {
  name: string;
  propSchema: Record<string, unknown>;
  required: boolean;
  prefills?: Record<string, unknown>;
  depth: number;
  hint?: string;
  errorMessage?: string;
}): string {
  const { name, propSchema, required, depth, hint, errorMessage } = options;
  const itemSchema = asPropSchema(propSchema.items);
  const label = typeof propSchema.title === "string" ? propSchema.title : name.split(".").pop()!;
  const seed = renderArrayRow(name, 0, itemSchema, depth);
  const templateRow = seed
    .replaceAll(`${name}[0]`, `${name}[__INDEX__]`)
    .replaceAll(`data-index="0"`, `data-index="__INDEX__"`)
    .replaceAll(`${escHtml(label)}[0]`, `${escHtml(label)}[__INDEX__]`);

  return `<div class="array-field" data-array="${escHtml(name)}">
  <div class="array-field__header">
    <span class="field-label">${escHtml(label)} ${labelBadge(required)}</span>
    <button type="button" class="array-add" data-role="add">Add ${escHtml(label)}</button>
  </div>
  ${hint ? `<p class="field-help">${escHtml(hint)}</p>` : ""}
  <div class="array-rows" data-role="rows">${seed}</div>
  <template data-role="row-template">${templateRow}</template>
  ${errorMessage ? `<p class="field-error" role="alert">${escHtml(errorMessage)}</p>` : ""}
</div>`;
}

/** Small script once per catalog page — wires array add/remove buttons. */
export const MCP_UI_ARRAY_SCRIPT = `
(function () {
  function reindex(field) {
    var rows = field.querySelector('[data-role="rows"]');
    if (!rows) return;
    var base = field.getAttribute('data-array') || '';
    Array.prototype.forEach.call(rows.children, function (row, i) {
      row.setAttribute('data-index', String(i));
      Array.prototype.forEach.call(row.querySelectorAll('[name]'), function (el) {
        var n = el.getAttribute('name') || '';
        var prefix = base + '[';
        var start = n.indexOf(prefix);
        if (start !== 0) return;
        var rest = n.slice(prefix.length);
        var close = rest.indexOf(']');
        if (close < 0) return;
        el.setAttribute('name', base + '[' + i + ']' + rest.slice(close + 1));
      });
      Array.prototype.forEach.call(row.querySelectorAll('legend'), function (el) {
        el.textContent = (el.textContent || '').replace(/\\[\\d+\\]/, '[' + i + ']');
      });
      Array.prototype.forEach.call(row.querySelectorAll('.field-label'), function (el) {
        // leave badges alone; only rewrite "[n]" leaf titles when present
        el.childNodes.forEach(function (node) {
          if (node.nodeType === 3) {
            node.textContent = (node.textContent || '').replace(/\\[\\d+\\]/, '[' + i + ']');
          }
        });
      });
    });
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var add = t.closest('[data-role="add"]');
    if (add) {
      var field = add.closest('.array-field');
      if (!field) return;
      var rows = field.querySelector('[data-role="rows"]');
      var tpl = field.querySelector('template[data-role="row-template"]');
      if (!rows || !tpl) return;
      var html = tpl.innerHTML.split('__INDEX__').join(String(rows.children.length));
      var wrap = document.createElement('div');
      wrap.innerHTML = html.trim();
      var node = wrap.firstElementChild;
      if (node) rows.appendChild(node);
      reindex(field);
      return;
    }
    var rem = t.closest('[data-role="remove"]');
    if (rem) {
      var field2 = rem.closest('.array-field');
      var row = rem.closest('.array-row');
      if (row && row.parentNode) row.parentNode.removeChild(row);
      if (field2) reindex(field2);
    }
  });
})();
`;

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
  structuredProps: Record<string, Record<string, unknown>>,
  requiredList: string[],
  primary?: string[]
): { primaryKeys: string[]; advancedKeys: string[] } {
  const keys = Object.keys(structuredProps);
  if (primary && primary.length > 0) {
    const primaryKeys = primary.filter((k) => k in structuredProps);
    const advancedKeys = keys.filter((k) => !primaryKeys.includes(k));
    return { primaryKeys, advancedKeys };
  }

  const requiredKeys = keys.filter((k) => requiredList.includes(k));
  const withDefaults = keys.filter(
    (k) => !requiredList.includes(k) && structuredProps[k]?.default !== undefined
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

  const structuredProps = structuredPropertiesFromInputSchema(inputSchema);
  const allProps = (inputSchema.properties as Record<string, unknown>) ?? {};
  const omitted = Object.keys(allProps).filter((k) => !(k in structuredProps));
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];
  const prefills = { ...(hints.defaults ?? {}) };
  const { primaryKeys, advancedKeys } = partitionFields(
    structuredProps,
    requiredList,
    hints.primary
  );

  const renderKeys = (keys: string[]) =>
    keys
      .map((key) =>
        renderFieldControl({
          name: key,
          propSchema: structuredProps[key] ?? {},
          required: requiredList.includes(key),
          prefills,
          asTextarea: hints.textareas?.includes(key),
          asFile: hints.fileFields?.includes(key),
          hint: hints.hints?.[key],
          errorMessage: hints.fieldErrors?.[key],
          depth: 0,
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
      ? `<p class="field-help">Unsupported fields omitted: ${escHtml(omitted.join(", "))}. Use REST <code>POST /${escHtml(tool.name)}</code> or the JSON bag for full args.</p>`
      : "";

  const hasFileFields =
    (hints.fileFields?.length ?? 0) > 0 ||
    Object.entries(structuredProps).some(([key, schema]) =>
      looksLikeFileField(key, schema, hints.fileFields?.includes(key))
    ) ||
    Object.values(structuredProps).some((schema) => {
      if (schema.type === "object" && schema.properties) {
        return Object.entries(schema.properties as Record<string, unknown>).some(([k, child]) =>
          looksLikeFileField(k, asPropSchema(child))
        );
      }
      return false;
    });

  return { mode, hasFileFields, html: `${primaryHtml}\n${advancedHtml}\n${omitNote}` };
}

function parseFieldValue(propSchema: Record<string, unknown>, raw: unknown): unknown {
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

/** Parse `a.b[0].c` style form names into path segments. */
export function parseFormPath(key: string): Array<string | number> {
  const parts: Array<string | number> = [];
  const re = /([A-Za-z0-9_-]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(key)) !== null) {
    if (match[1]) parts.push(match[1]);
    else if (match[2] !== undefined) parts.push(Number.parseInt(match[2], 10));
  }
  return parts;
}

function setPath(
  root: Record<string, unknown>,
  path: Array<string | number>,
  value: unknown
): void {
  if (path.length === 0) return;
  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]!;
    const next = path[i + 1]!;
    if (typeof seg === "number") {
      const arr = cursor as unknown[];
      if (arr[seg] == null) {
        arr[seg] = typeof next === "number" ? [] : {};
      }
      cursor = arr[seg];
    } else {
      const obj = cursor as Record<string, unknown>;
      if (obj[seg] == null || typeof obj[seg] !== "object") {
        obj[seg] = typeof next === "number" ? [] : {};
      }
      cursor = obj[seg];
    }
  }
  const last = path[path.length - 1]!;
  if (typeof last === "number") {
    (cursor as unknown[])[last] = value;
  } else {
    (cursor as Record<string, unknown>)[last] = value;
  }
}

/** Expand flat form keys (`a.b`, `items[0].x`) into a nested tree. */
export function expandFormBodyTree(body: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "__json_args" || key.startsWith("__")) continue;
    const path = parseFormPath(key);
    if (path.length === 0) continue;
    setPath(root, path, value);
  }
  return root;
}

function coerceValue(
  propSchema: Record<string, unknown>,
  raw: unknown,
  fieldPath: string,
  required: boolean,
  fieldErrors: FormFieldError[],
  depth: number
): unknown {
  if (depth > MAX_NEST_DEPTH) {
    return raw;
  }

  if (propSchema.type === "object" || propSchema.properties) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      if (required) {
        fieldErrors.push({ field: fieldPath, message: `Missing required field: ${fieldPath}` });
      }
      return undefined;
    }
    const props = (propSchema.properties as Record<string, unknown>) ?? {};
    const requiredList = Array.isArray(propSchema.required)
      ? (propSchema.required as string[])
      : [];
    const out: Record<string, unknown> = {};
    let any = false;
    for (const [key, child] of Object.entries(props)) {
      if (!isSafeFieldName(key) || !isRenderableSchema(asPropSchema(child), depth + 1)) continue;
      const childRaw = (raw as Record<string, unknown>)[key];
      const coerced = coerceValue(
        asPropSchema(child),
        childRaw,
        childPath(fieldPath, key),
        requiredList.includes(key),
        fieldErrors,
        depth + 1
      );
      if (coerced !== undefined) {
        out[key] = coerced;
        any = true;
      }
    }
    if (!any && !required) return undefined;
    return out;
  }

  if (propSchema.type === "array") {
    const items = asPropSchema(propSchema.items);
    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    // Compact sparse arrays from setPath
    const dense = list.filter((_, i) => Object.prototype.hasOwnProperty.call(list, i));
    const out: unknown[] = [];
    for (let i = 0; i < dense.length; i++) {
      const coerced = coerceValue(
        items,
        dense[i],
        arrayItemPath(fieldPath, i),
        false,
        fieldErrors,
        depth + 1
      );
      if (coerced !== undefined) out.push(coerced);
    }
    if (out.length === 0) {
      if (required) {
        fieldErrors.push({ field: fieldPath, message: `Missing required field: ${fieldPath}` });
      }
      return undefined;
    }
    return out;
  }

  if (propSchema.type === "boolean") {
    if (raw === undefined || raw === null) {
      if (required) return false;
      return undefined;
    }
    return parseFieldValue(propSchema, raw);
  }

  if (raw === undefined || raw === null) {
    if (required) {
      fieldErrors.push({ field: fieldPath, message: `Missing required field: ${fieldPath}` });
    }
    return undefined;
  }

  const value = parseFieldValue(propSchema, raw);
  if (value === undefined && required) {
    fieldErrors.push({ field: fieldPath, message: `Missing required field: ${fieldPath}` });
  }
  return value;
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

  const tree = expandFormBodyTree(body);
  const structuredProps = structuredPropertiesFromInputSchema(inputSchema);
  const requiredList = Array.isArray(inputSchema.required)
    ? (inputSchema.required as string[])
    : [];
  const args: Record<string, unknown> = {};
  const fieldErrors: FormFieldError[] = [];

  for (const [key, propSchema] of Object.entries(structuredProps)) {
    const coerced = coerceValue(
      propSchema,
      tree[key],
      key,
      requiredList.includes(key),
      fieldErrors,
      0
    );
    if (coerced !== undefined) args[key] = coerced;
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
