# Supplemental dependency licenses

The npm distribution `react-remove-scroll-bar@2.3.8` declares MIT licensing and
Anton Korzunov as its author but omits the license file. The adjacent license
preserves the upstream text from
[the upstream repository at commit 8ca9ba5](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE).

The UI bundler includes it only for that exact package/version when the
installed distribution lacks its own notice. Other missing notices fail the
build. The generated editor-ui-NOTICES.txt includes all bundled packages.
