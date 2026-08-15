<p align="center">
  <img src="logo-banner.png" width="640" alt="StatusStash">
</p>

# StatusStash

> StatusStash is a Manifest V3 Chrome extension that saves media from WhatsApp Web statuses. Because WhatsApp decrypts media in the browser and exposes it as a same-origin blob URL, a content script can fetch it directly, with no network interception and no key handling. Adds a draggable floating button, MIME-based naming and SHA-256 deduplication.

**Status:** academic prototype &middot; **Version:** 0.2.0 &middot; **Platform:** Chrome / Edge (Chromium, MV3) &middot; **License:** MIT

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Icons](#icons)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Scope and Ethics](#scope-and-ethics)
- [Author](#author)
- [License](#license)

---

## Overview

On Android, WhatsApp writes viewed statuses to a `.Statuses` folder on disk, so
saving them is trivial. On desktop there is no such folder: WhatsApp Web is
end-to-end encrypted and decrypts media in memory.

StatusStash closes that gap. It observes the page for decrypted media, shows a
floating **Save** button while a status is open, and writes the file to disk on
click.

The project was built to explore a specific question: *where does decrypted
media actually become reachable in an E2E-encrypted web client, and what are the
boundaries of that access?* The answer, and its limits, are documented in
[Limitations](#limitations).

## Features

- **Floating draggable button** - anchored bottom-right by default, clear of
  WhatsApp's own viewer controls. Drag to reposition; the location persists.
- **Keyboard shortcut** - press `s` to save. Suppressed while typing.
- **Automatic detection** - the button only appears when status media is
  actually on screen.
- **Smart target selection** - picks the largest visible blob element, filtering
  out avatars and chat thumbnails.
- **Correct file extensions** - derived from MIME type, since blob URLs carry no
  filename.
- **Deduplication** - SHA-256 of the bytes prevents saving the same status twice.
- **View-once protection** - deliberately refuses to save view-once media.
- **Save log** - toolbar popup lists filename, type, size, and timestamp.
- **Non-intrusive** - clicking the button never advances the status.

## Installation

No build step and no dependencies. Load it unpacked:

1. Download and unzip this folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `statusstash` folder.
5. Open <https://web.whatsapp.com> and view a status.

After editing any file, press the refresh icon on the extension card and
hard-refresh the WhatsApp tab. Manifest changes require this reload.

## Usage

A green pill-shaped **Save** button appears near the lower-right of the window
whenever status media is detected.

| Action | Result |
| --- | --- |
| **Click** the button | Saves the current status to your Downloads folder |
| **Drag** the button | Repositions it; remembered across sessions |
| Press **`s`** | Saves without the mouse (ignored while typing) |
| Click the **toolbar icon** | Opens the log of saved media |

The button doubles as a status indicator:

| Label | Colour | Meaning |
| --- | --- | --- |
| `Save` | Green | Ready |
| `Saving...` | Grey | Fetching the blob |
| `Saved` | Dark green | Written to disk |
| `Already saved` | Amber | SHA-256 matched an earlier save |
| `View once` | Amber | Deliberately refused |
| `Streamed` | Amber | MediaSource video, not a plain blob |
| `No media` | Amber | Nothing detected on screen |
| `Failed` | Red | See the console for details |

States reset to `Save` after about two seconds.

## How It Works

WhatsApp is end-to-end encrypted, so media is decrypted in the browser and
attached to an `<img>` or `<video>` element as a `blob:` URL. Blob URLs are
scoped by **origin**, not by JavaScript world, so a content script running on
`web.whatsapp.com` can `fetch()` them directly. No request interception, no
manifest parsing, no key handling.

Pipeline:

1. A `MutationObserver` plus a 700ms interval poll watch for
   `img[src^="blob:"]` and `video[src^="blob:"]`, toggling button visibility.
2. The largest on-screen candidate wins. Anything narrower than
   `CONFIG.minWidth` (200px) or scrolled out of view is ignored.
3. On click: `fetch(el.src)` -> `ArrayBuffer` -> `Blob`.
4. A zero-length result means the video is MediaSource-fed rather than a plain
   blob, and is reported rather than silently failing.
5. The extension is derived from the `Content-Type` header, falling back to the
   element type.
6. SHA-256 of the bytes is compared against the saved history.
7. A synthetic `<a download>` click performs the save.

Because the whole operation happens in the content script, the extension needs
no `downloads` permission and no background service worker.

## Project Structure

```
statusstash/
  manifest.json     MV3 manifest: permissions, content script, icons
  content.js        Detection, floating button, drag, hotkey, save pipeline
  content.css       Button styling, position anchor, state colours
  popup.html        Toolbar popup markup
  popup.js          Renders the saved-media log from chrome.storage.local
  icon.svg          App icon source (vector)
  icons/            icon16.png, icon32.png, icon48.png, icon128.png
  logo-banner.svg   README banner source (vector)
  logo-banner.png   README banner, 1920x600
  LICENSE           MIT
  README.md
```

## Configuration

All fragile selectors live in a single `CONFIG` object at the top of
`content.js`, so a WhatsApp DOM change is a one-line fix:

| Key | Purpose |
| --- | --- |
| `minWidth` | Minimum rendered width to count as status media |
| `media` | Selectors for blob-backed elements |
| `viewer` | Wrapper used to scope the view-once check |
| `viewOnce` | Markers that trigger a refusal to save |
| `senderName` | Selectors used to build the filename |
| `extByMime` | MIME type to file extension map |
| `hotkey` | Save key, default `'s'` |

The button's resting position lives in `content.css` as `right` / `bottom` on
`.ss-btn`. Anchoring to the right edge means it tracks the window edge on resize
for free. Dragging switches the element to inline `left` / `top`, which
overrides those values.

## Icons

Two vector sources, both plain SVG with no external dependencies:

| File | Used for |
| --- | --- |
| `icon.svg` | Extension icon: toolbar, extensions page, puzzle menu |
| `logo-banner.svg` | README header banner |

The mark is a download arrow over a tray on a rounded square in WhatsApp green
(`#00A884`), chosen to stay legible down to 16px. The same geometry is reused
as an inline SVG inside the floating button, where it inherits `currentColor`
so it recolours with each state.

The banner is a self-contained dark card rather than a transparent image, so it
reads correctly on both light and dark GitHub themes.

Regenerate the icon PNGs after editing `icon.svg`:

```bash
for s in 16 32 48 128; do
  node -e "require('sharp')('icon.svg').resize($s,$s).png().toFile('icons/icon$s.png')"
done
```

Regenerate the banner after editing `logo-banner.svg`:

```bash
node -e "require('sharp')('logo-banner.svg',{density:200}).resize(1920,600).png().toFile('logo-banner.png')"
```

## Limitations

These are design boundaries, not bugs.

- **Blob URLs are tab-local and short-lived.** They are keyed to the document
  that created them and are revoked when the viewer closes. Media must be
  fetched while the status is on screen; URLs cannot be collected for later or
  shared between tabs.
- **MediaSource-fed video cannot be saved.** If `fetch()` returns zero bytes,
  the video arrives via `SourceBuffer.appendBuffer` rather than as a plain blob.
  Capturing that requires a `world: "MAIN"` content script patching
  `appendBuffer`, plus remuxing. Out of scope.
- **View-once media is skipped by design.** The sender explicitly chose that
  setting.
- **Selectors are inherently fragile.** WhatsApp ships obfuscated, frequently
  rotated CSS classes. StatusStash selects only on `role`, `data-testid`,
  `data-icon`, and rendered geometry, but breakage after an update is expected.
- **Terms of service.** WhatsApp prohibits modified or automated clients. Use a
  dedicated test account, never a primary one.
- **Chrome Web Store.** Store policy restricts extensions that facilitate
  unauthorized downloading of streaming content. This project is intended for
  unpacked local use, not publication.

## Troubleshooting

**No button appears.** Check the console for `[StatusStash] active`. If that
logged but nothing shows, no element passed the size filter. Inspect candidates:

```js
document.querySelectorAll('img[src^="blob:"],video[src^="blob:"]')
  .forEach(e => console.log(
    e.tagName,
    e.getBoundingClientRect().width,
    e.closest('div[role="dialog"]')
  ));
```

If widths are below 200, lower `CONFIG.minWidth`. If `closest()` logs `null`,
the view-once check falls back to searching the whole document, which is safe
but broader. Find the real wrapper in the Elements panel and update
`CONFIG.viewer`.

**Button stuck off-screen.** It clamps to the viewport on resize, but the saved
position can be reset:

```js
chrome.storage.local.remove('btnPos');
```

**Button shows `Streamed`.** Expected for MediaSource video. See
[Limitations](#limitations).

**Nothing happens after an update.** WhatsApp changed its DOM. Start with
`CONFIG` in `content.js`.

## Roadmap

- [ ] Harden sender-name detection for filenames
- [ ] Snap-to-edge or corner docking for the floating button
- [ ] Opt-in bulk mode that auto-advances through statuses
- [ ] MediaSource capture for streamed video
- [ ] Export the save log as CSV or JSON
- [ ] Firefox port (MV3 parity)

## Scope and Ethics

Built for coursework and tested against a dedicated test account.

StatusStash reads media that has **already been delivered to and decrypted by
the logged-in client**. It does not circumvent encryption, defeat DRM, bypass
authentication, or access anything the account cannot already see. DRM-protected
content is explicitly out of scope.

Two deliberate design choices reflect this:

1. **View-once media is refused**, because the sender opted out of persistence.
2. **Saving is per-item and explicit**, not silent or automatic, because
   statuses are ephemeral by design and bulk capture would sidestep the sender's
   expectation.

Use it on your own received content, with a test account, and respect the people
whose media you are saving.

## Author

Created and maintained by **Abdullah Zubair**  
- GitHub: [@AvatarParzival](https://github.com/AvatarParzival)
- LinkedIn: [Abdullah Zubair](https://www.linkedin.com/in/abdullahzubairr)
- Email: [abdullah69zubair@gmail.com](abdullah69zubair@gmail.com)

Submitted as an academic project. Issues and suggestions are welcome.