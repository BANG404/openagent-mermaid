const strings = {
  en: { render:"Render", reset:"Reset", expand:"Expand", collapse:"Collapse", source:"Mermaid source", plus:"Zoom in", minus:"Zoom out", fit:"Fit", repair:"Ask agent to fix", loading:"Rendering…", ready:"Rendered", empty:"Enter Mermaid source.", failed:"Rendering failed", unavailable:"Host connection unavailable" },
  zh: { render:"渲染", reset:"重置", expand:"展开", collapse:"收起", source:"Mermaid 源码", plus:"放大", minus:"缩小", fit:"适应窗口", repair:"请 Agent 修复", loading:"渲染中…", ready:"已渲染", empty:"请输入 Mermaid 源码。", failed:"渲染失败", unavailable:"无法连接宿主" },
};
const element = id => document.getElementById(id);
let context = {}, locale = "en", original = "", title = "", status = "empty", detail = "";
let sequence = 0, generation = 0, zoom = 1;
let renderQueue = Promise.resolve();
const pending = new Map();
const send = message => parent.postMessage({ jsonrpc:"2.0", ...message }, "*");
function request(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(strings[locale].unavailable)); }, 10000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
}
function translate() {
  document.documentElement.lang = locale;
  document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = strings[locale][node.dataset.i18n]; });
  element("expand").textContent = strings[locale][context.displayMode === "fullscreen" ? "collapse" : "expand"];
  element("title").textContent = title || "Mermaid";
  element("source").setAttribute("aria-label", strings[locale].source);
  element("status").textContent = `${strings[locale][status]}${detail ? `\n${detail}` : ""}`;
}
function resize() { send({ method:"ui/notifications/size-changed", params:{ height:document.body.scrollHeight } }); }
function scale(value) { zoom = Math.max(0.1, Math.min(4, value)); element("diagram").style.transform = `scale(${zoom})`; }
function fit() {
  const svg = element("diagram").querySelector("svg");
  const viewport = element("viewport");
  if (!svg) return;
  const bounds = svg.viewBox.baseVal;
  scale(Math.min(1, (viewport.clientWidth-24)/(bounds.width || 800), (viewport.clientHeight-24)/(bounds.height || 400)));
}
function publishStatus(source) {
  void request("ui/update-model-context", { structuredContent: { mermaid: { source, title, status, error: detail || null } } }).catch(() => {});
}
async function render() {
  const current = ++generation;
  const source = element("source").value;
  if (!source.trim()) { element("diagram").replaceChildren(); status="empty"; detail=""; translate(); resize(); return; }
  status="loading"; detail=""; translate();
  const theme = context.theme === "dark" ? "dark" : "default";
  // Mermaid has global mutable configuration. Queue the underlying operation.
  const operation = renderQueue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    mermaid.initialize({ startOnLoad:false, securityLevel:"strict", theme, suppressErrorRendering:true, maxTextSize:100000 });
    return mermaid.render(`diagram-${current}`, source);
  });
  renderQueue = operation.then(() => {}, () => {});
  try {
    const result = await operation;
    if (current !== generation || !result) return;
    element("diagram").innerHTML = result.svg;
    status="ready"; detail=""; element("repair").hidden=true; fit();
  } catch (error) {
    if (current !== generation) return;
    element("diagram").replaceChildren(); status="failed"; detail=String(error.message || error).slice(0,2000); element("repair").hidden=false;
  }
  translate(); resize(); publishStatus(source);
}
function applyContext(next) {
  const previousTheme = context.theme;
  context = { ...context, ...next };
  locale = typeof context.locale === "string" && context.locale.toLowerCase().split("-")[0] === "zh" ? "zh" : "en";
  document.documentElement.classList.toggle("dark", context.theme === "dark");
  translate();
  if (previousTheme !== context.theme && original) void render();
}
function applyPayload(payload) {
  if (!payload || typeof payload.source !== "string") return;
  if (typeof payload.title === "string") title=payload.title;
  // Hosts resend input and result together when the turn becomes durable.
  // A title supplied only by the result must not reset local source edits.
  if (payload.source === original) { translate(); return; }
  original=payload.source;
  element("source").value=original; translate(); void render();
}
window.addEventListener("message", event => {
  if (event.source !== parent || event.data?.jsonrpc !== "2.0") return;
  const message=event.data;
  if (pending.has(message.id) && !message.method) {
    const task=pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    return;
  }
  if (message.method === "ui/notifications/host-context-changed") applyContext(message.params || {});
  if (message.method === "ui/notifications/tool-input") applyPayload(message.params?.arguments);
  if (message.method === "ui/notifications/tool-result" && !message.params?.isError) applyPayload(message.params?.structuredContent);
  if (message.method === "ui/resource-teardown" && message.id !== undefined) send({ id:message.id, result:{} });
});
element("render").onclick = () => void render();
element("reset").onclick = () => { element("source").value=original; void render(); };
element("plus").onclick = () => scale(zoom*1.2);
element("minus").onclick = () => scale(zoom/1.2);
element("fit").onclick = fit;
element("expand").onclick = async () => {
  try { const result=await request("ui/request-display-mode", { mode:context.displayMode === "fullscreen" ? "inline" : "fullscreen" }); applyContext({ displayMode:result.mode }); }
  catch (error) { status="failed"; detail=error.message; translate(); }
};
element("repair").onclick = async () => {
  try { await request("ui/message", { role:"user", content:[{ type:"text", text:`${locale === "zh" ? "请修复这个 Mermaid 图示" : "Please fix this Mermaid diagram"}:\n${element("source").value}\n${detail}` }] }); }
  catch (error) { status="failed"; detail=error.message; translate(); }
};
translate();
try {
  const result=await request("ui/initialize", { protocolVersion:"2026-01-26", appInfo:{ name:"openagent-mermaid", version:"1.0.0" }, appCapabilities:{} });
  applyContext(result.hostContext || {});
  send({ method:"ui/notifications/initialized", params:{} }); resize();
} catch (error) { status="failed"; detail=error.message; translate(); }
