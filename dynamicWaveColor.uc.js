// ==UserScript==
// @name Wave Color (Host override + Base-domain map + Favicon fallback)
// ==/UserScript==

(() => {
  Services.console.logStringMessage("[WaveColor] file loaded");

  // Exact-host overrides (checked first)
  const HOST_COLORS = new Map([
    ["music.youtube.com", "rgb(255, 0, 0)"], // set your YouTube Music color here
  ]);

  // Base-domain map (checked second)
  const DOMAIN_COLORS = new Map([
    ["youtube.com",     "rgb(255, 0, 0)"],
    ["google.com",      "rgb(66, 133, 244)"],
    ["github.com",      "rgb(36, 41, 46)"],
    ["reddit.com",      "rgb(255, 69, 0)"],
    ["twitch.tv",       "rgb(145, 70, 255)"],
    ["kick.com",        "rgb(0, 231, 1)"],
    ["rplay.live",      "rgb(0, 178, 255)"],
  ]);

  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 150;

  function getTabContent(tab) {
    const els = tab.getElementsByClassName("tab-content");
    return els && els.length ? els[0] : null;
  }

  function setWave(tab, cssColorOrNull) {
    const content = getTabContent(tab);
    if (!content) return;
    if (cssColorOrNull) content.style.setProperty("--wave-color", cssColorOrNull, "important");
    else content.style.removeProperty("--wave-color");
  }

  function getHostFromTab(tab) {
    try {
      const uri = tab.linkedBrowser?.currentURI;
      if (!uri) return "";
      if (!uri.schemeIs("http") && !uri.schemeIs("https")) return "";
      return uri.host || "";
    } catch {
      return "";
    }
  }

  function getBaseDomain(host) {
    try {
      return Services.eTLD.getBaseDomainFromHost(host);
    } catch {
      return host;
    }
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function faviconDominantRgb(img) {
    try {
      const size = 32;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      const data = ctx.getImageData(0, 0, size, size).data;
      let r = 0, g = 0, b = 0, count = 0;

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      if (!count) return null;
      return `rgb(${(r / count) | 0}, ${(g / count) | 0}, ${(b / count) | 0})`;
    } catch {
      return null;
    }
  }

  const retries = new WeakMap();

  function updateTab(tab) {
    try {
      if (!tab || tab.closing) return;

      const host = getHostFromTab(tab);

      // 1) Exact host override (for YouTube Music etc.)
      if (host) {
        const hostColor = HOST_COLORS.get(host);
        if (hostColor) {
          setWave(tab, hostColor);
          return;
        }

        // 2) Base-domain map (stable)
        const base = getBaseDomain(host); // eTLD+1 [web:320]
        const mapped = DOMAIN_COLORS.get(base) || DOMAIN_COLORS.get(host);
        if (mapped) {
          setWave(tab, mapped);
          return;
        }
      }

      // 3) Unknown site → favicon fallback
      const img = tab.iconImage;
      if (!img) {
        setWave(tab, null);
        return;
      }

      if (!tab.pinned && (!img.complete || img.naturalWidth === 0)) {
        setWave(tab, null);
        const n = (retries.get(tab) || 0) + 1;
        retries.set(tab, n);
        if (n <= MAX_RETRIES) setTimeout(() => updateTab(tab), RETRY_DELAY_MS);
        return;
      }

      const rgb = faviconDominantRgb(img);
      if (!rgb) {
        setWave(tab, null);
        const n = (retries.get(tab) || 0) + 1;
        retries.set(tab, n);
        if (n <= MAX_RETRIES) setTimeout(() => updateTab(tab), RETRY_DELAY_MS);
        return;
      }

      setWave(tab, rgb);
    } catch (e) {
      setWave(tab, null);
      Services.console.logStringMessage("[WaveColor] error: " + e);
    }
  }

  function init() {
    Services.console.logStringMessage("[WaveColor] init");
    if (!window.gBrowser) return;

    for (const tab of gBrowser.tabs) updateTab(tab);

    gBrowser.tabContainer.addEventListener("TabAttrModified", (e) => {
      const changed = e.detail?.changed || [];
      if (changed.includes("image") || changed.includes("label")) updateTab(e.target);
    });

    gBrowser.tabContainer.addEventListener("TabSelect", (e) => updateTab(e.target));

    Services.console.logStringMessage("[WaveColor] active");
  }

  if (window.gBrowser) init();
  else window.addEventListener("load", init, { once: true });
})();