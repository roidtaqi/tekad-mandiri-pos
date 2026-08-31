# Kastur Retail System v2 — Panduan Deployment Operasional Railway

Panduan ini adalah dokumentasi resmi dan otoritatif untuk melakukan provisioning, deployment, inisialisasi, dan pemeliharaan **Kastur Retail System v2** pada platform hosting **Railway**.

---

## 1. Arsitektur & Topologi Layanan

Sistem Kastur terdiri dari 4 layanan terkelola di Railway dalam 1 Project:

```text
[ Railway Project ]
├── PostgreSQL (Database Terkelola Railway)
├── kastur-api (Backend Modular Monolith Node.js HTTP Server)
├── kastur-backoffice (Frontend Web Manajemen SPAs)
└── kastur-pos (Frontend Web / PWA Kasir Offline-First)
```

Seluruh layanan dibangun dari monorepo tunggal `tekad-mandiri-pos`.

---

## 2. Persyaratan & Variabel Lingkungan

### A. Variabel Server-Only (`kastur-api`)
*Variabel ini hanya berada di server API dan tidak boleh diekspos ke frontend atau bundle browser.*

| Variabel | Keterangan | Wajib/Opsional |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (`${{Postgres.DATABASE_URL}}`) | **Wajib** |
| `KASTUR_SETUP_TOKEN` | Token rahasia satu kali untuk mengotorisasi inisialisasi toko awal (`POST /api/v1/system/setup`) | **Wajib di Production** |
| `ALLOWED_ORIGINS` | Daftar domain frontend yang diizinkan (CORS), dipisahkan koma (contoh: `https://kastur-pos.up.railway.app,https://kastur-backoffice.up.railway.app`) | Disarankan di Prod |
| `PORT` | Port server internal (disediakan otomatis oleh Railway, default `8787`) | Otomatis |
| `HOST` | Bind address (default `0.0.0.0`) | Opsional |
| `OFFLINE_AUTH_SIGNING_PRIVATE_KEY_JWK` | Kunci privat ECDSA P-256 (JWK) untuk menandatangani offline auth grants | Opsional |
| `OFFLINE_AUTH_SIGNING_KEY_ID` | Identifier kunci offline | Opsional |

### B. Variabel Publik Frontend (`kastur-backoffice` & `kastur-pos`)
*Variabel ini dibaca saat build Vite (`import.meta.env`).*

| Variabel | Keterangan | Wajib/Opsional |
|---|---|---|
| `VITE_API_BASE_URL` | URL publik API backend (contoh: `https://kastur-api.up.railway.app`) | **Wajib** |
| `PORT` | Port server static SPA (disediakan otomatis oleh Railway, default `3000`) | Otomatis |
| `VITE_OFFLINE_AUTH_KEY_ID` | Identifier kunci publik offline auth (hanya POS) | Opsional |
| `VITE_OFFLINE_AUTH_PUBLIC_KEY_JWK` | Kunci publik offline auth format JWK (hanya POS) | Opsional |

---

## 3. Langkah-Langkah Deployment Langkah Demi Langkah

