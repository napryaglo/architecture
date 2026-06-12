import { KeyGesture, RoutedCommand } from './routed-command.js';
import type { ModifierKeys } from '../../runtime/input/routed-event.js';

// Named-command libraries — the standard catalogue of WPF-equivalent
// RoutedCommand singletons. These are IDENTITY ONLY: each command is
// just a Name + an OwnerType + advisory InputGestures. Behaviour lives
// in whatever CommandBinding catches the routed dispatch — controls
// (TextBox for editing commands), apps (Window-level Save handler),
// or VMs via the relay sugar (CommandBinding.Relay(cmd, vm.Save)).
//
// The InputGestures listed here are the canonical defaults — menu /
// toolbar / ribbon chrome reads `InputGestures[0]?.DisplayString` to
// render "Ctrl+S" next to the command label. They do NOT auto-install
// as keybindings; an author who wants Ctrl+S to fire ApplicationCommands.Save
// declares `KeyBinding[Key=S, Modifiers=Control, Command=ApplicationCommands.Save]`
// in their root Visual's InputBindings, or registers the binding at
// the control-class level via CommandManager.RegisterClassInputBinding.

function mod(m: Partial<ModifierKeys>): ModifierKeys
{
    return {
        Shift:   m.Shift   ?? false,
        Control: m.Control ?? false,
        Alt:     m.Alt     ?? false,
        Meta:    m.Meta    ?? false,
    };
}

// ── ApplicationCommands ────────────────────────────────────────────
//
// File-level + clipboard + edit commands shared across the whole app.
// Names match WPF.
export class ApplicationCommands
{
    public static readonly New        = new RoutedCommand('New',        ApplicationCommands, [new KeyGesture('N', mod({ Control: true }))]);
    public static readonly Open       = new RoutedCommand('Open',       ApplicationCommands, [new KeyGesture('O', mod({ Control: true }))]);
    public static readonly Save       = new RoutedCommand('Save',       ApplicationCommands, [new KeyGesture('S', mod({ Control: true }))]);
    public static readonly SaveAs     = new RoutedCommand('SaveAs',     ApplicationCommands, [new KeyGesture('S', mod({ Control: true, Shift: true }))]);
    public static readonly Close      = new RoutedCommand('Close',      ApplicationCommands, [new KeyGesture('F4', mod({ Control: true }))]);
    public static readonly Print      = new RoutedCommand('Print',      ApplicationCommands, [new KeyGesture('P', mod({ Control: true }))]);
    public static readonly PrintPreview = new RoutedCommand('PrintPreview', ApplicationCommands, [new KeyGesture('F2', mod({ Control: true }))]);

    public static readonly Undo       = new RoutedCommand('Undo',       ApplicationCommands, [new KeyGesture('Z', mod({ Control: true }))]);
    public static readonly Redo       = new RoutedCommand('Redo',       ApplicationCommands, [new KeyGesture('Y', mod({ Control: true }))]);

    public static readonly Cut        = new RoutedCommand('Cut',        ApplicationCommands, [new KeyGesture('X', mod({ Control: true }))]);
    public static readonly Copy       = new RoutedCommand('Copy',       ApplicationCommands, [new KeyGesture('C', mod({ Control: true }))]);
    public static readonly Paste      = new RoutedCommand('Paste',      ApplicationCommands, [new KeyGesture('V', mod({ Control: true }))]);
    public static readonly Delete     = new RoutedCommand('Delete',     ApplicationCommands, [new KeyGesture('Delete', mod({}))]);

    public static readonly Find       = new RoutedCommand('Find',       ApplicationCommands, [new KeyGesture('F', mod({ Control: true }))]);
    public static readonly Replace    = new RoutedCommand('Replace',    ApplicationCommands, [new KeyGesture('H', mod({ Control: true }))]);
    public static readonly SelectAll  = new RoutedCommand('SelectAll',  ApplicationCommands, [new KeyGesture('A', mod({ Control: true }))]);

    public static readonly Help       = new RoutedCommand('Help',       ApplicationCommands, [new KeyGesture('F1', mod({}))]);
    public static readonly Properties = new RoutedCommand('Properties', ApplicationCommands, [new KeyGesture('F4', mod({}))]);
    public static readonly Stop       = new RoutedCommand('Stop',       ApplicationCommands);
    public static readonly ContextMenu = new RoutedCommand('ContextMenu', ApplicationCommands, [new KeyGesture('F10', mod({ Shift: true }))]);
    public static readonly CorrectionList = new RoutedCommand('CorrectionList', ApplicationCommands);
    public static readonly NotACommand   = new RoutedCommand('NotACommand', ApplicationCommands);
}

