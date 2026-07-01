import { afterEach, describe, expect, it, vi } from "vitest";
import {
  natsConfiguredForConsumer,
  natsConfiguredForPublish,
  natsConsumerResumeWorkflowEnabled,
} from "./env.js";

describe("nats env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires URL, jetstream, and publish flag for publish", () => {
    vi.stubEnv("CLAWQL_NATS_URL", "nats://localhost:4222");
    vi.stubEnv("CLAWQL_NATS_JETSTREAM", "1");
    expect(natsConfiguredForPublish()).toBe(false);
    vi.stubEnv("CLAWQL_NATS_ENABLE_PUBLISH", "1");
    expect(natsConfiguredForPublish()).toBe(true);
  });

  it("requires consumer resume flag for consumer", () => {
    vi.stubEnv("CLAWQL_NATS_URL", "nats://localhost:4222");
    vi.stubEnv("CLAWQL_NATS_JETSTREAM", "1");
    vi.stubEnv("CLAWQL_NATS_ENABLE_CONSUMER", "1");
    expect(natsConfiguredForConsumer()).toBe(false);
    vi.stubEnv("CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW", "1");
    expect(natsConfiguredForConsumer()).toBe(true);
    expect(natsConsumerResumeWorkflowEnabled()).toBe(true);
  });
});
