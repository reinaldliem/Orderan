// Dasbor pemilik: ringkasan, sales, toko, barang.
//
// Semua angka uang datang MATANG dari server lewat RPC dasbor_*. Tidak ada
// penjumlahan uang di berkas ini — yang dihitung di sini hanya PERBANDINGAN
// untuk tampilan (persen naik/turun, panjang batang).
//
// Susunan (Nov 2026, permintaan pemilik: "lebih simple tapi mendetail"):
//   saringan (periode + sales)  ->  empat tab, satu pertanyaan per tab
//   Ringkasan         : empat angka + naik/turun, grafik per waktu, 5 teratas
//   Sales/Toko/Barang : daftar yang bisa dicari, diurutkan, diunduh ke Excel;
//                       ketuk satu baris -> lembar rincian
//
// Warna grafik = JENIS ANGKANYA, sama di semua tempat (--data-* di :root):
//   biru = omzet · oranye = jumlah order · hijau = margin
// Omzet dan margin tidak pernah digambar dalam satu batang: dua ukuran dalam
// satu gambar membuat pemilik bertanya "ini maksudnya apa".
//
// Grafik digambar tangan dengan SVG, tanpa pustaka luar: aplikasi ini statis
// tanpa build step, dan CDN berarti satu titik gagal baru.

import * as db from '../db.js';
import { ikon } from '../ikon.js';
import { esc, rupiah, pesan, lembar, unduh, keCSV, hariIni } from '../util.js';
import { siapkan, cari as cariTeks } from '../cocok.js';

const PERIODE = [
  { k: 'hari', label: 'Hari ini' },
  { k: 'kemarin', label: 'Kemarin' },
  { k: '7', label: '7 hari terakhir' },
  { k: '30', label: '30 hari terakhir' },
  { k: 'bulan', label: 'Bulan ini' },
  { k: 'bulanlalu', label: 'Bulan lalu' },
  { k: '90', label: '3 bulan terakhir' },
  { k: '365', label: '12 bulan terakhir' },
  { k: 'atur', label: 'Atur tanggal…' },
];

const TAB = [
  { k: 'ringkas', label: 'Ringkasan' },
  { k: 'sales', label: 'Sales' },
  { k: 'toko', label: 'Toko' },
  { k: 'barang', label: 'Barang' },
];

// Pilihan terakhir diingat selama aplikasi terbuka (pindah menu lalu kembali).
let periodeAktif = '30';
let dariAtur = '';
let sampaiAtur = '';
/** null = semua sales. Saringan ini mengubah SELURUH angka di layar. */
let salesAktif = null;
let tabAktif = 'ringkas';
let metrikAktif = 'omzet';
const BARIS_PER_HALAMAN = 50;
const keadaanDaftar = {
  sales: { q: '', saring: 'semua', urut: 'omzet', batas: BARIS_PER_HALAMAN },
  toko: { q: '', saring: 'semua', urut: 'omzet', batas: BARIS_PER_HALAMAN },
  barang: { q: '', saring: 'semua', urut: 'omzet', batas: BARIS_PER_HALAMAN, pt: '', kat: '' },
};

/* ------------------------------------------------------------
   Angka & tanggal
   ------------------------------------------------------------ */

/**
 * Angka uang penuh, gaya Indonesia: 169499444 -> "169.499.444". Pemilik
 * meminta angka apa adanya, bukan "169,5 jt" — pembulatan ke juta
 * menyembunyikan ratusan ribu.
 */
