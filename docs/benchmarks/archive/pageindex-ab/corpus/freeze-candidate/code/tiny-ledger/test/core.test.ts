import { postEntry } from "../src/core.js";
if (postEntry(100) <= 100) throw new Error("expected growth");
