(function () {
  "use strict";

  if (window.__kagiXKarakeepLoaded) {
    return;
  }
  window.__kagiXKarakeepLoaded = true;

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const HOST_ID = "kagi-x-karakeep-panel";
  const state = {
    query: "",
    status: "idle",
    bookmarks: [],
    error: "",
  };

  let host = null;
  let shadow = null;
  let searchRun = 0;

  init();

  function init() {
    runForCurrentQuery();
    watchUrlChanges();
  }

  function runForCurrentQuery() {
    const query = getKagiQuery();
    if (!query) {
      removePanel();
      return;
    }

    if (query === state.query && state.status !== "idle") {
      return;
    }

    state.query = query;
    state.status = "loading";
    state.bookmarks = [];
    state.error = "";
    ensurePanel();
    render();
    search(query, searchRun + 1);
  }

  async function search(query, runId) {
    searchRun = runId;
    const response = await sendMessage({ type: "SEARCH_KARAKEEP", query });
    if (runId !== searchRun) {
      return;
    }

    if (!response || !response.ok) {
      state.status = "error";
      state.error = response && response.error ? response.error : "Karakeep search failed.";
      state.bookmarks = [];
      render();
      return;
    }

    state.status = "success";
    state.error = "";
    state.bookmarks = Array.isArray(response.bookmarks) ? response.bookmarks : [];
    render();
    loadPreviewImages();
  }

  function ensurePanel() {
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("aside");
      host.id = HOST_ID;
      host.setAttribute("aria-label", "Karakeep results");
    }

    const rightColumn = document.querySelector("._0_right_sidebar") || document.querySelector("._0_shlsidebar");
    if (rightColumn) {
      rightColumn.prepend(host);
    } else {
      const appContent = document.querySelector(".app-content") || document.querySelector(".main-area") || document.body;
      appContent.append(host);
      host.classList.add("kagi-x-karakeep-fallback");
    }

    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  }

  function removePanel() {
    if (host && host.parentElement) {
      host.parentElement.removeChild(host);
    }
    host = null;
    shadow = null;
    state.query = "";
    state.status = "idle";
    state.bookmarks = [];
    state.error = "";
  }

  function render() {
    if (!shadow) {
      return;
    }

    shadow.innerHTML = `
      <style>${styles()}</style>
      <section class="panel">
        <header class="header">
          <div class="brand">
            <div class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" focusable="false">
                <path d="M16 4 6 12v14h20V12L16 4Z" />
                <path d="M12 15h8v2h-8zm0 4h8v2h-8z" />
              </svg>
            </div>
            <div>
              <p class="eyebrow">From Karakeep</p>
              <h2>Saved links</h2>
            </div>
          </div>
          <button class="icon-button" type="button" data-action="refresh" title="Refresh Karakeep results">Refresh</button>
        </header>
        ${renderBody()}
      </section>
    `;

    const refreshButton = shadow.querySelector('[data-action="refresh"]');
    if (refreshButton) {
      refreshButton.addEventListener("click", () => {
        state.status = "loading";
        state.error = "";
        render();
        search(state.query, searchRun + 1);
      });
    }

    const optionsButton = shadow.querySelector('[data-action="options"]');
    if (optionsButton) {
      optionsButton.addEventListener("click", () => {
        sendMessage({ type: "OPEN_OPTIONS" });
      });
    }
  }

  function renderBody() {
    if (state.status === "loading") {
      return `<div class="message">Searching your Karakeep bookmarks for <strong>${escapeHtml(state.query)}</strong>...</div>`;
    }

    if (state.status === "error") {
      return `
        <div class="message error">
          <p>${escapeHtml(state.error)}</p>
          <button type="button" data-action="options">Open settings</button>
        </div>
      `;
    }

    if (state.bookmarks.length === 0) {
      return `<div class="message">No Karakeep matches for <strong>${escapeHtml(state.query)}</strong>.</div>`;
    }

    return `
      <ol class="results">
        ${state.bookmarks.map(renderBookmark).join("")}
      </ol>
    `;
  }

  function renderBookmark(bookmark) {
    // Only ever linkify http(s) URLs. Karakeep holds the user's own data, but a
    // saved javascript:/data: URL should never become a clickable link injected
    // into the Kagi results page.
    const url = isSafeHttpUrl(bookmark.url) ? bookmark.url : "";
    const hostname = getHostname(url);
    const tags = Array.isArray(bookmark.tags) ? bookmark.tags.slice(0, 4) : [];
    const saved = formatSavedTime(bookmark.createdAt);
    const meta = [hostname, saved].filter(Boolean).join(" · ");
    return `
      <li class="result">
        <div class="result-layout">
          ${bookmark.imageUrl ? `<div class="preview-shell"><img class="preview" data-preview-url="${escapeAttribute(bookmark.imageUrl)}" alt="" loading="lazy"></div>` : ""}
          <div class="result-copy">
            ${url ? `<a class="title" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(bookmark.title || url)}</a>` : `<span class="title">${escapeHtml(bookmark.title || "Untitled bookmark")}</span>`}
            ${meta ? `<p class="url">${escapeHtml(meta)}</p>` : ""}
            ${bookmark.description ? `<p class="description">${escapeHtml(bookmark.description)}</p>` : ""}
            ${tags.length > 0 ? `<div class="tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
          </div>
        </div>
      </li>
    `;
  }

  function watchUrlChanges() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href === lastUrl) {
        return;
      }
      lastUrl = location.href;
      window.setTimeout(runForCurrentQuery, 50);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("popstate", () => window.setTimeout(runForCurrentQuery, 50));
  }

  async function sendMessage(message) {
    try {
      return await ext.runtime.sendMessage(message);
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : String(error) };
    }
  }

  function loadPreviewImages() {
    if (!shadow) {
      return;
    }

    shadow.querySelectorAll("img[data-preview-url]").forEach((image) => {
      const url = image.getAttribute("data-preview-url");
      if (!url) {
        return;
      }

      sendMessage({ type: "GET_IMAGE_DATA_URL", url }).then((response) => {
        if (!response || !response.ok || !response.dataUrl || !image.isConnected) {
          const shell = image.closest(".preview-shell");
          if (shell) {
            shell.remove();
          }
          return;
        }
        image.src = response.dataUrl;
        image.removeAttribute("data-preview-url");
      });
    });
  }

  function getKagiQuery() {
    try {
      return new URL(location.href).searchParams.get("q") || "";
    } catch (_error) {
      return "";
    }
  }

  function isSafeHttpUrl(url) {
    try {
      const protocol = new URL(String(url || "")).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch (_error) {
      return false;
    }
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (_error) {
      return "";
    }
  }

  // Turn an ISO timestamp into a compact "Saved 3 days ago" label. Returns ""
  // for missing or unparseable timestamps so callers can omit it cleanly.
  function formatSavedTime(createdAt) {
    if (!createdAt) {
      return "";
    }
    const then = Date.parse(createdAt);
    if (Number.isNaN(then)) {
      return "";
    }

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    const units = [
      ["year", 31536000],
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];

    for (const [name, size] of units) {
      const value = Math.floor(seconds / size);
      if (value >= 1) {
        return `Saved ${value} ${name}${value === 1 ? "" : "s"} ago`;
      }
    }
    return "Saved just now";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function styles() {
    return `
      :host {
        color-scheme: dark;
        display: block;
        margin: 0 0 16px;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --kxk-bg: #20212a;
        --kxk-bg-soft: #252631;
        --kxk-border: rgba(255, 255, 255, 0.13);
        --kxk-border-soft: rgba(255, 255, 255, 0.08);
        --kxk-text: #f4f5fb;
        --kxk-muted: #c5cad8;
        --kxk-subtle: #9da5b7;
        --kxk-link: #9db2ff;
        --kxk-link-hover: #c5d0ff;
        --kxk-green: #55d6a5;
        --kxk-accent: #8e98ff;
      }

      .panel {
        border: 1px solid var(--kxk-border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(46, 47, 60, 0.92), var(--kxk-bg));
        color: var(--kxk-text);
        overflow: hidden;
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
      }

      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 16px 12px;
        border-bottom: 1px solid var(--kxk-border-soft);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border: 1px solid rgba(142, 152, 255, 0.32);
        border-radius: 11px;
        background: linear-gradient(135deg, rgba(142, 152, 255, 0.24), rgba(85, 214, 165, 0.14));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .brand-mark svg {
        width: 21px;
        height: 21px;
        fill: var(--kxk-text);
      }

      .brand-mark path + path {
        fill: var(--kxk-bg);
      }

      .eyebrow {
        margin: 0 0 2px;
        color: var(--kxk-accent);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h2 {
        margin: 0;
        color: var(--kxk-text);
        font-size: 17px;
        line-height: 1.2;
      }

      button {
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.07);
        color: var(--kxk-text);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 7px 11px;
      }

      button:hover {
        border-color: rgba(142, 152, 255, 0.7);
        background: rgba(142, 152, 255, 0.14);
      }

      .message {
        padding: 15px 16px;
        color: var(--kxk-muted);
        font-size: 13px;
        line-height: 1.45;
      }

      .message p {
        margin: 0 0 10px;
      }

      .message.error {
        color: #ffb4a8;
      }

      .results {
        display: grid;
        gap: 0;
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .result {
        position: relative;
        padding: 14px 16px 14px 18px;
        border-bottom: 1px solid var(--kxk-border-soft);
        background: transparent;
      }

      .result::before {
        content: "";
        position: absolute;
        inset: 16px auto 16px 0;
        width: 3px;
        border-radius: 999px;
        background: transparent;
      }

      .result:hover {
        background: rgba(255, 255, 255, 0.035);
      }

      .result:hover::before {
        background: var(--kxk-accent);
      }

      .result-layout {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
      }

      .result-copy {
        min-width: 0;
        flex: 1 1 auto;
      }

      .preview-shell {
        flex: 0 0 auto;
        width: 74px;
        height: 56px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        background: var(--kxk-bg-soft);
        overflow: hidden;
      }

      .preview {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .result:last-child {
        border-bottom: 0;
      }

      .title {
        color: var(--kxk-link);
        display: block;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.28;
        text-decoration: none;
      }

      .title:hover {
        color: var(--kxk-link-hover);
        text-decoration: underline;
      }

      .url {
        color: var(--kxk-green);
        font-size: 12px;
        font-weight: 650;
        margin: 6px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .description {
        color: var(--kxk-muted);
        display: -webkit-box;
        font-size: 12px;
        line-height: 1.4;
        margin: 7px 0 0;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
      }

      .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 9px;
      }

      .tags span {
        border-radius: 999px;
        background: rgba(142, 152, 255, 0.16);
        color: #d3d8ff;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 7px;
      }

      @media (max-width: 520px) {
        .preview-shell {
          width: 62px;
          height: 48px;
        }
      }
    `;
  }
})();
