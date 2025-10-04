// New popup.js for quality selector interface
console.log('YTDown Quality Selector loaded');

let currentVideoId = null;
let videoData = null;

// DOM elements
const statusEl = document.getElementById('status');
const videoInfoEl = document.getElementById('video-info');
const videoTitleEl = document.getElementById('video-title');
const videoUploaderEl = document.getElementById('video-uploader');
const videoDurationEl = document.getElementById('video-duration');
const qualitiesContainerEl = document.getElementById('qualities-container');
const qualitiesListEl = document.getElementById('qualities-list');
const noVideoEl = document.getElementById('no-video');

// Initialize on popup open
init();

async function init() {
  try {
    const startTime = performance.now();
    
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !isYouTubeVideoPage(tab.url)) {
      showNoVideo();
      return;
    }
    
    // Extract video ID from URL
    currentVideoId = extractVideoId(tab.url);
    if (!currentVideoId) {
      showError('Video ID tidak ditemukan');
      return;
    }
    
    console.log(`🚀 Loading qualities for video: ${currentVideoId}`);
    await loadVideoQualities(currentVideoId);
    
    const endTime = performance.now();
    console.log(`⚡ Total load time: ${Math.round(endTime - startTime)}ms`);
    
  } catch (error) {
    console.error('Init error:', error);
    showError('Gagal memuat halaman: ' + error.message);
  }
}

async function loadVideoQualities(videoId) {
  try {
    // Stage 1: Quick preview for immediate feedback
    setStatus('loading', 'Memuat info video...');
    
    try {
      const previewResponse = await fetch(`http://localhost:3500/api/v1/preview/${videoId}`);
      if (previewResponse.ok) {
        const previewData = await previewResponse.json();
        if (previewData.success) {
          displayVideoInfo({
            title: previewData.title,
            uploader: 'Loading...',
            durationString: previewData.duration
          });
          setStatus('loading', 'Menganalisis kualitas tersedia...');
        }
      }
    } catch (e) {
      console.log('Preview failed, proceeding to full load');
    }
    
    // Stage 2: Full quality analysis
    const response = await fetch(`http://localhost:3500/api/v1/streams/${videoId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Gagal memuat data video');
    }
    
    videoData = data;
    displayVideoInfo(data);
    displayQualities(data.availableQualities || []);
    
  } catch (error) {
    console.error('Error loading qualities:', error);
    showError(`Gagal memuat kualitas: ${error.message}`);
  }
}

function displayVideoInfo(data) {
  videoTitleEl.textContent = data.title || 'Unknown Title';
  videoUploaderEl.textContent = data.uploader || 'Unknown';
  videoDurationEl.textContent = data.durationString || 'Unknown';
  
  videoInfoEl.style.display = 'block';
}

function displayQualities(qualities) {
  if (!qualities || qualities.length === 0) {
    showError('Tidak ada kualitas yang tersedia');
    return;
  }
  
  console.log('Available qualities:', qualities);
  
  qualitiesListEl.innerHTML = '';
  
  qualities.forEach((quality, index) => {
    const qualityItem = createQualityItem(quality, index);
    qualitiesListEl.appendChild(qualityItem);
  });
  
  // Hide status and show qualities
  statusEl.style.display = 'none';
  qualitiesContainerEl.style.display = 'block';
}

function createQualityItem(quality, index) {
  const item = document.createElement('div');
  item.className = 'quality-item';
  
  // Determine quality badge style
  const height = quality.height || 0;
  let badgeClass = '';
  if (height >= 2160) badgeClass = 'uhd';
  else if (height >= 720) badgeClass = 'hd';
  
  // Determine type indicator
  const typeIndicator = quality.hasAudio 
    ? '<span class="audio-indicator">Audio ✓</span>'
    : '<span class="video-only-indicator">Video Only</span>';
  
  item.innerHTML = `
    <button class="quality-button" data-quality-index="${index}">
      <div class="quality-main">
        <div class="quality-badge ${badgeClass}">${quality.quality}</div>
        <div class="quality-info">
          <div>${quality.container.toUpperCase()} • ${quality.vcodec || 'Unknown'}</div>
          <div class="quality-type">${typeIndicator}</div>
        </div>
      </div>
      <div class="quality-meta">
        <div class="file-size">${quality.filesizeHuman}</div>
        <div style="font-size: 18px;">⬇️</div>
      </div>
    </button>
  `;
  
  // Add event listener instead of inline onclick
  const button = item.querySelector('.quality-button');
  button.addEventListener('click', () => downloadQuality(index));
  
  return item;
}

async function downloadQuality(qualityIndex) {
  if (!videoData || !videoData.availableQualities) {
    showError('Data video tidak tersedia');
    return;
  }
  
  const quality = videoData.availableQualities[qualityIndex];
  if (!quality) {
    showError('Kualitas tidak ditemukan');
    return;
  }
  
  try {
    setStatus('loading', `Memulai download ${quality.quality}...`);
    
    // Generate filename
    const title = sanitizeFileName(videoData.title || 'youtube-video');
    const extension = quality.container || 'mp4';
    const filename = `${title} [${quality.quality}].${extension}`;
    
    // Start download using Chrome Downloads API
    const downloadId = await chrome.downloads.download({
      url: quality.url,
      filename: filename,
      saveAs: true // Let user choose location
    });
    
    console.log('Download started:', downloadId);
    setStatus('success', `Download dimulai: ${quality.quality}`);
    
    // Close popup after successful download
    setTimeout(() => {
      window.close();
    }, 1500);
    
  } catch (error) {
    console.error('Download error:', error);
    showError(`Gagal download: ${error.message}`);
  }
}

// Utility functions
function isYouTubeVideoPage(url) {
  if (!url) return false;
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

function extractVideoId(url) {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

function sanitizeFileName(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100); // Limit filename length
}

function setStatus(type, message) {
  statusEl.className = `status ${type}`;
  
  if (type === 'loading') {
    statusEl.innerHTML = `
      <div class="loading-spinner"></div>
      <div style="margin-top: 8px;">${message}</div>
    `;
  } else {
    statusEl.textContent = message;
  }
  
  statusEl.style.display = 'block';
  qualitiesContainerEl.style.display = 'none';
}

function showError(message) {
  setStatus('error', message);
  videoInfoEl.style.display = 'none';
}

function showNoVideo() {
  statusEl.style.display = 'none';
  videoInfoEl.style.display = 'none';
  qualitiesContainerEl.style.display = 'none';
  noVideoEl.style.display = 'block';
}

// Global function for onclick handlers
window.downloadQuality = downloadQuality;