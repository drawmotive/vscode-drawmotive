# Contributing to the DrawMotive VS Code Editor

Report bugs and proposals in the
[issue tracker](https://github.com/drawmotive/vscode-drawmotive/issues). Include
the extension/VS Code version, OS, expected behavior and a small diagram or
reproduction sequence.

Contributor builds support Node.js 22 and its bundled npm on Linux, Windows
and macOS. Installed users use VS Code's own host and webview. See the
[support matrix](README.md) for browser and host verification limits.

From a standalone public checkout:

```bash
npm ci
npm test
npm run build
npm run lint
npm run vsce:package
```

The deliverable is a local VSIX, not an npm package. Its Editor runtime comes
from the exact public registry package in `package-lock.json`; no private
checkout, .NET build or credentials are needed. Packaging does not publish.
`release:check` and publish scripts retain coordinated eligibility checks.

For integration changes, run:

```bash
npx playwright install chromium
npm run test:browser
```

This Chromium harness is useful for packaged assets and saving behavior;
it does not replace manual tests in real VS Code hosts. Press F5 to launch
the extension, create/open a `.draw.png`, save it, reopen it and check that
the preview and editable document survive. Record the host/OS tested. Remote
tunnels and browser-only hosts need separate verification.

Use `npm ci` with the committed public registry lock. Use `npm install` only
for intentional dependency changes and commit the matching lock. Preserve
runtime hashes and provenance; do not substitute local editor assets or
developer paths to bypass checks.

Keep `@types/node` on the supported Node 22 line and pin `@types/vscode` to the
minimum supported VS Code 1.95 API. TypeScript stays on 6.0 until the ESLint
parser supports 7; its current peer range ends below 6.1. The obsolete Yeoman
Mocha sample and Extension Test Runner dependencies are removed; meaningful
checks use the Node and Chromium suites above, with F5 for manual host checks.

Keep pull requests focused, include a regression for behavior fixes and report
the checks actually run. Review links and commands for documentation changes.
Preserve [LICENSE](LICENSE) and the bundled Editor, runtime and font terms
indexed in [NOTICE](NOTICE).
