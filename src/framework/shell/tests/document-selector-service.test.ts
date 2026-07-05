import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ObservableCollection } from '../../../runtime/index.js';
import { ContentHostService } from '../services/content-host-service.js';
import { DocumentSelectorService } from '../services/document-selector-service.js';

// A subclass that records OnSelectedItemChanged calls (and suppresses the
// default View behaviour) — used to assert the callback fires.
class SpySelector extends DocumentSelectorService
{
    public readonly seen: Array<object | undefined> = [];
    protected override OnSelectedItemChanged(item: object | undefined): void
    {
        this.seen.push(item);
    }
}

describe('DocumentSelectorService — properties + callback', () => {
    const selector = () => new SpySelector(new Application().Services);

    test('Items is a stable, empty ObservableCollection on construction', () => {
        const s = selector();
        assert.ok(s.Items instanceof ObservableCollection);
        assert.equal(s.Items.Count, 0);
        assert.equal(s.Items, s.Items, 'same reference across reads');
    });

    test('selecting fires OnSelectedItemChanged; clearing fires it with undefined', () => {
        const s = selector();
        const a = { id: 'a' };
        s.Items.Add(a);
        s.SelectedItem = a;
        s.SelectedItem = undefined;
        assert.deepEqual(s.seen, [a, undefined]);
    });

    test('resolves under the class-as-token (no static Key)', () => {
        const app = new Application();
        app.Services.registerScoped(DocumentSelectorService, (p) => new SpySelector(p));
        assert.ok(app.Services.getRequired(DocumentSelectorService) instanceof SpySelector);
    });
});

describe('DocumentSelectorService — default View behaviour', () => {
    // Register a content host + the base selector in one scope; resolve the
    // selector so its Provider IS that scope.
    function compose(): { selector: DocumentSelectorService; host: ContentHostService }
    {
        const app = new Application();
        app.Services
            .registerScoped(ContentHostService.Key, (p) => new ContentHostService(p))
            .registerScoped(DocumentSelectorService, (p) => new DocumentSelectorService(p));
        return {
            selector: app.Services.getRequired(DocumentSelectorService),
            host: app.Services.getRequired(ContentHostService.Key),
        };
    }

    test('selecting an item presents it in the content host via View()', () => {
        const { selector, host } = compose();
        const doc = { id: 'a' };
        selector.Items.Add(doc);
        selector.SelectedItem = doc;
        assert.equal(host.Content, doc);
    });

    test('clearing the selection clears the host', () => {
        const { selector, host } = compose();
        selector.SelectedItem = { id: 'a' };
        selector.SelectedItem = undefined;
        assert.equal(host.Content, undefined);
    });

    test('changing selection swaps what the host presents', () => {
        const { selector, host } = compose();
        const b = { id: 'b' };
        selector.SelectedItem = { id: 'a' };
        selector.SelectedItem = b;
        assert.equal(host.Content, b);
    });

    test('no content host registered → selecting is a silent no-op', () => {
        const selector = new DocumentSelectorService(new Application().Services);
        assert.doesNotThrow(() => { selector.SelectedItem = { id: 'a' }; });
    });
});
