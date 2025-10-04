const REQUEST_HEADERS = {
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
};

const DEFAULT_PROVIDER_CANDIDATES = [
  { label: "localhost (yt-dlp)", template: "http://localhost:3500/api/v1/streams/{videoId}" },
  { label: "piped.video", template: "https://piped.video/api/v1/streams/{videoId}" },
  { label: "pipedapi.kavin.rocks", template: "https://pipedapi.kavin.rocks/api/v1/streams/{videoId}" },
  { label: "piped.projectsegfau.lt", template: "https://piped.projectsegfau.lt/api/v1/streams/{videoId}" },
  { label: "piped.syncpundit.io", template: "https://piped.syncpundit.io/api/v1/streams/{videoId}" }
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "DOWNLOAD_VIDEO") {
    handleDownloadRequest(message.videoUrl, message.options)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        console.error("Download failed", error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }

  if (message?.type === "CHECK_PROVIDER") {
    checkProvider(message.videoUrl, message.providerTemplate)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => {
        console.error("Provider check failed", error);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});

async function handleDownloadRequest(videoUrl, options = {}) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error("Link YouTube tidak valid");
  }

  const { downloadUrl, title, quality, mimeType, provider } = await fetchBestStream(videoId);

  const sanitizedTitle = sanitizeFileName(title || videoId);
  const extension = guessExtension(mimeType);
  const filename = extension
    ? `${sanitizedTitle} (${quality || "video"}).${extension}`
    : `${sanitizedTitle} (${quality || "video"})`;

  const downloadId = await chrome.downloads.download({
    url: downloadUrl,
    filename,
    saveAs: options?.saveAs ?? true,
  });

  return { downloadId, filename, quality, provider: provider?.label || provider?.template };
}

async function checkProvider(videoUrl, providerTemplate) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error("Link YouTube tidak valid");
  }

  const normalizedTemplate = normalizeProviderTemplate(providerTemplate);
  if (!normalizedTemplate) {
    throw new Error("Format URL API tidak valid. Sertakan {videoId}");
  }

  const { provider, quality } = await fetchBestStream(videoId, normalizedTemplate);
  return {
    provider: provider?.label || provider?.template,
    quality,
  };
}

async function fetchBestStream(videoId, overrideTemplate) {
  const providers = await buildProviderStack(overrideTemplate);
  const errors = [];

  for (const provider of providers) {
    try {
      const { payload } = await requestStreamFromProvider(provider, videoId);
      const streams = Array.isArray(payload.videoStreams) ? payload.videoStreams : [];
      const progressiveStreams = streams.filter((stream) => !stream.videoOnly && hasUrl(stream) && !isHLSUrl(stream.url));

      if (!progressiveStreams.length) {
        // If no progressive streams, try the direct download endpoint for localhost
        if (provider.template && provider.template.includes('localhost')) {
          console.log("No progressive streams found, trying direct download endpoint...");
          const directResult = await tryDirectDownload(provider, videoId);
          if (directResult) {
            return directResult;
          }
        }
        throw new Error("Stream dengan audio tidak tersedia dari penyedia");
      }

      progressiveStreams.sort((a, b) => {
        const byQuality = extractQualityScore(b.quality) - extractQualityScore(a.quality);
        if (byQuality !== 0) {
          return byQuality;
        }
        return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
      });

      const bestStream = progressiveStreams[0];

      return {
        downloadUrl: bestStream.url,
        title: payload.title,
        quality: bestStream.quality || bestStream.format || "unknown",
        mimeType: bestStream.mimeType,
        provider,
      };
    } catch (error) {
      console.warn(`[YTDown] Provider gagal: ${provider.label || provider.template}`, error);
      errors.push(`${provider.label || provider.template}: ${error.message}`);
    }
  }

  if (errors.length) {
    throw new Error(`Semua penyedia gagal. Detail: ${errors.join(" | ")}`);
  }

  throw new Error("Tidak ada penyedia stream yang tersedia");
}

async function buildProviderStack(overrideTemplate) {
  const stack = [];

  const overrideNormalized = normalizeProviderTemplate(overrideTemplate);
  if (overrideNormalized) {
    stack.push({ label: "kustom (sementara)", template: overrideNormalized });
  }

  const storedTemplate = await getStoredProviderTemplate();
  if (storedTemplate && !stack.some((provider) => provider.template === storedTemplate)) {
    stack.push({ label: "kustom", template: storedTemplate });
  }

  for (const candidate of DEFAULT_PROVIDER_CANDIDATES) {
    if (!stack.some((provider) => provider.template === candidate.template)) {
      stack.push(candidate);
    }
  }

  return stack;
}

