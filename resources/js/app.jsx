import React from 'react';
import { createRoot } from 'react-dom/client';
import { useState, useRef, useEffect, useCallback } from 'react';

/* ============================================================
   ALK - PHOTOBOOTH — Photobooth Tema Thermal Receipt Printer
   ============================================================ */

const PHOTO_W = 360;
const PHOTO_H = 480;
const RECEIPT_W = 384;
const RECEIPT_PAD = 12;
const RECEIPT_SCALE = 2;

/* ---------- FILTER DEFINITIONS ---------- */
const FILTERS = [
  { id: 'sketch', name: 'PENCIL SKETCH', code: 'SK-01', desc: 'Coretan pensil hitam putih', apply: applySketch },
  { id: 'outline', name: 'LINE OUTLINE', code: 'OL-02', desc: 'Garis outline seperti pensil', apply: applyOutline },
];

/* ---------- SEPARABLE GAUSSIAN BLUR (high quality) ---------- */
function gaussianBlur(src, w, h, radius) {
  if (radius < 1) return new Float32Array(src);
  const sigma = Math.max(0.1, radius / 2.2);
  const ks = Math.ceil(radius * 3) * 2 + 1;
  const half = Math.floor(ks / 2);
  const kernel = new Float32Array(ks);
  let kSum = 0;
  for (let i = 0; i < ks; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    kSum += kernel[i];
  }
  for (let i = 0; i < ks; i++) kernel[i] /= kSum;

  const temp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < ks; k++) {
        val += src[y * w + Math.min(w - 1, Math.max(0, x + k - half))] * kernel[k];
      }
      temp[y * w + x] = val;
    }
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < ks; k++) {
        val += temp[Math.min(h - 1, Math.max(0, y + k - half)) * w + x] * kernel[k];
      }
      out[y * w + x] = val;
    }
  }
  return out;
}

/* ---------- HIGH-ACCURACY SKETCH FILTER ---------- */
function applySketch(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const N = w * h;

  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const inverted = new Float32Array(N);
  for (let i = 0; i < N; i++) inverted[i] = 255 - gray[i];

  const blurred = gaussianBlur(inverted, w, h, 18);

  for (let i = 0; i < N; i++) {
    const base = gray[i];
    const blend = blurred[i];
    let v;
    if (blend >= 254.5) v = 255;
    else v = Math.min(255, (base * 256) / (256 - blend));

    v = v * 0.84;
    v += (Math.random() - 0.5) * 3;
    v = Math.max(0, Math.min(255, Math.round(v)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

/* ---------- HIGH-ACCURACY OUTLINE FILTER ---------- */
function applyOutline(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const N = w * h;

  const gray = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const smooth = gaussianBlur(gray, w, h, 1.2);

  const gxArr = new Float32Array(N);
  const gyArr = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const tl = smooth[idx - w - 1], t = smooth[idx - w], tr = smooth[idx - w + 1];
      const l = smooth[idx - 1], r = smooth[idx + 1];
      const bl = smooth[idx + w - 1], b = smooth[idx + w], br = smooth[idx + w + 1];
      gxArr[idx] = -tl - 2 * l - bl + tr + 2 * r + br;
      gyArr[idx] = -tl - 2 * t - tr + bl + 2 * b + br;
    }
  }

  const edges = new Float32Array(N);
  let maxEdge = 0;
  for (let i = 0; i < N; i++) {
    edges[i] = Math.sqrt(gxArr[i] * gxArr[i] + gyArr[i] * gyArr[i]);
    if (edges[i] > maxEdge) maxEdge = edges[i];
  }

  const threshold = maxEdge * 0.12;
  for (let i = 0; i < N; i++) {
    let v;
    if (edges[i] > threshold) {
      const norm = Math.min(1, edges[i] / (maxEdge * 0.5));
      v = 255 * (1 - norm);
    } else {
      v = 255;
    }
    v = Math.max(0, Math.min(255, Math.round(v)));
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
}

/* ---------- SOUND UTILITIES ---------- */
function beep(freq, dur) {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.value = freq; o.type = 'square';
    g.gain.setValueAtTime(0.04, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.start(); o.stop(c.currentTime + dur);
  } catch (_) {}
}

function shutterSound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const n = c.sampleRate * 0.12, buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
    const g = c.createGain(); g.gain.value = 0.18;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  } catch (_) {}
}

function printSound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const n = c.sampleRate * 0.6, buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.15 * Math.sin(i * 0.05);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400;
    const g = c.createGain(); g.gain.value = 0.12;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  } catch (_) {}
}

/* ---------- IMAGE CAPTURE & PROCESSING ---------- */
function captureRaw(videoEl) {
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  cv.width = 720; cv.height = 960;
  cx.translate(cv.width, 0); cx.scale(-1, 1);
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 960;
  const scale = Math.max(cv.width / vw, cv.height / vh);
  const dw = vw * scale, dh = vh * scale;
  cx.drawImage(videoEl, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
  return cv.toDataURL('image/png');
}

async function processPhoto(rawURL, filterId, previewW) {
  const TW = previewW || PHOTO_W;
  const TH = Math.round(TW * (PHOTO_H / PHOTO_W));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      const cx = cv.getContext('2d');
      cv.width = TW; cv.height = TH;
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, TW, TH);
      const scale = Math.max(TW / img.width, TH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      cx.drawImage(img, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
      const filter = FILTERS.find(f => f.id === filterId);
      if (filter) filter.apply(cx, TW, TH);
      resolve(cv.toDataURL('image/png'));
    };
    img.src = rawURL;
  });
}

