// Browser-side shim for `import opentype from 'opentype.js'`.
//
// opentype.js's published ESM bundle (`dist/opentype.mjs`) exposes only
// named exports — no default. The mural runtime imports it as
// `import opentype from 'opentype.js'`, which Node's CJS interop
// handles by binding `module.exports` to the default. The browser's
// pure ESM loader doesn't synthesise a default, so the same import
// throws "does not provide an export named 'default'".
//
// This shim re-exports the .mjs namespace as a default, so the
// default-import form works in the browser too. The demo's import map
// remaps the bare specifier `opentype.js` to this file.
import * as ot from '../node_modules/opentype.js/dist/opentype.mjs';
export default ot;
