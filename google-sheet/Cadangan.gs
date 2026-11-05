/**
 * Cadangan otomatis: database Order Sales -> Google Drive
 *
 * Tiap malam (sekitar jam 23.00 WIB) seluruh data diambil dari Supabase
 * lewat fungsi database ambil_cadangan() dan disimpan sebagai SATU berkas
 * JSON di folder Google Drive "Cadangan Order Sales". Jalan di server
 * Google — komputer tidak perlu menyala.
 *
 * Isi berkas: akun (tanpa PIN), kategori, barang, HPP, toko, pembagian
 * toko-sales, order, isi order, catatan, dan nomor urut order.
 *
 * Penyimpanan: berkas harian disimpan 60 hari. Setelah itu yang tersisa
 * hanya cadangan tanggal 1 tiap bulan (arsip bulanan, tidak pernah
 * dibuang). Berkas lama dipindah ke Sampah Drive, bukan dihapus permanen.
 *
 * Email ke pemilik skrip kalau: cadangan GAGAL, atau jumlah order turun
 * lebih dari separuh dibanding cadangan sebelumnya (tanda data terhapus).
 *
 * PASANG (sekali saja) — lihat juga PANDUAN-CADANGAN.md:
 *   1. Aplikasi Order -> Admin -> Akun -> buat akun:
 *        username "cadangan", peran "Pemantau", PIN 6 angka pilihan Anda.
 *   2. script.google.com -> New project -> hapus isi Code.gs -> tempel berkas ini.
 *   3. Project Settings -> Script properties -> Add script property:
 *        PIN = PIN akun "cadangan"
 *   4. Pilih fungsi pasangJadwal -> Run -> izinkan akses yang diminta.
 *   5. Pilih fungsi cadangkan -> Run -> buka folder "Cadangan Order Sales"
 *      di Google Drive: berkas pertama sudah ada.
 *
 * KALAU MACET: jalankan diagnosa() — dia memberi tahu langkah mana yang gagal.
 *
 * PIN sengaja TIDAK ditulis di dalam kode ini. Akun "cadangan" hanya bisa
 * MEMBACA; kalau PIN-nya bocor, tidak ada yang bisa diubah atau dihapus.
 */

const USERNAME = 'cadangan';
const NAMA_FOLDER = 'Cadangan Order Sales';
const AWALAN_BERKAS = 'cadangan-order-';
const SIMPAN_HARIAN_HARI = 60;  // lewat dari ini, hanya cadangan tanggal 1 yang disimpan
const JAM_JALAN = 23;           // WIB
const BATAS_TURUN = 0.5;        // order < 50% cadangan sebelumnya -> email peringatan

/** Nilai PUBLIK, sama dengan Kode.gs. Script property URL / KUNCI menang kalau diisi. */
const URL_BAWAAN = 'https://aaurlqaqpldoohfnvcyx.supabase.co';
const KUNCI_BAWAAN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdXJscWFxcGxkb29oZm52Y3l4Iiwicm9s' +
  'ZSI6ImFub24iLCJpYXQiOjE3ODgzMzA5MDQsImV4cCI6MjEwMzkwNjkwNH0' +
  '.8g6KDqL19dSJ27QXiPDYo8BWCiXmm4NGfAVd1EAzKao';

// ------------------------------------------------------------
// Pengaturan
// ------------------------------------------------------------
function prop_() {
  return PropertiesService.getScriptProperties();
}

function setelan_() {
  const p = prop_();
  const url = (p.getProperty('URL') || URL_BAWAAN).trim().replace(/\/+$/, '');
  const kunci = (p.getProperty('KUNCI') || KUNCI_BAWAAN).trim();
  const pin = (p.getProperty('PIN') || '').trim();
  if (!pin) {
    throw new Error(
      'Script property PIN belum diisi. Buka Project Settings -> Script properties -> ' +
      'Add script property: nama PIN (huruf besar semua), nilainya PIN akun "cadangan".'
    );
  }
  return { url: url, kunci: kunci, pin: pin };
}

// ------------------------------------------------------------
// Login, ambil, keluar
// ------------------------------------------------------------
function token_(s) {
  const res = UrlFetchApp.fetch(s.url + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: s.kunci },
    payload: JSON.stringify({ email: USERNAME + '@order.local', password: s.pin }),
    muteHttpExceptions: true,
  });
  const kode = res.getResponseCode();
  let isi = {};
  try { isi = JSON.parse(res.getContentText() || '{}'); } catch (e) { /* biarkan */ }

  if (kode !== 200) {
    if (isi.error_code === 'invalid_credentials') {
      throw new Error('PIN akun "cadangan" salah, atau akunnya belum dibuat ' +
        '(Admin -> Akun -> username "cadangan", peran Pemantau).');
    }
    throw new Error('Gagal login (kode ' + kode + '): ' + (isi.msg || res.getContentText()));
  }
  if (!isi.access_token) throw new Error('Login berhasil tapi token tidak diterima.');
  return isi.access_token;
}

