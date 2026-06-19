import {
    MetaData,
    Model,
    Point,
    Thickness,
    Visual,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { resolveKey } from '../runtime/model-internals.js';
import {
    Color,
    GradientStop,
    LinearGradientBrush,
    SolidColorBrush,
} from '../visual-engine/index.js';
import type { PresentationTarget, PointerEventArgs } from '../visual-engine/index.js';
import { Border } from '../basic/border.js';
import { Canvas } from '../basic/panels/canvas.js';
import { WrapPanel } from '../basic/panels/wrap-panel.js';
import { Slider } from '../basic/slider.js';
import { TextBox } from '../basic/text-box.js';
import { TemplatedControl } from '../basic/templated-control.js';
import { ControlTemplate } from '../basic/templates/control-template.js';
import { MenuPopupHost } from './menu/menu-strip.js';
import { ClickAwayScrim } from '../basic/click-away-scrim.js';

// Material 3 swatch palette — 10 colours × 3 tones each. Tuned by hand
// against the M3 reference tonal palette (tones 80 / 60 / 40 for the
// "container / base / on-container" feel) so the grid reads as a
// sensible "pick a colour" surface without dragging the full M3
// generator at runtime.
export const MATERIAL_PALETTE: readonly string[] = Object.freeze([
    '#ffebee', '#ffcdd2', '#ef5350', // red
    '#fce4ec', '#f8bbd0', '#ec407a', // pink
    '#f3e5f5', '#e1bee7', '#ab47bc', // purple
    '#ede7f6', '#d1c4e9', '#7e57c2', // deep purple
    '#e3f2fd', '#bbdefb', '#42a5f5', // blue
    '#e0f7fa', '#b2ebf2', '#26c6da', // cyan
    '#e8f5e9', '#c8e6c9', '#66bb6a', // green
    '#f9fbe7', '#f0f4c3', '#d4e157', // lime
    '#fff8e1', '#ffecb3', '#ffca28', // amber
    '#efebe9', '#d7ccc8', '#8d6e63', // brown
]);

// HSV → RGB. h in [0, 360), s and v in [0, 100]. Returns 0..255 channels.
// Standard formula; matches the W3C CSS Color 4 HSV reference.
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number }
{
    const sN = s / 100;
    const vN = v / 100;
    const c = vN * sN;
    const hh = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r = 0, g = 0, b = 0;
    if      (hh < 1) { r = c; g = x; b = 0; }
    else if (hh < 2) { r = x; g = c; b = 0; }
    else if (hh < 3) { r = 0; g = c; b = x; }
    else if (hh < 4) { r = 0; g = x; b = c; }
    else if (hh < 5) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    const m = vN - c;
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255),
    };
}

// RGB → HSV. r/g/b in 0..255. Returns h in [0, 360), s/v in [0, 100].
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number }
{
    const rN = r / 255, gN = g / 255, bN = b / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const d = max - min;
    let h: number;
    if (d === 0)         h = 0;
    else if (max === rN) h = ((gN - bN) / d) % 6;
    else if (max === gN) h = (bN - rN) / d + 2;
    else                 h = (rN - gN) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    return { h, s, v };
}

// Two popup variants — HSV (the default) carries hue / saturation /
// brightness sliders; RGB carries red / green / blue / alpha sliders.
// The default Style flips PopupTemplate via a trigger on this enum, so
// consumers opt in with `[Variant=RGB]` in markup or `picker.Variant =
// ColorPickerVariant.RGB` in TS — same shape Button uses for its
// Filled / Tonal / Outlined family.
export enum ColorPickerVariant
{
    HSV = 'HSV',
    RGB = 'RGB',
}

