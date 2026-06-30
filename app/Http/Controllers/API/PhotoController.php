<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use App\Models\Transaction;
use App\Events\PrintReceipt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PhotoController extends Controller
{
    public function store(Request $request)
    {
        $request->validate([
            'image'    => 'required|string',
            'filter'   => 'required|string',
            'frame'    => 'required|string',
            'mode'     => 'required|string|in:single,strip',
            'order_id' => 'required|string|exists:transactions,order_id',
        ]);

        // 1. Verify Transaction is Paid
        $transaction = Transaction::where('order_id', $request->input('order_id'))->first();
        if (!$transaction) {
            return response()->json(['success' => false, 'message' => 'Transaksi tidak ditemukan.'], 404);
        }

        if ($transaction->status !== 'settlement') {
            return response()->json(['success' => false, 'message' => 'Pembayaran belum diselesaikan.'], 400);
        }

        // 2. Decode original uploaded image
        $imageData = $request->input('image');
        $imageData = preg_replace('/^data:image\/\w+;base64,/', '', $imageData);
        $imageData = base64_decode($imageData);

        $filename = 'photobooth_' . $transaction->order_id . '_' . Str::random(4) . '.png';
        $path = 'photos/' . date('Y/m') . '/' . $filename;

        Storage::disk('public')->put($path, $imageData);

        // 3. Save photo record
        $photo = Photo::create([
            'order_id'  => $transaction->order_id,
            'filename'  => $filename,
            'path'      => $path,
            'filter'    => $request->input('filter'),
            'frame'     => $request->input('frame'),
            'mode'      => $request->input('mode'),
            'file_size' => strlen($imageData),
        ]);

        // 4. Render final Receipt Image (58mm thermal resolution: 384px width)
        try {
            $receiptPngData = $this->renderReceiptImage($transaction, $imageData, $photo);
            if ($receiptPngData) {
                $photo->update([
                    'path' => 'receipts/receipt_' . $transaction->order_id . '.png',
                    'filename' => 'receipt_' . $transaction->order_id . '.png',
                    'file_size' => strlen($receiptPngData),
                ]);
            }
        } catch (\Exception $e) {
            Log::error('Error rendering receipt image: ' . $e->getMessage());
            // We still proceed even if rendering fails, but we log the error
        }

        // 5. Broadcast print signal to Raspberry Pi
        $receiptUrl = asset('storage/receipts/receipt_' . $transaction->order_id . '.png');
        try {
            broadcast(new PrintReceipt($transaction->order_id, $receiptUrl))->toOthers();
        } catch (\Exception $e) {
            Log::error('Error broadcasting print event: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'id'          => $photo->id,
                'url'         => Storage::url($photo->path),
                'receipt_url' => $receiptUrl,
                'filename'    => $photo->filename,
            ],
        ], 201);
    }

    private function renderReceiptImage($transaction, $photoData, $photo)
    {
        // Dimensions
        $w = 384;
        $h = 1200;

        // Ensure font folder exists and font file is downloaded
        $fontFolder = storage_path('app/fonts');
        if (!is_dir($fontFolder)) {
            mkdir($fontFolder, 0755, true);
        }
        $fontPath = $fontFolder . '/CourierPrime-Regular.ttf';
        if (!file_exists($fontPath)) {
            $fontUrl = 'https://github.com/google/fonts/raw/main/ofl/courierprime/CourierPrime-Regular.ttf';
            try {
                Http::withoutVerifying()->sink($fontPath)->get($fontUrl);
            } catch (\Exception $e) {
                Log::error('Failed to download font: ' . $e->getMessage());
            }
        }
        
        $fontPath = realpath($fontPath);

        // Create Canvas
        $im = imagecreatetruecolor($w, $h);

        // Colors
        $white = imagecolorallocate($im, 255, 255, 255);
        $black = imagecolorallocate($im, 0, 0, 0);

        // Fill background
        imagefilledrectangle($im, 0, 0, $w, $h, $white);

        // Text Drawing Helper Functions
        $drawCenteredText = function ($fontSize, $y, $text) use ($im, $black, $fontPath, $w) {
            if (file_exists($fontPath)) {
                $bbox = imagettfbbox($fontSize, 0, $fontPath, $text);
                $textWidth = abs($bbox[2] - $bbox[0]);
                $x = ($w - $textWidth) / 2;
                imagettftext($im, $fontSize, 0, $x, $y, $black, $fontPath, $text);
            } else {
                // Fallback to built-in fonts if TTF load fails
                $fontWidth = imagefontwidth(3);
                $x = ($w - (strlen($text) * $fontWidth)) / 2;
                imagestring($im, 3, $x, $y - 6, $text, $black);
            }
        };

        $drawLeftAndRightText = function ($fontSize, $y, $leftText, $rightText) use ($im, $black, $fontPath, $w) {
            if (file_exists($fontPath)) {
                // Left text
                imagettftext($im, $fontSize, 0, 12, $y, $black, $fontPath, $leftText);
                // Right text
                $bbox = imagettfbbox($fontSize, 0, $fontPath, $rightText);
                $textWidth = abs($bbox[2] - $bbox[0]);
                $x = $w - 12 - $textWidth;
                imagettftext($im, $fontSize, 0, $x, $y, $black, $fontPath, $rightText);
            } else {
                // Fallback to built-in font
                imagestring($im, 3, 12, $y - 6, $leftText, $black);
                $fontWidth = imagefontwidth(3);
                $x = $w - 12 - (strlen($rightText) * $fontWidth);
                imagestring($im, 3, $x, $y - 6, $rightText, $black);
            }
        };

        $drawDashedLine = function ($y) use ($im, $black, $w) {
            $style = array_merge(
                array_fill(0, 4, $black),
                array_fill(0, 4, IMG_COLOR_TRANSPARENT)
            );
            imagesetstyle($im, $style);
            imageline($im, 10, $y, $w - 10, $y, IMG_COLOR_STYLED);
        };

        // Render Header
        $drawCenteredText(14, 45, 'ALK - PHOTOBOOTH');
        $drawCenteredText(9, 65, 'Jl. Menuju Surga');
        $drawCenteredText(9, 80, 'Telp: 081234567890');
        $drawDashedLine(92);

        // Date and Trx ID
        $dateStr = date('d/m/Y  H:i:s');
        $trxIdStr = '#' . $transaction->order_id;
        $drawLeftAndRightText(9, 112, $dateStr, $trxIdStr);
        $drawLeftAndRightText(9, 130, 'KASIR: SELF-SERVICE', '');
        $drawDashedLine(142);

        // Items Purchased
        $drawLeftAndRightText(10, 162, '1x FOTO STRIP', 'Rp5.000');
        $filterName = strtoupper($photo->filter);
        $modeName = strtoupper($photo->mode);
        $drawLeftAndRightText(9, 182, "FILTER: {$filterName}", "MODE: {$modeName}");
        $drawDashedLine(194);

        // Load and Draw Photo
        $photoImg = imagecreatefromstring($photoData);
        if ($photoImg) {
            $pw = imagesx($photoImg);
            $ph = imagesy($photoImg);
            // Draw photo inside a box of 360 x 480
            imagecopyresampled($im, $photoImg, 12, 206, 0, 0, 360, 480, $pw, $ph);
            imagedestroy($photoImg);
        }
        $drawDashedLine(698);

        // Footer
        $drawCenteredText(11, 720, '* TERIMA KASIH *');
        $drawCenteredText(8.5, 740, 'Pastikan unduh segera versi digital.');
        $drawCenteredText(8.5, 754, 'Foto akan dihapus otomatis');
        $drawCenteredText(8.5, 768, 'dalam kurun waktu 24 jam.');
        $drawCenteredText(8.5, 788, 'Scan QR untuk versi digital');

        // Draw QR Code pointing to Download route
        $downloadUrl = route('receipt.download', ['order_id' => $transaction->order_id]);
        $qrSize = 288;
        $qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=' . $qrSize . 'x' . $qrSize . '&margin=0&data=' . urlencode($downloadUrl);
        try {
            $qrResponse = Http::withoutVerifying()->get($qrUrl);
            if ($qrResponse->successful()) {
                $qrImg = imagecreatefromstring($qrResponse->body());
                if ($qrImg) {
                    $qrX = (int)(($w - $qrSize) / 2);
                    imagecopy($im, $qrImg, $qrX, 800, 0, 0, $qrSize, $qrSize);
                    imagedestroy($qrImg);
                }
            }
        } catch (\Exception $e) {
            Log::error('Failed to fetch/draw QR code: ' . $e->getMessage());
        }

        // Draw Trx text below QR
        $drawCenteredText(8, 800 + $qrSize + 22, $transaction->order_id);

        // Save receipt image to disk
        $receiptFilename = 'receipt_' . $transaction->order_id . '.png';
        $receiptPath = 'receipts/' . $receiptFilename;

        ob_start();
        imagepng($im);
        $receiptPngData = ob_get_clean();

        // Create receipt folder in public disk if not exists
        if (!Storage::disk('public')->exists('receipts')) {
            Storage::disk('public')->makeDirectory('receipts');
        }

        Storage::disk('public')->put($receiptPath, $receiptPngData);
        imagedestroy($im);
        return $receiptPngData;
    }

    public function index()
    {
        $photos = Photo::latest()->take(24)->get();

        return response()->json([
            'success' => true,
            'data'    => $photos->map(fn ($p) => [
                'id'         => $p->id,
                'order_id'   => $p->order_id,
                'url'        => Storage::url($p->path),
                'filter'     => $p->filter,
                'frame'      => $p->frame,
                'mode'       => $p->mode,
                'created_at' => $p->created_at->toIso8601String(),
            ]),
        ]);
    }

    public function destroy($id)
    {
        $photo = Photo::findOrFail($id);
        Storage::disk('public')->delete($photo->path);
        
        // Also delete receipt if it exists
        $receiptPath = 'receipts/receipt_' . $photo->order_id . '.png';
        if (Storage::disk('public')->exists($receiptPath)) {
            Storage::disk('public')->delete($receiptPath);
        }

        $photo->delete();

        return response()->json(['success' => true]);
    }
}