# VS Code + Blazor WebAssembly Compatibility Issues

## The Core Problem

Blazor WebAssembly's `NavigationManager` requires a valid URI that can be parsed by .NET's `System.Uri` class. VS Code webviews use custom URI schemes that are NOT parseable by `System.Uri`:

- **VS Code webview URI**: `vscode-webview://[random-id]/path`
- **VS Code CDN URI**: `https://file+.vscode-resource.vscode-cdn.net/c:/path`

Both of these fail `.NET System.Uri` parsing:
- `vscode-webview://` - Unknown scheme
- `file+.vscode-resource` - Invalid hostname (contains `+` followed by `.`)

## Key Insights

1. **NavigationManager initialization is unavoidable**: It happens inside `CreateDefault()` which is the only way to create a builder
2. **`document.baseURI` affects dynamic imports**: Any override breaks ES6 module loading
3. **`window.location` cannot be overridden**: Browser security prevents this
4. **VS Code URI schemes are non-standard**: No way to make them parseable by .NET `System.Uri`
5. **CustomElements requires dynamic imports**: Cannot avoid the module loading issue
6. **Dynamic imports cache `document.baseURI`**: Browser caches the value when scripts load, not when imports execute
7. **CustomElements dependency is compiled into `dotnet.js`**: Removing HTML script tags is insufficient

## Failed Solutions (DO NOT TRY AGAIN)

### ❌ Solution 1: Override `document.baseURI`
**Attempt**: Override the `document.baseURI` getter to return a fake valid URI like `https://localhost/`

**Code**:
```javascript
Object.defineProperty(document, 'baseURI', {
    get: function() { return 'https://localhost/'; }
});
```

**Why it fails**:
- ✅ NavigationManager successfully parses the fake URI
- ❌ **ES6 dynamic imports resolve relative to `document.baseURI`**
- ❌ CustomElements module tries to load from `https://localhost/_content/...` and fails with `ERR_CONNECTION_RESET`

**Error**:
```
Failed to fetch dynamically imported module: https://localhost/_content/Microsoft.AspNetCore.Components.CustomElements/Microsoft.AspNetCore.Components.CustomElements.lib.module.js
```

### ❌ Solution 2: Override `window.location.href`
**Attempt**: Override `window.location.href` to return fake URI

**Code**:
```javascript
Object.defineProperty(window.location, 'href', {
    get: function() { return 'https://localhost/'; }
});
```

**Why it fails**:
- ❌ **`window.location` properties are non-configurable**
- ❌ Browser throws `TypeError: Cannot redefine property: href`
- This is a browser security restriction that cannot be bypassed

### ❌ Solution 3: Override `Document.prototype.baseURI`
**Attempt**: Patch the prototype getter before Blazor loads

**Code**:
```javascript
var originalGetter = Object.getOwnPropertyDescriptor(Document.prototype, 'baseURI').get;
Object.defineProperty(Document.prototype, 'baseURI', {
    get: function() {
        var real = originalGetter.call(this);
        if (real && real.startsWith('vscode-webview://')) {
            return 'https://localhost/';
        }
        return real;
    }
});
```

**Why it fails**:
- Same as Solution 1 - dynamic imports break
- **Error**: `Failed to fetch dynamically imported module: https://localhost/_content/...`

### ❌ Solution 4: Add `<base href="${editorUri}/">`
**Attempt**: Use HTML base tag with webview URI

**Code**:
```html
<base href="https://file+.vscode-resource.vscode-cdn.net/c:/path/to/editor/">
```

**Why it fails**:
- ✅ Static resources load correctly
- ✅ Dynamic imports work
- ❌ **NavigationManager reads `document.baseURI` which returns the base tag href**
- ❌ `System.Uri` cannot parse `file+.vscode-resource` hostname
- **Error**: `System.UriFormatException: net_uri_BadHostName`

### ❌ Solution 5: Fix base href hostname (replace `file+.` with `file-`)
**Attempt**: Modify base tag to have valid hostname

**Code**:
```javascript
const originalBase = document.querySelector('base');
const fixedHref = originalBase.href.replace('file+.', 'file-');
originalBase.href = fixedHref;
```

**Why it fails**:
- ❌ Browser resolves resources using the ACTUAL VS Code CDN, not the modified hostname
- ❌ Resources fail to load because `file-vscode-resource` domain doesn't exist

### ❌ Solution 6: Use `<div id="app">` without CustomElements
**Attempt**: Avoid CustomElements module by using standard Blazor root

**Code**:
```html
<div id="app">...</div>
```

**Why it fails**:
- ✅ Avoids CustomElements module issue
- ❌ **Still need NavigationManager which reads invalid URI**
- ❌ Same `System.UriFormatException: net_uri_BadHostName` error

### ❌ Solution 7: Custom NavigationManager with Try-Catch
**Attempt**: Create custom NavigationManager and replace in Program.cs

**Code**:
```csharp
try {
    builder = WebAssemblyHostBuilder.CreateDefault(args);
} catch (UriFormatException) {
    // Use custom builder...
}
```

**Why it fails**:
- ❌ **`WebAssemblyHostBuilder` has no parameterless constructor**
- ❌ **`CreateDefault` is the only way to create a builder**
- ❌ NavigationManager initialization happens INSIDE `CreateDefault` before it returns
- Cannot catch and handle the exception at the right time

### ❌ Solution 8: Use CDN URI Scheme for Base Tag
**Observation from debugging**:
- Static resources load correctly: `https://file+.vscode-resource.vscode-cdn.net/...` ✅
- Dynamic imports try to use: `vscode-webview://[id]/...` ❌

**Root cause**: Dynamic ES6 imports resolve relative to:
1. The `<base>` tag if present, OR
2. The page's location (vscode-webview://)

**Solution**: Add `<base href="${editorUri}/">` where `editorUri` is the CDN scheme that works.

**Why it fails**:
- Same as Solution 4 - NavigationManager still fails with `UriFormatException`

### ❌ Solution 9: Stack-Based document.baseURI Override

**Date**: 2026-01-18

**Attempt**: Use stack inspection to return different `document.baseURI` values:
- Return fake URI when called from `dotnet.js` (NavigationManager)
- Return real CDN URI when called from dynamic import system