/* ---------- QR CODE GENERATION ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createFallbackQR(size) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const cx = cv.getContext('2d');
  const modules = 21;
  const modSize = size / modules;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
  const grid = Array.from({ length: modules }, () => Array(modules).fill(false));
  function setFinder(row, col) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      grid[row + r][col + c] = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    }
  }
  setFinder(0, 0); setFinder(0, 14); setFinder(14, 0);
  for (let i = 8; i < 13; i++) { grid[6][i] = i % 2 === 0; grid[i][6] = i % 2 === 0; }
  const rng = mulberry32(42);
  for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) {
    if ((r < 8 && c < 8) || (r < 8 && c > 12) || (r > 12 && c < 8) || r === 6 || c === 6) continue;
    grid[r][c] = rng() > 0.5;
  }
  cx.fillStyle = '#000';
  for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) {
    if (grid[r][c]) cx.fillRect(Math.floor(c * modSize), Math.floor(r * modSize), Math.ceil(modSize), Math.ceil(modSize));
  }
  return cv.toDataURL('image/png');
}

function generateQRDataURL(text, size) {
  size = size || 100;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => resolve(createFallbackQR(size)), 4000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
        cx.drawImage(img, 0, 0, size, size); resolve(cv.toDataURL('image/png'));
      } catch (e) { resolve(createFallbackQR(size)); }
    };
    img.onerror = () => { clearTimeout(timeout); resolve(createFallbackQR(size)); };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=2&format=png`;
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ---------- RECEIPT GENERATION (2x for crisp text) ---------- */
async function generateReceiptDataURL(photoURL, filterId) {
  const photoImg = await loadImage(photoURL);
  const trxId = 'TRX' + Math.floor(Math.random() * 900000 + 100000);
  const downloadURL = `${window.location.origin}${window.location.pathname}#dl=${trxId}`;
  const qrDataURL = await generateQRDataURL(downloadURL, 100);
  const qrImg = await loadImage(qrDataURL);

  const S = RECEIPT_SCALE;
  const W = RECEIPT_W;
  const filter = FILTERS.find(f => f.id === filterId);
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  /* Layout positions (1x coordinates) */
  const titleY = 32;
  const addr1Y = 50;
  const addr2Y = 64;
  const d1 = 78;
  const dateY = 96;
  const kasirY = 112;
  const d2 = 126;
  const item1Y = 144;
  const item2Y = 160;
  const d3 = 174;
  const photoY = 188;
  const d4 = photoY + PHOTO_H + 12;
  const thanksY = d4 + 20;
  const l1 = thanksY + 18;
  const l2 = l1 + 15;
  const l3 = l2 + 13;
  const scanY = l3 + 16;
  const qrY = scanY + 10;
  const qrSz = 100;
  const perfY = qrY + qrSz + 24;
  const totalH = perfY + 16;

  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = totalH * S;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';

  /* 1. White background + paper texture (pixel space) */
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, cv.width, cv.height);
  const noise = cx.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 5;
    noise.data[i] = Math.max(0, Math.min(255, noise.data[i] + n));
    noise.data[i + 1] = Math.max(0, Math.min(255, noise.data[i + 1] + n));
    noise.data[i + 2] = Math.max(0, Math.min(255, noise.data[i + 2] + n));
  }
  cx.putImageData(noise, 0, 0);

  /* 2. Scale context for crisp 2x text */
  cx.scale(S, S);

  function dashLine(y) {
    cx.setLineDash([4, 3]);
    cx.strokeStyle = '#000'; cx.lineWidth = 0.8;
    cx.beginPath(); cx.moveTo(10, y); cx.lineTo(W - 10, y); cx.stroke();
    cx.setLineDash([]);
  }

  /* Header */
  cx.fillStyle = '#000'; cx.textAlign = 'center';
  cx.font = 'bold 22px "Courier New", monospace';
  cx.fillText('ALK - PHOTOBOOTH', W / 2, titleY);
  cx.font = '11px "Courier New", monospace';
  cx.fillText('Jl. Menuju Surga', W / 2, addr1Y);
  cx.fillText('Telp: 081234567890', W / 2, addr2Y);
  dashLine(d1);

  /* Date/time/trx */
  cx.font = '11px "Courier New", monospace';
  cx.textAlign = 'left';
  cx.fillText(`${dateStr}  ${timeStr}`, 12, dateY);
  cx.textAlign = 'right';
  cx.fillText(`#${trxId}`, W - 12, dateY);
  cx.textAlign = 'left';
  cx.fillText('KASIR: SELF-SERVICE', 12, kasirY);
  dashLine(d2);

  /* Items */
  cx.font = '12px "Courier New", monospace';
  cx.textAlign = 'left';
  cx.fillText('1x FOTO STRIP', 12, item1Y);
  cx.textAlign = 'right';
  cx.fillText('Rp5.000', W - 12, item1Y);
  cx.textAlign = 'left';
  cx.font = '11px "Courier New", monospace';
  cx.fillText(`FILTER: ${filter ? filter.code : '-'}`, 12, item2Y);
  cx.textAlign = 'right';
  cx.fillText(`${filter ? filter.name : ''}`, W - 12, item2Y);
  dashLine(d3);

  /* Photo */
  cx.strokeStyle = '#000'; cx.lineWidth = 0.8;
  cx.strokeRect(RECEIPT_PAD, photoY, PHOTO_W, PHOTO_H);
  cx.drawImage(photoImg, RECEIPT_PAD, photoY, PHOTO_W, PHOTO_H);
  dashLine(d4);

  /* Footer */
  cx.fillStyle = '#000'; cx.textAlign = 'center';
  cx.font = 'bold 14px "Courier New", monospace';
  cx.fillText('* TERIMA KASIH *', W / 2, thanksY);
  cx.font = '10px "Courier New", monospace';
  cx.fillStyle = '#444';
  cx.fillText('Pastikan unduh segera versi digital.', W / 2, l1);
  cx.fillText('Foto akan dihapus otomatis', W / 2, l2);
  cx.fillText('dalam kurun waktu 24 jam.', W / 2, l3);

  cx.font = '10px "Courier New", monospace';
  cx.fillStyle = '#444';
  cx.fillText('Scan QR untuk versi digital', W / 2, scanY);

  const qrX = (W - qrSz);
  cx.fillStyle = '#fff';
  cx.fillRect(qrX - 4, qrY, qrSz + 8, qrSz + 8);
  cx.drawImage(qrImg, qrX, qrY, qrSz, qrSz);
  cx.fillStyle = '#000';
  cx.font = '9px "Courier New", monospace';
  cx.fillText(trxId, W / 2, qrY + qrSz + 16);

  /* Perforation */
  cx.setLineDash([2, 4]); cx.strokeStyle = '#999';
  cx.beginPath(); cx.moveTo(0, perfY); cx.lineTo(W, perfY); cx.stroke();
  cx.setLineDash([]);

  const receiptDataURL = cv.toDataURL('image/png');

  try {
    cleanOldReceipts();
    localStorage.setItem(`alk_receipt_${trxId}`, receiptDataURL);
    localStorage.setItem(`alk_receipt_${trxId}_date`, new Date().toISOString());
  } catch (e) {}

  return { receiptURL: receiptDataURL, trxId };
}

