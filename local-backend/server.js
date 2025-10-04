const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = 3500;

// yt-dlp configuration
const YTDLP_PATH = 'C:\\Users\\yefta\\AppData\\Roaming\\Python\\Python312\\Scripts\\yt-dlp.exe';

// Helper function to execute yt-dlp with multiple fallbacks
async function executeYtDlp(args, timeout = 20000) {
  const videoUrl = args[args.length - 1]; // Last argument is always the URL
  const baseArgs = args.slice(0, -1); // All args except URL
  
  const commands = [
    // Try with full path and quotes
    `"${YTDLP_PATH}" ${baseArgs.join(' ')} "${videoUrl}"`,
    // Try with full path without quotes
    `${YTDLP_PATH} ${baseArgs.join(' ')} "${videoUrl}"`,
    // Try with just yt-dlp command
    `yt-dlp ${baseArgs.join(' ')} "${videoUrl}"`
  ];
  
  for (let i = 0; i < commands.length; i++) {
    try {
      console.log(`🔄 Attempt ${i + 1}: ${commands[i]}`);
      const { stdout, stderr } = await execAsync(commands[i], {
        timeout: timeout,
        shell: true,
        windowsHide: true
      });
      
      if (stderr && stderr.trim()) {
        console.log(`⚠️ stderr (attempt ${i + 1}): ${stderr.trim()}`);
      }
      
      return { stdout, stderr };
    } catch (error) {
      console.log(`❌ Attempt ${i + 1} failed: ${error.message}`);
      if (i === commands.length - 1) {
        throw error; // Re-throw if all attempts failed
      }
    }
  }
}

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache helper functions
function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit for ${key}`);
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, {
    data: data,
    timestamp: Date.now()
  });
  console.log(`💾 Cached ${key}`);
}

// Enable CORS for Chrome extension
app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'accept', 'accept-language', 'cache-control', 'pragma']
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'YTDown Local Backend is running' });
});

// Main API endpoint that returns ALL available qualities
app.get('/api/v1/streams/:videoId', async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ 
      error: 'Invalid video ID format' 
    });
  }

  try {
    // Check cache first
    const cacheKey = `video_${videoId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    console.log(`🚀 Processing video ID: ${videoId}`);
    const startTime = Date.now();
    
    // Use yt-dlp to get video information and stream URLs
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
      // Use new executeYtDlp function with fallbacks
      const { stdout, stderr } = await executeYtDlp(
        ['-j', '--no-warnings', '--no-playlist', '--skip-download', '--ignore-errors', '--prefer-free-formats', videoUrl], 
        20000
      );

      if (stderr && !stdout) {
        throw new Error(`yt-dlp error: ${stderr}`);
      }

      const videoInfo = JSON.parse(stdout.trim());
      
      // Convert yt-dlp format to quality selector format
      const qualitiesResponse = convertToQualitySelector(videoInfo);
      
      // Cache the result
      setCache(cacheKey, qualitiesResponse);
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ Processed ${videoId} in ${processingTime}ms`);
      
      res.json(qualitiesResponse);
      
    } catch (ytdlpError) {
      console.error('yt-dlp execution error:', ytdlpError.message);
      throw ytdlpError; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    console.error('Error processing request:', error.message);
    
    if (error.message.includes('timeout')) {
      return res.status(408).json({ 
        error: 'Request timeout - video processing took too long' 
      });
    }
    
    if (error.message.includes('Video unavailable') || error.message.includes('Private video')) {
      return res.status(404).json({ 
        error: 'Video not found or unavailable' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to process video',
      details: error.message 
    });
  }
});

// Quick preview endpoint - only basic info for fast loading
app.get('/api/v1/preview/:videoId', async (req, res) => {
  const { videoId } = req.params;
  
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ 
      error: 'Invalid video ID format' 
    });
  }

  try {
    const cacheKey = `preview_${videoId}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    console.log(`⚡ Quick preview for: ${videoId}`);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const startTime = Date.now();
    
    try {
      // Use new executeYtDlp function with fallbacks
      const { stdout, stderr } = await executeYtDlp(
        ['--get-title', '--get-duration', '--no-warnings', videoUrl], 
        20000
      );
      
      const endTime = Date.now();
      console.log(`⚡ Preview fetched in ${endTime - startTime}ms`);
      console.log(`📝 Raw output: ${JSON.stringify(stdout)}`);
      
      if (stderr) {
        console.log(`⚠️ stderr: ${stderr}`);
      }
      
      const lines = stdout.trim().split('\n');
      
      // Last line is duration, everything else is title/description
      const allLines = lines.filter(line => line.trim());
      const duration = allLines[allLines.length - 1];
      const title = allLines[0] || 'Loading...';
      
      const preview = {
        success: true,
        title: title,
        duration: duration && duration.match(/^\d+:\d+$/) ? duration : 'Unknown',
        description: '',
        videoId: videoId,
        isPreview: true
      };
      
      setCache(cacheKey, preview);
      res.json(preview);
      return; // Important: exit here on success
      
    } catch (cmdError) {
      console.error(`❌ Command execution error: ${cmdError.message}`);
      throw cmdError; // Re-throw to be caught by outer catch
    }
    
  } catch (error) {
    console.error(`❌ Preview error for ${videoId}:`, error.message);
    
    // Try basic fallback with just --get-title
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`🔄 Trying fallback for: ${videoId}`);
      
      const { stdout } = await executeYtDlp(
        ['--get-title', '--no-warnings', videoUrl], 
        8000
      );
      
      const title = stdout.trim().split('\n')[0] || 'Loading...';
      
      const fallbackPreview = {
        success: true,
        title: title,
        duration: 'Loading...',
        description: '',
        videoId: videoId,
        isPreview: true,
        fallback: true
      };
      
      setCache(cacheKey, fallbackPreview);
      res.json(fallbackPreview);
    } catch (fallbackError) {
      console.error(`❌ Fallback preview failed for ${videoId}:`, fallbackError.message);
      res.json({
        success: false,
        title: 'Error loading video',
        duration: 'Unknown',
        description: '',
        videoId: videoId,
        isPreview: true,
        error: 'Video may be private or unavailable'
      });
    }
  }
});

