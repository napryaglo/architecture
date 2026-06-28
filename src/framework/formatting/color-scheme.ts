import { Color, SolidColorBrush } from '../../visual-engine/index.js';

// A named set of base colours that drives the ColorPicker's "Theme
// Colors" grid: each base colour becomes one column, and the picker
// generates the lighter (tint) and darker (shade) rows beneath it from
// the `Tints` / `Shades` amounts.
//
// Unlike the theme-token columns this replaced, a ColorScheme carries
// PREDEFINED colours — it doesn't track the active theme. It's a
// markup-authorable value object, so the canonical way to define one is a
// `.mu` resource (resource management is markup-only):
//
//     resources {
//         ColorScheme x:key="BrandColors" [
//             Name   = "Brand",
//             Colors = [#0F172A, #2563EB, #7C3AED, #DB2777, #059669, #EA580C]
//         ]
//     }
//     ColorPicker [ColorScheme=@BrandColors]
//
// `Colors` is a list of colour literals; the value pipeline produces them
// as SolidColorBrushes, which the `Colors` setter unwraps to `Color`s.
// `Tints` / `Shades` are blend amounts in 0..1 against white / black (the
// same scale the `<< Lighten/Darken` modifiers use): a tint of 0.8 is 80%
// toward white, a shade of 0.5 halfway to black. Order is top-to-bottom.
//
// The optional constructor form (`new ColorScheme({ colors, … })`) backs
// the built-in OFFICE_COLOR_SCHEMES below; markup construction goes
// through the no-arg ctor + property setters.
export interface ColorSchemeOptions
{
    name?:   string;
    colors:  readonly Color[];
    tints?:  readonly number[];
    shades?: readonly number[];
}

export class ColorScheme
{
    // Office's default tint/shade ladder: Lighter 80/60/40%, Darker 25/50%.
    public static readonly DEFAULT_TINTS:  readonly number[] = Object.freeze([0.8, 0.6, 0.4]);
    public static readonly DEFAULT_SHADES: readonly number[] = Object.freeze([0.25, 0.5]);

    /** Display name (markup `[Name="…"]`). */
    public Name: string = '';
    /** Blend amounts toward white, top-to-bottom (markup `[Tints=[…]]`). */
    public Tints:  readonly number[] = ColorScheme.DEFAULT_TINTS;
    /** Blend amounts toward black (markup `[Shades=[…]]`). */
    public Shades: readonly number[] = ColorScheme.DEFAULT_SHADES;

    private _colors: readonly Color[] = [];

    /** Base colours, one per column. Accepts `Color`s or `SolidColorBrush`es
     *  (a markup colour literal lowers to a brush) and stores `Color`s. */
    public get Colors(): readonly Color[] { return this._colors; }
    public set Colors(v: ReadonlyArray<Color | SolidColorBrush>)
    {
        this._colors = Object.freeze(
            v.map(c => c instanceof SolidColorBrush ? c.Color : c));
    }

    constructor(opts?: ColorSchemeOptions)
    {
        if (opts !== undefined)
        {
            this.Name   = opts.name ?? '';
            this.Colors = opts.colors;
            this.Tints  = opts.tints  ?? ColorScheme.DEFAULT_TINTS;
            this.Shades = opts.shades ?? ColorScheme.DEFAULT_SHADES;
        }
    }

    // The colour at column `col`, row `row` (row 0 = base, then one row per
    // tint, then one row per shade). Tints blend toward white, shades
    // toward black; both preserve the base alpha.
    public ColorAt(col: number, row: number): Color
    {
        const base = this._colors[col]!;
        if (row === 0) return base;
        const tintRow = row - 1;
        if (tintRow < this.Tints.length)
        {
            return Color.Lerp(base, Color.White, this.Tints[tintRow]!).WithAlpha(base.A);
        }
        const shadeRow = tintRow - this.Tints.length;
        return Color.Lerp(base, Color.Black, this.Shades[shadeRow]!).WithAlpha(base.A);
    }

    // Total rows in the grid: the base row plus one per tint and shade.
    public get RowCount(): number { return 1 + this.Tints.length + this.Shades.length; }

    // The current Microsoft Office (2023+) default theme palette. Columns
    // are in the order Office's colour menu shows them — Background 1,
    // Text 1, Background 2, Text 2, then Accents 1–6. Predefined; does not
    // track the app theme. See OFFICE_COLOR_SCHEMES for the full gallery.
    public static readonly Default: ColorScheme = new ColorScheme({
        name: 'Office',
        colors: ['FFFFFF', '000000', 'E8E8E8', '0E2841',
                 '156082', 'E97132', '196B24', '0F9ED5', 'A02B93', '4EA72E']
            .map(h => Color.FromHex('#' + h)),
    });
}

