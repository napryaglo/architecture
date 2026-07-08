import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Application } from '../../../runtime/index.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { TextBlock } from '../../../basic/text-block.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import type { Visual } from '../../../runtime/index.js';

function findByText(root: Visual, text: string): TextBlock | undefined
{
    if (root instanceof TextBlock && root.Text === text) return root;
    for (const c of root.visualChildren)
    {
        const hit = findByText(c, text);
        if (hit !== undefined) return hit;
    }
    return undefined;
}

// Mount the REAL compiled demo (its DataTemplate + bindings) to catch any
// markup binding breakage the unit tests miss. Imports the compiled demo
// outputs directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDemo(): Promise<{ TextFormatDemo: any; TextFormatVM: any }>
{
    const mu = await import('../../../../demo/demos/text-format/text-format.mu.js');
    const vm = await import('../../../../demo/demos/text-format/text-format-vm.mjs');
    return { TextFormatDemo: (mu as never)['TextFormatDemo'], TextFormatVM: (vm as never)['TextFormatVM'] };
}

describe('text-format demo — markup bindings', () => {
    beforeEach(() => { initTestApp(); });

    test('sample paragraph + editors bind to the VM (two-way)', async () => {
        const { TextFormatDemo, TextFormatVM } = await loadDemo();
        const dict = TextFormatDemo.Clone();
        Application.current?.Resources.AddMergedDictionary(dict);

        const vm = new TextFormatVM();
        // Materialize the demo's DataTemplate directly with the VM as data
        // (the platform content host resolves it implicitly by DataType;
        // a bare presenter here doesn't, so apply it by key).
        const tpl = dict.Get('TextFormatTemplate') as DataTemplate;
        const root = tpl.Apply(vm) as Visual;
        // The platform content host sets DataContext on the presented
        // template output; replicate that so the $-bindings resolve.
        (root as unknown as { DataContext: unknown }).DataContext = vm;
        const target = new HeadlessTarget(700, 400);
        target.Content = root as never;
        target.Flush();

        const sample = findByText(root, vm.Sample);
        assert.ok(sample instanceof TextBlock, 'Sample paragraph materialized + Text bound to VM');

        // Change the VM family → paragraph FontFamily binding updates.
        vm.Family = 'Courier New';
        target.Flush();
        assert.equal(sample.FontFamily.Source, 'Courier New');

        // Change the VM size → paragraph FontSize binding updates.
        vm.FontSize = 33;
        target.Flush();
        assert.equal(sample.FontSize, 33);
    });
});
