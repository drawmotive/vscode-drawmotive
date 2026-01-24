# Change Log

All notable changes to the DrawMotive extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-01-24

### 🎉 Initial Release

First public release of DrawMotive - Diagram & Flowchart Editor for VS Code!

#### Added
- ✅ **Custom Editor Integration** - Seamlessly edit `.draw.png` files directly in VS Code
- ✅ **Blazor WebAssembly Engine** - Full-featured diagram editor powered by Blazor WASM
- ✅ **Smart PNG Format** - Diagrams stored as standard PNG images with embedded JSON metadata in tEXt chunks
- ✅ **New Diagram Command** - Create new diagrams with `Drawmotive: New Diagram` command
- ✅ **Offline-First Architecture** - Works completely offline, no cloud dependencies
- ✅ **Version Control Friendly** - Git-friendly file format for tracking diagram changes
- ✅ **Zero External Dependencies** - No accounts, no external tools required

#### Supported Features
- 📊 Flowcharts and process diagrams
- 🏗️ Technical architecture diagrams
- 📐 UML class diagrams
- 🖼️ System design visualizations
- 🌐 Network topology diagrams
- ✏️ Custom technical drawings

#### Technical Details
- Minimum VS Code version: 1.95.0
- File format: PNG with embedded tEXt metadata chunk
- Metadata key: `drawmotive`
- Editor engine: Blazor WebAssembly 9.0
- Custom editor view type: `drawmotive.editor`
- File pattern: `*.draw.png`

---

## Roadmap

Future versions may include:
- 🎨 Custom themes and color palettes
- 📋 Template library for common diagram types
- 🔗 Export to SVG, PDF, and other formats
- 🤝 Real-time collaboration features
- 📱 Mobile preview support
- 🔍 Diagram search and indexing

---

## Support

- **Documentation**: https://docs.drawmotive.com
- **Issues**: https://github.com/drawmotive/vscode-drawmotive/issues
- **Discussions**: https://github.com/drawmotive/vscode-drawmotive/discussions
