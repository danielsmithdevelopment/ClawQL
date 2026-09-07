---
title: "Security Status Page — Specification"
status: "August 2026"
version: "0.1"
page: "docs.clawql.com/security/status"
---

# Security Status Page

## Specification v0.1

**August 2026**

---

## 1. Purpose and Principle

This page proves ClawQL's security process runs and holds, rather than asserting it in prose. Every element on the page is either raw, independently verifiable data (an SBOM, a signature, a CI log) or a real history of outcomes over time (scan pass/fail records) — never a summary, a badge claiming a snapshot state, or a paraphrase of what a tool found. The reader should never have to trust ClawQL's description of its own security posture; they should be able to check it themselves in the same way anyone can re-run the harness behind the Executor comparison benchmark.

**This page is not a live vulnerability dashboard.** It never displays currently open, unpatched vulnerabilities — that would be a target list, and it would contradict the hard CI gate's own premise (a merge cannot land with unresolved scan failures, so there should be nothing current to display). What the page shows is evidence that the _gate_ runs and works: a history of pass/fail outcomes, including failures that were caught and fixed, not a sanitized all-green record.

---

## 2. Why Failures Stay Visible

A scan history with no failures ever recorded is not obviously more trustworthy than one with a caught-and-fixed failure in it — the opposite is true. An unbroken streak of green either means the gate has never caught anything real (which happens, but is a weaker signal) or means failures were filtered out before publishing (which would be actively misleading if anyone noticed the gap between "we scan everything" and "we only show the runs that passed"). This page shows every run, pass or fail, exactly as it happened. A visible fail-then-fix pair is direct proof the gate has teeth — it blocked something and the fix that followed shows the process resolving it, not hiding it.

---

## 3. Page Sections

### 3.1 Latest Release

```
Latest release: v8.0.0
Published: 2026-08-28
Commit: a518ef32

SBOM (Syft):        [Download SBOM — SPDX JSON]
Signed image digest: sha256:4f8a2b...
Verify signature:    cosign verify --key cosign.pub \
                        ghcr.io/danielsmithdevelopment/clawql:8.0.0
```

Every field here is either a direct download link to the real artifact or a copy-pasteable command a reader can run themselves against the actual published image — nothing on this page is a description of the SBOM or the signature, it is the SBOM and a way to check the signature directly.

### 3.2 Scan History

A table of the last 30 CI runs (configurable), each row independently sourced from the CI export described in §4 — not hand-curated, not editable outside of the pipeline that produced it.

```
| Run | Date | Commit | Trivy | OSV | Result | CI Log |
|-----|------|--------|-------|-----|--------|--------|
| #1042 | 2026-08-28 | a518ef32 | pass | pass | merged | [link] |
| #1041 | 2026-08-27 | 9c3e1f0a | pass | pass | merged | [link] |
| #1040 | 2026-08-26 | 71b0aa2c | FAIL (CVE-2026-xxxxx) | pass | blocked | [link] |
| #1039 | 2026-08-26 | 71b0aa2c-fix | pass | pass | merged | [link] |
```

A failed row is never removed once published — if a later run on the same or a subsequent commit fixes the issue, that appears as a new row, and the failed row stays exactly as it was. `CI Log` links directly to the actual GitHub Actions run (assuming the repository or the specific workflow is public), not to a page describing what happened in the run.

### 3.3 Security Policy

Direct link to `SECURITY.md`, including the disclosure process and response-time commitment. If this doesn't exist yet as a published document, it is a prerequisite for this page, not an optional companion — a security status page with no disclosure process linked from it is incomplete.

### 3.4 Independent Verification

If ClawQL's gateway is ever run against a third-party, vendor-neutral benchmark (MCPSEC's formal security properties, per the earlier research into the field), the result and a link to the reproducible test run belongs here — this is the same "independent, structured evaluation, not self-report" principle already applied to Harvey LAB and ExtractBench, extended to security specifically.

---

## 4. Required CI Export Format

The page is only as honest as its data source. Every CI run that includes the scan gate must emit a structured artifact the page can ingest directly — the page must never be hand-maintained or manually updated after the fact, since a manually curated security page is exactly the kind of thing that quietly drifts from reality or gets touched up before anyone important looks.

```typescript
// .github/workflows/ci.yml supply-chain job exports this as a build artifact
// on every run, pass or fail — the export happens unconditionally,
// before the pipeline knows whether the run will ultimately pass or
// block the merge, so there is no code path where a failing run skips
// producing its own record.

export interface SecurityScanRunRecord {
  runId: string;
  timestamp: string;
  commit: string;
  branch: string;
  scanners: {
    trivy: { result: "pass" | "fail"; findings?: TrivyFinding[] };
    osv: { result: "pass" | "fail"; findings?: OsvFinding[] };
  };
  sbom: {
    generated: boolean;
    format: "cyclonedx-json";
    artifactUrl: string;
  };
  signing: {
    signed: boolean;
    imageDigest: string | null;
  };
  overallResult: "merged" | "blocked";
  ciRunUrl: string; // direct link to the actual CI run,
  // never a paraphrase
}
```

```typescript
export interface TrivyFinding {
  cveId: string;
  severity: "critical" | "high" | "medium" | "low";
  package: string;
  fixedVersion: string | null;
}

export interface OsvFinding {
  osvId: string;
  severity: string;
  package: string;
  fixedVersion: string | null;
}
```

**A blocked run's `findings` array is retained in the export for the historical record shown on the page (§3.2's "FAIL (CVE-2026-xxxxx)" cell), but only for runs that are already historical by the time they're published** — this page shows what _was_ wrong and got fixed, on a delay determined by the normal merge-and-fix cycle, never a currently-unresolved finding on an unmerged branch. The distinction that matters: by the time any failed run appears on this page, either the same commit was fixed in a subsequent run (§3.2's fail-then-fix pattern) or the branch was abandoned — there is no state where an actively-exploitable, currently-unpatched finding is sitting on this page waiting to be fixed.

---

## 5. Publishing Pipeline

```
CI run completes (pass or fail)
        │
        ▼
SecurityScanRunRecord emitted as a build artifact, unconditionally
        │
        ▼
A separate, scheduled job (not triggered by the scan run itself, to
avoid a compromised scan step being able to suppress its own record)
polls completed runs' artifacts and appends new records to the
published history
        │
        ▼
docs.clawql.com/security/status renders from the accumulated,
append-only record set
```

The append-only publishing job runs independently of the scan pipeline itself specifically so that a compromised or misbehaving scan step cannot also suppress the record of its own failure — the same separation-of-concerns principle already applied everywhere else in this project (policy separate from metering separate from delivery, in the spend governance spec; enforcement separate from what it enforces, in the plugin hook system).

---

## 6. What This Page Deliberately Does Not Claim

This page does not say "ClawQL is the most secure MCP gateway on the market" anywhere on it. It shows a specific, real, checkable process and its actual history. Any comparative claim beyond that is a separate marketing decision, made only once there is a defensible basis for it (a real, cross-project security survey, or a published third-party benchmark result naming multiple gateways) — this page's job is to make ClawQL's own posture self-evidently checkable, not to make a claim about anyone else's.

---

_Security Status Page Specification · v0.1 · August 2026_
_Location: docs.clawql.com/security/status_
_Contact: daniel@clawql.com_
