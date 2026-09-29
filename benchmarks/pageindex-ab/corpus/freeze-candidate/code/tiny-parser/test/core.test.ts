import { parseLine } from "../src/core.js";
if (parseLine(100) <= 100) throw new Error("expected growth");
