import { describe, expect, it } from "vitest";

import { FIXTURE_ACTIVITY } from "../fixtures";
import { filterActivityEvents } from "../activity-filters";

describe("activity filters", () => {
  it("filters by kind", () => {
    const sources = filterActivityEvents(FIXTURE_ACTIVITY, "source", "all");
    expect(sources.map((e) => e.id)).toEqual(["act_seed_1"]);
  });

  it("filters by decision outcome", () => {
    const answered = filterActivityEvents(FIXTURE_ACTIVITY, "all", "answer");
    expect(answered.map((e) => e.id)).toEqual(["act_seed_2"]);
  });

  it("combines kind and decision", () => {
    const none = filterActivityEvents(FIXTURE_ACTIVITY, "source", "answer");
    expect(none).toHaveLength(0);
  });
});