// ComboBox-style colour picker. Closed: a small swatch + the hex label
// inside a clickable border. Open: a popup with a palette grid, the
// variant-appropriate slider trio (HSV) or quad (RGB+alpha) and a hex
// text input — all kept in sync via the
// Color/ColorHex/Hue/Saturation/Brightness/Red/Green/Blue/Alpha DPs.
//
// Source-of-truth contract: the four sliders + hex input each bind to
// their own DP via TemplatedParent ($Hue, $Saturation, $Brightness,
// $ColorHex). When the user edits ANY of them, OnPropertyChanged here
// recomputes Color and pushes the derived values back to the rest of
// the DPs. A guarded _syncing flag breaks the feedback loop so the
// re-push doesn't cascade indefinitely.
//
// Hex parse failures (partial typing) are swallowed — the slider /
// palette state stays put until a fully valid hex string lands.
export class ColorPicker extends TemplatedControl
{
    public static readonly ColorKey      = Model.RegisterProperty<Color>(  ColorPicker, 'Color',      Color.Black,            MetaData.None | MetaData.BindsTwoWayByDefault);
    public static readonly ColorHexKey   = Model.RegisterProperty<string>( ColorPicker, 'ColorHex',   '#000000',              MetaData.None | MetaData.BindsTwoWayByDefault);
    public static readonly HueKey        = Model.RegisterProperty<number>( ColorPicker, 'Hue',        0,                      MetaData.None);
    public static readonly SaturationKey = Model.RegisterProperty<number>( ColorPicker, 'Saturation', 0,                      MetaData.None);
    public static readonly BrightnessKey = Model.RegisterProperty<number>( ColorPicker, 'Brightness', 0,                      MetaData.None);
    public static readonly RedKey        = Model.RegisterProperty<number>( ColorPicker, 'Red',        0,                      MetaData.None);
    public static readonly GreenKey      = Model.RegisterProperty<number>( ColorPicker, 'Green',      0,                      MetaData.None);
    public static readonly BlueKey       = Model.RegisterProperty<number>( ColorPicker, 'Blue',       0,                      MetaData.None);
    public static readonly AlphaKey      = Model.RegisterProperty<number>( ColorPicker, 'Alpha',      255,                    MetaData.None);
    public static readonly VariantKey    = Model.RegisterProperty<ColorPickerVariant>(ColorPicker, 'Variant', ColorPickerVariant.HSV, MetaData.None);
    public static readonly IsDropDownOpenKey = Model.RegisterProperty<boolean>(ColorPicker, 'IsDropDownOpen', false,          MetaData.None);
    public static readonly PopupTemplateKey  = Model.RegisterProperty<ControlTemplate | undefined>(ColorPicker, 'PopupTemplate', undefined, MetaData.None);
    // Per-instance default — the DP system shares its `default_value`
    // across every registered control, so we slot a fresh
    // SolidColorBrush in the ctor BEFORE applyDefaultStyle so the
    // template's `$SwatchBrush` binding lands on a brush nobody else
    // touches. Mutating the brush's Color in sync is then safe.
    public static readonly SwatchBrushKey = Model.RegisterProperty<SolidColorBrush | undefined>(ColorPicker, 'SwatchBrush', undefined, MetaData.None);

    public get Color():      Color  { return this.get_property_value(ColorPicker.ColorKey); }
    public set Color(v:      Color) { this.set_property_value(ColorPicker.ColorKey, v); }
    public get ColorHex():   string { return this.get_property_value(ColorPicker.ColorHexKey); }
    public set ColorHex(v:   string){ this.set_property_value(ColorPicker.ColorHexKey, v); }
    public get Hue():        number { return this.get_property_value(ColorPicker.HueKey); }
    public set Hue(v:        number){ this.set_property_value(ColorPicker.HueKey, v); }
    public get Saturation(): number { return this.get_property_value(ColorPicker.SaturationKey); }
    public set Saturation(v: number){ this.set_property_value(ColorPicker.SaturationKey, v); }
    public get Brightness(): number { return this.get_property_value(ColorPicker.BrightnessKey); }
    public set Brightness(v: number){ this.set_property_value(ColorPicker.BrightnessKey, v); }
    public get Red():        number { return this.get_property_value(ColorPicker.RedKey); }
    public set Red(v:        number){ this.set_property_value(ColorPicker.RedKey, v); }
    public get Green():      number { return this.get_property_value(ColorPicker.GreenKey); }
    public set Green(v:      number){ this.set_property_value(ColorPicker.GreenKey, v); }
    public get Blue():       number { return this.get_property_value(ColorPicker.BlueKey); }
    public set Blue(v:       number){ this.set_property_value(ColorPicker.BlueKey, v); }
    public get Alpha():      number { return this.get_property_value(ColorPicker.AlphaKey); }
    public set Alpha(v:      number){ this.set_property_value(ColorPicker.AlphaKey, v); }
    public get Variant():    ColorPickerVariant { return this.get_property_value(ColorPicker.VariantKey); }
    public set Variant(v:    ColorPickerVariant){ this.set_property_value(ColorPicker.VariantKey, v); }
    public get IsDropDownOpen(): boolean { return this.get_property_value(ColorPicker.IsDropDownOpenKey); }
    public set IsDropDownOpen(v: boolean){ this.set_property_value(ColorPicker.IsDropDownOpenKey, v); }
    public get PopupTemplate():  ControlTemplate | undefined { return this.get_property_value(ColorPicker.PopupTemplateKey); }
    public set PopupTemplate(v:  ControlTemplate | undefined){ this.set_property_value(ColorPicker.PopupTemplateKey, v); }
    public get SwatchBrush():    SolidColorBrush | undefined { return this.get_property_value(ColorPicker.SwatchBrushKey); }

