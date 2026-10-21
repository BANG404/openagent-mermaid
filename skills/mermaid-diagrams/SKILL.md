---
name: mermaid-diagrams
description: Use when the user requests an editable Mermaid diagram through the installed Mermaid MCP App.
---

Default diagram replies use the host's bare AGUI `Mermaid(source: ..., title?:
...)` syntax. For an editable MCP App, discover this package's Mermaid tool with
`load_tool` and call `render_mermaid` with complete source and an optional title.
The tool waits for actual rendering in the active chat window. A successful
ToolResult has `ok: true`, `status: "rendered"`, diagram type and dimensions;
a failure has `ok: false`, `status: "error"` and the concrete diagnostic. Correct
syntax errors and call again. A disconnected frontend times out; unsupported
hosts fail explicitly. Do not treat those failures as a syntax error. Source
editing is available through the collapsed editor. If the user sends a repair
request from the app, correct the included source/error and return a new diagram.
