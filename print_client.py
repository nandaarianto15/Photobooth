#!/usr/bin/env python3
import os
import json
import time
import requests
import websocket
from dotenv import load_dotenv

# Load configuration from .env file
load_dotenv()

# WebSocket / Reverb Configuration
REVERB_HOST = os.getenv("REVERB_HOST", "localhost")
REVERB_PORT = os.getenv("REVERB_PORT", "8080")
REVERB_APP_KEY = os.getenv("REVERB_APP_KEY", "sizjixd26023s2ct6oka")
REVERB_SCHEME = os.getenv("REVERB_SCHEME", "http")

# Printer Configuration
PRINTER_TYPE = os.getenv("PRINTER_TYPE", "file")  # "file" or "usb"
PRINTER_DEV_PATH = os.getenv("PRINTER_DEV_PATH", "/dev/usb/lp0")  # Standard for USB printer in Linux / Pi
PRINTER_USB_VENDOR = os.getenv("PRINTER_USB_VENDOR", "0x0416")  # Winbond/IWare default USB Vendor ID
PRINTER_USB_PRODUCT = os.getenv("PRINTER_USB_PRODUCT", "0x5011") # USB Product ID

# Build WebSocket URL
ws_protocol = "ws" if REVERB_SCHEME == "http" else "wss"
WS_URL = f"{ws_protocol}://{REVERB_HOST}:{REVERB_PORT}/app/{REVERB_APP_KEY}?protocol=7&client=js&version=7.0.6&flash=false"

print("=" * 60)
print("ALK PHOTOBOOTH - Raspberry Pi 3 Print Client")
print("=" * 60)
print(f"Connecting to Reverb at: {ws_protocol}://{REVERB_HOST}:{REVERB_PORT}")
print(f"Printer Setup: {PRINTER_TYPE.upper()} (Path/Dev: {PRINTER_DEV_PATH})")
print("=" * 60)

def print_receipt(image_path):
    """
    Sends the downloaded receipt image to the thermal printer.
    """
    try:
        if PRINTER_TYPE == "file":
            if not os.path.exists(PRINTER_DEV_PATH):
                raise FileNotFoundError(f"Device printer {PRINTER_DEV_PATH} tidak ditemukan. Pastikan printer terhubung dan dinyalakan.")
            
            print(f"Printing via File device: {PRINTER_DEV_PATH}...")
            from escpos.printer import File
            p = File(PRINTER_DEV_PATH)
            p.image(image_path)
            # Send paper feed and cut command
            p.cut()
            p.close()
            
        elif PRINTER_TYPE == "usb":
            vendor = int(PRINTER_USB_VENDOR, 16)
            product = int(PRINTER_USB_PRODUCT, 16)
            print(f"Printing via Direct USB (Vendor: {hex(vendor)}, Product: {hex(product)})...")
            from escpos.printer import Usb
            p = Usb(vendor, product)
            p.image(image_path)
            p.cut()
            p.close()
            
        print("✔ Struk berhasil dicetak!")
    except Exception as e:
        print(f"❌ Gagal mencetak struk: {e}")

def download_receipt(url, filename):
    """
    Downloads the receipt image from the server.
    """
    print(f"Mengunduh gambar struk dari: {url}...")
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"✔ Gambar berhasil diunduh ke: {filename}")
            return True
        else:
            print(f"❌ Gagal mengunduh gambar, HTTP Status: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Exception saat mengunduh gambar: {e}")
        return False

def on_message(ws, message):
    try:
        payload = json.loads(message)
        event = payload.get("event")
        data_str = payload.get("data")
        
        # Connection established confirmation
        if event == "pusher:connection_established":
            print("✔ Koneksi WebSocket terhubung! Berlangganan ke channel 'printer'...")
            # Subscribe to the printer channel
            subscribe_msg = {
                "event": "pusher:subscribe",
                "data": {
                    "channel": "printer"
                }
            }
            ws.send(json.dumps(subscribe_msg))
            
        elif event == "pusher_internal:subscription_succeeded":
            print("✔ Berhasil berlangganan ke channel 'printer'. Menunggu sinyal cetak...")
            
        elif event == "PrintReceipt":
            print("\n🔔 Sinyal cetak diterima!")
            data = json.loads(data_str) if isinstance(data_str, str) else data_str
            image_url = data.get("image_url")
            order_id = data.get("order_id")
            
            if image_url:
                local_filename = f"temp_receipt_{order_id}.png"
                if download_receipt(image_url, local_filename):
                    print_receipt(local_filename)
                    # Clean up temp file
                    try:
                        if os.path.exists(local_filename):
                            os.remove(local_filename)
                    except:
                        pass
            else:
                print("❌ Data image_url tidak ditemukan dalam event payload.")
                
    except Exception as e:
        print(f"❌ Error memproses pesan WebSocket: {e}")

def on_error(ws, error):
    print(f"❌ WebSocket Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("🔌 Koneksi WebSocket terputus!")

def on_open(ws):
    print("Menghubungkan...")

def start_client():
    while True:
        try:
            ws = websocket.WebSocketApp(
                WS_URL,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            # Run the client loop (keepalive ping every 30s)
            ws.run_forever(ping_interval=30, ping_timeout=10)
        except KeyboardInterrupt:
            print("\nMenutup client print...")
            break
        except Exception as e:
            print(f"Client terputus secara tidak terduga: {e}. Menghubungkan kembali dalam 5 detik...")
            time.sleep(5)

if __name__ == "__main__":
    start_client()