/** Keluar hanya dari sesi skrip ini (scope=local), supaya sesi tidak menumpuk. */
function keluar_(s, tok) {
  try {
    UrlFetchApp.fetch(s.url + '/auth/v1/logout?scope=local', {
      method: 'post',
      headers: { apikey: s.kunci, Authorization: 'Bearer ' + tok },
      muteHttpExceptions: true,
    });
  } catch (e) { /* tidak penting: token mati sendiri dalam 1 jam */ }
}

function ambilCadangan_(s, tok) {
  const res = UrlFetchApp.fetch(s.url + '/rest/v1/rpc/ambil_cadangan', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: s.kunci, Authorization: 'Bearer ' + tok },
    payload: '{}',
    muteHttpExceptions: true,
  });
  const kode = res.getResponseCode();
  if (kode === 404) {
    throw new Error('Fungsi ambil_cadangan belum ada di database. Jalankan sql/17-cadangan.sql di Supabase.');
  }
  if (kode !== 200) {
    throw new Error('Gagal mengambil cadangan (kode ' + kode + '): ' + res.getContentText().slice(0, 300));
  }
  const teks = res.getContentText();
  const data = JSON.parse(teks);
  periksa_(data);
  return { data: data, teks: teks };
}

/** Berkas yang cacat lebih berbahaya daripada tidak ada berkas: periksa dulu. */
function periksa_(d) {
  if (!d || d.versi !== 1 || !d.tabel || !d.jumlah || !Array.isArray(d.urutan_pulih)) {
    throw new Error('Isi cadangan tidak sesuai bentuk yang diharapkan (versi/tabel/jumlah).');
  }
  d.urutan_pulih.forEach((t) => {
    const baris = d.tabel[t];
    if (!Array.isArray(baris)) throw new Error('Tabel "' + t + '" tidak ada di cadangan.');
    if (baris.length !== d.jumlah[t]) {
      throw new Error('Tabel "' + t + '": ' + baris.length + ' baris, padahal tercatat ' + d.jumlah[t] + '.');
    }
  });
}

// ------------------------------------------------------------
// Google Drive
// ------------------------------------------------------------
/** Folder tujuan. Id-nya diingat, jadi memindah/mengganti nama folder tidak membuat folder baru. */
function folder_() {
  const p = prop_();
  const id = (p.getProperty('FOLDER_ID') || '').trim();
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* terhapus — buat lagi di bawah */ }
  }
  const ada = DriveApp.getFoldersByName(NAMA_FOLDER);
  const f = ada.hasNext() ? ada.next() : DriveApp.createFolder(NAMA_FOLDER);
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}

/**
 * Nama berkas yang sudah waktunya dibuang: lebih tua dari SIMPAN_HARIAN_HARI
 * dan BUKAN cadangan tanggal 1 (arsip bulanan). Fungsi murni — mudah diuji.
 */
function pilihYangDibuang_(daftarNama, sekarang) {
  const batas = new Date(sekarang.getTime() - SIMPAN_HARIAN_HARI * 86400000);
  return daftarNama.filter((nama) => {
    const m = /^cadangan-order-(\d{4})-(\d{2})-(\d{2})/.exec(nama);
    if (!m) return false;                       // bukan berkas cadangan: jangan disentuh
    if (m[3] === '01') return false;            // arsip bulanan
    const tgl = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return tgl < batas;
  });
}

function bersihkan_(folder) {
  const berkas = [];
  const it = folder.getFiles();
  while (it.hasNext()) berkas.push(it.next());
  const buang = new Set(pilihYangDibuang_(berkas.map((f) => f.getName()), new Date()));
  let n = 0;
  berkas.forEach((f) => {
    if (buang.has(f.getName())) { f.setTrashed(true); n += 1; }
  });
  return n;
}