const penuh = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
/** Jumlah barang / rata-rata: boleh berkoma (2,5 ROL). */
const bilangan = (n) => (Number(n) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
/** Margin null = HPP barangnya belum diisi. Itu BUKAN nol. */
const marginTeks = (n) => ((n === null || n === undefined) ? '—' : penuh(n));
const kosong = (v) => v === null || v === undefined;
/** Bagian dari keseluruhan, mis. "34%" — hanya untuk dibaca, bukan uang. */
const porsi = (v, total) => (Number(total) > 0
  ? `${(Number(v) / Number(total) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—');
const TANPA_PT = '(tanpa perusahaan)';

// Tanggal dihitung sebagai tanggal kalender (UTC tengah malam), berangkat
// dari hariIni() yang sudah memakai zona Asia/Jakarta.
const HARI = 86400000;
const keTgl = (iso) => new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
const keISO = (d) => d.toISOString().slice(0, 10);
const geser = (iso, n) => keISO(new Date(keTgl(iso).getTime() + n * HARI));
const lamaHari = (dari, sampai) => Math.round((keTgl(sampai) - keTgl(dari)) / HARI) + 1;
const awalBulan = (iso) => String(iso).slice(0, 8) + '01';
const bulanBerikut = (iso) => { const d = keTgl(iso); d.setUTCMonth(d.getUTCMonth() + 1); return keISO(d); };
const fmt = (opsi) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...opsi });
const F_SINGKAT = fmt({ day: 'numeric', month: 'short' });
const F_TAHUN = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const F_LENGKAP = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const F_BULAN = fmt({ month: 'long', year: 'numeric' });
const F_BULAN_SINGKAT = fmt({ month: 'short', year: '2-digit' });
const tglSingkat = (iso) => F_SINGKAT.format(keTgl(iso));
const tglTahun = (iso) => F_TAHUN.format(keTgl(iso));
const tglLengkap = (iso) => F_LENGKAP.format(keTgl(iso));

function rentangTeks(dari, sampai) {
  if (dari === sampai) return tglLengkap(dari);
  return dari.slice(0, 4) === sampai.slice(0, 4)
    ? `${tglSingkat(dari)} – ${tglTahun(sampai)}`
    : `${tglTahun(dari)} – ${tglTahun(sampai)}`;
}

/**
 * Rentang yang sedang dipilih + rentang pembandingnya (sama panjang, tepat
 * sebelumnya; "Bulan ini" dibanding tanggal yang sama bulan lalu).
 */
function rentang() {
  const kini = hariIni();
  let dari; let sampai; let banding; let ketBanding;
  switch (periodeAktif) {
    case 'hari':
      dari = kini; sampai = kini; ketBanding = 'kemarin';
      break;
    case 'kemarin':
      dari = geser(kini, -1); sampai = dari; ketBanding = 'hari sebelumnya';
      break;
    case 'bulan': {
      dari = awalBulan(kini); sampai = kini;
      const akhirLalu = geser(dari, -1);
      const awalLalu = awalBulan(akhirLalu);
      let s = geser(awalLalu, lamaHari(dari, sampai) - 1);
      if (s > akhirLalu) s = akhirLalu;
      banding = { dari: awalLalu, sampai: s };
      ketBanding = 'tanggal yang sama bulan lalu';
      break;
    }
    case 'bulanlalu': {
      sampai = geser(awalBulan(kini), -1); dari = awalBulan(sampai);
      const akhir = geser(dari, -1);
      banding = { dari: awalBulan(akhir), sampai: akhir };
      ketBanding = 'bulan sebelumnya';
      break;
    }
    case 'atur': {
      const sah = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || '');
      sampai = sah(sampaiAtur) ? sampaiAtur : kini;
      dari = sah(dariAtur) ? dariAtur : geser(sampai, -29);
      if (dari > sampai) [dari, sampai] = [sampai, dari];
      ketBanding = `${lamaHari(dari, sampai)} hari sebelumnya`;
      break;
    }
    default: {
      const n = Number(periodeAktif) || 30;
      sampai = kini; dari = geser(kini, -(n - 1));
      ketBanding = `${n} hari sebelumnya`;
    }
  }
  const lama = lamaHari(dari, sampai);
  if (!banding) banding = { dari: geser(dari, -lama), sampai: geser(dari, -1) };
  return { dari, sampai, banding, ketBanding, satuan: satuanUntuk(lama), lama, berjalan: periodeAktif === 'hari' };
}

/** Satu batang = sehari, seminggu, atau sebulan — tergantung panjang rentang. */
const satuanUntuk = (lama) => (lama <= 45 ? 'hari' : lama <= 190 ? 'minggu' : 'bulan');

/**
 * Deret dari server hanya memuat periode yang ADA ordernya. Hari tanpa
 * order diisi nol supaya grafik memperlihatkan jedanya — "tidak ada order"
 * adalah fakta, bukan hitungan.
 */
function isiDeret(baris, r) {
  const per = new Map((baris || []).map((d) => [String(d.periode ?? d.kunci).slice(0, 10), d]));
  const awal = r.mulaiGrafik || r.dari;
  let t;
  if (r.satuan === 'hari') t = awal;
  else if (r.satuan === 'minggu') t = geser(awal, -((keTgl(awal).getUTCDay() + 6) % 7));   // Senin
  else t = awalBulan(awal);
  const keluar = [];
  for (let jaga = 0; t <= r.sampai && jaga < 800; jaga += 1) {
    const d = per.get(t);
    keluar.push({
      periode: t,
      omzet: Number(d?.omzet) || 0,
      margin: Number(d?.margin) || 0,
      order: Number(d?.jml_order) || 0,
    });
    t = r.satuan === 'hari' ? geser(t, 1) : r.satuan === 'minggu' ? geser(t, 7) : bulanBerikut(t);
  }
  return keluar;
}

function labelPeriode(iso, satuan) {
  return satuan === 'bulan' ? F_BULAN_SINGKAT.format(keTgl(iso)) : tglSingkat(iso);
}
function labelPeriodePanjang(iso, satuan) {
  if (satuan === 'bulan') return F_BULAN.format(keTgl(iso));
  if (satuan === 'minggu') return `Minggu ${rentangTeks(iso, geser(iso, 6))}`;
  return tglLengkap(iso);
}

/* ------------------------------------------------------------
   Grafik batang per waktu — SATU ukuran, satu warna
   ------------------------------------------------------------ */

const METRIK = {
  omzet: { label: 'Omzet', warna: 'var(--data-omzet)', ambil: (d) => d.omzet, tulis: (v) => rupiah(v) },
  order: { label: 'Order', warna: 'var(--data-order)', ambil: (d) => d.order, tulis: (v) => `${penuh(v)} order` },
  margin: { label: 'Margin', warna: 'var(--data-margin)', ambil: (d) => d.margin, tulis: (v) => rupiah(v) },
};

/** Skala sumbu dengan angka bulat (1, 2, 5 × 10^n), sekitar tiga garis. */
function skala(puncak) {
  if (!(puncak > 0)) return { atas: 1, langkah: 1 };
  const kasar = puncak / 3;
  const p = 10 ** Math.floor(Math.log10(kasar));
  const m = kasar / p;
  const langkah = Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p);
  return { atas: Math.ceil(puncak / langkah) * langkah, langkah };
}

/** HANYA untuk angka sumbu, yang selalu bulat: 20.000.000 -> "20 jt". */
function ringkasAngka(v) {
  if (v >= 1e9) return bilangan(v / 1e9) + ' M';
  if (v >= 1e6) return bilangan(v / 1e6) + ' jt';
  if (v >= 1e3) return bilangan(v / 1e3) + ' rb';
  return bilangan(v);
}

// Grafik digambar sesuai lebar wadahnya dalam piksel sungguhan (bukan
// diperbesar dari viewBox), jadi hurufnya tetap 10px di HP maupun layar lebar.
const pengamat = new ResizeObserver((entri) => {
  for (const e of entri) {
    const lebar = Math.round(e.contentRect.width);
    if (e.target.dzLebar !== lebar) e.target.dzUlang?.();
  }
});

/**
 * @param {HTMLElement} el      wadah (harus sudah ada di halaman)
 * @param {Array} deret         hasil isiDeret()
 * @param {string} satuan       hari | minggu | bulan
 * @param {string} kunciMetrik  omzet | order | margin
 * @param {{tinggi?:number, tabel?:boolean}} [o]
 */
function pasangGrafik(el, deret, satuan, kunciMetrik, o = {}) {
  const m = METRIK[kunciMetrik];
  const nilai = deret.map((d) => Number(m.ambil(d)) || 0);
  const puncak = Math.max(0, ...nilai);
  const iMaks = puncak > 0 ? nilai.indexOf(puncak) : -1;
  let pilih = -1;   // -1 = tidak ada yang disentuh -> tampilkan yang tertinggi

  el.innerHTML = `
    <div class="dz-baca" aria-live="polite"></div>
    <div class="dz-svg"></div>
    ${o.tabel === false ? '' : `
    <button type="button" class="dz-tautan dz-buka-tabel" aria-expanded="false">Lihat angka per ${esc(satuan)}</button>
    <div class="dz-bingkai dz-tabel-deret" hidden></div>`}`;
  const elBaca = el.querySelector('.dz-baca');
  const elSvg = el.querySelector('.dz-svg');

  function baca() {
    const i = pilih >= 0 ? pilih : iMaks;
    if (i < 0) {
      elBaca.innerHTML = `<b>—</b><span>Belum ada ${esc(m.label.toLowerCase())} di rentang ini</span>`;
      return;
    }
    const d = deret[i];
    const awalan = pilih < 0 ? 'Tertinggi · ' : '';
    const ekor = kunciMetrik === 'order' ? '' : ` · ${penuh(d.order)} order`;
    elBaca.innerHTML = `<b>${esc(m.tulis(m.ambil(d)))}</b>`
      + `<span>${esc(awalan + labelPeriodePanjang(d.periode, satuan) + ekor)}</span>`;
  }

  function lukis() {
    const lebar = Math.max(240, Math.floor(elSvg.clientWidth || 320));
    elSvg.dzLebar = Math.round(elSvg.clientWidth);
    const tinggi = o.tinggi || (lebar >= 640 ? 240 : 190);
    const L = 46; const K = 6; const A = 8; const B = 22;   // tepi kiri, kanan, atas, bawah
    const plotL = lebar - L - K;
    const plotT = tinggi - A - B;
    const n = deret.length;
    const slot = plotL / n;
    const lb = Math.max(2, Math.min(24, slot - 2));          // sela 2px antarbatang
    const { atas, langkah } = skala(puncak);

    let garis = '';
    for (let v = 0; v <= atas + langkah / 2; v += langkah) {
      const y = (A + plotT * (1 - v / atas)).toFixed(1);
      garis += `<line x1="${L}" y1="${y}" x2="${lebar - K}" y2="${y}" class="${v === 0 ? 'dz-dasar' : 'dz-grid'}"></line>`
        + `<text x="${L - 6}" y="${Number(y) + 3.5}" text-anchor="end" class="dz-tik">${esc(ringkasAngka(v))}</text>`;
    }

    const tiap = Math.ceil(n / Math.max(2, Math.floor(plotL / 52)));   // label tanggal tidak boleh bertumpuk
    let batang = ''; let label = '';
    deret.forEach((d, i) => {
      const tengah = L + i * slot + slot / 2;
      const h = nilai[i] > 0 ? Math.max(1.5, plotT * (nilai[i] / atas)) : 0;
      if (h) {
        batang += `<rect class="dz-batang" data-i="${i}" x="${(tengah - lb / 2).toFixed(1)}" `
          + `y="${(A + plotT - h).toFixed(1)}" width="${lb.toFixed(1)}" height="${h.toFixed(1)}" fill="${m.warna}"></rect>`;
      }
      if (i % tiap === 0) {
        const mepet = tengah > lebar - 26;
        label += `<text x="${(mepet ? lebar - 2 : tengah).toFixed(1)}" y="${tinggi - 6}" `
          + `text-anchor="${mepet ? 'end' : 'middle'}" class="dz-tik">${esc(labelPeriode(d.periode, satuan))}</text>`;
      }
    });

    elSvg.innerHTML = `
      <svg width="${lebar}" height="${tinggi}" viewBox="0 0 ${lebar} ${tinggi}" tabindex="0" role="img"
           aria-label="Grafik ${esc(m.label.toLowerCase())} per ${esc(satuan)}, ${n} ${esc(satuan)}. Panah kiri dan kanan untuk membaca tiap batang.">
        <rect class="dz-sorot" x="0" y="${A}" width="${slot.toFixed(1)}" height="${plotT}" visibility="hidden"></rect>
        ${garis}${batang}${label}
      </svg>`;

    const svg = elSvg.querySelector('svg');
    const sorot = svg.querySelector('.dz-sorot');
    const tandai = () => {
      const i = pilih >= 0 ? pilih : iMaks;
      svg.querySelectorAll('.dz-batang').forEach((b) => b.classList.toggle('dz-pilih', Number(b.dataset.i) === i));
      if (pilih >= 0) {
        sorot.setAttribute('x', (L + pilih * slot).toFixed(1));
        sorot.setAttribute('visibility', 'visible');
      } else sorot.setAttribute('visibility', 'hidden');
      baca();
    };
    const dari = (ev) => {
      const x = ev.clientX - svg.getBoundingClientRect().left - L;
      return Math.max(0, Math.min(n - 1, Math.floor(x / slot)));
    };
    svg.addEventListener('pointermove', (ev) => { pilih = dari(ev); tandai(); });
    svg.addEventListener('pointerdown', (ev) => { pilih = dari(ev); tandai(); });
    // Jari yang diangkat juga memicu "leave"; di layar sentuh pilihan dibiarkan.
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') { pilih = -1; tandai(); } });
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const mulai = pilih >= 0 ? pilih : Math.max(0, iMaks);
        pilih = Math.max(0, Math.min(n - 1, mulai + (ev.key === 'ArrowRight' ? 1 : -1)));
        tandai();
      } else if (ev.key === 'Escape') { pilih = -1; tandai(); }
    });
    tandai();
  }

  el.querySelector('.dz-buka-tabel')?.addEventListener('click', (ev) => {
    const kotak = el.querySelector('.dz-tabel-deret');
    const buka = kotak.hidden;
    if (buka && !kotak.innerHTML) {
      kotak.innerHTML = `
        <table class="sheet dasbor-tabel dz-tabel">
          <thead><tr><th>${satuan === 'hari' ? 'Tanggal' : satuan === 'minggu' ? 'Minggu' : 'Bulan'}</th>
            <th>Omzet</th><th>Order</th><th>Margin</th></tr></thead>
          <tbody>${deret.slice().reverse().map((d) => `<tr>
            <td>${esc(labelPeriodePanjang(d.periode, satuan))}</td>
            <td class="num">${esc(penuh(d.omzet))}</td>
            <td class="num">${esc(penuh(d.order))}</td>
            <td class="num">${esc(penuh(d.margin))}</td></tr>`).join('')}</tbody>
        </table>`;
    }
    kotak.hidden = !buka;
    ev.currentTarget.setAttribute('aria-expanded', String(buka));
    ev.currentTarget.textContent = buka ? 'Sembunyikan angka' : `Lihat angka per ${satuan}`;
  });

  elSvg.dzUlang = lukis;
  lukis();
  pengamat.observe(elSvg);
}

/* ------------------------------------------------------------
   Daftar peringkat: nama, batang, angka
   ------------------------------------------------------------ */

/** Lebar batang dalam persen terhadap yang terbesar — perbandingan, bukan uang. */
const persenLebar = (v, maks) => (maks > 0 && v > 0 ? Math.max(1, (v / maks) * 100).toFixed(1) : '0');

/**
 * @param {Array} baris  sudah urut dari yang terbesar
 * @param {object} o  { nama, nilai, teks, ket?, kunci?, jenis?, batas?, warna? }
 *                    jenis + kunci diisi -> barisnya bisa diketuk (buka rincian)
 */
function peringkatHtml(baris, o) {
  if (!baris.length) return '<div class="dz-nihil">Belum ada data di rentang ini.</div>';
  const maks = Math.max(0, ...baris.map((x) => Number(o.nilai(x)) || 0));
  const tampil = baris.slice(0, o.batas || 5);
  const warna = o.warna || 'var(--data-omzet)';
  const isi = (x, i) => `
      <span class="dz-no">${i + 1}</span>
      <span class="dz-badan">
        <span class="dz-atas"><span class="dz-nama">${esc(o.nama(x))}</span><b class="dz-nilai">${esc(o.teks(x))}</b></span>
        ${o.ket ? `<span class="dz-ket">${esc(o.ket(x))}</span>` : ''}
        <span class="dz-bar"><i style="width:${persenLebar(Number(o.nilai(x)) || 0, maks)}%;background:${warna}"></i></span>
      </span>`;
  return `<ol class="dz-rank">${tampil.map((x, i) => (o.jenis
    ? `<li><button type="button" class="dz-rank-baris" data-rinci="${esc(o.jenis)}" data-k="${esc(o.kunci(x))}">${isi(x, i)}</button></li>`
    : `<li><div class="dz-rank-baris">${isi(x, i)}</div></li>`)).join('')}</ol>`
    + (baris.length > tampil.length
      ? `<div class="dz-sisa">dan ${penuh(baris.length - tampil.length)} lainnya</div>` : '');
}

/* ------------------------------------------------------------
   Daftar yang bisa dicari, disaring, diurutkan, dan diunduh.
   Di HP berupa baris ringkas, di komputer tabel — CSS yang memilih.
   ------------------------------------------------------------ */

/**
 * @param {HTMLElement} wadah
 * @param {object} o
 *   keadaan   {q, saring, urut, batas} — milik modul, bertahan saat pindah tab
 *   baris     data dari server
 *   kunci     (r) => string
 *   batang    (r) => angka untuk panjang batang (biasanya omzet)
 *   hp        (r) => {nama, ket, nilai}
 *   kolom     [{judul, isi(r, maks) -> HTML, kelas?, lebar?, urut?}]
 *   urutan    [{k, label, nilai(r), teks?}]  teks = urut abjad, selain itu besar->kecil
 *   hitung    (tampil, semua) => string
 *   buka      (r) => void
 *   cari?     (r) => {nama, kata}   ketCari? placeholder
 *   saring?   [{k, label, uji?}]
 *   pilih?    (r) => boolean
 *   unduh     {nama, kolom:[...], baris:(r)=>[...]}
 */
function pasangDaftar(wadah, o) {
  const st = o.keadaan;
  const maks = Math.max(0, ...o.baris.map((r) => Number(o.batang(r)) || 0));
  const siap = o.cari ? siapkan(o.baris.map((r) => ({ ...o.cari(r), r }))) : null;
  if (o.saring && !o.saring.some((s) => s.k === st.saring)) st.saring = o.saring[0].k;
  if (!o.urutan.some((u) => u.k === st.urut)) st.urut = o.urutan[0].k;

  wadah.innerHTML = `
    <div class="dz-alat">
      ${o.cari ? `<input type="text" class="dz-cari" placeholder="${esc(o.ketCari || 'Cari…')}"
                         autocomplete="off" enterkeyhint="search" value="${esc(st.q)}">` : ''}
      ${o.saring ? `<div class="saring dz-pilah" role="group" aria-label="Saringan">${o.saring.map((s) =>
        `<button type="button" data-s="${esc(s.k)}" aria-pressed="${s.k === st.saring}"
                 class="${s.k === st.saring ? 'aktif' : ''}">${esc(s.label)}</button>`).join('')}</div>` : ''}
      <div class="dz-alat-baris">
        <label class="dz-urut"><span>Urutkan</span>
          <select>${o.urutan.map((u) =>
            `<option value="${esc(u.k)}"${u.k === st.urut ? ' selected' : ''}>${esc(u.label)}</option>`).join('')}</select></label>
        <button type="button" class="btn abu kecil dz-unduh">${ikon('unduh', 17)}Excel</button>
      </div>
    </div>
    <div class="bantuan dz-hitung" aria-live="polite"></div>
    <div class="dz-hasil"></div>`;

  const elHasil = wadah.querySelector('.dz-hasil');
  const elUrut = wadah.querySelector('.dz-urut select');

  function terpilih() {
    let b = o.baris;
    const s = o.saring?.find((x) => x.k === st.saring);
    if (s?.uji) b = b.filter(s.uji);
    if (siap && st.q.trim()) {
      const lolos = new Set(b);
      b = cariTeks(siap, st.q, { batas: 5000 }).cocok.map((x) => x.r).filter((r) => lolos.has(r));
    }
    const u = o.urutan.find((x) => x.k === st.urut) || o.urutan[0];
    return b.slice().sort((a, c) => (u.teks
      ? String(u.nilai(a) ?? '').localeCompare(String(u.nilai(c) ?? ''), 'id')
      : (Number(u.nilai(c)) || 0) - (Number(u.nilai(a)) || 0)));
  }

  function lukis() {
    const semua = terpilih();
    const tampil = semua.slice(0, st.batas);
    wadah.querySelector('.dz-hitung').textContent = o.hitung(semua.length, o.baris.length);
    if (!semua.length) {
      elHasil.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon(o.baris.length ? 'cari' : 'kosong', 40)}</span>${
        o.baris.length ? 'Tidak ada yang cocok.' : 'Belum ada order di rentang ini.'}</div>`;
      return;
    }
    const kelasBaris = (r) => (o.pilih?.(r) ? ' dz-pilih' : '');
    const hp = tampil.map((r, i) => {
      const h = o.hp(r);
      return `
        <button type="button" class="dz-baris${kelasBaris(r)}" data-k="${esc(o.kunci(r))}">
          <span class="dz-no">${i + 1}</span>
          <span class="dz-badan">
            <span class="dz-atas"><span class="dz-nama">${esc(h.nama)}</span><b class="dz-nilai">${esc(h.nilai)}</b></span>
            <span class="dz-ket">${esc(h.ket)}</span>
            <span class="dz-bar"><i style="width:${persenLebar(Number(o.batang(r)) || 0, maks)}%"></i></span>
          </span>
        </button>`;
    }).join('');
    const kepala = o.kolom.map((k) => {
      const aktif = k.urut && k.urut === st.urut;
      return `<th${k.lebar ? ` style="width:${k.lebar}px"` : ''}${k.urut
        ? ` data-urut="${esc(k.urut)}" class="bisa-urut${aktif ? ' aktif' : ''}" tabindex="0" role="button"
            aria-label="Urutkan menurut ${esc(k.judul)}"` : ''}>${esc(k.judul)}${aktif ? ' ▾' : ''}</th>`;
    }).join('');
    const badan = tampil.map((r, i) => `
      <tr data-k="${esc(o.kunci(r))}" tabindex="0" class="${o.pilih?.(r) ? 'baris-pilih' : ''}">
        <td class="num dz-kol-no">${i + 1}</td>
        ${o.kolom.map((k) => `<td class="${k.kelas || ''}">${k.isi(r, maks)}</td>`).join('')}
      </tr>`).join('');
    const sisa = semua.length - tampil.length;
    elHasil.innerHTML = `
      <div class="daftar-kartu dz-list">${hp}</div>
      <div class="daftar-tabel"><div class="dz-bingkai">
        <table class="sheet dasbor-tabel dz-tabel">
          <thead><tr><th class="dz-kol-no">#</th>${kepala}</tr></thead>
          <tbody>${badan}</tbody>
        </table></div></div>
      ${sisa > 0 ? `<button type="button" class="btn garis dz-lagi">Tampilkan ${
        penuh(Math.min(BARIS_PER_HALAMAN, sisa))} lagi — masih ${penuh(sisa)}</button>` : ''}`;
  }

  function aturUrut(k) {
    if (!o.urutan.some((u) => u.k === k)) return;
    st.urut = k; elUrut.value = k; st.batas = BARIS_PER_HALAMAN;
    lukis();
  }

  wadah.addEventListener('input', (e) => {
    if (!e.target.matches('.dz-cari')) return;
    st.q = e.target.value; st.batas = BARIS_PER_HALAMAN;
    lukis();
  });
  elUrut.addEventListener('change', () => aturUrut(elUrut.value));
  wadah.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]');
    if (s) {
      st.saring = s.dataset.s; st.batas = BARIS_PER_HALAMAN;
      wadah.querySelectorAll('[data-s]').forEach((b) => {
        const aktif = b.dataset.s === st.saring;
        b.classList.toggle('aktif', aktif); b.setAttribute('aria-pressed', String(aktif));
      });
      lukis();
      return;
    }
    const th = e.target.closest('th[data-urut]');
    if (th) { aturUrut(th.dataset.urut); return; }
    if (e.target.closest('.dz-lagi')) { st.batas += BARIS_PER_HALAMAN; lukis(); return; }
    if (e.target.closest('.dz-unduh')) {
      const semua = terpilih();
      if (!semua.length) { pesan('Tidak ada baris untuk diunduh.', 'salah'); return; }
      unduh(o.unduh.nama, keCSV(o.unduh.kolom, semua.map(o.unduh.baris)));
      pesan(`${penuh(semua.length)} baris diunduh.`, 'ok');
      return;
    }
    const baris = e.target.closest('[data-k]');
    if (baris) { const r = o.baris.find((x) => o.kunci(x) === baris.dataset.k); if (r) o.buka(r); }
  });
  wadah.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const th = e.target.closest('th[data-urut]');
    if (th) { e.preventDefault(); aturUrut(th.dataset.urut); return; }
    const tr = e.target.closest('tr[data-k]');
    if (tr) { e.preventDefault(); const r = o.baris.find((x) => o.kunci(x) === tr.dataset.k); if (r) o.buka(r); }
  });

  lukis();
}

