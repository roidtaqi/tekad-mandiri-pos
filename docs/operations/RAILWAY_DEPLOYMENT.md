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
| `NODE_ENV` | Mode runtime server (`production`) | **Wajib di Production** |
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

## 3. Konfigurasi Layanan Railway (Per-Service)

Deployment menggunakan konfigurasi per-service standar Railway:

### Layanan 1: Database PostgreSQL
1. Di project Railway, klik **+ New** -> **Database** -> **Add PostgreSQL**.
2. Railway otomatis mengekspos variabel `${{Postgres.DATABASE_URL}}`.

### Layanan 2: `kastur-api`
1. Klik **+ New** -> **GitHub Repo** -> Pilih `tekad-mandiri-pos`.
2. Beri nama service: `kastur-api`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/api`
   - **Start Command**: `npm run start --workspace @kastur/api`
   - **Pre-deploy Command**: `npm run db:migrate` *(Kontrak migrasi otomatis kanonikal)*
   - **Healthcheck Path**: `/health/ready`
   - **Healthcheck Timeout**: `300` detik
4. Di tab **Variables**:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `KASTUR_SETUP_TOKEN`: Hasilkan string acak aman (misal: `openssl rand -hex 24`).
   - `ALLOWED_ORIGINS`: Masukkan URL publik Back Office dan POS setelah domain dibuat.
5. Di tab **Networking**:
   - Klik **Generate Domain** (misal `https://kastur-api.up.railway.app`).

### Layanan 3: `kastur-backoffice`
1. Klik **+ New** -> **GitHub Repo** -> Pilih `tekad-mandiri-pos`.
2. Beri nama service: `kastur-backoffice`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/backoffice`
   - **Start Command**: `npm run start --workspace @kastur/backoffice`
   - **Healthcheck Path**: `/health`
4. Di tab **Variables**:
   - `VITE_API_BASE_URL`: `https://${{kastur-api.RAILWAY_PUBLIC_DOMAIN}}`
5. Di tab **Networking**:
   - Klik **Generate Domain** (misal `https://kastur-backoffice.up.railway.app`).

### Layanan 4: `kastur-pos`
1. Klik **+ New** -> **GitHub Repo** -> Pilih `tekad-mandiri-pos`.
2. Beri nama service: `kastur-pos`.
3. Di tab **Settings**:
   - **Build Command**: `npm ci && npm run build --workspace @kastur/pos`
   - **Start Command**: `npm run start --workspace @kastur/pos`
   - **Healthcheck Path**: `/health`
4. Di tab **Variables**:
   - `VITE_API_BASE_URL`: `https://${{kastur-api.RAILWAY_PUBLIC_DOMAIN}}`
5. Di tab **Networking**:
   - Klik **Generate Domain** (misal `https://kastur-pos.up.railway.app`).

---

## 4. Inisialisasi Toko & Onboarding POS Pertama

### Langkah 1: Inisialisasi Toko di Back Office
1. Buka URL `kastur-backoffice` di browser.
2. Formulir **Inisialisasi Toko Baru** otomatis terbuka saat database baru terdeteksi.
3. Masukkan **Kunci Inisialisasi Server** (`KASTUR_SETUP_TOKEN` yang diset di `kastur-api`).
4. Lengkapi nama bisnis, nama pemilik, email pemilik, lokasi toko, dan nama terminal awal ("Kasir 1").
5. Klik **Inisialisasi & Buat Toko**.

### Langkah 2: Dapatkan Kode Sesi POS
1. Setelah inisialisasi berhasil, antarmuka Back Office menampilkan kartu sukses dengan **Kode Sesi Kasir / Owner (One-Time Secret)**.
2. Klik tombol **Salin Kode Sesi POS**.
3. Klik **Masuk ke Back Office Sekarang** untuk mengelola master data toko di Back Office.

### Langkah 3: Siapkan Terminal Kasir (Kastur POS)
1. Buka URL `kastur-pos` pada perangkat kasir.
2. Tempel **Kode Sesi** yang telah disalin.
3. Sistem mendeteksi terminal yang tersedia ("Kasir 1 — Toko Utama").
4. Klik **Masuk dan Siapkan POS**.
5. Perangkat kasir didaftarkan secara terotorisasi dan data awal toko diunduh.
6. Buka Shift Kasir dan mulai bertransaksi.

---

## 5. Prosedur Uji Asap (Smoke Test Procedure)

1. **Liveness & Readiness**:
   - `curl -f https://<api-domain>/health` -> `{"status":"ok"}`
   - `curl -f https://<api-domain>/health/ready` -> `{"status":"ok"}`
   - `curl -f https://<backoffice-domain>/health` -> `{"status":"ok"}`
   - `curl -f https://<pos-domain>/health` -> `{"status":"ok"}`
2. **Setup Token Protection**:
   - `curl -X POST https://<api-domain>/api/v1/system/setup` tanpa token -> HTTP 401 `SETUP_UNAUTHORIZED`.
3. **CORS Preflight**:
   - `curl -X OPTIONS https://<api-domain>/api/v1/system/setup -H "Origin: https://<backoffice-domain>" -H "Access-Control-Request-Headers: content-type,x-kastur-setup-token" -H "Access-Control-Request-Method: POST"` -> HTTP 204.
4. **Transaksi POS Offline-First**:
   - Lakukan transaksi kasir di POS.
   - Putuskan internet -> lakukan penjualan kedua (tersimpan di Outbox lokal).
   - Sambungkan kembali internet -> outbox terdorong otomatis ke server.

---

## 6. Pemeliharaan & Migrasi Manual

- **Migrasi Otomatis**: Setiap deploy baru menjalankan `npm run db:migrate` sebagai Pre-deploy Command.
- **Migrasi Manual (Troubleshooting/Verifikasi)**:
  ```bash
  railway link # Hubungkan project
  railway run npm run db:migrate
  ```
- **Database Backup**: Aktifkan automated daily backups pada plugin PostgreSQL di Railway Dashboard.
