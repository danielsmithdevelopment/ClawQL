import { routePacket } from "../src/core.js";
if (routePacket(100) <= 100) throw new Error("expected growth");
