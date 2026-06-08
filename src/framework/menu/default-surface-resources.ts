import { Application } from '../../runtime/index.js';
import { create as createSurfaceTheme } from '../../../build/framework/menu/surface.template.mu.js';

// Default theme bundle for the command-surface controls — ToggleButton,
// ToolBar, Menu / MenuItem / MenuButton, ContextMenu. Kept in its own
// module (separate from `./default-resources.ts`) so the import of
// `surface.template.mu.js` only runs when a surface control's static
// block calls in here.
//
// Why the split matters: `default-resources.ts` is imported by Button's
// module. If `ensureSurfaceTheme` lived there, Button's load would
// transitively pull in `surface.template.mu.js` → `framework/surface.js`
// → `toggle-button.js` whose `extends Button` declaration would
// evaluate Button before Button's own static block finished — a TDZ
// `ReferenceError: Cannot access 'Button' before initialization`.
// Loading this module only from surface controls keeps Button's cascade
// surface-free, the same way the `Basic` barrel deliberately omits
// the surface re-exports.
export function ensureSurfaceTheme(): void
{
    if (Application.DefaultResourceFactories.includes(createSurfaceTheme)) return;
    Application.DefaultResourceFactories.push(createSurfaceTheme);
    // We deliberately do NOT call `Application.MergePendingDefaults`
    // here — that would invoke `createSurfaceTheme()` immediately
    // (through `getDefaultResources`), and the factory reads
    // `MenuButton` from its ESM import binding. When this push runs
    // inside MenuButton's own static block, that binding is still in
    // TDZ. Tree-walk lookups (`Application.ResolveDefaultResource`)
    // call `getDefaultResources` later when a Visual actually asks for
    // its theme Style, at which point every surface class is fully
    // initialised.
}
