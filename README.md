# DrawMotive for VS Code

**Make your ideas easy to understand.**

Describe a process in TextGraph. Refine it on a canvas in VS Code. Share it as an image.

[Get DrawMotive](https://github.com/drawmotive/vscode-drawmotive/releases) · [Try the text → diagram demo](https://textgraph.dev/playground?d=1.eJxNj71uwzAQg_d7Co4y0LyAhmToz1gE6NRRkC71obIkSHILp-i7F5KduNuB4H0k1RizXGOoxg9EdmT7GeeqUpbJ5GXQeNwk_BAQs-OMwxHJLBOHSrhdOByVM2Vkh2-Tg4SPYXNrvMYHZK55oV-iy-wv4n37UWW2lksZNF52tQeVUVLLcezlizM7Angy4htij1x9Gu9c_qvducnUW2icvbG8VrpZlRMzxeDQorFPPhtxJ2pojbcWsH51qsZzh2e2LKnSvaBi7yUVXmH7sqf7gj9nDXvi) · [Get the editable example](examples/online-order.draw.png)

![The online-order example open on the DrawMotive editing canvas, with drawing tools, zoom controls, and Save diagram.](docs/images/online-order-editor.png)

A familiar story, ready to make your own. [View the full diagram](docs/images/online-order.png).

## Make it yours in a minute

1. Install the latest VSIX from [Releases](https://github.com/drawmotive/vscode-drawmotive/releases) with **Extensions: Install from VSIX…**. Stable versions are also on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=drawmotive.vscode-drawmotive).
2. Save [online-order.draw.png](examples/online-order.draw.png) to your workspace and open it in VS Code.
3. Change **Delivered** to **At your door**, then click **Save diagram**.

Put the PNG in your README or share it with your team. Open the same file in DrawMotive whenever the story changes.

## Start with text. Finish with your own touch.

[Edit this example in the TextGraph playground](https://textgraph.dev/playground?d=1.eJxNj71uwzAQg_d7Co4y0LyAhmToz1gE6NRRkC71obIkSHILp-i7F5KduNuB4H0k1RizXGOoxg9EdmT7GeeqUpbJ5GXQeNwk_BAQs-OMwxHJLBOHSrhdOByVM2Vkh2-Tg4SPYXNrvMYHZK55oV-iy-wv4n37UWW2lksZNF52tQeVUVLLcezlizM7Angy4htij1x9Gu9c_qvducnUW2icvbG8VrpZlRMzxeDQorFPPhtxJ2pojbcWsH51qsZzh2e2LKnSvaBi7yUVXmH7sqf7gj9nDXvi), or use the same source in [TextGraph Markdown Preview](https://marketplace.visualstudio.com/items?itemName=drawmotive.textgraph-markdown).

<!-- public-preview:start -->

```textgraph
(horizontal)

checkout(primary): Checkout {
  order -> payment
  payment ->(dashed warning) order : No, retry
}

fulfillment(success): Fulfillment {
  ship -> delivered
  email
}

payment -> ship : Yes
payment -> email : Yes

order: Place order
payment(diamond fill primary): Paid?
ship: Ship order
email: Email receipt
delivered(ellipse fill success): Delivered
```

![Online order: checkout and fulfillment, with a payment decision, a dashed retry loop, and parallel shipping and email receipt branches.](docs/images/online-order.png)

[Open the full diagram](docs/images/online-order.png) · [Copy the source](examples/online-order.textgraph) · [Try this diagram](https://textgraph.dev/playground?d=1.eJxNj71uwzAQg_d7Co4y0LyAhmToz1gE6NRRkC71obIkSHILp-i7F5KduNuB4H0k1RizXGOoxg9EdmT7GeeqUpbJ5GXQeNwk_BAQs-OMwxHJLBOHSrhdOByVM2Vkh2-Tg4SPYXNrvMYHZK55oV-iy-wv4n37UWW2lksZNF52tQeVUVLLcezlizM7Angy4htij1x9Gu9c_qvducnUW2icvbG8VrpZlRMzxeDQorFPPhtxJ2pojbcWsH51qsZzh2e2LKnSvaBi7yUVXmH7sqf7gj9nDXvi)

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
