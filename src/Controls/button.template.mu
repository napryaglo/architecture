// Default ControlTemplate for Button — MUI Contained variant.
//
// Compiled to button.template.mu.js via `npm run build:templates`. The
// resulting module exports a `create()` factory returning a fresh
// ControlTemplate. Button's constructor imports the factory and assigns
// the produced template to `this.Template`.
//
// Template parts:
//   * PART_Border  — the rounded surface whose Background swaps on
//                    IsPressed / IsMouseOver. Constructor wires the
//                    listener after Apply() via FindName.
//   * (the ContentPresenter is discovered by ControlTemplate.Apply
//     without a name — `findFirstContentPresenter` walks the subtree
//     and grabs the first one it sees.)
//
// Resting palette values (MUI primary 700 / white text) are inlined as
// hex literals; templates own their look. The same values appear in
// theme.ts under `Theme.primary` / `Theme.primaryInk` and are consumed
// by Button's TS code when it needs the brush identity (hover and
// pressed swaps go to theme.primaryHover / theme.primaryPress).

ResourceDictionary {
    template x:key="DefaultButton"[targettype=Button]{
        Border x:name="PART_Border"[Background=#1976d2,
                                    BorderThickness=(0),
                                    CornerRadius=4,
                                    Padding=(16,6,16,6)]{
            ContentPresenter
        }
    }
}
