import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import {
    Rect, Size, PointerEventArgs, PointerButton, NoModifiers, RelayCommand,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget, SvgDrawingContext } from '../../visual-engine/index.js';
import { TextBlock } from '../text-block.js';
import { Border } from '../border.js';
import { Run } from '../documents/inlines.js';
import { Hyperlink } from '../documents/hyperlink.js';
import { InlineUIContainer } from '../documents/inlines.js';

function ptr(x: number, y: number): PointerEventInit
{
    return {
        HostX: x, HostY: y, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse',
    };
}
function down(tb: TextBlock, x: number, y: number): void
{
    (tb as unknown as { OnPointerDown(a: PointerEventArgs): void })
        .OnPointerDown(new PointerEventArgs('PointerDown', tb, ptr(x, y)));
}
function up(tb: TextBlock, x: number, y: number): void
{
    (tb as unknown as { OnPointerUp(a: PointerEventArgs): void })
        .OnPointerUp(new PointerEventArgs('PointerUp', tb, ptr(x, y)));
}

describe('Hyperlink — interactivity + chrome', () => {
    beforeEach(() => { initTestApp(); });

    test('click over the link fires Click and executes Command', () => {
        let clicked = 0, executed = 0;
        const tb = new TextBlock();
        const link = new Hyperlink();
        link.Inlines.Add(new Run('click me'));
        link.Command = new RelayCommand(() => { executed++; });
        link.Click = () => { clicked++; };
        tb.Inlines.Add(link);

        const target = new HeadlessTarget(300, 60);
        target.Content = tb as never;
        target.Flush();

        // The link is the only content → starts at x≈0.
        down(tb, 6, 8);
        up(tb, 6, 8);
        assert.equal(clicked, 1, 'Click fired');
        assert.equal(executed, 1, 'Command executed');
    });

    test('press on link but release off it does not activate', () => {
        let clicked = 0;
        const tb = new TextBlock();
        const link = new Hyperlink();
        link.Inlines.Add(new Run('link'));
        link.Click = () => { clicked++; };
        tb.Inlines.Add(link);
        const target = new HeadlessTarget(300, 60);
        target.Content = tb as never;
        target.Flush();

        down(tb, 6, 8);
        up(tb, 250, 8);   // released far to the right, off the link
        assert.equal(clicked, 0);
    });

    test('link renders underlined', () => {
        const tb = new TextBlock();
        const link = new Hyperlink();
        link.Inlines.Add(new Run('linked'));
        tb.Inlines.Add(link);
        tb.Measure(new Size(300, 60));
        tb.Arrange(new Rect(0, 0, tb.DesiredSize.Width, tb.DesiredSize.Height));
        const dc = new SvgDrawingContext();
        tb.Render(dc);
        assert.match(dc.ToSvg(300, 60), /text-decoration="underline"[^>]*>linked</);
    });
});

describe('InlineUIContainer — embedded visual', () => {
    beforeEach(() => { initTestApp(); });

    test('embedded Border becomes a visual child, measured + arranged inline', () => {
        const tb = new TextBlock();
        tb.Inlines.Add(new Run('before '));
        const box = new Border();
        box.Width = 24; box.Height = 16;
        tb.Inlines.Add(new InlineUIContainer(box));
        tb.Inlines.Add(new Run(' after'));

        const target = new HeadlessTarget(400, 80);
        target.Content = tb as never;
        target.Flush();

        // The Border is now a visual child of the TextBlock.
        assert.ok(tb.visualChildren.includes(box), 'embedded visual is a child');
        // It was measured to its 24×16 box.
        assert.equal(box.DesiredSize.Width, 24);
        // It was arranged inline, offset to the right of "before ".
        assert.ok(box.ArrangedRect.X > 0, `box.X ${box.ArrangedRect.X} should be after leading text`);
        assert.equal(box.ArrangedRect.Width, 24);
    });

    test('removing the container detaches the embedded visual', () => {
        const tb = new TextBlock();
        const box = new Border(); box.Width = 10; box.Height = 10;
        const uic = new InlineUIContainer(box);
        tb.Inlines.Add(uic);
        const target = new HeadlessTarget(200, 40);
        target.Content = tb as never;
        target.Flush();
        assert.ok(tb.visualChildren.includes(box));

        tb.Inlines.Remove(uic);
        target.Flush();
        assert.ok(!tb.visualChildren.includes(box), 'detached after removal');
    });
});
