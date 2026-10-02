import { add, scaleInterest } from "../src/math.js";

if (add(2, 3) !== 5) throw new Error("add failed");
if (scaleInterest(1000, 375) !== 37.5) throw new Error("scaleInterest failed");
console.log("tiny-calc tests ok");
