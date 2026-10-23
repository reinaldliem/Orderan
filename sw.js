// Service worker Order Sales — membuat website bisa DIPASANG sebagai aplikasi.
//
// SENGAJA TIDAK MENYIMPAN KODE APLIKASI. Setiap kali dibuka, HP/komputer
// mengambil versi terbaru dari internet — update tetap cukup dengan push ke
// GitHub, tidak ada HP yang terjebak memakai versi lama.
//
// Satu-satunya tugasnya: kalau HALAMAN dibuka tanpa sinyal, tampilkan pesan
// "Tidak ada koneksi internet" yang rapi, bukan halaman error browser.
// Permintaan lain (CSS, JS, gambar, Supabase) tidak disentuh sama sekali.
//
// TOMBOL DARURAT — kalau aplikasi terpasang bermasalah, ganti SELURUH isi
// berkas ini dengan tiga baris berikut lalu push. Semua HP kembali menjadi
// website biasa saat dibuka berikutnya:
//
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', () => self.registration.unregister()
//     .then(() => self.clients.matchAll()).then((cs) => cs.forEach((c) => c.navigate(c.url))));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const HALAMAN_TANPA_SINYAL = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#17130f">
<title>Tidak ada koneksi — Order Sales</title>
<style>
  /* token yang sama dengan :root di css/app.css (halaman ini tidak memuat app.css) */
  :root { --kraft: #ddd0b8; --tinta: #17130f; --tinta-2: #645740; --blok: #f4efe4; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         background: var(--kraft); color: var(--tinta); padding: 24px; box-sizing: border-box;
         font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
  main { max-width: 360px; text-align: center; }
  h1 { font-size: 26px; text-transform: uppercase; letter-spacing: .02em; margin: 0 0 10px; }
  p { font-size: 15px; line-height: 1.5; margin: 0 0 22px; color: var(--tinta-2); }
  button { width: 100%; min-height: 52px; border: 0; border-radius: 0; cursor: pointer;
           background: var(--tinta); color: var(--blok); font: inherit; font-weight: 800;
           font-size: 15px; letter-spacing: .1em; text-transform: uppercase; }
</style></head>
<body><main>
  <h1>Tidak ada koneksi</h1>
  <p>HP ini sedang tidak tersambung ke internet. Order belum bisa dibuka atau dikirim.
     Cari sinyal lalu coba lagi.</p>
  <button type="button" onclick="location.reload()">Coba lagi</button>
</main></body></html>`;

self.addEventListener('fetch', (e) => {
  const r = e.request;
  // hanya membuka HALAMAN dari situs ini sendiri
  if (r.mode !== 'navigate' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).catch(() => new Response(HALAMAN_TANPA_SINYAL, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })),
  );
});
