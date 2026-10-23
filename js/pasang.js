// Memasang Order Sales sebagai aplikasi (PWA) di HP atau komputer.
//
// Diimpor PALING AWAL oleh app.js: browser mengirim tawaran "pasang" sekali
// saja, dan harus sudah ditangkap sebelum layar masuk digambar.

let tawaran = null;   // event beforeinstallprompt (Chrome/Edge, HP & komputer)
const pendengar = new Set();

function kabari() { pendengar.forEach((f) => { try { f(); } catch { /* abaikan */ } }); }

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // jangan pakai spanduk bawaan; tombol kita sendiri
  tawaran = e;
  kabari();
});
window.addEventListener('appinstalled', () => {
  tawaran = null;
  kabari();
});

// Service worker: hanya untuk syarat "bisa dipasang" + pesan tanpa sinyal
// (lihat sw.js). Gagal mendaftar = aplikasi tetap jalan sebagai website.
if ('serviceWorker' in navigator) {
  // Alamat relatif terhadap BERKAS INI (js/pasang.js -> ../sw.js), bukan terhadap
  // halaman: selalu akar aplikasi, di GitHub Pages (/Orderan/sw.js) maupun lokal.
  const daftar = () => navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url)).catch(() => {});
  if (document.readyState === 'complete') daftar();
  else window.addEventListener('load', daftar);
}

/** Sedang dibuka sebagai aplikasi terpasang (bukan di tab browser)? */
export function sudahTerpasang() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** Browser menawarkan pemasangan (Chrome/Edge di HP atau komputer)? */
export function bisaPasang() {
  return !!tawaran && !sudahTerpasang();
}

/** iPhone/iPad Safari: tidak ada tombol pasang otomatis, perlu petunjuk manual. */
export function iPhone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !sudahTerpasang();
}

/** Tampilkan jendela "Pasang aplikasi" milik browser. */
export async function pasang() {
  if (!tawaran) return false;
  const e = tawaran;
  tawaran = null;
  e.prompt();
  const { outcome } = await e.userChoice;
  kabari();
  return outcome === 'accepted';
}

/** Dipanggil setiap kali kemampuan pasang berubah. Mengembalikan fungsi pelepas. */
export function saatBerubah(f) {
  pendengar.add(f);
  return () => pendengar.delete(f);
}
