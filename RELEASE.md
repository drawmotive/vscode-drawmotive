# Release Process

This document describes how to publish the DrawMotive VS Code extension to the marketplace.

## Release Strategy

DrawMotive uses a **dual release strategy**:

1. **🚧 Pre-releases (Automatic)** - Published automatically on every push to `main`
2. **🚀 Stable Releases (Manual)** - Published manually via GitHub Actions when ready

## Prerequisites

### One-Time Setup

1. **Create a Personal Access Token (PAT)** for Visual Studio Marketplace:
   - Go to Azure DevOps (sign in with your Microsoft account)
   - Navigate to User Settings → Personal Access Tokens
   - Click "New Token"
   - Name: `vscode-drawmotive-publish`
   - Organization: All accessible organizations
   - Scopes: Select "Marketplace" > "Manage"
   - Expiration: Choose appropriate duration
   - Copy the generated token

2. **Add Secret to GitHub Repository**:
   - Go to https://github.com/drawmotive/vscode-drawmotive/settings/secrets/actions
   - Click "New repository secret"
   - Name: `VSCE_PAT`
   - Value: Paste the PAT from step 1

3. **Verify Publisher**:
   - Ensure you have a publisher account at https://marketplace.visualstudio.com/manage
   - Publisher ID must match the `publisher` field in `package.json` (currently: `drawmotive`)

## Automatic Pre-releases

### How It Works

**Trigger**: Every push to `main` branch (except documentation and release commits)

**Version Format**: `0.1.0-rc.0` → `0.1.0-rc.1` → `0.1.0-rc.2`

**Process**:
1. Developer pushes code to `main` branch
2. GitHub Actions automatically:
   - Builds and lints the extension
   - Bumps to next pre-release version (e.g., `0.1.0-rc.1`)
   - Publishes to VS Code Marketplace with `--pre-release` flag
   - Creates a GitHub Pre-Release with `.vsix` file attached
   - **Does NOT commit version changes** (pre-releases are ephemeral)

**What Gets Ignored**:
- Markdown file changes (`.md`)
- GitHub workflow changes (`.github/**`)
- Documentation updates
- Release commits (commits starting with `chore: release v`)

### Using Pre-releases

**For End Users:**
1. Open VS Code Extensions
2. Search for "DrawMotive"
3. Click "Switch to Pre-Release Version"
4. VS Code will automatically update to latest pre-release

**For Testers:**
Download the `.vsix` file from:
https://github.com/drawmotive/vscode-drawmotive/releases

### Skipping Pre-release

To push to `main` without triggering a pre-release, update only ignored files (documentation, etc.) or include `[skip ci]` in the commit message.

## Manual Stable Releases

### When to Release Stable

Release a stable version when:
- You've tested pre-release builds thoroughly
- Features are complete and stable
- You're ready for production users
- You want to create a milestone

### Version Bumping Strategy

