import type { AgentName } from "./types.js";

/**
 * RockYourLobster GTM tier labels. Prices/legal are GTM — do not gate adapters on this enum.
 * @see docs/agents/clawql-agents-spec-v0.1.md §6
 */
export type RockYourLobsterTier = "self_serve_helm" | "managed" | "enterprise_tee";

export type TierCapabilities = {
  readonly agents: readonly AgentName[];
  readonly panguard: boolean;
  readonly wormAudit: boolean;
  readonly vaultMemory: boolean;
  readonly teeAttestation: boolean;
  readonly qrAirGapExport: boolean;
  readonly hardwareAttestation: boolean;
  readonly sla: boolean;
  readonly dpa: boolean;
  readonly baa: boolean;
};

const ALL_AGENTS: readonly AgentName[] = [
  "openclaw",
  "hermes",
  "pi",
  "goose",
  "deepseek",
  "openhands",
  "cline",
];

export const TIER_CAPABILITIES: Record<RockYourLobsterTier, TierCapabilities> = {
  self_serve_helm: {
    agents: ALL_AGENTS,
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: false,
    qrAirGapExport: false,
    hardwareAttestation: false,
    sla: false,
    dpa: false,
    baa: false,
  },
  managed: {
    agents: ALL_AGENTS,
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: false,
    qrAirGapExport: false,
    hardwareAttestation: false,
    sla: true,
    dpa: true,
    baa: false,
  },
  enterprise_tee: {
    agents: ALL_AGENTS,
    panguard: true,
    wormAudit: true,
    vaultMemory: true,
    teeAttestation: true,
    qrAirGapExport: true,
    hardwareAttestation: true,
    sla: true,
    dpa: true,
    baa: true,
  },
};