    static {
        Model.OverrideMetadata(ColorPicker, Visual.DefaultStyleKeyKey, { default_value: ColorPicker });
    }

    private _trigger:    Border | undefined;
    private _popupHost:  MenuPopupHost  | undefined;
    private _mounted = false;
    private _triggerPressed = false;
    private _syncing = false;
    private _swatches: Border[] = [];
    // Popup edit parts — only present while the popup is mounted. Each
    // slider / textbox is two-way-wired by mountPopup; cleanup runs in
    // unmountPopup so a re-open binds a fresh template instance. Only
    // one variant's slider set is populated per mount.
    private _hSlider:    Slider  | undefined;  // HSV: hue
    private _sSlider:    Slider  | undefined;  // HSV: saturation
    private _vSlider:    Slider  | undefined;  // HSV: brightness / value
    private _rSlider:    Slider  | undefined;  // RGB: red
    private _gSlider:    Slider  | undefined;  // RGB: green
    private _blueSlider: Slider  | undefined;  // RGB: blue
    private _aSlider:    Slider  | undefined;  // RGB: alpha
    private _hexInput:   TextBox | undefined;
    // 2D gradient box (RGB variant) parts. The box's hue + saturation
    // fill brushes are static (built once at mount); the rail's fill
    // brush is rebuilt whenever Hue or Saturation moves.
    private _hsBox:        Canvas | undefined;
    private _hsBoxOverlay: Border | undefined;
    private _hsBoxCursor:  Border | undefined;
    private _vRail:        Canvas | undefined;
    private _vRailFill:    Border | undefined;
    private _vRailCursor:  Border | undefined;
    private _popupListeners: Array<() => void> = [];

