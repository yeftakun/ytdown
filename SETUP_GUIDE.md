# Panduan Setup YTDown dengan Backend Localhost

## Masalah yang Dipecahkan

Ekstensi YTDown Anda mengalami error karena semua provider Piped (piped.video, pipedapi.kavin.rocks, dll) sedang down atau tidak responsif:

```
Gagal memulai unduhan: Semua penyedia gagal. Detail: piped.video: Respon bukan JSON | pipedapi.kavin.rocks: HTTP 522 | piped.projectsegfau.lt: HTTP 502
```

Solusi ini menggunakan backend localhost dengan yt-dlp sebagai engine download.

## Prerequisites

1. **Node.js** (versi 14+) - [Download di sini](https://nodejs.org/)
2. **yt-dlp** - YouTube downloader yang powerful

## Langkah Setup

### 1. Setup Backend Localhost

1. Buka PowerShell/Command Prompt di folder `local-backend`
2. Jalankan setup otomatis:
   ```
   setup.bat
   ```
   
   Atau setup manual:
   ```powershell
   # Install dependencies
   npm install
   
   # Install yt-dlp (jika belum ada)
   pip install yt-dlp
   ```

### 2. Start Backend Server

```powershell
# Cara 1: Menggunakan script
start.bat

# Cara 2: Manual
npm start
```

Server akan berjalan di `http://localhost:3001`

### 3. Konfigurasi Ekstensi Chrome

1. **Reload ekstensi** di Chrome (karena ada perubahan manifest)
   - Buka `chrome://extensions/`
   - Klik tombol reload pada ekstensi YTDown

2. **Buka popup ekstensi YTDown**

3. **Di bagian "Template API Penyedia Stream"**, localhost sudah menjadi default:
   ```
   http://localhost:3001/api/v1/streams/{videoId}
   ```

4. **Klik "Simpan Template"**

5. **Test dengan video YouTube apa saja**

## Testing

### Test Backend Server
```powershell
# Health check
curl http://localhost:3001/health

# Test dengan video ID
curl "http://localhost:3001/api/v1/streams/dQw4w9WgXcQ"
```

### Test Ekstensi
1. Buka video YouTube apa saja
2. Klik icon ekstensi YTDown
3. URL video akan otomatis terisi
4. Klik "Unduh Video"

## Keunggulan Solusi Localhost

✅ **Tidak bergantung pada provider eksternal**
✅ **Menggunakan yt-dlp yang selalu update**
✅ **Mendukung berbagai format dan kualitas**
✅ **Lebih cepat karena langsung dari YouTube**
✅ **Tidak ada batasan rate limit**
✅ **Privasi lebih terjamin**

## Troubleshooting

### Error "yt-dlp tidak ditemukan"
```powershell
# Install via pip
pip install yt-dlp

# Atau download manual dari:
# https://github.com/yt-dlp/yt-dlp/releases
```

### Error "Port 3001 sudah digunakan"
- Tutup aplikasi lain yang menggunakan port 3001
- Atau edit `server.js` untuk ganti port

### Error CORS di Chrome
- Pastikan ekstensi sudah di-reload setelah edit manifest.json
- Server sudah dikonfigurasi untuk allow all origins

### Video tidak bisa diunduh
- Pastikan video public (bukan private/unlisted)
- Coba dengan video lain
- Check console browser untuk error details

## Struktur File

```
ytdown/
├── local-backend/
│   ├── package.json      # Dependencies
│   ├── server.js        # Backend server
│   ├── setup.bat        # Setup otomatis
│   ├── start.bat        # Start server
│   └── README.md        # Dokumentasi backend
├── background.js        # Modified: localhost sebagai provider pertama
├── popup.js            # Modified: localhost sebagai default
├── manifest.json       # Modified: added localhost permission
└── SETUP_GUIDE.md      # File ini
```

## Mode Development

Untuk development dengan auto-reload:
```powershell
npm run dev
```

Server akan restart otomatis setiap ada perubahan kode.

---

**Note**: Backend ini akan bekerja selama komputer Anda bisa akses YouTube. Jika YouTube diblok, yt-dlp juga tidak akan bisa bekerja.