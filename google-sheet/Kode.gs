/**
 * Order Sales -> Google Sheet
 *
 * Menarik order dari Supabase dan menuliskannya ke sheet "Order".
 *
 * BISA DIPASANG DUA CARA:
 *
 *   A. Dari dalam Sheet  (paling mudah)
 *      Google Sheet -> Extensions -> Apps Script -> tempel berkas ini.
 *      Sheet-nya ketemu sendiri, SHEET_ID tidak perlu diisi.
 *
 *   B. Proyek terpisah di script.google.com
 *      Wajib mengisi SHEET_ID (lihat di bawah), karena proyek terpisah
 *      tidak punya "Sheet aktif" dan penulisannya akan gagal.
 *
 * PENGATURAN — Project Settings -> Script properties:
 *      PIN       = PIN akun 'sheet'                        (WAJIB)
 *      SHEET_ID  = kode panjang di alamat Google Sheet:    (cara B saja)
 *                  docs.google.com/spreadsheets/d/<SHEET_ID>/edit
 *
 *      URL & KUNCI sudah dibenamkan di dalam kode (nilai publik).
 *      Isi property URL / KUNCI hanya kalau mau menimpanya.
 *
 * KALAU MACET: jalankan fungsi diagnosa() — dia memberi tahu
 * langkah mana yang gagal dan apa penyebabnya.
 *
 * PIN sengaja TIDAK ditulis di dalam kode ini.
 *
 * Akun 'sheet' berperan "pemantau": HANYA BISA MEMBACA. Tidak bisa
 * mengubah/menghapus apa pun, dan tidak bisa melihat HPP.
 */

const NAMA_SHEET_ORDER = 'Order';
const USERNAME = 'sheet';

/**
 * Alamat & kunci bawaan. Keduanya nilai PUBLIK — kunci "anon" memang
 * dirancang untuk ditempel di halaman web, dan yang benar-benar menjaga
 * data adalah RLS + peran 'pemantau' di sisi database. Dibenamkan di sini
 * supaya Anda tidak perlu mencarinya di dashboard Supabase.
 *
 * Script property URL / KUNCI (kalau diisi) tetap menang atas nilai ini.
 */
const URL_BAWAAN = 'https://aaurlqaqpldoohfnvcyx.supabase.co';
const KUNCI_BAWAAN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhdXJscWFxcGxkb29oZm52Y3l4Iiwicm9s' +
  'ZSI6ImFub24iLCJpYXQiOjE3ODgzMzA5MDQsImV4cCI6MjEwMzkwNjkwNH0' +
  '.8g6KDqL19dSJ27QXiPDYo8BWCiXmm4NGfAVd1EAzKao';

// ------------------------------------------------------------
// Menu (hanya muncul kalau skrip dipasang dari dalam Sheet)
// ------------------------------------------------------------
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Order Sales')
      .addItem('Segarkan sekarang', 'segarkanDariMenu')
      .addSeparator()
      .addItem('Pasang penyegaran otomatis', 'pasangPemicu')
      .addItem('Matikan penyegaran otomatis', 'matikanPemicu')
      .addItem('Periksa masalah (diagnosa)', 'diagnosa')
      .addToUi();
  } catch (e) { /* proyek terpisah: tidak ada menu, jalankan dari editor */ }
}

// ------------------------------------------------------------
// Pengaturan & sasaran Sheet
// ------------------------------------------------------------
function prop_() {
  return PropertiesService.getScriptProperties();
}

function setelan_() {
  const p = prop_();
  const url = ((p.getProperty('URL') || URL_BAWAAN)).trim().replace(/\/+$/, '');
  const kunci = ((p.getProperty('KUNCI') || KUNCI_BAWAAN)).trim();
  const pin = (p.getProperty('PIN') || '').trim();

  if (!pin) {
    throw new Error(
      'Script property PIN belum diisi. Buka Project Settings -> ' +
      'Script properties -> Add script property: nama PIN (huruf besar semua), ' +
      'nilainya PIN akun "sheet".'
    );
  }
  return { url: url, kunci: kunci, pin: pin };
}

/**
 * Spreadsheet tujuan. Inilah yang gagal kalau skrip dibuat sebagai
 * proyek terpisah: getActiveSpreadsheet() mengembalikan null.
 */
