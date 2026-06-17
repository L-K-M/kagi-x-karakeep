# Awesome — a review of Kagi × Karakeep

A thorough, friendly review of the extension as it stands at `0.1.3`. The code
is genuinely tidy: small, dependency-free, defensive in the right places
(timeouts, size caps, HTML escaping, an `AbortController` on every fetch). What
follows is a catalogue of bugs, gaps, and ideas — sorted roughly by how
confident I am that acting on them is worth it.

Each entry is tagged:

- **[bug]** something that is wrong or will surprise a user
- **[issue]** a smell, risk, or rough edge
- **[feature]** something missing that users will want
- **[delight]** a novel / cool / quirky idea worth trying

And each carries a confidence note for *implementing* it, plus whether it's
been picked up into a branch (✅ = implemented in this pass).

---

## High confidence — worth doing

### 1. [bug] Bookmark links don't validate their URL scheme ✅
`renderBookmark` puts `bookmark.url` straight into `href`. Karakeep is the
user's own data, so the risk is low, but a saved `javascript:` or `data:` URL
would render as a clickable link in the page. Defense in depth: only linkify
`http(s)` URLs, and render anything else as inert text.
*Confidence: high. Branch: `fix/safe-link-protocols`.*

### 2. [bug] The panel is hard-coded to a dark theme ✅
`:host { color-scheme: dark }` and a fixed dark palette mean the card looks
out of place for anyone running Kagi's light (or "paper") theme — a dark
rectangle floating in a white sidebar. The fix that doesn't depend on Kagi's
internal class names: sample the page's background luminance and flip the panel
between a light and dark palette to match.
*Confidence: high. Branch: `feat/theme-aware-panel`.*

### 3. [bug] The toolbar button does nothing ✅
`action` is declared with an icon and title but no popup and no `onClicked`
handler, so clicking the toolbar icon is a no-op. Users reasonably expect it to
*do* something — the cheapest win is to open the settings page.
*Confidence: high. Branch: `feat/toolbar-opens-options`.*

### 4. [feature] Show *when* a bookmark was saved ✅
`createdAt` is already fetched and normalized but never shown. A small
"Saved 3 days ago" line gives the results temporal context and helps users
recognise a link they half-remember.
*Confidence: high. Branch: `feat/relative-saved-time`.*

### 5. [issue] No linting/formatting config for the JS itself ✅
`web-ext lint` validates the *manifest and packaging*, but nothing checks the
source for unused vars, accidental globals, or style drift across the three
hand-written files. A tiny ESLint config + a CI step closes that gap cheaply.
*Confidence: high. Branch: `chore/eslint`.*

---

## Medium confidence — good ideas, a little riskier

### 6. [issue] `host_permissions` requests `http://*/*` + `https://*/*`
The manifest asks for access to *every* site up front. It's there so the
background can fetch preview images from any domain and talk to any self-hosted
Karakeep, but it's an alarming grant at install time and a red flag for AMO
review. The options page *already* requests the Karakeep origin dynamically via
`permissions.request`, so the server origin doesn't need to be in the manifest.
The image-preview case is what makes the broad grant hard to drop cleanly —
moving these to `optional_host_permissions` and requesting per-origin at fetch
time is the right shape but needs care, so it's documented rather than rushed.
*Confidence: medium. Not yet branched — wants design discussion.*

### 7. [feature] "Save this page to Karakeep" / save a Kagi result
The integration is read-only today. The obvious next step is write: a button to
save the current page (or an individual Kagi result) into Karakeep via
`POST /api/v1/bookmarks`. This needs a token with write scope and a little UX,
so it's a feature in its own right.
*Confidence: medium (depends on desired scope). Not branched.*

### 8. [delight] Mark Kagi's own results that you've already saved
The quiet killer feature: after Karakeep returns matches, scan Kagi's organic
results and badge any whose URL you've already bookmarked ("★ In Karakeep").
It turns the extension from a sidebar widget into something woven into the
results you're already scanning. Needs resilient Kagi DOM selectors, so it's
higher-maintenance — worth prototyping behind a setting.
*Confidence: medium. Not branched (DOM-coupling risk).*

