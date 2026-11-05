---------------------------- MODULE OauthPkceAuthCode ----------------------------
(***************************************************************************)
(* Inbound MCP OAuth authorization_code + PKCE (S256).                     *)
(*                                                                         *)
(* Maps to packages/clawql-auth inbound:                                   *)
(*   mcp-auth-code-store.ts  — save / consume (delete-on-read)             *)
(*   mcp-oauth.ts            — exchangeAuthorizationCode                   *)
(*                                                                         *)
(* Target (WeakNoConsume = FALSE):                                         *)
(*   Issue → Consume deletes code → PKCE check → at most one token.        *)
(*   Wrong verifier still consumes (code gone; no token).                  *)
(*   Replay / expiry / mismatch → no token.                                *)
(*                                                                         *)
(* WeakNoConsume = TRUE: peek without delete (historical race) — TLC must  *)
(* violate AtMostOneToken.                                                 *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakNoConsume,   \* BOOLEAN — TRUE = buggy non-atomic consume
  MaxClock         \* small bound (e.g. 4)

VARIABLES
  clock,
  codePresent,     \* auth code still in store
  codeExpiresAt,
  challenge,       \* stored code_challenge (abstract: 1 = expected)
  tokensIssued,    \* successful exchanges for this code
  lastFail         \* {"none","expired","pkce","missing"}

TypeOK ==
  /\ clock \in 0..MaxClock
  /\ codeExpiresAt \in 0..MaxClock
  /\ codePresent \in BOOLEAN
  /\ challenge \in {0, 1}          \* 0 = unset; 1 = issued S256 challenge
  /\ tokensIssued \in Nat
  /\ lastFail \in {"none", "expired", "pkce", "missing"}

Init ==
  /\ clock = 0
  /\ codeExpiresAt = 0
  /\ codePresent = FALSE
  /\ challenge = 0
  /\ tokensIssued = 0
  /\ lastFail = "none"

\* Authorize: persist one-time code + S256 challenge with TTL.
Issue ==
  /\ ~codePresent
  /\ challenge = 0
  /\ tokensIssued = 0
  /\ codePresent' = TRUE
  /\ challenge' = 1
  /\ codeExpiresAt' = IF clock < MaxClock THEN clock + 1 ELSE clock
  /\ lastFail' = "none"
  /\ UNCHANGED <<clock, tokensIssued>>

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<codePresent, codeExpiresAt, challenge, tokensIssued, lastFail>>

\* Target: delete-on-read consume, then PKCE (mcp-oauth exchangeAuthorizationCode).
ExchangeSuccess ==
  /\ ~WeakNoConsume
  /\ codePresent
  /\ clock <= codeExpiresAt
  /\ codePresent' = FALSE
  /\ tokensIssued' = tokensIssued + 1
  /\ lastFail' = "none"
  /\ UNCHANGED <<clock, codeExpiresAt, challenge>>

ExchangeWrongVerifier ==
  /\ ~WeakNoConsume
  /\ codePresent
  /\ clock <= codeExpiresAt
  /\ codePresent' = FALSE          \* consume still happens before PKCE fail
  /\ tokensIssued' = tokensIssued  \* no token
  /\ lastFail' = "pkce"
  /\ UNCHANGED <<clock, codeExpiresAt, challenge>>

ExchangeExpired ==
  /\ ~WeakNoConsume
  /\ codePresent
  /\ clock > codeExpiresAt
  /\ codePresent' = FALSE
  /\ tokensIssued' = tokensIssued
  /\ lastFail' = "expired"
  /\ UNCHANGED <<clock, codeExpiresAt, challenge>>

ExchangeMissing ==
  /\ ~WeakNoConsume
  /\ ~codePresent
  /\ challenge # 0                 \* after issue+consume, or never issued
  /\ lastFail' = "missing"
  /\ UNCHANGED <<clock, codePresent, codeExpiresAt, challenge, tokensIssued>>

\* Weak: observe code without delete — two successful exchanges possible.
WeakExchangeSuccess ==
  /\ WeakNoConsume
  /\ codePresent
  /\ clock <= codeExpiresAt
  /\ tokensIssued' = tokensIssued + 1
  /\ lastFail' = "none"
  /\ UNCHANGED <<clock, codePresent, codeExpiresAt, challenge>>

Next ==
  \/ Issue
  \/ Tick
  \/ ExchangeSuccess
  \/ ExchangeWrongVerifier
  \/ ExchangeExpired
  \/ ExchangeMissing
  \/ WeakExchangeSuccess

Spec == Init /\ [][Next]_<<clock, codePresent, codeExpiresAt, challenge, tokensIssued, lastFail>>

\* Safety: a single issued code never mints more than one access token.
AtMostOneToken == tokensIssued <= 1

\* After a successful exchange, the code is gone (target path).
ConsumedAfterSuccess ==
  WeakNoConsume \/ tokensIssued = 0 \/ ~codePresent

Safety == TypeOK /\ AtMostOneToken /\ ConsumedAfterSuccess

=============================================================================
