import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Application,
    Density,
    GetDensity,
    GetPointer,
    GetPrefersColorScheme,
    GetPrefersContrast,
    GetPrefersReducedMotion,
    GetViewportClass,
    M3_BREAKPOINTS,
    MediaWatcher,
    Panel,
    Pointer,
    PreferredScheme,
    PrefersContrast,
    Rect,
    SetDensity,
    SetPointer,
    SetPrefersColorScheme,
    SetPrefersContrast,
    SetPrefersReducedMotion,
    SetViewportClass,
    Size,
    Visual,
    ViewportClass,
    classifyViewport,
    type DrawingContext,
} from '../index.js';

// A bare-bones Panel subclass — Panel exposes public AddChild that wires
// logical+visual parents in one step, which is what the inheritance
// cascade needs to walk.
class TestRoot extends Panel
{
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override ArrangeOverride(finalSize: Size): Size { return finalSize; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

describe('Adaptive DPs — defaults', () => {
    test('A fresh Visual gets the documented defaults', () => {
        const v = new TestRoot();
        assert.equal(GetDensity(v),              Density.Regular);
        assert.equal(GetViewportClass(v),        ViewportClass.Desktop);
        assert.equal(GetPointer(v),              Pointer.Fine);
        assert.equal(GetPrefersContrast(v),      PrefersContrast.Normal);
        assert.equal(GetPrefersReducedMotion(v), false);
        assert.equal(GetPrefersColorScheme(v),   PreferredScheme.NoPreference);
    });
});

describe('Adaptive DPs — inheritance cascade', () => {
    test('Density set on parent cascades to a child', () => {
        const parent = new TestRoot();
        const child  = new TestRoot();
        parent.AddChild(child);

        SetDensity(parent, Density.Compact);
        assert.equal(GetDensity(child), Density.Compact);
    });

    test('Local write on a subtree overrides the cascade', () => {
        const root = new TestRoot();
        const mid  = new TestRoot();
        const leaf = new TestRoot();
        root.AddChild(mid);
        mid.AddChild(leaf);

        SetDensity(root, Density.Comfortable);
        SetDensity(mid,  Density.Compact);

        assert.equal(GetDensity(root), Density.Comfortable);
        assert.equal(GetDensity(mid),  Density.Compact);
        // Leaf inherits from mid, NOT root, because mid has a local
        // value that shadows the inheritance walk.
        assert.equal(GetDensity(leaf), Density.Compact);
    });

    test('ViewportClass, Pointer, PrefersContrast all cascade the same way', () => {
        const parent = new TestRoot();
        const child  = new TestRoot();
        parent.AddChild(child);

        SetViewportClass(parent, ViewportClass.Mobile);
        SetPointer(parent,       Pointer.Coarse);
        SetPrefersContrast(parent, PrefersContrast.More);

        assert.equal(GetViewportClass(child),    ViewportClass.Mobile);
        assert.equal(GetPointer(child),          Pointer.Coarse);
        assert.equal(GetPrefersContrast(child),  PrefersContrast.More);
    });
});

describe('classifyViewport', () => {
    test('M3 baseline thresholds', () => {
        assert.equal(classifyViewport(0),    ViewportClass.Mobile);
        assert.equal(classifyViewport(320),  ViewportClass.Mobile);
        assert.equal(classifyViewport(599),  ViewportClass.Mobile);
        assert.equal(classifyViewport(600),  ViewportClass.Tablet);
        assert.equal(classifyViewport(700),  ViewportClass.Tablet);
        assert.equal(classifyViewport(839),  ViewportClass.Tablet);
        assert.equal(classifyViewport(840),  ViewportClass.Desktop);
        assert.equal(classifyViewport(1400), ViewportClass.Desktop);
    });

    test('Custom breakpoints override M3 defaults', () => {
        const bps = { mobileMax: 480, tabletMax: 1024 };
        assert.equal(classifyViewport(479,  bps), ViewportClass.Mobile);
        assert.equal(classifyViewport(480,  bps), ViewportClass.Tablet);
        assert.equal(classifyViewport(1023, bps), ViewportClass.Tablet);
        assert.equal(classifyViewport(1024, bps), ViewportClass.Desktop);
    });

    test('M3_BREAKPOINTS exposes the canonical thresholds', () => {
        assert.equal(M3_BREAKPOINTS.mobileMax, 600);
        assert.equal(M3_BREAKPOINTS.tabletMax, 840);
    });
});

describe('MediaWatcher — no-op outside browser', () => {
    test('Start without matchMedia/ResizeObserver does not throw', () => {
        const watcher = new MediaWatcher();
        const root    = new TestRoot();
        watcher.Start(root);
        watcher.Stop();
        // Defaults preserved when no DOM is available.
        assert.equal(GetPointer(root),              Pointer.Fine);
        assert.equal(GetPrefersColorScheme(root),   PreferredScheme.NoPreference);
        assert.equal(GetPrefersContrast(root),      PrefersContrast.Normal);
        assert.equal(GetPrefersReducedMotion(root), false);
    });

    test('Idempotent Start — repeated calls with same root are no-ops', () => {
        const watcher = new MediaWatcher();
        const root    = new TestRoot();
        watcher.Start(root);
        watcher.Start(root);
        watcher.Start(root);
        watcher.Stop();
    });
});

describe('Setters round-trip', () => {
    test('All six setters write and the corresponding getters read back', () => {
        const v = new TestRoot();

        SetDensity(v,              Density.Compact);
        SetViewportClass(v,        ViewportClass.Tablet);
        SetPointer(v,              Pointer.Coarse);
        SetPrefersContrast(v,      PrefersContrast.More);
        SetPrefersReducedMotion(v, true);
        SetPrefersColorScheme(v,   PreferredScheme.Dark);

        assert.equal(GetDensity(v),              Density.Compact);
        assert.equal(GetViewportClass(v),        ViewportClass.Tablet);
        assert.equal(GetPointer(v),              Pointer.Coarse);
        assert.equal(GetPrefersContrast(v),      PrefersContrast.More);
        assert.equal(GetPrefersReducedMotion(v), true);
        assert.equal(GetPrefersColorScheme(v),   PreferredScheme.Dark);
    });
});

// Suppress unused-import warnings.
void Application;
void Rect;
