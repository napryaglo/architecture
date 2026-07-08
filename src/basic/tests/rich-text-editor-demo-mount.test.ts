import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import { Application, type Visual } from '../../runtime/index.js';
import { HeadlessTarget, FontWeight } from '../../visual-engine/index.js';
import { DataTemplate } from '../templates/data-template.js';
import { RichTextBox, FlowDocument, List, Paragraph } from '../index.js';
import { ParagraphRuns } from '../documents/text-pointer.js';
import { DocumentParagraphs } from '../documents/text-navigation.js';

// Mount the REAL compiled rich-text-editor demo (its DataTemplate + the
// FlowDocument authored in markup) to catch markup / wiring breakage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadDemo(): Promise<{ dict: any; VM: any }>
{
    const mu = await import('../../../demo/demos/rich-text-editor/rich-text-editor.mu.js');
    const vm = await import('../../../demo/demos/rich-text-editor/rich-text-editor-vm.mjs');
    return { dict: (mu as never)['RichTextEditorDemo'], VM: (vm as never)['RichTextEditorVM'] };
}

describe('rich-text-editor demo — mounts + edits', () => {
    beforeEach(() => { initTestApp(); });

    test('the authored FlowDocument materializes in a RichTextBox', async () => {
        const { dict, VM } = await loadDemo();
        const instance = dict.Clone();
        Application.current?.Resources.AddMergedDictionary(instance);
        const tpl = instance.Get('RichTextEditorTemplate') as DataTemplate;
        const vm = new VM();
        const root = tpl.Apply(vm) as Visual & { FindName(n: string): Visual | undefined };
        (root as unknown as { DataContext: unknown }).DataContext = vm;
        const target = new HeadlessTarget(700, 500);
        target.Content = root as never;
        target.Flush();

        const editor = root.FindName('Editor');
        assert.ok(editor instanceof RichTextBox, 'RichTextBox materialized');
        const doc = (editor as RichTextBox).Document;
        assert.ok(doc instanceof FlowDocument, 'authored FlowDocument present');
        // 2 paragraphs + 2 lists.
        assert.equal(doc!.Blocks.Count, 4);
        assert.ok(doc!.Blocks.Get(0) instanceof Paragraph);
        assert.ok(doc!.Blocks.Get(2) instanceof List);

        // Toolbar buttons materialized.
        for (const name of ['BoldBtn', 'ItalicBtn', 'UnderlineBtn', 'IndentBtn', 'OutdentBtn'])
            assert.ok(root.FindName(name) !== undefined, `${name} present`);
    });

    test('the editing command surface the toolbar calls works', async () => {
        const { dict, VM } = await loadDemo();
        const instance = dict.Clone();
        Application.current?.Resources.AddMergedDictionary(instance);
        const tpl = instance.Get('RichTextEditorTemplate') as DataTemplate;
        const vm = new VM();
        const root = tpl.Apply(vm) as Visual & { FindName(n: string): Visual | undefined };
        (root as unknown as { DataContext: unknown }).DataContext = vm;
        const target = new HeadlessTarget(700, 500);
        target.Content = root as never;
        target.Flush();

        const editor = root.FindName('Editor') as RichTextBox;
        editor.SelectAll();
        editor.ToggleBold();
        const first = DocumentParagraphs(editor.Document!)[0]!;
        assert.ok(ParagraphRuns(first).every((s) => s.run.FontWeight === FontWeight.Bold), 'ToggleBold bolded the selection');
    });
});
