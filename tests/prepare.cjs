/**
 * Marks the compiled test output as CommonJS so Node does not treat the
 * emitted .js files as ESM (the repository's package.json has "type": "module").
 */
'use strict';
require('fs').writeFileSync('.testbuild/package.json', '{"type":"commonjs"}\n');
