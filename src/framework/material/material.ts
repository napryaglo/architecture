import { Application, ResourceDictionary } from '../../runtime/index.js';
import { MaterialElevationEffect } from '../../visual-engine/index.js';
import { create as createLight } from '../../../build/framework/material/light.mu.js';
import { create as createDark } from '../../../build/framework/material/dark.mu.js';
import { create as createTypography } from '../../../build/framework/material/typography.mu.js';

// Material 3 theme registration for µ-mural.
//
// The Material module is OPT-IN: nothing in framework/ or Basic/
// imports it. Demos (or library consumers) call SetTheme('light' | 'dark')
// during bootstrap, which merges the matching token dictionary into
// Application.current.Resources. Templates that consume tokens via
// `@Primary`, `@Surface`, … pick them up through the standard
// DynamicResource resolution walk; swapping the theme later re-paints
// every dependent property automatically (DynamicResource subscribes
// to the resource chain).
//
// Token name authority: see light.mu / dark.mu. The token names mirror
// the M3 spec verbatim, so a reader who knows M3 can map across
// without translation. Both palettes register under the same key set.

export type MaterialThemeName = 'light' | 'dark';

// Tracks the currently-active palette dictionary so SetTheme can
// remove it before merging the next one. Without this, repeated calls
// would stack dictionaries — the most recent would still win (merged
// dicts walk last-to-first) but the previous ones would leak.
//
// The Application reference is held so SetTheme can detect cases
// where Application.current changes between calls (test harness
// resets, multi-app hosts) and re-merge the dict into the fresh
// Application's Resources. Without this tracking, `SetTheme('light')`
// after a previous identical call would dedup and skip the merge,
// leaving the new Application without the palette.
let _currentDict: ResourceDictionary | undefined;
let _currentName: MaterialThemeName  | undefined;
let _currentApp:  Application        | undefined;

// Typography is light/dark agnostic — same FontSize / FontWeight
// values across schemes. Merged once on first SetTheme call and never
// swapped, only re-attached if the Application changes.
let _typographyDict:    ResourceDictionary | undefined;
let _typographyApp:     Application        | undefined;

// Switch Material to `theme`. Idempotent — calling with the current
// theme is a no-op. Must be called AFTER an Application is constructed
// (so Application.current is defined). Common bootstrap shape:
//
//   const app = buildApp(`Application{ resources: {} }`);
//   Material.SetTheme('light');
//   app.Mount(rootHost);
//
// Calling before any Application exists is an error — the resource
// chain has nowhere to land.
export function SetTheme(theme: MaterialThemeName): void
{
    const app = Application.current;
    if (app === undefined || app === null)
    {
        throw new Error(
            'Material.SetTheme: no Application.current — construct an Application before registering a theme.');
    }
    if (_currentName === theme && _currentDict !== undefined && _currentApp === app) return;

    // Drop the previous dict from whichever Application it lives in.
    // Common case: same Application — remove + re-merge below. Edge
    // case: Application changed (test harness, multi-app host) —
    // RemoveMergedDictionary on the prior app is a no-op when the
    // prior Application has already been torn down, so this is safe.
    if (_currentDict !== undefined && _currentApp !== undefined)
    {
        _currentApp.Resources.RemoveMergedDictionary(_currentDict);
        _currentDict = undefined;
    }

    const dict = theme === 'dark' ? createDark() : createLight();
    // M3 elevation tokens — registered alongside the colour palette so
    // `Effect = @Elevation2` resolves through the same DynamicResource
    // chain. Identical in both light and dark schemes (shadow tint is
    // already part of the elevation ramp).
    registerElevationTokens(dict);
    app.Resources.AddMergedDictionary(dict);
    _currentDict = dict;
    _currentName = theme;
    _currentApp  = app;

    // Typography piggybacks on the same Application lifecycle but
    // doesn't swap on theme change. Merge it lazily the first time
    // SetTheme runs for a given Application — subsequent SetTheme
    // calls on the same Application skip this branch.
    if (_typographyApp !== app)
    {
        if (_typographyDict !== undefined && _typographyApp !== undefined)
        {
            _typographyApp.Resources.RemoveMergedDictionary(_typographyDict);
        }
        _typographyDict = createTypography();
        app.Resources.AddMergedDictionary(_typographyDict);
        _typographyApp  = app;
    }
}

// The currently-active theme, or undefined if SetTheme hasn't been
// called. Useful for the demo platform's theme-toggle UI to display
// the right label.
export function CurrentTheme(): MaterialThemeName | undefined
{
    return _currentName;
}

// Toggle between light and dark. Convenience for the demo platform's
// theme-swap button. Defaults to 'light' if neither has been set
// (first call lights up the theme).
export function ToggleTheme(): MaterialThemeName
{
    const next: MaterialThemeName =
        _currentName === 'light' ? 'dark' : 'light';
    SetTheme(next);
    return next;
}

// Adds @Elevation1 … @Elevation5 entries to a freshly-built palette
// dictionary. Kept inline (vs declaring in *.mu) because Effects are
// runtime objects not expressible as `.mu` literal values today.
// Levels follow the M3 elevation spec (dual-shadow per level — see
// MaterialElevationEffect). Templates and authors reference them via
// `Effect = @Elevation2` exactly like any colour token.
function registerElevationTokens(dict: ResourceDictionary): void
{
    dict.Set('Elevation1', new MaterialElevationEffect(1));
    dict.Set('Elevation2', new MaterialElevationEffect(2));
    dict.Set('Elevation3', new MaterialElevationEffect(3));
    dict.Set('Elevation4', new MaterialElevationEffect(4));
    dict.Set('Elevation5', new MaterialElevationEffect(5));
}
