import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handle, createHandler, APP_RESULT_CAPABILITY, RESOURCE_URI, RESOURCE_MIME } from "../server/index.mjs";

describe("Mermaid MCP App", () => {
  test("tool discovery links to an offline, bounded UI resource", () => {
    const tool = handle("tools/list").tools[0];
    expect(tool._meta.ui.resourceUri).toBe(RESOURCE_URI);
    expect(tool._meta[APP_RESULT_CAPABILITY]).toBe(true);
    expect(handle("tools/list").tools.slice(1).every(tool => tool._meta.ui.visibility.join() === "app")).toBe(true);
    const resource = handle("resources/read", { uri: RESOURCE_URI }).contents[0];
    expect(resource.mimeType).toBe(RESOURCE_MIME);
    expect(Buffer.byteLength(resource.text)).toBeLessThan(4 * 1024 * 1024);
    expect(resource.text).not.toMatch(/<script[^>]+src=/);
    expect(resource.text).not.toContain("<!-- ENGINE -->");
    expect(resource.text).toContain('securityLevel:"strict"');
    expect(() => handle("resources/read", { uri: "file:///private" })).toThrow();
  });

  const initialize = () => handle("initialize", { capabilities:{ extensions:{ "io.modelcontextprotocol/ui":{ mimeTypes:[RESOURCE_MIME] } } } });
  const call = (name, args) => handle("tools/call", { name, arguments:args });
  test("returns only the actual render result and keeps concurrent requests separate", async () => {
    initialize();
    const source = 'flowchart LR\nA["<script>alert(1)</script>"] --> B';
    const first = call("render_mermaid", {source, title:"Demo"});
    const second = call("render_mermaid", {source:"invalid", title:"Other"});
    expect(first).toBeInstanceOf(Promise);
    const claim = call("claim_render", {source, title:"Demo"}).structuredContent;
    expect(call("claim_render", {source, title:"Demo"}).structuredContent.waiting).toBe(true);
    expect(call("complete_render", {render_id:claim.render_id, result:{ok:true}}).isError).toBe(true);
    const success = {ok:true, diagram_type:"flowchart-v2", width:320, height:120};
    call("complete_render", {render_id:claim.render_id, result:success});
    expect(await first).toMatchObject({isError:false, structuredContent:{...success, source, title:"Demo"}});
    expect(call("complete_render", {render_id:claim.render_id, result:success}).isError).toBe(true);
    const other = call("claim_render", {source:"invalid", title:"Other"}).structuredContent;
    const error = {ok:false, error:{message:"Parse error on line 2", line:2}};
    call("complete_render", {render_id:other.render_id, result:error});
    expect(await second).toMatchObject({isError:true, structuredContent:{...error, source:"invalid"}});
  });
  test("a different conversation cannot claim another conversation's render", async () => {
    initialize();
    const args={source:"flowchart LR\nA-->B",title:"Scoped",_openagent:{conversation_id:"owner"}};
    const pending=call("render_mermaid",args);
    expect(call("claim_render",{source:args.source,title:args.title,conversation_id:"sibling"}).structuredContent.waiting).toBe(true);
    const {render_id}=call("claim_render",{source:args.source,title:args.title,conversation_id:"owner"}).structuredContent;
    call("complete_render",{render_id,result:{ok:true,diagram_type:"flowchart-v2",width:100,height:100}});
    expect((await pending).isError).toBe(false);
  });
  test("rejects unsupported hosts and invalid input without claiming success", () => {
    handle("initialize", {});
    expect(call("render_mermaid", {source:"flowchart LR\nA-->B"}).isError).toBe(true);
    initialize();
    for (const args of [{}, {source:" "}, {source:1}, {source:"x", path:"secret"}, {source:"图".repeat(33334)}, {source:"x", title:2}]) {
      expect(call("render_mermaid", args).isError).toBe(true);
    }
  });
  test("stdio handles app-only completion while a model tool request is pending", async () => {
    const child = Bun.spawn(["node", fileURLToPath(new URL("../server/index.mjs", import.meta.url))], {stdin:"pipe", stdout:"pipe", stderr:"pipe", windowsHide:true});
    const reader = child.stdout.getReader();
    let buffer="";
    const send = (id, method, params={}) => child.stdin.write(JSON.stringify({jsonrpc:"2.0", id, method, params})+"\n");
    async function receive(id) {
      for (;;) {
        const end=buffer.indexOf("\n");
        if(end>=0) { const message=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1); if(message.id===id) return message; continue; }
        const next=await reader.read(); if(next.done) throw new Error("Unexpected server exit"); buffer+=new TextDecoder().decode(next.value);
      }
    }
    try {
      send(1,"initialize",{capabilities:{extensions:{"io.modelcontextprotocol/ui":{mimeTypes:[RESOURCE_MIME]}}}}); await receive(1);
      const args={source:"flowchart LR\nA-->B",title:"stdio"};
      send(2,"tools/call",{name:"render_mermaid",arguments:args});
      send(3,"tools/call",{name:"claim_render",arguments:args});
      const claim=(await receive(3)).result.structuredContent;
      send(4,"tools/call",{name:"complete_render",arguments:{render_id:claim.render_id,result:{ok:true,diagram_type:"flowchart-v2",width:100,height:200}}});
      expect((await receive(2)).result.structuredContent.ok).toBe(true);
    } finally { child.kill(); await child.exited; }
  });

  test("a missing or disconnected renderer returns a bounded timeout failure", async () => {
    const handler=createHandler({resultTimeout:5});
    handler("initialize", {capabilities:{extensions:{"io.modelcontextprotocol/ui":{mimeTypes:[RESOURCE_MIME]}}}});
    const result=await handler("tools/call",{name:"render_mermaid",arguments:{source:"flowchart LR\nA-->B"}});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ok:false,status:"error",error:{code:"render_failed"}});
    expect(handler("tools/call",{name:"claim_render",arguments:{source:"flowchart LR\nA-->B",title:""}}).structuredContent.waiting).toBe(true);
  });

  test("every advertised locale covers the same editor strings", () => {
    const manifest = JSON.parse(readFileSync(new URL("../plugin.json",import.meta.url)));
    expect(manifest.extensions.openagent.i18n.supported_locales.sort()).toEqual(["en","zh"]);
    const widget = readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
    expect(widget).toContain('event.source !== parent');
    expect(widget).not.toContain("navigator.language");
  });
});
