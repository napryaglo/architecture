import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../compile.js';

function emit(src: string): string { return compile(src).js; }

describe('ItemsPanelTemplate — resource form', () => {
    test('keyed entry compiles to ItemsPanelTemplate constructor + dict Set', () => {
        const body = emit(`
resources Test {
    ItemsPanelTemplate x:key="WrapLayout" {
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
resources Test {
    ItemsPanelTemplate x:key="X" {
        StackPanel[Orientation=Vertical]
    }
}
`);
        assert.match(body, /new ItemsPanelTemplate/);
    });

    test('rejects without x:key in resource position', () => {
        assert.throws(() => emit(`
resources Test {
    ItemsPanelTemplate {
        StackPanel
    }
}
`), /without x:key/);
    });
});

describe('ItemsPanelTemplate — inline at slot-assign value', () => {
    test('inline form emits anonymous template assigned to property', () => {
        const body = emit(`
import Foo from "./foo.mjs"
resources Test {
    DataTemplate x:key="T" [DataType=Foo] {
        ListBox {
            ItemsPanel: ItemsPanelTemplate {
                StackPanel
            }
        }
    }
}
`);
        assert.match(body, /new ItemsPanelTemplate\(\(\) => \{/);
        assert.match(body, /\.set_property_value\(\w+\.ItemsPanelKey,\s*_tmpl/);
        // No x:key registration for the inline form.
        assert.doesNotMatch(body, /\.Set\([^)]*WrapLayout/);
    });

    test('inline DataTemplate at ItemTemplate slot', () => {
        const body = emit(`
import ParentVM from "./parent-vm.mjs"
import ItemVM   from "./item-vm.mjs"
resources Test {
    DataTemplate x:key="Outer" [DataType=ParentVM] {
        ListBox {
            ItemTemplate: DataTemplate [DataType=ItemVM] {
                TextBlock
            }
        }
    }
}
`);
        assert.match(body, /new DataTemplate\(\(_data\) => \{[\s\S]*new TextBlock/);
        assert.match(body, /\.set_property_value\(\w+\.ItemTemplateKey,\s*_tmpl/);
    });
});
