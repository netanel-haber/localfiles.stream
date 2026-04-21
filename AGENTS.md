# AGENTS.md

## Project Shape

- This is a small Vite + VanJS app.
- Most app logic lives in `src/main.js`.
- Most UI styling lives in `src/style.css`.
- Media metadata is persisted across Local Storage and IndexedDB. Preserve compatibility when adding fields by normalizing missing values.

## Current UX Expectations

- Do not show a redundant `Your Files` heading in the sidebar.
- Sidebar file titles should wrap to show the full name. Prefer normal whitespace wrapping and use `overflow-wrap: break-word` only as fallback.
- The currently playing file should be visibly highlighted in the sidebar.
- Show the current file title in the main player area as well.
- Render a red progress underline under each file title, including the current title in the main player area.
- Files can show a `New` badge.
- Uploading a file alone should not clear `New`.
- Any playback start counts as interaction and should clear `New`, including autoplay after upload and autoplay when restoring the last played file.

## Workflow Preferences

- For small UI-only changes, do not run `npm run build` by default. It is usually noise here.
- Run the build only when the change could affect bundling/imports/build-time behavior, or when the user explicitly asks for verification.
