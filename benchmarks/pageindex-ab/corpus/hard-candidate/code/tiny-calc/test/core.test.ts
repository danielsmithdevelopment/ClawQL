import { scaleInterest } from "../src/core.js";
if (scaleInterest(100) <= 100) throw new Error('expected growth');
