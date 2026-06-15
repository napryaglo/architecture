// Contract exposed by panels (or other Visuals) that handle their own
// scrolling extent — typically a VirtualizingStackPanel, where the
// panel knows the full Extent (item count × item size) and only
// materializes containers for the items inside the Viewport.
//
// When a ScrollViewer's Content (or its first visual descendant)
// implements this interface, the ScrollViewer delegates scrolling to
// it: setting HorizontalOffset / VerticalOffset on the ScrollViewer
// forwards to SetHorizontalOffset / SetVerticalOffset on the
// IScrollInfo, which adjusts its own Viewport. The ScrollViewer no
// longer needs to clip-and-translate because the panel only emits
// the visible items.
//
// Without IScrollInfo, the ScrollViewer falls back to clip-and-
// translate over its (full) Content.
//
// Coordinates: Extent / Viewport / Offset are all in DIPs in the
// IScrollInfo provider's local coordinate space. Offsets are bounded
// by the consumer (typically [0, Extent - Viewport]).
export interface IScrollInfo
{
    readonly ExtentWidth: number;
    readonly ExtentHeight: number;
    readonly ViewportWidth: number;
    readonly ViewportHeight: number;
    readonly HorizontalOffset: number;
    readonly VerticalOffset: number;
    SetHorizontalOffset(value: number): void;
    SetVerticalOffset(value: number): void;
}

// Duck-typed predicate for IScrollInfo. TypeScript interfaces have no
// runtime footprint; we check the two writable methods that any real
// implementer must expose.
export function isScrollInfo(v: object): v is IScrollInfo
{
    const scrollInfoV = v as IScrollInfo;
    return typeof scrollInfoV.SetHorizontalOffset === 'function'
        && typeof scrollInfoV.SetVerticalOffset === 'function';
}
