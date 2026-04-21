import type { Section } from '@/components/SectionProvider'

/** In-page nav for `/case-studies/truenas-scale-corgicave-homelab` (h2 ids match @sindresorhus/slugify). */
export const caseStudyTruenasCorgicaveSections: Array<Section> = [
  { title: '1. Why this case study exists', id: '1-why-this-case-study-exists' },
  { title: '2. System under test (inventory)', id: '2-system-under-test-inventory' },
  {
    title: '3. Initial symptoms and user actions (TrueNAS side)',
    id: '3-initial-symptoms-and-user-actions-true-nas-side',
  },
  {
    title: '4. Phase A — Cursor agent host vs your LAN (first ping / curl)',
    id: '4-phase-a-cursor-agent-host-vs-your-lan-first-ping-curl',
  },
  {
    title: '5. Phase B — memory_recall then memory_ingest (durable trail)',
    id: '5-phase-b-memory-recall-then-memory-ingest-durable-trail',
  },
  {
    title: '6. Phase C — Another Mac on a richer path (ARP + TCP semantics)',
    id: '6-phase-c-another-mac-on-a-richer-path-arp-tcp-semantics',
  },
  {
    title: '7. Phase D — Thunderbolt console path (critical correction)',
    id: '7-phase-d-thunderbolt-console-path-critical-correction',
  },
  {
    title: '8. Phase E — Homelab topology: “offline” island vs “no UI”',
    id: '8-phase-e-homelab-topology-offline-island-vs-no-ui',
  },
  {
    title: '9. Phase F — Mac mini curl openssl errno 49 EADDRNOTAVAIL',
    id: '9-phase-f-mac-mini-curl-openssl-errno-49-eaddrnotavail',
  },
  {
    title: '10. Phase G — SSH enablement (UI path) and first-login friction',
    id: '10-phase-g-ssh-enablement-ui-path-and-first-login-friction',
  },
  { title: '11. Preventive runbook (condensed)', id: '11-preventive-runbook-condensed' },
  {
    title: '12. memory_recall on this topic (what comes back)',
    id: '12-memory-recall-on-this-topic-what-comes-back',
  },
  { title: '13. memory_ingest of this case study', id: '13-memory-ingest-of-this-case-study' },
  { title: '14. References (in-repo)', id: '14-references-in-repo' },
  {
    title: '15. Detailed chronological timeline (cross-thread)',
    id: '15-detailed-chronological-timeline-cross-thread',
  },
  {
    title: '16. Appendix A — Command snippets (reference)',
    id: '16-appendix-a-command-snippets-reference',
  },
  {
    title: '17. Appendix B — Vault memory_ingest session IDs (2026-04-20)',
    id: '17-appendix-b-vault-memory-ingest-session-ids-2026-04-20',
  },
  {
    title: '18. Appendix C — Evidence hygiene (Gemini vs measured)',
    id: '18-appendix-c-evidence-hygiene-gemini-vs-measured',
  },
  { title: '19. Changelog', id: '19-changelog' },
]
