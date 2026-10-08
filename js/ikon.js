// Ikon digambar, bukan emoji.
//
// Emoji dirender berbeda di tiap HP, ukurannya tidak bisa dikendalikan, dan
// warnanya tidak ikut tema — tiga alasan yang cukup untuk membuangnya.
//
// Semua ikon di sini satu keluarga: kisi 24, goresan 2, ujung SIKU dan sudut
// LANCIP. Bukan bulat. Dunia Sak Semen itu cetakan stensil di atas kertas
// kraft; ikon berujung bulat akan terasa dari aplikasi yang berbeda.

const GAMBAR = {
  // --- navigasi utama ---
  nota: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  riwayat: '<path d="M4 6h12v15H4z"/><path d="M8 3h12v15"/><path d="M7 11h6"/><path d="M7 15h4"/>',
  admin: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/><path d="M9 4v6"/><path d="M15 9v6"/><path d="M9 14v6"/>',

  // --- data induk ---
  toko: '<path d="M4 9h16l-1.5-5h-13z"/><path d="M5 9v11h14V9"/><path d="M9.5 20v-6h5v6"/>',
  barang: '<path d="M21 8.5 12 3.5 3 8.5v7l9 5 9-5z"/><path d="m3 8.5 9 5 9-5"/><path d="M12 13.5v7"/>',
  akun: '<path d="M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z"/><path d="M4.5 20.5c.8-4 3.9-6 7.5-6s6.7 2 7.5 6"/>',

  // --- tindakan ---
  unduh: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 18v3h16v-3"/>',
  tempel: '<path d="M8 4h8v3H8z"/><path d="M6 5.5H4v15h16v-15h-2"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  cari: '<path d="M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/><path d="m16 16 4.5 4.5"/>',
  tambah: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  segarkan: '<path d="M19.5 11A7.5 7.5 0 0 0 6.2 6.6L4.5 8.5"/><path d="M4.5 4v4.5H9"/>' +
            '<path d="M4.5 13a7.5 7.5 0 0 0 13.3 4.4l1.7-1.9"/><path d="M19.5 20v-4.5H15"/>',
  centang: '<path d="m4 12.5 5.5 5.5L20 7"/>',
  mundur: '<path d="m15 5-7 7 7 7"/>',
  maju: '<path d="m9 5 7 7-7 7"/>',
  silang: '<path d="M5 5l14 14"/><path d="M19 5 5 19"/>',
  tanggal: '<path d="M4 6h16v15H4z"/><path d="M4 11h16"/><path d="M8.5 3v5"/><path d="M15.5 3v5"/>',
  catatan: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M8.5 13h7"/><path d="M8.5 17h4"/>',

  // --- keadaan ---
  peringatan: '<path d="M12 3 1.5 21h21z"/><path d="M12 9.5v5"/><path d="M12 17.5h.01"/>',
  // Peti terbuka, bukan tanda larangan: ini "belum ada isinya",
  // bukan "tidak boleh".
  kosong: '<path d="M4 9h16v11H4z"/><path d="M4 9 7.5 4h9L20 9"/><path d="M12 4v5"/>',
  jam: '<path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z"/><path d="M12 7v5.2l3.4 2"/>',
  lonceng: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21.5h4"/><path d="M12 3v2"/>',
  keluar: '<path d="M14 4h6v16h-6"/><path d="m9 16 4-4-4-4"/><path d="M13 12H3"/>',
};

/**
 * Satu ikon sebagai teks SVG, siap ditempel ke innerHTML.
 *
 * @param {string} nama   kunci di GAMBAR
 * @param {number} ukuran piksel, default 20
 * @param {string} kelas  kelas tambahan (mis. 'ikon')
 */
export function ikon(nama, ukuran = 20, kelas = '') {
  const d = GAMBAR[nama];
  if (!d) return '';
  return `<svg class="ik${kelas ? ' ' + kelas : ''}" width="${ukuran}" height="${ukuran}"` +
    ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
    ` stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
}

/** Nama ikon yang tersedia — dipakai pengujian supaya salah ketik ketahuan. */
export const NAMA_IKON = Object.keys(GAMBAR);
