# 📸 Photobooth — Laravel + Midtrans + Thermal Printer

Sistem photobooth berbasis web yang mengintegrasikan **pembayaran Midtrans**, **real-time WebSocket printing** (Laravel Reverb), dan **thermal printer** via Raspberry Pi 3.

---

## 🧩 Tech Stack & APIs yang Digunakan

| Komponen | Teknologi / API |
|---|---|
| Backend Framework | Laravel 13 (PHP 8.3+) |
| Frontend | React 19 + Vite + TailwindCSS |
| Payment Gateway | **Midtrans Snap API** (sandbox/production) |
| Real-time WebSocket | **Laravel Reverb** |
| Frontend WebSocket Client | Laravel Echo + Pusher-js |
| Thermal Printer (Pi) | `python-escpos` via WebSocket listener |
| Receipt Image | PHP GD Library (server-side rendering) |
| Font (Receipt) | Google Fonts — Courier Prime (auto-downloaded) |
| Barcode / QR Code | PHP GD (generated in-server) |
| Database | MySQL |

---

## 🗺️ API Endpoints

| Method | Endpoint | Deskripsi |
|:---|:---|:---|
| `POST` | `/api/payment/create` | Membuat Snap token baru & mencatat transaksi |
| `POST` | `/api/payment/notification` | Webhook receiver untuk notifikasi Midtrans |
| `GET` | `/api/payment/status/{order_id}` | Mengecek status transaksi |
| `POST` | `/api/photos` | Upload foto, generate receipt image, trigger print |
| `GET` | `/api/download/{order_id}` | Link download via QR code (attachment) |

---

## ⚙️ Instalasi — Step by Step

### Prasyarat

Pastikan sudah terinstall:
- PHP 8.3+
- Composer
- Node.js 20+ & npm
- MySQL
- Git

---

### 1. Clone Repository

```bash
git clone https://github.com/nandaarianto15/Photobooth.git
cd photobooth
```

---

### 2. Install PHP Dependencies

Install semua dependensi PHP termasuk Laravel Reverb, Sanctum, dan **Midtrans PHP SDK**:

```bash
composer install
```

> Package yang diinstall antara lain: `laravel/reverb`, `laravel/sanctum`, `midtrans/midtrans-php`, dll.

---

### 2.5. Generate Reverb WebSocket Credentials

Laravel Reverb membutuhkan credentials unik (App ID, Key, Secret). Jalankan:

```bash
php artisan reverb:install
```

> Perintah ini akan **otomatis mengisi** `REVERB_APP_ID`, `REVERB_APP_KEY`, dan `REVERB_APP_SECRET` di file `.env` kamu. Setelah ini, nilai-nilai tersebut sudah siap digunakan.

---

### 3. Setup File `.env`

Copy file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
# atau di Windows:
copy .env.example .env
```

Kemudian edit `.env` sesuai kebutuhanmu. **Lihat bagian [Konfigurasi .env](#konfigurasi-env) di bawah untuk detail setiap variabel yang perlu diubah.**

---

### 4. Generate Application Key

```bash
php artisan key:generate
```

---

### 5. Buat Database MySQL

Buat database baru di MySQL:

```sql
CREATE DATABASE photobooth;
```

Pastikan konfigurasi `DB_*` di `.env` sudah sesuai.

---

### 6. Jalankan Migrasi Database

```bash
php artisan migrate
```

Ini akan membuat tabel: `users`, `sessions`, `jobs`, `transactions`, `photos`, dll.

---

### 7. Install Node Dependencies & Build Frontend

```bash
npm install
npm run build
```

> Untuk development (hot-reload), gunakan `npm run dev` alih-alih `npm run build`.

---

### 8. Link Storage (agar receipt bisa diakses publik)

```bash
php artisan storage:link
```

---

### 9. Jalankan Server

Butuh **3 terminal** yang berjalan bersamaan:

**Terminal 1 — Laravel Web Server:**
```bash
php artisan serve
```

**Terminal 2 — Reverb WebSocket Server:**
```bash
php artisan reverb:start
```

**Terminal 3 — Queue Worker (untuk background jobs):**
```bash
php artisan queue:listen --tries=1 --timeout=0
```

> Alternatif: jalankan sekaligus dengan `composer dev` (menggunakan concurrently).

---

### 10. Expose ke Internet (Untuk Mobile / ngrok)

Karena pengguna membayar via ponsel dan scan QR code, kamu perlu mengekspos server lokal ke internet menggunakan **ngrok** atau **Localtunnel**:

```bash
ngrok http 8000
```

Setelah mendapat URL publik (contoh: `https://abc.ngrok-free.app`), update `.env`:

```env
APP_URL=https://abc.ngrok-free.app
```

Lalu restart `php artisan serve`.

---

### 11. Setup Raspberry Pi 3 (Thermal Printer Client)

Copy `print_client.py` dan `requirements.txt` ke Raspberry Pi 3.

Install dependensi Python:
```bash
pip3 install -r requirements.txt
```

