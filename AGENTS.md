# Mermaid plugin

This independent package owns its MCP server and offline MCP Apps editor. Use
Bun. Pin Mermaid, retain its license, and rebuild `ui/app.html` with
`bun run build` after changing `src/` or the dependency. The HTML resource must
remain below the host's 4 MiB limit and work without network access. Use strict
Mermaid security, validate parent messages and keep all source as user data.

`render_mermaid` waits for actual widget rendering and returns that result.
Check the optional host capability before waiting. App-only claim/completion
correlates opaque one-shot render IDs; a missing UI must fail within 25 seconds.
Never claim or render a new job from history. Keep app-only tools outside the
model catalog. Match host AGUI canvas/icons and collapse source editing by
default. The widget can send a user-requested repair message. Follow host theme/locale changes without replacing source edits.
Reserve scaled SVG dimensions in layout, and refit only when the canvas bounds
or display mode changes. Scrollbars and equivalent context notifications must
not reset user zoom. Verify SVG visibility, zoom scrolling and fullscreen using
the host MCP UI transcript runner, including tall/wide diagrams and empty/error
recovery; a ready status alone does not prove the diagram is on screen.
Run package tests, host plugin validation and native MCP UI acceptance before
publishing. Increment both source versions for changed release bytes. Never
write to installed OpenAgent state during development.
