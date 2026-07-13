# µ-mural language support

VS Code extension for the [µ-mural](../../mural-language-design.md) markup
language. Provides syntax highlighting plus a Language Server that
reuses `mural/compiler` for:

- diagnostics (lex/parse/emit errors mapped to source ranges)
- completion (resource keys, control names, properties, keywords, enum
  values)
- hover (symbol module of origin, resolved `@key` values, keyword docs)
- go-to-definition (`@key` and `@@key` references, `x:key="…"` styles)
- document symbols (Outline view: resources + named styles)

## Develop

```sh
cd tooling/vscode
npm install           # installs mural via the parent file: dep
npm run build         # tsc → out/
```

Then in VS Code: open `tooling/vscode/` as a folder and press **F5** to
launch an Extension Development Host with the extension loaded.

## File extension

The extension activates on `*.mu` files (language id `mural`).
