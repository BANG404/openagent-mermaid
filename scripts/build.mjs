import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const mermaidRoot = dirname(require.resolve("mermaid/package.json"));
const engine = readFileSync(resolve(mermaidRoot, "dist/mermaid.min.js"), "utf8");
const template = readFileSync(new URL("../src/app.html", import.meta.url), "utf8");
const widget = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const escape = source => source.replace(/<\/script/gi, "<\\/script");
// Encode the engine as a JS string so HTML script parsing cannot interpret
// embedded <!-- / <script tokens inside Mermaid's bundled source.
const encodedEngine = JSON.stringify(engine).replaceAll("<", "\\u003c");
const html = template.replace("<!-- ENGINE -->", () => `<script>const engine=document.createElement('script');engine.textContent=${encodedEngine};document.head.append(engine);</script>`)
  .replace("<!-- WIDGET -->", () => `<script type="module">${escape(widget)}</script>`);
if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error("MCP App exceeds 4 MiB");
mkdirSync(new URL("../ui/", import.meta.url), { recursive: true });
writeFileSync(new URL("../ui/app.html", import.meta.url), html);
writeFileSync(new URL("../ui/MERMAID-LICENSE", import.meta.url), readFileSync(resolve(mermaidRoot, "LICENSE")));
console.log(`Built offline MCP App (${Buffer.byteLength(html)} bytes)`);
