import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Rect,
    Size,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    BitmapImage,
    ImageSource,
    Stretch,
    SvgDrawingContext,
} from '../../visual-engine/index.js';
import { Image } from '../image.js';

interface CapturedImage
{
    source: ImageSource;
    rect: Rect;
    stretch: Stretch;
}

class CapturingContext implements DrawingContext
{
    public images: CapturedImage[] = [];
    DrawImage(source: ImageSource, rect: Rect, stretch: Stretch): void
    {
        this.images.push({ source, rect, stretch });
    }
    DrawRectangle(): void { /* unused */ }
    DrawRoundedRectangle(): void { /* unused */ }
    DrawGeometry(): void { throw new Error('not used'); }
    DrawText(): void     { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip(): void      { /* no-op */ }
    Pop(): void           { /* no-op */ }
}

describe('BitmapImage', () => {
    test('constructor stores Uri and NaturalSize', () => {
        const src = new BitmapImage('https://example.com/cat.png', new Size(640, 480));
        assert.equal(src.Uri, 'https://example.com/cat.png');
        assert.ok(src.NaturalSize.Equals(new Size(640, 480)));
    });

    test('NaturalSize defaults to Size.Zero', () => {
        const src = new BitmapImage('data:image/png;base64,iVBORw0K…');
        assert.ok(src.NaturalSize.Equals(Size.Zero));
    });

    test('BitmapImage IS-A ImageSource', () => {
        const src = new BitmapImage('x');
        assert.ok(src instanceof ImageSource);
    });
});

describe('Image control defaults', () => {
    test('fresh Image has no Source and Stretch=Uniform', () => {
        const img = new Image();
        assert.equal(img.Source, undefined);
        assert.equal(img.Stretch, Stretch.Uniform);
    });

    test('constructor accepts a Source and assigns it', () => {
        const src = new BitmapImage('x');
        const img = new Image(src);
        assert.equal(img.Source, src);
    });
});

describe('Image layout', () => {
    test('MeasureOverride returns Size.Zero when Source is undefined', () => {
        const img = new Image();
        img.Measure(new Size(500, 500));
        assert.ok(img.DesiredSize.Equals(Size.Zero));
    });

    test('MeasureOverride returns Source.NaturalSize when set', () => {
        const src = new BitmapImage('x', new Size(200, 100));
        const img = new Image(src);
        img.Measure(new Size(500, 500));
        assert.ok(img.DesiredSize.Equals(new Size(200, 100)));
    });

    test('MeasureOverride returns Size.Zero when Source has no NaturalSize set', () => {
        const src = new BitmapImage('x');  // NaturalSize defaults to Zero
        const img = new Image(src);
        img.Measure(new Size(500, 500));
        assert.ok(img.DesiredSize.Equals(Size.Zero));
    });
});

describe('Image render', () => {
    test('no Source → no DrawImage call', () => {
        const img = new Image();
        img.Measure(new Size(100, 100));
        img.Arrange(new Rect(0, 0, 100, 100));
        const dc = new CapturingContext();
        img.Render(dc);
        assert.equal(dc.images.length, 0);
    });

    test('with Source: emits DrawImage with the current Stretch', () => {
        const src = new BitmapImage('https://example.com/cat.png');
        const img = new Image(src);
        img.Stretch = Stretch.UniformToFill;
        img.Measure(new Size(100, 100));
        img.Arrange(new Rect(0, 0, 100, 100));

        const dc = new CapturingContext();
        img.Render(dc);

        assert.equal(dc.images.length, 1);
        const e = dc.images[0]!;
        assert.equal(e.source, src);
        assert.equal(e.stretch, Stretch.UniformToFill);
        assert.ok(e.rect.Equals(new Rect(0, 0, 100, 100)));
    });

    test('zero-size RenderSize skips rendering', () => {
        const src = new BitmapImage('x');
        const img = new Image(src);
        img.Measure(new Size(0, 0));
        img.Arrange(new Rect(0, 0, 0, 0));
        const dc = new CapturingContext();
        img.Render(dc);
        assert.equal(dc.images.length, 0);
    });
});

describe('SvgDrawingContext.DrawImage emits <image>', () => {
    test('emits href + width / height + preserveAspectRatio attributes', () => {
        const src = new BitmapImage('https://example.com/cat.png');
        const img = new Image(src);
        img.Stretch = Stretch.Uniform;
        img.Measure(new Size(100, 100));
        img.Arrange(new Rect(0, 0, 100, 100));

        const dc = new SvgDrawingContext();
        img.Render(dc);
        const out = dc.ToFragment();
        assert.ok(out.includes('<image '));
        assert.ok(out.includes('href="https://example.com/cat.png"'));
        assert.ok(out.includes('width="100"'));
        assert.ok(out.includes('height="100"'));
        assert.ok(out.includes('preserveAspectRatio="xMidYMid meet"'));
    });

    test('Stretch.Fill emits preserveAspectRatio="none"', () => {
        const src = new BitmapImage('x');
        const img = new Image(src);
        img.Stretch = Stretch.Fill;
        img.Measure(new Size(50, 50));
        img.Arrange(new Rect(0, 0, 50, 50));
        const dc = new SvgDrawingContext();
        img.Render(dc);
        assert.ok(dc.ToFragment().includes('preserveAspectRatio="none"'));
    });

    test('Stretch.UniformToFill emits preserveAspectRatio="xMidYMid slice"', () => {
        const src = new BitmapImage('x');
        const img = new Image(src);
        img.Stretch = Stretch.UniformToFill;
        img.Measure(new Size(50, 50));
        img.Arrange(new Rect(0, 0, 50, 50));
        const dc = new SvgDrawingContext();
        img.Render(dc);
        assert.ok(dc.ToFragment().includes('preserveAspectRatio="xMidYMid slice"'));
    });

    test('Stretch.None emits preserveAspectRatio="xMinYMin meet"', () => {
        const src = new BitmapImage('x', new Size(40, 30));
        const img = new Image(src);
        img.Stretch = Stretch.None;
        img.Measure(new Size(200, 200));
        img.Arrange(new Rect(0, 0, 200, 200));
        const dc = new SvgDrawingContext();
        img.Render(dc);
        assert.ok(dc.ToFragment().includes('preserveAspectRatio="xMinYMin meet"'));
    });
});
