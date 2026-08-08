# ClawQL `.cq*` file extensions

**Status:** Draft specs · [ADR 0010](../../adr/0010-cq-file-extensions.md)  
**License:** Apache 2.0 (format specs are open; implementations may be any license)

Open, one-page specifications for ClawQL-owned file types. Base content remains human-readable YAML or OKF Markdown. The extension is a **tooling signal**, not a binary container.

| Spec               | Extension | Role                                   |
| ------------------ | --------- | -------------------------------------- |
| [cqm.md](./cqm.md) | `.cqm`    | Manifest (governance, release, policy) |
| [cqe.md](./cqe.md) | `.cqe`    | Ontology entity                        |
| [cqw.md](./cqw.md) | `.cqw`    | Kinetic-aware workflow                 |
| [cqk.md](./cqk.md) | `.cqk`    | Provenanced knowledge entry            |

Related domain specs (not file-extension specs): [ontology/legal-domain-v0.1.md](../ontology/legal-domain-v0.1.md), [memory/memory-recall-structured-filter-v0.1.md](../memory/memory-recall-structured-filter-v0.1.md).

## Sequencing

1. OKF on vault `.md` — [memory/okf.md](../../memory/okf.md) (shipped)
2. These draft specs (now)
3. Dual-accept in CLI (e.g. ontology lint accepts `.cqe` + `.yaml`)
4. Promote files + editor/CI hooks when stable

## Design rule

A new extension is justified only when ClawQL-specific tooling must treat the file differently from generic YAML/Markdown. Configuration and plain OKF notes stay in existing formats.
