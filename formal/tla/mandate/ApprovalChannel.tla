---------------------------- MODULE ApprovalChannel ----------------------------
(***************************************************************************)
(* ClawQL mandate approval channel — target safety model.                  *)
(*                                                                         *)
(* Mirrors resume-core.ts channel guards:                                  *)
(*   - Approve on mcp is never enabled (WeakMcpApprove = FALSE).           *)
(*   - Under regulated, approve is enabled only on console.                *)
(*                                                                         *)
(* Agent credentials are mcp-scoped (audit Y1/Z1): an agent principal can  *)
(* only present credentials on Channel = "mcp" unless                      *)
(* WeakAgentCredentialOnOperator is set (bug oracle for agent key on the   *)
(* operator/console approve path). We do NOT assume KindOf # agent away.   *)
(*                                                                         *)
(* Ghost WORM log records HUMAN_APPROVAL / HUMAN_REJECTION /               *)
(* OPERATOR_APPROVAL. HUMAN_APPROVAL is reserved for kind = human          *)
(* (audit #1548: operator-key path must not be logged as human).           *)
(*                                                                         *)
(* WeakMcpApprove = TRUE relaxes ApproveEnabled to allow mcp →             *)
(* NoAgentApproval fails via the same Approve action (no bypass action).   *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Agents,            \* principals of kind agent
  Humans,            \* principals of kind human
  Operators,         \* principals of kind operator
  Quorum,            \* distinct approvers required
  WeakMcpApprove,    \* BOOLEAN — TRUE = ApproveEnabled allows mcp (bug oracle)
  WeakAgentCredentialOnOperator
  \* BOOLEAN — TRUE = agent principal may approve on operator/console (Y1/Z1 oracle)

Principals == Agents \union Humans \union Operators

KindOf(p) ==
  IF p \in Agents THEN "agent"
  ELSE IF p \in Humans THEN "human"
  ELSE "operator"

ASSUME
  /\ Principals # {}
  /\ Agents \intersect Humans = {}
  /\ Agents \intersect Operators = {}
  /\ Humans \intersect Operators = {}
  /\ Quorum \in Nat
  /\ Quorum >= 1

VARIABLES
  Channel,           \* "mcp" | "operator" | "console"
  Tier,              \* "default" | "regulated"
  status,            \* "pending" | "approved" | "declined" | "executed"
  approvals,         \* sequence of [principal, channel]
  wormLog,           \* sequence of [type, principal, channel]
  requester          \* principal that parked (never may approve)

Channels == {"mcp", "operator", "console"}
Tiers == {"default", "regulated"}
Statuses == {"pending", "approved", "declined", "executed"}
WormTypes == {"HUMAN_APPROVAL", "HUMAN_REJECTION", "OPERATOR_APPROVAL"}

TypeOK ==
  /\ Channel \in Channels
  /\ Tier \in Tiers
  /\ status \in Statuses
  /\ approvals \in Seq([principal: Principals, channel: Channels])
  /\ wormLog \in Seq([type: WormTypes, principal: Principals, channel: Channels])
  /\ requester \in Principals

-----------------------------------------------------------------------------
\* Channel and Tier are chosen once at Init (models a fixed deployment).
Init ==
  /\ Channel \in Channels
  /\ Tier \in Tiers
  /\ status = "pending"
  /\ approvals = << >>
  /\ wormLog = << >>
  /\ requester \in Principals

\* Channel policy (resume-core.ts). WeakMcpApprove relaxes the mcp refuse.
ApproveEnabled ==
  /\ IF WeakMcpApprove
     THEN TRUE
     ELSE Channel # "mcp"
  /\ IF Tier = "regulated"
     THEN Channel = "console"
     ELSE TRUE

\* Y1/Z1: agent credentials are mcp-scoped unless the weak oracle admits them
\* on operator/console (the audit bug — agent key reached the operator path).
ApproveCredentialOK(p) ==
  \/ KindOf(p) \in {"human", "operator"}
  \/ (KindOf(p) = "agent" /\ Channel = "mcp")
  \/ (KindOf(p) = "agent" /\ WeakAgentCredentialOnOperator /\ Channel \in {"operator", "console"})

Approve(p) ==
  /\ status = "pending"
  /\ p \in Principals
  /\ p # requester
  /\ ApproveCredentialOK(p)
  /\ ApproveEnabled
  /\ \A i \in DOMAIN approvals : approvals[i].principal # p
  /\ LET rec == [principal |-> p, channel |-> Channel]
         wormType == IF KindOf(p) = "human"
                     THEN "HUMAN_APPROVAL"
                     ELSE "OPERATOR_APPROVAL"
         entry == [type |-> wormType, principal |-> p, channel |-> Channel]
         nextApprovals == Append(approvals, rec)
     IN
       /\ approvals' = nextApprovals
       /\ wormLog' = Append(wormLog, entry)
       /\ IF Cardinality({ nextApprovals[i].principal : i \in DOMAIN nextApprovals }) >= Quorum
          THEN status' = "approved"
          ELSE status' = status
  /\ UNCHANGED <<Channel, Tier, requester>>

Decline(p) ==
  /\ status = "pending"
  /\ p \in Principals
  /\ status' = "declined"
  /\ wormLog' = Append(wormLog,
       [type |-> "HUMAN_REJECTION", principal |-> p, channel |-> Channel])
  /\ UNCHANGED <<Channel, Tier, approvals, requester>>

Execute ==
  /\ status = "approved"
  /\ Cardinality({ approvals[i].principal : i \in DOMAIN approvals }) >= Quorum
  /\ status' = "executed"
  /\ UNCHANGED <<Channel, Tier, approvals, wormLog, requester>>

-----------------------------------------------------------------------------
Next ==
  \/ \E p \in Principals : Approve(p)
  \/ \E p \in Principals : Decline(p)
  \/ Execute

Spec == Init /\ [][Next]_<<Channel, Tier, status, approvals, wormLog, requester>>

-----------------------------------------------------------------------------
\* No approval entry has kind = agent or channel = mcp.
NoAgentApproval ==
  \A i \in DOMAIN wormLog :
    LET e == wormLog[i] IN
      (e.type \in {"HUMAN_APPROVAL", "OPERATOR_APPROVAL"}) =>
        /\ KindOf(e.principal) # "agent"
        /\ e.channel # "mcp"

\* Under regulated, every approval came through console.
RegulatedConsoleOnly ==
  Tier = "regulated" =>
    \A i \in DOMAIN wormLog :
      LET e == wormLog[i] IN
        (e.type \in {"HUMAN_APPROVAL", "OPERATOR_APPROVAL"}) =>
          e.channel = "console"

\* HUMAN_APPROVAL only for principal kind = human.
HumanRecordIsHuman ==
  \A i \in DOMAIN wormLog :
    LET e == wormLog[i] IN
      e.type = "HUMAN_APPROVAL" => KindOf(e.principal) = "human"

\* Execution runs only after quorum under the rules above.
ExecuteNeedsQuorum ==
  status = "executed" =>
    Cardinality({ approvals[i].principal : i \in DOMAIN approvals }) >= Quorum

Safety ==
  /\ TypeOK
  /\ NoAgentApproval
  /\ RegulatedConsoleOnly
  /\ HumanRecordIsHuman
  /\ ExecuteNeedsQuorum

StateConstraint ==
  /\ Len(approvals) <= Cardinality(Principals)
  /\ Len(wormLog) <= Cardinality(Principals) + 1

=============================================================================
