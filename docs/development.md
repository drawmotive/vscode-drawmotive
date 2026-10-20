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

### Remote Tunnels transport

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

The locked registry dependency `@drawmotive/editor@0.3.0` includes the
`frameDocument` option and updated embedded runtime. Regular builds now bundle
the corrected runtime. The stable `0.3.0` VSIX was verified against its exact
retained bytes in the Linux VS Code host. The earlier manual vscode.dev
validation described above applies to the regression candidate; it is not a
separate manual certification of every published release.

Release scripts enforce `.release/target.json`; the extension and bundled
Editor SDK now share the published stable `0.3.0` identity.

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
Previews are distributed only through GitHub Releases with numeric `vX.Y.Z` tags.
The manual pre-release workflow verifies the retained archive and matching
receipt; it does not publish to Marketplace. Stable releases use Marketplace.
See [RELEASE.md](../RELEASE.md) for version mapping, publication, and VSIX installation.

## Regenerate the introduction example

From the parent workspace, run these operations serially:

```bash
npm run component -- vscode-editor examples:render
npm run component -- vscode-editor examples:capture
npm run docs:previews -- sync
npm run docs:previews -- check
```

Rendering uses the locked public Editor, exports the plain and editable PNGs,
and verifies identical rendering after reopening the editable PNG. The adjacent
render record binds both PNGs to the source and locked Editor version; capture
rejects stale source or PNG bytes before opening the document. Rendering does not
produce a screenshot. Capture installs an isolated VSIX through the existing
host launcher, opens the canonical editable PNG, and captures the actual VS Code
workbench with title bar, activity bar, sidebar, tabs and status bar visible.
The isolated capture profile selects DrawMotive for editable PNGs and seeds
1600 × 1200 window bounds, preventing first-open prompts from covering the canvas.
It records the host version, image dimensions and source/pixel hashes next to
the image. Inspect the full screenshot before accepting it.

Capture requires desktop VS Code 1.101.0 (downloaded by default), Playwright,
and a desktop display or Linux Xvfb. Set VSCODE_EXECUTABLE to an existing desktop
executable for offline use; VSCODE_VERSION selects the download version.
If a long download is interrupted, the parent operation
`npm run docs:capture -- vscode:prepare` resumes the pinned Linux x64 archive
and verifies Microsoft's SHA-256 before extraction. Set VSCODE_EXECUTABLE to
the printed path for the capture operation.
Profiles and workspaces are isolated; Linux captures always use a fresh Xvfb
display with abstract sockets and no TCP listener. Missing prerequisites fail explicitly;
never replace the workbench with a browser harness.
