const strings = {
  en: { edit:"Edit source", copy:"Copy Mermaid source code", download:"Download diagram", copied:"Copied", render:"Render", reset:"Reset", expand:"Expand", collapse:"Collapse", source:"Mermaid source", plus:"Zoom in", minus:"Zoom out", fit:"Fit", repair:"Ask agent to fix", loading:"Rendering…", ready:"Rendered", empty:"Enter Mermaid source.", failed:"Rendering failed", unavailable:"Host connection unavailable" },
  zh: { edit:"编辑源码", copy:"复制 Mermaid 源码", download:"下载图示", copied:"已复制", render:"渲染", reset:"重置", expand:"展开", collapse:"收起", source:"Mermaid 源码", plus:"放大", minus:"缩小", fit:"适应窗口", repair:"请 Agent 修复", loading:"渲染中…", ready:"已渲染", empty:"请输入 Mermaid 源码。", failed:"渲染失败", unavailable:"无法连接宿主" },
};
const element = id => document.getElementById(id);
let context = {}, locale = "en", original = "", title = "", status = "empty", detail = "";
let sequence = 0, generation = 0, zoom = 1;
let renderQueue = Promise.resolve();
let submitted = false, claim = null;
const APP_RESULT_CAPABILITY = "openagent/tool-result-from-app";
const pending = new Map();
function themeConfig() {
  const darkMode = context.theme === "dark";
  const variables = context.styles?.variables || {};
  const color = (name, fallback) => {
    const value = variables[name];
    if (typeof value !== "string" || !CSS.supports("color", value)) return fallback;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
    const [r,g,b,a] = ctx.getImageData(0,0,1,1).data;
    return a === 255 ? `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}` : `rgba(${r},${g},${b},${a/255})`;
  };
  const bg = color("--color-background-primary", darkMode ? "#18181b" : "#ffffff");
  const secondary = color("--color-background-secondary", darkMode ? "#27272a" : "#f4f4f5");
  const fg = color("--color-text-primary", darkMode ? "#eeeeee" : "#242424");
  const muted = color("--color-text-secondary", darkMode ? "#aaaaaa" : "#676767");
  const border = color("--color-border-primary", darkMode ? "#52525b" : "#d4d4d8");
  const themeVariables = { darkMode };
  for (const [value, keys] of [
    [bg, ["background","mainBkg","primaryColor","actorBkg","labelBoxBkgColor","clusterBkg","edgeLabelBackground","rowOdd","attributeBackgroundColorOdd"]],
    [secondary, ["secondaryColor","tertiaryColor","activationBkgColor","noteBkgColor","rowEven","attributeBackgroundColorEven","altSectionBkgColor"]],
    [fg, ["textColor","primaryTextColor","nodeTextColor","secondaryTextColor","tertiaryTextColor","titleColor","actorTextColor","signalTextColor","labelTextColor","loopTextColor","noteTextColor","taskTextColor","taskTextOutsideColor","taskTextLightColor","taskTextDarkColor"]],
    [border, ["primaryBorderColor","secondaryBorderColor","tertiaryBorderColor","nodeBorder","clusterBorder","actorBorder","labelBoxBorderColor","noteBorderColor","gridColor"]],
    [muted, ["lineColor","signalColor","activationBorderColor","actorLineColor","arrowheadColor"]],
  ]) for (const key of keys) themeVariables[key] = value;
  document.documentElement.style.setProperty("--bg", bg);
  document.documentElement.style.setProperty("--fg", fg);
  document.documentElement.style.setProperty("--muted", muted);
  document.documentElement.style.setProperty("--border", border);
  document.documentElement.style.setProperty("--secondary", secondary);
  const font = variables["--font-sans"];
  const fontFamily = typeof font === "string" && font ? font : "system-ui, sans-serif";
  document.documentElement.style.setProperty("--font", fontFamily);
  themeVariables.fontFamily = fontFamily;
  return { theme:"base", fontFamily, themeVariables };
}
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
  document.querySelectorAll("[data-label]").forEach(node => {
    const key = node.id === "expand" && context.displayMode === "fullscreen" ? "collapse" : node.dataset.label;
    node.title = strings[locale][key]; node.setAttribute("aria-label", strings[locale][key]);
  });
  element("title").textContent = title;
  element("title").hidden = !title;
  element("source").setAttribute("aria-label", strings[locale].source);
  element("status").textContent = `${strings[locale][status]}${detail ? `\n${detail}` : ""}`;
  element("status").hidden = status === "ready";
  element("status").dataset.state = status;
}
function resize() {
  if (!context.displayMode || context.displayMode === "inline") send({ method:"ui/notifications/size-changed", params:{ height:document.body.scrollHeight } });
}
function scale(value) {
  const svg = element("diagram").querySelector("svg");
  if (!svg || !Number.isFinite(value) || value <= 0) return;
  zoom = Math.min(4, value);
  const {width, height} = svg.viewBox.baseVal;
  svg.style.width = `${width}px`; svg.style.height = `${height}px`;
  // Layout must reserve the scaled dimensions, not the original SVG bounds.
  element("canvas").style.width = `${width * zoom}px`;
  element("canvas").style.height = `${height * zoom}px`;
  element("diagram").style.transform = `scale(${zoom})`;
}
function fit() {
  const svg = element("diagram").querySelector("svg");
  const viewport = element("viewport");
  if (!svg) return;
  const bounds = svg.viewBox.baseVal;
  scale(Math.min(1, (viewport.clientWidth-24)/(bounds.width || 800), (viewport.clientHeight-24)/(bounds.height || 400)));
  viewport.scrollTop=0; viewport.scrollLeft=0;
}
function publishStatus(source) {
  void request("ui/update-model-context", { structuredContent: { mermaid: { source, title, status, error: detail || null } } }).catch(() => {});
}
async function claimRender(source, payloadTitle) {
  // No job exists before the approved server call actually executes.
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await request("tools/call", { name:"claim_render", arguments:{source, title:payloadTitle, conversation_id:context["openagent/conversation-id"] || ""} });
    const id = response.structuredContent?.render_id;
    if (id) return id;
    if (submitted) return null;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}
