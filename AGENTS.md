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

## Sem Compress

- Semantic compression means removing duplicated behavior, repeated control flow, dead wrappers, or low-value helper layers.
- It does not mean whitespace cleanup, brace cleanup, converting `function` declarations to `const`, shortening names, or any other syntactic churn that leaves the same logic in place.
- Do not count log removal as semantic compression unless the logging path itself is duplicated or structurally redundant.
- If the user says to stay single-file, do not treat file-splitting as cleanup.
- Prefer concrete helpers that collapse real repetition:
  `title + badge + progress` rendering shared between sidebar and player.
  Player event handlers that all start by reading `data-current-file-id`.
  Repeated DB/store access paths and stored-file reconstruction.
  Repeated launch/share/restore control flow.
- Reject refactors that only hide code structure or move lines around without making the behavior flatter.
- If a large LOC target cannot be reached honestly under the current constraints, say so plainly instead of padding the diff with fake cleanup.
- In this repo, the honest ceiling for single-file sem-compress is much lower than "remove 500 lines" unless architecture changes are allowed.
