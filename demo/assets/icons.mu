// Icon geometries for the demos.
//
// The SVG sources in ./icons are converted to shared Geometry resources at
// COMPILE TIME by the `include` keyword (this replaces the old build:icons
// codegen — see src/tooling/include-resolver.ts). Each "<name>.svg" becomes
// a Geometry keyed @<name>; paint is dropped, so a Shape paints it with a
// theme brush:
//
//     Shape [Geometry=@home, Fill=@OnSurface, Width=24, Height=24]
//
// The Shape scales the 24×24 geometry into its slot automatically. To add
// an icon, drop a new SVG in ./icons and rebuild — no extra line here.
resources Icons {
    include "icons/*.svg"
}
