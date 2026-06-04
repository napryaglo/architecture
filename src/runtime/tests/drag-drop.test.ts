import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DataObject, DragDropEffects } from '../index.js';

describe('DragDropEffects — flag enum', () => {
    test('has the standard None/Copy/Move/Link/All flags', () => {
        assert.equal(DragDropEffects.None, 0);
        assert.equal(DragDropEffects.Copy, 1);
        assert.equal(DragDropEffects.Move, 2);
        assert.equal(DragDropEffects.Link, 4);
        assert.equal(DragDropEffects.All,
            DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link);
    });
});

describe('DataObject — formats map', () => {
    test('Set / Get round-trips the value verbatim', () => {
        const d = new DataObject().Set('mural/node-kind', { kind: 'rect' });
        assert.deepEqual(d.Get<{ kind: string }>('mural/node-kind'), { kind: 'rect' });
    });

    test('Has reports presence', () => {
        const d = new DataObject().Set('text/plain', 'hello');
        assert.equal(d.Has('text/plain'),       true);
        assert.equal(d.Has('text/uri-list'),    false);
    });

    test('Get returns undefined for absent formats', () => {
        const d = new DataObject();
        assert.equal(d.Get('text/plain'), undefined);
    });

    test('Formats lists every key in insertion order', () => {
        const d = new DataObject()
            .Set('text/plain',     'hi')
            .Set('mural/node-kind', 'rect');
        assert.deepEqual([...d.Formats()], ['text/plain', 'mural/node-kind']);
    });

    test('Set returns `this` for chaining', () => {
        const d = new DataObject();
        const ret = d.Set('text/plain', 'hi');
        assert.equal(ret, d);
    });

    test('Set overwrites a previously-set format', () => {
        const d = new DataObject()
            .Set('text/plain', 'first')
            .Set('text/plain', 'second');
        assert.equal(d.Get('text/plain'), 'second');
        assert.deepEqual([...d.Formats()], ['text/plain']);
    });
});
