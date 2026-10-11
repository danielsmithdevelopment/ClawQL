/**
 * Branded ids for gdp-ts naming. Constructors use a single type assertion —
 * allowlisted by the gdp-ts ESLint preset for ids modules.
 */

export type UserId = string & { readonly __brand: "UserId" };
export type ProposalId = string & { readonly __brand: "ProposalId" };
export type ExecutionId = string & { readonly __brand: "ExecutionId" };
export type OrgId = string & { readonly __brand: "OrgId" };
export type SubjectId = string & { readonly __brand: "SubjectId" };
export type ApiKeyId = string & { readonly __brand: "ApiKeyId" };
export type VaultPath = string & { readonly __brand: "VaultPath" };
export type EventPayloadId = string & { readonly __brand: "EventPayloadId" };
export type PrincipalId = string & { readonly __brand: "PrincipalId" };
export type ArgsHash = string & { readonly __brand: "ArgsHash" };

export const UserId = (value: string): UserId => value.trim() as UserId;
export const ProposalId = (value: string): ProposalId => value.trim() as ProposalId;
export const ExecutionId = (value: string): ExecutionId => value.trim() as ExecutionId;
export const OrgId = (value: string): OrgId => value.trim() as OrgId;
export const SubjectId = (value: string): SubjectId => value.trim() as SubjectId;
export const ApiKeyId = (value: string): ApiKeyId => value.trim() as ApiKeyId;
export const VaultPath = (value: string): VaultPath => value.trim() as VaultPath;
export const EventPayloadId = (value: string): EventPayloadId => value.trim() as EventPayloadId;
export const PrincipalId = (value: string): PrincipalId => value.trim() as PrincipalId;
export const ArgsHash = (value: string): ArgsHash => value.trim() as ArgsHash;
