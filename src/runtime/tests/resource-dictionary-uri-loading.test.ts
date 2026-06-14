import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    DictionaryLoader,
    GetResourceDictionaryLoader,
    ResourceDictionary,
    SetResourceDictionaryLoader,
} from '../resource-dictionary.js';

// § 12.2 — URI loading. Consumer supplies a loader (per-call or as a
// module-level default); the framework awaits it and merges the result.

describe('§ 12.2 — ResourceDictionary URI loading', () => {

    beforeEach(() => { SetResourceDictionaryLoader(undefined); });

    test('per-call loader is awaited and the result merged in', async () => {
        const outer = new ResourceDictionary();
        const tokenDict = new ResourceDictionary();
        tokenDict.Set('AccentBrush', 'fake-accent');

        const loader: DictionaryLoader = async uri => {
            assert.equal(uri, 'theme://accent.js');
            return tokenDict;
        };

        await outer.AddMergedDictionaryFromUri('theme://accent.js', loader);

        // Merged in via the standard path — Resolve sees the merged
        // dict's keys.
        assert.equal(outer.Resolve('AccentBrush'), 'fake-accent');
        assert.equal(outer.MergedDictionaries.length, 1);
        assert.equal(outer.MergedDictionaries[0], tokenDict);
    });

    test('module-level default loader is used when no per-call loader passed', async () => {
        const themeDict = new ResourceDictionary();
        themeDict.Set('Surface', 'fake-surface');

        SetResourceDictionaryLoader(async _uri => themeDict);
        assert.equal(GetResourceDictionaryLoader() !== undefined, true);

        const outer = new ResourceDictionary();
        await outer.AddMergedDictionaryFromUri('theme://surface');

        assert.equal(outer.Resolve('Surface'), 'fake-surface');
    });

    test('per-call loader overrides the module-level default', async () => {
        const defaultDict = new ResourceDictionary();
        defaultDict.Set('Key', 'from-default');
        const overrideDict = new ResourceDictionary();
        overrideDict.Set('Key', 'from-override');

        SetResourceDictionaryLoader(async _uri => defaultDict);

        const outer = new ResourceDictionary();
        await outer.AddMergedDictionaryFromUri(
            'any://uri',
            async _uri => overrideDict,
        );

        assert.equal(outer.Resolve('Key'), 'from-override');
    });

    test('no loader anywhere → throws with a clear message', async () => {
        const outer = new ResourceDictionary();
        await assert.rejects(
            outer.AddMergedDictionaryFromUri('any://uri'),
            /no loader/,
        );
    });

    test('sealed dictionary fails fast BEFORE awaiting the loader', async () => {
        const outer = new ResourceDictionary();
        outer.Seal();

        let loaderCalled = false;
        const loader: DictionaryLoader = async _uri => {
            loaderCalled = true;
            return new ResourceDictionary();
        };

        await assert.rejects(
            outer.AddMergedDictionaryFromUri('any://uri', loader),
            /sealed/,
        );
        assert.equal(loaderCalled, false,
            'loader is not invoked when the dict is sealed');
    });

    test('returned dict reference is the same one passed to AddMergedDictionary', async () => {
        const outer = new ResourceDictionary();
        const inner = new ResourceDictionary();
        inner.Set('K', 'v');

        const result = await outer.AddMergedDictionaryFromUri(
            'any://uri',
            async _uri => inner,
        );

        assert.equal(result, inner,
            'AddMergedDictionaryFromUri returns the loaded dict for caller inspection');
    });

    test('listener fires after the merge lands (not before the await resolves)', async () => {
        const outer = new ResourceDictionary();
        let fires = 0;
        outer.Subscribe(() => { fires++; });

        // Loader returns a dict asynchronously. Listener should NOT
        // fire until the merge actually happens.
        let resolveLoader: ((d: ResourceDictionary) => void) | undefined;
        const loaderPromise = new Promise<ResourceDictionary>(r => { resolveLoader = r; });
        const loader: DictionaryLoader = _uri => loaderPromise;

        const mergePromise = outer.AddMergedDictionaryFromUri('any://uri', loader);

        // Loader pending → no merge yet → no fire.
        assert.equal(fires, 0);

        const dict = new ResourceDictionary();
        dict.Set('K', 'v');
        resolveLoader!(dict);
        await mergePromise;

        assert.equal(fires, 1,
            'AddMergedDictionary call from inside the await re-fires the outer\'s listeners once');
    });
});
