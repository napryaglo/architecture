import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, Point, Rect, Size } from '../../runtime/index.js';
import { Pen, PathGeometry, SolidColorBrush } from '../../visual-engine/index.js';
import { Border, HeartPresenter } from '../index.js';

function arrange(v: { Measure: (s: Size) => void; Arrange: (r: Rect) => void },
                 w: number, h: number): void {
    v.Measure(new Size(w, h));
    v.Arrange(new Rect(0, 0, w, h));
}

function drawnGeometries(v: { Render: (dc: never) => void }): Array<{ brush: unknown; pen: unknown; geom: unknown }> {
    const calls: Array<{ brush: unknown; pen: unknown; geom: unknown }> = [];
    v.Render({
        DrawGeometry: (brush: unknown, pen: unknown, geom: unknown) => calls.push({ brush, pen, geom }),
        DrawRectangle: () => {}, DrawText: () => {},
        PushTransform: () => {}, PushClip: () => {}, Pop: () => {},
    } as never);
    return calls;
}

describe('HeartPresenter — heart chrome + outline-confined hit region', () => {
    test('publishes a heart HitTestGeometry: centre inside, bbox corner outside', () => {
        const hp = new HeartPresenter();
        hp.Width = 260; hp.Height = 240;
        arrange(hp, 260, 240);

        const hit = hp.HitTestGeometry as PathGeometry;
        assert.ok(hit instanceof PathGeometry, 'HitTestGeometry is a PathGeometry heart silhouette');
        assert.ok(hit.Contains(new Point(130, 120)),  'centre is inside the heart');
        assert.ok(!hit.Contains(new Point(6, 6)),      'top-left bbox corner falls through');
        assert.ok(!hit.Contains(new Point(254, 6)),    'top-right bbox corner falls through');
    });

    test('a stroke offsets the drawn heart inward by ~half the pen from the hit/clip heart', () => {
        const hp = new HeartPresenter();
        const t = 40;   // fat pen so the inward offset is unambiguous
        hp.Stroke = new Pen(new SolidColorBrush(new Color(255, 0, 255, 255)), t);
        hp.Width = 240; hp.Height = 240;
        arrange(hp, 240, 240);

        const hit   = (hp.HitTestGeometry as PathGeometry).GetBounds();
        const drawn = (drawnGeometries(hp)[0].geom as PathGeometry).GetBounds();
        const hitRight = hit.X + hit.Width,   hitBottom = hit.Y + hit.Height;
        const drawnRight = drawn.X + drawn.Width, drawnBottom = drawn.Y + drawn.Height;

        // The drawn heart (fill + stroke) sits strictly inside the hit/clip
        // heart on every side, so the centred stroke can't spill past the
        // clip and gets fully painted.
        assert.ok(drawn.X > hit.X,         'left edge inset');
        assert.ok(drawn.Y > hit.Y,         'top edge inset');
        assert.ok(drawnRight < hitRight,   'right edge inset');
        assert.ok(drawnBottom < hitBottom, 'bottom edge inset');
        // ...and the inset is about half the pen — not a negligible epsilon.
        const rightInset = hitRight - drawnRight;
        assert.ok(rightInset > t * 0.3 && rightInset < t * 0.8,
            `right inset ~ half the pen (got ${rightInset} for pen ${t})`);
    });

    test('ClipToBounds sets ChildClip to the heart inset by the full pen (inside the stroke)', () => {
        const hp = new HeartPresenter();
        const t = 40;
        hp.Stroke = new Pen(new SolidColorBrush(new Color(255, 0, 255, 255)), t);
        hp.ClipToBounds = true;
        hp.Content = new Border();            // default Stretch → fills the slot
        hp.Width = 240; hp.Height = 240;
        arrange(hp, 240, 240);

        const clip = hp.ChildClip as PathGeometry;
        assert.ok(clip instanceof PathGeometry, 'ChildClip is a heart PathGeometry');

        // The child clip (inset by the full pen) sits strictly INSIDE the drawn
        // heart outline (inset by half the pen) on every side, so content can't
        // overlap the border. ChildClip is in the presenter's own local space.
        const clipB  = clip.GetBounds();
        const drawnB = (drawnGeometries(hp)[0].geom as PathGeometry).GetBounds();
        assert.ok(clipB.X > drawnB.X,                               'left inside the stroke');
        assert.ok(clipB.Y > drawnB.Y,                               'top inside the stroke');
        assert.ok(clipB.X + clipB.Width  < drawnB.X + drawnB.Width, 'right inside the stroke');
        assert.ok(clipB.Y + clipB.Height < drawnB.Y + drawnB.Height,'bottom inside the stroke');
    });

    test('without ClipToBounds (default) ChildClip is undefined', () => {
        const hp = new HeartPresenter();
        hp.Content = new Border();
        hp.Width = 240; hp.Height = 240;
        arrange(hp, 240, 240);

        assert.equal(hp.ChildClip, undefined, 'no ChildClip when ClipToBounds is false');
    });

    test('renders one heart geometry painted with its Fill and Stroke', () => {
        const hp = new HeartPresenter();
        const fill = new SolidColorBrush(new Color(255, 140, 0, 255));   // orange
        const stroke = new Pen(new SolidColorBrush(new Color(255, 0, 255, 255)), 2); // magenta 2px
        hp.Fill = fill;
        hp.Stroke = stroke;
        hp.Width = 260; hp.Height = 240;
        arrange(hp, 260, 240);

        const calls = drawnGeometries(hp);
        assert.equal(calls.length, 1, 'draws exactly one geometry (the heart)');
        assert.equal(calls[0].brush, fill, 'painted with the Fill brush');
        assert.equal(calls[0].pen, stroke, 'stroked with the Stroke pen');
        assert.ok(calls[0].geom instanceof PathGeometry, 'the drawn geometry is the heart path');
    });
});
