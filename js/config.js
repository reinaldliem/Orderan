// ============================================================
//  SAMBUNGAN KE DATABASE (Supabase)
//
//  Anda TIDAK WAJIB mengedit berkas ini.
//  Buka saja websitenya — kalau belum tersambung, akan muncul layar
//  "Sambungkan ke database" dan Anda cukup menempel dua teks di situ.
//
//  Kalau ingin dipasang permanen untuk semua HP sekaligus, isi dua baris
//  di bawah ini (Supabase → Project Settings → API):
//    URL          <- Project URL
//    KUNCI_PUBLIK <- kunci "anon public"
//  JANGAN pernah memakai kunci "service_role" di sini.
// ============================================================

const URL_DISINI = 'https://aaurlqaqpldoohfnvcyx.supabase.co';
const KUNCI_DISINI =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdXJscWFxcGxkb29oZm52Y3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzA5MDQsImV4cCI6MjEwMzkwNjkwNH0.' +
  '8g6KDqL19dSJ27QXiPDYo8BWCiXmm4NGfAVd1EAzKao';

// ------------------------------------------------------------
// Yang disimpan lewat layar pengaturan (tersimpan di HP ini saja)
// ------------------------------------------------------------
export const KUNCI_SIMPANAN = 'order-sambungan-v1';

function bacaSimpanan() {
  try {
    const s = JSON.parse(localStorage.getItem(KUNCI_SIMPANAN) || 'null');
    if (s && s.URL && s.KUNCI_PUBLIK) return s;
  } catch { /* abaikan */ }
  return null;
}

const belumDiisiDiBerkas = URL_DISINI.includes('XXXX') || KUNCI_DISINI.startsWith('ISI_');
const simpanan = belumDiisiDiBerkas ? bacaSimpanan() : null;

export const CONFIG = {
  // Isi di berkas menang; kalau kosong, pakai yang disimpan dari layar pengaturan.
  URL: (belumDiisiDiBerkas ? simpanan?.URL : URL_DISINI) || URL_DISINI,
  KUNCI_PUBLIK: (belumDiisiDiBerkas ? simpanan?.KUNCI_PUBLIK : KUNCI_DISINI) || KUNCI_DISINI,

  NAMA_APP: 'Order Sales',
  DOMAIN_LOGIN: '@order.local', // jangan diubah — harus sama dengan SQL
};

export const BELUM_DISETEL =
  CONFIG.URL.includes('XXXX') || CONFIG.KUNCI_PUBLIK.startsWith('ISI_');

/** Simpan sambungan dari layar pengaturan. */
export function simpanSambungan(url, kunci) {
  localStorage.setItem(KUNCI_SIMPANAN, JSON.stringify({
    URL: url, KUNCI_PUBLIK: kunci, pada: Date.now(),
  }));
}

export function hapusSambungan() {
  localStorage.removeItem(KUNCI_SIMPANAN);
}

/** Sambungan sedang berasal dari layar pengaturan, bukan dari berkas? */
export const DARI_LAYAR = belumDiisiDiBerkas && !!simpanan;
