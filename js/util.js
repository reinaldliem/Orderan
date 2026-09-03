// Fungsi bantu dipakai di semua halaman.

/** Amankan teks sebelum masuk innerHTML. WAJIB untuk semua data dari DB/pengguna. */
export function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 58000 -> "Rp 58.000" */
export function rupiah(n) {
  const x = Number(n) || 0;
  return 'Rp ' + Math.round(x).toLocaleString('id-ID');
}

/** 1500.5 -> "1.500,5" */
export function angka(n) {
  const x = Number(n) || 0;
  return x.toLocaleString('id-ID', { maximumFractionDigits: 3 });
}

/**
 * Terima tulisan angka gaya Indonesia -> Number.
 * Aturan: TITIK = pemisah ribuan, KOMA = desimal.
 *   "5.000"    -> 5000
 *   "5000"     -> 5000
 *   "7,5"      -> 7.5
 *   "Rp 1.250,5" -> 1250.5
 */
export function keAngka(teks) {
  if (typeof teks === 'number') return Number.isFinite(teks) ? teks : 0;
  let s = String(teks ?? '').replace(/[^\d,.-]/g, '');
  if (s === '') return 0;
  s = s.replace(/\./g, '');          // buang pemisah ribuan
  const i = s.indexOf(',');
  if (i >= 0) {
    // hanya koma pertama yang jadi desimal
    s = s.slice(0, i) + '.' + s.slice(i + 1).replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Tanggal hari ini di zona Jakarta, format YYYY-MM-DD. */
export function hariIni() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

/** "2026-09-01" -> "Sen, 1 Sep 2026" */
export function tanggalPendek(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00+07:00');
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/** "2026-09-01" -> "1 September 2026" */
export function tanggalPanjang(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00+07:00');
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  }).format(d);
}

/**
 * Baris rincian satu item order. Untuk barang per-kilo, hitungannya
 * ditulis lengkap supaya bisa dicek: "3 ROL = 75 kg × Rp 14.000/kg".
 */
export function rincianItem(i) {
  const berat = Number(i.berat_kg) || 0;
  if (!berat) return `${angka(i.qty)} ${i.satuan} × ${rupiah(i.harga)}`;
  return (
    `${angka(i.qty)} ${i.satuan} = ${angka(i.qty * berat)} kg` +
    ` × ${rupiah(i.harga_per_kg)}/kg  (${rupiah(i.harga)}/${i.satuan})`
  );
}

let jamPesan = null;
/** Pesan melayang di atas layar. jenis: 'ok' | 'salah' | 'info' */
export function pesan(teks, jenis = 'info') {
  let box = document.getElementById('pesan');
  if (!box) {
    box = document.createElement('div');
    box.id = 'pesan';
    document.body.appendChild(box);
  }
  box.className = 'pesan tampil ' + jenis;
  box.textContent = teks;
  clearTimeout(jamPesan);
  jamPesan = setTimeout(() => box.classList.remove('tampil'), jenis === 'salah' ? 5000 : 2800);
}

/** Konfirmasi ya/tidak yang enak dipakai di HP. */
export function tanya(judul, isi, labelYa = 'Ya, lanjut') {
  return new Promise((selesai) => {
    const bg = document.createElement('div');
    bg.className = 'tirai';
    bg.innerHTML = `
      <div class="kotak-tanya" role="dialog" aria-modal="true">
        <h3>${esc(judul)}</h3>
        <p>${esc(isi)}</p>
        <div class="tanya-tombol">
          <button type="button" class="btn abu" data-x="0">Batal</button>
          <button type="button" class="btn merah" data-x="1">${esc(labelYa)}</button>
        </div>
      </div>`;
    bg.addEventListener('click', (e) => {
      const t = e.target.closest('[data-x]');
      if (!t && e.target !== bg) return;
      bg.remove();
      selesai(t ? t.dataset.x === '1' : false);
    });
    document.body.appendChild(bg);
  });
}

/**
 * Lembar bawah serbaguna (bottom sheet). Kembalikan elemen tirainya;
 * tutup dengan `.remove()`. Ketuk latar atau tombol X juga menutup.
 */
export function lembar(judul, isiHtml) {
  const tirai = document.createElement('div');
  tirai.className = 'tirai';
  tirai.innerHTML = `
    <div class="lembar" role="dialog" aria-modal="true">
      <div class="lembar-atas"><div class="tajuk">
        <h3>${esc(judul)}</h3>
        <button type="button" class="tutup" aria-label="Tutup">&times;</button>
      </div></div>
      <div class="daftar" style="padding:16px">${isiHtml}</div>
    </div>`;
  tirai.addEventListener('click', (e) => {
    if (e.target === tirai || e.target.closest('.tutup')) tirai.remove();
  });
  document.body.appendChild(tirai);
  return tirai;
}

/** Unduh teks sebagai berkas. */
export function unduh(namaFile, isi, tipe = 'text/csv;charset=utf-8') {
  const blob = new Blob([isi], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * CSV siap buka di Excel Indonesia: pemisah titik-koma + baris sep= + BOM UTF-8.
 * @param {string[]} kolom
 * @param {Array<Array<any>>} baris
 */
export function keCSV(kolom, baris) {
  const sel = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  const isi = [kolom.map(sel).join(';'), ...baris.map((r) => r.map(sel).join(';'))].join('\r\n');
  return '﻿' + 'sep=;\r\n' + isi; // BOM biar Excel Indonesia tidak salah encoding
}

/** Pecah tempelan dari Excel jadi array baris berisi kolom. */
export function pecahTempelan(teks) {
  return String(teks || '')
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.split(/\t|;/).map((k) => k.trim()));
}
