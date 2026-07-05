// Renderer bootstrap — a thin plain-JS entry (mural convention: bootstraps
// stay plain JS). Vite bundles this and everything it pulls in, resolving
// `@visualisation-sub/mural/*` to the built dist (see electron.vite.config).
//
// `app` is the initialized Application compiled from app.mu; handing it an
// HtmlTarget mounts the mural UI into #app. In the Electron renderer this is
// Chromium, so mural's SVG pipeline runs exactly as it does in a browser.
import { app } from './app.mu.js'
import { HtmlTarget } from '@visualisation-sub/mural/visual-engine'
import { ContentHostService } from '@visualisation-sub/mural/framework'
import { DiagramWorkspaceService } from './modules/diagram/services/diagram-workspace-service.js'

// Surface any uncaught error prominently (a swallowed mount throw shows as a
// blank white window otherwise).
window.addEventListener('error', (e) => console.error('[plexus] uncaught:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[plexus] unhandled rejection:', e.reason))

// Pin layout to the loaded icon-font metrics before mounting — measureText
// returns fallback widths until the @font-face resolves.
await document.fonts.load('24px "Material Symbols Outlined"')
try {
    app.initialize(new HtmlTarget(document.getElementById('app')))
    // Open the seeded diagram as the initial document. The content region is
    // document-driven (DocumentsContentHostService under ContentHostService.Key),
    // so opening the workspace's document activates it → the canvas renders via
    // DataTemplate[DiagramDocument]. Composition-root concern: the bootstrap
    // decides what's open at launch.
    const host = app.Services.get(ContentHostService.Key)
    const workspace = app.Services.get(DiagramWorkspaceService.Key)
    if (host !== undefined && workspace !== undefined) host.Open(workspace.Document)
} catch (err) {
    console.error('[plexus] mount failed:', err)
    throw err
}
