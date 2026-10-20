# Release Process

DrawMotive previews are distributed only through GitHub Releases. Marketplace publication is reserved for stable releases. Preview publication never uses `VSCE_PAT`.

## Version authority

The root `release.json` owns release versions and projects the extension target into `.release/target.json`. Do not bump extension versions independently.

| Release channel | Coordinated version | GitHub tag and title | Distribution |
| --- | --- | --- | --- |
| Stable | `0.3.0` | `v0.3.0` | Marketplace and GitHub Release |
| Preview example | `0.3.1` | `v0.3.1` | GitHub Release with a tested VSIX |

Schema 2 uses one numeric version for the Editor SDK, extension manifest and GitHub tag. Patch `0` is stable; patches `1` through `9` are previews. Preview releases use VSIX prerelease metadata and GitHub's prerelease flag and do not advance the latest stable release.

The root field `marketplaceVersion` projects the same numeric artifact identity; it does not authorize a preview Marketplace upload. Historical schema-one suffixed tags and independent VSIX identities remain available for receipt verification. A future stable version must exceed versions already published to Marketplace.

## Publish a tested preview

Run repository operations from the root DrawMotive session worktree.

1. Prepare the extension against its exact published Editor dependency and committed npm lock. Run the extension unit tests and lint.
2. Build and package the preview VSIX once with prerelease metadata. Verify the archive and run the real VS Code host checks against those exact bytes.
3. Retain the archive, `receipt.json`, `candidate.json`, `result.json`, and `editor.png` under `.local/release/vscode/<numeric-version>/`. The receipt must bind the extension commit, package identity, successful host checks, and SHA-256.
4. Commit the tested extension and root gitlink/authority before publishing.
5. Publish the retained archive with the scoped root command:

```bash
npm run release:vscode:scoped -- publish
```

The command creates or verifies the immutable numeric `vX.Y.Z` preview tag, uploads the retained archive and evidence, marks the GitHub release as a prerelease, then downloads the uploaded VSIX and confirms its SHA-256. It neither rebuilds the extension nor dispatches a Marketplace publisher workflow. Existing assets must match the retained bytes; they are never overwritten.

`retain` reaches the same GitHub delivery boundary as `publish`. `verify` checks the existing tag, release identity, and downloaded archive without modifying the remote release:

```bash
npm run release:vscode:scoped -- verify
```

The coordinated `release:all` flow uses the same GitHub preview adapter. It confirms GitHub delivery before advancing the release journal.

## Optional CI verification

The manual **Verify GitHub Pre-release** workflow (`prerelease.yml`) downloads the archive and scoped receipt from an existing release. Select its numeric preview tag, such as `v0.3.1`, and exact VSIX filename. The workflow checks out that tag and validates its commit, release target, successful host evidence, and downloaded SHA-256. It has read-only repository permissions and cannot publish to Marketplace.

## Install a preview

Download the VSIX from the [GitHub releases page](https://github.com/drawmotive/vscode-drawmotive/releases) and select **Extensions: Install from VSIX...**, or run:

```bash
code --install-extension /absolute/path/to/vscode-drawmotive.vsix
```

New previews are not delivered through Marketplace automatic updates. Previously published Marketplace previews and historical GitHub tags are retained as release history.

## Stable publication

The current stable release is `0.3.0`, bundling `@drawmotive/editor@0.3.0`. Prepare and verify stable targets through the root release authority. Coordinated publication uses `npm run release:automate -- --publish` to publish the exact retained, host-tested VSIX to Marketplace and GitHub. The manual **Release Stable Version** workflow (`release.yml`) also supports standalone verification, packaging and stable publication. Marketplace publication requires credentials for the `drawmotive` publisher; the workflow uses the repository's `VSCE_PAT` secret.

The `vsce:publish` command requires `.release/target.json` to declare the stable channel and validates installed release inputs before calling vsce. A numeric preview package version cannot bypass that gate. There is no DrawMotive preview Marketplace publication script.

For Marketplace format constraints, see [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions).
