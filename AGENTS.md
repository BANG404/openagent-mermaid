# Mermaid plugin

This independent package owns its MCP server and offline MCP Apps editor. Use
Bun. Pin Mermaid, retain its license, and rebuild `ui/app.html` with
`bun run build` after changing `src/` or the dependency. The HTML resource must
remain below the host's 4 MiB limit and work without network access. Use strict
Mermaid security, validate parent messages and keep all source as user data.

`render_mermaid` prepares a UI payload; it does not claim browser rendering has
succeeded. The widget owns render validation and can send a user-requested
repair message. Follow host theme/locale changes without replacing source edits.
Run package tests, host plugin validation and native MCP UI acceptance before
publishing. Increment both source versions for changed release bytes. Never
write to installed OpenAgent state during development.
