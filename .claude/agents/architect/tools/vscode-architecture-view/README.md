# Architecture View — VS Code syntax highlighting

Project-local VS Code extension that adds syntax highlighting for the Pragmatic Architecture Framework `.view` DSL.

## Install (development mode)

The fastest path — points VS Code at this folder so changes you make to the grammar take effect on reload, no packaging step:

```
code --extensionDevelopmentPath="<repo>/tools/vscode-architecture-view"
```

Replace `<repo>` with the absolute path to this repository's root.

## Install (persistent, no packaging)

Copy this folder into your user extensions directory:

- **Windows:** `%USERPROFILE%\.vscode\extensions\pragmatic-architecture.architecture-view-0.1.0\`
- **macOS / Linux:** `~/.vscode/extensions/pragmatic-architecture.architecture-view-0.1.0/`

Restart VS Code. The extension is loaded from there on every launch.

## Install (packaged `.vsix`)

If you want a versioned bundle:

```
npm install -g @vscode/vsce
cd tools/vscode-architecture-view
vsce package
code --install-extension architecture-view-0.1.0.vsix
```

## What it covers

Token classes from `view_compiler.py`:

- Comments (`//`, `/* */`)
- Strings (`"..."`), hex colors (`#rrggbb`), numbers
- Connector operators (`-->`, `<--`, `<-->`, `-|`, `|-`, `--`)
- Top-level keywords (`import`, `view`, `connectors`)
- Layout keywords (`hstack`, `vstack`, `canvas`, `ugrid`, `grid`, `group`, `dock`, `wpf-grid`)
- Placement keywords (`at`, `horizontal`, `vertical`, `anchor`, `distance`)
- Named anchors (`north`, `north-east`, `center`, …)
- `$id` references with `.anchor` accessor
- Attribute names (`name = value` pairs in `[...]` blocks)
- Bracket / paren / brace pairs

## Companion: `.markup` files

`.markup` files are auto-generated YAML; the workspace `.vscode/settings.json` already maps them to YAML, so they get standard YAML highlighting without any extension.
