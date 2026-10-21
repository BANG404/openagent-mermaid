import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export const RESOURCE_URI = "ui://mermaid/editor.html";
export const RESOURCE_MIME = "text/html;profile=mcp-app";
const version = "1.1.0";
export const APP_RESULT_CAPABILITY = "openagent/tool-result-from-app";
const failure = message => ({ isError: true, content: [{ type: "text", text: JSON.stringify({ ok: false, status: "error", error: { code: "render_failed", message } }) }] });
const appTool = (name, properties, required) => ({
  name, description: "Mermaid renderer handshake (app only).",
  inputSchema: { type: "object", properties, required, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
});
const claimTool = appTool("claim_render", { source: { type: "string" }, title: { type: "string" }, conversation_id: { type: "string" } }, ["source", "title", "conversation_id"]);
const completeTool = appTool("complete_render", {
  render_id: { type: "string" }, result: { type: "object" },
}, ["render_id", "result"]);
const resource = {
  uri: RESOURCE_URI,
  name: "Mermaid diagram editor",
  mimeType: RESOURCE_MIME,
  _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } },
};
const tool = {
  name: "render_mermaid",
  description: "Render a Mermaid diagram and return its actual rendering result: success with diagram type and dimensions, or a syntax/render error. The diagram appears in chat with the host AGUI-style controls. Requires an active OpenAgent chat window.",
  inputSchema: {
    type: "object",
    properties: { source: { type: "string", minLength: 1 }, title: { type: "string", maxLength: 256 } },
    required: ["source"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: RESOURCE_URI }, [APP_RESULT_CAPABILITY]: true },
};

export function createHandler({ resultTimeout = 25_000 } = {}) {
  const jobs = new Map();
  let supportsAppResults = false;
  return function handle(method, params = {}) {
  switch (method) {
    case "initialize":
      supportsAppResults = params.capabilities?.extensions?.["io.modelcontextprotocol/ui"]?.mimeTypes?.includes(RESOURCE_MIME) === true;
      return { protocolVersion: "2025-11-25", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "openagent-mermaid", version } };
    case "ping": return {};
    case "tools/list": return { tools: [tool, claimTool, completeTool] };
    case "resources/list": return { resources: [resource] };
    case "resources/templates/list": return { resourceTemplates: [] };
    case "resources/read": {
      if (params.uri !== RESOURCE_URI) throw Object.assign(new Error("Unknown resource"), { code: -32602 });
      const html = readFileSync(new URL("../ui/app.html", import.meta.url), "utf8");
      if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error("UI resource exceeds 4 MiB");
      return { contents: [{ ...resource, text: html }] };
    }
    case "tools/call": {
      if (params.name === claimTool.name) {
        const args = params.arguments;
        const job = [...jobs.values()].find(job => !job.claimed && job.source === args?.source && job.title === args?.title && job.conversationId === (args?.conversation_id ?? ""));
        if (!job) return { content: [], structuredContent: { waiting: true } };
        job.claimed = true;
        return { content: [], structuredContent: { render_id: job.id } };
      }
      if (params.name === completeTool.name) {
        const { render_id, result } = params.arguments || {};
        const job = jobs.get(render_id);
        if (!job || !job.claimed) return failure("Unknown or expired render request.");
        if (!result || typeof result.ok !== "boolean" ||
            (result.ok && (typeof result.diagram_type !== "string" || !Number.isFinite(result.width) || result.width <= 0 || !Number.isFinite(result.height) || result.height <= 0)) ||
            (!result.ok && typeof result.error?.message !== "string")) return failure("Invalid rendering result.");
        const output = result.ok
          ? { ok: true, status: "rendered", diagram_type: result.diagram_type.slice(0, 64), width: result.width, height: result.height }
          : { ok: false, status: "error", error: { code: "render_failed", message: result.error.message.slice(0, 4000), ...(Number.isInteger(result.error.line) ? { line: result.error.line } : {}) } };
        clearTimeout(job.timer); jobs.delete(render_id);
        job.resolve({ isError: !output.ok, content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: { ...output, source: job.source, title: job.title } });
        return { content: [{ type: "text", text: "Rendering result delivered." }] };
      }
      if (params.name !== tool.name) throw Object.assign(new Error("Unknown tool"), { code: -32602 });
      const args = params.arguments;
      if (!args || typeof args !== "object" || Array.isArray(args) ||
          Object.keys(args).some(key => !["source", "title", "_openagent"].includes(key)) ||
          typeof args.source !== "string" || !args.source.trim() ||
          Buffer.byteLength(args.source) > 100_000 ||
          (args.title !== undefined && (typeof args.title !== "string" || args.title.length > 256))) {
        return { isError: true, content: [{ type: "text", text: "Expected nonempty source (at most 100000 UTF-8 bytes) and optional title (at most 256 characters)." }] };
      }
      if (!supportsAppResults) return failure("This host does not support app rendering ToolResults. Update OpenAgent and retry in an active chat window.");
      return new Promise(resolve => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          jobs.delete(id);
          resolve(failure("Mermaid rendering timed out. Use OpenAgent with app ToolResult support, keep the chat window open and retry."));
        }, resultTimeout);
        jobs.set(id, { id, source: args.source, title: args.title ?? "", conversationId: typeof args._openagent?.conversation_id === "string" ? args._openagent.conversation_id : "", claimed: false, resolve, timer });
      });
    }
    default: throw Object.assign(new Error("Unsupported method"), { code: -32601 });
  }
  };
}
export const handle = createHandler();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    let message;
    try { message = JSON.parse(line); }
    catch { process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } })}\n`); continue; }
    if (message.id === undefined) continue;
    // Read app-only replies while the original rendering call is still pending.
    Promise.resolve().then(() => handle(message.method, message.params)).then(
      result => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n`),
      error => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: error.code ?? -32603, message: error.message } })}\n`),
    );
  }
}
