/**
 * Local significance filter for SubscriptionDO (Streams §3.4).
 * Fast, no model call. Everything still buffers / WORM regardless of result.
 *
 * Shipped types: always | never | threshold | pattern
 * Deferred: rate | composite (documented; return deferred reason if requested)
 */

/**
 * @typedef {{ type: 'always' }} AlwaysFilter
 * @typedef {{ type: 'never' }} NeverFilter
 * @typedef {{ type: 'threshold', path: string, op?: 'gt'|'gte'|'lt'|'lte'|'eq', value: number }} ThresholdFilter
 * @typedef {{ type: 'pattern', path?: string, pattern: string }} PatternFilter
 * @typedef {{ type: 'rate'|'composite', [k: string]: unknown }} DeferredFilter
 * @typedef {AlwaysFilter | NeverFilter | ThresholdFilter | PatternFilter | DeferredFilter} SignificanceFilter
 */

/**
 * Resolve JSON path like `$.score` / `score` / `a.b` from an object.
 * @param {unknown} root
 * @param {string} path
 */
export function getJsonPath(root, path) {
  if (root == null) return undefined;
  let p = String(path || "").trim();
  if (p.startsWith("$.")) p = p.slice(2);
  else if (p.startsWith("$")) p = p.slice(1);
  if (!p) return root;
  const parts = p.split(".").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[part];
  }
  return cur;
}

/**
 * @param {unknown} raw
 * @returns {SignificanceFilter | null}
 */
export function parseSignificanceConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = /** @type {{ type?: string }} */ (raw).type;
  if (!type || typeof type !== "string") return null;
  return /** @type {SignificanceFilter} */ (raw);
}

/**
 * Extract filter config from webhook JSON body (top-level `significance` key).
 * @param {string} bodyText
 */
export function extractSignificanceFromBody(bodyText) {
  try {
    const parsed = JSON.parse(bodyText || "{}");
    if (parsed && typeof parsed === "object" && parsed.significance) {
      return parseSignificanceConfig(parsed.significance);
    }
  } catch {
    // non-JSON body — no embedded config
  }
  return null;
}

/**
 * @param {SignificanceFilter} filter
 * @param {string} bodyText
 * @param {unknown} [parsedBody]
 */
export function evaluateSignificance(filter, bodyText, parsedBody) {
  let body = parsedBody;
  if (body === undefined) {
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }
  }

  switch (filter.type) {
    case "always":
      return { significant: true, reason: "always", filterType: "always" };
    case "never":
      return { significant: false, reason: "never", filterType: "never" };
    case "threshold": {
      const path = filter.path || "";
      const op = filter.op || "gt";
      const threshold = Number(filter.value);
      const got = Number(getJsonPath(body, path));
      if (!Number.isFinite(got) || !Number.isFinite(threshold)) {
        return {
          significant: false,
          reason: "threshold_non_numeric",
          filterType: "threshold",
          path,
          got,
          threshold,
        };
      }
      let ok = false;
      if (op === "gt") ok = got > threshold;
      else if (op === "gte") ok = got >= threshold;
      else if (op === "lt") ok = got < threshold;
      else if (op === "lte") ok = got <= threshold;
      else if (op === "eq") ok = got === threshold;
      else {
        return { significant: false, reason: `threshold_bad_op:${op}`, filterType: "threshold" };
      }
      return {
        significant: ok,
        reason: ok ? `threshold_${op}_pass` : `threshold_${op}_fail`,
        filterType: "threshold",
        path,
        got,
        threshold,
        op,
      };
    }
    case "pattern": {
      const path = filter.path;
      const hay =
        path != null && path !== ""
          ? String(getJsonPath(body, path) ?? "")
          : typeof bodyText === "string"
            ? bodyText
            : JSON.stringify(body);
      let re;
      try {
        re = new RegExp(String(filter.pattern || ""), "i");
      } catch {
        return { significant: false, reason: "pattern_invalid_regex", filterType: "pattern" };
      }
      const ok = re.test(hay);
      return {
        significant: ok,
        reason: ok ? "pattern_match" : "pattern_no_match",
        filterType: "pattern",
        path: path ?? "(body)",
      };
    }
    case "rate":
    case "composite":
      return {
        significant: false,
        reason: `filter_deferred:${filter.type}`,
        filterType: filter.type,
        deferred: true,
      };
    default:
      return {
        significant: false,
        reason: `unknown_filter:${/** @type {{ type?: string }} */ (filter).type}`,
        filterType: "unknown",
      };
  }
}

/**
 * Default Lab behavior when no config: non-empty body is significant
 * (preserves historical smoke / webhook demos).
 * @param {string} bodyText
 * @param {{ forcePass?: boolean, forceFail?: boolean, config?: SignificanceFilter | null }} [opts]
 */
export function decideSignificance(bodyText, opts = {}) {
  if (opts.forcePass) {
    return { significant: true, reason: "header_force_pass", filterType: "force" };
  }
  if (opts.forceFail) {
    return { significant: false, reason: "header_force_fail", filterType: "force" };
  }
  if (opts.config) {
    return evaluateSignificance(opts.config, bodyText);
  }
  const fromBody = extractSignificanceFromBody(bodyText);
  if (fromBody) {
    return evaluateSignificance(fromBody, bodyText);
  }
  const force = bodyText.length > 0;
  return {
    significant: force,
    reason: force ? "default_non_empty_body" : "empty_body",
    filterType: "default",
  };
}