**Implementation**:
```javascript
Object.defineProperty(document, 'baseURI', {
    get: function() {
        const stack = new Error().stack;
        if (stack && (stack.includes('dotnet.js') || stack.includes('dotnet.runtime'))) {
            return 'https://vscode-webview.local/'; // Fake URI for NavigationManager
        }
        return window.__vscodeEditorUri; // Real URI for imports
    }
});
```

**Why it fails**:
- ❌ **Dynamic `import()` statements don't call `document.baseURI` getter at import time**
- ❌ Browser's ES6 module loader caches `document.baseURI` value when script loads
- ❌ Dynamic imports from `dotnet.js` try to load from cached fake URI `https://vscode-webview.local/`
- ❌ Error: `Loading the script 'https://vscode-webview.local/_content/Microsoft.AspNetCore.Components.CustomElements/...' violates CSP`

**Root cause analysis**:
1. `dotnet.js` contains hardcoded dynamic import paths for CustomElements module
2. When `dotnet.js` loads, browser caches `document.baseURI` value
3. Later, when `dotnet.js` calls `import()`, browser uses **cached baseURI**, not our getter
4. Our stack detection never runs because getter isn't called during import resolution

**Key insight**: Dynamic imports don't re-evaluate `document.baseURI` - they use a cached value from when the importing script loaded.

### ❌ Solution 10: Use webview.html Without CustomElements

**Date**: 2026-01-18

**Attempt**: Create VS Code-specific HTML template without CustomElements script tag

**Implementation**:
1. Remove CustomElements module from `webview.html` (line 50)
2. Switch DrawmotiveEditorProvider to use `webview.html` instead of `editor/index.html`
3. No C# code changes needed - just use different HTML template

**Why it fails**:
- ❌ **CustomElements import is hardcoded in `dotnet.js` build output, not in HTML**
- ❌ Removing the `<script>` tag is insufficient
- ❌ `dotnet.js` still contains: `import("_content/Microsoft.AspNetCore.Components.CustomElements/...")`
- ❌ This import is embedded at **build time** when `Program.cs` registers CustomElements

**Root Cause**:
When `Program.cs` registers CustomElements:
```csharp
builder.RootComponents.RegisterCustomElement<DEditor>("d-editor");
```
The Blazor build process embeds the CustomElements dependency into `dotnet.js`. At runtime, `dotnet.js` tries to dynamically import the module, regardless of HTML template.

**Cleanup**: Deleted `media/webview.html` and reverted DrawmotiveEditorProvider to load `media/editor/index.html`.

### ❌ Solution 12: Use Base Tag with loadBootResource

**Date**: 2026-01-18

**Attempt**: Add `<base href="https://vscode-webview.local/">` tag to make `document.baseURI` return a fake parseable URI, then use `loadBootResource` to redirect all resource loading to the real CDN URI.

**Implementation**:
```html
<head>
    <base href="https://vscode-webview.local/">
</head>
<script>
    Blazor.start({
        loadBootResource: function(type, name, defaultUri, integrity) {
            // Convert fake base URI URLs to real CDN URIs
            if (defaultUri.startsWith('https://vscode-webview.local/')) {
                const relativePath = defaultUri.substring('https://vscode-webview.local/'.length);
                return fetch(realBaseUri + '/' + relativePath, { integrity });
            }
            return fetch(defaultUri, { integrity });
        }
    });
</script>
```

**Why it fails**:
- ✅ `<base>` tag makes `document.baseURI` return `https://vscode-webview.local/`
- ✅ NavigationManager can parse the base URI (no `UriFormatException`)
- ❌ **`window.location.href` still returns the real `vscode-webview://` URI**
- ❌ NavigationManager.Initialize(baseUri, uri) receives mismatched URIs:
  - baseUri: `https://vscode-webview.local/` (from `document.baseURI`)
  - uri: `vscode-webview://1sa4iush8337j7atucothcasdfaa8fifrr18ehltrduucmli6me5/...` (from `window.location.href`)
- ❌ **Error**: "The URI 'vscode-webview://...' is not contained by the base URI 'https://vscode-webview.local/'"

**Root cause**: The `<base>` tag only affects `document.baseURI` and relative URL resolution, but does NOT change `window.location.href`. Blazor's NavigationManager reads both and validates that the current URI is "contained by" the base URI, which fails when they use different schemes.

**Key insight**: We cannot make `window.location.href` return a fake URI because:
1. `window.location` properties are non-configurable (browser security)
2. Any attempts to override them throw `TypeError: Cannot redefine property`
3. Blazor reads the actual location directly from the browser's location object

---

## Potential Solution 13: Patch blazor.webassembly.js (RECOMMENDED APPROACH)

**Status**: ⚠️ **NOT YET TESTED** - Requires build-time modification of Blazor framework files

**Architecture Decision**: The "Patch/Mock" approach is the correct architecture for a VS Code Custom Editor. Running Blazor in a localhost server would isolate it from VS Code and prevent access to `acquireVsCodeApi()`, making file save impossible. Blazor must run inside the WebView context to communicate with VS Code directly.

**Root Cause Summary**:
The presence of the `file+.vscode-resource.vscode-cdn.net` URL confirms the .NET runtime's strict `System.Uri` parser rejects the `+` character in the hostname (which VS Code Webviews use for resource loading).

Because you cannot:
- Change the browser's actual URL (security restricted)
- Change `System.Uri`'s validation rules (hardcoded in .NET)
- Override `window.location.href` (non-configurable property)

You must **modify the Blazor startup script** so it "lies" to the .NET runtime about the current URL, while simultaneously ensuring it still loads files from the real VS Code CDN URL.

### Complete Implementation Strategy

#### Step 1: Patch `blazor.webassembly.js` File (NON-NEGOTIABLE)

You cannot solve this with just `index.html` changes because NavigationManager reads `window.location.href` directly from the internal JS file before you can intercept it. You must run a "Search and Replace" on the framework file during your build process.

**Target File:** `vscode-drawmotive/media/editor/_framework/blazor.webassembly.js`

**The Change:**
Find the code that reads the current location and force it to return a safe URL (`http://localhost/`).

- **Search for:** `window.location.href` (or `this.location.href`)
- **Replace with:** `"http://localhost/"`

