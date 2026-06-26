// Runtime behavior behind `$path << converter`: the binding factories
// carry a ValueConverter that runs source→target on read and convertBack
// on TwoWay writeback, and composeConverters folds a chain.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Model, MetaData, ElementNameBinding, composeConverters } from '../index.js';
import type { ValueConverter } from '../index.js';
import type { Visual } from '../../visual-engine/visual.js';

class Src extends Model
{
    public static readonly YKey = Model.RegisterProperty<unknown>(Src, 'Y', undefined, MetaData.None);
    public get Y(): unknown { return this.get_property_value(Src.YKey); }
    public set Y(v: unknown) { this.set_property_value(Src.YKey, v); }
}

class Tgt extends Model
{
    public static readonly XKey = Model.RegisterProperty<unknown>(
        Tgt, 'X', undefined, MetaData.None | MetaData.BindsTwoWayByDefault);
    public get X(): unknown { return this.get_property_value(Tgt.XKey); }
    public set X(v: unknown) { this.set_property_value(Tgt.XKey, v); }
}

// Brackets a string going forward, strips on the way back.
const bracket: ValueConverter = {
    convert:     (v) => `[${v}]`,
    convertBack: (v) => String(v).slice(1, -1),
};

const srcAsVisual = (s: Src): Visual => s as unknown as Visual;

describe('binding converter — runtime convert / convertBack', () => {

    test('convert runs source → target', () => {
        const src = new Src();
        const tgt = new Tgt();
        src.Y = 'a';
        tgt.set_property_value(Tgt.XKey, ElementNameBinding(srcAsVisual(src), 'Y', bracket));
        assert.equal(tgt.X, '[a]', 'target gets convert(source)');

        // Source change re-pushes through the converter.
        src.Y = 'b';
        assert.equal(tgt.X, '[b]');
    });

    test('convertBack runs target → source on TwoWay writeback', () => {
        const src = new Src();
        const tgt = new Tgt();
        tgt.set_property_value(Tgt.XKey, ElementNameBinding(srcAsVisual(src), 'Y', bracket));

        tgt.X = '[z]';   // a write to the bound target DP
        assert.equal(src.Y, 'z', 'source got convertBack(target)');
    });
});

describe('composeConverters', () => {

    const inc:  ValueConverter = { convert: (v) => (v as number) + 1, convertBack: (v) => (v as number) - 1 };
    const dbl:  ValueConverter = { convert: (v) => (v as number) * 2, convertBack: (v) => (v as number) / 2 };

    test('convert applies left-to-right', () => {
        const c = composeConverters([inc, dbl]);
        assert.equal(c.convert(3), 8);   // (3+1)*2
    });

    test('convertBack applies in reverse', () => {
        const c = composeConverters([inc, dbl]);
        assert.equal(c.convertBack!(8), 3);   // (8/2)-1
    });

    test('a link without convertBack passes through on the way back', () => {
        const oneWay: ValueConverter = { convert: (v) => `${v}!` };   // no convertBack
        const c = composeConverters([inc, oneWay]);
        assert.equal(c.convert(2), '3!');
        // back: oneWay skipped (pass-through), then inc.convertBack → -1
        assert.equal(c.convertBack!(5), 4);
    });

    test('single converter is returned as-is', () => {
        assert.equal(composeConverters([inc]), inc);
    });
});
