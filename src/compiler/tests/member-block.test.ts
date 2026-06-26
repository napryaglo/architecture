import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

describe('compile — .Member: dotted aggregate-property blocks', () => {
    test('generic .Member: lowers each element entry to Member.Add(child)', () => {
        // The dotted general form reproduces the bespoke
        // `ColumnDefinitions { … }` block: append each entry to the
        // surrounding element's collection DP.
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    .ColumnDefinitions: {
                        ColumnDefinition [Width=GridLength.Auto]
                        ColumnDefinition [Width=GridLength.Star]
                    }
                }
            } }
        `).js;
        assert.match(js, /new ColumnDefinition\(\)/);
        const adds = js.match(/_grid\d+\.ColumnDefinitions\.Add\(/g) ?? [];
        assert.equal(adds.length, 2, 'expected two ColumnDefinitions.Add(...) emits');
    });

    test('.Member: coexists with regular children and attributes', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    .RowDefinitions: {
                        RowDefinition [Height=GridLength.Star]
                    }
                    Border [Background=#fff]
                }
            } }
        `).js;
        assert.match(js, /_grid\d+\.RowDefinitions\.Add\(/);
        // The Border child still routes through the normal default slot.
        assert.match(js, /new Border\(\)/);
    });

    test('non-element entries in a generic (list) .Member: block are rejected', () => {
        assert.throws(() => compile(`
            Application{ resources: {
                Grid x:root {
                    .ColumnDefinitions: {
                        foo: 3
                    }
                }
            } }
        `), /only accepts element entries/);
    });

    test('keyed @key=value entries switch .Member: to the dictionary (Set) strategy', () => {
        // Any keyed entry makes the block a dictionary: lower to
        // Member.Set(key, value) rather than Member.Add(child).
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    .Swatches: {
                        @Red  = #ff0000
                        @Blue = #0000ff
                    }
                }
            } }
        `).js;
        assert.match(js, /_grid\d+\.Swatches\.Set\("Red", /);
        assert.match(js, /_grid\d+\.Swatches\.Set\("Blue", /);
        assert.doesNotMatch(js, /\.Swatches\.Add\(/);
    });

    test('x:key’d element entries also use the dictionary (Set) strategy', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    .Cells: {
                        Border x:key="A" [Background=#fff]
                        Border x:key="B"
                    }
                }
            } }
        `).js;
        const sets = js.match(/_grid\d+\.Cells\.Set\(/g) ?? [];
        assert.equal(sets.length, 2, 'expected two Cells.Set(...) emits');
        assert.match(js, /_grid\d+\.Cells\.Set\("A", /);
        assert.match(js, /_grid\d+\.Cells\.Set\("B", /);
    });

    test('mixing keyed and unkeyed entries in one .Member: block is rejected', () => {
        assert.throws(() => compile(`
            Application{ resources: {
                Grid x:root {
                    .Cells: {
                        Border x:key="A"
                        Border
                    }
                }
            } }
        `), /mixes keyed and unkeyed entries/);
    });

    // ── §25 fold: the dictionary `.Member:` shares `resources:`' full
    // entry router, so it accepts resource-forms (Style/Template/…) with
    // implicit type-keys — not just @key=value and x:key'd elements.
    test('.Resources: accepts a Style resource-form (implicit type-key)', () => {
        const js = compile(`
            Application{ resources: {
                Border x:root {
                    .Resources: {
                        Style [TargetType=Border] { Background = #ffffff; }
                    }
                }
            } }
        `).js;
        // The Style is built and keyed implicitly by its TargetType class
        // (a real Function reference), routed into the Border's Resources.
        assert.match(js, /new Style\(Border, /);
        assert.match(js, /_border\d+\.Resources\.Set\(Border, /);
    });

    test('a generic dictionary .Member: also accepts resource-forms', () => {
        const js = compile(`
            Application{ resources: {
                Border x:root {
                    .Palette: {
                        @Bg = #000000
                        DataTemplate x:key="row" [DataType=Border] { TextBlock }
                    }
                }
            } }
        `).js;
        assert.match(js, /_border\d+\.Palette\.Set\("Bg", /);
        assert.match(js, /_border\d+\.Palette\.Set\("row", /);
    });

    test('.Resources: lowers the same as the resources: keyword', () => {
        const viaMember = compile(`
            Application{ resources: {
                Border x:root { .Resources: { @Accent = #ff0000 } }
            } }
        `).js;
        const viaKeyword = compile(`
            Application{ resources: {
                Border x:root { resources: { @Accent = #ff0000 } }
            } }
        `).js;
        // Both route @Accent into the Border's Resources dictionary. The
        // keyword binds a local handle first (`const _rd = b.Resources`),
        // the member form sets through the accessor — different receiver
        // var, identical Set call against the same dictionary value.
        assert.match(viaMember,  /\.Set\("Accent", new SolidColorBrush\(Color\.FromHex\('#ff0000'\)\)\)/);
        assert.match(viaKeyword, /\.Set\("Accent", new SolidColorBrush\(Color\.FromHex\('#ff0000'\)\)\)/);
        assert.match(viaMember,  /_border\d+\.Resources\.Set\("Accent", /);
        assert.match(viaKeyword, /= _border\d+\.Resources;/);
    });
});
