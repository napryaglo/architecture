// technology-library.module.mu — the Technology Library module.
//
// A ShellModule: a capability provider added to the shell via a `.modules:`
// block on the Application. Its capability is one root-nav entry (Name) whose
// Panel is the left-panel view. Icons + lazy panels are deferred — see
// diagram.module.mu.

module TechnologyLibraryModule [ Name = "Technology Library" ] {
    Capability [ Name = "Technology Library", Icon = @TechnologyLibrary ] {
        StackPanel [ Orientation = Vertical, Margin = (12,12,12,12) ] {
            TextBlock [ Style = @TitleSmall, Text = "Technology Library", Foreground = @OnSurface,        Margin = (0,0,0,8) ]
            TextBlock [ Style = @BodyMedium, Text = "Nodes",              Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Devices",            Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "System Software",    Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
        }
    }
}