**Implementation Options:**

**Option A: Manual PowerShell Script**
Create `patch-blazor-vscode.ps1` in the repo root:
```powershell
# patch-blazor-vscode.ps1
param(
    [string]$TargetPath = "vscode-drawmotive/media/editor/_framework"
)

$blazorFile = Join-Path $TargetPath "blazor.webassembly.js"

if (Test-Path $blazorFile) {
    Write-Host "Patching $blazorFile for VS Code compatibility..."

    # Read the file
    $content = Get-Content $blazorFile -Raw

    # Replace window.location.href with fake localhost URI
    # This prevents NavigationManager from seeing the unparseable vscode-webview:// URI
    $content = $content -replace 'window\.location\.href', '"http://localhost/"'

    # Write back
    Set-Content $blazorFile -Value $content -NoNewline

    Write-Host "Blazor file patched successfully!"
} else {
    Write-Error "Blazor file not found at $blazorFile"
}
```

**Option B: Integrate into `copy-blazor-files.ps1`**
Add to the end of `copy-blazor-files.ps1`:
```powershell
# After copying files, patch blazor.webassembly.js for VS Code
$blazorFile = Join-Path $TargetPath "_framework/blazor.webassembly.js"
if (Test-Path $blazorFile) {
    Write-Host "`nPatching Blazor for VS Code compatibility..."
    $content = Get-Content $blazorFile -Raw
    $content = $content -replace 'window\.location\.href', '"http://localhost/"'
    Set-Content $blazorFile -Value $content -NoNewline
    Write-Host "  Patched: blazor.webassembly.js"
}
```

> **Warning:** This replace is aggressive and may affect other uses of `window.location.href` in the file. A safer approach would be to target the specific function that NavigationManager calls, but this requires inspecting the minified code.

#### Step 2: Update `index.html` - The Communication Bridge

The VS Code integration script needs to handle:
1. Save the real CDN base URI before the fake base tag overrides it
2. Set fake base tag for NavigationManager
3. Redirect resource loading to real CDN URIs
4. Set up VS Code communication bridge

Replace `vscode-drawmotive/media/editor/index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Diagram Editor</title>

    <!-- 1. Save REAL base path BEFORE fake base tag overrides it -->
    <script>
        // This captures the actual VS Code CDN URI from the document's current location
        // Must run before <base> tag is processed
        window.__realCdnBaseUri = document.baseURI;
        console.log('[VSCode] Real CDN base URI:', window.__realCdnBaseUri);
    </script>

    <!-- 2. Fake base tag to satisfy NavigationManager's System.Uri parsing -->
    <base href="http://localhost/" />

    <!-- Blazor and Radzen dependencies -->
    <!-- These will be converted to absolute URIs by DrawmotiveEditorProvider -->
    <link href="_content/Radzen.Blazor/css/standard-base.css" rel="stylesheet" />
    <link href="Editor.Client.styles.css" rel="stylesheet" />
    <link href="css/site.css" rel="stylesheet" />
    <script src="js/site.js"></script>
    <script src="_content/Radzen.Blazor/Radzen.Blazor.js"></script>
</head>
<body>
    <!-- Standard Blazor app -->
    <div id="app">
        <div class="loading-container">
            <svg class="loading-progress">
                <circle r="40%" cx="50%" cy="50%" />
            </svg>
            <div class="loading-progress-text">Loading Editor...</div>
        </div>
    </div>

    <!-- 3. Blazor WASM with autostart=false -->
    <script src="_framework/blazor.webassembly.js" autostart="false"></script>

    <!-- 4. VS Code Integration Bridge -->
    <script>
        (function() {
            // Set up VS Code environment for Blazor
            window.vscodeEnvironment = {
                fileId: '',
                data: '',
                isVSCode: true
            };

            const vscode = acquireVsCodeApi();

            // Save callback for Blazor (called via JSInterop)
            window.editorCallbacks = {
                handleSave: (exportData) => {
                    console.log('[VSCode] Sending save data to extension');
                    vscode.postMessage({ type: 'update', data: exportData });
                }
            };

            // Notify VS Code that Blazor is ready
            window.notifyExtensionReady = () => {
                console.log('[VSCode] Notifying extension that editor is ready');
                vscode.postMessage({ type: 'ready' });
            };

            // Listen for messages FROM VS Code extension
            window.addEventListener('message', event => {
                const message = event.data;
                console.log('[VSCode] Received message from extension:', message.type);

                if (message.type === 'init') {
                    // Store file info in environment
                    window.vscodeEnvironment.fileId = message.data.fileId;
                    if (message.data.diagramData) {
                        window.vscodeEnvironment.data = message.data.diagramData;
                    }

                    // Start Blazor with resource redirect
                    console.log('[VSCode] Starting Blazor with loadBootResource hook');
                    Blazor.start({
                        loadBootResource: function (type, name, defaultUri, integrity) {
                            // defaultUri will be wrong (http://localhost/...)
                            // Construct correct URL using real CDN base we saved earlier

                            let correctUri;

                            // Check if it's trying to load from fake localhost
                            if (defaultUri.startsWith('http://localhost/')) {
                                // Extract the relative path
                                const relativePath = defaultUri.substring('http://localhost/'.length);
                                // Combine with real CDN base
                                correctUri = window.__realCdnBaseUri + relativePath;
                            } else if (defaultUri.startsWith('http')) {
                                // Already absolute, use as-is
                                correctUri = defaultUri;
                            } else {
                                // Relative path, combine with real base
                                correctUri = window.__realCdnBaseUri + defaultUri;
                            }

                            console.log(`[VSCode] Loading ${name} from ${correctUri}`);

                            // For dotnetjs type, return URI directly
                            if (type === 'dotnetjs') {
                                return correctUri;
                            }

                            // For other resources, fetch with integrity check
                            return fetch(correctUri, {
                                cache: 'no-cache',
                                integrity: integrity
                            });
                        }
                    }).then(() => {
                        console.log('[VSCode] Blazor started successfully');
                        // Notify extension once Blazor is fully initialized
                        window.notifyExtensionReady();
                    }).catch(err => {
                        console.error('[VSCode] Blazor start failed:', err);
                    });
                }
            });

            // Initial ready signal (before Blazor loads)
            console.log('[VSCode] Sending initial ready signal');
            vscode.postMessage({ type: 'ready' });
        })();
    </script>