function spreadsheet_() {
  const id = (prop_().getProperty('SHEET_ID') || '').trim();

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error('SHEET_ID tidak bisa dibuka: ' + id +
        '. Pastikan itu kode di alamat Sheet (docs.google.com/spreadsheets/d/KODE/edit) ' +
        'dan Sheet-nya milik akun Google yang sama.');
    }
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'Skrip ini tidak menempel pada Google Sheet mana pun, jadi tidak tahu ' +
      'harus menulis ke mana. Dua pilihan: (1) isi Script property SHEET_ID ' +
      'dengan kode di alamat Sheet Anda, atau (2) pasang ulang skripnya dari ' +
      'dalam Sheet lewat Extensions -> Apps Script.'
    );
  }
  return ss;
}

// ------------------------------------------------------------
// Login -> token, lalu baca data
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
      throw new Error('PIN akun "sheet" salah, atau akunnya belum dibuat di Supabase.');
    }
    throw new Error('Gagal login (kode ' + kode + '): ' + (isi.msg || res.getContentText()));
  }
  if (!isi.access_token) throw new Error('Login berhasil tapi token tidak diterima.');
  return isi.access_token;
}

function ambil_(s, tok, path) {
  const res = UrlFetchApp.fetch(s.url + '/rest/v1/' + path, {
    method: 'get',
    headers: { apikey: s.kunci, Authorization: 'Bearer ' + tok },
    muteHttpExceptions: true,
  });
  const kode = res.getResponseCode();
  if (kode === 404) {
    throw new Error('Tabel/view "' + path.split('?')[0] + '" tidak ada di database. ' +
      'Jalankan sql/08-pemantau.sql di Supabase.');
  }
  if (kode !== 200) {
    throw new Error('Gagal membaca ' + path.split('?')[0] +
      ' (kode ' + kode + '): ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText() || '[]');
}

// ------------------------------------------------------------
// Tulis ke sheet
// ------------------------------------------------------------
/** Tulis ulang seluruh sheet — bukan ditambah — supaya order yang
 *  diubah/dihapus admin ikut terkoreksi dan tidak ada baris kembar. */
function tulis_(ss, nama, kolom, baris) {
  let sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama);

  sh.clear();
  sh.getRange(1, 1, 1, kolom.length).setValues([kolom])
    .setFontWeight('bold')
    .setBackground('#0d1520')
    .setFontColor('#ffffff');

  if (baris.length) {
    sh.getRange(2, 1, baris.length, kolom.length).setValues(baris);
  } else {
    // Tanpa ini, 0 order menghasilkan sheet yang cuma berisi baris judul —
    // gampang disalahartikan sebagai "skripnya tidak jalan".
    sh.getRange(2, 1).setValue(
      'Belum ada order yang masuk. Sambungan ke database BERHASIL — ' +
      'baris akan muncul sendiri di sini begitu sales mengirim order.'
    ).setFontColor('#566674').setFontStyle('italic');
  }

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, kolom.length);
  return sh;
}

const teks_ = (v) => (v === null || v === undefined ? '' : String(v));
const angka_ = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));

const KOLOM = ['Tanggal', 'No Order', 'Sales', 'Kode Sales', 'Toko', 'Kota',
               'Kode Toko', 'Barang', 'Satuan', 'Jumlah', 'Harga Satuan',
               'Harga per Kg', 'Total Kg', 'Subtotal', 'Total Order',
               'Catatan', 'Catatan Tambahan'];

// ------------------------------------------------------------
// Yang dijalankan
// ------------------------------------------------------------
function segarkan() {
  const s = setelan_();
  const ss = spreadsheet_();          // dicek DULU sebelum menembak internet
  const tok = token_(s);

  const order = ambil_(s, tok,
    'v_pantau?select=*&order=tanggal.desc,no_pesanan.desc,urut.asc&limit=20000');

  const baris = order.map((r) => [
    teks_(r.tanggal), teks_(r.no_pesanan), teks_(r.sales), teks_(r.kode_sales),
    teks_(r.toko), teks_(r.kota), teks_(r.kode_toko), teks_(r.barang), teks_(r.satuan),
    angka_(r.jumlah), angka_(r.harga_satuan), angka_(r.harga_per_kg), angka_(r.total_kg),
    angka_(r.subtotal), angka_(r.total_order),
    teks_(r.catatan), teks_(r.catatan_tambahan),
  ]);

  const sh = tulis_(ss, NAMA_SHEET_ORDER, KOLOM, baris);

  const jam = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'd MMM yyyy HH:mm');
  sh.getRange(1, KOLOM.length + 2)
    .setValue('Diperbarui: ' + jam + (baris.length ? '' : ' (belum ada order)'))
    .setFontColor('#566674').setFontWeight('normal');

  // Sebut NAMA dan ALAMAT file Sheet-nya. Kalau skripnya menulis ke file
  // lain (SHEET_ID salah), di sinilah kelihatan — bukan setelah lama menebak.
  const ringkas = baris.length + ' baris ditulis ke sheet "' + NAMA_SHEET_ORDER +
    '" di file "' + ss.getName() + '" pada ' + jam +
    '\nAlamat file: ' + ss.getUrl();
  Logger.log(ringkas);
  return ringkas;
}

