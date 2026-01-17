# VSCode Drawmotive Extension - Future Work & Known Items

## Known Issues

### 1. Bundle Size (90.63 MB)
- **Current**: Blazor WASM artifacts with Brotli compression total 90.63 MB
- **Impact**: Exceeds VSCode marketplace soft recommendation of 50 MB (hard limit is 100 MB)
- **Future Work**:
  - Remove unused Blazor assemblies via LinkerConfig.xml
  - Test with .br-only deployment (delete uncompressed .wasm duplicates)
  - Consider lazy-loading non-critical assemblies
  - Optimize by removing development/debug symbols

### 2. Content Security Policy (CSP)
- **Current**: Uses `unsafe-eval` for Blazor .NET IL interpreter
- **Impact**: Required for Blazor WASM to function, but violates strict CSP
- **Documentation**: Need to document security justification in marketplace description
- **Future Work**: Consider AOT compilation to reduce eval usage (trade-off: increases build time and size)

### 3. Blazor Editor Integration
- **Missing**: Blazor editor needs to properly expose diagram export via `window.editorCallbacks.handleSave()`
- **Current**: Extension has message passing infrastructure but Blazor side not connected
- **Required Changes**:
  - Modify `DEditor.razor.cs` to call `window.editorCallbacks.handleSave()` when diagram changes
  - Implement `window.editorInstance.loadData()` to receive initial diagram data
  - Remove Confluence-specific code (server sync, publish/discard buttons)

### 4. File Format & Serialization
- **Current**: Uses base64 encoding for text documents
- **Issue**: VSCode CustomTextEditorProvider works with text documents, but PNG is binary
- **Future Work**:
  - Consider using CustomReadonlyEditorProvider instead for proper binary file handling
  - Or switch to custom file system provider for `.draw.png` files
  - Current approach may corrupt binary PNG data through text encoding

### 5. Service Worker Registration
- **Issue**: webview.html references service-worker.js which doesn't exist in VSCode context
- **Error**: "No service worker controller found. Waiting for controllerchange."
- **Fix**: Remove service worker registration from webview template (not needed for VSCode)

## Future Enhancements

### Phase 7: Remove Confluence Dependencies
- **Files to Modify**:
  - `C:\src\dm\editor.client\Program.cs` - Remove KeycloakAuthService, sync services
  - `C:\src\dm\editor.client\Pages\Components\DEditor.razor.cs` - Remove server sync logic (lines 196-241)
  - `C:\src\dm\editor.client\App.razor` - Remove Forge Bridge references
  - `C:\src\dm\editor.client\Pages\Components\DEditor.razor` - Remove publish/discard UI

### Phase 8: Optimize Build Pipeline
- **Create automated build script**:
  - Build Blazor in Release mode
  - Filter and copy artifacts
  - Run webpack compilation
  - Package VSIX
- **Single command**: `npm run build-all`

### Phase 9: Improved Error Handling
- Handle corrupted PNG files gracefully
- Add user-friendly error messages
- Implement recovery for failed saves
- Add telemetry for debugging production issues

### Phase 10: Advanced Features
- **Undo/Redo**: Persist across editor sessions
- **Export Options**: Export to SVG, PDF, other formats
- **Collaboration**: Real-time collaborative editing (optional)
- **Templates**: Built-in diagram templates
- **Keyboard Shortcuts**: VSCode command palette integration

## Testing Checklist

### Basic Functionality
- [ ] Extension loads without errors
- [ ] Create new `.draw.png` file
- [ ] Editor opens for `.draw.png` files
- [ ] Blazor canvas renders and responds to mouse
- [ ] Drawing tools work (line, rectangle, circle, text)

### Persistence
- [ ] Save diagram and close editor
- [ ] Reopen file - shapes persist
- [ ] PNG viewable in external image viewer
- [ ] Metadata embedded in PNG tEXt chunk

### Edge Cases
- [ ] Open empty/new file
- [ ] Open corrupted PNG file
- [ ] Open regular PNG (no metadata)
- [ ] Large diagram with 100+ shapes
- [ ] Multiple editors open simultaneously

### Performance
- [ ] Extension loads in < 3 seconds
- [ ] Drawing operations < 16ms frame time
- [ ] Save completes in < 1 second
- [ ] PNG file size reasonable (not bloated)

## Build & Deployment Notes

### Current Build Process (Updated)
1. **Copy Blazor artifacts**: `powershell -ExecutionPolicy Bypass -File copy-editor.ps1`
   - Source: `C:\src\dm\confluence-macro\static\editor\build` (pre-built)
   - Excludes: `.br`, `.gz`, `.map`, `.pdb`, `*.symbols.json`, `service-worker.js`
   - Result: 213 files, 81.08 MB
2. **Compile extension**: `pnpm run compile`
3. **Package**: `vsce package`

### Build Script (copy-editor.ps1)
The PowerShell script automatically:
- Cleans destination directory
- Copies only necessary files (excludes compressed/debug files)
- Reports skipped files
- Shows file type breakdown and total size
- Validates no .br files or service workers are copied

### Dependencies
- Node.js 16+ (for extension)
- pnpm (package manager)
- VSCode Extension Manager (vsce) for packaging
- **Note**: Blazor editor uses pre-built version from confluence-macro, no .NET SDK needed for copying

### Size Optimization Results
- **Before optimization**: 90.63 MB (423 files with .br duplicates)
- **After optimization**: 81.08 MB (213 files, .br files removed)
- **Size reduction**: 9.55 MB saved
- **Current breakdown**:
  - Fonts (.ttf): 40.25 MB (largest - future optimization target)
  - WASM assemblies: 22.84 MB
  - CSS: 13.99 MB
  - Other: 4 MB

### Future Size Optimization Opportunities
1. **Font subsetting**: MaterialSymbols fonts are 40 MB - could reduce by 70-80% with glyph subsetting
2. **Lazy loading**: Load non-critical assemblies on demand
3. **CDN fonts**: Consider loading MaterialSymbols from Google Fonts CDN
4. **CSS optimization**: Minify and combine CSS files (currently 13.99 MB)
5. **Tree shaking**: Remove unused Blazor assemblies via LinkerConfig.xml
