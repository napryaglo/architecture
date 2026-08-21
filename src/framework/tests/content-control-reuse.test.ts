import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import { MuralBase, type Visual } from '../../runtime/index.js';
import { Border, ContentPresenter, ControlTemplate, DataTemplate, TextBlock } from '../../basic/index.js';
import { ContentControl } from '@pragmatic-lab/mural/framework';

// ContentControl reuses the view it built for a content object instead of
// rebuilding it every time that object is presented — DEFAULT-ON (the opposite
// of ContentPresenter, which is the recycled ItemsControl item container and so
// defaults OFF). The driver: heavy content hosted on a ContentControl — the
// shell's capability side pane (a HeaderedContentControl bound to the nav
// service's stable ActiveService) — rebuilt itself on every navigation-rail
// switch, throwing away the Project Explorer's expansion / scroll / in-view
// edits and paying the full rebuild cost. Reuse hands back the SAME view, so
// switching away and back preserves state and skips the rebuild. The WeakMap is
// keyed by the content object, so it survives a clear (the object is still
// referenced by the nav service) and re-presenting it returns the same view.
class Doc extends MuralBase
{
    public mounted = 0;
    public OnViewMounted(_v: Visual): void { this.mounted++; }
}

// Border { ContentPresenter } template — the presenter is the slot the
// ContentControl fills, so the reused/rebuilt view is observable as its child.
function borderTemplate(): ControlTemplate
{
    return new ControlTemplate(() => {
        const border = new Border();
        border.SetChild(new ContentPresenter());
        return border;
    });
}

function slotted(cc: ContentControl): Visual | undefined
{
    const border    = cc.visualChildren[0] as Border | undefined;
    const presenter = border?.visualChildren[0] as ContentPresenter | undefined;
    return presenter?.visualChildren[0];
}

describe('ContentControl — view reuse (default-on)', () => {
    beforeEach(() => { initTestApp(); });

    function make(): { cc: ContentControl; present: (c: unknown) => Visual | undefined }
    {
        const cc = new ContentControl();
        cc.Resources.Set(Doc, new DataTemplate(() => new TextBlock('x'), Doc));
        cc.Template = borderTemplate();
        return { cc, present: (c: unknown) => { cc.Content = c as never; return slotted(cc); } };
    }

    test('ReuseContentViews defaults to true on ContentControl', () => {
        assert.equal(new ContentControl().ReuseContentViews, true);
    });

    test('re-presenting the same content reuses its view and mounts once', () => {
        const { present } = make();
        const a = new Doc();
        const b = new Doc();
        const v1 = present(a);
        present(b);
        const v2 = present(a);
        assert.equal(v2, v1, 'same view instance reused');
        assert.equal(a.mounted, 1, 'OnViewMounted fired once (build, not re-present)');
    });

    test('the view survives a clear: present -> clear -> present same returns the same view', () => {
        const { cc, present } = make();
        const a = new Doc();
        const v1 = present(a);
        assert.ok(v1 !== undefined);
        present(undefined);                 // Content cleared — slot emptied
        assert.equal(slotted(cc), undefined, 'cleared slot renders nothing');
        const v2 = present(a);
        assert.equal(v2, v1, 'same view instance after a clear — state preserved');
        assert.equal(a.mounted, 1, 'no rebuild across the clear');
    });

    test('distinct content objects still get distinct views', () => {
        const { present } = make();
        const va = present(new Doc());
        const vb = present(new Doc());
        assert.notEqual(va, vb);
    });

    test('ReuseContentViews = false rebuilds per presentation (escape hatch)', () => {
        const { cc, present } = make();
        cc.ReuseContentViews = false;
        const a = new Doc();
        const b = new Doc();
        const v1 = present(a);
        present(b);
        const v2 = present(a);
        assert.notEqual(v2, v1, 'rebuilt, not reused');
        assert.equal(a.mounted, 2, 'OnViewMounted fired per presentation');
    });
});
