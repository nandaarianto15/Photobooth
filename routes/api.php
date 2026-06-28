<?php

use App\Http\Controllers\API\PhotoController;
use App\Http\Controllers\API\PaymentController;
use App\Http\Controllers\API\DownloadController;
use Illuminate\Support\Facades\Route;

// Photo Booth Core Routes
Route::post('/photos', [PhotoController::class, 'store']);
Route::get('/photos', [PhotoController::class, 'index']);
Route::delete('/photos/{id}', [PhotoController::class, 'destroy']);

// Midtrans Payment Routes
Route::post('/payment/create', [PaymentController::class, 'create']);
Route::match(['get', 'post'], '/payment/notification', [PaymentController::class, 'notification']);
Route::get('/payment/status/{order_id}', [PaymentController::class, 'status']);

// Automatic Receipt Download Route (triggered when scanning QR code)
Route::get('/download/{order_id}', [DownloadController::class, 'download'])->name('receipt.download');