async function completeRender(source, result) {
  if (submitted || source !== original || !claim) return;
  const id = await claim;
  if (!id || submitted) return;
  submitted = true;
  try { await request("tools/call", { name:"complete_render", arguments:{ render_id:id, result } }); }
  catch (error) { status="failed"; detail=error.message; translate(); }
}
async function render() {
  const current = ++generation;
  const source = element("source").value;
  if (!source.trim()) { element("diagram").replaceChildren(); element("canvas").style.cssText=""; element("repair").hidden=true; status="empty"; detail=""; translate(); resize(); publishStatus(source); return; }
  status="loading"; detail=""; translate();
  if (claim && !submitted && source === original) {
    const id = await claim;
    if (!id || current !== generation) return;
  }
  const theme = themeConfig();
  // Mermaid has global mutable configuration. Queue the underlying operation.
  const operation = renderQueue.catch(() => {}).then(async () => {
    if (current !== generation) return;
    mermaid.initialize({ startOnLoad:false, securityLevel:"strict", ...theme, suppressErrorRendering:true, maxTextSize:100000 });
    return mermaid.render(`diagram-${current}`, source);
  });
  renderQueue = operation.then(() => {}, () => {});
  try {
    const result = await operation;
    if (current !== generation || !result) return;
    element("diagram").innerHTML = result.svg;
    status="ready"; detail=""; element("repair").hidden=true; fit();
    const bounds = element("diagram").querySelector("svg").viewBox.baseVal;
    void completeRender(source, { ok:true, diagram_type:result.diagramType || mermaid.detectType(source), width:bounds.width, height:bounds.height });
  } catch (error) {
    if (current !== generation) return;
    element("diagram").replaceChildren(); element("canvas").style.cssText=""; status="failed"; detail=String(error.message || error).slice(0,2000); element("repair").hidden=false;
    void completeRender(source, { ok:false, error:{ message:detail, ...(Number.isInteger(error.hash?.loc?.first_line) ? { line:error.hash.loc.first_line } : {}) } });
  }
  translate(); resize(); publishStatus(source);
}
function applyContext(next) {
  const previousTheme = JSON.stringify([context.theme, context.styles?.variables]);
  const previousMode = context.displayMode;
  context = { ...context, ...next };
  locale = typeof context.locale === "string" && context.locale.toLowerCase().split("-")[0] === "zh" ? "zh" : "en";
  document.documentElement.classList.toggle("dark", context.theme === "dark");
  document.documentElement.dataset.displayMode = context.displayMode || "inline";
  themeConfig();
  translate();
  requestAnimationFrame(() => { if (previousMode !== context.displayMode) fit(); resize(); });
  if (previousTheme !== JSON.stringify([context.theme, context.styles?.variables]) && original) void render();
}
function applyPayload(payload, pendingResult = false) {
  if (!payload || typeof payload.source !== "string") return;
  if (typeof payload.title === "string") title=payload.title;
  // Hosts resend input and result together when the turn becomes durable.
  // A title supplied only by the result must not reset local source edits.
  if (payload.source === original) { translate(); return; }
  original=payload.source;
  submitted = typeof payload.ok === "boolean";
  claim = pendingResult && !submitted && context[APP_RESULT_CAPABILITY] ? claimRender(original, title).catch(error => { status="failed"; detail=error.message; translate(); return null; }) : null;
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
  if (message.method === "ui/notifications/tool-input") applyPayload(message.params?.arguments, message.params?.["openagent/tool-result-pending"] === true);
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
let viewportBounds = element("viewport").getBoundingClientRect();
let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const next = element("viewport").getBoundingClientRect();
    if (next.width === viewportBounds.width && next.height === viewportBounds.height) return;
    viewportBounds = next;
    fit(); resize();
  });
}).observe(element("viewport"), {box:"border-box"});
try {
  const result=await request("ui/initialize", { protocolVersion:"2026-01-26", appInfo:{ name:"openagent-mermaid", version:"1.1.0" }, appCapabilities:{} });
  applyContext({ ...result.hostContext, [APP_RESULT_CAPABILITY]:result.hostCapabilities?.[APP_RESULT_CAPABILITY] === true });
  send({ method:"ui/notifications/initialized", params:{} }); resize();
} catch (error) { status="failed"; detail=error.message; translate(); }

