import {
    MetaData,
    Model,
    Scheme,
    Theme,
    ThemeManager,
    Element, } from '../../runtime/index.js';
import { ContentControl } from '../content-control.js';
import { ComboBox } from '../list/combo-box.js';

// ThemeSelector — chrome control for picking the active Theme + Scheme
// at runtime. Reads / writes the global ThemeManager directly; no VM
// state required on the host side.
//
// Layout (default template):
//
//   ┌─ PART_ThemeIcon ─┐ ┌─ PART_ThemeCombo ─┐  ┌─ PART_SchemeIcon ─┐ ┌─ PART_SchemeCombo ─┐
//   │   icon glyph     │ │  (slides in)      │  │   icon glyph      │ │   (slides in)      │
//   └──────────────────┘ └───────────────────┘  └───────────────────┘ └────────────────────┘
//
// Icons are always visible affordances. Both ComboBoxes slide in when
// the pointer enters the ThemeSelector and slide back out when the
// pointer leaves AND no dropdown popup is currently open — declared as
// `when ( IsMouseOver or PART_xxxCombo.IsDropDownOpen )` triggers in
// the default template. The control itself owns no open/closed DPs:
// hover state lives on the standard `IsMouseOver` already exposed by
// every and dropdown state lives on the inner ComboBoxes.
//
// External theme changes (AutoScheme firing, another module calling
// ActivateTheme directly) feed back through ThemeManager.Activated so
// the picker's selected items stay in sync.
//
// Extends ContentControl purely for the Template + GetTemplateChild
// inheritance; the Content slot is unused.
export class ThemeSelector extends ContentControl
{
    // ── State DPs ─────────────────────────────────────────────────────
    //
    // Read-only mirrors of ThemeManager state, useful for hosts that
    // want to bind a label or status indicator to the active theme /
    // scheme without reaching into the singleton directly. The template
    // doesn't reference them — the inner ComboBoxes are bound
    // imperatively from syncFromThemeManager.

    private static readonly _ActiveThemeNamePriv = Model.RegisterReadOnlyProperty<string | undefined>(
        ThemeSelector, 'ActiveThemeName', undefined, MetaData.None,
    );
    public  static readonly ActiveThemeNameKey  = ThemeSelector._ActiveThemeNamePriv;

    private static readonly _ActiveSchemeNamePriv = Model.RegisterReadOnlyProperty<string | undefined>(
        ThemeSelector, 'ActiveSchemeName', undefined, MetaData.None,
    );
    public  static readonly ActiveSchemeNameKey  = ThemeSelector._ActiveSchemeNamePriv;

    static
    {
        Model.OverrideMetadata(ThemeSelector, Element.DefaultStyleKeyKey, { default_value: ThemeSelector });
    }

    // ── Template parts ────────────────────────────────────────────────
    private _themeCombo:  ComboBox | undefined;
    private _schemeCombo: ComboBox | undefined;

    // Guard for the round-trip: setting ComboBox.SelectedItem from the
    // ThemeManager-sync path would otherwise fire the SelectionChanged
    // listener and re-activate the same theme.
    private _syncing = false;

    // ThemeManager listener kept as a field so we can detach it (tests,
    // host swap). Production chrome lives for the app's lifetime so this
    // detaches as an exercise in good hygiene rather than a hard need.
    private readonly _onThemeActivated = (_theme: Theme, _scheme: Scheme): void =>
    {
        this.syncFromThemeManager();
    };

    constructor()
    {
        super();
        this.applyDefaultStyle();

        this._themeCombo  = this.GetTemplateChild('PART_ThemeCombo')  as ComboBox | undefined;
        this._schemeCombo = this.GetTemplateChild('PART_SchemeCombo') as ComboBox | undefined;

        this._themeCombo?.AddSelectionChangedListener(() =>
        {
            if (this._syncing) return;
            const name = this._themeCombo?.SelectedItem;
            if (typeof name === 'string') this.SelectTheme(name);
        });
        this._schemeCombo?.AddSelectionChangedListener(() =>
        {
            if (this._syncing) return;
            const name = this._schemeCombo?.SelectedItem;
            if (typeof name === 'string') this.SelectScheme(name);
        });

        // Initial sync from whatever's already active, plus subscribe to
        // future activations so external code paths (AutoScheme listener,
        // direct ThemeManager calls) keep the picker honest.
        this.syncFromThemeManager();
        ThemeManager.AddActivatedListener(this._onThemeActivated);
    }

    // ── Public DPs ────────────────────────────────────────────────────

    public get ActiveThemeName():  string | undefined { return this.get_property_value(ThemeSelector.ActiveThemeNameKey); }
    public get ActiveSchemeName(): string | undefined { return this.get_property_value(ThemeSelector.ActiveSchemeNameKey); }

    private setActiveThemeName(v: string | undefined): void
    {
        this.set_property_value_with_key(ThemeSelector._ActiveThemeNamePriv, v);
    }
    private setActiveSchemeName(v: string | undefined): void
    {
        this.set_property_value_with_key(ThemeSelector._ActiveSchemeNamePriv, v);
    }

    // ── Public selection API ──────────────────────────────────────────
    //
    // Wired from the inner ComboBox SelectionChanged listeners but also
    // public so hosts (tests, keyboard shortcuts on the demo VM) can
    // drive the picker programmatically.

    /** Activate the named Theme on the global ThemeManager, then refresh
     *  the picker's state. No-op if the name doesn't match a registered
     *  Theme. */
    public SelectTheme(name: string): void
    {
        const tm = ThemeManager;
        if (tm.GetTheme(name) === undefined) return;
        if (tm.ActiveTheme?.name === name) return;
        tm.ActivateTheme(name);
    }

    /** Activate the named Scheme on the active Theme. No-op if no theme
     *  is active or the scheme name isn't registered on it. */
    public SelectScheme(name: string): void
    {
        const tm = ThemeManager;
        const theme = tm.ActiveTheme;
        if (theme === undefined) return;
        if (!theme.schemes.has(name)) return;
        if (tm.ActiveScheme?.name === name) return;
        tm.ActivateScheme(name);
    }

    // Pull the picker's full state from ThemeManager. Called on
    // construction and on every ThemeManager.Activated event so external
    // theme writers (AutoScheme, direct API calls) stay in sync.
    private syncFromThemeManager(): void
    {
        this._syncing = true;
        try
        {
            const tm     = ThemeManager;
            const theme  = tm.ActiveTheme;
            const scheme = tm.ActiveScheme;

            this.setActiveThemeName(theme?.name);
            this.setActiveSchemeName(scheme?.name);

            const themeNames = tm.RegisteredThemes.map(t => t.name);
            if (this._themeCombo !== undefined)
            {
                this._themeCombo.Items        = themeNames;
                this._themeCombo.SelectedItem = theme?.name;
            }

            const schemeNames = theme !== undefined
                ? [...theme.schemes.values()].map(s => s.name)
                : [];
            if (this._schemeCombo !== undefined)
            {
                this._schemeCombo.Items        = schemeNames;
                this._schemeCombo.SelectedItem = scheme?.name;
            }
        }
        finally
        {
            this._syncing = false;
        }
    }
}
