<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function create(Request $request)
    {
        $amount = 5000; // Enforced price for 1x photo strip printing

        $orderId = 'TRX-' . time() . '-' . strtoupper(Str::random(6));

        $serverKey = config('services.midtrans.server_key');
        $isProduction = config('services.midtrans.is_production');
        $url = $isProduction 
            ? 'https://app.midtrans.com/snap/v1/transactions' 
            : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

        $authHeader = 'Basic ' . base64_encode($serverKey . ':');

        $payload = [
            'transaction_details' => [
                'order_id' => $orderId,
                'gross_amount' => $amount,
            ],
            'credit_card' => [
                'secure' => true,
            ],
        ];

        try {
            $response = Http::withoutVerifying()->withHeaders([
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'Authorization' => $authHeader,
            ])->post($url, $payload);

            if ($response->successful()) {
                $data = $response->json();
                
                $transaction = Transaction::create([
                    'order_id' => $orderId,
                    'amount' => $amount,
                    'status' => 'pending',
                    'snap_token' => $data['token'] ?? null,
                    'snap_url' => $data['redirect_url'] ?? null,
                ]);

                return response()->json([
                    'success' => true,
                    'data' => [
                        'order_id' => $orderId,
                        'snap_token' => $transaction->snap_token,
                        'snap_url' => $transaction->snap_url,
                        'amount' => $amount,
                    ]
                ]);
            } else {
                Log::error('Midtrans API error: ' . $response->body());
                return response()->json([
                    'success' => false,
                    'message' => 'Gagal membuat transaksi ke Midtrans.'
                ], 500);
            }
        } catch (\Exception $e) {
            Log::error('Midtrans Exception: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan sistem.'
            ], 500);
        }
    }

    public function notification(Request $request)
    {
        $payload = $request->all();
        Log::info('Midtrans Notification received', $payload);

        $orderId = $payload['order_id'] ?? null;
        $statusCode = $payload['status_code'] ?? null;
        $grossAmount = $payload['gross_amount'] ?? null;
        $signatureKey = $payload['signature_key'] ?? null;
        $transactionStatus = $payload['transaction_status'] ?? null;

        if (!$orderId || !$statusCode || !$grossAmount || !$signatureKey) {
            return response()->json(['success' => false, 'message' => 'Invalid payload'], 400);
        }

        $serverKey = config('services.midtrans.server_key');
        
        // Verify signature
        $computedSignature = hash("sha512", $orderId . $statusCode . $grossAmount . $serverKey);

        if ($computedSignature !== $signatureKey) {
            return response()->json(['success' => false, 'message' => 'Invalid signature'], 403);
        }

        $transaction = Transaction::where('order_id', $orderId)->first();
        if (!$transaction) {
            return response()->json(['success' => false, 'message' => 'Transaction not found'], 404);
        }

        // Determine status
        $status = 'pending';
        if ($transactionStatus === 'capture') {
            $fraudStatus = $payload['fraud_status'] ?? '';
            if ($fraudStatus === 'accept') {
                $status = 'settlement';
            } else {
                $status = 'deny';
            }
        } elseif ($transactionStatus === 'settlement') {
            $status = 'settlement';
        } elseif (in_array($transactionStatus, ['cancel', 'deny'])) {
            $status = 'failed';
        } elseif ($transactionStatus === 'expire') {
            $status = 'expire';
        }

        $transaction->update(['status' => $status]);

        return response()->json(['success' => true]);
    }

    public function status($order_id)
    {
        $transaction = Transaction::where('order_id', $order_id)->first();
        if (!$transaction) {
            return response()->json([
                'success' => false,
                'message' => 'Transaksi tidak ditemukan.'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'order_id' => $transaction->order_id,
                'status' => $transaction->status,
                'amount' => $transaction->amount,
            ]
        ]);
    }
}