</body>
</html>
```

#### Step 3: No C# Changes Required

The existing `DEditor` component already:
- ✅ Detects VS Code environment via `window.vscodeEnvironment`
- ✅ Reads `VSCodeData` parameter for initial load
- ✅ Has save callback mechanism

**However**, if you want to call `notifyExtensionReady()` after the C# component is fully initialized:

In `DEditor.razor.cs`, add to `OnAfterRenderAsync`:
```csharp
protected override async Task OnAfterRenderAsync(bool firstRender)
{
    if (firstRender)
    {
        // Check if running in VS Code
        var (fileId, data, isVSCode) = await GetVSCodeEnvironmentAsync();

        if (isVSCode)
        {
            // Notify VS Code that Blazor is ready for init data
            await JsRuntime.InvokeVoidAsync("notifyExtensionReady");
        }
    }
}
```

#### Step 4: DrawmotiveEditorProvider Already Correct

The existing `DrawmotiveEditorProvider.ts` already has the correct flow:
- ✅ Converts relative paths to absolute CDN URIs
- ✅ Listens for 'ready' message
- ✅ Sends 'init' message with file data
- ✅ Handles 'update' messages to save

**No changes needed** to the TypeScript code.

### Summary of the Complete Flow

1. **VS Code Extension:** Opens WebView → Loads `index.html` with absolute CDN URIs
2. **index.html:** Saves real CDN URI → Sets fake `<base>` tag → Loads Blazor
3. **Blazor (Patched):** Boots up using `http://localhost/` (patched in `blazor.webassembly.js`)
4. **NavigationManager:** Sees `http://localhost/` for both baseURI and current URI → No crash ✅
5. **loadBootResource:** Redirects all resource loads to real CDN URIs → Files load correctly ✅
6. **Blazor:** Calls `notifyExtensionReady()` via JSInterop
7. **VS Code Extension:** Receives 'ready' → Reads PNG file → Sends Base64 in 'init' message
8. **DEditor Component:** Receives init data via `window.vscodeEnvironment` → Loads diagram
9. **User:** Edits diagram
10. **DEditor Component:** Calls `window.editorCallbacks.handleSave()` → Sends data
11. **VS Code Extension:** Receives 'update' → Writes PNG with metadata → Saves file

### Why This Approach Should Work

- ✅ **Attacks the root cause:** Patches Blazor's location reading at the source
- ✅ **No runtime property overrides:** Uses build-time patching instead
- ✅ **Preserves VS Code API access:** Blazor runs in WebView context with `acquireVsCodeApi()`
- ✅ **Clean resource loading:** `loadBootResource` handles all file requests
- ✅ **Matches VS Code patterns:** Standard Custom Editor architecture
- ✅ **Minimal code changes:** Only requires patching one file and updating HTML

### Why This Might Still Fail

- ❌ **Multiple location reads:** Blazor may read `window.location.href` in multiple places beyond NavigationManager
- ❌ **Fragile to updates:** Patching minified files breaks when Blazor updates
- ❌ **Side effects:** Other Blazor features (routing, navigation events) may break with fake location
- ❌ **Regex too broad:** Simple string replace may affect unrelated code in `blazor.webassembly.js`

### Implementation Checklist

- [ ] Create `patch-blazor-vscode.ps1` script
- [ ] Integrate patch script into `copy-blazor-files.ps1` or `justfile`
- [ ] Update `index.html` with complete bridge implementation
- [ ] Test: Open `.draw.png` file in VS Code
- [ ] Verify: No `UriFormatException` in console
- [ ] Verify: Resources load from CDN URIs
- [ ] Verify: DEditor component renders
- [ ] Test: Save functionality works
- [ ] Document: Update README with build requirements

**Status**: Documented with complete implementation details. Ready for testing.

---

## ✅ Solution 14: Pre-load baseURI Override + JavaScript Fetch Bypass (WORKING)

**Date**: 2026-01-18

**Status**: ✅ **WORKING** - Successfully runs Blazor in VS Code webview

### Root Cause Analysis

After implementing Solution 13, we discovered the **fundamental mismatch** that explained all previous failures:

**VS Code uses TWO different URI schemes for the same webview:**
1. **Page location**: `vscode-webview://[id]/index.html` (what `document.baseURI` and `window.location` report)
2. **Resource loading**: `https://file+.vscode-resource.vscode-cdn.net/...` (what resources actually load from)

**The problem:**
- `DrawmotiveEditorProvider.ts` converts resource paths to CDN URIs using `webview.asWebviewUri()`
- But the page itself still loads from `vscode-webview://` scheme
- Blazor's NavigationManager expects ONE consistent URI for both
- `System.Net.Http.HttpClient` cannot parse `file+.vscode-resource` hostname

### Complete Solution

The solution requires **THREE coordinated fixes**:

#### Fix 1: Override `document.baseURI` Early (index.html)

**File**: `vscode-drawmotive/media/editor/index.html`

Place this as the **FIRST script in `<head>`**:

```html
<head>
    <!-- CRITICAL: Override document.baseURI BEFORE any other code runs -->
    <script>
        // This must be the FIRST script in <head> to intercept NavigationManager
        window.__realPageUri = window.location.href;

        // Override document.baseURI to return a fake localhost URI
        Object.defineProperty(document, 'baseURI', {
            get: function() {
                return 'http://localhost/';
            },
            configurable: false,
            enumerable: true
        });

        console.log('[VSCode Override] document.baseURI:', document.baseURI);
        console.log('[VSCode Override] Real page URI:', window.__realPageUri);
    </script>

    <!-- After link tags, capture the real CDN URI -->
    <link href="_content/Radzen.Blazor/css/standard-base.css" rel="stylesheet" />
    <!-- ... other links ... -->

    <script>
        // Extract CDN base URI from converted stylesheet paths
        const firstLink = document.querySelector('link[rel="stylesheet"]');
        if (firstLink) {
            const href = firstLink.href;
            const cdnBase = href.substring(0, href.indexOf('/_content/') + 1);
            window.__cdnBaseUri = cdnBase;
            console.log('[VSCode] Captured CDN base URI:', window.__cdnBaseUri);
        }
    </script>
</head>
```

