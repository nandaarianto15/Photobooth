<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use Illuminate\Support\Facades\Storage;

class DownloadController extends Controller
{
    public function download($order_id)
    {
        $photo = Photo::where('order_id', $order_id)->first();
        
        if (!$photo) {
            return response()->json([
                'success' => false,
                'message' => 'Struk tidak ditemukan.'
            ], 404);
        }

        // Try to download the formatted receipt image first
        $filename = 'receipt_' . $order_id . '.png';
        $path = 'receipts/' . $filename;

        if (!Storage::disk('public')->exists($path)) {
            // Fallback to the original photo
            $path = $photo->path;
            $filename = $photo->filename;
        }

        if (!Storage::disk('public')->exists($path)) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak ditemukan di storage.'
            ], 404);
        }

        $absolutePath = Storage::disk('public')->path($path);

        return response()->download($absolutePath, $filename);
    }
}
