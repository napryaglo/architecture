import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Preload — the ONLY place renderer and main meet, across the context
// bridge. Plexus's native surface (open/save diagram, recent files) will be
// exposed here as a small typed `api` object; the renderer wraps it in an
// injected mural service so the app code stays host-agnostic. Empty for now
// — the skeleton just needs the window.
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (contextIsolation disabled)
  window.electron = electronAPI
  // @ts-ignore (contextIsolation disabled)
  window.api = api
}
