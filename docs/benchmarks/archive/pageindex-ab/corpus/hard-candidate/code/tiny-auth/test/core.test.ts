import { verifyToken } from "../src/core.js";
if (verifyToken(100) <= 100) throw new Error('expected growth');
