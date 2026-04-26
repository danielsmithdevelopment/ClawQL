# Onyx Explained: Open-Source Enterprise Search and AI Assistant Infrastructure

Onyx is an open-source AI platform focused on enterprise knowledge retrieval and assistant workflows. At a high level, it connects to internal systems, indexes documents with metadata and permissions, and makes that knowledge available to both search and chat experiences.

- **Website:** https://onyx.app
- **Docs:** https://docs.onyx.app
- **GitHub:** https://github.com/onyx-dot-app/onyx

## What Onyx Is Good At

Onyx is built for organizations that need AI answers grounded in internal data, not only public web knowledge. Its core value is combining:

- document indexing from many business tools,
- permission-aware retrieval,
- and assistant-style interaction layers (search, chat, agent-like workflows).

The docs emphasize that documents, metadata, and access controls are kept updated so retrieval stays close to real-time source state.

## How Onyx Retrieval Works (Conceptually)

While exact internals vary by deployment, the general pattern is:

1. **Connect:** Pull from internal sources via connectors.
2. **Index:** Process content and metadata for retrieval.
3. **Enforce permissions:** Restrict results based on user access.
4. **Retrieve context:** Use search (and often hybrid retrieval patterns) to find relevant chunks.
5. **Answer in UI:** Surface findings in search-first or chat-first flows.

This makes Onyx useful for enterprise Q&A, internal knowledge discovery, and assistant tooling that must respect access boundaries.

## Search Mode vs Chat Mode

The Onyx docs describe two complementary interaction styles:

- **Search UI:** Better when the user wants to quickly locate documents and filter by metadata.
- **Chat UI:** Better when the user wants synthesized answers that incorporate retrieved context.

In practice, teams often use search for exploration and chat for summarization/explanation.

## Practical Strengths

- **Permission-aware retrieval:** Critical for enterprise deployment.
- **Connector-centric architecture:** Reduces custom ingestion effort.
- **Unified search and assistant UX:** Lets users move from finding to answering quickly.
- **Open-source base:** Gives engineering teams customization and deployment control.

## Trade-Offs to Understand

- **Quality depends on ingestion hygiene:** Bad source metadata leads to weak retrieval.
- **Permissions are non-negotiable complexity:** Access modeling must be correct from day one.
- **Relevance tuning is ongoing:** Chunking, ranking, and filters require domain-specific iteration.

## Where It Fits in a Document/AI Stack

If your stack has extraction and transformation layers (for example Tika/Gotenberg/Stirling/Paperless), Onyx usually sits downstream as the retrieval and interaction layer:

- upstream services normalize and enrich documents,
- Onyx indexes and retrieves them,
- users and agents consume the results through search/chat flows.

## When to Choose Onyx

Onyx is a strong fit when you need:

- enterprise search over private knowledge,
- AI assistant experiences grounded in internal docs,
- and self-hosted/open-source flexibility.

If your use case is simple local search without access-control complexity, a lighter stack may be easier to operate.