// Alternative endpoint for direct download URL (bypasses HLS)
app.get('/api/v1/download/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const { quality = 'best', format = 'mp4' } = req.query;
  
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ 
      error: 'Invalid video ID format' 
    });
  }

  try {
    console.log(`Getting direct download URL for: ${videoId}, quality: ${quality}, format: ${format}`);
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get direct download URL using yt-dlp
    let formatSelector = 'best[ext=mp4]'; // Default to best mp4
    
    if (quality !== 'best') {
      if (quality.includes('p')) {
        const height = quality.replace('p', '');
        formatSelector = `best[height<=${height}][ext=mp4]/best[ext=mp4]`;
      }
    }
    
    const command = `yt-dlp --get-url --no-warnings --format "${formatSelector}" "${videoUrl}"`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });

    if (stderr && !stdout) {
      throw new Error(`yt-dlp error: ${stderr}`);
    }

    const directUrl = stdout.trim().split('\n')[0]; // Get first URL
    
    if (!directUrl || directUrl.includes('.m3u8')) {
      throw new Error('Could not get direct download URL');
    }

    // Get video title for filename
    const titleCommand = `yt-dlp --get-title --no-warnings "${videoUrl}"`;
    const { stdout: titleStdout } = await execAsync(titleCommand, { timeout: 10000 });
    const title = titleStdout.trim() || 'youtube-video';

    res.json({
      success: true,
      downloadUrl: directUrl,
      title: title,
      videoId: videoId,
      quality: quality,
      format: format
    });
    
  } catch (error) {
    console.error('Error getting download URL:', error.message);
    res.status(500).json({ 
      error: 'Failed to get download URL',
      details: error.message 
    });
  }
});

