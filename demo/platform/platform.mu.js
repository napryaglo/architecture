import { DemoVM } from "./demo-group-services.mjs";
import { DemoPlatformIcons } from "./demo-platform-icons.mu.js";
import { DemoPlatformModule } from "./demo-platform.module.mu.js";
import { DataTemplate, TextBlock } from "@visualisation-sub/mural/basic";
import { EditorShell } from "@visualisation-sub/mural/framework/shell/editor-shell.js";
import { Material, MaterialLight } from "@visualisation-sub/mural/resources/material";
import { Application, DataContextBinding, NameScope, Thickness } from "@visualisation-sub/mural/runtime";

export const app = (() => {
    const _app0 = new Application();
    _app0.initialize({ theme: Material, scheme: MaterialLight });
    _app0.Modules.Add(DemoPlatformModule);
    const _rd1 = _app0.Resources;
    for (const [_k, _v] of DemoPlatformIcons.Clone().Entries()) _rd1.Set(_k, _v);
    const _tmpl2 = new DataTemplate((_data) => {
        const _textBlock3 = new TextBlock();
        _textBlock3.set_property_value(TextBlock.TextKey, DataContextBinding(_textBlock3, "Label"));
        _textBlock3.set_property_value(TextBlock.MarginKey, new Thickness(4, 3, 4, 3));
        return _textBlock3;
    }, DemoVM);
    _rd1.Set(DemoVM, _tmpl2);
    const _editorShell4 = new EditorShell();
    _editorShell4.SetNameScope(new NameScope());
    _rd1.Root = _editorShell4;
    return _app0;
})();