// Build a scheme from Office's stored clrScheme order
// [dk1, lt1, dk2, lt2, accent1..6] and reorder to the colour-menu display
// order [Background1(lt1), Text1(dk1), Background2(lt2), Text2(dk2),
// Accent1..6] — the column order the picker's Theme grid renders.
function officeScheme(name: string, raw: readonly string[]): ColorScheme
{
    const [dk1, lt1, dk2, lt2, ...accents] = raw;
    const display = [lt1!, dk1!, lt2!, dk2!, ...accents];
    return new ColorScheme({ name, colors: display.map(h => Color.FromHex('#' + h)) });
}

// The built-in Office theme-colour gallery (Design → Colors), in the same
// order Office lists them. Values are the authentic Office clrScheme hexes.
// Index 0 is ColorScheme.Default (the current "Office" palette).
export const OFFICE_COLOR_SCHEMES: readonly ColorScheme[] = Object.freeze([
    ColorScheme.Default,
    officeScheme('Office 2013 - 2022', ['000000', 'FFFFFF', '44546A', 'E7E6E6', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']),
    officeScheme('Office 2007 - 2010', ['000000', 'FFFFFF', '1F497D', 'EEECE1', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646']),
    officeScheme('Grayscale',          ['000000', 'FFFFFF', '000000', 'F8F8F8', 'DDDDDD', 'B2B2B2', '969696', '808080', '5F5F5F', '4D4D4D']),
    officeScheme('Blue Warm',          ['000000', 'FFFFFF', '242852', 'ACCBF9', '4A66AC', '629DD1', '297FD5', '7F8FA9', '5AA2AE', '9D90A0']),
    officeScheme('Blue',               ['000000', 'FFFFFF', '17406D', 'DBEFF9', '0F6FC6', '009DD9', '0BD0D9', '10CF9B', '7CCA62', 'A5C249']),
    officeScheme('Blue II',            ['000000', 'FFFFFF', '335B74', 'DFE3E5', '1CADE4', '2683C6', '27CED7', '42BA97', '3E8853', '62A39F']),
    officeScheme('Blue Green',         ['000000', 'FFFFFF', '373545', 'CEDBE6', '3494BA', '58B6C0', '75BDA7', '7A8C8E', '84ACB6', '2683C6']),
    officeScheme('Green',              ['000000', 'FFFFFF', '455F51', 'E3DED1', '549E39', '8AB833', 'C0CF3A', '029676', '4AB5C4', '0989B1']),
    officeScheme('Green Yellow',       ['000000', 'FFFFFF', '455F51', 'E2DFCC', '99CB38', '63A537', '37A76F', '44C1A3', '4EB3CF', '51C3F9']),
    officeScheme('Yellow',             ['000000', 'FFFFFF', '39302A', 'E5DEDB', 'FFCA08', 'F8931D', 'CE8D3E', 'EC7016', 'E64823', '9C6A6A']),
    officeScheme('Yellow Orange',      ['000000', 'FFFFFF', '4E3B30', 'FBEEC9', 'F0A22E', 'A5644E', 'B58B80', 'C3986D', 'A19574', 'C17529']),
    officeScheme('Orange',             ['000000', 'FFFFFF', '637052', 'CCDDEA', 'E48312', 'BD582C', '865640', '9B8357', 'C2BC80', '94A088']),
    officeScheme('Orange Red',         ['000000', 'FFFFFF', '696464', 'E9E5DC', 'D34817', '9B2D1F', 'A28E6A', '956251', '918485', '855D5D']),
    officeScheme('Red Orange',         ['000000', 'FFFFFF', '505046', 'EEECE1', 'E84C22', 'FFBD47', 'B64926', 'FF8427', 'CC9900', 'B22600']),
    officeScheme('Red',                ['000000', 'FFFFFF', '323232', 'E5C243', 'A5300F', 'D55816', 'E19825', 'B19C7D', '7F5F52', 'B27D49']),
    officeScheme('Red Violet',         ['000000', 'FFFFFF', '454551', 'D8D9DC', 'E32D91', 'C830CC', '4EA6DC', '4775E7', '8971E1', 'D54773']),
    officeScheme('Violet',             ['000000', 'FFFFFF', '373545', 'DCD8DC', 'AD84C6', '8784C7', '5D739A', '6997AF', '84ACB6', '6F8183']),
    officeScheme('Violet II',          ['000000', 'FFFFFF', '632E62', 'EAE5EB', '92278F', '9B57D3', '755DD9', '665EB8', '45A5ED', '5982DB']),
    officeScheme('Median',             ['000000', 'FFFFFF', '775F55', 'EBDDC3', '94B6D2', 'DD8047', 'A5AB81', 'D8B25C', '7BA79D', '968C8C']),
    officeScheme('Paper',              ['000000', 'FFFFFF', '444D26', 'FEFAC9', 'A5B592', 'F3A447', 'E7BC29', 'D092A7', '9C85C0', '809EC2']),
]);
