(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const DEFAULT_SETTINGS = {
    serverUrl: "https://cloud.karakeep.app",
    apiToken: "",
    resultLimit: 5,
    allowHttp: false,
  };
  const SEARCH_TIMEOUT_MS = 15000;
  const IMAGE_TIMEOUT_MS = 10000;
  const MAX_IMAGE_BYTES = 1200000;
  const imageCache = new Map();

  ext.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") {
      return undefined;
    }

    if (message.type === "SEARCH_KARAKEEP") {
      return searchKarakeep(message.query);
    }

    if (message.type === "TEST_CONNECTION") {
      return testConnection();
    }

    if (message.type === "OPEN_OPTIONS") {
      return openOptions();
    }

    if (message.type === "GET_IMAGE_DATA_URL") {
      return getImageDataUrl(message.url);
    }

    return undefined;
  });

  async function searchKarakeep(query) {
    try {
      const settings = await getSettings();
      ensureConfigured(settings);
      const cleanQuery = String(query || "").trim();
      if (!cleanQuery) {
        return { ok: true, bookmarks: [], serverUrl: settings.serverUrl };
      }

      const data = await karakeepV1Request(
        settings,
        `/bookmarks/search?q=${encodeURIComponent(cleanQuery)}&limit=${settings.resultLimit}`,
        SEARCH_TIMEOUT_MS,
      );
      const bookmarks = Array.isArray(data && data.bookmarks) ? data.bookmarks : [];
      return { ok: true, bookmarks: bookmarks.map(normalizeBookmark), serverUrl: settings.serverUrl };
    } catch (error) {
      return { ok: false, error: normalizeErrorMessage(error) };
    }
  }

  async function testConnection() {
    try {
      const settings = await getSettings();
      ensureConfigured(settings);
      await karakeepV1Request(
        settings,
        `/bookmarks/search?q=${encodeURIComponent("test")}&limit=1`,
        SEARCH_TIMEOUT_MS,
      );
      return { ok: true, serverUrl: settings.serverUrl };
    } catch (error) {
      return { ok: false, error: normalizeErrorMessage(error) };
    }
  }

  async function getSettings() {
    const stored = await ext.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    const serverUrl = normalizeServerUrl(stored.serverUrl || DEFAULT_SETTINGS.serverUrl);
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      serverUrl,
      apiToken: typeof stored.apiToken === "string" ? stored.apiToken.trim() : "",
      resultLimit: normalizeResultLimit(stored.resultLimit),
      allowHttp: stored.allowHttp === true,
    };
  }

  function ensureConfigured(settings) {
    if (!settings.serverUrl) {
      throw userError("Karakeep server URL is not configured.");
    }
    if (!settings.apiToken) {
      throw userError("Karakeep API token is not configured.");
    }
    validateServerUrl(settings.serverUrl, settings.allowHttp);
  }

  async function karakeepV1Request(settings, pathAndQuery, timeoutMs) {
    const response = await fetchWithTimeout(`${settings.serverUrl}/api/v1${pathAndQuery}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${settings.apiToken}`,
      },
    }, timeoutMs);
    const text = await response.text();
    const parsed = text ? parseJson(text) : null;

    if (!response.ok) {
      const message = parsed && (parsed.message || parsed.error || parsed.code);
      throw userError(message || `Karakeep returned HTTP ${response.status}.`);
    }

    return parsed;
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetch(url, {
        ...options,
        signal: controller ? controller.signal : undefined,
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw userError("Karakeep request timed out.");
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async function openOptions() {
    if (ext.runtime.openOptionsPage) {
      await ext.runtime.openOptionsPage();
    }
    return { ok: true };
  }

  async function getImageDataUrl(url) {
    try {
      const imageUrl = String(url || "").trim();
      validateImageUrl(imageUrl);

      if (imageCache.has(imageUrl)) {
        return { ok: true, dataUrl: imageCache.get(imageUrl) };
      }

      const response = await fetchWithTimeout(imageUrl, {
        method: "GET",
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/svg+xml,image/*;q=0.8" },
      }, IMAGE_TIMEOUT_MS);

      if (!response.ok) {
        throw userError(`Image returned HTTP ${response.status}.`);
      }

      const contentType = normalizeImageContentType(response.headers.get("content-type"));
      if (!contentType) {
        throw userError("Preview URL did not return an image.");
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw userError("Preview image is too large.");
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw userError("Preview image is too large.");
      }

      const dataUrl = `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
      imageCache.set(imageUrl, dataUrl);
      trimImageCache();
      return { ok: true, dataUrl };
    } catch (error) {
      return { ok: false, error: normalizeErrorMessage(error) };
    }
  }

  function normalizeBookmark(bookmark) {
    const content = bookmark && bookmark.content ? bookmark.content : {};
    return {
      id: bookmark && bookmark.id ? String(bookmark.id) : "",
      createdAt: bookmark && bookmark.createdAt ? String(bookmark.createdAt) : "",
      title: content.title || content.url || "Untitled bookmark",
      url: content.url || "",
      description: content.description || "",
      imageUrl: content.imageUrl || "",
      type: content.type || "unknown",
      tags: Array.isArray(bookmark && bookmark.tags)
        ? bookmark.tags.map((tag) => String(tag && tag.name ? tag.name : "")).filter(Boolean)
        : [],
    };
  }

  function normalizeServerUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function normalizeResultLimit(value) {
    const limit = Number(value);
    if (Number.isFinite(limit) && limit >= 1 && limit <= 20) {
      return Math.floor(limit);
    }
    return DEFAULT_SETTINGS.resultLimit;
  }

  function validateServerUrl(url, allowHttp) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_error) {
      throw userError("Karakeep server URL is invalid.");
    }

    if (parsed.protocol === "https:") {
      return;
    }

    if (allowHttp && parsed.protocol === "http:") {
      return;
    }

    throw userError("Karakeep server URL must use HTTPS unless HTTP is enabled in settings.");
  }

  function validateImageUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_error) {
      throw userError("Preview image URL is invalid.");
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw userError("Preview image URL is not supported.");
    }
  }

  function normalizeImageContentType(contentType) {
    const type = String(contentType || "").split(";")[0].trim().toLowerCase();
    if (type.startsWith("image/")) {
      return type;
    }
    return "";
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function trimImageCache() {
    while (imageCache.size > 40) {
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      throw userError("Karakeep returned an invalid JSON response.");
    }
  }

  function userError(message) {
    const error = new Error(message);
    error.isUserError = true;
    return error;
  }

  function normalizeErrorMessage(error) {
    if (!error) {
      return "Unknown error.";
    }
    if (error.message) {
      return error.message;
    }
    return String(error);
  }
})();