// Smart merging function for video + audio combinations
function createMergedQualities(videoInfo) {
  const videoOnlyFormats = [];
  const audioFormats = [];
  const progressiveFormats = [];
  
  // Separate formats by type
  if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
    for (const format of videoInfo.formats) {
      if (!format.url || format.url.includes('.m3u8') || format.url.includes('manifest')) {
        continue;
      }
      
      if (format.vcodec !== 'none' && format.acodec !== 'none') {
        // Progressive (video + audio combined)
        progressiveFormats.push(format);
      } else if (format.vcodec !== 'none' && format.acodec === 'none') {
        // Video only
        videoOnlyFormats.push(format);
      } else if (format.vcodec === 'none' && format.acodec !== 'none') {
        // Audio only
        audioFormats.push(format);
      }
    }
  }
  
  // Find best audio
  const bestAudio = audioFormats.length > 0 
    ? audioFormats.reduce((best, current) => 
        (current.abr || 0) > (best.abr || 0) ? current : best
      ) 
    : null;
  
  const mergedQualities = [];
  
  // Add progressive formats first (these have audio built-in)
  progressiveFormats.forEach(format => {
    if (format.height) {
      mergedQualities.push({
        height: format.height,
        fps: format.fps || 30,
        quality: `${format.height}p ${format.fps || 30}fps`,
        url: format.url,
        format_id: format.format_id,
        ext: format.ext || 'mp4',
        hasAudio: true,
        videoOnly: false,
        filesize: format.filesize || format.filesize_approx,
        filesizeHuman: formatFileSize(format.filesize || format.filesize_approx),
        vcodec: format.vcodec,
        acodec: format.acodec,
        container: format.ext || 'mp4',
        type: 'progressive',
        downloadMethod: 'direct'
      });
    }
  });
  
  // Add video-only formats with audio merge capability
  videoOnlyFormats.forEach(format => {
    if (format.height && format.height >= 480 && bestAudio) {
      mergedQualities.push({
        height: format.height,
        fps: format.fps || 30,
        quality: `${format.height}p ${format.fps || 30}fps`,
        url: format.url,
        format_id: format.format_id,
        ext: format.ext || 'mp4',
        hasAudio: false, // Will be merged
        videoOnly: true,
        filesize: (format.filesize || format.filesize_approx || 0) + (bestAudio.filesize || bestAudio.filesize_approx || 0),
        filesizeHuman: formatFileSize((format.filesize || format.filesize_approx || 0) + (bestAudio.filesize || bestAudio.filesize_approx || 0)),
        vcodec: format.vcodec,
        acodec: 'merged',
        container: format.ext || 'mp4',
        type: 'video-only',
        downloadMethod: 'merge-required',
        audioUrl: bestAudio.url,
        audioFormat: bestAudio.ext,
        audioBitrate: bestAudio.abr,
        mergeInstruction: {
          videoUrl: format.url,
          audioUrl: bestAudio.url,
          outputFormat: 'mp4'
        }
      });
    }
  });
  
  // Remove duplicates and sort
  const uniqueQualities = mergedQualities.filter((quality, index, self) => 
    index === self.findIndex(q => q.height === quality.height && q.fps === quality.fps)
  );
  
  uniqueQualities.sort((a, b) => {
    // Progressive formats first
    if (a.type === 'progressive' && b.type !== 'progressive') return -1;
    if (a.type !== 'progressive' && b.type === 'progressive') return 1;
    
    // Then by height
    if (a.height !== b.height) return b.height - a.height;
    
    // Then by fps
    return b.fps - a.fps;
  });
  
  return uniqueQualities;
}

// Convert yt-dlp format to quality selector format
function convertToQualitySelector(videoInfo) {
  const availableQualities = createMergedQualities(videoInfo);
  
  return {
    success: true,
    title: videoInfo.title || 'Unknown Title',
    description: videoInfo.description || '',
    uploader: videoInfo.uploader || 'Unknown',
    duration: videoInfo.duration || 0,
    durationString: formatDuration(videoInfo.duration || 0),
    thumbnailUrl: videoInfo.thumbnail || '',
    viewCount: videoInfo.view_count || 0,
    uploadDate: videoInfo.upload_date || '',
    availableQualities: availableQualities,  // Changed from qualities to availableQualities
    totalFormats: availableQualities.length,
    videoId: extractVideoIdFromUrl(videoInfo.webpage_url) || '',
    qualityInfo: {
      progressiveCount: availableQualities.filter(q => q.type === 'progressive').length,
      mergeRequiredCount: availableQualities.filter(q => q.type === 'video-only').length,
      maxProgressiveQuality: Math.max(...availableQualities.filter(q => q.type === 'progressive').map(q => q.height), 0),
      maxMergeQuality: Math.max(...availableQualities.filter(q => q.type === 'video-only').map(q => q.height), 0)
    }
  };
}

function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

function extractVideoIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

