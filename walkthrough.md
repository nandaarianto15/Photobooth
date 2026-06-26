# Walkthrough: Midtrans Payment & Thermal Printing Integration

We have completed the integration of the backend and frontend for the photobooth system. The client-side canvas receipt drawing has been replaced with server-side high-fidelity rendering, real-time printing via WebSockets, and Midtrans payment processing.

Below is a summary of the files created/modified and a guide on how you can test the setup.

## Key Changes Made

### 1. Database & Configuration
*   **Transactions Table**: Created a migration at `2026_06_25_171658_create_transactions_table.php` and [Transaction.php](file:///c:/Project/photobooth/app/Models/Transaction.php) model to record Midtrans transaction details, tokens, redirect URLs, and current status (`pending`, `settlement`, `expired`, `failed`).
*   **Photos Association**: Added an `order_id` field to the `photos` table via migration `2026_06_25_171714_add_order_id_to_photos_table.php` and updated [Photo.php](file:///c:/Project/photobooth/app/Models/Photo.php) fillables.
*   **Services Configuration**: Appended Midtrans merchant credentials (sandbox server key, client key, and mode flags) in [services.php](file:///c:/Project/photobooth/config/services.php) and [.env](file:///c:/Project/photobooth/.env).

### 2. Controllers & Events
*   **[PaymentController.php](file:///c:/Project/photobooth/app/Http/Controllers/API/PaymentController.php)**: Created endpoints to:
    1. Initiate Snap transactions with Midtrans.
    2. Handle Midtrans notification webhooks (signature validated using `order_id + status_code + gross_amount + ServerKey`).
    3. Check transaction statuses.
*   **[PhotoController.php](file:///c:/Project/photobooth/app/Http/Controllers/API/PhotoController.php)**: Re-designed the upload process to:
    1. Confirm payment is paid (`settlement`).
    2. Programmatically download the Courier Prime monospace font from Google Fonts.
    3. Dynamically compose a receipt structure using PHP GD (correct font, centered columns, dithered/scaled photobooth picture, barcode, and QR code).
    4. Save the formatted file into storage disk at `public/receipts/`.
    5. Trigger a WebSocket broadcast.
*   **[DownloadController.php](file:///c:/Project/photobooth/app/Http/Controllers/API/DownloadController.php)**: Generates a direct attachment download for `/api/download/{order_id}` so scanning the QR code immediately downloads the receipt image.
*   **[PrintReceipt.php](file:///c:/Project/photobooth/app/Events/PrintReceipt.php)**: Set up the event class to broadcast the `PrintReceipt` event carrying the rendered receipt image URL over the public `printer` Reverb channel.

### 3. Frontend App & Views
*   **[app.jsx](file:///c:/Project/photobooth/resources/js/app.jsx)**:
    *   Added **PaymentPage** which prompts the user to pay Rp5.000 before accessing the camera. Uses Midtrans Snap Popup.
    *   Updated the print workflow to send `order_id` with the upload.
    *   Renders the server-generated receipt image and links the download QR to the new API route.
*   **[welcome.blade.php](file:///c:/Project/photobooth/resources/views/welcome.blade.php)**: Globally loaded the Midtrans Snap SDK script.

### 4. Raspberry Pi 3 Client
*   **[print_client.py](file:///c:/Project/photobooth/print_client.py)**: Created a Python WebSocket client listener for the Pi 3 using `websocket-client` and `python-escpos`. It connects to Reverb, downloads receipt images automatically when broadcasted, and writes directly to the thermal printer (via `/dev/usb/lp0` or direct USB parameters).
*   **[requirements.txt](file:///c:/Project/photobooth/requirements.txt)**: Python package requirements for the Pi.

---

## Registered API Routes

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/payment/create` | Requests a new Snap token and records the transaction. |
| `POST` | `/api/payment/notification` | Webhook receiver for Midtrans notifications. |
| `GET` | `/api/payment/status/{order_id}` | Returns current transaction status. |
| `POST` | `/api/photos` | Uploads photo, generates receipt image, and triggers print. |
| `GET` | `/api/download/{order_id}` | QR download link. Triggers automatic download. |

---

## Instructions for Testing & Running

Follow these steps on your development server:

### 1. Run the Web Server and WebSocket Server
Start Laravel's local server and Reverb WebSocket server:
```powershell
# In your project folder
php artisan serve
php artisan reverb:start
```

### 2. Expose the App (For Mobile Testing)
Since users scan QR codes and make payments on their mobile browsers, expose your local Laravel environment to the internet using a tool like **ngrok** or **Localtunnel**:
```bash
# Expose port 8000
ngrok http 8000
```
Update your `.env` `APP_URL` to match the generated ngrok URL so that URLs generated in QR codes point to the correct public domain.

### 3. Setup the Pi 3 Client
Copy `print_client.py` and `requirements.txt` to your Raspberry Pi 3.
Connect the thermal printer via USB or Bluetooth.
Install the requirements:
```bash
pip3 install -r requirements.txt
```
Create a `.env` file on the Pi containing your server details and printer path:
```env
REVERB_HOST="your-ngrok-domain.ngrok-free.app"
REVERB_PORT="443"  # If using SSL/HTTPS ngrok
REVERB_SCHEME="https"
PRINTER_TYPE="file"
PRINTER_DEV_PATH="/dev/usb/lp0"
```
Run the client:
```bash
python3 print_client.py
```

### 4. Complete a Test Flow
1. Navigate to the landing page on your phone.
2. Click **Mulai** and click **Bayar Sekarang**. Pay using any sandbox method (e.g. GoPay sandbox QR or bank transfer sandbox).
3. Take a photo and apply a filter.
4. Click **Cetak Sekarang**. The server will generate the receipt, save it, send the URL to your Pi 3, and your thermal printer will print it automatically!
5. Scan the QR code on the printed receipt to download the digital receipt immediately.
