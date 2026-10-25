# MoPixel — Lossless Image Optimizer

Web kompresi gambar **lossless** yang berjalan di browser. Siap di-host gratis dengan **GitHub → Vercel**. Tidak memerlukan backend, akun pengguna, API key, atau database.

## Fitur

- ✅ PNG / APNG: optimasi lossless dengan **OxiPNG (WebAssembly)**
- ✅ SVG: menghapus komentar dan deklarasi XML yang tidak dibutuhkan dengan **SVGO**, tanpa mereduksi angka path atau teks
- ✅ Input format lain: JPG/JPEG, WebP, AVIF, GIF, BMP, TIFF, HEIC, HEIF, JXL, ICO, PSD, QOI, DNG, RAW, dsb.
- ✅ Untuk format tanpa optimizer yang aman: **file asli dikembalikan**, bukan dikompresi palsu
- ✅ Batch upload, drag & drop, progress, status jelas, unduh satu file atau ZIP
- ✅ Hasil yang lebih besar otomatis ditolak
- ✅ Tidak mengirim file ke server
- ✅ Responsif untuk HP, tablet, dan desktop

> **Perlu dibaca**: “Bisa menerima semua format” **tidak berarti** “bisa mengecilkan semua format secara lossless”. JPEG dan berbagai format modern memerlukan algoritma lossless khusus, dan tidak semua file dapat diperkecil lagi. MoPixel sengaja tidak menggunakan ulang `canvas.toBlob('image/jpeg')` atau quality=100 sebagai pengganti optimizer lossless (itu tetap dapat menurunkan kualitas JPEG).
>
> **Metadata**: OxiPNG mempertahankan metadata sejauh didukung/masih valid oleh optimasinya, tetapi bukan jaminan identik byte-per-byte untuk seluruh chunk metadata. SVG menghapus komentar dan deklarasi tertentu. Jika memerlukan arsip forensik/metadata absolut, simpan file asli terpisah.

## Cara deploy TANPA CODING (GitHub → Vercel)

1. **Extract ZIP** MoPixel yang sudah diunduh.
2. Buka [github.com/new](https://github.com/new), login, buat repository baru misalnya `mopixel-lossless` dan klik **Create repository**. Pilih Public bila ingin berbagi kode.
3. Di repository, klik **Add file → Upload files**. Upload **isi folder** `mopixel-lossless` (bukan file ZIP dan bukan folder luarnya). Pastikan `package.json`, `index.html`, `vite.config.js`, folder `src`, dan folder `public` ada di akar repository. Klik **Commit changes**.
4. Buka [vercel.com/new](https://vercel.com/new), login menggunakan GitHub lalu **Import Git Repository** yang baru dibuat.
5. Pengaturan: **Framework Preset: Vite**, **Build Command: `npm run build`**, **Output Directory: `dist`**. Biarkan Root Directory `./`.
6. Klik **Deploy**. Selesai! URL berbentuk `https://nama-project.vercel.app`.

Vercel akan build ulang otomatis setelah file di repository GitHub diperbarui.

## Menjalankan di laptop (opsional)

Memerlukan Node.js modern (disarankan v22).

```bash
npm install
npm run dev
```

Buka URL localhost yang ditampilkan di terminal.

Cek production build:

```bash
npm run build
npm run preview
```

## Stack

- Vite (website statis, tanpa server function)
- Vanilla JavaScript + CSS
- `@jsquash/oxipng` WebAssembly — PNG lossless
- `svgo/browser` — optimasi SVG terbatas dan konservatif
- `fflate` — ZIP lokal tanpa kompresi ulang gambar

## Batasan penting

- Kompresi terjadi secara lokal, memakai memori dan CPU perangkat masing-masing. Gambar raksasa dan batch sangat besar bisa lambat.
- HEIC, JXL, RAW, TIFF, dan format lain hanya bisa **dipratinjau** jika browser dapat mendekodenya; meskipun tidak bisa dipratinjau, file tetap bisa diunduh kembali.
- Optimasi SVG dapat mengubah byte sumber, namun tidak mengubah bentuk path atau koordinat; fitur/script SVG tertentu bisa memiliki dependensi pada komentar/deklarasi XML. Bila output bukan lebih kecil, file asli dipertahankan.
- Kompresi JPEG lossless khusus (misalnya `jpegtran -optimize`) dan GIF/WebP optimizers **belum tersedia di v1.0**. Jangan klaim sebaliknya.
- Output ZIP dibuat dalam memori browser; untuk batch gigabyte lebih baik unduh individual.

## Lisensi

MIT untuk kode aplikasi. Library pihak ketiga memiliki lisensi masing-masing.

## Validasi & bantuan AI

- GitHub Actions otomatis mencoba `npm run build` setiap perubahan (lihat tab **Actions**). Jika gagal, jangan lanjut mengklaim situs siap produksi.
- File `PROMPT_ANTIGRAVITY.md` berisi prompt lengkap untuk meminta AI coding melakukan instalasi, perbaikan, build, dan uji browser sebenarnya tanpa perlu coding manual.
- Pengujian awal yang dilakukan saat pembuatan paket: sintaks JavaScript serta interaksi UI dengan worker simulasi. **Instalasi dependency dan build produksi tidak dapat dijalankan pada lingkungan pembuatan karena registry npm tidak dapat diakses.** Uji build production GitHub Actions tetap wajib sebelum deploy.
