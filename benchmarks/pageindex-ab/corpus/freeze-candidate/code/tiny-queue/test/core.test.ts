import { enqueueJob } from "../src/core.js";
if (enqueueJob(100) <= 100) throw new Error("expected growth");
