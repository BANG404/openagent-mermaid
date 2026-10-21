# Mermaid Diagrams / Mermaid 图示

Preview and edit Mermaid diagrams in a sandboxed MCP App. Rendering works offline
with the bundled Mermaid 11.16.1 engine. English and Chinese UI follow the host's
locale; theme changes keep the current source edits.
The editor follows MCP Apps `hostContext.styles.variables` for surface, text
and border colors, including switches between theme packages in the same mode.
Mermaid uses explicit dark-mode derivation and themed ER attribute rows. Hosts
without style variables receive the editor's built-in light/dark palette.

在隔离的 MCP App 中预览和编辑 Mermaid 图示，内置 Mermaid 引擎，支持离线渲染。
界面跟随宿主的中英文和明暗主题设置，切换时保留编辑内容。

Install this directory through OpenAgent's local plugin installation. The package
uses the host-provided Node interpreter and has no credential or configuration
requirements. Its relay tool is discovered on request; default diagrams in
OpenAgent remain reply-text AGUI `Mermaid(source: ..., title?: ...)` components.

`render_mermaid` accepts complete `source` and optional `title`. It waits for
actual browser rendering and returns the original MCP ToolResult with `ok`,
`status`, diagram type and dimensions, or the concrete render error. App-only
claim/completion tools correlate an opaque one-shot render ID. A missing or
closed frontend fails after 25 seconds. The server requires MCP Apps MIME support, and the app checks the host
`openagent/tool-result-from-app` capability. A host without that capability
receives a bounded timeout error instead of a false success. No headless browser or
network is required.

The diagram uses the same figure/canvas and top-right fit, zoom, fullscreen,
copy-source and PNG/SVG download controls as host AGUI Mermaid. Source editing
is initially collapsed. Actual local edits also update model context; they do
not replace a completed ToolResult. Syntax failures offer an explicit Agent
repair action. The tool's error remains available to the model for correction.

The UI verifies parent messages and performs the standard MCP Apps initialization
handshake. It requests no network access. Source is data and Mermaid runs with
strict security. Editing stays in the mounted frame; a conversation reload
restores the original tool payload. Repeated host payloads and turn completion
preserve edits in the mounted frame. The app does not persist unsaved local edits.

Fit reserves the scaled SVG dimensions so tall and wide diagrams stay inside
the visible canvas. Zoomed diagrams scroll in both directions. Fullscreen uses
the available window height; resizing and mode changes refit the diagram while
preserving the current source. Escape returns to the inline editor.

Develop with `bun install --frozen-lockfile`, `bun run build`, and `bun test`.
The generated self-contained HTML must stay below 4 MiB; commit it and the
bundled Mermaid license so installed packages need no build step.
