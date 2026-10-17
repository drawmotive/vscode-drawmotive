# DrawMotive for VS Code

**Make your ideas easy to understand.**

Describe a process in TextGraph. Refine it on a canvas in VS Code. Share it as an image.

[Get DrawMotive](https://github.com/drawmotive/vscode-drawmotive/releases) · [Try the text → diagram demo](https://textgraph.dev/playground?d=0.c2hvcHBpbmcoaW5mbyk6IFNob3BwaW5nIHsKICBicm93c2UgLT4gY2hlY2tvdXQKfQoKcHJvY2Vzc2luZyhwcmltYXJ5KTogQmVoaW5kIHRoZSBzY2VuZXMgewogIHBheW1lbnQgLT4gc2F2ZWQgOiBZZXMKICBwYXltZW50IC0-KGRhc2hlZCB3YXJuaW5nKSByZXRyeSA6IE5vCiAgcmV0cnkgLT4oZGFzaGVkIHdhcm5pbmcpIHBheW1lbnQKICBzYXZlZCAtPiBlbWFpbAp9CgpkZWxpdmVyeShzdWNjZXNzKTogRGVsaXZlcnkgewogIHBhY2sgLT4gc2hpcCAtPiBhcnJpdmVkCn0KCmNoZWNrb3V0IC0-IHBheW1lbnQKc2F2ZWQgLT4gcGFjawoKYnJvd3NlOiBCcm93c2UgdGhlIHNob3AKY2hlY2tvdXQ6IFBsYWNlIGFuIG9yZGVyCnBheW1lbnQoZGlhbW9uZCBmaWxsIHByaW1hcnkpOiBQYXltZW50XG5hY2NlcHRlZD8KcmV0cnkod2FybmluZyk6IFRyeSBhbm90aGVyXG5wYXltZW50CnNhdmVkOiBTYXZlIHRoZSBvcmRlcgplbWFpbDogU2VuZCBjb25maXJtYXRpb25cbmVtYWlsCnBhY2s6IFByZXBhcmUgdGhlIHBhY2thZ2UKc2hpcDogU2hpcCB0aGUgcGFja2FnZQphcnJpdmVkKGVsbGlwc2UgZmlsbCBzdWNjZXNzKTogUGFja2FnZSBhcnJpdmVzCg) · [Get the editable example](examples/online-order.draw.png)

![The online-order example open on the DrawMotive editing canvas, with drawing tools, zoom controls, and Save diagram.](docs/images/online-order-editor.png)

A familiar story, ready to make your own. [View the full diagram](docs/images/online-order.png).

## Make it yours in a minute

1. Install the latest VSIX from [Releases](https://github.com/drawmotive/vscode-drawmotive/releases) with **Extensions: Install from VSIX…**. Stable versions are also on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=drawmotive.vscode-drawmotive).
2. Save [online-order.draw.png](examples/online-order.draw.png) to your workspace and open it in VS Code.
3. Change **Package arrives** to **Delivered**, then click **Save diagram**.

Put the PNG in your README or share it with your team. Open the same file in DrawMotive whenever the story changes.

## Start with text. Finish with your own touch.

[Edit this example in the TextGraph playground](https://textgraph.dev/playground?d=0.c2hvcHBpbmcoaW5mbyk6IFNob3BwaW5nIHsKICBicm93c2UgLT4gY2hlY2tvdXQKfQoKcHJvY2Vzc2luZyhwcmltYXJ5KTogQmVoaW5kIHRoZSBzY2VuZXMgewogIHBheW1lbnQgLT4gc2F2ZWQgOiBZZXMKICBwYXltZW50IC0-KGRhc2hlZCB3YXJuaW5nKSByZXRyeSA6IE5vCiAgcmV0cnkgLT4oZGFzaGVkIHdhcm5pbmcpIHBheW1lbnQKICBzYXZlZCAtPiBlbWFpbAp9CgpkZWxpdmVyeShzdWNjZXNzKTogRGVsaXZlcnkgewogIHBhY2sgLT4gc2hpcCAtPiBhcnJpdmVkCn0KCmNoZWNrb3V0IC0-IHBheW1lbnQKc2F2ZWQgLT4gcGFjawoKYnJvd3NlOiBCcm93c2UgdGhlIHNob3AKY2hlY2tvdXQ6IFBsYWNlIGFuIG9yZGVyCnBheW1lbnQoZGlhbW9uZCBmaWxsIHByaW1hcnkpOiBQYXltZW50XG5hY2NlcHRlZD8KcmV0cnkod2FybmluZyk6IFRyeSBhbm90aGVyXG5wYXltZW50CnNhdmVkOiBTYXZlIHRoZSBvcmRlcgplbWFpbDogU2VuZCBjb25maXJtYXRpb25cbmVtYWlsCnBhY2s6IFByZXBhcmUgdGhlIHBhY2thZ2UKc2hpcDogU2hpcCB0aGUgcGFja2FnZQphcnJpdmVkKGVsbGlwc2UgZmlsbCBzdWNjZXNzKTogUGFja2FnZSBhcnJpdmVzCg), or use the same source in [TextGraph Markdown Preview](https://marketplace.visualstudio.com/items?itemName=drawmotive.textgraph-markdown).

<!-- public-preview:start -->

```textgraph
shopping(info): Shopping {
  browse -> checkout
}

processing(primary): Behind the scenes {
  payment -> saved : Yes
  payment ->(dashed warning) retry : No
  retry ->(dashed warning) payment
  saved -> email
}

delivery(success): Delivery {
  pack -> ship -> arrived
}

checkout -> payment
saved -> pack

browse: Browse the shop
checkout: Place an order
payment(diamond fill primary): Payment\naccepted?
retry(warning): Try another\npayment
saved: Save the order
email: Send confirmation\nemail
pack: Prepare the package
ship: Ship the package
arrived(ellipse fill success): Package arrives
```

![Online order: shopping, a payment decision and retry, confirmation, and delivery.](docs/images/online-order.png)

[Open the full diagram](docs/images/online-order.png) · [Copy the source](examples/online-order.textgraph) · [Try this diagram](https://textgraph.dev/playground?d=1.eJxtkcFqwzAQRO_6ij3ah_yADimEnksgvRRy2UqbaIm9EivHwZT-e5GlJAR6MlppZmeec4gpsZw7llPsLRzaGX4MwLfGWybYbMEFcpd4ncyvMUmjo5yLKCmPqEtvYUeBxcMUCLIjobwaJFxGkqk4ZJzJg4Uvyi8XncccyMMNVVjOPShNuoCFj2igHf551QwMNOPNFmhEHkpATwPPpEuXr64k7S28t1FL5S5rpMCpfFGVZ_JFeu9ZxvcVjwVFZ0yFYmFX4ayNQ0wPqYX9gI4ABaJ6UtN8Os84RvFw4mGAJ7l9vT4KOkdpIv9m1tbdvauFT10AJU6B9CgvsSwccK4h6rIVgoUDiQcX5cQ64sRRjlLxlA4W9koJterKBM9kCo3y_zm9jBucjoaBU6aa_gl2X581htn8AYyRzTM)

<!-- public-preview:end -->

For Chinese, Japanese, and color emoji, see the [packaged font examples](https://github.com/drawmotive/textgraph/tree/main/language-packs#language-coverage).

Connections inside a group introduce its local nodes and may style endpoints
inline. Keep standalone node labels or styles at the root, in any order.
Root short names find a node when its name is unique. The same name in two
groups creates two nodes: `Review { done }` and `Delivery { done }` need
`Review.done` or `Delivery.done` when referenced at the root. Short names
inside each group are local. Group names follow the same rule, and nested
names can use a unique suffix such as `Backend.payment`. Qualified
connection endpoints refer to existing objects without changing containment.

[Example with repeated node names](examples/repeated-names.textgraph)

The downloadable drawing was generated from this source. Canvas changes are saved in the drawing; they do not rewrite the text.

For a blank canvas, run **DrawMotive: New Diagram** and save as `your-idea.draw.png`.

Works offline, without an account. Requires VS Code 1.95 or newer on Windows, macOS, or Linux.

[Report an issue](https://github.com/drawmotive/vscode-drawmotive/issues) · [Development](docs/development.md) · [Contributing](CONTRIBUTING.md) · [Release notes](CHANGELOG.md)
