/-
  ClawQL information-flow kernel (Lean oracle) — ADR 0015.

  Two theorems:
  (1) labels only grow within a session (`accumulateLabels` is monotonic)
  (2) a write is allowed only if the combined label may flow to its destination
      (`writeAllowed` = `mayFlow`)

  Mirrors (empty-config core):
    packages/clawql-api/src/ifc/labels.ts `mayFlow`
  Differential tests:
    packages/clawql-api/src/ifc/information-flow.differential.test.ts
  TS oracle:
    packages/clawql-api/src/ifc/information-flow-oracle.ts

  CI: `scripts/formal/check-lean-no-sorry.sh` fails on `sorry` / `admit`.
  Full `lake build` lands when the lakefile is added (same gating as ApprovalPolicy).
-/

namespace ClawQL.InformationFlow

/-- Opaque sensitivity / provenance tag (e.g. `source:github`, `public`). -/
abbrev Label := String

def PUBLIC : Label := "public"

/-- Membership (computational). -/
def mem (x : Label) : List Label → Bool
  | [] => false
  | y :: ys => decide (x = y) || mem x ys

/-- Session accumulate: union that never drops prior labels. -/
def accumulateLabels (acc : List Label) : List Label → List Label
  | [] => acc
  | n :: ns =>
    if mem n acc then accumulateLabels acc ns
    else accumulateLabels (acc ++ [n]) ns

theorem mem_append_right (l n : Label) (acc : List Label)
    (h : mem l acc = true) : mem l (acc ++ [n]) = true := by
  induction acc with
  | nil =>
    simp [mem] at h
  | cons y ys ih =>
    simp only [mem, List.cons_append] at h ⊢
    cases hy : decide (l = y) with
    | true =>
      simp [hy]
    | false =>
      simp [hy] at h
      exact ih h

/-- (1) Labels only grow within a session. -/
theorem labels_only_grow (acc news : List Label) (l : Label)
    (h : mem l acc = true) : mem l (accumulateLabels acc news) = true := by
  induction news generalizing acc with
  | nil =>
    simpa [accumulateLabels] using h
  | cons n ns ih =>
    unfold accumulateLabels
    cases hmem : mem n acc with
    | true =>
      simp [hmem]
      exact ih acc h
    | false =>
      simp [hmem]
      exact ih (acc ++ [n]) (mem_append_right l n acc h)

/--
  Executable `mayFlow` for a single destination (empty allow-list config).

  Rules (fail closed, match TS `mayFlow` with `emptyIfcFlowConfig` + one dest):
  1. Empty `fromUnion` always flows.
  2. Public destination always accepts.
  3. Else every label in `fromUnion` must be `public` or equal the destination.
-/
def mayFlow (fromUnion : List Label) (dest : Label) : Bool :=
  match fromUnion with
  | [] => true
  | _ :: _ =>
    if decide (dest = PUBLIC) then true
    else fromUnion.all (fun lbl => decide (lbl = PUBLIC) || decide (lbl = dest))

/-- Write allowed iff combined session labels may flow to destination. -/
def writeAllowed (fromUnion : List Label) (dest : Label) : Bool :=
  mayFlow fromUnion dest

/-- (2) Write allowed only when mayFlow holds (definitional). -/
theorem write_allowed_iff_may_flow (fromUnion : List Label) (dest : Label) :
    writeAllowed fromUnion dest = mayFlow fromUnion dest := rfl

/-- Fixture lemmas used by the TS differential suite (same inputs). -/
theorem fixture_empty_flows : mayFlow [] "source:slack" = true := rfl

theorem fixture_public_dest : mayFlow ["source:github"] PUBLIC = true := by
  native_decide

theorem fixture_same_source : mayFlow ["source:github"] "source:github" = true := by
  native_decide

theorem fixture_cross_source_blocked : mayFlow ["source:github"] "source:slack" = false := by
  native_decide

theorem fixture_public_label_ok : mayFlow [PUBLIC] "source:slack" = true := by
  native_decide

end ClawQL.InformationFlow