**Why this works:**
- Runs before any other code, including Blazor
- Makes `document.baseURI` return parseable `http://localhost/`
- Captures real CDN URI from stylesheets for resource loading

#### Fix 2: Patch `blazor.webassembly.js` (Build Script)

**File**: `patch-blazor-vscode.ps1` (repo root)

```powershell
# Patch location.href reads to return fake localhost URI
$content = Get-Content $blazorFile -Raw

# Replace READ operations only (not assignments)
$content = $content -replace 'return location\.href', 'return "http://localhost/"'
$content = $content -replace 'location\.href\)', '"http://localhost/")'
$content = $content -replace 'location\.href,', '"http://localhost/",'
$content = $content -replace 'location\.href;', '"http://localhost/";'

Set-Content $blazorFile -Value $content -NoNewline
```

**Why this is needed:**
- NavigationManager reads `window.location.href` from inside Blazor's JS code
- We cannot override `window.location` properties (browser security)
- Must patch the minified file to return fake URI
- Makes NavigationManager see `http://localhost/` for both base and current URI

**Run after copying Blazor files:**
```bash
.\copy-blazor-files.ps1 -TargetPath 'vscode-drawmotive\media\editor'
.\patch-blazor-vscode.ps1
```

#### Fix 3: JavaScript Fetch Bypass (C# + JS Integration)

**Problem**: `HttpClient` in C# cannot parse `file+.vscode-resource` URLs

**Solution**: Use JavaScript `fetch()` API which handles VS Code CDN URIs correctly

**Step 3a: Create Interface** (graphics.core)

**File**: `graphics.core/Utilities/IJsInterop.cs`

```csharp
namespace Graphics.Core.Utilities;

public interface IJsInterop
{
    Task<byte[]> FetchBinaryAsync(string url);
    Task<string> FetchTextAsync(string url);
}
```

**Step 3b: Implement in DJsInterop** (editor.client)

**File**: `editor.client/Canvas/DJsInterop.cs`

```csharp
public class DJsInterop : IJsInterop, IAsyncDisposable
{
    // ... existing code ...

    // IJsInterop implementation
    public async Task<byte[]> FetchBinaryAsync(string url)
    {
        var module = await _module.Value;
        return await module.InvokeAsync<byte[]>("fetchBinary", url);
    }

    public async Task<string> FetchTextAsync(string url)
    {
        var module = await _module.Value;
        return await module.InvokeAsync<string>("fetchText", url);
    }
}
```

**Step 3c: Add JavaScript Functions**

**File**: `editor.client/wwwroot/js/interop.js`

```javascript
export async function fetchBinary(url) {
    console.log('[JS Fetch] Fetching binary:', url);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
}

export async function fetchText(url) {
    console.log('[JS Fetch] Fetching text:', url);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
}
```

**Step 3d: Update StaticResourceLoader**

**File**: `graphics.core/Utilities/StaticResourceLoader.cs`

```csharp
public class StaticResourceLoader
{
    private readonly IJsInterop? _jsInterop;

    public StaticResourceLoader(IBlazorCache cache, IJsInterop? jsInterop = null)
    {
        _cache = cache;
        _jsInterop = jsInterop;
    }

    private async Task<string> LoadWebTextFile(string resourceName)
    {
        var url = $"{GlobalConfigs.BaseUri}{resourceName}";

        // In VS Code mode, use JavaScript fetch to bypass HttpClient URI validation
        if (GlobalConfigs.IsVSCode && _jsInterop != null)
        {
            return await _jsInterop.FetchTextAsync(url);
        }

        // Standard mode: use HttpClient
        var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    private async Task<byte[]> LoadWebBinary(string resourceName)
    {
        var url = $"{GlobalConfigs.BaseUri}{resourceName}";

        // In VS Code mode, use JavaScript fetch to bypass HttpClient URI validation
        if (GlobalConfigs.IsVSCode && _jsInterop != null)
        {
            return await _jsInterop.FetchBinaryAsync(url);
        }

        // Standard mode: use HttpClient
        var response = await _httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }
}
```

**Step 3e: Register Services**

**File**: `editor.client/Program.cs`

```csharp
// Register DJsInterop as singleton implementing IJsInterop interface
builder.Services.AddSingleton<DJsInterop>();
builder.Services.AddSingleton<Graphics.Core.Utilities.IJsInterop>(sp => sp.GetRequiredService<DJsInterop>());
```

**Step 3f: Set GlobalConfigs.BaseUri from CDN**

**File**: `editor.client/Pages/Components/DEditor.razor.cs`

```csharp
// Check for VSCode environment from window object FIRST
var (windowFileId, windowData, windowIsVSCode) = await GetVSCodeEnvironmentAsync();
GlobalConfigs.IsVSCode = windowIsVSCode;

// Set BaseUri based on environment
if (windowIsVSCode)
{
    // Read the real CDN base URI from window.__cdnBaseUri
    var cdnBaseUri = await JsRuntime.InvokeAsync<string>("eval", "window.__cdnBaseUri || ''");
    if (!string.IsNullOrEmpty(cdnBaseUri))
    {
        GlobalConfigs.BaseUri = cdnBaseUri;
        _logger.LogInformation("Using VS Code CDN base URI: {BaseUri}", GlobalConfigs.BaseUri);
    }
}
else
{
    GlobalConfigs.BaseUri = NavigationManager.BaseUri;
}
```