// Convert yt-dlp format to Piped API format
function convertToPipedFormat(videoInfo) {
  const videoStreams = [];
  const audioStreams = [];
  
  if (videoInfo.formats && Array.isArray(videoInfo.formats)) {
    for (const format of videoInfo.formats) {
      // Skip formats without URL or HLS/DASH formats
      if (!format.url || format.protocol === 'm3u8_native' || format.protocol === 'http_dash_segments') {
        continue;
      }
      
      // Skip HLS manifest URLs (*.m3u8)
      if (format.url.includes('.m3u8') || format.url.includes('manifest')) {
        continue;
      }
      
      // Progressive streams (video + audio) - prioritize these
      if (format.vcodec !== 'none' && format.acodec !== 'none') {
        videoStreams.push({
          url: format.url,
          format: format.format || 'unknown',
          quality: formatQuality(format),
          mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
          videoOnly: false,
          bitrate: format.tbr || format.vbr || null,
          fps: format.fps || null,
          width: format.width || null,
          height: format.height || null,
          container: format.ext || 'mp4',
          codec: format.vcodec || null
        });
      }
      
      // Video-only streams
      else if (format.vcodec !== 'none' && format.acodec === 'none') {
        videoStreams.push({
          url: format.url,
          format: format.format || 'unknown',
          quality: formatQuality(format),
          mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
          videoOnly: true,
          bitrate: format.vbr || format.tbr || null,
          fps: format.fps || null,
          width: format.width || null,
          height: format.height || null,
          container: format.ext || 'mp4',
          codec: format.vcodec || null
        });
      }
      
      // Audio-only streams
      else if (format.vcodec === 'none' && format.acodec !== 'none') {
        audioStreams.push({
          url: format.url,
          format: format.format || 'unknown',
          quality: format.abr ? `${format.abr}kbps` : 'unknown',
          mimeType: format.ext ? `audio/${format.ext}` : 'audio/mp4',
          bitrate: format.abr || format.tbr || null,
          container: format.ext || 'mp4',
          codec: format.acodec || null
        });
      }
    }
  }
  
  // Sort video streams: progressive first, then by quality (highest first)
  videoStreams.sort((a, b) => {
    // Prioritize progressive streams (video + audio)
    if (!a.videoOnly && b.videoOnly) return -1;
    if (a.videoOnly && !b.videoOnly) return 1;
    
    // Then sort by quality
    const aQuality = extractQualityNumber(a.quality);
    const bQuality = extractQualityNumber(b.quality);
    return bQuality - aQuality;
  });
  
  return {
    title: videoInfo.title || 'Unknown Title',
    description: videoInfo.description || '',
    uploader: videoInfo.uploader || 'Unknown',
    uploaderUrl: videoInfo.uploader_url || '',
    uploaderAvatar: videoInfo.uploader_avatar || '',
    thumbnailUrl: videoInfo.thumbnail || '',
    hls: videoInfo.manifest_url || null,
    dash: null,
    lbryId: null,
    category: videoInfo.categories ? videoInfo.categories[0] : 'Unknown',
    license: null,
    visibility: 'public',
    tags: videoInfo.tags || [],
    metaInfo: [],
    uploaderVerified: false,
    duration: videoInfo.duration || 0,
    views: videoInfo.view_count || 0,
    likes: videoInfo.like_count || 0,
    dislikes: 0,
    uploadDate: videoInfo.upload_date || '',
    livestream: videoInfo.is_live || false,
    proxyUrl: '',
    chapters: [],
    videoStreams: videoStreams,
    audioStreams: audioStreams,
    relatedStreams: [],
    subtitles: [],
    previewFrames: []
  };
}

function formatQuality(format) {
  if (format.height) {
    const fps = format.fps ? `${Math.round(format.fps)}fps` : '';
    return `${format.height}p${fps}`;
  }
  
  if (format.format_note) {
    return format.format_note;
  }
  
  if (format.resolution && format.resolution !== 'audio only') {
    return format.resolution;
  }
  
  return 'unknown';
}

function extractQualityNumber(quality) {
  if (!quality) return 0;
  const match = quality.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: error.message 
  });
});

// Merged download endpoint - get separate video+audio URLs for HD quality
app.get('/api/v1/download-merged/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const { height = '720', fps = '30' } = req.query;
  
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ 
      error: 'Invalid video ID format' 
    });
  }

  try {
    console.log(`🔄 Getting merged download for: ${videoId} at ${height}p ${fps}fps`);
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Get video+audio URLs using format selector
    const formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
    
    const { stdout, stderr } = await executeYtDlp(
      ['--get-url', '--no-warnings', '--format', formatSelector, videoUrl], 
      20000
    );

    if (stderr && !stdout) {
      throw new Error(`yt-dlp error: ${stderr}`);
    }

    const lines = stdout.trim().split('\n');
    
    if (lines.length >= 2) {
      // Two URLs means video + audio separate
      const videoUrl = lines[0];
      const audioUrl = lines[1];
      
      res.json({
        success: true,
        type: 'merge-required',
        videoUrl: videoUrl,
        audioUrl: audioUrl,
        videoId: videoId,
        quality: `${height}p ${fps}fps`,
        mergeInstruction: {
          message: 'Download both URLs and merge with ffmpeg or similar tool',
          command: `ffmpeg -i "${videoUrl}" -i "${audioUrl}" -c copy merged_${videoId}.mp4`
        }
      });
    } else if (lines.length === 1) {
      // One URL means progressive stream
      res.json({
        success: true,
        type: 'progressive',
        downloadUrl: lines[0],
        videoId: videoId,
        quality: `${height}p ${fps}fps`
      });
    } else {
      throw new Error('No valid URLs returned');
    }
    
  } catch (error) {
    console.error('Error getting merged download:', error.message);
    res.status(500).json({ 
      error: 'Failed to get merged download URLs',
      details: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found' 
  });
});

app.listen(PORT, () => {
  console.log(`YTDown Local Backend running on http://localhost:${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/v1/streams/{videoId}`);
  console.log('Make sure yt-dlp is installed and available in your PATH');
});

module.exports = app;