Follow [Semantic Versioning](https://semver.org/):

- **Patch** (0.1.0 → 0.1.1): Bug fixes, minor improvements
- **Minor** (0.1.0 → 0.2.0): New features, backward compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes, major overhauls

### Release Process

1. **Prepare for Release**:
   - Ensure all pre-releases are tested
   - Update `CHANGELOG.md` with release notes
   - Commit and push changes to `main`

2. **Trigger Release Workflow**:
   - Go to [GitHub Actions](https://github.com/drawmotive/vscode-drawmotive/actions)
   - Select "Release Stable Version" workflow
   - Click "Run workflow"
   - Select version bump: `patch`, `minor`, or `major`
   - Click "Run workflow"

3. **Workflow Steps** (automated):
   - Installs dependencies
   - Runs linting and build
   - Bumps version in `package.json` (e.g., `0.1.0` → `0.1.1`)
   - Commits version change: `chore: release v0.1.1`
   - Creates git tag: `v0.1.1`
   - Packages extension as `.vsix`
   - Publishes to VS Code Marketplace (stable channel)
   - Pushes commit and tag to GitHub
   - Creates GitHub Release with `.vsix` file

4. **Verify Release**:
   - Check marketplace: https://marketplace.visualstudio.com/items?itemName=drawmotive.vscode-drawmotive
   - Verify GitHub release: https://github.com/drawmotive/vscode-drawmotive/releases
   - Test installation in VS Code

## Release Workflow Comparison

| Feature | Pre-release (Auto) | Stable Release (Manual) |
|---------|-------------------|------------------------|
| **Trigger** | Push to `main` | Manual workflow dispatch |
| **Version** | `x.x.x-rc.N` | `x.x.x` |
| **Frequency** | Every push | When ready |
| **Marketplace** | Pre-release channel | Stable channel |
| **Version Commit** | No | Yes |
| **Git Tag** | Yes | Yes |
| **GitHub Release** | Pre-release | Stable release |
| **Users** | Testers, early adopters | Production users |

## Manual Publishing (Local)

For emergency releases or testing, you can publish manually from your local machine.

### Package Extension
```bash
pnpm run vsce:package
```
This creates a `.vsix` file.

### Publish Release
```bash
# Set your PAT as environment variable (PowerShell)
$env:VSCE_PAT = "your-personal-access-token"

# Publish stable release
pnpm run vsce:publish

# Or publish pre-release
pnpm run vsce:publish-prerelease
```

### Manual Version Bumping
```bash
# For stable releases
pnpm run version:patch   # 0.1.0 → 0.1.1
pnpm run version:minor   # 0.1.0 → 0.2.0
pnpm run version:major   # 0.1.0 → 1.0.0

# For pre-releases
pnpm run version:prerelease  # 0.1.0 → 0.1.0-rc.0 or 0.1.0-rc.0 → 0.1.0-rc.1
```

## Example Workflow

### Typical Development Cycle

1. **Develop Feature**
   ```bash
   git checkout -b feature/new-shapes
   # Make changes
   git commit -m "feat: add circle and triangle shapes"
   ```

2. **Merge to Main** (triggers auto pre-release)
   ```bash
   git checkout main
   git merge feature/new-shapes
   git push origin main
   ```
   → **Automatic pre-release created**: `v0.1.0-rc.5`

3. **Test Pre-release**
   - Install pre-release in VS Code
   - Test with real users
   - Fix bugs if needed (repeat steps 1-2)

4. **Release Stable Version**
   - Update CHANGELOG.md
   - Run "Release Stable Version" workflow (select `minor`)
   → **Stable release created**: `v0.2.0`

### Hotfix Workflow

1. **Critical Bug Found**
   ```bash
   git checkout -b hotfix/critical-bug
   # Fix the bug
   git commit -m "fix: resolve crash on file open"
   git push origin hotfix/critical-bug
   ```

2. **Merge Hotfix**
   ```bash
   git checkout main
   git merge hotfix/critical-bug
   git push origin main
   ```
   → **Automatic pre-release created**: `v0.2.0-rc.1`

3. **Verify and Release**
   - Test the pre-release
   - Run "Release Stable Version" workflow (select `patch`)
   → **Hotfix release created**: `v0.2.1`

## Troubleshooting

### Pre-release Not Triggered

**Check**:
- Did you push to `main` branch?
- Did you only modify documentation files?
- Is the commit message a release commit (`chore: release v...`)?
- Check Actions tab for workflow run status

**Solution**:
- Push actual code changes (not just docs)
- Manually trigger workflow if needed

### "Version Already Exists" Error

**Cause**: A version with this number already exists on marketplace

**Solution**:
1. Check current marketplace version
2. Manually bump version higher
3. Re-run workflow

### "Failed to Publish" Error

**Check**:
- Is `VSCE_PAT` secret set correctly?
- Has the PAT expired?
- Is the publisher account active?

**Solution**:
1. Regenerate PAT in Azure DevOps
2. Update `VSCE_PAT` secret in GitHub
3. Re-run workflow

### Build Fails

**Check**:
- Run locally: `pnpm run lint` and `pnpm run package`
- Check error logs in Actions tab

**Solution**:
- Fix linting/build errors
- Push fixes (triggers new pre-release)

## Best Practices

1. **Test Pre-releases**: Always test automatic pre-releases before stable release
2. **Update CHANGELOG**: Keep CHANGELOG.md updated before stable releases
3. **Semantic Versioning**: Follow semver for version bumps
4. **Small Iterations**: Push to `main` frequently to get pre-release feedback
5. **Stable Milestones**: Release stable versions for major milestones only
6. **Communication**: Announce stable releases to users
7. **Documentation**: Update docs before stable releases

## Monitoring

### Check Release Status

- **GitHub Actions**: https://github.com/drawmotive/vscode-drawmotive/actions
- **GitHub Releases**: https://github.com/drawmotive/vscode-drawmotive/releases
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=drawmotive.vscode-drawmotive
- **Marketplace Stats**: https://marketplace.visualstudio.com/manage/publishers/drawmotive

### Metrics to Track

- Pre-release adoption rate
- Stable version downloads
- User ratings and reviews
- Issue reports per version

---

## Quick Reference

### Commands

```bash
# Package locally
pnpm run vsce:package

# Publish stable (manual)
pnpm run vsce:publish

# Publish pre-release (manual)
pnpm run vsce:publish-prerelease

# Version bump
pnpm run version:patch|minor|major|prerelease
```

### Workflows

- **Auto Pre-release**: `.github/workflows/auto-prerelease.yml`
- **Stable Release**: `.github/workflows/release.yml`

### Links

- **Actions**: https://github.com/drawmotive/vscode-drawmotive/actions
- **Releases**: https://github.com/drawmotive/vscode-drawmotive/releases
- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=drawmotive.vscode-drawmotive