function cleanOldReceipts() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('alk_receipt_') && key.endsWith('_date')) keys.push(key);
    }
    keys.forEach(key => {
      const d = localStorage.getItem(key);
      if (d && (Date.now() - new Date(d).getTime()) > 86400000) {
        const id = key.replace('alk_receipt_', '').replace('_date', '');
        localStorage.removeItem(`alk_receipt_${id}`); localStorage.removeItem(key);
      }
    });
  } catch (e) {}
}

/* ---------- PRINT UTILITY ---------- */
function printImg(src) {
  const w = window.open('', '_blank');
  w.document.write(
    `<!DOCTYPE html><html><head><title>ALK - PHOTOBOOTH - Cetak</title>
    <style>
      @page { margin: 0; size: 80mm auto; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #fff; display: flex; justify-content: center; padding: 0; }
      img { width: 80mm; display: block; image-rendering: -webkit-optimize-contrast; }
    </style></head><body>
    <img src="${src}" onload="setTimeout(function(){window.print();},300);window.onafterprint=function(){window.close()};">
    </body></html>`
  );
  w.document.close();
}

/* ============================================================
   DIGITAL RECEIPT PAGE
   ============================================================ */
function DigitalReceiptPage({ trxId, dataURL, onBack }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = dataURL; a.download = `ALK_PHOTOBOOTH_${trxId}.png`; a.click();
  };
  useEffect(() => {
    const t = setTimeout(handleDownload, 800);
    return () => clearTimeout(t);
  }, [dataURL, trxId]);
  const savedDate = localStorage.getItem(`alk_receipt_${trxId}_date`);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 paper-bg">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="bg-white shadow-2xl receipt-card">
          <div className="jagged-top" />
          <div className="px-6 pt-8 pb-6 font-mono text-center">
            <div className="text-[10px] tracking-[0.3em] text-stone-400 mb-1">DIGITAL RECEIPT</div>
            <div className="text-xl font-black text-stone-900 tracking-tight mb-1">ALK - PHOTOBOOTH</div>
            <div className="text-[10px] text-stone-500 mb-4">{trxId}</div>
            <div className="dashed-divider my-3" />
            <div className="border border-stone-300 p-2 mb-4">
              <img src={dataURL} alt="Receipt" className="w-full block" />
            </div>
            {savedDate && <div className="text-[9px] text-stone-400 mb-3">{new Date(savedDate).toLocaleString('id-ID')}</div>}
            <button onClick={handleDownload} className="w-full bg-stone-900 hover:bg-black text-white font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98] mb-3">↓ UNDUH STRUK DIGITAL</button>
            <button onClick={onBack} className="w-full border-2 border-stone-300 hover:border-stone-900 text-stone-600 hover:text-stone-900 font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98]">◂ KEMBALI KE PHOTOBOOTH</button>
          </div>
          <div className="jagged-bottom" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   WELCOME PAGE
   ============================================================ */
