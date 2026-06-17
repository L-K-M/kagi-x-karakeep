# Kagi × Karakeep

A small Firefox extension that adds a Karakeep results card to Kagi search pages. It reads the Kagi search term from `https://kagi.com/search?q=...`, searches your Karakeep bookmarks, and renders matching saved links in Kagi's right column.

## Configure

1. Open the extension settings page.
2. Set your Karakeep server URL, for example `https://cloud.karakeep.app` or your self-hosted root URL.
3. Paste a Karakeep API token.
4. Choose how many results to show.
5. Use `Test Connection` to verify the token.

If you use an `http://` local address, enable `Allow HTTP server URLs for local/self-hosted testing`. Firefox may prompt for permission to connect to the configured origin.

## Build

Run a syntax check:

```bash
npm run check
```

Create a local unsigned XPI package:

```bash
npm run package
```

The package is written to:

```text
dist/kagi-x-karakeep.xpi
```

For AMO-compatible builds and signing, install `web-ext` and store your credentials in `../web-ext-credentials.env`:

```bash
WEB_EXT_API_KEY="your-api-key"
WEB_EXT_API_SECRET="your-api-secret"
```

Then run:

```bash
chmod +x build.sh
./build.sh
```

## Temporary Installation

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Choose `Load Temporary Add-on...`.
3. Select `manifest.json` from this repository.
4. Configure the extension settings.
5. Search on Kagi.

## Notes

This intentionally avoids Karakeep-Pipette's broader engine support, UI stack, and extra bookmark actions. The extension is plain JavaScript and only targets Kagi.
