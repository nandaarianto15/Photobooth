<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>ProtoBooth - Sistem Photobooth Pintar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,700;1,400&display=swap" rel="stylesheet">
    @php $snapUrl = config('services.midtrans.is_production') ? 'https://app.midtrans.com/snap/snap.js' : 'https://app.sandbox.midtrans.com/snap/snap.js'; @endphp
    <script type="text/javascript" src="{{ $snapUrl }}" data-client-key="{{ config('services.midtrans.client_key') }}"></script>
    @vite(['resources/css/app.css', 'resources/js/app.jsx'])
</head>
<body class="m-0 p-0 bg-[#09090b]">
    <div id="app"></div>
</body>
</html>