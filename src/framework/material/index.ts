// Material 3 theme barrel — re-exports the runtime API
// (SetTheme / CurrentTheme / ToggleTheme). The compiled token
// dictionaries (light.mu.js, dark.mu.js) are pulled in by material.ts
// itself; consumers don't import them directly.
export {
    SetTheme,
    CurrentTheme,
    ToggleTheme,
    type MaterialThemeName,
} from './material.js';
