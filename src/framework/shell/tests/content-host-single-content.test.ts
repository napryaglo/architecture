import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { HeadlessTarget, SvgDrawingContext } from '../../../visual-engine/index.js';
import { ContentPresenter } from '../../../basic/templates/content-presenter.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { DataContextBinding, ServiceBinding, ServiceProvider, Model, MetaData } from '../../../runtime/index.js';
import { TextBlock } from '../../../basic/text-block.js';
import { ContentHostService } from '../services/content-host-service.js';

// Regression: the base ContentHostService renders its View()'d Content
// through DataTemplate[ContentHostService] (shell.template.mu), and that
// content must SWAP when View() is called again.
//
// The subtle bug this guards: the shell presents the SERVICE via
// `$service(ContentHostService)` and the base DataTemplate re-presents its
// Content. If that inner binding were a DataContext binding (`$Content`), it
// would break — ContentPresenter re-points its OWN DataContext to whatever it
// presents, clobbering the service DataContext the binding reads from, so the
// content freezes on the first View(). The template uses a SERVICE binding
// (`$service(ContentHostService).Content`) instead, which resolves through the
// provider and stays reactive. This test reproduces the exact
// present-the-service → inner-binding shape and asserts the swap.
class DemoContent extends Model
{
    static readonly LabelKey = Model.RegisterProperty<string>(DemoContent, 'Label', '', MetaData.None);
    public get Label(): string { return this.get_property_value(DemoContent.LabelKey); }
    public set Label(v: string) { this.set_property_value(DemoContent.LabelKey, v); }
}

function svgOf(t: HeadlessTarget): string
{
    const dc = new SvgDrawingContext();
    t.Render(dc);
    return dc.ToSvg(400, 300);
}

describe('ContentHostService — single-content reactivity', () => {
    beforeEach(() => { initTestApp(); });

    test('View() swaps the presented content reactively (service-binding, not $Content)', () => {
        const app = initTestApp();
        // Render any DemoContent as its Label text.
        app.Resources.Set('DemoContentTpl', new DataTemplate(
            (_d) => { const t = new TextBlock(''); t.set_property_value(TextBlock.TextKey, DataContextBinding(t, 'Label')); return t; },
            DemoContent));
        // The base-host template, mirroring shell.template.mu.
        app.Resources.Set('ChsTpl', new DataTemplate(
            (_d) => { const cp = new ContentPresenter(); cp.set_property_value(ContentPresenter.ContentKey, ServiceBinding(cp, ServiceProvider.tokenFor(ContentHostService), 'Content')); return cp; },
            ContentHostService));

        app.Services.registerInstance(ContentHostService.Key, new ContentHostService(app.Services as never));
        const host = app.Services.get(ContentHostService.Key)!;

        // Outer presenter shows the SERVICE (like PART_ContentHost = $service(ContentHostService)).
        const outer = new ContentPresenter();
        const target = new HeadlessTarget(400, 300);
        target.Content = outer;
        target.Flush();
        outer.Content = host;
        target.Flush();

        const a = new DemoContent(); a.Label = 'ALPHA';
        host.View(a); target.Flush();
        assert.ok(svgOf(target).includes('ALPHA'), 'first View() renders its content');

        const b = new DemoContent(); b.Label = 'BETA';
        host.View(b); target.Flush();
        const svg = svgOf(target);
        assert.ok(svg.includes('BETA'), 'second View() swaps to the new content');
        assert.ok(!svg.includes('ALPHA'), 'the previous content is gone');
    });
});
