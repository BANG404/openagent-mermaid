# Mermaid plugin

This independent package owns its MCP server and offline MCP Apps editor. Use
Bun. Pin Mermaid, retain its license, and rebuild `ui/app.html` with
`bun run build` after changing `src/` or the dependency. The HTML resource must
remain below the host's 4 MiB limit and work without network access. Use strict
Mermaid security, validate parent messages and keep all source as user data.

`render_mermaid` prepares a UI payload; it does not claim browser rendering has
succeeded. The widget owns render validation and can send a user-requested
repair message. Follow host theme/locale changes without replacing source edits.
Reserve scaled SVG dimensions in layout, and refit only when the canvas bounds
or display mode changes. Scrollbars and equivalent context notifications must
not reset user zoom. Verify SVG visibility, zoom scrolling and fullscreen using
the host MCP UI transcript runner, including tall/wide diagrams and empty/error
recovery; a ready status alone does not prove the diagram is on screen.
Run package tests, host plugin validation and native MCP UI acceptance before
publishing. Increment both source versions for changed release bytes. Never
write to installed OpenAgent state during development.