### How It All Works Together

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. index.html (First Script)                                    │
│    - Overrides document.baseURI → "http://localhost/"          │
│    - Stores real page URI in window.__realPageUri               │
├─────────────────────────────────────────────────────────────────┤
│ 2. index.html (After Stylesheets)                               │
│    - Captures CDN URI from converted hrefs                       │
│    - Stores in window.__cdnBaseUri                               │
├─────────────────────────────────────────────────────────────────┤
│ 3. blazor.webassembly.js (Patched)                              │
│    - Returns "http://localhost/" for location.href reads        │
│    - 7 replacements made (safe patterns only)                   │
├─────────────────────────────────────────────────────────────────┤
│ 4. NavigationManager Initialization                             │
│    - Reads document.baseURI → "http://localhost/" ✅           │
│    - Reads location.href → "http://localhost/" ✅              │
│    - URIs match and are parseable → No crash! ✅               │
├─────────────────────────────────────────────────────────────────┤
│ 5. loadBootResource Hook                                         │
│    - Redirects Blazor resource loading from localhost to CDN    │
│    - WASM files, DLLs load correctly ✅                         │
├─────────────────────────────────────────────────────────────────┤
│ 6. DEditor.InitAsync2()                                          │
│    - Detects VS Code via window.vscodeEnvironment               │
│    - Reads window.__cdnBaseUri                                   │
│    - Sets GlobalConfigs.BaseUri to CDN URI                       │
├─────────────────────────────────────────────────────────────────┤
│ 7. StaticResourceLoader                                          │
│    - Checks GlobalConfigs.IsVSCode                              │
│    - Uses IJsInterop.FetchTextAsync() in VS Code mode           │
│    - Bypasses HttpClient URI validation ✅                      │
├─────────────────────────────────────────────────────────────────┤
│ 8. JavaScript fetch()                                            │
│    - Native fetch() handles file+.vscode-resource URLs          │
│    - themes.css, fonts, files.json all load correctly ✅        │
└─────────────────────────────────────────────────────────────────┘
```

### Files Modified

**graphics.core:**
- `Utilities/IJsInterop.cs` (NEW) - Interface for JS fetch operations
- `Utilities/StaticResourceLoader.cs` - Added IJsInterop dependency and VS Code mode detection

**editor.client:**
- `Canvas/DJsInterop.cs` - Implements IJsInterop, added FetchBinaryAsync/FetchTextAsync
- `wwwroot/js/interop.js` - Added fetchBinary/fetchText functions
- `Program.cs` - Registered DJsInterop as IJsInterop singleton
- `Pages/Components/DEditor.razor.cs` - Sets GlobalConfigs.BaseUri from window.__cdnBaseUri
- `Pages/Home.razor` - Changed from `<d-editor>` to `<DEditor />` component

**vscode-drawmotive:**
- `media/editor/index.html` - Added baseURI override, CDN URI capture, loadBootResource hook
- `src/DrawmotiveEditorProvider.ts` - Standard path conversion (no special logic needed)

**Build Tools:**
- `patch-blazor-vscode.ps1` (NEW) - Patches blazor.webassembly.js after build

### Build Workflow

```bash
# 1. Build editor.client
dotnet publish editor.client -c Release

# 2. Copy to VS Code extension
.\copy-blazor-files.ps1 -TargetPath 'vscode-drawmotive\media\editor'

# 3. Patch Blazor for VS Code
.\patch-blazor-vscode.ps1

# 4. Compile TypeScript (if changed)
cd vscode-drawmotive && npm run compile
```

### Why This Solution Works

**Addresses all three incompatibilities:**

1. **NavigationManager URI validation** ✅
   - `document.baseURI` override → Returns `http://localhost/`
   - `location.href` patch → Returns `http://localhost/`
   - Both URIs match and are parseable by System.Uri

2. **Resource loading from CDN** ✅
   - `loadBootResource` hook → Redirects Blazor WASM/DLL loads to CDN URIs
   - JavaScript continues to load from CDN (unaffected by overrides)

3. **HttpClient URI parsing** ✅
   - `IJsInterop` interface → Bypasses HttpClient entirely in VS Code mode
   - JavaScript `fetch()` API → Handles `file+.vscode-resource` URLs natively
   - `StaticResourceLoader` → Uses JS fetch when `GlobalConfigs.IsVSCode`

### Key Insights That Led to Success

1. **Two-URI Architecture**: VS Code uses different schemes for page location vs resources
2. **Early Override**: Must override `document.baseURI` before any other code runs
3. **Patch Required**: Cannot override `window.location` at runtime, must patch Blazor file
4. **Bypass HttpClient**: `System.Net.Http` cannot be fixed, must use JavaScript fetch
5. **Interface Pattern**: `IJsInterop` allows graphics.core to use platform-specific loading

### Testing Results

✅ **NavigationManager**: No `UriFormatException` or URI validation errors
✅ **Blazor Resources**: All WASM, DLLs, dependencies load correctly
✅ **Static Files**: themes.css, fonts, files.json load via JavaScript fetch
✅ **Editor Rendering**: Full UI with canvas and drawing tools
✅ **Save Functionality**: VS Code message passing works correctly

### Known Limitations

- **Build-time patching required**: Must run `patch-blazor-vscode.ps1` after each publish
- **Fragile to Blazor updates**: Patch may break when upgrading Blazor version
- **No actual navigation**: Navigation features disabled (not needed for editor)
- **VS Code specific**: Standard builds (Confluence, standalone) are unaffected

### Maintenance

**After updating Blazor/Upgrading .NET:**
1. Test if patch still works with new Blazor version
2. Verify replacement patterns in `blazor.webassembly.js`
3. May need to adjust regex patterns if Blazor structure changes

**To disable for debugging:**
1. Comment out `document.baseURI` override in index.html
2. Don't run `patch-blazor-vscode.ps1`
3. Extension will fail immediately with URI errors (expected)

---

## Current Status

**✅ RESOLVED (2026-01-18)**: Solution 14 Successfully Working

After 14 solution attempts spanning multiple approaches, **Solution 14** successfully runs Blazor WASM in VS Code webviews.

### What Finally Worked

**Three-part coordinated fix:**

1. **JavaScript Override**: Override `document.baseURI` in index.html before any code runs
2. **Build-time Patch**: Modify `blazor.webassembly.js` to return fake localhost for `location.href` reads
3. **JavaScript Fetch Bypass**: Use native `fetch()` API to bypass C# HttpClient URI validation

### Critical Discovery

**VS Code's Two-URI Architecture:**
- Page location: `vscode-webview://[id]/...` (for security)
- Resource loading: `https://file+.vscode-resource.vscode-cdn.net/...` (for CDN access)

**Blazor's assumption**: Single consistent URI for both

**The incompatibility**: Cannot be solved with pure JavaScript - requires build-time patching + runtime JS fetch bypass

### Success Metrics

