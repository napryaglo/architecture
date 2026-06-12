// Material 3 type scale.
//
// Each token is a keyed Style[TargetType=TextBlock] that consumers
// apply via `TextBlock [Style = @TitleLarge]`. The setter values bind
// to the atomic typography tokens declared in material.mu's
// `tokens { … }` block, so a theme that wants to override a single
// atom (e.g. flip the body family to a brand typeface without
// restating the sizes) re-binds the matching @-token at scheme
// registration and every consumer Style picks the change up live via
// the DynamicResource pipeline.
//
// All five atoms — Font, Weight, Size, LineHeight, Tracking — flow
// through here per role. Tracking maps to TextBlock.LetterSpacing
// (added in Phase 0 of m3-modernization-plan.md).
//
// Typography is light/dark agnostic — these Styles register once and
// stay across SetTheme swaps. material.ts handles that lifecycle:
// the typography dictionary is merged on the first SetTheme call and
// never removed.

resources Typography {

    // ── Display tier (large hero headings) ──────────────────────────
    Style x:key="DisplayLarge"  [TargetType=TextBlock] {
        FontFamily    = @DisplayLargeFont;
        FontWeight    = @DisplayLargeWeight;
        FontSize      = @DisplayLargeSize;
        LineHeight    = @DisplayLargeLineHeight;
        LetterSpacing = @DisplayLargeTracking;
    }
    Style x:key="DisplayMedium" [TargetType=TextBlock] {
        FontFamily    = @DisplayMediumFont;
        FontWeight    = @DisplayMediumWeight;
        FontSize      = @DisplayMediumSize;
        LineHeight    = @DisplayMediumLineHeight;
        LetterSpacing = @DisplayMediumTracking;
    }
    Style x:key="DisplaySmall"  [TargetType=TextBlock] {
        FontFamily    = @DisplaySmallFont;
        FontWeight    = @DisplaySmallWeight;
        FontSize      = @DisplaySmallSize;
        LineHeight    = @DisplaySmallLineHeight;
        LetterSpacing = @DisplaySmallTracking;
    }

    // ── Headline tier (page / section headings) ─────────────────────
    Style x:key="HeadlineLarge"  [TargetType=TextBlock] {
        FontFamily    = @HeadlineLargeFont;
        FontWeight    = @HeadlineLargeWeight;
        FontSize      = @HeadlineLargeSize;
        LineHeight    = @HeadlineLargeLineHeight;
        LetterSpacing = @HeadlineLargeTracking;
    }
    Style x:key="HeadlineMedium" [TargetType=TextBlock] {
        FontFamily    = @HeadlineMediumFont;
        FontWeight    = @HeadlineMediumWeight;
        FontSize      = @HeadlineMediumSize;
        LineHeight    = @HeadlineMediumLineHeight;
        LetterSpacing = @HeadlineMediumTracking;
    }
    Style x:key="HeadlineSmall"  [TargetType=TextBlock] {
        FontFamily    = @HeadlineSmallFont;
        FontWeight    = @HeadlineSmallWeight;
        FontSize      = @HeadlineSmallSize;
        LineHeight    = @HeadlineSmallLineHeight;
        LetterSpacing = @HeadlineSmallTracking;
    }

    // ── Title tier (card / sub-section titles) ──────────────────────
    Style x:key="TitleLarge"  [TargetType=TextBlock] {
        FontFamily    = @TitleLargeFont;
        FontWeight    = @TitleLargeWeight;
        FontSize      = @TitleLargeSize;
        LineHeight    = @TitleLargeLineHeight;
        LetterSpacing = @TitleLargeTracking;
    }
    Style x:key="TitleMedium" [TargetType=TextBlock] {
        FontFamily    = @TitleMediumFont;
        FontWeight    = @TitleMediumWeight;
        FontSize      = @TitleMediumSize;
        LineHeight    = @TitleMediumLineHeight;
        LetterSpacing = @TitleMediumTracking;
    }
    Style x:key="TitleSmall"  [TargetType=TextBlock] {
        FontFamily    = @TitleSmallFont;
        FontWeight    = @TitleSmallWeight;
        FontSize      = @TitleSmallSize;
        LineHeight    = @TitleSmallLineHeight;
        LetterSpacing = @TitleSmallTracking;
    }

    // ── Body tier (paragraph / list / form text) ────────────────────
    Style x:key="BodyLarge"  [TargetType=TextBlock] {
        FontFamily    = @BodyLargeFont;
        FontWeight    = @BodyLargeWeight;
        FontSize      = @BodyLargeSize;
        LineHeight    = @BodyLargeLineHeight;
        LetterSpacing = @BodyLargeTracking;
    }
    Style x:key="BodyMedium" [TargetType=TextBlock] {
        FontFamily    = @BodyMediumFont;
        FontWeight    = @BodyMediumWeight;
        FontSize      = @BodyMediumSize;
        LineHeight    = @BodyMediumLineHeight;
        LetterSpacing = @BodyMediumTracking;
    }
    Style x:key="BodySmall"  [TargetType=TextBlock] {
        FontFamily    = @BodySmallFont;
        FontWeight    = @BodySmallWeight;
        FontSize      = @BodySmallSize;
        LineHeight    = @BodySmallLineHeight;
        LetterSpacing = @BodySmallTracking;
    }

    // ── Label tier (button / chip / dense-list captions) ────────────
    Style x:key="LabelLarge"  [TargetType=TextBlock] {
        FontFamily    = @LabelLargeFont;
        FontWeight    = @LabelLargeWeight;
        FontSize      = @LabelLargeSize;
        LineHeight    = @LabelLargeLineHeight;
        LetterSpacing = @LabelLargeTracking;
    }
    Style x:key="LabelMedium" [TargetType=TextBlock] {
        FontFamily    = @LabelMediumFont;
        FontWeight    = @LabelMediumWeight;
        FontSize      = @LabelMediumSize;
        LineHeight    = @LabelMediumLineHeight;
        LetterSpacing = @LabelMediumTracking;
    }
    Style x:key="LabelSmall"  [TargetType=TextBlock] {
        FontFamily    = @LabelSmallFont;
        FontWeight    = @LabelSmallWeight;
        FontSize      = @LabelSmallSize;
        LineHeight    = @LabelSmallLineHeight;
        LetterSpacing = @LabelSmallTracking;
    }
}
