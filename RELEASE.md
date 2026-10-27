# Release Process

Every new canonical numeric X.Y.Z version is a stable release, including multi-digit patches. The root release.json owns the version, exact public Editor SDK dependency and projected extension target. Do not bump extension versions independently.

## Coordinated stable publication

Run repository operations from the DrawMotive session worktree. The coordinated target is 0.3.1 for the Editor SDK, extension manifest and immutable v0.3.1 GitHub tag.

1. Prepare the extension against its exact published Editor dependency and committed npm lock.
2. Run unit tests and lint, build and package the VSIX without prerelease metadata, and verify it in the real VS Code host.
3. Commit the tested extension and root gitlink/authority.
4. Use the root release:automate command with --publish to publish the exact retained, host-tested VSIX to Marketplace and GitHub. The workflow confirms the remote archive hash before advancing the coordinated journal.

Marketplace publication requires credentials for the drawmotive publisher. The Release Stable Version workflow (release.yml) also supports standalone verification, packaging and publication with its VSCE_PAT secret. The vsce:publish command requires a stable projected target and validates installed release inputs before invoking vsce.

## Historical preview evidence

Historical schema-one suffixed versions, independent VSIX identities and GitHub prereleases remain available for receipt verification. The scoped preview commands and read-only prerelease workflow preserve that history; numeric schema-two versions cannot select those preview paths. Existing archives and tags are never overwritten.

For Marketplace format constraints, see [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions).