// ── EditingCommands ────────────────────────────────────────────────
//
// Text-edit-specific commands — what TextBox-level controls handle.
// Less app-level, more "the current text input owns these". Subset of
// WPF's catalogue (the full list spans paragraph / list / font
// formatting too; mural's TextBox is plain-text only, so font /
// paragraph commands stay listed but unwired).
export class EditingCommands
{
    public static readonly Delete          = new RoutedCommand('Delete',          EditingCommands, [new KeyGesture('Delete',    mod({}))]);
    public static readonly Backspace       = new RoutedCommand('Backspace',       EditingCommands, [new KeyGesture('Backspace', mod({}))]);
    public static readonly DeleteNextWord  = new RoutedCommand('DeleteNextWord',  EditingCommands, [new KeyGesture('Delete',    mod({ Control: true }))]);
    public static readonly DeletePreviousWord = new RoutedCommand('DeletePreviousWord', EditingCommands, [new KeyGesture('Backspace', mod({ Control: true }))]);

    public static readonly EnterParagraphBreak = new RoutedCommand('EnterParagraphBreak', EditingCommands, [new KeyGesture('Enter', mod({}))]);
    public static readonly EnterLineBreak      = new RoutedCommand('EnterLineBreak',      EditingCommands, [new KeyGesture('Enter', mod({ Shift: true }))]);
    public static readonly TabForward          = new RoutedCommand('TabForward',          EditingCommands, [new KeyGesture('Tab',   mod({}))]);
    public static readonly TabBackward         = new RoutedCommand('TabBackward',         EditingCommands, [new KeyGesture('Tab',   mod({ Shift: true }))]);

    public static readonly MoveLeftByCharacter  = new RoutedCommand('MoveLeftByCharacter',  EditingCommands, [new KeyGesture('ArrowLeft',  mod({}))]);
    public static readonly MoveRightByCharacter = new RoutedCommand('MoveRightByCharacter', EditingCommands, [new KeyGesture('ArrowRight', mod({}))]);
    public static readonly MoveUpByLine         = new RoutedCommand('MoveUpByLine',         EditingCommands, [new KeyGesture('ArrowUp',    mod({}))]);
    public static readonly MoveDownByLine       = new RoutedCommand('MoveDownByLine',       EditingCommands, [new KeyGesture('ArrowDown',  mod({}))]);
    public static readonly MoveLeftByWord       = new RoutedCommand('MoveLeftByWord',       EditingCommands, [new KeyGesture('ArrowLeft',  mod({ Control: true }))]);
    public static readonly MoveRightByWord      = new RoutedCommand('MoveRightByWord',      EditingCommands, [new KeyGesture('ArrowRight', mod({ Control: true }))]);

    public static readonly MoveToLineStart      = new RoutedCommand('MoveToLineStart',      EditingCommands, [new KeyGesture('Home', mod({}))]);
    public static readonly MoveToLineEnd        = new RoutedCommand('MoveToLineEnd',        EditingCommands, [new KeyGesture('End',  mod({}))]);
    public static readonly MoveToDocumentStart  = new RoutedCommand('MoveToDocumentStart',  EditingCommands, [new KeyGesture('Home', mod({ Control: true }))]);
    public static readonly MoveToDocumentEnd    = new RoutedCommand('MoveToDocumentEnd',    EditingCommands, [new KeyGesture('End',  mod({ Control: true }))]);

    public static readonly SelectLeftByCharacter  = new RoutedCommand('SelectLeftByCharacter',  EditingCommands, [new KeyGesture('ArrowLeft',  mod({ Shift: true }))]);
    public static readonly SelectRightByCharacter = new RoutedCommand('SelectRightByCharacter', EditingCommands, [new KeyGesture('ArrowRight', mod({ Shift: true }))]);
    public static readonly SelectUpByLine         = new RoutedCommand('SelectUpByLine',         EditingCommands, [new KeyGesture('ArrowUp',    mod({ Shift: true }))]);
    public static readonly SelectDownByLine       = new RoutedCommand('SelectDownByLine',       EditingCommands, [new KeyGesture('ArrowDown',  mod({ Shift: true }))]);
    public static readonly SelectLeftByWord       = new RoutedCommand('SelectLeftByWord',       EditingCommands, [new KeyGesture('ArrowLeft',  mod({ Control: true, Shift: true }))]);
    public static readonly SelectRightByWord      = new RoutedCommand('SelectRightByWord',      EditingCommands, [new KeyGesture('ArrowRight', mod({ Control: true, Shift: true }))]);
    public static readonly SelectToLineStart      = new RoutedCommand('SelectToLineStart',      EditingCommands, [new KeyGesture('Home',       mod({ Shift: true }))]);
    public static readonly SelectToLineEnd        = new RoutedCommand('SelectToLineEnd',        EditingCommands, [new KeyGesture('End',        mod({ Shift: true }))]);
}