### Langkah 1: Buat Railway Project
1. Buka [Railway Dashboard](https://railway.com) dan buat **New Project**.
2. Pilih **Deploy from GitHub repo** atau mulai dengan **Empty Project**.

### Langkah 2: Tambahkan Database PostgreSQL
1. Pada kanvas project, klik **+ New** -> **Database** -> **Add PostgreSQL**.
2. Railway akan membuat instance PostgreSQL dan mengekspos variabel `DATABASE_URL`.

### Langkah 3: Deploy `kastur-api`
1. Klik **+ New** -> **GitHub Repo** -> Pilih repositori `tekad-mandiri-pos`.
2. Beri nama service: `kastur-api`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/api`
   - **Start Command**: `npm run start --workspace @kastur/api`
   - **Healthcheck Path**: `/health/ready`
   - **Healthcheck Timeout**: `300` detik
4. Di tab **Variables**:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `KASTUR_SETUP_TOKEN`: Hasilkan string acak aman (misal: `openssl rand -hex 24`).
   - `ALLOWED_ORIGINS`: Masukkan URL domain POS dan Back Office setelah domain terbuat.
5. Di tab **Networking**:
   - Klik **Generate Domain** untuk mendapatkan URL publik (misal `https://kastur-api.up.railway.app`).

### Langkah 4: Jalankan Migrasi Database
Jalankan migrasi PostgreSQL forward-only menggunakan Railway CLI dari terminal lokal Anda:

```bash
railway link # Pilih project Railway Anda
railway run npm run db:migrate
```

Atau jadwalkan migrasi sebagai Pre-deploy Command di settings `kastur-api`:
`npm run db:migrate`

### Langkah 5: Deploy `kastur-backoffice`
1. Klik **+ New** -> **GitHub Repo** -> Pilih repositori `tekad-mandiri-pos`.
2. Beri nama service: `kastur-backoffice`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/backoffice`
   - **Start Command**: `npm run start --workspace @kastur/backoffice`
   - **Healthcheck Path**: `/health`
4. Di tab **Variables**:
   - `VITE_API_BASE_URL`: `https://${{kastur-api.RAILWAY_PUBLIC_DOMAIN}}` (atau URL publik API Anda).
5. Di tab **Networking**:
   - Klik **Generate Domain** (misal `https://kastur-backoffice.up.railway.app`).

### Langkah 6: Deploy `kastur-pos`
1. Klik **+ New** -> **GitHub Repo** -> Pilih repositori `tekad-mandiri-pos`.
2. Beri nama service: `kastur-pos`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/pos`
   - **Start Command**: `npm run start --workspace @kastur/pos`
   - **Healthcheck Path**: `/health`
4. Di tab **Variables**:
   - `VITE_API_BASE_URL`: `https://${{kastur-api.RAILWAY_PUBLIC_DOMAIN}}` (atau URL publik API Anda).
5. Di tab **Networking**:
   - Klik **Generate Domain** (misal `https://kastur-pos.up.railway.app`).

---

## 4. Inisialisasi Toko Pertama (First-Run Setup)

Setelah database terhubung dan migrasi berhasil dijalankan, lakukan inisialisasi toko pertama.

### Metode A: Melalui Antarmuka Back Office (Direkomendasikan)
1. Buka URL `kastur-backoffice` di browser.
2. Sistem otomatis mendeteksi database baru dan menampilkan formulir **Inisialisasi Toko Baru**.
3. Masukkan **Kunci Inisialisasi Server** (`KASTUR_SETUP_TOKEN` yang telah diset pada `kastur-api`).
4. Lengkapi nama bisnis, nama pemilik, email pemilik, lokasi toko, dan nama terminal awal ("Kasir 1").
5. Klik **Inisialisasi & Masuk ke Back Office**.
6. Sistem akan membuat toko dan langsung membawa Anda masuk ke dashboard Back Office.

### Metode B: Melalui CLI
```bash
railway run npm run bootstrap
```
Script akan meminta konfirmasi dan mencetak rincian akun serta kode sesi awal.

---

## 5. Menghubungkan Terminal Kasir (Kastur POS)

1. Buka URL `kastur-pos` pada perangkat kasir atau browser kasir.
2. Masukkan **Kode Sesi (Session Secret)** kasir/owner yang diperoleh saat bootstrap.
3. **Pemilihan Terminal**:
   - Jika hanya ada 1 terminal ("Kasir 1 — Toko Utama"), sistem otomatis memilihnya.
   - Jika terdapat beberapa terminal, pilih terminal kasir dari dropdown yang tersedia.
4. Klik **Masuk dan Siapkan POS**.
5. Sistem akan mendaftarkan perangkat kasir (`X-Kastur-Device-Id`) secara terotorisasi dan mengunduh data awal (catalog, pricing, shift context).
6. Buka Shift Kasir dengan modal awal dan mulai melayani transaksi.

---

## 6. Prosedur Uji Asap (Smoke Test Procedure)

Lakukan pengujian berikut untuk memvalidasi keberhasilan deployment:

1. **Healthchecks**:
   - `curl -f https://<api-domain>/health` -> `{"status":"ok"}`
   - `curl -f https://<backoffice-domain>/health` -> `{"status":"ok"}`
   - `curl -f https://<pos-domain>/health` -> `{"status":"ok"}`
2. **Setup Protection**:
   - `curl -X POST https://<api-domain>/api/v1/system/setup` tanpa token -> HTTP 401 `SETUP_UNAUTHORIZED`.
3. **POS Sale & Offline Resiliency**:
   - Buka POS, buat transaksi tunai penjualan 1 item.
   - Putuskan koneksi internet (DevTools Offline).
   - Buat transaksi penjualan kedua (tersimpan di antrean lokal Outbox).
   - Sambungkan kembali internet -> outbox terdorong otomatis ke server PostgreSQL via push sync.
4. **Back Office Visibility**:
   - Masuk ke Back Office -> Transaksi dan pergerakan stok muncul pada ringkasan operasional.

---

## 7. Pembaruan & Pemeliharaan (Redeployment)

- **Forward-only Migrations**: Selalu jalankan `railway run npm run db:migrate` sebelum atau selama deploy versi baru yang memiliki file migrasi baru di `database/migrations/`.
- **Zero-Downtime Rollout**: Railway menerapkan rolling deployments; healthcheck `/health` memastikan container baru siap melayani trafik sebelum container lama dimatikan.
- **Database Backup**: Aktifkan fitur automated daily backups pada plugin PostgreSQL di Railway Dashboard.
