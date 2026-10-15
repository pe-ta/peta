// Node module hooks so unit tests can import app source directly:
// - "server-only" (bundled by Next.js, not installed) resolves to an empty module
// - extensionless relative imports ("./store") try .ts / .tsx
// - "@/..." maps to src/...
// Use: node --import ./e2e/ts-loader.mjs --experimental-strip-types e2e/unit.test.ts
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const SRC = ${JSON.stringify(new URL("../src/", import.meta.url).href)};
export async function resolve(spec, ctx, next) {
  if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  let s = spec.startsWith("@/") ? SRC + spec.slice(2) : spec;
  if ((s.startsWith(".") || s.startsWith("file:")) && !path.extname(s)) {
    const base = s.startsWith("file:") ? s : new URL(s, ctx.parentURL).href;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      if (existsSync(fileURLToPath(base + ext))) return { url: base + ext, shortCircuit: true };
    }
  }
  return next(s, ctx);
}
`),
);
