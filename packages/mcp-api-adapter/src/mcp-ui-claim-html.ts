/**
 * Click-to-claim HTMX fragment for /mcp-ui.
 * Turns an agent-only WebMCP claim tool into a one-button human surface.
 */
import { Effect } from "effect";
import { escapeMcpUiHtml } from "./mcp-ui-form.js";

/** Placeholders: {{toolName}}, {{basePath}} */
export const CLAIM_BUTTON_HTML_FRAGMENT = `<div class="mcp-ui-claim" id="claim-{{toolName}}">
  <style>
    .mcp-ui-claim {
      --claim-orange: #f6821f;
      --claim-ink: #1d1f20;
      --claim-muted: #5b6168;
      --claim-surface: #fff7ed;
      --claim-line: #fed7aa;
    }
    .mcp-ui-claim .claim-hero {
      border: 1px solid var(--claim-line);
      border-radius: 14px;
      padding: 1.25rem 1.35rem 1.35rem;
      background:
        radial-gradient(420px 180px at 100% 0%, rgba(246, 130, 31, 0.18), transparent 60%),
        var(--claim-surface);
    }
    .mcp-ui-claim .claim-badge {
      display: inline-block;
      font-size: 0.68rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--claim-orange);
      margin-bottom: 0.55rem;
    }
    .mcp-ui-claim .claim-title {
      margin: 0 0 0.4rem;
      font-size: 1.2rem;
      color: var(--claim-ink);
      letter-spacing: -0.02em;
    }
    .mcp-ui-claim .claim-copy {
      margin: 0 0 1rem;
      color: var(--claim-muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .mcp-ui-claim .claim-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      min-width: 12rem;
      border: none;
      border-radius: 999px;
      padding: 0.75rem 1.35rem;
      background: var(--claim-orange);
      color: #fff;
      font-weight: 700;
      font-size: 0.98rem;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(246, 130, 31, 0.28);
    }
    .mcp-ui-claim .claim-btn:hover { filter: brightness(1.05); }
    .mcp-ui-claim .claim-btn:disabled {
      opacity: 0.65;
      cursor: wait;
      filter: none;
    }
    .mcp-ui-claim .claim-footnote {
      margin: 0.75rem 0 0;
      font-size: 0.78rem;
      color: var(--claim-muted);
    }
    .mcp-ui-claim .claim-result {
      margin-top: 0.9rem;
    }
  </style>

  <div class="claim-hero">
    <div class="claim-badge">Protocol Fabric · agent → human</div>
    <h3 class="claim-title">Click to claim</h3>
    <p class="claim-copy">
      This tool was published on a third-party site for agents (WebMCP).
      ClawQL re-exposes it through <code>/mcp-ui</code> so a human can claim
      with one click — the Cloudflare coupon pattern, inverted.
    </p>
    <form
      hx-post="{{postUrl}}"
      hx-target="{{resultTarget}}"
      hx-swap="innerHTML"
      hx-indicator="#claim-spinner-{{toolName}}"
      hx-disabled-elt="find button"
    >
      <button type="submit" class="claim-btn">
        Claim coupon
        <span id="claim-spinner-{{toolName}}" class="htmx-indicator">…</span>
      </button>
    </form>
    <p class="claim-footnote">
      No CAPTCHA theatre — just the same MCP tool an agent would call, rendered for people.
    </p>
    <div id="{{resultTargetId}}" class="claim-result"></div>
  </div>
</div>`;

export type ClaimButtonRenderOpts = {
  /** Override hx-post target (e.g. custom multi-step `/custom/:slug/step`). */
  postUrl?: string;
  buttonLabel?: string;
  /** HTMX result target selector (default #claim-result-<tool>). */
  resultTarget?: string;
};

export const renderClaimButtonFragment = (
  toolName: string,
  basePath: string,
  opts: ClaimButtonRenderOpts = {}
): Effect.Effect<string> =>
  Effect.sync(() => {
    const base = basePath.replace(/\/$/, "") || "/mcp-ui";
    const postUrl =
      opts.postUrl?.trim() || `${base}/execute/${toolName}`;
    const label = opts.buttonLabel?.trim() || "Claim coupon";
    const resultTarget =
      opts.resultTarget?.trim() || `#claim-result-${toolName}`;
    const resultTargetId = resultTarget.startsWith("#")
      ? resultTarget.slice(1)
      : resultTarget;
    return CLAIM_BUTTON_HTML_FRAGMENT.replaceAll(
      "{{toolName}}",
      escapeMcpUiHtml(toolName)
    )
      .replaceAll("{{basePath}}", escapeMcpUiHtml(base))
      .replaceAll("{{postUrl}}", escapeMcpUiHtml(postUrl))
      .replaceAll("{{resultTarget}}", escapeMcpUiHtml(resultTarget))
      .replaceAll("{{resultTargetId}}", escapeMcpUiHtml(resultTargetId))
      .replaceAll("Claim coupon", escapeMcpUiHtml(label));
  });

export const runRenderClaimButtonFragment = (
  toolName: string,
  basePath: string,
  opts: ClaimButtonRenderOpts = {}
): string => Effect.runSync(renderClaimButtonFragment(toolName, basePath, opts));
