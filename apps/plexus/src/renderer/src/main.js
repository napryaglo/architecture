// Renderer bootstrap — a thin plain-JS entry (mural convention: bootstraps
// stay plain JS). Vite bundles this and everything it pulls in, resolving
// `@visualisation-sub/mural/*` to the built dist (see electron.vite.config).
//
// `app` is the initialized Application compiled from app.mu; handing it an
// HtmlTarget mounts the mural UI into #app. In the Electron renderer this is
// Chromium, so mural's SVG pipeline runs exactly as it does in a browser.
import { app } from './app.mu.js'
import { HtmlTarget } from '@visualisation-sub/mural/visual-engine'

// Pin layout to the loaded icon-font metrics before mounting — measureText
// returns fallback widths until the @font-face resolves.
await document.fonts.load('24px "Material Symbols Outlined"')
app.initialize(new HtmlTarget(document.getElementById('app')))