// ------------------------------------------------------------
// Yang dijalankan
// ------------------------------------------------------------
function cadangkan() {
  try {
    const s = setelan_();
    const folder = folder_();               // dicek DULU sebelum menembak internet
    const tok = token_(s);
    let hasil;
    try { hasil = ambilCadangan_(s, tok); } finally { keluar_(s, tok); }
    const d = hasil.data;

    const jam = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd_HHmm');
    const nama = AWALAN_BERKAS + jam + '.json';
    const blob = Utilities.newBlob(hasil.teks, 'application/json', nama);
    const f = folder.createFile(blob);
    // Baca ulang dari Drive: yang dicek berkas yang benar-benar tersimpan.
    const tersimpan = DriveApp.getFileById(f.getId()).getSize();
    if (tersimpan !== blob.getBytes().length) {
      throw new Error('Berkas ' + nama + ' tersimpan tidak utuh (' + tersimpan + ' dari ' +
        blob.getBytes().length + ' byte).');
    }

    // Order turun drastis = kemungkinan ada yang terhapus. Cadangan tetap
    // disimpan, tapi berkas lama TIDAK dibersihkan dan pemilik diberi tahu.
    const p = prop_();
    const sebelum = Number(p.getProperty('PESANAN_TERAKHIR') || 0);
    const kini = d.jumlah.pesanan;
    const anjlok = sebelum > 0 && kini < sebelum * BATAS_TURUN;
    if (anjlok) {
      kirimEmail_('PERINGATAN: order di database turun drastis',
        'Cadangan malam ini berisi ' + kini + ' order, padahal cadangan sebelumnya ' + sebelum + '.\n' +
        'Kalau tidak ada yang sengaja menghapus order, segera periksa aplikasi.\n' +
        'Cadangan lama TIDAK dibersihkan sampai jumlahnya normal lagi.\n\n' +
        'Folder: ' + folder.getUrl());
    }
    const dibuang = anjlok ? 0 : bersihkan_(folder);

    p.setProperty('PESANAN_TERAKHIR', String(kini));
    p.setProperty('TERAKHIR_BERHASIL', jam);

    const ringkas = 'Cadangan tersimpan: ' + nama + ' (' + Math.round(tersimpan / 1024) + ' KB)\n' +
      'Isi: ' + d.urutan_pulih.map((t) => t + ' ' + d.jumlah[t]).join(', ') + '\n' +
      (dibuang ? dibuang + ' berkas lama dipindah ke Sampah.\n' : '') +
      'Folder: ' + folder.getUrl();
    Logger.log(ringkas);
    return ringkas;
  } catch (e) {
    kirimEmail_('GAGAL: cadangan Order Sales',
      'Cadangan otomatis gagal pada ' +
      Utilities.formatDate(new Date(), 'Asia/Jakarta', 'd MMM yyyy HH:mm') + ' WIB.\n\n' +
      'Penyebab: ' + (e.message || e) + '\n\n' +
      'Buka script.google.com -> proyek cadangan -> jalankan diagnosa() untuk melihat langkah yang gagal.');
    throw e;
  }
}

function kirimEmail_(judul, isi) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), judul, isi);
  } catch (e) { Logger.log('Email tidak terkirim: ' + (e.message || e)); }
}

// ------------------------------------------------------------
// Jadwal
// ------------------------------------------------------------
function pasangJadwal() {
  matikanJadwal();
  ScriptApp.newTrigger('cadangkan').timeBased()
    .everyDays(1).atHour(JAM_JALAN).inTimezone('Asia/Jakarta').create();
  const t = 'Cadangan otomatis dipasang: tiap hari sekitar jam ' + JAM_JALAN + '.00 WIB.';
  Logger.log(t);
  return t;
}

function matikanJadwal() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'cadangkan')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

// ------------------------------------------------------------
// Pemeriksa masalah — aman: tidak menyimpan berkas apa pun
// ------------------------------------------------------------
function diagnosa() {
  const l = [];
  const ok = (t) => l.push('OK    ' + t);
  const bad = (t) => l.push('GAGAL ' + t);

  let s = null;
  try { s = setelan_(); ok('Pengaturan siap (PIN dari Script properties)'); }
  catch (e) { bad(e.message); }

  try { const f = folder_(); ok('Folder tujuan: "' + f.getName() + '"\n      ' + f.getUrl()); }
  catch (e) { bad('Folder Drive: ' + (e.message || e)); }

  let tok = null;
  if (s) {
    try { tok = token_(s); ok('Login akun "' + USERNAME + '" berhasil'); }
    catch (e) { bad(e.message); }
  }

  if (s && tok) {
    try {
      const d = ambilCadangan_(s, tok).data;
      ok('Ambil cadangan berhasil: ' + d.jumlah.pesanan + ' order, ' + d.jumlah.barang + ' barang, ' +
         d.jumlah.toko + ' toko');
    } catch (e) { bad(e.message); }
    keluar_(s, tok);
  }

  const jadwal = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'cadangkan');
  if (jadwal.length) ok('Jadwal otomatis aktif (' + jadwal.length + ' pemicu)');
  else l.push('CATAT Jadwal otomatis belum dipasang — jalankan pasangJadwal()');

  const terakhir = prop_().getProperty('TERAKHIR_BERHASIL');
  l.push('INFO  Cadangan terakhir berhasil: ' + (terakhir || 'belum pernah'));

  const laporan = l.join('\n');
  Logger.log(laporan);
  return laporan;
}
