# 🔧 Fix untuk Masalah Download .m3u8

## ❌ **Masalah yang Terjadi**

Ketika menggunakan ekstensi YTDown, file yang terdownload berformat `.m3u8` (HLS playlist) bukan `.mp4` seperti yang diharapkan.

### Penyebab:
- YouTube sekarang lebih sering menggunakan **HLS (HTTP Live Streaming)** untuk video
- yt-dlp mengembalikan playlist `.m3u8` yang berisi segmen-segmen video
- Ekstensi Chrome tidak bisa menggabungkan segmen HLS secara langsung

## ✅ **Solusi yang Diterapkan**

### 1. **Backend Server Diperbaiki**
- ❌ Filter untuk mengabaikan URL `.m3u8` dan `manifest`
- ❌ Prioritas untuk stream progressive (video+audio dalam satu file)
- ➕ Endpoint baru `/api/v1/download/{videoId}` untuk direct download URL
- ➕ Parameter `--prefer-free-formats` pada yt-dlp

### 2. **Ekstensi Chrome Diupgrade**
- ➕ Fallback ke direct download endpoint jika stream utama gagal
- ➕ Deteksi HLS URL dan menghindarinya
- ➕ Prioritas untuk format MP4 progressive

### 3. **Dual-Strategy Approach**
```
1. Coba endpoint utama: /api/v1/streams/{videoId}
   ↓ (jika tidak ada progressive stream)
2. Fallback ke: /api/v1/download/{videoId}
   ↓ (menggunakan yt-dlp --get-url)
3. Return direct MP4 URL
```

## 🚀 **Cara Menggunakan**

### **Otomatis (Recommended)**
Ekstensi akan otomatis menggunakan strategi terbaik:
1. Start server: `cd local-backend && node server.js`
2. Reload ekstensi Chrome
3. Download video seperti biasa

### **Manual Testing**
Test endpoint langsung:
```bash
# Test endpoint utama
curl "http://localhost:3001/api/v1/streams/dQw4w9WgXcQ"

# Test direct download endpoint
curl "http://localhost:3001/api/v1/download/dQw4w9WgXcQ?quality=720p&format=mp4"
```

## 📋 **API Endpoints Baru**

### `/api/v1/download/{videoId}`
**Query Parameters:**
- `quality` (optional): `best`, `720p`, `480p`, `360p`, etc.
- `format` (optional): `mp4` (default)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "https://direct-video-url.googlevideo.com/...",
  "title": "Video Title",
  "videoId": "dQw4w9WgXcQ",
  "quality": "720p",
  "format": "mp4"
}
```

## 🔍 **Debugging**

### Jika masih download .m3u8:
1. **Check server logs** - lihat apakah ada error di console
2. **Test manual** - coba endpoint `/api/v1/download/` langsung
3. **Check yt-dlp version** - pastikan up-to-date: `yt-dlp --version`
4. **Clear browser cache** - reload ekstensi Chrome

### Log Messages:
```
✅ "No progressive streams found, trying direct download endpoint..."
✅ "Getting direct download URL for: {videoId}"
❌ "Direct download attempt failed"
```

## 🎯 **Format Priority**

Urutan prioritas download:
1. **Progressive MP4** (video+audio, single file) ⭐
2. **Progressive WebM** (video+audio, single file)
3. **Direct MP4 URL** (via yt-dlp --get-url)
4. **Separate video+audio** (requires merging)

## ⚙️ **Konfigurasi Lanjutan**

Edit `server.js` untuk custom behavior:
```javascript
// Prefer specific format
let formatSelector = 'best[height<=720][ext=mp4]/best[ext=mp4]';

// Force MP4 only
let formatSelector = 'best[ext=mp4]';

// Best quality regardless of format
let formatSelector = 'best';
```

---

**Note:** Perubahan ini memastikan ekstensi selalu mendapat direct download URL untuk file MP4, bukan HLS playlist.