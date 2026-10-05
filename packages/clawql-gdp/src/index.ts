/**
 * ClawQL gdp-ts surface: re-exports @gdp-ts/core + branded ids + Effect service.
 */

export {
  defineProof,
  name,
  type Named,
  type NameOf,
  type NamesOf,
  type Proof,
  type Prover,
} from "@gdp-ts/core";

export {
  ApiKeyId,
  ArgsHash,
  EventPayloadId,
  ExecutionId,
  OrgId,
  PrincipalId,
  ProposalId,
  SubjectId,
  UserId,
  VaultPath,
} from "./ids.js";

export { GdpService, GdpServiceLive, runGdpEffect } from "./effect/gdp-service.js";
