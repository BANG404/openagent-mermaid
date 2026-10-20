---
name: mermaid-diagrams
description: Use when the user requests an editable Mermaid diagram through the installed Mermaid MCP App.
---

Default diagram replies use the host's bare AGUI `Mermaid(source: ..., title?:
...)` syntax. For an editable MCP App, discover this package's Mermaid tool with
`load_tool` and call `render_mermaid` with complete source and an optional title.
The returned source is displayed in the package's offline editor. The tool
prepares the diagram; browser validation appears in the app. Do not claim it
passed validation from the tool result alone. If the user sends a repair request
from the app, correct the included source and error and return a new diagram.
