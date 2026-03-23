#!/usr/bin/env node
/**
 * CLI entry for the local GraphQL proxy (Express + graphql-http).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
await import(join(dir, "../dist/graphql-proxy.js"));
