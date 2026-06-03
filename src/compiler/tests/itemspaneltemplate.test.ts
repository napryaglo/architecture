import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

function emit(src: string): string { return compile(src).js; }

describe('itemspaneltemplate — resource form', () => {
    test('keyed entry compiles to ItemsPanelTemplate constructor + dict Set', () => {
        const body = emit(`
ResourceDictionary {
    itemspaneltemplate x:key="WrapLayout" {
        StackPanel
    }
}
`);
        assert.match(body, /new ItemsPanelTemplate\(\(\) => \{/);
        assert.match(body, /new StackPanel\(\)/);
        assert.match(body, /\.Set\("WrapLayout",/);
    });

    test('omitting the [meta] block is allowed', () => {
        const body = emit(`
ResourceDictionary {
    itemspaneltemplate x:key="X" {
        StackPanel[Orientation=Vertical]
    }
}
`);
        assert.match(body, /new ItemsPanelTemplate/);
    });

    test('rejects without x:key in resource position', () => {
        assert.throws(() => emit(`
ResourceDictionary {
    itemspaneltemplate {
        StackPanel
    }
}
`), /without x:key/);
    });
});

describe('itemspaneltemplate — inline at slot-assign value', () => {
    test('inline form emits anonymous template assigned to property', () => {
        const body = emit(`
ResourceDictionary {
    datatemplate x:key="T" [datatype=Foo] {
        ListBox {
            ItemsPanel: itemspaneltemplate {
                StackPanel
            }
        }
    }
}
`);
        assert.match(body, /new ItemsPanelTemplate\(\(\) => \{/);
        assert.match(body, /_set_property_value_by_name\("ItemsPanel",\s*_tmpl/);
        // No x:key registration for the inline form.
        assert.doesNotMatch(body, /\.Set\([^)]*WrapLayout/);
    });

    test('inline datatemplate at ItemTemplate slot', () => {
        const body = emit(`
ResourceDictionary {
    datatemplate x:key="Outer" [datatype=ParentVM] {
        ListBox {
            ItemTemplate: datatemplate [datatype=ItemVM] {
                TextBlock
            }
        }
    }
}
`);
        assert.match(body, /new DataTemplate\(\(_data\) => \{[\s\S]*new TextBlock/);
        assert.match(body, /_set_property_value_by_name\("ItemTemplate",\s*_tmpl/);
    });
});
