// Material 3 type scale.
//
// Each token is a keyed Style[TargetType=TextBlock] that consumers
// apply via `TextBlock [Style = @TitleLarge]`. Sizes and weights
// follow the M3 spec
// (https://m3.material.io/styles/typography/type-scale-tokens) —
// thirteen styles spanning Display / Headline / Title / Body / Label,
// each at three weights (Large / Medium / Small). LineHeight is part
// of the spec but TextBlock doesn't yet expose a LineHeight DP; once
// it does these Styles will gain matching Setters.
//
// FontFamily intentionally stays default. M3 baseline is Roboto, but
// loading a non-system font in the framework would be a fingerprinting
// surface and a layout-stability hazard. Hosts that want Roboto can
// override per-Style or set Application-level FontFamily.
//
// FontWeight: M3 specifies Medium (500) for Title/Label tiers, but the
// framework's FontWeight enum only exposes Normal and Bold today. Until
// Medium lands, those tiers ship as Normal (which preserves the
// per-FontSize ordering even if it understates the title emphasis).
// Once FontWeight.Medium exists, this file updates and no consumer
// markup has to change.
//
// Typography is light/dark agnostic — these Styles register once and
// stay across SetTheme swaps. material.ts handles that lifecycle:
// the typography dictionary is merged on the first SetTheme call and
// never removed.

ResourceDictionary {

    // ── Display tier (large hero headings) ──────────────────────────
    Style x:key="DisplayLarge"  [TargetType=TextBlock] { FontSize = 57; FontWeight = Normal; }
    Style x:key="DisplayMedium" [TargetType=TextBlock] { FontSize = 45; FontWeight = Normal; }
    Style x:key="DisplaySmall"  [TargetType=TextBlock] { FontSize = 36; FontWeight = Normal; }

    // ── Headline tier (page / section headings) ─────────────────────
    Style x:key="HeadlineLarge"  [TargetType=TextBlock] { FontSize = 32; FontWeight = Normal; }
    Style x:key="HeadlineMedium" [TargetType=TextBlock] { FontSize = 28; FontWeight = Normal; }
    Style x:key="HeadlineSmall"  [TargetType=TextBlock] { FontSize = 24; FontWeight = Normal; }

    // ── Title tier (card / sub-section titles) ──────────────────────
    Style x:key="TitleLarge"  [TargetType=TextBlock] { FontSize = 22; FontWeight = Normal; }
    Style x:key="TitleMedium" [TargetType=TextBlock] { FontSize = 16; FontWeight = Normal; }
    Style x:key="TitleSmall"  [TargetType=TextBlock] { FontSize = 14; FontWeight = Normal; }

    // ── Body tier (paragraph / list / form text) ────────────────────
    Style x:key="BodyLarge"  [TargetType=TextBlock] { FontSize = 16; FontWeight = Normal; }
    Style x:key="BodyMedium" [TargetType=TextBlock] { FontSize = 14; FontWeight = Normal; }
    Style x:key="BodySmall"  [TargetType=TextBlock] { FontSize = 12; FontWeight = Normal; }

    // ── Label tier (button / chip / dense-list captions) ────────────
    Style x:key="LabelLarge"  [TargetType=TextBlock] { FontSize = 14; FontWeight = Normal; }
    Style x:key="LabelMedium" [TargetType=TextBlock] { FontSize = 12; FontWeight = Normal; }
    Style x:key="LabelSmall"  [TargetType=TextBlock] { FontSize = 11; FontWeight = Normal; }
}
