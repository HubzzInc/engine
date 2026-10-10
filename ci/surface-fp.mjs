// Surface fingerprint bridge: stdin JSON -> the engine's neswud2 identity.
//   echo '{"blocks":[...],"meta":"...","interfaces":[...]}' | npx tsx ci/surface-fp.mjs
//
// This is the engine leg of the hubzz-viz canon-parity guard
// (viz/tests/test_canon_parity.py). The viz computes the same fingerprint from
// its own Python port; feeding both the same blocks and interfaces must yield
// the identical string, which is what proves the port is not an approximation.
// Prints the fingerprint on stdout and nothing else — the caller compares it.
import { spaceSurfaceFingerprint } from "../space-shape";

const raw = await new Promise((resolve, reject) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (buf += c));
  process.stdin.on("end", () => resolve(buf));
  process.stdin.on("error", reject);
});

let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`surface-fp: stdin is not valid JSON: ${e.message}`);
  process.exit(1);
}

const { blocks, meta, interfaces = [] } = payload;
if (!Array.isArray(blocks) || typeof meta !== "string") {
  console.error('surface-fp: need {"blocks": ShapeBlock[], "meta": string, "interfaces"?: AuthoredInterface[]}');
  process.exit(1);
}

process.stdout.write(spaceSurfaceFingerprint(blocks, meta, interfaces) + "\n");
