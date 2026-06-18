// VM for the text-on-path demo.
//
// State the view binds to:
//   * Text         — the text run laid along the path.
//   * PathKey      — which entry from the paths catalog is shown.
//   * FontSize     — glyph size in DIPs.
//   * IsFontLoaded — gates the result render; behavior re-runs the
//                    pipeline when this flips true.
//   * Status       — diagnostic line shown in the chrome.
//   * Paths        — read-only ObservableCollection<{ Key, Label }> for
//                    the picker.

import {
    MetaData,
    Model,
    ObservableCollection,
    RelayCommand,
} from '@visualisation-sub/mural/runtime';

import { PATHS } from './paths.mjs';

// Each picker row exposes Key + Label as DPs so the binding pipeline
// can read them through the standard property path syntax in the .mu.
class PathOption extends Model {
    static {
        Model.RegisterProperty(PathOption, 'Key',   '', MetaData.None);
        Model.RegisterProperty(PathOption, 'Label', '', MetaData.None);
    }
    constructor(key, label) {
        super();
        this._set_property_value_by_name('Key',   key);
        this._set_property_value_by_name('Label', label);
    }
    get Key()    { return this._get_property_value_by_name('Key'); }
    get Label()  { return this._get_property_value_by_name('Label'); }
}

export class TextOnPathVM extends Model {
    static {
        Model.RegisterProperty(TextOnPathVM, 'Text',         'Text running along a curve — try a different path', MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'PathKey',      'wave', MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'FontSize',     28,     MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'SideOffset',   0,      MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'IsFontLoaded', false,  MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'Status',       'Loading font…', MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'Paths',        new ObservableCollection(), MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'SelectedPathOption', undefined, MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'ShowPath',     true,  MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'ShowGlyphs',   true,  MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'TogglePathCommand',   undefined, MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'ToggleGlyphsCommand', undefined, MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'PathColorHex',   '#94a3b8', MetaData.None);
        Model.RegisterProperty(TextOnPathVM, 'GlyphColorHex',  '#0f172a', MetaData.None);
    }

    constructor() {
        super();
        const opts = this._get_property_value_by_name('Paths');
        for (const p of PATHS) opts.Add(new PathOption(p.key, p.label));
        // Default selection — first entry (`wave`).
        this._set_property_value_by_name('SelectedPathOption', opts.Get(0));

        // Two-way bridge — when the picker assigns a new
        // SelectedPathOption, mirror its Key onto PathKey so the
        // behavior's PathKey listener wakes up.
        this._add_property_changed_listener_by_name('SelectedPathOption', (_m, _p, _o, n) => {
            if (n !== undefined) {
                this._set_property_value_by_name('PathKey', n.Key);
            }
        });

        // Quick toggles surface as RelayCommands so the .mu binds them
        // through the ICommand pipeline rather than two-way TextBox
        // binding gymnastics for the boolean DPs. They must live on DPs
        // — DataContextBinding only reads registered properties on a
        // Model context.
        this._set_property_value_by_name('TogglePathCommand', new RelayCommand(
            () => this._set_property_value_by_name('ShowPath',   !this.ShowPath),
            () => true,
        ));
        this._set_property_value_by_name('ToggleGlyphsCommand', new RelayCommand(
            () => this._set_property_value_by_name('ShowGlyphs', !this.ShowGlyphs),
            () => true,
        ));
    }

    get Text()              { return this._get_property_value_by_name('Text'); }
    set Text(v)             { this._set_property_value_by_name('Text', v); }
    get PathKey()           { return this._get_property_value_by_name('PathKey'); }
    set PathKey(v)          { this._set_property_value_by_name('PathKey', v); }
    get FontSize()          { return this._get_property_value_by_name('FontSize'); }
    set FontSize(v)         { this._set_property_value_by_name('FontSize', v); }
    get SideOffset()        { return this._get_property_value_by_name('SideOffset'); }
    set SideOffset(v)       { this._set_property_value_by_name('SideOffset', v); }
    get IsFontLoaded()      { return this._get_property_value_by_name('IsFontLoaded'); }
    set IsFontLoaded(v)     { this._set_property_value_by_name('IsFontLoaded', v); }
    get Status()            { return this._get_property_value_by_name('Status'); }
    set Status(v)           { this._set_property_value_by_name('Status', v); }
    get Paths()             { return this._get_property_value_by_name('Paths'); }
    get SelectedPathOption(){ return this._get_property_value_by_name('SelectedPathOption'); }
    set SelectedPathOption(v){ this._set_property_value_by_name('SelectedPathOption', v); }
    get ShowPath()          { return this._get_property_value_by_name('ShowPath'); }
    get ShowGlyphs()        { return this._get_property_value_by_name('ShowGlyphs'); }
    get TogglePathCommand()   { return this._get_property_value_by_name('TogglePathCommand'); }
    get ToggleGlyphsCommand() { return this._get_property_value_by_name('ToggleGlyphsCommand'); }
    get PathColorHex()        { return this._get_property_value_by_name('PathColorHex'); }
    set PathColorHex(v)       { this._set_property_value_by_name('PathColorHex', v); }
    get GlyphColorHex()       { return this._get_property_value_by_name('GlyphColorHex'); }
    set GlyphColorHex(v)      { this._set_property_value_by_name('GlyphColorHex', v); }
}