Buat file `.env` di Pi berisi:
```env
REVERB_HOST="abc.ngrok-free.app"   # domain ngrok (tanpa https://)
REVERB_PORT="443"                      # 443 jika HTTPS
REVERB_SCHEME="https"
PRINTER_TYPE="file"
PRINTER_DEV_PATH="/dev/usb/lp0"        # sesuaikan path thermal printer
```

Jalankan client:
```bash
python3 print_client.py
```

---

## 🔑 Konfigurasi `.env`

Berikut variabel yang **wajib diubah** setelah copy dari `.env.example`:

### Aplikasi

| Variabel | Default | Keterangan |
|---|---|---|
| `APP_NAME` | `Laravel` | Nama aplikasi, bisa diubah bebas |
| `APP_KEY` | *(kosong)* | Diisi otomatis via `php artisan key:generate` |
| `APP_URL` | `http://localhost` | **Wajib diubah** ke URL ngrok saat expose ke internet |
| `APP_ENV` | `local` | Ganti ke `production` di server produksi |
| `APP_DEBUG` | `true` | Set ke `false` di produksi |

### Database

| Variabel | Default | Keterangan |
|---|---|---|
| `DB_DATABASE` | `photobooth` | Nama database MySQL yang sudah dibuat |
| `DB_USERNAME` | `root` | Username MySQL |
| `DB_PASSWORD` | *(kosong)* | Password MySQL, sesuaikan dengan setup lokal |

### Laravel Reverb (WebSocket)

| Variabel | Default | Keterangan |
|---|---|---|
| `REVERB_APP_ID` | *(contoh)* | **Wajib diganti** dengan ID dari `php artisan reverb:install` atau generate sendiri |
| `REVERB_APP_KEY` | *(contoh)* | **Wajib diganti** — string acak unik |
| `REVERB_APP_SECRET` | *(contoh)* | **Wajib diganti** — string acak rahasia |
| `REVERB_HOST` | `localhost` | Host Reverb, biasanya `localhost` untuk dev |
| `REVERB_PORT` | `8080` | Port Reverb |

> Untuk generate Reverb credentials baru: `php artisan reverb:install`

### Midtrans Payment Gateway

| Variabel | Default | Keterangan |
|---|---|---|
| `MIDTRANS_MERCHANT_ID` | *(contoh sandbox)* | **Wajib diganti** — Merchant ID dari dashboard Midtrans |
| `MIDTRANS_CLIENT_KEY` | *(contoh sandbox)* | **Wajib diganti** — Client Key dari dashboard Midtrans |
| `MIDTRANS_SERVER_KEY` | *(contoh sandbox)* | **Wajib diganti** — Server Key dari dashboard Midtrans |
| `MIDTRANS_IS_PRODUCTION` | `false` | Set ke `true` jika sudah go-live |

> 🔗 Daftar & ambil key Midtrans di: https://dashboard.midtrans.com → Settings → Access Keys

---

## 🔄 Alur Sistem (Flow)

```
Pengguna buka web
    ↓
Klik "Mulai" → Midtrans Snap Popup muncul
    ↓
Bayar via GoPay / Transfer / dll (sandbox atau production)
    ↓
Midtrans kirim notifikasi webhook → /api/payment/notification
    ↓
Status transaksi berubah menjadi "settlement"
    ↓
Pengguna ambil foto & pilih filter
    ↓
Klik "Cetak Sekarang" → POST /api/photos
    ↓
Server generate receipt image (PHP GD) → simpan ke storage/public/receipts/
    ↓
Laravel Reverb broadcast event "PrintReceipt" ke channel "printer"
    ↓
print_client.py di Raspberry Pi menangkap event → download receipt → cetak ke thermal printer
    ↓
Pengguna scan QR di struk → GET /api/download/{order_id} → download receipt digital
```

---

## 📁 Struktur File Penting

```
photobooth/
├── app/
│   ├── Events/PrintReceipt.php              # WebSocket broadcast event
│   ├── Http/Controllers/API/
│   │   ├── PaymentController.php            # Midtrans payment endpoints
│   │   ├── PhotoController.php              # Upload foto + generate receipt
│   │   └── DownloadController.php           # Download receipt via QR
│   └── Models/
│       ├── Transaction.php                  # Model transaksi Midtrans
│       └── Photo.php                        # Model foto + order_id
├── resources/js/
│   └── app.jsx                              # React app (PaymentPage, Camera, dll)
├── print_client.py                          # Python client untuk Raspberry Pi
├── requirements.txt                         # Python deps untuk Pi
├── .env.example                             # Template konfigurasi
└── README.md                                # Dokumentasi ini
```

---

## 🧪 Test Flow

1. Buka `http://localhost:8000` di browser
2. Klik **Mulai** → klik **Bayar Sekarang**
3. Bayar menggunakan metode sandbox Midtrans (contoh: GoPay sandbox, transfer virtual sandbox)
4. Ambil foto & pilih filter
5. Klik **Cetak Sekarang** → server generate receipt → Pi cetak otomatis
6. Scan QR di struk → download receipt digital

---

## 📝 Lisensi

MIT License
Bebas digunakan dan dimodifikasi.
