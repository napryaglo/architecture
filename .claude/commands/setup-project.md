---
description: Rename the project descriptor to match the supplied project name and update its id/title fields. Run this once after cloning the template.
argument-hint: <project-name>
---

Set up the project as `$ARGUMENTS`.

Treat the argument as the canonical project name. Derive two forms from it:

- **kebab-case** for ids and filenames — e.g. `My Architecture` → `my-architecture`. Lowercase, ASCII letters/digits only, hyphens for separators, collapse runs of non-alphanumerics into single hyphens, trim leading/trailing hyphens.
- **Title Case** for human-readable labels — e.g. `my-architecture` → `My Architecture`. Split on hyphens/underscores/whitespace, capitalise each word.

Steps:

1. **Find the current descriptor.** Glob the project root for `*.proj.yaml`. Expect exactly one. If zero or more than one match, stop and ask the user.

2. **Rename if needed.** If the descriptor's filename doesn't already equal `<kebab>.proj.yaml`, rename via `git mv` if the file is tracked or plain `mv` if not. (Use `git ls-files --error-unmatch <file>` to check tracking — exit code 0 means tracked.) Do NOT use Write/Edit for the rename — they can't move files.

3. **Update the descriptor's content.** Read the renamed file. Set:
   - `id: <kebab>`
   - `title: <Title Case>`
   Preserve everything else — comments, `models[]`, `build:` block, ordering. Use Edit, not Write, to keep the file's existing comments intact.

4. **Update README.md and CLAUDE.md at the project root** if they exist. Replace placeholder occurrences of the previous project id (commonly `global_output` from the template's starter state) and the previous project title with the new values. Use `replace_all` where safe.

5. **Check the parent directory name.** The orchestrator looks for `<dir-name>.proj.yaml` by convention — so the project folder should ideally be named `<kebab>` too. If the parent dir is named differently, tell the user this in the final summary and remind them to rename it themselves (you can't rename your own working directory). Don't fail if it doesn't match — the descriptor name is what counts; the dir-name lookup is just a convenience default.

6. **Register VS Code extensions** under `.claude/agents/architect/tools/`. For each subdirectory there that contains a valid `package.json`, install the extension into the user's local VS Code extensions directory by folder-copy (the install method VS Code recognises without packaging or the `code` CLI):

   - Read each extension's `package.json`. Pull `publisher`, `name`, `version`. The install folder name is `<publisher>.<name>-<version>`.
   - Resolve the user extensions root with Python so it's cross-platform:
     ```
     py -c "from pathlib import Path; print(Path.home() / '.vscode' / 'extensions')"
     ```
     (Falls back to `~/.vscode/extensions` on macOS/Linux; same path on Windows under `%USERPROFILE%`.)
   - Copy the extension folder into `<extensions-root>/<install-folder-name>/`. Use `py -c "import shutil, sys; shutil.copytree(sys.argv[1], sys.argv[2], dirs_exist_ok=True)" <src> <dst>` so an existing install gets overwritten cleanly.
   - If the user extensions directory doesn't exist (VS Code never installed), skip extension registration with a note rather than failing — the project itself still works without the extensions; they're authoring conveniences.
   - Print one line per extension installed, with the install path.
   - Remind the user to reload VS Code (Command Palette → "Developer: Reload Window") so the extensions activate.

7. **Don't run the build.** Setup is configuration only — the user will run `/build` when they're ready.

8. **Report concisely.** One line per action taken: descriptor renamed, id/title updated, README/CLAUDE updated, extensions registered (or skipped), plus any reminders (parent-dir rename, VS Code reload). If `$ARGUMENTS` was already the configured name and the extensions are already current, say so and exit.

If `$ARGUMENTS` is empty or whitespace, stop and ask the user for a name.
