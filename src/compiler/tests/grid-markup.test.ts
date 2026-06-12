import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

describe('compile — Grid property-collection blocks', () => {
    test('ColumnDefinitions { … } block lowers to ColumnDefinitions.Add calls', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    ColumnDefinitions {
                        ColumnDefinition [Width=GridLength.Auto]
                        ColumnDefinition [Width=GridLength.Star]
                    }
                }
            } }
        `).js;
        // Two ColumnDefinition instances constructed.
        assert.match(js, /new ColumnDefinition\(\)/);
        // Two .Add calls into ColumnDefinitions on the Grid var.
        const adds = js.match(/_grid\d+\.ColumnDefinitions\.Add\(/g) ?? [];
        assert.equal(adds.length, 2, 'expected two ColumnDefinitions.Add(...) emits');
    });

    test('RowDefinitions { … } block lowers to RowDefinitions.Add calls', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    RowDefinitions {
                        RowDefinition [Height=GridLength.Auto]
                        RowDefinition [Height=GridLength.Star]
                    }
                }
            } }
        `).js;
        assert.match(js, /new RowDefinition\(\)/);
        const adds = js.match(/_grid\d+\.RowDefinitions\.Add\(/g) ?? [];
        assert.equal(adds.length, 2, 'expected two RowDefinitions.Add(...) emits');
    });

    test('ColumnDefinitions block coexists with regular Grid children', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    ColumnDefinitions {
                        ColumnDefinition [Width=GridLength.Auto]
                        ColumnDefinition [Width=GridLength.Star]
                    }
                    Border [Grid.Column=0]
                    Border [Grid.Column=1]
                }
            } }
        `).js;
        // Border children get the regular AddChild routing.
        const childAdds = js.match(/_grid\d+\.AddChild\(/g) ?? [];
        assert.equal(childAdds.length, 2, 'expected two regular AddChild emits');
        // ColumnDefinitions block still emits its own .Add calls.
        const colAdds = js.match(/_grid\d+\.ColumnDefinitions\.Add\(/g) ?? [];
        assert.equal(colAdds.length, 2);
    });

    test('emitted JS asserts the GridLength expression rides through verbatim', () => {
        const js = compile(`
            Application{ resources: {
                Grid x:root {
                    ColumnDefinitions {
                        ColumnDefinition [Width=GridLength.Auto]
                        ColumnDefinition [Width=GridLength.Star]
                    }
                }
            } }
        `).js;
        // GridLength.Auto / .Star resolve through STATIC_MEMBERS and
        // emit as bare member accesses (the runtime statics).
        assert.match(js, /GridLength\.Auto/);
        assert.match(js, /GridLength\.Star/);
    });

    test('ColumnDefinitions block with attributes is rejected', () => {
        assert.throws(() => compile(`
            Application{ resources: {
                Grid x:root {
                    ColumnDefinitions [Foo=1] {
                        ColumnDefinition
                    }
                }
            } }
        `));
    });
});