element("editor").ontoggle = resize;
element("copy").onclick = () => {
  const source = element("source"), editor = element("editor"), wasOpen = editor.open;
  editor.open = true; source.focus(); source.select();
  const copied = document.execCommand("copy"); editor.open = wasOpen;
  element("copy").title = copied ? strings[locale].copied : strings[locale].copy;
};
element("download").onclick = () => { element("download-menu").hidden = !element("download-menu").hidden; };
async function download(format) {
  const svg = element("diagram").querySelector("svg");
  if (!svg) return;
  const text = new XMLSerializer().serializeToString(svg);
  let data = btoa(unescape(encodeURIComponent(text))), mimeType = "image/svg+xml";
  if (format === "png") {
    const image = new Image(); image.src = `data:image/svg+xml;base64,${data}`; await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(svg.viewBox.baseVal.width * 2); canvas.height = Math.ceil(svg.viewBox.baseVal.height * 2);
    const ctx = canvas.getContext("2d"); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg");
    ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    data = canvas.toDataURL("image/png").split(",")[1]; mimeType = "image/png";
  }
  await request("ui/download-file", { name:`mermaid-diagram.${format}`, mimeType, data });
  element("download-menu").hidden = true;
}
for (const format of ["svg", "png"]) element(`download-${format}`).onclick = () => void download(format).catch(error => { detail=error.message; status="failed"; translate(); });
let pointer;
element("viewport").onpointerdown = event => {
  if (event.button !== 0) return;
  pointer={ x:event.clientX, y:event.clientY, left:element("viewport").scrollLeft, top:element("viewport").scrollTop };
  element("viewport").setPointerCapture(event.pointerId);
};
element("viewport").onpointermove = event => {
  if (!pointer) return;
  element("viewport").scrollLeft = pointer.left + pointer.x-event.clientX;
  element("viewport").scrollTop = pointer.top + pointer.y-event.clientY;
};
element("viewport").onpointerup = element("viewport").onpointercancel = () => { pointer=null; };
element("viewport").addEventListener("wheel", event => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault(); scale(zoom * Math.exp(-event.deltaY * .002));
}, {passive:false});