    constructor()
    {
        super();
        // Per-instance swatch brush — must land BEFORE the template
        // resolves its `$SwatchBrush` binding.
        this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(Color.Black));
        this.applyDefaultStyle();
        // Seed the derived DPs from the initial Color value so the
        // popup widgets land in sync the first time it's opened.
        this.syncFromColor();
        this.adoptTemplateParts();
    }

    private adoptTemplateParts(): void
    {
        this._trigger = this.GetTemplateChild('PART_SelectionTrigger') as Border | undefined;
        if (this._trigger !== undefined)
        {
            const t = this._trigger;
            t.AddRoutedEventListener('PointerDown', (() => {
                this._triggerPressed = true;
                t.set_property_value(Visual.IsPressedKey, true);
            }) as (a: unknown) => void);
            t.AddRoutedEventListener('PointerUp', (() => {
                const fire = this._triggerPressed;
                this._triggerPressed = false;
                t.set_property_value(Visual.IsPressedKey, false);
                if (fire) this.IsDropDownOpen = !this.IsDropDownOpen;
            }) as (a: unknown) => void);
            t.AddRoutedEventListener('PointerLeave', (() => {
                this._triggerPressed = false;
                t.set_property_value(Visual.IsPressedKey, false);
            }) as (a: unknown) => void);
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue:   unknown,
        newValue:   unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Owner !== ColorPicker) return;
        switch (descriptor.Name)
        {
            case 'Color':           this.onColorChanged(newValue as Color); break;
            case 'ColorHex':        this.onHexChanged(newValue as string);  break;
            case 'Hue':
            case 'Saturation':
            case 'Brightness':      this.onHsvChanged();                    break;
            case 'Red':
            case 'Green':
            case 'Blue':
            case 'Alpha':           this.onRgbaChanged();                   break;
            case 'Variant':
                // The Style trigger handles the PopupTemplate swap; if the
                // popup happens to be open during the swap we unmount the
                // current chrome so the new template materialises fresh
                // next open.
                if (this._mounted) { this.unmountPopup(); this.IsDropDownOpen = false; }
                break;
            case 'IsDropDownOpen':
                if (newValue === true) this.mountPopup();
                else                    this.unmountPopup();
                break;
        }
    }

    private onColorChanged(c: Color): void
    {
        if (this._syncing) return;
        this._syncing = true;
        try {
            const hsv = rgbToHsv(c.R, c.G, c.B);
            this.Hue        = hsv.h;
            this.Saturation = hsv.s;
            this.Brightness = hsv.v;
            this.Red        = c.R;
            this.Green      = c.G;
            this.Blue       = c.B;
            this.Alpha      = c.A;
            this.ColorHex   = c.ToHex();
            this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(c));
            this.pushAllToPopup();
            this.refreshGradientBox();
        } finally { this._syncing = false; }
    }

    private onHexChanged(hex: string): void
    {
        if (this._syncing) return;
        let parsed: Color;
        try { parsed = Color.FromHex(hex); }
        catch { return; }
        this._syncing = true;
        try {
            this.Color = parsed;
            const hsv = rgbToHsv(parsed.R, parsed.G, parsed.B);
            this.Hue        = hsv.h;
            this.Saturation = hsv.s;
            this.Brightness = hsv.v;
            this.Red        = parsed.R;
            this.Green      = parsed.G;
            this.Blue       = parsed.B;
            this.Alpha      = parsed.A;
            this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(parsed));
            this.pushChannelsToSliders();
            this.refreshGradientBox();
            // Deliberately NOT pushing back to PART_HexInput — the user
            // is mid-edit; rewriting their own text would clobber the
            // cursor and surprise them.
        } finally { this._syncing = false; }
    }

    private onHsvChanged(): void
    {
        if (this._syncing) return;
        const rgb = hsvToRgb(this.Hue, this.Saturation, this.Brightness);
        // Preserve the current Alpha — HSV sliders don't touch it.
        const c = new Color(rgb.r, rgb.g, rgb.b, this.Alpha);
        this._syncing = true;
        try {
            this.Color    = c;
            this.ColorHex = c.ToHex();
            this.Red      = c.R;
            this.Green    = c.G;
            this.Blue     = c.B;
            this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(c));
            this.pushHexToInput();
            this.refreshGradientBox();
            // HSV sliders ARE the source; no need to push back to them.
        } finally { this._syncing = false; }
    }

    private onRgbaChanged(): void
    {
        if (this._syncing) return;
        const c = new Color(this.Red, this.Green, this.Blue, this.Alpha);
        this._syncing = true;
        try {
            this.Color    = c;
            this.ColorHex = c.ToHex();
            const hsv = rgbToHsv(c.R, c.G, c.B);
            this.Hue        = hsv.h;
            this.Saturation = hsv.s;
            this.Brightness = hsv.v;
            this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(c));
            this.pushHexToInput();
            this.refreshGradientBox();
            // RGBA sliders ARE the source; no need to push back to them.
        } finally { this._syncing = false; }
    }

    // Programmatic writes into the popup-edit parts. Each guarded write
    // happens within an _syncing window, so the corresponding listener
    // on the part bails before it tries to write back into the picker.
    // The slider refs are variant-specific — only one trio (or quad) is
    // populated at a time depending on which popup template mounted.
    private pushChannelsToSliders(): void
    {
        if (!this._mounted) return;
        if (this._hSlider !== undefined) this._hSlider.Value = this.Hue;
        if (this._sSlider !== undefined) this._sSlider.Value = this.Saturation;
        if (this._vSlider !== undefined) this._vSlider.Value = this.Brightness;
        if (this._rSlider !== undefined) this._rSlider.Value = this.Red;
        if (this._gSlider !== undefined) this._gSlider.Value = this.Green;
        if (this._blueSlider !== undefined) this._blueSlider.Value = this.Blue;
        if (this._aSlider !== undefined) this._aSlider.Value = this.Alpha;
    }

    private pushHexToInput(): void
    {
        if (!this._mounted) return;
        if (this._hexInput !== undefined) this._hexInput.Text = this.ColorHex;
    }

    private pushAllToPopup(): void
    {
        this.pushChannelsToSliders();
        this.pushHexToInput();
    }

    // Initial seed — called from the ctor BEFORE the popup template is
    // mounted, so we mirror the starting Color value across the derived
    // DPs without going through the property-change handlers (which
    // bail on _syncing).
    private syncFromColor(): void
    {
        const c = this.Color;
        const hsv = rgbToHsv(c.R, c.G, c.B);
        this._syncing = true;
        try {
            this.Hue        = hsv.h;
            this.Saturation = hsv.s;
            this.Brightness = hsv.v;
            this.Red        = c.R;
            this.Green      = c.G;
            this.Blue       = c.B;
            this.Alpha      = c.A;
            this.ColorHex   = c.ToHex();
            this.set_property_value(ColorPicker.SwatchBrushKey, new SolidColorBrush(c));
        } finally { this._syncing = false; }
    }

    private mountPopup(): void
    {
        if (this._mounted) return;
        const t = targetOf(this);
        if (t === undefined) return;
        const tpl = this.PopupTemplate;
        if (tpl === undefined) return;

        const inst = tpl.Apply(this);
        const host = inst.root as MenuPopupHost;
        const scrim = host.FindName('PART_Scrim') as ClickAwayScrim | undefined;
        const palette = host.FindName('PART_PaletteContainer') as WrapPanel | undefined;
        if (palette !== undefined) this.populatePalette(palette);
        if (scrim !== undefined) scrim.onClick = (): void => { this.IsDropDownOpen = false; };

        host.anchor     = this._trigger ?? this;
        host.anchorSide = 'below';
        const body = host.FindName('PART_PopupBody') as Visual | undefined;
        if (body !== undefined) host.popup = body;

        this._popupHost = host;
        this._mounted = true;
        this.adoptPopupEditParts(host);
        this.AttachOverlayChild(host);
    }

    // Bind the popup's edit parts in both directions. mountPopup sets
    // _mounted BEFORE this runs so the initial seed writes (which fire
    // the slider / textbox listeners) bail through the _syncing guard
    // without ricocheting back into the picker.
    private adoptPopupEditParts(host: MenuPopupHost): void
    {
        // Variant-specific sliders. The HSV template names them PART_H /
        // PART_S / PART_V; the RGB template names them PART_R / PART_G /
        // PART_B / PART_A. Whichever set the active template carries
        // resolves; the other set stays undefined.
        this._hSlider    = host.FindName('PART_HSlider')    as Slider  | undefined;
        this._sSlider    = host.FindName('PART_SSlider')    as Slider  | undefined;
        this._vSlider    = host.FindName('PART_VSlider')    as Slider  | undefined;
        this._rSlider    = host.FindName('PART_RSlider')    as Slider  | undefined;
        this._gSlider    = host.FindName('PART_GSlider')    as Slider  | undefined;
        this._blueSlider = host.FindName('PART_BSlider')    as Slider  | undefined;
        this._aSlider    = host.FindName('PART_ASlider')    as Slider  | undefined;
        this._hexInput   = host.FindName('PART_HexInput')   as TextBox | undefined;

        // Seed initial values — guarded so the resulting Value-change
        // listeners (we add right after) don't re-write the same value
        // back into the picker DPs during mount.
        this._syncing = true;
        try {
            if (this._hSlider    !== undefined) this._hSlider.Value    = this.Hue;
            if (this._sSlider    !== undefined) this._sSlider.Value    = this.Saturation;
            if (this._vSlider    !== undefined) this._vSlider.Value    = this.Brightness;
            if (this._rSlider    !== undefined) this._rSlider.Value    = this.Red;
            if (this._gSlider    !== undefined) this._gSlider.Value    = this.Green;
            if (this._blueSlider !== undefined) this._blueSlider.Value = this.Blue;
            if (this._aSlider    !== undefined) this._aSlider.Value    = this.Alpha;
            if (this._hexInput   !== undefined) this._hexInput.Text    = this.ColorHex;
        } finally { this._syncing = false; }

        const wire = (
            part:   Slider | TextBox | undefined,
            prop:   string,
            apply:  () => void,
        ): void => {
            if (part === undefined) return;
            const handler = (): void => {
                if (this._syncing) return;
                apply();
            };
            const key = resolveKey(part, undefined, prop);
            part.AddPropertyChangedListener(key, handler);
            this._popupListeners.push(() => {
                part.RemovePropertyChangedListener(key, handler);
            });
        };

        wire(this._hSlider,    'Value', () => { this.Hue        = this._hSlider!.Value; });
        wire(this._sSlider,    'Value', () => { this.Saturation = this._sSlider!.Value; });
        wire(this._vSlider,    'Value', () => { this.Brightness = this._vSlider!.Value; });
        wire(this._rSlider,    'Value', () => { this.Red        = this._rSlider!.Value; });
        wire(this._gSlider,    'Value', () => { this.Green      = this._gSlider!.Value; });
        wire(this._blueSlider, 'Value', () => { this.Blue       = this._blueSlider!.Value; });
        wire(this._aSlider,    'Value', () => { this.Alpha      = this._aSlider!.Value; });
        wire(this._hexInput,   'Text',  () => { this.ColorHex   = this._hexInput!.Text; });

        // 2D gradient box + brightness rail — RGB variant only.
        this.adoptGradientBoxParts(host);
    }

    // Wire the Office-style 2D hue/saturation box and the vertical
    // brightness rail. Both are Canvas-rooted; the static rainbow + the
    // white desaturation overlay paint via Border.Background, and the
    // rail's gradient gets rebuilt whenever Hue or Saturation moves.
    private adoptGradientBoxParts(host: MenuPopupHost): void
    {
        this._hsBox        = host.FindName('PART_HsBox')        as Canvas | undefined;
        const hsBoxHue     = host.FindName('PART_HsBoxHue')     as Border | undefined;
        this._hsBoxOverlay = host.FindName('PART_HsBoxOverlay') as Border | undefined;
        this._hsBoxCursor  = host.FindName('PART_HsBoxCursor')  as Border | undefined;
        this._vRail        = host.FindName('PART_VRail')        as Canvas | undefined;
        this._vRailFill    = host.FindName('PART_VRailFill')    as Border | undefined;
        this._vRailCursor  = host.FindName('PART_VRailCursor')  as Border | undefined;

        if (hsBoxHue !== undefined)        hsBoxHue.Background        = buildHueRainbowBrush();
        if (this._hsBoxOverlay !== undefined) this._hsBoxOverlay.Background = buildWhiteOverlayBrush();

        this.refreshGradientBox();
        this.wireGradientBoxPointer();
        this.wireBrightnessRailPointer();
    }

    private wireGradientBoxPointer(): void
    {
        const box = this._hsBox;
        if (box === undefined) return;
        const onMove = (args: PointerEventArgs, dragging: boolean): void => {
            if (!dragging) return;
            const origin = hostOriginOf(box);
            const w = box.ArrangedRect.Width;
            const h = box.ArrangedRect.Height;
            if (w <= 0 || h <= 0) return;
            const u = clamp01((args.HostX - origin.x) / w);
            const v = clamp01((args.HostY - origin.y) / h);
            this.applyHueSat(u * 360, (1 - v) * 100);
        };
        let dragging = false;
        const onDown = (args: PointerEventArgs): void => {
            dragging = true;
            args.CapturePointer(box);
            onMove(args, true);
            args.Handled = true;
        };
        const onMovePointer = (args: PointerEventArgs): void => { onMove(args, dragging); };
        const onUp = (args: PointerEventArgs): void => {
            if (!dragging) return;
            dragging = false;
            args.ReleasePointerCapture();
            args.Handled = true;
        };
        box.AddRoutedEventListener('PointerDown', onDown as (a: unknown) => void);
        box.AddRoutedEventListener('PointerMove', onMovePointer as (a: unknown) => void);
        box.AddRoutedEventListener('PointerUp',   onUp as (a: unknown) => void);
        this._popupListeners.push(() => {
            box.RemoveRoutedEventListener('PointerDown', onDown as (a: unknown) => void);
            box.RemoveRoutedEventListener('PointerMove', onMovePointer as (a: unknown) => void);
            box.RemoveRoutedEventListener('PointerUp',   onUp as (a: unknown) => void);
        });
    }

    private wireBrightnessRailPointer(): void
    {
        const rail = this._vRail;
        if (rail === undefined) return;
        let dragging = false;
        const apply = (args: PointerEventArgs): void => {
            const origin = hostOriginOf(rail);
            const h = rail.ArrangedRect.Height;
            if (h <= 0) return;
            const v = clamp01((args.HostY - origin.y) / h);
            this.Brightness = (1 - v) * 100;
        };
        const onDown = (args: PointerEventArgs): void => {
            dragging = true;
            args.CapturePointer(rail);
            apply(args);
            args.Handled = true;
        };
        const onMove = (args: PointerEventArgs): void => { if (dragging) apply(args); };
        const onUp = (args: PointerEventArgs): void => {
            if (!dragging) return;
            dragging = false;
            args.ReleasePointerCapture();
            args.Handled = true;
        };
        rail.AddRoutedEventListener('PointerDown', onDown as (a: unknown) => void);
        rail.AddRoutedEventListener('PointerMove', onMove as (a: unknown) => void);
        rail.AddRoutedEventListener('PointerUp',   onUp as (a: unknown) => void);
        this._popupListeners.push(() => {
            rail.RemoveRoutedEventListener('PointerDown', onDown as (a: unknown) => void);
            rail.RemoveRoutedEventListener('PointerMove', onMove as (a: unknown) => void);
            rail.RemoveRoutedEventListener('PointerUp',   onUp as (a: unknown) => void);
        });
    }

    // Batched H/S write — bypasses the per-DP cascade so onHsvChanged
    // only runs once for a single pointer move.
    private applyHueSat(h: number, s: number): void
    {
        if (this._syncing) return;
        this._syncing = true;
        try {
            this.Hue        = h;
            this.Saturation = s;
        } finally { this._syncing = false; }
        this.onHsvChanged();
    }

    // Reposition cursors + rebuild the rail's vertical gradient. Called
    // whenever Hue / Saturation / Brightness move, regardless of source.
    private refreshGradientBox(): void
    {
        if (!this._mounted) return;
        if (this._hsBox !== undefined && this._hsBoxCursor !== undefined)
        {
            const w = this._hsBox.Width  ?? 220;
            const h = this._hsBox.Height ?? 140;
            const cw = this._hsBoxCursor.Width  ?? 12;
            const ch = this._hsBoxCursor.Height ?? 12;
            Canvas.SetLeft(this._hsBoxCursor, (this.Hue / 360) * w - cw / 2);
            Canvas.SetTop( this._hsBoxCursor, ((100 - this.Saturation) / 100) * h - ch / 2);
        }
        if (this._vRail !== undefined && this._vRailCursor !== undefined)
        {
            const railW = this._vRail.Width  ?? 20;
            const railH = this._vRail.Height ?? 140;
            const cw    = this._vRailCursor.Width  ?? 26;
            const ch    = this._vRailCursor.Height ?? 4;
            Canvas.SetLeft(this._vRailCursor, (railW - cw) / 2);
            Canvas.SetTop( this._vRailCursor, ((100 - this.Brightness) / 100) * railH - ch / 2);
        }
        if (this._vRailFill !== undefined)
        {
            this._vRailFill.Background = buildRailBrush(this.Hue, this.Saturation);
        }
    }

    private unmountPopup(): void
    {
        if (!this._mounted) return;
        const root = this._popupHost;
        if (root !== undefined) this.DetachOverlayChild(root);
        for (const dispose of this._popupListeners) dispose();
        this._popupListeners = [];
        // Drop swatch click handlers so the next mount rebuilds fresh.
        for (const s of this._swatches)
        {
            (s as unknown as { onClick?: (() => void) | undefined }).onClick = undefined;
        }
        this._swatches      = [];
        this._hSlider       = undefined;
        this._sSlider       = undefined;
        this._vSlider       = undefined;
        this._rSlider       = undefined;
        this._gSlider       = undefined;
        this._blueSlider    = undefined;
        this._aSlider       = undefined;
        this._hexInput      = undefined;
        this._hsBox         = undefined;
        this._hsBoxOverlay  = undefined;
        this._hsBoxCursor   = undefined;
        this._vRail         = undefined;
        this._vRailFill     = undefined;
        this._vRailCursor   = undefined;
        this._popupHost     = undefined;
        this._mounted       = false;
    }

    private populatePalette(container: WrapPanel): void
    {
        // Clear any prior swatches (fresh build per mount).
        for (const child of [...container.visualChildren])
        {
            container.RemoveChild(child);
        }
        this._swatches = [];
        for (const hex of MATERIAL_PALETTE)
        {
            const swatch = new Border();
            swatch.Width  = 22;
            swatch.Height = 22;
            swatch.Margin = new Thickness(2);
            swatch.CornerRadius = 4;
            swatch.Background = new SolidColorBrush(Color.FromHex(hex));
            swatch.AddRoutedEventListener('PointerUp', (() => {
                this.Color = Color.FromHex(hex);
            }) as (a: unknown) => void);
            container.AddChild(swatch);
            this._swatches.push(swatch);
        }
    }
}

