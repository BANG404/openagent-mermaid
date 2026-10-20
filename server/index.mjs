import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const RESOURCE_URI = "ui://mermaid/editor.html";
export const RESOURCE_MIME = "text/html;profile=mcp-app";
const version = "1.0.2";
const resource = {
  uri: RESOURCE_URI,
  name: "Mermaid diagram editor",
  mimeType: RESOURCE_MIME,
  _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
};
const tool = {
  name: "render_mermaid",
  description: "Open an editable Mermaid diagram in an MCP App. Returns source for the UI; rendering and syntax validation happen in the app. For ordinary diagrams use the host's AGUI Mermaid component.",
  inputSchema: {
    type: "object",
    properties: { source: { type: "string", minLength: 1 }, title: { type: "string", maxLength: 256 } },
    required: ["source"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI } },
};

export function handle(method, params = {}) {
  switch (method) {
    case "initialize":
      return { protocolVersion: "2025-11-25", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "openagent-mermaid", version } };
    case "ping": return {};
    case "tools/list": return { tools: [tool] };
    case "resources/list": return { resources: [resource] };
    case "resources/templates/list": return { resourceTemplates: [] };
    case "resources/read": {
      if (params.uri !== RESOURCE_URI) throw Object.assign(new Error("Unknown resource"), { code: -32602 });
      const html = readFileSync(new URL("../ui/app.html", import.meta.url), "utf8");
      if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error("UI resource exceeds 4 MiB");
      return { contents: [{ ...resource, text: html }] };
    }
    case "tools/call": {
      if (params.name !== tool.name) throw Object.assign(new Error("Unknown tool"), { code: -32602 });
      const args = params.arguments;
      if (!args || typeof args !== "object" || Array.isArray(args) ||
          Object.keys(args).some(key => !["source", "title", "_openagent"].includes(key)) ||
          typeof args.source !== "string" || !args.source.trim() ||
          Buffer.byteLength(args.source) > 100_000 ||
          (args.title !== undefined && (typeof args.title !== "string" || args.title.length > 256))) {
        return { isError: true, content: [{ type: "text", text: "Expected nonempty source (at most 100000 UTF-8 bytes) and optional title (at most 256 characters)." }] };
      }
      return {
        content: [{ type: "text", text: "Mermaid editor prepared. Rendering and validation are shown in the app." }],
        structuredContent: { source: args.source, title: args.title ?? "", status: "prepared" },
        isError: false,
      };
    }
    default: throw Object.assign(new Error("Unsupported method"), { code: -32601 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    let message;
    try { message = JSON.parse(line); }
    catch { process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } })}\n`); continue; }
    if (message.id === undefined) continue;
    try {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: handle(message.method, message.params) })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: error.code ?? -32603, message: error.message } })}\n`);
    }
  }
}