function WelcomePage({ onStart }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 paper-bg" />
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="receipt-card relative bg-white shadow-2xl">
          <div className="jagged-top" />
          <div className="px-7 pt-10 pb-8 text-center font-mono">
            <div className="inline-block mb-5">
              <div className="text-[10px] tracking-[0.4em] text-stone-400 mb-1">WELCOME TO</div>
              <div className="text-2xl font-black text-stone-900 tracking-tight">ALK<span className="text-red-600"> - </span>PHOTOBOOTH</div>
              <div className="text-[9px] tracking-[0.3em] text-stone-400 mt-1">PHOTO · STRIP · RECEIPT</div>
            </div>
            <div className="dashed-divider my-5" />
            <p className="text-[11px] text-stone-600 leading-relaxed mb-6">
              Photobooth yang mencetak foto langsung di <span className="font-bold text-stone-900">kertas struk</span> thermal.
            </p>
            <div className="mb-6 px-1">
              <table className="w-full border-collapse">
                <tbody>
                  {[['01', 'Ambil foto dengan kamera'], ['02', 'Pilih filter sketch / outline'], ['03', 'Cetak struk thermal + QR digital']].map(([num, text]) => (
                    <tr key={num}>
                      <td className="align-baseline pr-3 pb-2 text-right"><span className="text-[10px] text-stone-400 font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{num}</span></td>
                      <td className="align-baseline pb-2 text-left"><span className="text-[10px] text-stone-600 leading-tight">{text}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dashed-divider my-5" />
            <button onClick={onStart} className="w-full bg-stone-900 hover:bg-black text-white font-mono font-bold text-sm py-3.5 tracking-widest transition-all active:scale-[0.98] receipt-btn">▸ MULAI ◂</button>
          </div>
          <div className="jagged-bottom" />
        </div>
      </div>
      <style>{`
        .receipt-card { transform: rotate(-0.4deg); transition: transform 0.4s ease; }
        .receipt-card:hover { transform: rotate(0deg) translateY(-2px); }
        .jagged-top,.jagged-bottom { height:10px; background-image: linear-gradient(135deg,transparent 50%,white 50%),linear-gradient(225deg,transparent 50%,white 50%); background-size:14px 10px; background-repeat:repeat-x; }
        .jagged-top { background-position:0 10px; } .jagged-bottom { background-position:0 0; }
        .dashed-divider { border-top:1px dashed #999; height:0; }
        .receipt-btn { position:relative; overflow:hidden; }
        .receipt-btn::before,.receipt-btn::after { content:''; position:absolute; top:0; width:8px; height:8px; background:#ebe5d6; border-radius:50%; }
        .receipt-btn::before { left:0; } .receipt-btn::after { right:0; }
      `}</style>
    </div>
  );
}

/* ============================================================
   CAMERA PAGE
   ============================================================ */
function CameraPage({ onCapture, onBack }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const initCamera = useCallback(async (deviceId) => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setCameraReady(true); setCameraError(false);
    } catch (e) { setCameraError(true); setCameraReady(false); }
  }, []);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(all => {
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);
      if (vids.length > 0) setSelectedDevice(vids[0].deviceId);
    });
    initCamera();
    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, [initCamera]);

  useEffect(() => { if (selectedDevice) initCamera(selectedDevice); }, [selectedDevice, initCamera]);

  const doCountdown = () => new Promise(resolve => {
    setCountdown(3); beep(880, 0.1);
    let c = 3;
    const iv = setInterval(() => {
      c--;
      if (c > 0) { setCountdown(c); beep(880, 0.1); }
      else { clearInterval(iv); setFlash(true); shutterSound(); setTimeout(() => { setFlash(false); setCountdown(null); resolve(); }, 400); }
    }, 1000);
  });

  const handleCapture = async () => {
    if (capturing || !videoRef.current) return;
    setCapturing(true);
    await doCountdown();
    onCapture(captureRaw(videoRef.current));
    setCapturing(false);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 paper-bg" />
      {flash && <div className="fixed inset-0 bg-white z-50 animate-fade-in pointer-events-none" />}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-dashed border-stone-300">
        <button onClick={onBack} className="text-stone-600 hover:text-stone-900 transition text-xs font-mono font-bold tracking-widest">◂ KEMBALI</button>
        <div className="text-[10px] font-mono tracking-widest text-stone-500">ALK - PHOTOBOOTH / CAPTURE</div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className={`inline-block w-2 h-2 rounded-full ${cameraReady ? 'bg-emerald-600 animate-pulse' : 'bg-stone-400'}`} />
          <span className={cameraReady ? 'text-emerald-700 font-bold' : 'text-stone-500'}>{cameraReady ? 'READY' : '...'}</span>
        </div>
      </header>
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 gap-5">
        <div className="w-full max-w-md">
          <div className="bg-white shadow-xl receipt-frame">
            <div className="jagged-top" />
            <div className="px-4 pt-4 pb-2 font-mono text-center border-b border-dashed border-stone-300">
              <div className="text-[10px] tracking-widest text-stone-500">CAMERA PREVIEW · 3:4</div>
            </div>
            <div className="relative aspect-[3/4] bg-stone-900 overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <div className="absolute inset-3 pointer-events-none">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/70" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/70" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/70" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/70" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 border border-white/30 relative">
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" />
                </div>
              </div>
              <div className="absolute bottom-2 left-2 font-mono text-[8px] text-white/40 pointer-events-none">{PHOTO_W}x{PHOTO_H}</div>
              {countdown !== null && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 z-20">
                  <span key={countdown} className="text-8xl font-black text-white font-mono animate-scale-in">{countdown}</span>
                  <span className="text-[10px] font-mono tracking-widest text-stone-300">SMILE PLEASE</span>
                </div>
              )}
              {cameraError && (
                <div className="absolute inset-0 bg-stone-900 flex flex-col items-center justify-center gap-3 text-center p-6">
                  <div className="text-red-500 text-3xl">⚠</div>
                  <h3 className="text-sm font-mono font-bold text-stone-200">KAMERA TIDAK TERDETEKSI</h3>
                  <p className="text-[10px] font-mono text-stone-400 max-w-xs">Berikan izin akses kamera pada browser.</p>
                  <button onClick={() => initCamera(selectedDevice)} className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-[10px] font-mono font-bold rounded transition tracking-widest">COBA LAGI</button>
                </div>
              )}
            </div>
            <div className="px-4 py-3 font-mono text-[9px] text-stone-500 flex justify-between border-t border-dashed border-stone-300">
              <span>MODE: SINGLE</span><span>{devices.length > 1 ? `${devices.length} CAM` : '1 CAM'}</span><span>3:4 · HD</span>
            </div>
            <div className="jagged-bottom" />
          </div>
        </div>
        {devices.length > 1 && (
          <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} disabled={capturing} className="font-mono text-[10px] bg-white border border-stone-300 px-3 py-1.5 rounded tracking-widest">
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `KAMERA ${i + 1}`}</option>)}
          </select>
        )}
        <button onClick={handleCapture} disabled={capturing || !cameraReady} className={`relative group ${capturing || !cameraReady ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="w-20 h-20 rounded-full bg-stone-900 border-4 border-stone-300 shadow-2xl flex items-center justify-center transition-all active:scale-90 group-hover:scale-105">
            <div className="w-14 h-14 rounded-full bg-white border-2 border-stone-300 flex items-center justify-center">
              <div className="text-[10px] font-mono font-bold text-stone-900 tracking-wider">CAPTURE</div>
            </div>
          </div>
        </button>
        <p className="text-[10px] text-stone-500 font-mono tracking-widest -mt-2">{capturing ? '› MEMPROSES...' : '› TEKAN TOMBOL UNTUK FOTO'}</p>
      </main>
      <style>{`.receipt-frame { transform: rotate(0.2deg); }`}</style>
    </div>
  );
}

/* ============================================================
   FILTER SELECTION PAGE — Besar, tanpa "ULANG FOTO"
   ============================================================ */
function FilterPage({ capture, onApply, onBack }) {
  const [selectedFilter, setSelectedFilter] = useState('sketch');
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const img = new Image();
    img.onload = async () => {
      const results = {};
      for (const f of FILTERS) {
        const url = await processPhoto(capture, f.id, 270);
        if (mounted) results[f.id] = url;
      }
      if (mounted) { setPreviews(results); setLoading(false); }
    };
    img.src = capture;
    return () => { mounted = false; };
  }, [capture]);

  const handleApply = () => { beep(880, 0.08); onApply(selectedFilter); };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 paper-bg" />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-dashed border-stone-300">
        <button onClick={onBack} className="text-stone-600 hover:text-stone-900 transition text-xs font-mono font-bold tracking-widest">◂ KEMBALI</button>
        <div className="text-[10px] font-mono tracking-widest text-stone-500">ALK - PHOTOBOOTH / FILTER</div>
        <div className="w-20" />
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 overflow-y-auto">
        <div className="w-full max-w-4xl">
          <div className="flex flex-col md:flex-row gap-6 items-start">

            {/* ===== KIRI: Foto asli (BESAR) ===== */}
            <div className="w-full md:w-[380px] md:shrink-0">
              <div className="bg-white shadow-xl">
                <div className="jagged-top" />
                <div className="px-4 pt-3 pb-2 font-mono text-center border-b border-dashed border-stone-300">
                  <div className="text-[10px] tracking-widest text-stone-500">FOTO ANDA · {PHOTO_W}x{PHOTO_H}</div>
                </div>
                <div className="p-3">
                  <div className="aspect-[3/4] bg-stone-100 overflow-hidden border border-stone-300">
                    {/* Tanpa scaleX(-1) karena captureRaw sudah mirror */}
                    <img src={capture} alt="Original" className="w-full h-full object-cover" />
                  </div>
                </div>
                <div className="px-4 py-2 font-mono text-[9px] text-stone-500 flex justify-between border-t border-dashed border-stone-300">
                  <span>STATUS: OK</span><span>RATIO: 3:4</span>
                </div>
                <div className="jagged-bottom" />
              </div>
            </div>

            {/* ===== KANAN: Filter besar + Button ===== */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-2 mb-5 font-mono">
                <div className="flex-1 h-px dashed-line" />
                <span className="text-[10px] tracking-widest text-stone-600 font-bold whitespace-nowrap">PILIH FILTER</span>
                <div className="flex-1 h-px dashed-line" />
              </div>

              {loading ? (
                <div className="text-center py-20 font-mono text-[11px] text-stone-500 tracking-widest">
                  <div className="inline-block animate-pulse">MEMPROSES PREVIEW...</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    {FILTERS.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setSelectedFilter(f.id); beep(660, 0.05); }}
                        className={`group bg-white shadow-md transition-all duration-300 text-left ${
                          selectedFilter === f.id ? 'ring-2 ring-stone-900 shadow-xl' : 'hover:shadow-xl'
                        }`}
                      >
                        <div className="jagged-top" />
                        <div className="p-3 font-mono">
                          <div className="aspect-[3/4] bg-stone-100 overflow-hidden border border-stone-300 mb-3">
                            {previews[f.id] && <img src={previews[f.id]} alt={f.name} className="w-full h-full object-cover" />}
                          </div>
                          <div className="text-[9px] text-stone-400 tracking-widest mb-1">CODE: {f.code}</div>
                          <div className="text-sm font-bold text-stone-900 tracking-tight mb-1">{f.name}</div>
                          <div className="text-[10px] text-stone-500 leading-tight">{f.desc}</div>
                          {selectedFilter === f.id && (
                            <div className="inline-block mt-2 bg-stone-900 text-white text-[9px] font-mono font-bold px-2 py-0.5 tracking-widest">✓ TERPILIH</div>
                          )}
                        </div>
                        <div className="jagged-bottom" />
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleApply}
                    className="w-full mt-5 bg-stone-900 hover:bg-black text-white font-mono font-bold text-sm py-4 tracking-widest transition-all active:scale-[0.98] shadow-lg"
                  >
                    ▸ CETAK SEKARANG ◂
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

/* ============================================================
   PEMBAYARAN PAGE
   ============================================================ */
function PaymentPage({ onPaymentSuccess, onBack }) {
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [snapToken, setSnapToken] = useState('');
  const [snapUrl, setSnapUrl] = useState('');

  const handlePay = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        setOrderId(data.data.order_id);
        setSnapToken(data.data.snap_token);
        setSnapUrl(data.data.snap_url);

        // Open Midtrans Snap SDK Popup
        if (window.snap) {
          window.snap.pay(data.data.snap_token, {
            onSuccess: function (result) {
              onPaymentSuccess(data.data.order_id);
            },
            onPending: function (result) {
              console.log('Payment pending', result);
            },
            onError: function (result) {
              alert('Pembayaran gagal. Silakan coba lagi.');
            },
            onClose: function () {
              console.log('Payment popup closed');
            }
          });
        } else {
          // Fallback direct redirect
          window.open(data.data.snap_url, '_blank');
        }
      } else {
        alert(data.message || 'Gagal membuat pembayaran.');
      }
    } catch (e) {
      alert('Gagal terhubung ke server.');
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!orderId) return;
    try {
      const response = await fetch(`/api/payment/status/${orderId}`);
      const data = await response.json();
      if (data.success) {
        if (data.data.status === 'settlement') {
          onPaymentSuccess(orderId);
        } else {
          alert('Pembayaran belum terdeteksi. Status saat ini: ' + data.data.status.toUpperCase());
        }
      }
    } catch (e) {
      alert('Gagal memeriksa status pembayaran.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 paper-bg" />
      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="receipt-card relative bg-white shadow-2xl">
          <div className="jagged-top" />
          <div className="px-7 pt-10 pb-8 text-center font-mono">
            <div className="inline-block mb-5">
              <div className="text-[10px] tracking-[0.4em] text-stone-400 mb-1">WELCOME TO</div>
              <div className="text-2xl font-black text-stone-900 tracking-tight">PEMBAYARAN</div>
              <div className="text-[9px] tracking-[0.3em] text-stone-400 mt-1">ALK · PHOTOBOOTH</div>
            </div>
            <div className="dashed-divider my-5" />
            <p className="text-[11px] text-stone-600 leading-relaxed mb-6">
              Selesaikan pembayaran untuk dapat mengambil dan mengedit foto Anda.
            </p>
            <div className="mb-6">
              <div className="text-xs text-stone-400 mb-1">TOTAL BIAYA</div>
              <div className="text-3xl font-black text-stone-900 tracking-tight">Rp5.000</div>
              <div className="text-[10px] text-stone-500 mt-1">1x Cetak Struk + Download Digital</div>
            </div>
            <div className="dashed-divider my-5" />

            {!orderId ? (
              <button onClick={handlePay} disabled={loading} className="w-full bg-stone-900 hover:bg-black text-white font-mono font-bold text-sm py-3.5 tracking-widest transition-all active:scale-[0.98] receipt-btn">
                {loading ? 'MEMPROSES...' : 'BAYAR SEKARANG'}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-stone-600 bg-stone-50 border border-stone-200 p-3 text-left leading-relaxed mb-3">
                  <span className="font-bold text-stone-900">ID Transaksi:</span><br/> {orderId}<br/>
                  <span className="font-bold text-stone-900 mt-1 block">Status:</span> Menunggu Pembayaran
                </div>
                <button onClick={() => window.snap && window.snap.pay(snapToken)} className="w-full bg-stone-900 hover:bg-black text-white font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98] mb-1">
                  BUKA PEMBAYARAN
                </button>
                <button onClick={checkStatus} className="w-full border-2 border-stone-950 text-stone-950 font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98]">
                  CEK STATUS PEMBAYARAN
                </button>
              </div>
            )}

            <button onClick={onBack} disabled={loading} className="w-full mt-3 text-stone-500 hover:text-stone-900 font-mono text-[10px] tracking-widest transition-all active:scale-[0.98] underline decoration-dashed">
              KEMBALI
            </button>
          </div>
          <div className="jagged-bottom" />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   RESULT PAGE
   ============================================================ */
function ResultPage({ receiptURL, trxId, filterId, onNewPhoto, onBackToFilter }) {
  const [printing, setPrinting] = useState(true);
  const [panelQR, setPanelQR] = useState(null);

  useEffect(() => {
    let mounted = true;
    setPrinting(true);
    printSound();
    
    // Generate panel QR code pointing to the download URL
    const downloadUrl = `${window.location.origin}/api/download/${trxId}`;
    generateQRDataURL(downloadUrl, 160).then(qr => {
      if (mounted) {
        setPanelQR(qr);
        setTimeout(() => setPrinting(false), 1000);
      }
    });
    return () => { mounted = false; };
  }, [trxId]);

  const handlePrint = () => { if (receiptURL) printImg(receiptURL); };
  const filter = FILTERS.find(f => f.id === filterId);

  // Directly triggers image download via URL
  const triggerDownload = () => {
    const downloadUrl = `/api/download/${trxId}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `receipt_${trxId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 paper-bg" />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-dashed border-stone-300">
        <button onClick={onBackToFilter} className="text-stone-600 hover:text-stone-900 transition text-xs font-mono font-bold tracking-widest">◂ UBAH FILTER</button>
        <div className="text-[10px] font-mono tracking-widest text-stone-500">ALK - PHOTOBOOTH / HASIL</div>
        <div className="w-20" />
      </header>

      <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-6 overflow-y-auto">
        {printing ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 pt-20">
            <div className="printer-top animate-pulse" />
            <div className="text-center font-mono text-[10px] text-stone-500 tracking-widest animate-pulse">› MENGGAMBAR STRUK...</div>
          </div>
        ) : (
          <div className="w-full max-w-2xl animate-fade-in">
            <div className="flex flex-col sm:flex-row gap-5 items-start">

              {/* ===== KIRI: Struk rata tengah ===== */}
              <div className="w-full sm:flex-1 flex flex-col items-center">
                <div className="printer-top" />
                <div className="bg-white shadow-2xl">
                  <div className="jagged-top" />
                  {receiptURL && (
                    <img
                      src={receiptURL}
                      alt="Receipt"
                      className="block w-full"
                      style={{ maxWidth: RECEIPT_W + 'px', margin: '0 auto' }}
                    />
                  )}
                  <div className="jagged-bottom" />
                </div>
              </div>

              {/* ===== KANAN: Info panel ===== */}
              <div className="w-full sm:flex-1 sm:pt-8">
                <div className="bg-white shadow-xl p-5 font-mono">
                  <div className="jagged-top" />
                  <div className="pt-5 pb-4">
                    <div className="text-[9px] tracking-[0.3em] text-stone-400 mb-1">FILTER TERPAKAI</div>
                    <div className="text-base font-bold text-stone-900 tracking-tight mb-0.5">{filter?.name}</div>
                    <div className="text-[10px] text-stone-500">{filter?.code} · {trxId}</div>
                    <div className="text-[8px] text-stone-400 mt-1">Foto: {PHOTO_W}x{PHOTO_H}px · Struk: {RECEIPT_W}px</div>
                  </div>
                  <div className="dashed-divider" />
                  <div className="py-4 flex flex-col items-center">
                    <div className="text-[9px] tracking-[0.2em] text-stone-400 mb-3">SCAN UNTUK UNDUH DIGITAL</div>
                    <div className="bg-white border-2 border-stone-300 p-2 mb-2">
                      {panelQR ? <img src={panelQR} alt="QR" className="w-36 h-36 block" /> : <div className="w-36 h-36 bg-stone-100 flex items-center justify-center text-[9px] text-stone-400">QR...</div>}
                    </div>
                    <div className="text-[8px] text-stone-400 leading-relaxed text-center">Scan QR di atas untuk mengunduh<br />versi digital struk ini.</div>
                  </div>
                  <div className="dashed-divider" />
                  <div className="pt-4 pb-5 flex flex-col gap-2">
                    <button onClick={triggerDownload} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98] mb-1">↓ UNDUH STRUK DIGITAL</button>
                    <button onClick={handlePrint} className="w-full bg-stone-900 hover:bg-black text-white font-mono font-bold text-xs py-3 tracking-widest transition-all active:scale-[0.98]">⎙ CETAK STRUK MANUAL</button>
                  </div>
                  <div className="jagged-bottom" />
                </div>
                <button onClick={onNewPhoto} className="w-full mt-3 font-mono text-[11px] text-stone-500 hover:text-stone-900 transition tracking-widest underline underline-offset-4 decoration-dashed text-center py-2">↻ AMBIL FOTO BARU</button>
              </div>

            </div>
          </div>
        )}
      </main>

      <style>{`
        .printer-top {
          height: 24px;
          background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 60%, #0a0a0a 100%);
          border-radius: 6px 6px 2px 2px;
          position: relative;
          margin-bottom: -8px;
          z-index: 2;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          width: 100%;
          max-width: ${RECEIPT_W + 16}px;
        }
        .printer-top::before { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:60%; height:6px; background:#000; border-radius:0 0 4px 4px; }
        .printer-top::after { content:'ALK - PHOTOBOOTH'; position:absolute; top:6px; left:50%; transform:translateX(-50%); color:#666; font-family:'Courier New',monospace; font-size:7px; letter-spacing:1px; white-space:nowrap; }
        .dashed-divider { border-top:1px dashed #999; height:0; }
      `}</style>
    </div>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */
function App() {
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState('');
  const [capture, setCapture] = useState(null);
  const [filterId, setFilterId] = useState('sketch');
  const [photoURL, setPhotoURL] = useState(null);
  const [receiptURL, setReceiptURL] = useState('');
  const [processing, setProcessing] = useState(false);
  const [digitalReceipt, setDigitalReceipt] = useState(null);

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#dl=')) {
        const id = hash.substring(4);
        const data = localStorage.getItem(`alk_receipt_${id}`);
        if (data) setDigitalReceipt({ trxId: id, dataURL: data });
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const handleBackFromDigital = () => { window.location.hash = ''; setDigitalReceipt(null); };

  if (digitalReceipt) return <DigitalReceiptPage {...digitalReceipt} onBack={handleBackFromDigital} />;

  const handleStart = () => { beep(880, 0.08); setPage(1.5); };
  const handlePaymentSuccess = (id) => { setOrderId(id); setPage(2); };
  const handleCapture = (raw) => { setCapture(raw); setPage(3); };

  const handleApply = async (fId) => {
    setFilterId(fId);
    setProcessing(true);
    try {
      // Process local filters on canvas preview
      const result = await processPhoto(capture, fId, PHOTO_W);
      setPhotoURL(result);

      // Upload image to server with order_id to trigger rendering and printing
      const response = await fetch('/api/photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          image: result,
          filter: fId,
          frame: 'none',
          mode: 'single',
          order_id: orderId
        })
      });

      const resData = await response.json();
      if (resData.success) {
        setReceiptURL(resData.data.receipt_url);
        setPage(4);
      } else {
        alert(resData.message || 'Gagal menyimpan dan mencetak struk.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat menghubungi server.');
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  /* Ambil foto baru → langsung ke halaman pertama */
  const handleNewPhoto = () => {
    setCapture(null);
    setPhotoURL(null);
    setFilterId('sketch');
    setOrderId('');
    setReceiptURL('');
    setPage(1);
  };

  if (processing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center paper-bg gap-4">
        <div className="bg-white shadow-2xl p-8 font-mono text-center receipt-card" style={{ transform: 'rotate(-1deg)' }}>
          <div className="text-xs tracking-widest text-stone-500 mb-2">PROCESSING</div>
          <div className="text-stone-900 font-bold text-sm mb-1">MENGIRIM & MENCETAK...</div>
          <div className="text-[9px] text-stone-400 mb-4">{PHOTO_W}x{PHOTO_H}px · 3:4</div>
          <div className="flex justify-center gap-1">
            {[0,1,2,3,4].map(i => <div key={i} className="w-2 h-2 bg-stone-900 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-mono text-stone-900">
      {page === 1 && <WelcomePage onStart={handleStart} />}
      {page === 1.5 && <PaymentPage onPaymentSuccess={handlePaymentSuccess} onBack={() => setPage(1)} />}
      {page === 2 && <CameraPage key="cam" onCapture={handleCapture} onBack={() => setPage(1.5)} />}
      {page === 3 && <FilterPage key="filter" capture={capture} onApply={handleApply} onBack={() => setPage(2)} />}
      {page === 4 && <ResultPage key="result" receiptURL={receiptURL} trxId={orderId} filterId={filterId} onNewPhoto={handleNewPhoto} onBackToFilter={() => setPage(3)} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Space+Mono:wght@400;700&display=swap');
        body { font-family: 'JetBrains Mono', 'Courier New', monospace !important; background: #ebe5d6; margin: 0; }
        * { font-family: 'JetBrains Mono', 'Courier New', monospace !important; box-sizing: border-box; }
        .paper-bg {
          background-color: #ebe5d6;
          background-image: radial-gradient(circle at 20% 30%, rgba(0,0,0,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.04) 0%, transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 3px);
        }
        .jagged-top,.jagged-bottom { height:10px; background-image: linear-gradient(135deg,transparent 50%,white 50%),linear-gradient(225deg,transparent 50%,white 50%); background-size:14px 10px; background-repeat:repeat-x; }
        .jagged-top { background-position:0 10px; } .jagged-bottom { background-position:0 0; }
        .dashed-line { background-image: linear-gradient(to right, #999 50%, transparent 50%); background-size:4px 1px; background-repeat:repeat-x; }
        .dashed-divider { border-top:1px dashed #999; height:0; }
        .receipt-card { transform: rotate(-0.4deg); transition: transform 0.4s ease; }
        .receipt-card:hover { transform: rotate(0deg) translateY(-2px); }
        @keyframes fade-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease-out; }
        @keyframes scale-in { from { opacity:0; transform:scale(0.8); } to { opacity:1; transform:scale(1); } }
        .animate-scale-in { animation: scale-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}

createRoot(document.getElementById('app')).render(<App />);