function targetOf(host: Visual): PresentationTarget | undefined
{
    const back = host as unknown as { ['target']?: PresentationTarget };
    return back['target'];
}

function clamp01(v: number): number
{
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Walk up the visual chain summing each ancestor's ArrangedRect origin
// to translate a Visual's local coordinate frame to host space — the
// same pattern Slider.primaryOrigin uses.
function hostOriginOf(visual: Visual): { x: number; y: number }
{
    let x = 0;
    let y = 0;
    let cur: Visual | undefined = visual;
    while (cur !== undefined)
    {
        x += cur.ArrangedRect.X;
        y += cur.ArrangedRect.Y;
        cur = cur.GetVisualParent();
    }
    return { x, y };
}

// Horizontal rainbow at full saturation + value — the bottom layer of
// the 2D HS box. Six hue stops + a closing red so the gradient wraps
// without a banding break.
function buildHueRainbowBrush(): LinearGradientBrush
{
    const brush = new LinearGradientBrush([
        new GradientStop(new Color(255, 0,   0),   0    ),
        new GradientStop(new Color(255, 255, 0),   1 / 6),
        new GradientStop(new Color(0,   255, 0),   2 / 6),
        new GradientStop(new Color(0,   255, 255), 3 / 6),
        new GradientStop(new Color(0,   0,   255), 4 / 6),
        new GradientStop(new Color(255, 0,   255), 5 / 6),
        new GradientStop(new Color(255, 0,   0),   1    ),
    ]);
    brush.StartPoint = new Point(0, 0);
    brush.EndPoint   = new Point(1, 0);
    return brush;
}

// Vertical transparent-to-white overlay — sits over the rainbow brush
// to desaturate toward the bottom of the box, so Y=0 reads as the pure
// hue and Y=max reads as white. Office-classic colour-dialog feel.
function buildWhiteOverlayBrush(): LinearGradientBrush
{
    const brush = new LinearGradientBrush([
        new GradientStop(new Color(255, 255, 255, 0  ), 0),
        new GradientStop(new Color(255, 255, 255, 255), 1),
    ]);
    brush.StartPoint = new Point(0, 0);
    brush.EndPoint   = new Point(0, 1);
    return brush;
}

// Vertical gradient for the brightness rail: top stop is the picker's
// current (H, S) at V=100; bottom stop is black. As the user drags H/S
// the rail's top stop re-tints to track the chosen hue.
function buildRailBrush(hue: number, saturation: number): LinearGradientBrush
{
    const top = hsvToRgb(hue, saturation, 100);
    const brush = new LinearGradientBrush([
        new GradientStop(new Color(top.r, top.g, top.b), 0),
        new GradientStop(new Color(0,     0,     0    ), 1),
    ]);
    brush.StartPoint = new Point(0, 0);
    brush.EndPoint   = new Point(0, 1);
    return brush;
}
