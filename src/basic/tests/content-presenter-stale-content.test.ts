import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import { Visual } from '../../runtime/index.js';
import { ContentPresenter } from '../templates/content-presenter.js';
import { Border } from '../border.js';

function visualParentOf(v: Visual): Visual | undefined
{
    return (v as unknown as { visualParent: Visual | undefined }).visualParent;
}

describe('ContentPresenter — re-slotting after content was moved away', () => {
    beforeEach(() => { initTestApp(); });

    // A Visual is single-parent. When a slotted content Visual is moved to another
    // host (which releases it from this presenter), the presenter's `_content`
    // reference goes stale. Re-slotting must not throw "Cannot detach a Visual that
    // is not a visual child of this" — it should drop the stale reference and slot
    // the new content.
    test('re-slotting does not throw when the old content was moved to another presenter', () => {
        const cp1 = new ContentPresenter();
        const cp2 = new ContentPresenter();
        const v = new Border();

        cp1.Content = v;
        assert.equal(visualParentOf(v), cp1, 'v is cp1 content');

        // cp2 steals v (SetContent releases v from cp1). cp1._content is now stale.
        cp2.Content = v;
        assert.equal(visualParentOf(v), cp2, 'v moved to cp2');

        const v2 = new Border();
        assert.doesNotThrow(() => { cp1.Content = v2; });
        assert.equal(visualParentOf(v2), cp1, 'cp1 now holds v2');
        assert.equal(visualParentOf(v), cp2, 'cp2 still holds v');
    });
});
