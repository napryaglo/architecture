import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceDictionary } from '../index.js';

// The Resolve memo must be transparent: same value on repeated calls, and every
// mutation that could change a resolution (local Set/Delete/Clear, merged
// add/remove, or a change inside a merged dict) invalidates it.
describe('ResourceDictionary — Resolve cache invalidation', () =>
{
    test('repeated Resolve returns the cached value; a local Set updates it', () =>
    {
        const d = new ResourceDictionary();
        d.Set('Accent', 'red');
        assert.equal(d.Resolve('Accent'), 'red');
        assert.equal(d.Resolve('Accent'), 'red'); // cached path
        d.Set('Accent', 'blue');
        assert.equal(d.Resolve('Accent'), 'blue'); // cache cleared by signal
    });

    test('Delete and Clear invalidate the cache', () =>
    {
        const d = new ResourceDictionary();
        d.Set('X', 1);
        assert.equal(d.Resolve('X'), 1);
        d.Delete('X');
        assert.equal(d.Resolve('X'), undefined);
        d.Set('X', 2);
        assert.equal(d.Resolve('X'), 2);
        d.Clear();
        assert.equal(d.Resolve('X'), undefined);
    });

    test('a change inside a merged dictionary is reflected after caching', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.Set('Token', 'v1');
        parent.AddMergedDictionary(child);
        assert.equal(parent.Resolve('Token'), 'v1'); // caches through merged
        child.Set('Token', 'v2');                     // forwarded → parent.signal → clear
        assert.equal(parent.Resolve('Token'), 'v2');
    });

    test('removing a merged dictionary invalidates a cached hit', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.Set('Only', 42);
        parent.AddMergedDictionary(child);
        assert.equal(parent.Resolve('Only'), 42);
        parent.RemoveMergedDictionary(child);
        assert.equal(parent.Resolve('Only'), undefined);
    });

    test('a later local Set shadows a previously-cached merged value', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.Set('K', 'fromChild');
        parent.AddMergedDictionary(child);
        assert.equal(parent.Resolve('K'), 'fromChild');
        parent.Set('K', 'fromParent'); // local shadows merged
        assert.equal(parent.Resolve('K'), 'fromParent');
    });

    test('a locally-defined undefined value still shadows merged (not cached)', () =>
    {
        const parent = new ResourceDictionary();
        const child = new ResourceDictionary();
        child.Set('S', 'childValue');
        parent.AddMergedDictionary(child);
        parent.Set('S', undefined);            // local shadow with undefined
        assert.equal(parent.Resolve('S'), undefined);
        assert.equal(parent.Resolve('S'), undefined); // still shadows on repeat
    });
});