async function getStoredProviderTemplate() {
  try {
    const { streamProviderTemplate } = await chrome.storage.sync.get("streamProviderTemplate");
    const normalized = normalizeProviderTemplate(streamProviderTemplate, { allowLegacy: true });
    return normalized;
  } catch (error) {
    console.warn("Gagal membaca konfigurasi penyedia stream", error);
    return null;
  }
}

async function requestStreamFromProvider(provider, videoId) {
  const endpoint = buildProviderEndpoint(provider.template, videoId);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: REQUEST_HEADERS,
    redirect: "follow",
    cache: "no-store",
  });

  const rawText = await response.text();

  if (!response.ok) {
    const snippet = summarizeText(rawText);
    throw new Error(`HTTP ${response.status} ${response.statusText}${snippet ? ` - ${snippet}` : ""}`);
  }

  try {
    const payload = JSON.parse(rawText);
    return { payload, endpoint };
  } catch (error) {
    const snippet = summarizeText(rawText);
    throw new Error(`Respon bukan JSON${snippet ? ` - ${snippet}` : ""}`);
  }
}

function buildProviderEndpoint(template, videoId) {
  if (!template?.includes("{videoId}")) {
    throw new Error("Template API tidak berisi {videoId}");
  }
  return template.replace("{videoId}", encodeURIComponent(videoId));
}

function normalizeProviderTemplate(raw, options = {}) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const placeholder = "{videoId}";
  if (trimmed.includes(placeholder)) {
    return trimmed;
  }

  if (options.allowLegacy) {
    const sanitized = trimmed.replace(/\/+$/, "");
    return `${sanitized}/${placeholder}`;
  }

  return null;
}

function extractVideoId(input) {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed, "https://www.youtube.com");
    const { hostname, pathname, searchParams } = url;

    if (searchParams.has("v")) {
      return sanitizeVideoId(searchParams.get("v"));
    }

    if (hostname === "youtu.be") {
      return sanitizeVideoId(pathname.replace(/^\//, "").split("/")[0]);
    }

    if (pathname.startsWith("/shorts/")) {
      return sanitizeVideoId(pathname.split("/")[2]);
    }

    if (pathname.startsWith("/embed/")) {
      return sanitizeVideoId(pathname.split("/")[2]);
    }
  } catch (error) {
    console.warn("Gagal mengurai video id", error);
  }

  return null;
}

function sanitizeVideoId(candidate) {
  if (!candidate) {
    return null;
  }
  const clean = candidate.replace(/[^a-zA-Z0-9_-]/g, "");
  return clean.length === 11 ? clean : null;
}

function sanitizeFileName(name) {
  const cleaned = name.replace(/[<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || `youtube-video-${Date.now()}`;
}

function guessExtension(mimeType) {
  if (!mimeType) {
    return "mp4";
  }

  if (mimeType.includes("mp4")) {
    return "mp4";
  }
  if (mimeType.includes("webm")) {
    return "webm";
  }

  const parts = mimeType.split("/");
  return parts.length === 2 ? parts[1] : "mp4";
}

function extractQualityScore(quality) {
  if (!quality) {
    return 0;
  }

  const numberMatch = quality.match(/(\d{3,4})/);
  const fpsMatch = quality.match(/(\d{2})fps?/i);
  const base = numberMatch ? parseInt(numberMatch[1], 10) : 0;
  const fps = fpsMatch ? parseInt(fpsMatch[1], 10) : 0;
  return base * 10 + fps;
}

function hasUrl(stream) {
  return Boolean(stream && typeof stream.url === "string" && stream.url.length > 0);
}

function isHLSUrl(url) {
  return Boolean(url && (url.includes('.m3u8') || url.includes('manifest')));
}

async function tryDirectDownload(provider, videoId) {
  try {
    // Extract base URL from provider template
    const baseUrl = provider.template.replace('/api/v1/streams/{videoId}', '');
    const directEndpoint = `${baseUrl}/api/v1/download/${videoId}?quality=best&format=mp4`;
    
    const response = await fetch(directEndpoint, {
      method: "GET",
      headers: REQUEST_HEADERS,
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success && result.downloadUrl && !isHLSUrl(result.downloadUrl)) {
      return {
        downloadUrl: result.downloadUrl,
        title: result.title,
        quality: result.quality || "unknown",
        mimeType: "video/mp4",
        provider,
      };
    }
    
    throw new Error("Direct download failed");
  } catch (error) {
    console.warn("Direct download attempt failed:", error);
    return null;
  }
}

function summarizeText(text, limit = 140) {
  if (!text || typeof text !== "string") {
    return "";
  }
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 3)}...` : collapsed;
}
