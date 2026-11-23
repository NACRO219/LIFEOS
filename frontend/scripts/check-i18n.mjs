// Verifies every language file has exactly the English keys and the same {placeholders}.
//   node scripts/check-i18n.mjs
import fs from "node:fs";

const dir = new URL("../src/i18n/", import.meta.url);
const LINE = /^\s*"([^"]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$/gm;

function parse(file) {
  const src = fs.readFileSync(new URL(file, dir), "utf8");
  const map = new Map();
  for (const m of src.matchAll(LINE)) map.set(m[1], m[2]);
  return map;
}

const en = parse("en.ts");
const ph = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");

let bad = 0;
for (const f of fs.readdirSync(new URL("locales/", dir)).filter((x) => x.endsWith(".ts"))) {
  const d = parse("locales/" + f);
  const missing = [...en.keys()].filter((k) => !d.has(k));
  const extra = [...d.keys()].filter((k) => !en.has(k));
  const phBad = [...en.keys()].filter((k) => d.has(k) && ph(en.get(k)) !== ph(d.get(k)));
  const ok = !missing.length && !extra.length && !phBad.length;
  if (!ok) bad++;
  let msg = `${ok ? "OK  " : "FAIL"} ${f}: ${d.size}/${en.size} keys`;
  if (missing.length) msg += ` · missing ${missing.slice(0, 8).join(", ")}`;
  if (extra.length) msg += ` · extra ${extra.slice(0, 8).join(", ")}`;
  if (phBad.length) msg += ` · placeholder mismatch ${phBad.slice(0, 8).join(", ")}`;
  console.log(msg);
}
process.exit(bad ? 1 : 0);