### 9. [feature] Cache search results briefly
Every SPA navigation / `q` change re-hits Karakeep. A short-lived in-memory
cache keyed by `query+limit` would make back/forward and re-renders instant and
spare the server. Small and self-contained.
*Confidence: medium. Candidate for a follow-up branch.*

### 10. [feature] A "View in Karakeep" link per result
Link each result to its Karakeep detail view (e.g.
`{serverUrl}/dashboard/preview/{id}`) so users can jump to tags/notes/edit.
The exact path depends on the Karakeep version, so verify before shipping.
*Confidence: medium. Not branched (URL shape needs confirming).*

---

## Lower confidence / smaller / notes

### 11. [issue] `testConnection` persists settings before it tests them
Clicking *Test Connection* writes the form (even bad values) to storage so the
background can read them, then tests. It works, but "test" silently saving is a
mild surprise. Passing the candidate settings inside the message would let the
background test without a write.

### 12. [issue] Duplicated helpers across files
`normalizeServerUrl`, `normalizeResultLimit`, `validateServerUrl`, and the
`DEFAULT_SETTINGS` block are copy-pasted between `background.js` and
`options.js`. A shared `src/common/settings.js` would keep them honest. (MV3
plain-script sharing needs a small amount of plumbing, hence "note".)

### 13. [issue] Panel only re-attaches on URL change, not DOM re-render
`watchUrlChanges` re-runs on navigation, but if Kagi re-renders the right
sidebar without a URL change the panel can be detached and won't return until
the next query. A periodic "is my host still in the DOM?" check would harden it.

### 14. [delight] Badge the toolbar icon with the match count
After a search, set `action.setBadgeText` per-tab to the number of Karakeep
matches — ambient feedback without looking at the sidebar.

### 15. [delight] Make tags clickable
Each tag could deep-link into Karakeep filtered by that tag, turning the result
card into a launchpad into your library.

### 16. [delight] "Open all matches in tabs" affordance
A tiny header action to open every matched bookmark at once — handy for the
"I saved a cluster of things about X" moment.

### 17. [issue] `validateImageUrl` allows `http:` even when `allowHttp` is false
Image previews can be fetched over plain HTTP regardless of the HTTPS-only
setting. Low risk (images, fetched in the background), but inconsistent with how
the server URL is treated.

### 18. [issue] No automated tests for the pure helpers
`normalizeBookmark`, `normalizeResultLimit`, `getHostname`, `escapeHtml`, etc.
are pure and trivially testable. A handful of Node-based unit tests would lock
in behaviour and document intent.

### 19. [note] Chrome compatibility
The extension uses `background.scripts` (a Gecko event page) and the `browser`
namespace, so it is Firefox-only by design. That's a fine choice — just worth
stating explicitly so nobody files "doesn't load in Chrome".

### 20. [delight] A keyboard shortcut to focus/toggle the panel
A `commands` entry (e.g. `Alt+K`) to jump focus to the Karakeep card — keyboard
users on a results page would appreciate it.

---

## What got implemented in this pass

Branches were kept deliberately small and, where possible, touching different
regions of the code to ease parallel review:

| Branch | Entry | Touches |
| --- | --- | --- |
| `fix/safe-link-protocols` | #1 | `kagi-results.js` (link rendering) |
| `feat/theme-aware-panel` | #2 | `kagi-results.js` (styles + theme probe) |
| `feat/toolbar-opens-options` | #3 | `background.js` (action handler) |
| `feat/relative-saved-time` | #4 | `kagi-results.js` (metadata line) |
| `chore/eslint` | #5 | `package.json`, `.eslintrc`, `ci.yml` |

The medium/low-confidence items above are left as documented proposals so the
maintainer can steer scope (especially #6 permissions, #7 write support, and #8
inline result badging, which all deserve a deliberate decision rather than a
drive-by PR).