- ✅ NavigationManager initializes without crashes
- ✅ All Blazor resources (WASM, DLLs) load correctly
- ✅ Static resources (CSS, fonts, JSON) load via JS fetch
- ✅ Editor renders with full UI and functionality
- ✅ Save/load operations work correctly

**See Solution 14 above for complete implementation details.**

---

## Historical Context: Why Previous Solutions Failed

### The Two-URI Problem

**What We Observed:**

1. **document.baseURI reports:**
   ```
   vscode-webview://1sa4iush8337j7atucothcasdfaa8fifrr18ehltrduucmli6me5/index.html?id=...
   ```

2. **But resources actually load from:**
   ```
   https://file+.vscode-resource.vscode-cdn.net/c%3A/src/dm/vscode-drawmotive/media/editor/_framework/blazor.webassembly.js
   ```

### Why This Happens

**DrawmotiveEditorProvider.ts does TWO different things:**

1. **Loads index.html** from the file system → Browser sees page location as `vscode-webview://`
2. **Converts resource paths** (href/src attributes) to `webview.asWebviewUri()` → Resources use `file+.vscode-resource.vscode-cdn.net`

**The Code:**
```typescript
// This creates the CDN URI for resources
const editorUri = webview.asWebviewUri(
    vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor')
);
// Result: https://file+.vscode-resource.vscode-cdn.net/.../editor/

// But the page itself loads from vscode-webview:// scheme
// So document.baseURI = vscode-webview://...
```

### Why This Breaks Everything

1. **Scripts capture `document.baseURI`** → Gets `vscode-webview://...`
2. **But stylesheet hrefs are absolute** → Point to `file+.vscode-resource.vscode-cdn.net`
3. **When we extract baseURI from stylesheet href** → We get the CDN URI
4. **But NavigationManager reads `document.baseURI`** → Gets the webview URI
5. **The two URIs are completely different schemes** → Mismatch!

### Why Previous Solutions Failed

| Solution | Attempted Fix | Why It Failed |
|----------|--------------|---------------|
| 1-3 | Override `document.baseURI` | Can't change the actual page location |
| 4 | `<base>` with CDN URI | `document.baseURI` changes but `window.location` still `vscode-webview://` |
| 9 | Stack-based detection | Can't detect NavigationManager calls in WASM |
| 10 | HTML template tricks | Page location is set by VS Code, not HTML |
| 12 | `<base>` with fake URI | `window.location.href` still returns real `vscode-webview://` |
| 13 | Patch + `<base>` tag | `document.baseURI` before `<base>` is `vscode-webview://`, not CDN URI! |

### The Real Problem

**VS Code uses TWO different URI schemes for the SAME webview:**
- **Page location**: `vscode-webview://[id]/...` (for security/isolation)
- **Resource loading**: `https://file+.vscode-resource.vscode-cdn.net/...` (for CDN access)

**Blazor NavigationManager expects ONE consistent URI scheme for both.**

This is an **architectural incompatibility** between VS Code's two-scheme webview model and Blazor's single-URI assumption.

### The Only Real Solutions

Given this discovery, runtime JavaScript fixes **cannot work** because:
- We cannot change the page's actual location (it's `vscode-webview://` by design)
- We cannot make both URIs use the same scheme
- NavigationManager reads the real location directly from the browser

**Viable Paths Forward:**

