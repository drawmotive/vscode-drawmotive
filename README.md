# Drawmotive - Diagram & Flowchart Editor for VS Code

Create professional technical diagrams, flowcharts, and architecture visualizations directly in VS Code. Your diagrams are stored as PNG images with embedded data - perfect for documentation, version control, and collaboration.

## ✨ Why Drawmotive?

- **🎨 Full-Featured Diagram Editor** - Create flowcharts, UML diagrams, architecture diagrams, and more
- **📁 Smart PNG Format** - Diagrams stored as standard PNG images with embedded JSON metadata
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
4. Start drawing!

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

## 🎓 How It Works

1. **Create** - Use drawing tools to create your diagram
2. **Save** - Exports as PNG with embedded diagram data in tEXt chunk
3. **Share** - Share the PNG file anywhere - it's a valid image
4. **Edit** - Open the PNG in Drawmotive to continue editing

The magic? Your diagram data is stored in standard PNG metadata chunks, making files portable and future-proof.

## 📸 File Format Details

Drawmotive uses PNG tEXt chunks to store diagram metadata:

- **Standard PNG format** - Opens in any image viewer
- **Metadata key**: `drawmotive`
- **Encoding**: JSON data embedded in tEXt chunk
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
