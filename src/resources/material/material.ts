// Material 3 theme bundle for µ-mural — re-export shim.
//
// Theme + scheme classes are emitted by the .mu compiler from
// material.mu / light.mu / dark.mu. This file only:
//   1. Re-exports the compiler-emitted classes (Material,
//      MaterialLight, MaterialDark) so consumers import from a stable
//      `mural/resources/material` path.
//   2. Re-exports Typography (still a hand-authored .mu resource dict
//      consumed at TextBlock Style apply time, not as @-tokens).
//   3. Ships backward-compatibility helpers (SetTheme / CurrentTheme /
//      ToggleTheme) that pre-date Application.initialize so legacy
//      tests and demo bootstraps keep working unchanged.
//
// Module-load side effects (ThemeManager.RegisterTheme + Application.
// RegisterDefaultTheme) ride in the compiled material.mu.js — see the
// emit shape for compileThemeBlock. Importing this module is enough
// to enrol Material as the default theme.

import { Scheme, ThemeManager } from '../../runtime/index.js';

export { Material }      from '../../../build/resources/material/material.mu.js';
export { MaterialLight } from '../../../build/resources/material/light.mu.js';
export { MaterialDark }  from '../../../build/resources/material/dark.mu.js';
export { Typography }    from '../../../build/resources/material/typography.mu.js';

import { Material }      from '../../../build/resources/material/material.mu.js';
import { MaterialLight } from '../../../build/resources/material/light.mu.js';
import { MaterialDark }  from '../../../build/resources/material/dark.mu.js';

// ── Backward-compatibility aliases ────────────────────────────────────

export enum MaterialThemeName
{
    Light = 'light',
    Dark  = 'dark',
}

/** Legacy alias kept for tests and demos that pre-date
 *  `Application.initialize`. New code should pass class references to
 *  `app.initialize({ theme: Material, scheme: MaterialLight })`. */
export function SetTheme(theme: MaterialThemeName): void
{
    const scheme: typeof Scheme = theme === MaterialThemeName.Light ? MaterialLight : MaterialDark;
    Material.Activate(scheme);
}

export function CurrentTheme(): MaterialThemeName | undefined
{
    const s = ThemeManager.ActiveScheme;
    if (s === undefined) return undefined;
    if (s.name === 'MaterialLight') return MaterialThemeName.Light;
    if (s.name === 'MaterialDark')  return MaterialThemeName.Dark;
    return undefined;
}

export function ToggleTheme(): MaterialThemeName
{
    const next: MaterialThemeName = CurrentTheme() === MaterialThemeName.Light ? MaterialThemeName.Dark : MaterialThemeName.Light;
    SetTheme(next);
    return next;
}