1. **Custom NavigationManager** (C# Solution)
   - Create a `VSCodeNavigationManager` that doesn't validate URIs
   - Register it before `WebAssemblyHostBuilder.CreateDefault()`
   - Requires modifying Blazor's initialization sequence

2. **Separate VS Code Build** (Build-time Solution)
   - Build without NavigationManager dependency
   - Use conditional compilation: `#if !VSCODE_BUILD`
   - Skip `WebAssemblyHostBuilder.CreateDefault()` entirely
   - Manual initialization without navigation support

3. **Blazor Server Mode** (Architecture Change)
   - Run Blazor Server locally instead of WASM
   - Communicate via WebSocket
   - No client-side URI issues

4. **Wait for Framework Changes** (Long-term)
   - Request Blazor to make NavigationManager optional
   - Request VS Code to use consistent URI schemes

---

## BLOCKED: All runtime JavaScript solutions (1-13) have failed due to fundamental incompatibility:

1. **NavigationManager requires TWO parseable URIs**:
   - Base URI (from `document.baseURI`)
   - Current URI (from `window.location.href`)
   - Both must be parseable by .NET's `System.Uri` class
   - Current URI must be "contained by" base URI (same scheme/host)

2. **VS Code provides unparseable URIs**:
   - `vscode-webview://` scheme - unknown to .NET
   - `file+.vscode-resource` hostname - invalid (contains `+.`)
   - Neither can be parsed by `System.Uri`

3. **Cannot override both URIs consistently**:
   - Can override `document.baseURI` with fake URI ✅
   - Cannot override `window.location.href` (browser security) ❌
   - Result: Mismatched URIs cause validation error

4. **CustomElements removed but NavigationManager still required**:
   - Removing CustomElements fixed the dynamic import issue ✅
   - But NavigationManager is still initialized by `WebAssemblyHostBuilder.CreateDefault()` ❌
   - NavigationManager initialization cannot be bypassed

**Conclusion**: Blazor WASM with standard NavigationManager cannot run in VS Code webviews due to URI scheme incompatibility. Runtime JavaScript workarounds cannot solve this.

---

## ✅ Solution 11: Remove CustomElements Package (PARTIALLY IMPLEMENTED)

**Date**: 2026-01-18

**Status**: ⚠️ **INCOMPLETE** - CustomElements removed but NavigationManager still blocks startup

**Root Cause**:
The fundamental incompatibility is that:
1. Blazor's NavigationManager requires a .NET-parseable `document.baseURI` (fails with VS Code CDN scheme)
2. ES6 dynamic imports cache `document.baseURI` when scripts load (can't be changed later)
3. Both happen during the same initialization sequence
4. No way to provide different URIs to different subsystems at runtime
5. CustomElements dependency is **compiled into `dotnet.js`** at build time

**Solution**: Remove CustomElements at **build time** instead of runtime.

### Implementation:

**1. `editor.client/Program.cs` (line 110)**
- **Removed**: `builder.RootComponents.RegisterCustomElement<DEditor>("d-editor");`
- **Reason**: CustomElements is not needed for VS Code (uses `<div id="app">` standard component)

**2. `editor.client/editor.client.csproj` (line 70)**
- **Removed**: `<PackageReference Include="Microsoft.AspNetCore.Components.CustomElements" Version="10.0.0" />`

**3. Simplified VS Code Integration Files**
- **`vscode-drawmotive/media/editor/index.html`**: Removed all failed workarounds (document.baseURI overrides, stack detection, loadBootResource hook). Now contains only:
  - Standard HTML structure with Blazor dependencies
  - Simple VS Code integration script (handles init/save messages)
  - `Blazor.start()` without custom resource loading
- **`vscode-drawmotive/src/DrawmotiveEditorProvider.ts`**: Removed complex message handling and nonce generation. Now uses straightforward:
  - Load index.html from Blazor build output
  - Convert relative paths to absolute webview URIs
  - Add CSP meta tag
  - Simple message passing (ready/init/update/error)

**4. Rebuilt and Copied**
```bash
dotnet publish editor.client -c Release
.\copy-blazor-files.ps1 -TargetPath 'vscode-drawmotive/media/editor'
```

### Verification:

**Before (with CustomElements):**
```bash
grep -r "CustomElements" vscode-drawmotive/media/editor/_framework/dotnet.js
# Found 2 matches at lines 625 and 630
```

**After (without CustomElements):**
```bash
grep -r "CustomElements" vscode-drawmotive/media/editor/_framework/dotnet.js
# No matches found ✅
```

### Status: ✅ **IMPLEMENTED & SIMPLIFIED**

**Key Changes:**
- ✅ CustomElements removed from build (no dynamic import in `dotnet.js`)
- ✅ All JavaScript workarounds removed from index.html (they didn't work anyway)
- ✅ DrawmotiveEditorProvider simplified (no complex resource loading)
- ✅ Clean, maintainable codebase

**Expected behavior:**
- ✅ No CustomElements errors
- ✅ No complex workarounds needed
- ✅ Standard Blazor WASM loading
- ✅ Simple VS Code message passing

## FAQ: Other _content JavaScript Files

**Question**: "Will other JS files in `media/editor/_content/` also be an issue?"

**Answer**: **No, only CustomElements was problematic.** Here's why:

### Files In `_content` Folder:
```
_content/
├── Blazor-Analytics/blazor-analytics.js
├── Blazor.IndexedDB/Blazor.IndexedDB.js
├── Microsoft.AspNetCore.Components.CustomElements/  ← ❌ ONLY THIS ONE FAILED
│   └── Microsoft.AspNetCore.Components.CustomElements.lib.module.js
├── Microsoft.AspNetCore.Components.WebAssembly.Authentication/
│   └── AuthenticationService.js
├── Radzen.Blazor/
│   ├── Radzen.Blazor.js
│   └── Radzen.Blazor.min.js
└── SkiaSharp.Views.Blazor/
    ├── DpiWatcher.js
    ├── SizeWatcher.js
    └── SKHtmlCanvas.js
```

### Loading Methods Comparison:

**1. Regular `<script src>` Tags** ✅ **Work Fine**
```html
<script src="_content/Radzen.Blazor/Radzen.Blazor.js"></script>
```
- DrawmotiveEditorProvider converts to absolute URI: `https://file+.vscode-resource.vscode-cdn.net/.../editor/_content/Radzen.Blazor/Radzen.Blazor.js`
- Browser loads successfully ✅

**2. Blazor `loadBootResource` Hook** ✅ **Work Fine**
```javascript
loadBootResource: function(type, name, defaultUri, integrity) {
    resourceUri = window.__vscodeEditorUri + defaultUri;
    return fetch(resourceUri, { cache: 'no-cache', integrity });
}
```
- Catches all Blazor-loaded resources (WASM, DLLs, lazy-loaded JS)
- Resolves relative paths to real CDN URIs ✅
- Used by: SkiaSharp JS, IndexedDB JS, authentication JS, etc.

**3. Dynamic `import()` From dotnet.js** ❌ **FAILED (Now Fixed)**
```javascript
// Inside dotnet.js (hardcoded at build time)
import("_content/Microsoft.AspNetCore.Components.CustomElements/...")
```
- Resolves relative to `document.baseURI` (our fake URI)
- Tries to load from `https://vscode-webview.local/...`
- Browser cannot reach fake URI → `ERR_CONNECTION_RESET` ❌
- **ONLY CustomElements used this loading method**

### Why Only CustomElements Failed:

1. **CustomElements was registered in Program.cs** → Blazor build embedded it into `dotnet.js`
2. **`dotnet.js` used dynamic `import()`** → Bypassed our `loadBootResource` hook
3. **Other libraries use standard loading** → Go through `loadBootResource` hook ✅

### Conclusion:

**After removing CustomElements:**
- ✅ `dotnet.js` no longer contains the problematic `import()` statement
- ✅ All other `_content` files continue to work normally (they never had issues)
- ✅ Extension loads successfully

## Alternative Solution: Conditional Compilation (For Future Reference)

If CustomElements is needed in the future, use build-time conditional compilation:

### Option A: Conditional Compilation in Program.cs

```csharp
var builder = WebAssemblyHostBuilder.CreateDefault(args);

#if !VSCODE_BUILD
// Only register CustomElements in non-VS Code builds
builder.RootComponents.RegisterCustomElement<DEditor>("d-editor");
#endif

// Standard component registration works fine
builder.RootComponents.Add<App>("#app");
```

**Build commands**:
- Standard build: `dotnet publish -c Release`
- VS Code build: `dotnet publish -c Release /p:DefineConstants=VSCODE_BUILD`

### Option B: Separate csproj for VS Code

Create `editor.client.vscode.csproj` that:
1. References `editor.client` project
2. Excludes CustomElements package
3. Builds to separate output directory
4. Gets copied to `vscode-drawmotive/media/editor`

**Benefits**:
- ✅ Clean separation of concerns
- ✅ No runtime hacks or workarounds
- ✅ Easier to maintain
- ✅ Can optimize VS Code build separately

**Drawbacks**:
- Requires build infrastructure changes
- Need to maintain conditional compilation or separate project
- CI/CD needs to build both variants
