const BUTTON_ID = "yt-downloader-extension-button";
const BUTTON_CLASS = "yt-downloader-extension-button";
const BUTTON_CONTAINER_SELECTOR = "#top-level-buttons-computed";

init();

function init() {
  injectButton();
  observePageChanges();
  window.addEventListener("yt-navigate-finish", () => setTimeout(injectButton, 500));
}

function observePageChanges() {
  const observer = new MutationObserver(() => {
    if (!document.contains(getExistingButton())) {
      injectButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectButton() {
  const container = document.querySelector(BUTTON_CONTAINER_SELECTOR);
  if (!container || getExistingButton()) {
    return;
  }

  const button = buildButton();
  container.appendChild(button);
}

function buildButton() {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.className = BUTTON_CLASS;
  button.textContent = "Download Video";
  button.style.cursor = "pointer";
  button.style.marginLeft = "8px";
  button.style.padding = "8px 12px";
  button.style.borderRadius = "18px";
  button.style.border = "none";
  button.style.fontWeight = "600";
  button.style.background = "#ff4e45";
  button.style.color = "#fff";

  button.addEventListener("click", async () => {
    await handleDownloadClick(button);
  });

  return button;
}

async function handleDownloadClick(button) {
  if (!button || button.dataset.loading === "true") {
    return;
  }

  button.dataset.loading = "true";
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Menyiapkan...";

  try {
    const currentUrl = window.location.href;
    const response = await requestDownload(currentUrl, { saveAs: true, context: "page" });
    if (!response?.success) {
      throw new Error(response?.error || "Gagal memulai unduhan");
    }

    button.textContent = "Unduhan Dimulai";
    setTimeout(() => {
      button.textContent = originalText;
    }, 2500);
  } catch (error) {
    console.warn("Download gagal", error);
    alert(`Gagal memulai unduhan: ${error.message}`);
    button.textContent = originalText;
  } finally {
    delete button.dataset.loading;
    button.disabled = false;
  }
}

function getExistingButton() {
  return document.getElementById(BUTTON_ID);
}

function requestDownload(videoUrl, options = {}) {
  return chrome.runtime.sendMessage({ type: "DOWNLOAD_VIDEO", videoUrl, options });
}
