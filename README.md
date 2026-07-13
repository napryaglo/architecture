# mural

A console TypeScript application.

## Setup

```bash
npm install
```

## Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | Run in watch mode with `tsx`             |
| `npm run build`    | Compile TypeScript to `dist/`            |
| `npm start`        | Run the compiled output                  |
| `npm run typecheck`| Type-check without emitting              |
| `npm run clean`    | Remove the `dist/` directory             |

## Usage

```bash
npm run dev -- --help
```

## Documentation

See [docs/](docs/README.md) for guides, including the
[Diagram API Guide](docs/diagram-api-guide.md) and
[Diagram User Manual](docs/diagram-user-manual.md).


To uninstall later: code --uninstall-extension mural-vscode.
To rebuild after edits: npm run build && npx @vscode/vsce package && code --install-extension mural-vscode-0.1.0.vsix --force.