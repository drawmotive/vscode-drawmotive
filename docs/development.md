# Development and verification

New releases use one numeric version for the Editor package and VSIX. Patch `0` is stable; patches `1` through `9` are GitHub previews tagged `vX.Y.Z`. The packaging command sets preview metadata for every preview patch. Historical suffixed tags and VSIX versions remain available for receipt verification.

## Supported environments

| Layer | Supported environment | Verification boundary |
| --- | --- | --- |
| Contributor build and VSIX packaging | Node.js 22; npm 10 on Linux, Windows and macOS | CI targets all three systems with Node 22 |
| Installed editor | VS Code 1.95+ desktop on Linux, Windows or macOS | VS Code supplies the Extension Host and Chromium webview; a separate Node/npm install is not required |
| Browser integration tests | Chromium harness using the packaged editor | This does not certify real VS Code hosts, remote tunnels, Firefox or WebKit |
| Delivery | VSIX with the locked public editor runtime | This repository is not an npm product |

The 2026-10-01 standalone audit ran Linux Node 22.23.2/npm 10.9.8 unit tests
and compilation. Candidate integration tests also passed in the actual Linux
VS Code 1.101.0 Extension Host with Node 22.15.1. The Remote Tunnels regression
candidate passed Chromium integration tests, an OpenVSCode Server 1.109.5 browser
workbench check, and manual validation in vscode.dev through Remote Tunnels on
2026-10-13. Windows/macOS, Firefox and WebKit still require verification.

## Build and package

Supports Node.js 22 with npm 10. Install the published editor and build the extension:

```bash
npm ci
npm test
npm run build
npm run lint
npm run vsce:package
npx playwright install chromium
npm run test:browser
```

The exact `@drawmotive/editor` version and npm registry integrity are locked in
`package-lock.json`. Each compile verifies and stages the package runtime under
ignored `dist/editor/`; the VSIX includes those assets for offline editing. No
.NET build or private editor checkout is required. Upgrade the dependency and
lockfile together, then compile again.

Before registry publication, test an explicitly selected protocol-v2 Editor
package directory or retained npm archive without changing installed packages
or the release lockfile:

```bash
npm run test:browser:candidate -- /absolute/path/to/editor-package
npm run test:browser:candidate -- /absolute/path/to/drawmotive-editor.tgz
```

This verifies the candidate manifest and runtime hashes, stages temporary SDK
and runtime assets, compiles TypeScript, and runs the browser harness serially.
It does not establish registry dependency or release readiness. Normal builds
continue to consume the exact installed registry version.

Press F5 to launch the extension. Use **Save diagram** in the editor toolbar to write
the PNG preview and editable document back to the `.draw.png` file. The extension
loads the public SDK directly from webview assets and serves its packaged WASM
runtime on a temporary loopback port in desktop VS Code; VS Code resolves that
URL for remote extension hosts. Browser workbenches load the packaged runtime
through authenticated VS Code webview resources instead. PNG encoding and
embedded document validation belong to that
runtime. A successful file write confirms only the exported revision, so edits
made during saving remain unsaved. External file changes request reload approval
when the editor has unsaved changes. New drawings are exported by a temporary
runtime before their file is created. Linux desktop candidate tests cover this
workflow; Windows/macOS still require verification.

### Remote Tunnels regression candidate

Version 0.2.1 loaded its packaged WASM through `asWebviewUri`, which uses the
authenticated VS Code resource service. The SDK migration replaced this with
an HTTP iframe served by the remote Extension Host. In vscode.dev, `asExternalUri`
can leave that loopback URL unchanged, so the browser attempts to connect to its
own `127.0.0.1` and reports a refused connection.

Browser hosts now choose the authenticated resource transport before creating
the runtime. The SDK first loads a same-origin controlled bootstrap document,
then writes the trusted packaged runtime HTML into it. This retains the VS Code
resource service worker. The embedded runtime keeps its navigation URL separate
from its asset URL because tunnel resource hostnames can contain `+`, which
.NET URI parsing rejects. Classic scripts use CORS mode to preserve the base URL
of their dynamic imports. Resources and document I/O remain inside VS Code; no
third-party runtime CDN is used.

The verified local candidate includes the SDK's new `frameDocument` option and
the updated embedded runtime. The locked registry dependency
`@drawmotive/editor@0.2.2-alpha.8` does not contain those changes. Regular builds
therefore do not yet produce the browser fix. Publish a new Editor version and
update the extension dependency, lockfile and release authority before releasing
the extension. Until then, use the explicit candidate commands above to test
the corrected runtime; the manual vscode.dev validation applies to that candidate.

Release scripts still enforce `.release/target.json`; the already-published
0.2.1 Marketplace version remains deferred until a future release is enrolled.

The local VSIX command above packages without publishing. `release:check`
and publish scripts retain eligibility checks. See
[Contributing](../CONTRIBUTING.md) and [NOTICE](../NOTICE) for the public build and
redistribution requirements.
Vulnerability reports follow [Security reporting](../SECURITY.md).

### Actual VS Code Host Tests

Test an explicitly selected Editor candidate in the actual VS Code workbench:

```bash
npm run test:host:candidate -- /absolute/path/to/editor-package
npm run test:host:candidate -- /absolute/path/to/drawmotive-editor.tgz
```

The command builds and installs an isolated candidate VSIX, then verifies file
associations, creation, editing, saving, reopening, and external-file reload
confirmation in real webviews. Ordinary PNG files must open in the built-in
image editor without activating DrawMotive; `.draw.png` files must select
DrawMotive automatically.

A zero-byte `.draw.png` file opens as a blank editable canvas. Opening it does
not write the file; **Save diagram** writes a complete PNG containing the editable
document. The editor fills the webview without outer padding or a normal status
bar. File and PNG load errors appear in red above the editor until a successful load.

Tests download VS Code 1.101.0 by default. Set `VSCODE_VERSION` to test another
version. Linux uses `xvfb-run` when `DISPLAY` is unset. Results and screenshots
remain in the temporary directory printed by the command. This does not publish
the extension or change the regular `dist/` directory, locked Editor dependency,
or sealed npm archives.

For a release, build and package once, then test the exact retained archive:

```bash
npm run test:host:vsix -- /absolute/path/to/vscode-drawmotive.vsix
```

This mode verifies the archive against the installed SDK and authored webview,
then installs those same bytes. The printed evidence includes its SHA-256 hash.
Previews are distributed only through GitHub Releases with `vX.Y.Z-pre.N` tags.
The manual pre-release workflow verifies the retained archive and matching
receipt; it does not publish to Marketplace. Stable releases use Marketplace.
See [RELEASE.md](../RELEASE.md) for version mapping, publication, and VSIX installation.

## Regenerate the introduction example

After `npm ci`, run `npm run examples:render` from this package. In the parent
DrawMotive workspace, use `npm run component -- vscode-editor examples:render`.
Playwright's Chromium must be installed, as for the browser integration tests.

The command reads `examples/online-order.textgraph` and uses the locked public
Editor package to produce the editable `examples/online-order.draw.png`, the
plain diagram preview, and a screenshot of the actual editing canvas under
`docs/images/`. It reopens the editable PNG and checks that its rendered diagram
survives before writing the assets. A fresh editor loads the downloadable PNG
before the canvas screenshot is captured. Keep the README's copyable source and
playground link in sync when changing the example.
