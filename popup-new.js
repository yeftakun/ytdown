// New popup.js for quality selector interface
console.log('YTDown Quality Selector loaded');

let currentVideoId = null;
let videoData = null;

// Utility functions
function extractVideoId(input) {
  if (!input) return null;
  
  // If already just the ID
  if (input.length === 11 && !input.includes('/')) {
    return input;
  }
  
  // Extract from YouTube URL
  const match = input.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function getCurrentVideoId() {
  // Try to get from current tab URL if available
  if (videoData && videoData.videoId) {
    return videoData.videoId;
  }
  
  // Return current video ID
  return currentVideoId;
}

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
  
  // Determine type indicator with better audio status
  let typeIndicator = '';
  
  if (quality.type === 'progressive') {
    typeIndicator = '<span class="audio-indicator">Direct Download • Audio ✓</span>';
  } else if (quality.type === 'video-only' && quality.downloadMethod === 'merge-required') {
    typeIndicator = '<span class="merge-indicator">HD Quality • Merge Required</span>';
  } else if (quality.hasAudio) {
    typeIndicator = '<span class="audio-indicator">Audio ✓</span>';
  } else {
    typeIndicator = '<span class="video-only-indicator">Video Only</span>';
  }
  
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
    
    // Handle different download methods
    if (quality.downloadMethod === 'merge-required' && quality.audioUrl) {
      // For merge-required videos, download video and audio separately
      await downloadMergedQuality(quality, title, extension);
    } else {
      // For progressive videos, direct download
      await downloadDirectQuality(quality, title, extension);
    }
    
  } catch (error) {
    console.error('Download error:', error);
    showError(`Gagal download: ${error.message}`);
  }
}

async function downloadDirectQuality(quality, title, extension) {
  const filename = `${title} [${quality.quality}].${extension}`;
  
  // Start download using Chrome Downloads API
  const downloadId = await chrome.downloads.download({
    url: quality.url,
    filename: filename,
    saveAs: true // Let user choose location
  });
  
  console.log('Direct download started:', downloadId);
  setStatus('success', `Download dimulai: ${quality.quality}`);
  
  // Close popup after successful download
  setTimeout(() => {
    window.close();
  }, 1500);
}

async function downloadMergedQuality(quality, title, extension) {
  // Option 1: Try to use server merge endpoint for one-click solution
  try {
    const videoId = extractVideoId(videoData.videoId || getCurrentVideoId());
    if (videoId) {
      const mergeResponse = await fetch(`http://localhost:3500/api/v1/download-merged/${videoId}?height=${quality.height}&fps=${quality.fps || 30}`);
      
      if (mergeResponse.ok) {
        const mergeData = await mergeResponse.json();
        
        if (mergeData.success && mergeData.type === 'progressive') {
          // Server found a progressive stream, use it
          const filename = `${title} [${quality.quality}].${extension}`;
          const downloadId = await chrome.downloads.download({
            url: mergeData.downloadUrl,
            filename: filename,
            saveAs: true
          });
          
          console.log('Progressive download via server:', downloadId);
          setStatus('success', `Download dimulai: ${quality.quality} (with audio)`);
          setTimeout(() => window.close(), 1500);
          return;
        }
      }
    }
  } catch (serverError) {
    console.log('Server merge not available, falling back to separate downloads:', serverError.message);
  }
  
  // Option 2: Fallback to separate video+audio downloads
  await downloadSeparateFiles(quality, title, extension);
}

async function downloadSeparateFiles(quality, title, extension) {
  // For merge-required videos, provide both URLs and instructions
  const videoFilename = `${title} [${quality.quality}] VIDEO-ONLY.${extension}`;
  const audioFilename = `${title} [${quality.quality}] AUDIO-ONLY.${quality.audioFormat || 'webm'}`;
  
  // Download video file
  const videoDownloadId = await chrome.downloads.download({
    url: quality.url,
    filename: videoFilename,
    saveAs: true
  });
  
  console.log('Video download started:', videoDownloadId);
  setStatus('loading', `Download video dimulai, akan download audio...`);
  
  // Wait a moment then download audio file
  setTimeout(async () => {
    try {
      const audioDownloadId = await chrome.downloads.download({
        url: quality.audioUrl,
        filename: audioFilename,
        saveAs: false // Auto save to same directory
      });
      
      console.log('Audio download started:', audioDownloadId);
      
      // Show merge instructions
      setStatus('success', `Download selesai!`);
      showMergeInstructions(quality, title);
      
    } catch (audioError) {
      console.error('Audio download error:', audioError);
      showError(`Video downloaded, tapi audio gagal: ${audioError.message}`);
    }
  }, 2000);
}

function showMergeInstructions(quality, title) {
  // Create instruction popup/alert
  const instructions = `
DOWNLOAD SELESAI! 

Video HD dan Audio terpisah sudah didownload.
Untuk menggabungkan dengan audio, gunakan salah satu cara:

🔧 FFMPEG (Command Line):
ffmpeg -i "${title} [${quality.quality}] VIDEO-ONLY.${quality.container}" -i "${title} [${quality.quality}] AUDIO-ONLY.${quality.audioFormat}" -c copy "${title} [${quality.quality}] MERGED.mp4"

🎬 VIDEO EDITOR:
Import kedua file ke video editor favorit Anda (DaVinci Resolve, Adobe Premiere, etc)

📱 ONLINE TOOL:
Upload kedua file ke online video merger

⚠️ Catatan: YouTube memisahkan video+audio untuk kualitas HD untuk menghemat bandwidth.
  `;
  
  // Show in console for now, can be enhanced with modal later
  console.log(instructions);
  
  // You could also create a modal or notification here
  setTimeout(() => {
    if (confirm('Download selesai! Klik OK untuk melihat instruksi penggabungan di console.')) {
      console.log(instructions);
    }
    window.close();
  }, 3000);
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