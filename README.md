# Drawmotive - Diagram & Flowchart Editor for VS Code

Create professional technical diagrams, flowcharts, and architecture visualizations directly in VS Code. Your diagrams are stored as PNG images with embedded data - perfect for documentation, version control, and collaboration.

## ✨ Why Drawmotive?

- **🎨 Full-Featured Diagram Editor** - Create flowcharts, UML diagrams, architecture diagrams, and more
- **📁 Smart PNG Format** - Diagrams stored as standard PNG images with embedded editable document
- **🔒 Offline First** - Works completely offline, no cloud required
- **📦 Git Friendly** - Version control your diagrams alongside code
- **🚀 Zero Setup** - No external tools, no accounts, just draw
- **💼 Professional** - Powered by the same engine as Drawmotive web app

## 🎯 Perfect For

- Software architecture diagrams
- API flow documentation
- Database schema designs
- System design documentation
- Technical flowcharts
- UML diagrams
- Network topology diagrams
- Process workflows

## 🚀 Quick Start

### Create Your First Diagram

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `Drawmotive: New Diagram`
3. Save as `diagram.draw.png`
4. Start drawing, then click **Save diagram** above the canvas.

### Edit Existing Diagrams

Simply click any `.draw.png` file in your workspace - it opens automatically in the Drawmotive editor.

## 💡 Features

### Smart File Format

Drawmotive uses a revolutionary file format that's both a **valid PNG image** and a **full diagram**:

- **Share anywhere** - Works as a regular PNG in emails, Slack, GitHub, etc.
- **Embedded data** - All diagram information stored invisibly in PNG metadata
- **Single file** - No separate `.json` or data files to manage
- **Version control** - Commit to Git like any other image

### Developer Workflow Integration

```bash
# Works seamlessly with Git
git add docs/architecture.draw.png
git commit -m "Update architecture diagram"

# View in any image viewer
open diagram.draw.png

# Edit in VS Code
code diagram.draw.png
```

### Example Use Cases

**Software Teams:**
- Document microservices architecture
- Explain API flows in pull requests
- Design database schemas
- Create onboarding documentation

**Technical Writers:**
- Illustrate complex concepts
- Build visual tutorials
- Create process documentation

**Architects & Engineers:**
- System design documents
- Infrastructure diagrams
- Network topology maps

## 📋 Requirements

- **VS Code**: Version 1.95.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **Internet**: Not required (works offline)

| Layer | Supported environment | Verification boundary |
| --- | --- | --- |
| Contributor build and VSIX packaging | Node.js 22 or 24; npm 10 or 11 on Linux, Windows and macOS | CI targets all three systems with both Node lines |
| Installed editor | VS Code 1.95+ desktop on Linux, Windows or macOS | VS Code supplies the Extension Host and Chromium webview; a separate Node/npm install is not required |
| Browser integration tests | Chromium harness using the packaged editor | This does not certify real VS Code hosts, remote tunnels, Firefox or WebKit |
| Delivery | VSIX with the locked public editor runtime | This repository is not an npm product |

The 2026-10-01 standalone audit ran Linux Node 22.23.2/npm 10.9.8 unit tests
and compilation. Windows/macOS, actual VS Code Extension Hosts and remote
tunnels still require verification. The embedded editor's verified browser
boundary is Chromium; browser-only VS Code hosts are not currently verified.

## 🎓 How It Works

1. **Create** - Use drawing tools to create your diagram
2. **Save** - Click **Save diagram** to export as PNG with embedded diagram data in tEXt chunk
3. **Share** - Share the PNG file anywhere - it's a valid image
4. **Edit** - Open the PNG in Drawmotive to continue editing

The magic? Your diagram data is stored in standard PNG metadata chunks, making files portable and future-proof.

## 📸 File Format Details

Drawmotive uses PNG tEXt chunks to store diagram metadata:

- **Standard PNG format** - Opens in any image viewer
- **Metadata key**: `drawmotive`
- **Encoding**: Opaque base64 editor document embedded in a tEXt chunk
- **Compatibility**: 100% PNG spec compliant

## 🤝 Integration

Works great with:

- **GitHub** - Preview images in README, show in PRs
- **Confluence** - Use the [Confluence macro](https://marketplace.atlassian.com/apps/drawmotive) for deeper integration
- **Slack/Teams** - Share as images in chat
- **Documentation sites** - Embed as standard images
- **Git** - Track changes, merge, and diff

## 🐛 Known Issues

No major known issues. Report problems at:
https://github.com/drawmotive/vscode-drawmotive/issues

## 📦 Installation

### From VS Code Marketplace

1. Open Extensions in VS Code (`Ctrl+Shift+X`)
2. Search for "Drawmotive Diagram"
3. Click Install

### From VSIX File

```bash
code --install-extension vscode-drawmotive-x.x.x.vsix
```

## 🔗 Learn More

- **Documentation**: https://docs.drawmotive.com
- **Web App**: https://drawmotive.com
- **GitHub**: https://github.com/drawmotive/vscode-drawmotive
- **Issues**: https://github.com/drawmotive/vscode-drawmotive/issues

## 📝 Release Notes

### 0.1.0 - Initial Release

🎉 First public release of Drawmotive for VS Code!

**Features:**
- ✅ Custom editor for `.draw.png` files
- ✅ Full Blazor WebAssembly diagram editor
- ✅ PNG metadata embedding and extraction
- ✅ Command: "Drawmotive: New Diagram"
- ✅ Offline-first architecture
- ✅ Zero external dependencies

**Supported Diagram Types:**
- Flowcharts and process diagrams
- Technical architecture diagrams
- UML class diagrams
- System design diagrams
- Network topology
- Custom drawings

## 💬 Feedback & Support

Love Drawmotive? Leave a review on the marketplace!

Found a bug? Open an issue: https://github.com/drawmotive/vscode-drawmotive/issues

Want a feature? Start a discussion: https://github.com/drawmotive/vscode-drawmotive/discussions

---

**Start creating better technical documentation today! 🚀**

Made with ❤️ by the Drawmotive team

## Development

Supports Node.js 22 and 24 with npm 10 or 11. Install the published editor and build the extension:

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

Press F5 to launch the extension. Use **Save diagram** above the editor to write
the PNG preview and editable document back to the `.draw.png` file. The extension
serves packaged assets on a temporary loopback port because the browser SDK
requires HTTP origins; VS Code resolves the client URL for remote extension hosts. Desktop VS Code and remote tunnels still require manual verification.

Release scripts still enforce `.release/target.json`; the already-published
0.2.1 Marketplace version remains deferred until a future release is enrolled.

The local VSIX command above packages without publishing. `release:check`
and publish scripts retain eligibility checks. See
[Contributing](CONTRIBUTING.md) and [NOTICE](NOTICE) for the public build and
redistribution requirements.
Vulnerability reports follow [Security reporting](SECURITY.md).
