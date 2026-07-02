// project-explorer.module.mu — the Project Explorer module.
//
// A ShellModule: a capability provider added to the shell via a `.modules:`
// block on the Application. Its capability is one root-nav entry (Name) whose
// Panel is the left-panel view. Icons + lazy panels are deferred — see
// diagram.module.mu.

module ProjectExplorerModule [ Name = "Project Explorer" ] {
    Capability [ Name = "Project Explorer", Icon = @ProjectExplorer ] {
        StackPanel [ Orientation = Vertical, Margin = (12,12,12,12) ] {
            TextBlock [ Style = @TitleSmall, Text = "Project Explorer", Foreground = @OnSurface,        Margin = (0,0,0,8) ]
            TextBlock [ Style = @BodyMedium, Text = "Models",           Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Diagrams",         Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
            TextBlock [ Style = @BodyMedium, Text = "Resources",        Foreground = @OnSurfaceVariant, Margin = (0,3,0,3) ]
        }
    }
}
