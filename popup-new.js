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

  // Special handling for merge-required videos
  if (quality.downloadMethod === 'merge-required') {
    const progressiveAlternative = videoData.availableQualities.find(q => q.type === 'progressive');
    
    let confirmMessage = `
⚠️  KUALITAS HD MEMERLUKAN MERGE

${quality.quality} akan didownload sebagai 2 file terpisah:
• Video: ${quality.filesizeHuman} (tanpa audio)  
• Audio: ${Math.round((quality.audioBitrate || 130) / 8)} KB/s

Setelah download, Anda perlu menggabungkannya dengan:
✅ FFmpeg command (akan dicopy otomatis)
✅ Video editor (DaVinci Resolve, etc)
✅ Online merger tools

────────────────────────────────────────`;

    if (progressiveAlternative) {
      confirmMessage += `
🎯 ALTERNATIF MUDAH:
${progressiveAlternative.quality} (${progressiveAlternative.filesizeHuman}) - Langsung dengan audio!

────────────────────────────────────────`;
    }

    confirmMessage += `
Lanjutkan download HD yang perlu merge?`;

    const userConfirmed = confirm(confirmMessage);
    
    if (!userConfirmed) {
      // If user cancels, suggest the progressive alternative
      if (progressiveAlternative) {
        const useAlternative = confirm(`
🎯 Download alternatif ${progressiveAlternative.quality} saja?

Kualitas lebih rendah tapi langsung dengan audio (tidak perlu merge).
        `);
        
        if (useAlternative) {
          const altIndex = videoData.availableQualities.findIndex(q => q.type === 'progressive');
          downloadQuality(altIndex);
          return;
        }
      }
      return; // User cancelled completely
    }
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
  
  try {
    // Download video file first
    setStatus('loading', `📹 Mendownload video ${quality.quality}...`);
    const videoDownloadId = await chrome.downloads.download({
      url: quality.url,
      filename: videoFilename,
      saveAs: true
    });
    
    console.log('Video download started:', videoDownloadId);
    setStatus('loading', `📹 Video dimulai, menunggu audio...`);
    
    // Wait a moment then download audio file
    setTimeout(async () => {
      try {
        setStatus('loading', `🎵 Mendownload audio...`);
        const audioDownloadId = await chrome.downloads.download({
          url: quality.audioUrl,
          filename: audioFilename,
          saveAs: false // Auto save to same directory
        });
        
        console.log('Audio download started:', audioDownloadId);
        
        // Show merge instructions with better feedback
        setStatus('success', `✅ Download selesai! Cek instruksi merge.`);
        showMergeInstructions(quality, title, videoFilename, audioFilename);
        
      } catch (audioError) {
        console.error('Audio download error:', audioError);
        showError(`📹 Video berhasil, tapi 🎵 audio gagal: ${audioError.message}`);
      }
    }, 2000);
    
  } catch (videoError) {
    console.error('Video download error:', videoError);
    showError(`📹 Video download gagal: ${videoError.message}`);
  }
}

function showMergeInstructions(quality, title, videoFilename, audioFilename) {
  // Create exact filenames as they will appear in downloads
  const outputFile = `${title} [${quality.quality}] MERGED.mp4`;
  const ffmpegCommand = `ffmpeg -i "${videoFilename}" -i "${audioFilename}" -c copy "${outputFile}"`;
  
  // Create detailed instruction modal
  const instructions = `
🎉 DOWNLOAD SELESAI! 

✅ File Video: ${videoFilename}
✅ File Audio: ${audioFilename}

═══════════════════════════════════════

🔧 CARA MENGGABUNGKAN:

📋 1. COPY COMMAND INI (Recommended):
${ffmpegCommand}

🎬 2. VIDEO EDITOR (User-Friendly):
• DaVinci Resolve (Free): https://blackmagicdesign.com/products/davinciresolve
• OpenShot (Free): https://www.openshot.org
• Adobe Premiere Pro (Paid)

🌐 3. ONLINE TOOLS (No Install):
• Clideo: https://clideo.com/merge-video
• Online Convert: https://www.online-convert.com
• Kapwing: https://www.kapwing.com/tools/join-video

⚡ 4. QUICK BATCH FILE (Windows):
Buat file .bat dengan isi:
@echo off
cd /d "%~dp0"
${ffmpegCommand}
pause

════════════════════════════════════════

ℹ️ Kenapa terpisah? YouTube memisahkan video+audio HD untuk menghemat bandwidth.
✨ Setelah digabung, Anda akan dapat file HD lengkap dengan audio!
  `;
  
  // Show in console for copy-paste
  console.log(instructions);
  
  // Auto-copy FFmpeg command to clipboard
  if (navigator.clipboard) {
    navigator.clipboard.writeText(ffmpegCommand).then(() => {
      console.log('✅ FFmpeg command berhasil dicopy ke clipboard!');
      
      // Show success notification
      const userChoice = confirm(`
🎉 DOWNLOAD SELESAI!

Video HD dan audio sudah didownload terpisah.
FFmpeg command sudah dicopy ke clipboard!

📋 Paste command di terminal/cmd untuk merge:
${ffmpegCommand}

🌐 Atau gunakan online tools (lihat console untuk link)

Klik OK untuk melihat semua opsi di console.
Klik Cancel untuk menutup.
      `);
      
      if (userChoice) {
        console.log('%c📋 FFMPEG COMMAND (SUDAH DI CLIPBOARD):', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
        console.log(ffmpegCommand);
        console.log('%c🌐 ONLINE TOOLS ALTERNATIF:', 'color: #2196F3; font-weight: bold; font-size: 14px;');
        console.log('• Clideo: https://clideo.com/merge-video');
        console.log('• Kapwing: https://www.kapwing.com/tools/join-video');
      }
      
    }).catch(() => {
      // Fallback if clipboard fails
      showClipboardFallback(ffmpegCommand);
    });
  } else {
    // Fallback if clipboard API not available
    showClipboardFallback(ffmpegCommand);
  }
  
  // Close popup after showing instructions
  setTimeout(() => window.close(), 2000);
}

function showClipboardFallback(command) {
  const userChoice = confirm(`
🎉 DOWNLOAD SELESAI!

Video HD dan audio sudah didownload terpisah.

📋 Copy command ini untuk merge:
${command}

🌐 Atau gunakan online tools (lihat console untuk link)

Klik OK untuk melihat semua opsi di console.
  `);
  
  if (userChoice) {
    console.log('%c📋 COPY COMMAND INI:', 'color: #4CAF50; font-weight: bold; font-size: 14px;');
    console.log(command);
    console.log('%c🌐 ONLINE TOOLS ALTERNATIF:', 'color: #2196F3; font-weight: bold; font-size: 14px;');
    console.log('• Clideo: https://clideo.com/merge-video');
    console.log('• Kapwing: https://www.kapwing.com/tools/join-video');
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