/** Sel tabel berisi angka + batang tipis di bawahnya. */
const selBatang = (v, maks) => `${esc(penuh(v))}<span class="dz-bar"><i style="width:${persenLebar(Number(v) || 0, maks)}%"></i></span>`;
/** Angka untuk Excel Indonesia: desimal pakai koma. */
const keExcel = (v) => (kosong(v) ? '' : String(Number(v)).replace('.', ','));
const uang = (v) => (kosong(v) ? '' : String(Math.round(Number(v))));

/* ------------------------------------------------------------
   Halaman
   ------------------------------------------------------------ */

export async function gambar(isi) {
  isi.innerHTML = `
    <div class="dz">
      <div class="dz-saring">
        <div><label class="label" for="dz-periode">Periode</label>
          <select id="dz-periode">${PERIODE.map((p) =>
            `<option value="${p.k}"${p.k === periodeAktif ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
        <div><label class="label" for="dz-sales">Sales</label>
          <select id="dz-sales"><option value="">Semua sales</option></select></div>
        <div class="dz-atur" id="dz-atur" hidden>
          <div><label class="label" for="dz-dari">Dari</label><input type="date" id="dz-dari"></div>
          <div><label class="label" for="dz-sampai">Sampai</label><input type="date" id="dz-sampai"></div>
        </div>
      </div>
      <div class="dz-rentang" id="dz-rentang"></div>
      <div class="dz-tab" id="dz-tab" role="tablist">
        ${TAB.map((t) => `<button type="button" role="tab" data-t="${t.k}">${esc(t.label)}</button>`).join('')}
      </div>
      <div id="dz-isi"><div class="memuat"><div class="putar"></div>Memuat…</div></div>
    </div>`;

  const elIsi = isi.querySelector('#dz-isi');
  const selPeriode = isi.querySelector('#dz-periode');
  const selSales = isi.querySelector('#dz-sales');
  const elAtur = isi.querySelector('#dz-atur');
  const inDari = isi.querySelector('#dz-dari');
  const inSampai = isi.querySelector('#dz-sampai');
  const elRentang = isi.querySelector('#dz-rentang');

  let data = null;
  let nomorMuat = 0;
  let akunSales = [];
  let orderPertama = null;   // tanggal order paling awal: batas "pembanding lengkap"

  // Dua-duanya pelengkap: gagal dimuat pun dasbor tetap jalan.
  try {
    const [akun, awal] = await Promise.all([
      db.pilih('profil', { select: 'id,nama,peran,aktif', order: 'nama.asc,id.asc' }),
      db.pilih('pesanan', { select: 'tanggal', order: 'tanggal.asc,id.asc', limit: 1 }),
    ]);
    akunSales = akun.filter((p) => p.peran === 'sales');
    orderPertama = awal[0]?.tanggal || null;
  } catch { /* abaikan */ }

  function isiPilihanSales() {
    const ada = new Set([...selSales.options].map((x) => x.value));
    const baru = akunSales.filter((p) => !ada.has(p.id))
      .map((p) => [p.id, p.nama + (p.aktif ? '' : ' (nonaktif)')])
      // siapa pun yang tercatat menjual di periode ini walau bukan akun sales
      .concat((data?.sales || []).filter((x) => !ada.has(x.sales_id) && !akunSales.some((p) => p.id === x.sales_id))
        .map((x) => [x.sales_id, x.nama || x.kode_sales || '—']));
    if (baru.length) {
      selSales.insertAdjacentHTML('beforeend', baru.map(([id, nama]) =>
        `<option value="${esc(id)}">${esc(nama)}</option>`).join(''));
    }
    selSales.value = salesAktif || '';
    if (selSales.value !== (salesAktif || '')) { salesAktif = null; selSales.value = ''; }
  }
  isiPilihanSales();

  const namaSales = (id) => akunSales.find((p) => p.id === id)?.nama
    || data?.sales.find((x) => x.sales_id === id)?.nama || '';

  function tampilkanAtur() {
    const atur = periodeAktif === 'atur';
    elAtur.hidden = !atur;
    if (!atur) return;
    const r = rentang();
    dariAtur = r.dari; sampaiAtur = r.sampai;
    inDari.value = r.dari; inSampai.value = r.sampai;
    inDari.max = hariIni(); inSampai.max = hariIni();
  }
  tampilkanAtur();

  selPeriode.addEventListener('change', () => { periodeAktif = selPeriode.value; tampilkanAtur(); muat(); });
  selSales.addEventListener('change', () => { salesAktif = selSales.value || null; muat(); });
  const gantiTanggal = () => {
    if (!inDari.value || !inSampai.value) return;   // masih diketik
    dariAtur = inDari.value; sampaiAtur = inSampai.value;
    muat();
  };
  inDari.addEventListener('change', gantiTanggal);
  inSampai.addEventListener('change', gantiTanggal);

  isi.querySelector('#dz-tab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b || b.dataset.t === tabAktif) return;
    tabAktif = b.dataset.t;
    gambarTab();
  });

  // Ketukan pada baris peringkat (Ringkasan) & tautan "Lihat semua".
  elIsi.addEventListener('click', (e) => {
    const ke = e.target.closest('[data-ke]');
    if (ke) { tabAktif = ke.dataset.ke; gambarTab(); window.scrollTo({ top: 0 }); return; }
    const r = e.target.closest('[data-rinci]');
    if (r) { bukaRinci(r.dataset.rinci, r.dataset.k); return; }
    const m = e.target.closest('[data-m]');
    if (m && m.dataset.m !== metrikAktif) { metrikAktif = m.dataset.m; gambarTab(); return; }
    if (e.target.closest('[data-ulang]')) muat();
  });

  async function muat() {
    const r = rentang();
    // Rentang yang mulai sebelum order pertama: grafiknya mulai dari order
    // pertama saja, supaya tidak separuh kosong dan batangnya tetap rinci.
    if (orderPertama && orderPertama > r.dari && orderPertama <= r.sampai) {
      r.mulaiGrafik = orderPertama;
      r.satuan = satuanUntuk(lamaHari(orderPertama, r.sampai));
    }
    const no = ++nomorMuat;
    const sid = salesAktif;
    elRentang.textContent = `${rentangTeks(r.dari, r.sampai)} · ${penuh(r.lama)} hari`
      + (sid ? ` · hanya sales ${namaSales(sid)}` : '');
    // Muat ulang: tampilan lama diredupkan, bukan diganti lingkaran putar —
    // halaman tidak melompat tiap kali saringan diganti.
    if (data) elIsi.classList.add('dz-memuat');
    else elIsi.innerHTML = '<div class="memuat"><div class="putar"></div>Memuat…</div>';

    const p = { p_dari: r.dari, p_sampai: r.sampai };
    let h;
    try {
      h = await Promise.all([
        db.rpc('dasbor_ringkas', { ...p, p_sales_id: sid }),
        db.rpc('dasbor_ringkas', { p_dari: r.banding.dari, p_sampai: r.banding.sampai, p_sales_id: sid }),
        db.rpc('dasbor_deret', { ...p, p_satuan: r.satuan, p_sales_id: sid }),
        db.rpc('dasbor_sales', p),
        db.rpc('dasbor_rinci', { ...p, p_per: 'toko', p_sales_id: sid }),
        db.rpc('dasbor_barang', { ...p, p_limit: 0, p_sales_id: sid }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'kategori', p_sales_id: sid }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'perusahaan', p_sales_id: sid }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'tempo', p_sales_id: sid }),
      ]);
    } catch (e) {
      if (no !== nomorMuat) return;
      elIsi.classList.remove('dz-memuat');
      if (!data) {
        elIsi.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('peringatan', 40)}</span>${
          esc(e.message || 'Gagal memuat dasbor.')}
          <div style="margin-top:16px"><button type="button" class="btn abu kecil" data-ulang="1">Coba lagi</button></div></div>`;
      }
      pesan(e.message || 'Gagal memuat dasbor.', 'salah');
      return;
    }
    if (no !== nomorMuat) return;   // saringan sudah diganti lagi; jawaban ini basi

    const satu = (x) => (Array.isArray(x) ? x[0] : x) || {};
    data = {
      r, sid,
      ringkas: satu(h[0]), lalu: satu(h[1]),
      deret: isiDeret(h[2], r),
      sales: h[3] || [], toko: h[4] || [], barang: h[5] || [], kategori: h[6] || [],
      pt: h[7] || [], tempo: h[8] || [],
    };
    isiPilihanSales();
    elIsi.classList.remove('dz-memuat');
    gambarTab();
  }

  function gambarTab() {
    pengamat.disconnect();
    isi.querySelectorAll('#dz-tab [data-t]').forEach((b) => {
      const aktif = b.dataset.t === tabAktif;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-selected', String(aktif));
    });
    if (!data) return;
    ({ ringkas: gambarRingkas, sales: gambarSales, toko: gambarToko, barang: gambarBarang })[tabAktif]();
  }

  /* ---------------- Ringkasan ---------------- */

  function gambarRingkas() {
    const { r, ringkas: s, lalu, deret, sales, toko, barang, pt, kategori, tempo } = data;
    const omzet = Number(s.omzet) || 0;
    const margin = Number(s.margin) || 0;
    const berHpp = Number(s.omzet_ber_hpp) || 0;
    const cakupan = omzet > 0 ? Math.round((berHpp / omzet) * 100) : 0;
    const marginPersen = berHpp > 0 ? (margin / berHpp) * 100 : null;

    // Naik/turun hanya ditampilkan kalau pembandingnya sungguh ada dan utuh.
    const lengkap = !orderPertama || r.banding.dari >= orderPertama;
    const adaLalu = Number(lalu.jml_order) > 0;
    const adaKini = Number(s.jml_order) > 0;
    const banding = lengkap && adaLalu && adaKini;
    const delta = (kini, dulu) => {
      if (!banding) return '';
      const a = Number(kini) || 0; const b = Number(dulu) || 0;
      if (!(b > 0)) return '';
      const persen = ((a - b) / b) * 100;
      if (Math.abs(persen) < 0.05) return '<div class="dz-delta">= sama</div>';
      const naik = persen > 0;
      const angka = Math.abs(persen) >= 1000 ? '>999'
        : Math.abs(persen).toLocaleString('id-ID', { maximumFractionDigits: 1 });
      return `<div class="dz-delta ${naik ? 'naik' : 'turun'}"><span aria-hidden="true">${naik ? '▲' : '▼'}</span>`
        + ` ${naik ? 'naik' : 'turun'} ${angka}%</div>`;
    };
    const ketBanding = banding
      ? `▲▼ dibanding ${esc(r.ketBanding)} (${esc(rentangTeks(r.banding.dari, r.banding.sampai))}).`
        + (r.berjalan ? ' Hari ini masih berjalan, sedangkan kemarin dihitung sehari penuh.' : '')
      : !adaKini ? (r.berjalan ? 'Belum ada order masuk hari ini.' : 'Tidak ada order di rentang ini.')
      : !lengkap
        ? `Belum ada pembanding: order baru tercatat sejak ${esc(tglTahun(orderPertama))}, jadi ${esc(r.ketBanding)} belum lengkap.`
        : `Tidak ada order pada ${esc(r.ketBanding)}, jadi belum bisa dibandingkan.`;

    const tanpaHpp = barang.filter((x) => kosong(x.margin));
    const satuanLabel = r.satuan;

    elIsi.innerHTML = `
      <div class="ringkas empat dz-kpi">
        <div class="sel"><div class="lbl"><i class="dz-kunci" style="background:var(--data-omzet)"></i>Omzet (Rp)</div>
          <div class="nilai">${esc(penuh(omzet))}</div>${delta(omzet, lalu.omzet)}</div>
        <div class="sel"><div class="lbl"><i class="dz-kunci" style="background:var(--data-order)"></i>Order</div>
          <div class="nilai">${esc(penuh(s.jml_order))}</div>${delta(s.jml_order, lalu.jml_order)}</div>
        <div class="sel"><div class="lbl">Toko yang order</div>
          <div class="nilai">${esc(penuh(s.jml_toko))}</div>${delta(s.jml_toko, lalu.jml_toko)}</div>
        <div class="sel"><div class="lbl">Rata-rata per order (Rp)</div>
          <div class="nilai">${esc(penuh(s.rata_order))}</div>${delta(s.rata_order, lalu.rata_order)}</div>
      </div>
      <div class="bantuan dz-ket-banding">${ketBanding}</div>

      ${deret.length > 1 ? `
      <div class="kartu">
        <div class="dz-kepala">
          <div class="judul-bagian">${esc(METRIK[metrikAktif].label)} per ${esc(satuanLabel)}</div>
          <div class="saring dz-metrik" role="group" aria-label="Angka yang digambar">
            ${Object.entries(METRIK).map(([k, m]) => `<button type="button" data-m="${k}" aria-pressed="${k === metrikAktif}"
              class="${k === metrikAktif ? 'aktif' : ''}"><i class="dz-kunci" style="background:${m.warna}"></i>${esc(m.label)}</button>`).join('')}
          </div>
        </div>
        <div id="dz-grafik"></div>
        ${metrikAktif === 'margin' && cakupan < 100 ? `<div class="bantuan">Margin baru terhitung untuk ${cakupan}% omzet — lihat kartu Margin di bawah.</div>` : ''}
      </div>` : ''}

      ${pt.length ? `
      <div class="dz-tiga">
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Per perusahaan</div></div>
          ${peringkatHtml(pt, {
            jenis: 'perusahaan', kunci: (x) => x.kunci, nama: (x) => x.nama, batas: 6,
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => `${porsi(x.omzet, omzet)} omzet · ${penuh(x.jml_barang)} jenis barang · ${penuh(x.jml_order)} order`,
          })}
        </div>
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Per kategori</div></div>
          ${peringkatHtml(kategori, {
            jenis: 'kategori', kunci: (x) => x.kunci, nama: (x) => x.nama, batas: 6,
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => `${porsi(x.omzet, omzet)} omzet · ${penuh(x.jml_barang)} jenis barang`,
          })}
        </div>
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Tempo pembayaran</div></div>
          ${peringkatHtml(tempo, {
            jenis: 'tempo', kunci: (x) => x.kunci, batas: 3,
            nama: (x) => (x.ket ? `${x.nama} · ${x.ket} hari` : x.nama),
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => `${porsi(x.omzet, omzet)} omzet · ${penuh(x.jml_order)} order`,
          })}
        </div>
      </div>
      ${pt.some((x) => x.kunci === TANPA_PT) ? `<div class="bantuan dz-ket-banding">“${esc(TANPA_PT)}” = barang lama yang belum
        diberi kelompok &amp; perusahaan. Isi lewat Admin → Barang → Belum ada kelompok.</div>` : ''}` : ''}

      <div class="dz-tiga">
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Sales teratas</div>
            <button type="button" class="dz-tautan" data-ke="sales">Semua sales ›</button></div>
          ${peringkatHtml(sales, {
            jenis: 'sales', kunci: (x) => String(x.sales_id), nama: (x) => x.nama || '—',
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => `${penuh(x.jml_order)} order · ${penuh(x.toko_unik)} toko`,
          })}
        </div>
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Toko teratas</div>
            <button type="button" class="dz-tautan" data-ke="toko">Semua toko ›</button></div>
          ${peringkatHtml(toko, {
            jenis: 'toko', kunci: (x) => x.kunci, nama: (x) => x.nama || '—',
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => [x.ket, x.sales, `${penuh(x.jml_order)} order`].filter(Boolean).join(' · '),
          })}
        </div>
        <div class="kartu">
          <div class="dz-kepala"><div class="judul-bagian">Barang teratas</div>
            <button type="button" class="dz-tautan" data-ke="barang">Semua barang ›</button></div>
          ${peringkatHtml(barang, {
            jenis: 'barang', kunci: (x) => x.barang_nama, nama: (x) => x.barang_nama,
            nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet),
            ket: (x) => `${bilangan(x.qty)} ${x.satuan || ''} · ${penuh(x.jml_toko)} toko`,
          })}
        </div>
      </div>

      <div class="kartu">
        <div class="judul-bagian"><i class="dz-kunci" style="background:var(--data-margin)"></i>Margin</div>
        <div class="dz-margin">
          <div>
            <div class="dz-angka">${esc(rupiah(margin))}</div>
            <div class="bantuan">${marginPersen === null ? 'Belum ada penjualan yang HPP-nya terisi.'
              : `${esc(marginPersen.toLocaleString('id-ID', { maximumFractionDigits: 1 }))}% dari omzet yang HPP-nya sudah diisi (${esc(rupiah(berHpp))}).`}</div>
          </div>
          <div class="dz-meter-blok">
            <div class="dz-meter-label"><span>HPP sudah diisi untuk</span><b>${cakupan}% omzet</b></div>
            <div class="dz-meter" role="img" aria-label="HPP terisi untuk ${cakupan} persen omzet"><i style="width:${cakupan}%"></i></div>
          </div>
        </div>
        ${cakupan < 100 && tanpaHpp.length ? `
        <div class="bantuan dz-pisah">Margin di atas <b>belum lengkap</b>. Barang terlaris yang HPP-nya masih kosong —
          isi yang ini dulu lewat Admin → Barang supaya margin cepat utuh:</div>
        ${peringkatHtml(tanpaHpp, {
          jenis: 'barang', kunci: (x) => x.barang_nama, nama: (x) => x.barang_nama,
          nilai: (x) => x.omzet, teks: (x) => rupiah(x.omzet), warna: 'var(--garis-kuat)',
          ket: (x) => `${bilangan(x.qty)} ${x.satuan || ''} terjual`,
        })}` : ''}
      </div>`;

    const elGrafik = elIsi.querySelector('#dz-grafik');
    if (elGrafik) pasangGrafik(elGrafik, deret, r.satuan, metrikAktif);
  }

  /* ---------------- Sales ---------------- */

  function gambarSales() {
    const { r, sid } = data;
    // Sales aktif yang belum punya order ikut tampil — "tidak menjual" juga kabar.
    const ada = new Set(data.sales.map((x) => x.sales_id));
    const baris = data.sales.concat(akunSales.filter((p) => p.aktif && !ada.has(p.id)).map((p) => ({
      sales_id: p.id, nama: p.nama, kode_sales: null, omzet: 0, margin: null, jml_order: 0,
      toko_unik: 0, hari_aktif: 0, rata_toko_per_hari: 0, barang_teratas: null, tanpaOrder: true,
    })));
    elIsi.innerHTML = `<div class="kartu"><div id="dz-daftar"></div>
      <div class="bantuan"><b>Toko/hari</b> = rata-rata berapa toko berbeda yang ada ordernya, dihitung hanya pada
        hari sales itu benar-benar menjual.${sid ? ' Daftar ini tetap memuat semua sales supaya bisa dibandingkan; yang sedang disaring ditandai.' : ''}</div></div>`;
    pasangDaftar(elIsi.querySelector('#dz-daftar'), {
      keadaan: keadaanDaftar.sales,
      baris,
      kunci: (x) => String(x.sales_id),
      batang: (x) => x.omzet,
      pilih: (x) => x.sales_id === sid,
      hitung: (n) => `${penuh(n)} sales · ${penuh(data.sales.length)} yang ada order`,
      hp: (x) => ({
        nama: x.nama || '—',
        nilai: rupiah(x.omzet),
        ket: x.tanpaOrder ? 'Belum ada order di periode ini'
          : `${penuh(x.jml_order)} order · ${penuh(x.toko_unik)} toko · ${bilangan(x.rata_toko_per_hari)} toko/hari`,
      }),
      kolom: [
        { judul: 'Sales', urut: 'nama', isi: (x) => `<b>${esc(x.nama || '—')}</b>${x.kode_sales && x.kode_sales !== x.nama ? ` <span class="kode">${esc(x.kode_sales)}</span>` : ''}` },
        { judul: 'Omzet', urut: 'omzet', kelas: 'num', lebar: 150, isi: (x, maks) => selBatang(x.omzet, maks) },
        { judul: 'Order', urut: 'order', kelas: 'num', lebar: 76, isi: (x) => esc(penuh(x.jml_order)) },
        { judul: 'Toko', urut: 'toko', kelas: 'num', lebar: 70, isi: (x) => esc(penuh(x.toko_unik)) },
        { judul: 'Hari aktif', kelas: 'num', lebar: 90, isi: (x) => esc(penuh(x.hari_aktif)) },
        { judul: 'Toko/hari', urut: 'tokohari', kelas: 'num', lebar: 96, isi: (x) => esc(bilangan(x.rata_toko_per_hari)) },
        { judul: 'Margin', kelas: 'num', lebar: 120, isi: (x) => esc(marginTeks(x.margin)) },
        { judul: 'Paling banyak dijual', isi: (x) => esc(x.barang_teratas || (x.tanpaOrder ? 'belum ada order' : '—')) },
      ],
      urutan: [
        { k: 'omzet', label: 'Omzet terbesar', nilai: (x) => x.omzet },
        { k: 'order', label: 'Order terbanyak', nilai: (x) => x.jml_order },
        { k: 'toko', label: 'Toko terbanyak', nilai: (x) => x.toko_unik },
        { k: 'tokohari', label: 'Toko per hari', nilai: (x) => x.rata_toko_per_hari },
        { k: 'nama', label: 'Nama A–Z', nilai: (x) => x.nama, teks: true },
      ],
      buka: (x) => (x.tanpaOrder ? pesan(`${x.nama} belum punya order di periode ini.`, 'info') : bukaRinci('sales', String(x.sales_id))),
      unduh: {
        nama: `dasbor-sales-${r.dari}-sd-${r.sampai}.csv`,
        kolom: ['Sales', 'Kode', 'Omzet', 'Order', 'Toko', 'Hari aktif', 'Toko per hari', 'Margin', 'Paling banyak dijual'],
        baris: (x) => [x.nama || '', x.kode_sales || '', uang(x.omzet), x.jml_order, x.toko_unik, x.hari_aktif,
          keExcel(x.rata_toko_per_hari), uang(x.margin), x.barang_teratas || ''],
      },
    });
  }

  /* ---------------- Toko ---------------- */

  function gambarToko() {
    const { r, sid } = data;
    elIsi.innerHTML = '<div class="kartu"><div id="dz-daftar"></div></div>';
    pasangDaftar(elIsi.querySelector('#dz-daftar'), {
      keadaan: keadaanDaftar.toko,
      baris: data.toko,
      kunci: (x) => x.kunci,
      batang: (x) => x.omzet,
      cari: (x) => ({ nama: x.nama || '', kata: [x.ket, x.sales].filter(Boolean).join(' ') }),
      ketCari: 'Cari toko, kota, atau sales…',
      hitung: (n, semua) => (n === semua ? `${penuh(semua)} toko order di periode ini${sid ? ` lewat ${namaSales(sid)}` : ''}`
        : `${penuh(n)} dari ${penuh(semua)} toko`),
      hp: (x) => ({
        nama: x.nama || '—',
        nilai: rupiah(x.omzet),
        ket: [x.ket, x.sales, `${penuh(x.jml_order)} order`, `${penuh(x.jml_barang)} jenis barang`].filter(Boolean).join(' · '),
      }),
      kolom: [
        { judul: 'Toko', urut: 'nama', isi: (x) => `<b>${esc(x.nama || '—')}</b>${x.ket ? `<span class="ket-kecil">${esc(x.ket)}</span>` : ''}` },
        { judul: 'Sales', lebar: 120, isi: (x) => esc(x.sales || '—') },
        { judul: 'Omzet', urut: 'omzet', kelas: 'num', lebar: 150, isi: (x, maks) => selBatang(x.omzet, maks) },
        { judul: 'Order', urut: 'order', kelas: 'num', lebar: 76, isi: (x) => esc(penuh(x.jml_order)) },
        { judul: 'Jenis barang', urut: 'barang', kelas: 'num', lebar: 110, isi: (x) => esc(penuh(x.jml_barang)) },
        { judul: 'Order terakhir', urut: 'terakhir', lebar: 120, isi: (x) => esc(x.terakhir ? tglSingkat(x.terakhir) : '—') },
      ],
      urutan: [
        { k: 'omzet', label: 'Omzet terbesar', nilai: (x) => x.omzet },
        { k: 'order', label: 'Order terbanyak', nilai: (x) => x.jml_order },
        { k: 'barang', label: 'Jenis barang terbanyak', nilai: (x) => x.jml_barang },
        { k: 'terakhir', label: 'Order paling baru', nilai: (x) => (x.terakhir ? keTgl(x.terakhir).getTime() : 0) },
        { k: 'nama', label: 'Nama A–Z', nilai: (x) => x.nama, teks: true },
      ],
      buka: (x) => bukaRinci('toko', x.kunci),
      unduh: {
        nama: `dasbor-toko-${r.dari}-sd-${r.sampai}.csv`,
        kolom: ['Toko', 'Kota', 'Sales', 'Omzet', 'Order', 'Jenis barang', 'Order terakhir'],
        baris: (x) => [x.nama || '', x.ket || '', x.sales || '', uang(x.omzet), x.jml_order, x.jml_barang, x.terakhir || ''],
      },
    });
  }

  /* ---------------- Barang ---------------- */

  function gambarBarang() {
    const { r, sid, barang } = data;
    const st = keadaanDaftar.barang;
    const unik = (f) => [...new Set(barang.map(f).filter(Boolean))].sort();
    const daftarPt = unik((x) => x.perusahaan);
    const daftarKat = unik((x) => x.kategori_nama);
    if (st.pt && !daftarPt.includes(st.pt)) st.pt = '';
    if (st.kat && !daftarKat.includes(st.kat)) st.kat = '';
    const opsi = (daftar, v, semua) => `<option value="">${esc(semua)}</option>` + daftar.map((x) =>
      `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
    const tersaring = barang.filter((x) => (!st.pt || x.perusahaan === st.pt) && (!st.kat || x.kategori_nama === st.kat));
    const tempoTeks = (x) => (x.tempo === 'BARANG BESI' ? '90 hari' : x.tempo === 'FAST MOVING' ? '30 hari' : '');
    const grup = (x) => [x.kelompok_nama, x.perusahaan, tempoTeks(x)].filter((v) => v && !v.startsWith('(')).join(' · ');
    elIsi.innerHTML = `
      <div class="dz-saring">
        <div><label class="label" for="dz-b-pt">Perusahaan</label>
          <select id="dz-b-pt">${opsi(daftarPt, st.pt, 'Semua perusahaan')}</select></div>
        <div><label class="label" for="dz-b-kat">Kategori</label>
          <select id="dz-b-kat">${opsi(daftarKat, st.kat, 'Semua kategori')}</select></div>
      </div>
      <div class="kartu"><div id="dz-daftar"></div></div>`;
    const gantiSaring = () => {
      st.pt = elIsi.querySelector('#dz-b-pt').value;
      st.kat = elIsi.querySelector('#dz-b-kat').value;
      st.batas = BARIS_PER_HALAMAN;
      gambarBarang();
    };
    elIsi.querySelector('#dz-b-pt').addEventListener('change', gantiSaring);
    elIsi.querySelector('#dz-b-kat').addEventListener('change', gantiSaring);
    const disaring = [st.pt, st.kat].filter(Boolean).join(' · ');
    pasangDaftar(elIsi.querySelector('#dz-daftar'), {
      keadaan: st,
      baris: tersaring,
      kunci: (x) => x.barang_nama,
      batang: (x) => x.omzet,
      cari: (x) => ({ nama: x.barang_nama || '', kata: [x.kelompok_nama, x.perusahaan, x.kategori_nama].join(' ') }),
      ketCari: 'Cari barang…',
      saring: [
        { k: 'semua', label: 'Semua' },
        { k: 'tanpahpp', label: 'HPP belum diisi', uji: (x) => kosong(x.margin) },
      ],
      hitung: (n, semua) => (n === semua ? `${penuh(semua)} barang berbeda terjual${sid ? ` oleh ${namaSales(sid)}` : ''}`
        + (disaring ? ` · ${disaring}` : '')
        : `${penuh(n)} dari ${penuh(semua)} barang`),
      hp: (x) => ({
        nama: x.barang_nama,
        nilai: rupiah(x.omzet),
        ket: `${bilangan(x.qty)} ${x.satuan || ''} · ${penuh(x.jml_order)} order · ${penuh(x.jml_toko)} toko`
          + (grup(x) ? ` · ${grup(x)}` : '')
          + (kosong(x.margin) ? ' · HPP belum diisi' : ''),
      }),
      kolom: [
        { judul: 'Barang', urut: 'nama', isi: (x) => `<b>${esc(x.barang_nama)}</b>${grup(x) ? `<span class="ket-kecil">${esc(grup(x))}</span>` : ''}` },
        { judul: 'Terjual', kelas: 'num', lebar: 120, isi: (x) => `${esc(bilangan(x.qty))} ${esc(x.satuan || '')}` },
        { judul: 'Omzet', urut: 'omzet', kelas: 'num', lebar: 150, isi: (x, maks) => selBatang(x.omzet, maks) },
        { judul: 'Order', urut: 'order', kelas: 'num', lebar: 76, isi: (x) => esc(penuh(x.jml_order)) },
        { judul: 'Toko', urut: 'toko', kelas: 'num', lebar: 70, isi: (x) => esc(penuh(x.jml_toko)) },
        { judul: 'Margin', urut: 'margin', kelas: 'num', lebar: 130, isi: (x) => (kosong(x.margin) ? '<span class="ket-kecil">HPP belum diisi</span>' : esc(penuh(x.margin))) },
      ],
      urutan: [
        { k: 'omzet', label: 'Omzet terbesar', nilai: (x) => x.omzet },
        { k: 'toko', label: 'Paling menyebar (toko terbanyak)', nilai: (x) => x.jml_toko },
        { k: 'order', label: 'Order terbanyak', nilai: (x) => x.jml_order },
        { k: 'margin', label: 'Margin terbesar', nilai: (x) => x.margin },
        { k: 'nama', label: 'Nama A–Z', nilai: (x) => x.barang_nama, teks: true },
      ],
      buka: (x) => bukaRinci('barang', x.barang_nama),
      unduh: {
        nama: `dasbor-barang-${r.dari}-sd-${r.sampai}.csv`,
        kolom: ['Barang', 'Kelompok', 'Kategori', 'Perusahaan', 'Tempo', 'Terjual', 'Satuan', 'Omzet', 'Order', 'Toko', 'Margin'],
        baris: (x) => [x.barang_nama, x.kelompok_nama || '', x.kategori_nama || '', x.perusahaan || '', tempoTeks(x),
          keExcel(x.qty), x.satuan || '', uang(x.omzet), x.jml_order, x.jml_toko, uang(x.margin)],
      },
    });
  }

  /* ---------------- Lembar rincian ---------------- */

  async function bukaRinci(jenis, kunci) {
    if (!data) return;
    const { r, sid } = data;
    const p = { p_dari: r.dari, p_sampai: r.sampai };
    let judul; let mini; let muatan; let susun; let aksi = '';

    if (jenis === 'sales') {
      const x = data.sales.find((s) => String(s.sales_id) === String(kunci));
      if (!x) return;
      judul = `Sales ${x.nama || ''}`;
      mini = [['Omzet (Rp)', penuh(x.omzet)], ['Order', penuh(x.jml_order)],
        ['Toko', penuh(x.toko_unik)], ['Toko per hari', bilangan(x.rata_toko_per_hari)]];
      muatan = () => Promise.all([
        db.rpc('dasbor_deret', { ...p, p_satuan: r.satuan, p_sales_id: x.sales_id }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'toko', p_sales_id: x.sales_id }),
        db.rpc('dasbor_barang', { ...p, p_limit: 30, p_sales_id: x.sales_id }),
      ]);
      susun = ([deret, toko, barang]) => ({
        deret,
        bagian: [
          [`Toko yang dilayani (${penuh(toko.length)})`, peringkatHtml(toko, {
            batas: 30, nama: (t) => t.nama || '—', nilai: (t) => t.omzet, teks: (t) => rupiah(t.omzet),
            ket: (t) => [t.ket, `${penuh(t.jml_order)} order`].filter(Boolean).join(' · '),
          })],
          [barang.length >= 30 ? '30 barang terbesar' : `Barang yang dijual (${penuh(barang.length)})`, peringkatHtml(barang, {
            batas: 30, nama: (b) => b.barang_nama, nilai: (b) => b.omzet, teks: (b) => rupiah(b.omzet),
            ket: (b) => `${bilangan(b.qty)} ${b.satuan || ''} · ${penuh(b.jml_toko)} toko`,
          })],
        ],
      });
      if (sid !== x.sales_id) {
        aksi = `<button type="button" class="btn garis" data-saring-sales="${esc(x.sales_id)}">Tampilkan seluruh dasbor hanya untuk ${esc(x.nama || 'sales ini')}</button>`;
      }
    } else if (jenis === 'perusahaan' || jenis === 'kategori' || jenis === 'tempo') {
      const x = { perusahaan: data.pt, kategori: data.kategori, tempo: data.tempo }[jenis].find((g) => g.kunci === kunci);
      if (!x) return;
      const saring = { [`p_${jenis}`]: x.kunci };
      judul = jenis === 'perusahaan' ? `Perusahaan ${x.nama}`
        : jenis === 'tempo' ? `Tempo ${x.nama}${x.ket ? ` · ${x.ket} hari` : ''}` : x.nama;
      mini = [['Omzet (Rp)', penuh(x.omzet)], ['Order', penuh(x.jml_order)],
        ['Jenis barang', penuh(x.jml_barang)], ['Toko', penuh(x.jml_toko)]];
      const sisi = jenis === 'perusahaan' ? 'kategori' : 'kelompok';
      muatan = () => Promise.all([
        db.rpc('dasbor_rinci', { ...p, p_per: r.satuan, p_sales_id: sid, ...saring }),
        db.rpc('dasbor_rinci', { ...p, p_per: sisi, p_sales_id: sid, ...saring }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'barang', p_sales_id: sid, ...saring }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'sales', p_sales_id: sid, ...saring }),
      ]);
      susun = ([deret, kel, barang, sales]) => ({
        deret,
        ket: `${porsi(x.omzet, data.ringkas.omzet)} dari seluruh omzet di rentang ini.`,
        bagian: [
          [`Per ${sisi} (${penuh(kel.length)})`, peringkatHtml(kel, {
            batas: 40, nama: (g) => g.nama || '—', nilai: (g) => g.omzet, teks: (g) => rupiah(g.omzet),
            ket: (g) => [g.ket, `${penuh(g.jml_barang)} jenis barang`, `${penuh(g.jml_order)} order`].filter(Boolean).join(' · '),
          })],
          [barang.length > 40 ? '40 barang terbesar' : `Barang terjual (${penuh(barang.length)})`, peringkatHtml(barang, {
            batas: 40, nama: (b) => b.nama, nilai: (b) => b.omzet, teks: (b) => rupiah(b.omzet),
            ket: (b) => `${bilangan(b.qty)} ${b.satuan || ''} · ${penuh(b.jml_order)} order · ${penuh(b.jml_toko)} toko`,
          })],
          [`Sales yang menjual (${penuh(sales.length)})`, peringkatHtml(sales, {
            batas: 30, nama: (g) => g.nama || '—', nilai: (g) => g.omzet, teks: (g) => rupiah(g.omzet),
            ket: (g) => `${penuh(g.jml_order)} order · ${penuh(g.jml_toko)} toko`,
          })],
        ],
      });
    } else if (jenis === 'toko') {
      const x = data.toko.find((t) => t.kunci === kunci);
      if (!x) return;
      judul = x.nama || 'Toko';
      mini = [['Omzet (Rp)', penuh(x.omzet)], ['Order', penuh(x.jml_order)],
        ['Jenis barang', penuh(x.jml_barang)], ['Order terakhir', x.terakhir ? tglSingkat(x.terakhir) : '—']];
      muatan = () => Promise.all([
        db.rpc('dasbor_rinci', { ...p, p_per: r.satuan, p_sales_id: sid, p_toko: x.kunci }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'barang', p_sales_id: sid, p_toko: x.kunci }),
      ]);
      susun = ([deret, barang]) => ({
        deret,
        ket: [x.ket, x.sales ? `sales ${x.sales}` : ''].filter(Boolean).join(' · '),
        bagian: [[`Barang yang dibeli (${penuh(barang.length)})`, peringkatHtml(barang, {
          batas: 60, nama: (b) => b.nama, nilai: (b) => b.omzet, teks: (b) => rupiah(b.omzet),
          ket: (b) => `${bilangan(b.qty)} ${b.satuan || ''} · ${penuh(b.jml_order)} order`,
        })]],
      });
    } else {
      const x = data.barang.find((b) => b.barang_nama === kunci);
      if (!x) return;
      judul = x.barang_nama;
      mini = [['Omzet (Rp)', penuh(x.omzet)], ['Terjual', `${bilangan(x.qty)} ${x.satuan || ''}`.trim()],
        ['Order', penuh(x.jml_order)], ['Toko', penuh(x.jml_toko)]];
      muatan = () => Promise.all([
        db.rpc('dasbor_rinci', { ...p, p_per: r.satuan, p_sales_id: sid, p_barang: x.barang_nama }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'toko', p_sales_id: sid, p_barang: x.barang_nama }),
        db.rpc('dasbor_rinci', { ...p, p_per: 'sales', p_sales_id: sid, p_barang: x.barang_nama }),
      ]);
      susun = ([deret, toko, sales]) => ({
        deret,
        ket: kosong(x.margin) ? 'HPP belum diisi — margin barang ini belum terhitung.' : `Margin ${rupiah(x.margin)}`,
        bagian: [
          [`Toko yang membeli (${penuh(toko.length)})`, peringkatHtml(toko, {
            batas: 60, nama: (t) => t.nama || '—', nilai: (t) => t.omzet, teks: (t) => rupiah(t.omzet),
            ket: (t) => [t.ket, `${bilangan(t.qty)} ${t.satuan || ''}`, `${penuh(t.jml_order)} order`].filter(Boolean).join(' · '),
          })],
          [`Sales yang menjual (${penuh(sales.length)})`, peringkatHtml(sales, {
            batas: 30, nama: (s) => s.nama || '—', nilai: (s) => s.omzet, teks: (s) => rupiah(s.omzet),
            ket: (s) => `${bilangan(s.qty)} ${s.satuan || ''} · ${penuh(s.jml_toko)} toko`,
          })],
        ],
      });
    }

    const tirai = lembar(judul, `
      <div class="dz-rinci">
        <div class="dz-rentang">${esc(rentangTeks(r.dari, r.sampai))}${
          sid && jenis !== 'sales' ? ` · hanya sales ${esc(namaSales(sid))}` : ''}</div>
        <div class="ringkas dz-mini">${mini.map(([l, v]) =>
          `<div class="sel"><div class="lbl">${esc(l)}</div><div class="nilai">${esc(v)}</div></div>`).join('')}</div>
        <div class="dz-rinci-isi"><div class="memuat"><div class="putar"></div>Memuat rincian…</div></div>
      </div>`);
    const elRinci = tirai.querySelector('.dz-rinci-isi');

    tirai.addEventListener('click', (e) => {
      const b = e.target.closest('[data-saring-sales]');
      if (!b) return;
      salesAktif = b.dataset.saringSales;
      tabAktif = 'ringkas';
      tirai.remove();
      isiPilihanSales();
      muat();
      window.scrollTo({ top: 0 });
    });

    try {
      const hasil = await muatan();
      if (!tirai.isConnected) return;   // lembarnya sudah ditutup
      const { deret, bagian, ket } = susun(hasil.map((x) => x || []));
      const isiDeretRinci = isiDeret(deret, r);
      elRinci.innerHTML = `
        ${ket ? `<div class="bantuan dz-rinci-ket">${esc(ket)}</div>` : ''}
        ${isiDeretRinci.length > 1 ? `<div class="judul-bagian">Omzet per ${esc(r.satuan)}</div><div class="dz-grafik-rinci"></div>` : ''}
        ${bagian.map(([j, html]) => `<div class="judul-bagian dz-judul-rinci">${esc(j)}</div>${html}`).join('')}
        ${aksi}`;
      const elG = elRinci.querySelector('.dz-grafik-rinci');
      if (elG) pasangGrafik(elG, isiDeretRinci, r.satuan, 'omzet', { tinggi: 170, tabel: false });
    } catch (e) {
      if (!tirai.isConnected) return;
      elRinci.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('peringatan', 40)}</span>${
        esc(e.message || 'Gagal memuat rincian.')}</div>`;
    }
  }

  gambarTab();
  await muat();
}