// ── NavigationCommands ────────────────────────────────────────────
//
// Subset of WPF's NavigationCommands — the items that have an obvious
// analogue in a browser-hosted app. Pure-WPF concepts (NavigateJournal,
// GoToPage, IncreaseZoom) ship as identities; consumers wire whatever
// behaviour fits their navigation model.
export class NavigationCommands
{
    public static readonly BrowseBack    = new RoutedCommand('BrowseBack',    NavigationCommands, [new KeyGesture('ArrowLeft',  mod({ Alt: true }))]);
    public static readonly BrowseForward = new RoutedCommand('BrowseForward', NavigationCommands, [new KeyGesture('ArrowRight', mod({ Alt: true }))]);
    public static readonly BrowseHome    = new RoutedCommand('BrowseHome',    NavigationCommands, [new KeyGesture('Home',       mod({ Alt: true }))]);
    public static readonly BrowseStop    = new RoutedCommand('BrowseStop',    NavigationCommands, [new KeyGesture('Escape',     mod({}))]);
    public static readonly Refresh       = new RoutedCommand('Refresh',       NavigationCommands, [new KeyGesture('F5',         mod({}))]);
    public static readonly Favorites     = new RoutedCommand('Favorites',     NavigationCommands, [new KeyGesture('I',          mod({ Control: true }))]);
    public static readonly Search        = new RoutedCommand('Search',        NavigationCommands, [new KeyGesture('E',          mod({ Control: true }))]);

    public static readonly NextPage      = new RoutedCommand('NextPage',      NavigationCommands);
    public static readonly PreviousPage  = new RoutedCommand('PreviousPage',  NavigationCommands);
    public static readonly FirstPage     = new RoutedCommand('FirstPage',     NavigationCommands);
    public static readonly LastPage      = new RoutedCommand('LastPage',      NavigationCommands);
    public static readonly GoToPage      = new RoutedCommand('GoToPage',      NavigationCommands);
    public static readonly Zoom          = new RoutedCommand('Zoom',          NavigationCommands);
    public static readonly IncreaseZoom  = new RoutedCommand('IncreaseZoom',  NavigationCommands, [new KeyGesture('+', mod({ Control: true }))]);
    public static readonly DecreaseZoom  = new RoutedCommand('DecreaseZoom',  NavigationCommands, [new KeyGesture('-', mod({ Control: true }))]);
}

// ── MediaCommands ──────────────────────────────────────────────────
//
// Audio / video transport commands. Match WPF's MediaCommands wholesale
// — gestures track the hardware media keys where modern browsers
// surface them.
export class MediaCommands
{
    public static readonly Play          = new RoutedCommand('Play',          MediaCommands);
    public static readonly Pause         = new RoutedCommand('Pause',         MediaCommands);
    public static readonly Stop          = new RoutedCommand('Stop',          MediaCommands);
    public static readonly TogglePlayPause = new RoutedCommand('TogglePlayPause', MediaCommands);
    public static readonly Record        = new RoutedCommand('Record',        MediaCommands);
    public static readonly Rewind        = new RoutedCommand('Rewind',        MediaCommands);
    public static readonly FastForward   = new RoutedCommand('FastForward',   MediaCommands);
    public static readonly NextTrack     = new RoutedCommand('NextTrack',     MediaCommands);
    public static readonly PreviousTrack = new RoutedCommand('PreviousTrack', MediaCommands);

    public static readonly MuteVolume      = new RoutedCommand('MuteVolume',      MediaCommands);
    public static readonly IncreaseVolume  = new RoutedCommand('IncreaseVolume',  MediaCommands);
    public static readonly DecreaseVolume  = new RoutedCommand('DecreaseVolume',  MediaCommands);

    public static readonly Select          = new RoutedCommand('Select',          MediaCommands);
    public static readonly ChannelUp       = new RoutedCommand('ChannelUp',       MediaCommands);
    public static readonly ChannelDown     = new RoutedCommand('ChannelDown',     MediaCommands);
    public static readonly BoostBass       = new RoutedCommand('BoostBass',       MediaCommands);
    public static readonly IncreaseBass    = new RoutedCommand('IncreaseBass',    MediaCommands);
    public static readonly DecreaseBass    = new RoutedCommand('DecreaseBass',    MediaCommands);
    public static readonly IncreaseTreble  = new RoutedCommand('IncreaseTreble',  MediaCommands);
    public static readonly DecreaseTreble  = new RoutedCommand('DecreaseTreble',  MediaCommands);
}
