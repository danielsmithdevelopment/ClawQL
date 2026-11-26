import { recordGauge } from "../src/core.js";
if (recordGauge(100) <= 100) throw new Error('expected growth');
