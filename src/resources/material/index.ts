// Material 3 theme barrel.
//
// Exports the compiler-emitted Theme / Scheme classes (Material,
// MaterialLight, MaterialDark) so consumer .mu files can write
// `Application[Theme = Material, Scheme = MaterialLight]`, plus the
// legacy SetTheme / CurrentTheme / ToggleTheme helpers.
export {
    Material,
    MaterialLight,
    MaterialDark,
    SetTheme,
    CurrentTheme,
    ToggleTheme,
    MaterialThemeName,
} from './material.js';
export {
    DynamicSchemeVariant,
    makeDynamicScheme,
    makeDynamicLightDarkPair,
    type DynamicSchemeOptions,
} from './dynamic-scheme.js';
