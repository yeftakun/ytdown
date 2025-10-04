const DEFAULT_PROVIDER_TEMPLATE = "http://localhost:3500/api/v1/streams/{videoId}";

const form = document.getElementById("download-form");
const input = document.getElementById("video-url");
const statusEl = document.getElementById("status");
const submitBtn = form.querySelector('button[type="submit"]');
const providerInput = document.getElementById("provider-template");
const saveProviderBtn = document.getElementById("save-provider");
const testProviderBtn = document.getElementById("test-provider");

init();

async function init() {
  await prefillActiveTab();
  await loadProviderTemplate();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const link = input.value.trim();
    if (!link) {
      setStatus("Masukkan link video terlebih dahulu.", "error");
      return;
    }

    await startDownload(link);
  });

  saveProviderBtn.addEventListener("click", async () => {
    try {
      const normalized = validateProviderTemplate(providerInput.value);
      await chrome.storage.sync.set({ streamProviderTemplate: normalized });
      setStatus("Template API disimpan.", "success");
    } catch (error) {
      setStatus(`Gagal menyimpan: ${error.message}`, "error");
    }
  });

  testProviderBtn.addEventListener("click", async () => {
    const link = input.value.trim();
    if (!link) {
      setStatus("Masukkan link video untuk pengujian.", "error");
      return;
    }

    let normalized;
    try {
      normalized = validateProviderTemplate(providerInput.value);
    } catch (error) {
      setStatus(`Template tidak valid: ${error.message}`, "error");
      return;
    }

    setStatus("Menguji penyedia...", "");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHECK_PROVIDER",
        videoUrl: link,
        providerTemplate: normalized,
      });

      if (!response?.success) {
        throw new Error(response?.error || "Tidak dapat memeriksa penyedia");
      }

      const providerName = response.provider || "penyedia";
      const quality = response.quality || "unknown";
      setStatus(`Penyedia OK (${providerName}) kualitas ${quality}.`, "success");
    } catch (error) {
      setStatus(`Gagal tes: ${error.message}`, "error");
    }
  });
}

async function loadProviderTemplate() {
  try {
    const { streamProviderTemplate } = await chrome.storage.sync.get("streamProviderTemplate");
    providerInput.value = streamProviderTemplate || DEFAULT_PROVIDER_TEMPLATE;
  } catch (error) {
    console.warn("Gagal memuat template penyedia", error);
    providerInput.value = DEFAULT_PROVIDER_TEMPLATE;
  }
}

async function prefillActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && isYoutubeUrl(tab.url)) {
      input.value = tab.url;
    }
  } catch (error) {
    console.warn("Gagal mengambil tab aktif", error);
  }
}

async function startDownload(url) {
  setLoading(true);
  setStatus("Menyiapkan unduhan...", "");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DOWNLOAD_VIDEO",
      videoUrl: url,
      options: { saveAs: true, context: "popup" },
    });

    if (!response?.success) {
      throw new Error(response?.error || "Tidak dapat memulai unduhan");
    }

    const providerLabel = response.provider ? ` via ${response.provider}` : "";
    setStatus(`Unduhan dimulai: ${response.filename}${providerLabel}`, "success");
  } catch (error) {
    setStatus(`Gagal: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Memproses..." : "Download";
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type ? type : "";
}

function isYoutubeUrl(url) {
  try {
    const parsed = new URL(url);
    return ["www.youtube.com", "m.youtube.com", "youtube.com", "youtu.be"].includes(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function validateProviderTemplate(value) {
  if (!value) {
    throw new Error("Template API wajib diisi");
  }

  const trimmed = value.trim();
  if (!trimmed.includes("{videoId}")) {
    throw new Error("Gunakan placeholder {videoId}");
  }

  try {
    // Memastikan template menjadi URL valid setelah penggantian placeholder.
    const probe = trimmed.replace("{videoId}", "dQw4w9WgXcQ");
    new URL(probe);
  } catch (error) {
    throw new Error("Template bukan URL yang valid setelah {videoId} diganti");
  }

  return trimmed;
}
