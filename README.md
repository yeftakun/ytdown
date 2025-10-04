# YTDown Chrome Extension

Ekstensi Chrome sederhana untuk menambahkan tombol "Download Video" langsung di halaman YouTube serta menyediakan popup yang bisa menerima link YouTube secara manual.

## Fitur

- Menyuntikkan tombol **Download Video** pada halaman `watch` YouTube desktop.
- Popup ekstensi dengan input URL sehingga bisa mengunduh dari mana saja.
- Mendukung beberapa penyedia stream progresif berbasis API Piped/yt-dlp dengan fallback otomatis.
- Mengunduh menggunakan API `chrome.downloads` sehingga file tersimpan lewat pengelola unduhan Chrome.

## Struktur

```
manifest.json        # Konfigurasi utama ekstensi (Manifest V3)
background.js        # Service worker: ambil metadata stream & panggil download
contentScript.js     # Menambahkan tombol pada halaman YouTube
popup.html/js        # UI popup + pengaturan endpoint API
```

## Cara Menggunakan

1. Buka Chrome → `chrome://extensions`.
2. Aktifkan **Developer mode** (kanan atas).
3. Pilih **Load unpacked** dan arahkan ke folder repo ini (`d:\code\ytdown`).
4. Buka salah satu video YouTube → tombol **Download Video** akan muncul di area tombol aksi.
5. Klik tombol tersebut atau gunakan ikon ekstensi di toolbar, tempel link YouTube, dan tekan **Download**.
6. Pilih lokasi penyimpanan saat diminta oleh Chrome.

## Mengatur Penyedia Stream

- Secara default ekstensi mencoba beberapa endpoint Piped publik, misalnya `https://piped.video/api/v1/streams/{videoId}`.
- Jika penyedia default diblokir (sering terlihat sebagai pesan "Respon bukan JSON" atau hanya menampilkan HTML), buka popup ekstensi → bagian **Pengaturan lanjutan**.
- Isikan template API dengan placeholder `{videoId}`, contoh:
  - `https://piped.video/api/v1/streams/{videoId}`
  - `https://server-anda.local/download?target={videoId}` (sesuaikan dengan backend Anda).
- Klik **Simpan** untuk menjadikannya default atau **Tes** untuk memastikan endpoint mengembalikan metadata JSON.
- Pastikan domain yang digunakan sudah ada di `host_permissions` pada `manifest.json` bila berbeda dari daftar bawaan.

## Catatan

- Ketersediaan stream progresif (video+audio) sepenuhnya bergantung pada penyedia API yang digunakan.
- Jika semua penyedia gagal, coba kunjungi langsung situs API tersebut di browser (untuk melewati captcha) atau gunakan backend pribadi berbasis `yt-dlp`.
- Mengunduh konten YouTube mungkin melanggar Ketentuan Layanan YouTube. Pastikan penggunaan Anda mematuhi kebijakan yang berlaku.
