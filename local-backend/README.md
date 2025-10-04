# YTDown Local Backend

Backend lokal untuk ekstensi Chrome YTDown menggunakan yt-dlp.

## Prerequisites

1. **Node.js** (versi 14 atau lebih baru)
2. **yt-dlp** harus terinstall dan tersedia di PATH

### Install yt-dlp

#### Windows (menggunakan pip):
```powershell
pip install yt-dlp
```

#### Windows (menggunakan chocolatey):
```powershell
choco install yt-dlp
```

#### Windows (download manual):
1. Download `yt-dlp.exe` dari [GitHub releases](https://github.com/yt-dlp/yt-dlp/releases)
2. Letakkan di folder yang ada di PATH, atau buat folder baru dan tambahkan ke PATH

## Setup

1. Install dependencies:
```powershell
npm install
```

2. Start server:
```powershell
npm start
```

Atau untuk development dengan auto-reload:
```powershell
npm run dev
```

Server akan berjalan di `http://localhost:3001`

## Testing

Test server dengan curl atau browser:
```powershell
# Health check
curl http://localhost:3001/health

# Test dengan video ID YouTube
curl "http://localhost:3001/api/v1/streams/dQw4w9WgXcQ"
```

## Konfigurasi Ekstensi

1. Buka ekstensi YTDown
2. Di bagian "Template API Penyedia Stream", masukkan:
   ```
   http://localhost:3001/api/v1/streams/{videoId}
   ```
3. Klik "Simpan Template"
4. Test dengan video YouTube apa saja

## Troubleshooting

### Error "yt-dlp tidak ditemukan"
- Pastikan yt-dlp terinstall: `yt-dlp --version`
- Pastikan yt-dlp ada di PATH

### Error CORS
- Server sudah dikonfigurasi untuk menerima request dari ekstensi Chrome
- Jika masih ada masalah, coba restart browser

### Timeout
- Video yang sangat panjang mungkin butuh waktu lebih lama
- Server timeout diset 30 detik, bisa disesuaikan di `server.js`

### Video tidak ditemukan
- Pastikan video public dan tidak dibatasi region
- Coba dengan video ID yang berbeda

## API Format

Server ini mengkonversi output yt-dlp ke format yang kompatibel dengan Piped API yang diharapkan ekstensi YTDown.

Endpoint: `GET /api/v1/streams/{videoId}`

Response format mirip dengan Piped API dengan field:
- `title`: Judul video
- `videoStreams`: Array stream video dengan berbagai kualitas
- `audioStreams`: Array stream audio
- Dan field metadata lainnya