import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handle, RESOURCE_URI, RESOURCE_MIME } from "../server/index.mjs";

describe("Mermaid MCP App", () => {
  test("tool discovery links to an offline, bounded UI resource", () => {
    const tool = handle("tools/list").tools[0];
    expect(tool._meta.ui.resourceUri).toBe(RESOURCE_URI);
    const resource = handle("resources/read", { uri: RESOURCE_URI }).contents[0];
    expect(resource.mimeType).toBe(RESOURCE_MIME);
    expect(Buffer.byteLength(resource.text)).toBeLessThan(4 * 1024 * 1024);
    expect(resource.text).not.toMatch(/<script[^>]+src=/);
    expect(resource.text).not.toContain("<!-- ENGINE -->");
    expect(resource.text).toContain('securityLevel:"strict"');
    expect(() => handle("resources/read", { uri: "file:///private" })).toThrow();
  });

  test("prepares exact source without claiming browser validation", () => {
    const source = 'flowchart LR\nA["<script>alert(1)</script>"] --> B';
    const result = handle("tools/call", { name: "render_mermaid", arguments: { source, title: "Demo" } });
    expect(result.structuredContent).toEqual({ source, title: "Demo", status: "prepared" });
    expect(result.isError).toBe(false);
    expect(handle("tools/call", { name: "render_mermaid", arguments: { source, _openagent: { conversation_id: "test" } } }).structuredContent.source).toBe(source);
    for (const args of [{}, { source:" " }, { source:1 }, { source:"x", path:"secret" }, { source:"图".repeat(33334) }, { source:"x", title:2 }]) {
      expect(handle("tools/call", { name: "render_mermaid", arguments:args }).isError).toBe(true);
    }
  });

  test("stdio preserves IDs, notifications, parse failures and request order", () => {
    const messages = [
      { jsonrpc:"2.0", id:1, method:"initialize", params:{} },
      { jsonrpc:"2.0", method:"notifications/initialized" },
      { jsonrpc:"2.0", id:2, method:"tools/list" },
      { jsonrpc:"2.0", id:3, method:"tools/call", params:{ name:"render_mermaid", arguments:{ source:"flowchart LR\nA-->B" } } },
    ];
    const process = spawnSync("node", [fileURLToPath(new URL("../server/index.mjs", import.meta.url))], {
      input: `${messages.map(message => JSON.stringify(message)).join("\n")}\ninvalid\n`, encoding:"utf8", windowsHide:true,
    });
    expect(process.status).toBe(0);
    const replies = process.stdout.trim().split("\n").map(line => JSON.parse(line));
    expect(replies.map(reply => reply.id)).toEqual([1,2,3,null]);
    expect(replies[2].result.structuredContent.source).toContain("A-->B");
    expect(replies[3].error.code).toBe(-32700);
  });

  test("every advertised locale covers the same editor strings", () => {
    const manifest = JSON.parse(readFileSync(new URL("../plugin.json",import.meta.url)));
    expect(manifest.extensions.openagent.i18n.supported_locales.sort()).toEqual(["en","zh"]);
    const widget = readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
    expect(widget).toContain('event.source !== parent');
    expect(widget).not.toContain("navigator.language");
  });
});
