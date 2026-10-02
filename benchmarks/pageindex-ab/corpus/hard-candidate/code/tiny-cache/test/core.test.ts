import { evictKey } from "../src/core.js";
if (evictKey(100) <= 100) throw new Error('expected growth');
