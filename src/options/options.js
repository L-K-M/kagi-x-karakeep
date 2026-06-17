(function () {
  "use strict";

  const ext = typeof browser !== "undefined" ? browser : chrome;
  const DEFAULT_SETTINGS = {
    serverUrl: "https://cloud.karakeep.app",
    apiToken: "",
    resultLimit: 5,
    allowHttp: false,
  };

  const form = document.getElementById("settings-form");
  const serverUrlInput = document.getElementById("serverUrl");
  const apiTokenInput = document.getElementById("apiToken");
  const resultLimitInput = document.getElementById("resultLimit");
  const allowHttpInput = document.getElementById("allowHttp");
  const testButton = document.getElementById("testConnection");
  const status = document.getElementById("status");

  document.addEventListener("DOMContentLoaded", init);
  form.addEventListener("submit", saveSettings);
  testButton.addEventListener("click", testConnection);

  async function init() {
    const settings = await getSettings();
    serverUrlInput.value = settings.serverUrl;
    apiTokenInput.value = settings.apiToken;
    resultLimitInput.value = String(settings.resultLimit);
    allowHttpInput.checked = settings.allowHttp;
  }

  async function saveSettings(event) {
    event.preventDefault();
    const settings = readFormSettings();
    try {
      validateSettings(settings, false);
      await ensureServerPermission(settings);
      await ext.storage.local.set(settings);
      setStatus("Settings saved.", "success");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    }
  }

  async function testConnection() {
    const settings = readFormSettings();
    try {
      validateSettings(settings, true);
      await ensureServerPermission(settings);
      await ext.storage.local.set(settings);
      setBusy(testButton, true, "Testing...");
      const response = await ext.runtime.sendMessage({ type: "TEST_CONNECTION" });
      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : "Connection test failed.");
      }
      setStatus(`Connected to ${response.serverUrl}.`, "success");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(testButton, false, "Test Connection");
    }
  }

  async function getSettings() {
    const stored = await ext.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      serverUrl: normalizeServerUrl(stored.serverUrl || DEFAULT_SETTINGS.serverUrl),
      apiToken: typeof stored.apiToken === "string" ? stored.apiToken : "",
      resultLimit: normalizeResultLimit(stored.resultLimit),
      allowHttp: stored.allowHttp === true,
    };
  }

  function readFormSettings() {
    return {
      serverUrl: normalizeServerUrl(serverUrlInput.value),
      apiToken: apiTokenInput.value.trim(),
      resultLimit: normalizeResultLimit(resultLimitInput.value),
      allowHttp: allowHttpInput.checked,
    };
  }

  function validateSettings(settings, requireToken) {
    if (!settings.serverUrl) {
      throw new Error("Karakeep server URL is required.");
    }
    validateServerUrl(settings.serverUrl, settings.allowHttp);
    if (requireToken && !settings.apiToken) {
      throw new Error("API token is required for this action.");
    }
  }

  async function ensureServerPermission(settings) {
    if (!ext.permissions || !ext.permissions.request) {
      return;
    }

    const origin = getPermissionOrigin(settings.serverUrl);
    if (!origin) {
      return;
    }

    const granted = await ext.permissions.request({ origins: [origin] });
    if (!granted) {
      throw new Error("Permission to connect to the Karakeep server was not granted.");
    }
  }

  function getPermissionOrigin(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/*`;
    } catch (_error) {
      return "";
    }
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
      throw new Error("Karakeep server URL is invalid.");
    }

    if (parsed.protocol === "https:") {
      return;
    }

    if (allowHttp && parsed.protocol === "http:") {
      return;
    }

    throw new Error("Karakeep server URL must use HTTPS unless HTTP is enabled.");
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.className = `status ${tone || ""}`.trim();
  }
})();
