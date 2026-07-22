import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, type IServiceProvider } from '../../../runtime/index.js';
import { ContentHostService } from '../services/content-host-service.js';
import {
    DocumentsContentHostService,
    type IDocument,
} from '../services/documents-content-host-service.js';

// A test document that records Save() calls and can be marked dirty.
class FakeDoc implements IDocument
{
    public IsDirty = false;
    public saveCount = 0;
    constructor(public readonly Id: string, public readonly Title: string = id2title(Id)) {}
    public Save(): void { this.saveCount++; this.IsDirty = false; }
}
function id2title(id: string): string { return id.toUpperCase(); }

function provider(): IServiceProvider { return new Application().Services; }

describe('ContentHostService', () => {
    test('View(obj) sets Content; View(undefined) clears', () => {
        const host = new ContentHostService(provider());
        assert.equal(host.Content, undefined);

        const obj = { hello: 'world' };
        host.View(obj);
        assert.equal(host.Content, obj);

        host.View(undefined);
        assert.equal(host.Content, undefined);
    });
});

describe('DocumentsContentHostService', () => {
    test('Open() adds, activates, and presents the document', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');

        host.Open(a);
        assert.equal(host.OpenDocuments.Count, 1);
        assert.equal(host.ActiveDocument, a);
        // ActiveDocument routes through the base View() → Content tracks it.
        assert.equal(host.Content, a);
    });

    test('Open() dedupes by Id — re-opening re-activates the existing instance', () => {
        const host = new DocumentsContentHostService(provider());
        const a1 = new FakeDoc('a');
        const b  = new FakeDoc('b');
        const a2 = new FakeDoc('a');   // same Id, different instance

        host.Open(a1);
        host.Open(b);
        host.Open(a2);

        assert.equal(host.OpenDocuments.Count, 2, 'no duplicate for Id "a"');
        assert.equal(host.ActiveDocument, a1, 're-activates the ORIGINAL instance');
        assert.equal(host.Content, a1);
    });

    test('Close() of the active document activates the shifted-in neighbour', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        const b = new FakeDoc('b');
        const c = new FakeDoc('c');
        host.Open(a); host.Open(b); host.Open(c);   // active = c

        host.ActiveDocument = b;                    // active middle
        host.Close(b);
        // b was at index 1; c shifts into slot 1 → c becomes active.
        assert.equal(host.OpenDocuments.Count, 2);
        assert.equal(host.ActiveDocument, c);
        assert.equal(host.Content, c);
    });

    test('Close() of a non-active document leaves the active one untouched', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        const b = new FakeDoc('b');
        host.Open(a); host.Open(b);                 // active = b

        host.Close(a);
        assert.equal(host.OpenDocuments.Count, 1);
        assert.equal(host.ActiveDocument, b, 'active unchanged');
    });

    test('Close() of the last document clears the region', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        host.Open(a);

        host.Close(a);
        assert.equal(host.OpenDocuments.Count, 0);
        assert.equal(host.ActiveDocument, undefined);
        assert.equal(host.Content, undefined);
    });

    test('Close() of an unopened document is a no-op', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        host.Open(a);
        host.Close(new FakeDoc('z'));               // never opened
        assert.equal(host.OpenDocuments.Count, 1);
        assert.equal(host.ActiveDocument, a);
    });

    test('Save() defaults to the active document; Save(doc) targets a specific one', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        const b = new FakeDoc('b');
        host.Open(a); host.Open(b);                 // active = b

        host.Save();                                // → b
        assert.equal(b.saveCount, 1);
        assert.equal(a.saveCount, 0);

        host.Save(a);                               // explicit target
        assert.equal(a.saveCount, 1);
    });

    test('Save() with nothing active and no argument is a no-op', () => {
        const host = new DocumentsContentHostService(provider());
        assert.doesNotThrow(() => host.Save());
    });

    test('CloseAll() empties the open-set and clears the region', () => {
        const host = new DocumentsContentHostService(provider());
        host.Open(new FakeDoc('a')); host.Open(new FakeDoc('b')); host.Open(new FakeDoc('c'));

        host.CloseAll();
        assert.equal(host.OpenDocuments.Count, 0);
        assert.equal(host.ActiveDocument, undefined);
        assert.equal(host.Content, undefined);
    });

    test('CloseAll() on an empty host is a no-op', () => {
        const host = new DocumentsContentHostService(provider());
        assert.doesNotThrow(() => host.CloseAll());
        assert.equal(host.OpenDocuments.Count, 0);
    });

    test('CloseAllCommand runs CloseAll()', () => {
        const host = new DocumentsContentHostService(provider());
        host.Open(new FakeDoc('a')); host.Open(new FakeDoc('b'));

        host.CloseAllCommand.Execute(undefined);
        assert.equal(host.OpenDocuments.Count, 0);
        assert.equal(host.ActiveDocument, undefined);
    });

    test('ActivateById / ActivateDocumentCommand makes a document active', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a'); const b = new FakeDoc('b');
        host.Open(a); host.Open(b);                  // active = b

        host.ActivateById('a');
        assert.equal(host.ActiveDocument, a);
        assert.equal(host.Content, a);

        host.ActivateDocumentCommand.Execute('b');
        assert.equal(host.ActiveDocument, b);
    });

    test('ActivateById on an unknown id is a no-op', () => {
        const host = new DocumentsContentHostService(provider());
        const a = new FakeDoc('a');
        host.Open(a);
        host.ActivateById('nope');
        assert.equal(host.ActiveDocument, a, 'active unchanged');
    });

    test('is substitutable for the base — resolves under ContentHostService.Key', () => {
        const app = new Application();
        app.Services.registerScoped(ContentHostService.Key, (p) => new DocumentsContentHostService(p));
        const resolved = app.Services.getRequired(ContentHostService.Key);
        assert.ok(resolved instanceof DocumentsContentHostService);
        // The region binds $service(ContentHostService).Content; document
        // commands resolve the same key and cast to call Open/Close/Save.
        (resolved as DocumentsContentHostService).Open(new FakeDoc('a'));
        assert.equal(resolved.Content instanceof FakeDoc, true);
    });
});