/**
 * Yang dipanggil menu. segarkan() sendiri dibiarkan bersih tanpa dialog
 * karena dia juga dipanggil pemicu 10 menit — dialog di sana akan
 * menggantung eksekusi yang tidak punya layar.
 */
function segarkanDariMenu() {
  let pesan;
  try { pesan = segarkan(); }
  catch (e) { pesan = 'GAGAL\n\n' + (e.message || e); }
  try {
    SpreadsheetApp.getUi().alert('Segarkan sekarang', pesan,
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { Logger.log(pesan); }
}

/** Dipanggil kalau URL /exec dibuka. Hanya mengembalikan status, bukan data. */
function doGet() {
  let pesan;
  try {
    pesan = 'OK — ' + segarkan();
  } catch (e) {
    pesan = 'GAGAL — ' + (e.message || e);
  }
  return ContentService.createTextOutput(pesan).setMimeType(ContentService.MimeType.TEXT);
}

// ------------------------------------------------------------
// Pemeriksa masalah
// ------------------------------------------------------------
/** Jalankan ini kalau Sheet tidak terisi. Aman: tidak mengubah apa pun. */
function diagnosa() {
  const l = [];
  const ok = (t) => l.push('OK    ' + t);
  const bad = (t) => l.push('GAGAL ' + t);

  // 1. properties
  let s = null;
  try {
    s = setelan_();
    const p = prop_();
    const asal = (k) => (p.getProperty(k) || '').trim() ? 'dari property' : 'bawaan kode';
    ok('Pengaturan siap — URL: ' + asal('URL') +
       ', KUNCI: ' + asal('KUNCI') + ', PIN: dari property');
  } catch (e) { bad(e.message); }

  // 2. sasaran sheet
  let ss = null;
  try {
    ss = spreadsheet_();
    const pakaiId = !!(prop_().getProperty('SHEET_ID') || '').trim();
    ok('Sheet tujuan: "' + ss.getName() + '"' + (pakaiId ? ' (lewat SHEET_ID)' : ' (Sheet aktif)') +
       '\n      Alamat: ' + ss.getUrl() +
       '\n      >> pastikan ini file Sheet yang sedang Anda buka');
  } catch (e) { bad(e.message); }

  // 3. login
  let tok = null;
  if (s) {
    try { tok = token_(s); ok('Login akun "' + USERNAME + '" berhasil'); }
    catch (e) { bad(e.message); }
  }

  // 4. baca data
  if (s && tok) {
    try {
      const d = ambil_(s, tok, 'v_pantau?select=no_pesanan&limit=20000');
      ok('Baca v_pantau berhasil: ' + d.length + ' baris' +
         (d.length ? '' : ' — memang belum ada order di database'));
    } catch (e) { bad(e.message); }
  }

  // 5. pemicu otomatis
  const pemicu = ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'segarkan');
  if (pemicu.length) ok('Penyegaran otomatis aktif (' + pemicu.length + ' pemicu)');
  else l.push('CATAT Penyegaran otomatis belum dipasang — jalankan pasangPemicu()');

  const laporan = l.join('\n');
  Logger.log(laporan);
  try {
    SpreadsheetApp.getUi().alert('Hasil diagnosa', laporan, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* proyek terpisah: baca di Execution log */ }
  return laporan;
}

// ------------------------------------------------------------
// Penyegaran otomatis
// ------------------------------------------------------------
function pasangPemicu() {
  matikanPemicu();
  ScriptApp.newTrigger('segarkan').timeBased().everyMinutes(10).create();
  const t = 'Penyegaran otomatis dipasang: tiap 10 menit.';
  Logger.log(t);
  try { SpreadsheetApp.getUi().alert(t); } catch (e) { /* abaikan */ }
  return t;
}

function matikanPemicu() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'segarkan')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}
