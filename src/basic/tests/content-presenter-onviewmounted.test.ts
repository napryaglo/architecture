import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from './test-app.js';
import { Application, MetaData, Model } from '../../runtime/index.js';
import type { Visual } from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { ContentPresenter } from '../templates/content-presenter.js';
import { DataTemplate } from '../templates/data-template.js';
import { TextBlock } from '../text-block.js';

// Regression: a VM presented through a bare ContentPresenter (the shell's
// `$service(ContentHostService).Content` demo host) must get its
// OnViewMounted hook called with the materialized template visual — the
// same contract ContentControl honours. Demo bootstrap behaviours
// (attaching bridges that apply formatting, colour, etc.) hang off this;
// without it they never run.
class HookVM extends Model
{
    static readonly LabelKey = Model.RegisterProperty<string>(HookVM, 'Label', 'hi', MetaData.None);
    public get Label(): string { return this.get_property_value(HookVM.LabelKey); }
    public mountedWith: Visual | undefined;
    public OnViewMounted(view: Visual): void { this.mountedWith = view; }
}

describe('ContentPresenter — OnViewMounted hook', () => {
    beforeEach(() => { initTestApp(); });

    test('calls OnViewMounted with the materialized template visual', () => {
        Application.current?.Resources.Set('HookTpl', new DataTemplate(
            (_d) => new TextBlock('x'), HookVM));

        const vm = new HookVM();
        const cp = new ContentPresenter();
        const target = new HeadlessTarget(200, 100);
        target.Content = cp as never;
        target.Flush();
        cp.Content = vm;
        target.Flush();

        assert.ok(vm.mountedWith !== undefined, 'OnViewMounted fired');
        assert.ok(vm.mountedWith instanceof TextBlock, 'received the template visual');
    });

    test('a plain Visual content does not invoke any hook path (no crash)', () => {
        const cp = new ContentPresenter();
        const target = new HeadlessTarget(200, 100);
        target.Content = cp as never;
        target.Flush();
        cp.Content = new TextBlock('plain');   // Visual, not a VM
        target.Flush();
        // No assertion beyond "didn't throw" — a Visual bypasses template
        // resolution and the hook lookup entirely.
        assert.ok(true);
    });
});
