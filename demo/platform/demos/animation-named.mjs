// animation-named demo — Begin / Pause / Resume / Stop on named
// Storyboards, all declarative. Each button hosts its own "loop"
// storyboard registered under that name on the firing Visual; the
// Pause / Resume / Stop actions reference it by name later.
import { app } from '../../animation-named.mu.js';
import { register } from '../registry.mjs';

register({
    id:       'animation-named',
    group:    'Animation',
    title:    'Named storyboards',
    subtitle: '`BeginStoryboard[Name=loop]` + Pause / Resume / Stop on hover and click — markup-only.',
    factory:  () => app.Root,
});
