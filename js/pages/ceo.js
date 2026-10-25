// Dasbor pemilik: omzet, margin, sales, barang.
//
// Semua angka datang MATANG dari server lewat RPC dasbor_*. Tidak ada
// satu pun perhitungan uang di berkas ini — itu aturan proyek, dan juga
// alasan kenapa HPP tidak perlu dikirim ke HP sama sekali.
//
// Grafiknya digambar tangan dengan SVG. Tanpa pustaka luar: aplikasi ini
// statis tanpa build step, dan menambah CDN berarti satu titik gagal baru
// di tempat yang sinyalnya belum tentu bagus.

import * as db from '../db.js';
import { esc, rupiah, pesan } from '../util.js';

/** Rentang siap pakai. Nilainya jumlah hari ke belakang dari hari ini. */
const RENTANG = [
  { k: 'minggu', label: 'Minggu ini', hari: 7, satuan: 'hari' },
  { k: 'bulan', label: 'Bulan ini', hari: 30, satuan: 'hari' },
  { k: 'tiga', label: '3 bulan', hari: 90, satuan: 'minggu' },
  { k: 'tahun', label: '12 bulan', hari: 365, satuan: 'bulan' },
];

let rentangAktif = 'bulan';
/** null = semua sales. Saringan ini mengubah SELURUH angka di layar. */
let salesAktif = null;

function tanggalISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function rentangTanggal(hari) {
  const sampai = new Date();
  const dari = new Date(sampai.getTime() - (hari - 1) * 86400000);
  return { dari: tanggalISO(dari), sampai: tanggalISO(sampai) };
}

/**
 * Angka uang penuh, dikelompokkan gaya Indonesia: 169499444 -> "169.499.444".
 *
 * Dulu fungsi ini menyingkat ke "169,5 jt". Pemilik memintanya penuh:
 * angka yang dibulatkan ke juta menyembunyikan ratusan ribu, dan untuk
 * memutuskan sesuatu ia perlu melihat angkanya apa adanya.
 */
function penuh(n) {
  return Math.round(Number(n) || 0).toLocaleString('id-ID');
}

/** Margin null = HPP barangnya belum diisi. Itu BUKAN nol. Menulis 0 di
 *  layar akan terbaca "barang ini tidak untung", padahal belum terhitung. */
function marginTeks(n) {
  return (n === null || n === undefined) ? '—' : penuh(n);
}

function labelPeriode(iso, satuan) {
  const d = new Date(iso + 'T00:00:00');
  if (satuan === 'bulan') {
    return d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/**
 * Grafik batang omzet, dengan bagian margin ditandai padat dari bawah.
 *
 * Satu batang menjawab dua pertanyaan sekaligus: berapa yang masuk, dan
 * berapa bagiannya yang benar-benar jadi untung. Dua grafik terpisah
 * memaksa mata membandingkan dua gambar; satu batang tidak.
 */
function grafikBatang(deret, satuan) {
  if (!deret.length) {
    return '<div class="kosong-pesan">Belum ada order di rentang ini.</div>';
  }

  const L = 86, K = 8, A = 14, B = 26;          // tepi kiri, kanan, atas, bawah
  const tinggi = 180;
  const lebar = Math.max(280, deret.length * 46 + L + K);
  const puncak = Math.max(...deret.map((d) => Number(d.omzet) || 0), 1);
  const plotT = tinggi - A - B;
  const lebarBatang = Math.min(30, (lebar - L - K) / deret.length - 8);

  const garis = [0, 0.5, 1].map((f) => {
    const y = A + plotT * (1 - f);
    return `<line x1="${L}" y1="${y}" x2="${lebar - K}" y2="${y}"
              stroke="var(--garis)" stroke-width="1"></line>
            <text x="${L - 6}" y="${y + 4}" text-anchor="end"
              font-size="9" fill="var(--tinta-2)"
              font-weight="700">${esc(penuh(puncak * f))}</text>`;
  }).join('');

  const batang = deret.map((d, i) => {
    const omzet = Number(d.omzet) || 0;
    const margin = Math.max(0, Number(d.margin) || 0);
    const x = L + i * ((lebar - L - K) / deret.length) + 4;
    const hO = (omzet / puncak) * plotT;
    const hM = (Math.min(margin, omzet) / puncak) * plotT;
    return `
      <rect x="${x}" y="${A + plotT - hO}" width="${lebarBatang}" height="${hO}"
            fill="var(--kraft-tua)" stroke="var(--tinta)" stroke-width="1.5"></rect>
      <rect x="${x}" y="${A + plotT - hM}" width="${lebarBatang}" height="${hM}"
            fill="var(--tinta)"></rect>
      <text x="${x + lebarBatang / 2}" y="${tinggi - 8}" text-anchor="middle"
            font-size="9" font-weight="700" fill="var(--tinta-2)"
            >${esc(labelPeriode(d.periode, satuan))}</text>`;
  }).join('');

  return `
    <div class="grafik-gulir">
      <svg viewBox="0 0 ${lebar} ${tinggi}" width="${lebar}" height="${tinggi}"
           role="img" aria-label="Grafik omzet dan margin per periode">
        ${garis}${batang}
      </svg>
    </div>
    <div class="grafik-kunci">
      <span><i class="kot kot-omzet"></i>Omzet</span>
      <span><i class="kot kot-margin"></i>Margin</span>
    </div>`;
}

/**
 * Satu garis per barang, bukan lima garis di satu sumbu.
 *
 * Alasannya angka sendiri: barang teratas 54 juta, yang di bawahnya 2-6
 * juta. Disatukan dalam satu skala, empat garis bawah jadi rata di dasar
 * dan tidak ada yang bisa dibaca. Masing-masing dengan skalanya sendiri
 * memperlihatkan BENTUK penjualan tiap barang — dan itu yang dicari dari
 * kata "tren". Puncaknya ditulis supaya garis tidak jadi hiasan tanpa
 * ukuran.
 */
function garisTren(titik, periode) {
  const L = 2, R = 298, A = 6, Bw = 42;
  const nilai = periode.map((p) => Number(titik.get(p) || 0));
  const puncak = Math.max.apply(null, nilai.concat([1]));
  const langkah = periode.length > 1 ? (R - L) / (periode.length - 1) : 0;
  const ke = (v, i) => ({
    x: L + i * langkah,
    y: A + (Bw - A) * (1 - v / puncak),
  });
  const t = nilai.map(ke);
  const garis = t.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  // Satu titik saja bukan garis. Digambar sebagai kotak supaya tetap terlihat.
  const tunggal = t.length === 1;
  const dasar = `${L},${Bw} ${garis} ${R},${Bw}`;
  return `
    <svg viewBox="0 0 300 48" class="tren-svg" preserveAspectRatio="none"
         role="img" aria-label="Garis ${periode.length} periode, puncak ${esc(penuh(puncak))}">
      <polygon points="${dasar}" fill="var(--kraft-tua)"></polygon>
      ${tunggal
        ? `<rect x="${(t[0].x - 3).toFixed(1)}" y="${(t[0].y - 3).toFixed(1)}" width="6" height="6" fill="var(--tinta)"></rect>`
        : `<polyline points="${garis}" fill="none" stroke="var(--tinta)" stroke-width="2"
             stroke-linejoin="miter" stroke-linecap="square" vector-effect="non-scaling-stroke"></polyline>`}
    </svg>`;
}

/** Ubah hasil dasbor_barang_tren jadi satu baris per barang. */
function rapikanTren(baris) {
  const per = new Map();
  (baris || []).forEach((r) => {
    if (!per.has(r.barang_nama)) {
      per.set(r.barang_nama, {
        nama: r.barang_nama, peringkat: r.peringkat, satuan: r.satuan || '',
        omzet: Number(r.total_omzet) || 0,
        order: Number(r.total_order) || 0,
        toko: Number(r.total_toko) || 0,
        qty: Number(r.total_qty) || 0,
        titik: new Map(),
      });
    }
    per.get(r.barang_nama).titik.set(r.periode, r);
  });
  return [...per.values()].sort((a, b) => a.peringkat - b.peringkat);
}

/** Satu bagian grafik tren. `ambil` memilih angka mana yang digariskan. */
function bagianTren(judul, ket, daftar, periode, ambil, ringkas) {
  if (!daftar.length) {
    return `<div class="kartu"><div class="judul-bagian">${esc(judul)}</div>
      <div class="kosong-pesan">Belum ada order di rentang ini.</div></div>`;
  }
  return `
    <div class="kartu">
      <div class="judul-bagian">${esc(judul)}</div>
      <div class="bantuan" style="margin-bottom:12px">${ket}</div>
      <div class="tren-daftar">
        ${daftar.map((b) => {
          const titik = new Map();
          b.titik.forEach((r, k) => titik.set(k, ambil(r)));
          return `
          <div class="tren-baris">
            <div class="tren-kepala">
              <span class="tren-no">${esc(String(b.peringkat))}</span>
              <span class="tren-nama">${esc(b.nama)}</span>
            </div>
            ${garisTren(titik, periode)}
            <div class="tren-angka">${ringkas(b)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

/** Satu baris angka di dalam kartu HP: label kecil di atas, angka di bawah. */
function sel(label, nilai, ket) {
  return `<div class="sel-kartu"><span>${esc(label)}</span><b>${esc(String(nilai))}</b>${
    ket ? `<i>${esc(ket)}</i>` : ''}</div>`;
}

function kartuBarang(daftar) {
  return daftar.map((x) => `
    <div class="kartu-angka">
      <div class="nama-kartu">${esc(x.barang_nama)}</div>
      <div class="ket-kartu">${esc(x.kategori_nama || 'tanpa kategori')}</div>
      <div class="sel-baris">
        ${sel('Omzet', penuh(x.omzet))}
        ${sel('Margin', marginTeks(x.margin))}
        ${sel('Terjual', `${Number(x.qty) || 0} ${x.satuan || ''}`.trim())}
        ${sel('Toko', x.jml_toko ?? 0)}
      </div>
    </div>`).join('');
}

function kartuKategori(daftar) {
  return daftar.map((x) => `
    <div class="kartu-angka">
      <div class="nama-kartu">${esc(x.kategori_nama)}</div>
      <div class="sel-baris">
        ${sel('Omzet', penuh(x.omzet))}
        ${sel('Margin', marginTeks(x.margin))}
        ${sel('Barang', x.jml_barang ?? 0)}
        ${sel('Order', x.jml_order ?? 0)}
      </div>
    </div>`).join('');
}

function kartuSales(daftar, dipilih) {
  return daftar.map((x) => `
    <div class="kartu-angka ${x.sales_id === dipilih ? 'baris-pilih' : ''}">
      <div class="nama-kartu">${esc(x.nama || '—')}${
        x.kode_sales && x.kode_sales !== x.nama
          ? ` <span class="kode">${esc(x.kode_sales)}</span>` : ''}</div>
      <div class="sel-baris">
        ${sel('Omzet', penuh(x.omzet))}
        ${sel('Margin', marginTeks(x.margin))}
        ${sel('Order', x.jml_order ?? 0)}
        ${sel('Toko/hari', x.rata_toko_per_hari ?? 0, `${x.hari_aktif ?? 0} hari aktif`)}
      </div>
      <div class="ket-kartu">Paling banyak dijual: ${esc(x.barang_teratas || '—')}</div>
    </div>`).join('');
}

/** Satu tempat yang menulis baris barang, supaya pencarian dan muatan
 *  pertama tidak bisa berbeda bentuk. */
function barisBarang(daftar) {
  return daftar.map((x) => `
    <tr>
      <td>${esc(x.barang_nama)}</td>
      <td>${esc(x.kategori_nama || '—')}</td>
      <td class="num">${esc(String(Number(x.qty) || 0))} ${esc(x.satuan || '')}</td>
      <td class="num">${esc(penuh(x.omzet))}</td>
      <td class="num">${esc(marginTeks(x.margin))}</td>
      <td class="num">${esc(String(x.jml_toko ?? 0))}</td>
    </tr>`).join('');
}

export async function gambar(isi, ctx) {
  const { status } = ctx;

  isi.innerHTML = `
    <div class="tab" id="tab-rentang">
      ${RENTANG.map((r) => `<button type="button" data-r="${r.k}"
         class="${r.k === rentangAktif ? 'aktif' : ''}">${esc(r.label)}</button>`).join('')}
    </div>
    <div class="baris" style="margin-bottom:12px">
      <label class="label" for="pilih-sales">Lihat angka milik</label>
      <select id="pilih-sales"><option value="">Semua sales</option></select>
    </div>
    <div id="dasbor"><div class="memuat"><div class="putar"></div>Memuat…</div></div>`;

  const wadah = isi.querySelector('#dasbor');
  const selSales = isi.querySelector('#pilih-sales');

  selSales.addEventListener('change', () => {
    salesAktif = selSales.value || null;
    muat().catch((e) => pesan(e.message, 'salah'));
  });

  isi.querySelector('#tab-rentang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b || b.dataset.r === rentangAktif) return;
    rentangAktif = b.dataset.r;
    isi.querySelectorAll('#tab-rentang button')
      .forEach((x) => x.classList.toggle('aktif', x.dataset.r === rentangAktif));
    muat().catch((e2) => pesan(e2.message, 'salah'));
  });

  async function muat() {
    const r = RENTANG.find((x) => x.k === rentangAktif) || RENTANG[1];
    const { dari, sampai } = rentangTanggal(r.hari);
    wadah.innerHTML = `<div class="memuat"><div class="putar"></div>Memuat…</div>`;

    // Saringan sales dibawa ke SEMUA panggilan, jadi tidak ada angka di
    // layar yang diam-diam masih menghitung seluruh sales.
    const sid = salesAktif;
    const [ringkasRow, deret, sales, barang, kategori, topJual, topTren] = await Promise.all([
      db.rpc('dasbor_ringkas', { p_dari: dari, p_sampai: sampai, p_sales_id: sid }),
      db.rpc('dasbor_deret', { p_dari: dari, p_sampai: sampai, p_satuan: r.satuan, p_sales_id: sid }),
      db.rpc('dasbor_sales', { p_dari: dari, p_sampai: sampai }),
      db.rpc('dasbor_barang', { p_dari: dari, p_sampai: sampai, p_limit: 0, p_sales_id: sid }),
      db.rpc('dasbor_kategori', { p_dari: dari, p_sampai: sampai, p_sales_id: sid }),
      db.rpc('dasbor_barang_tren', { p_dari: dari, p_sampai: sampai, p_satuan: r.satuan, p_sales_id: sid, p_urut: 'omzet', p_limit: 5 }),
      db.rpc('dasbor_barang_tren', { p_dari: dari, p_sampai: sampai, p_satuan: r.satuan, p_sales_id: sid, p_urut: 'tren', p_limit: 5 }),
    ]);

    // Daftar sales diisi sekali, dari hasil yang TIDAK tersaring.
    if (selSales.options.length <= 1 && (sales || []).length) {
      selSales.insertAdjacentHTML('beforeend', sales.map((x) =>
        `<option value="${esc(x.sales_id)}">${esc(x.nama || x.kode_sales || '—')}</option>`).join(''));
      selSales.value = salesAktif || '';
    }

    const s = (Array.isArray(ringkasRow) ? ringkasRow[0] : ringkasRow) || {};
    const omzet = Number(s.omzet) || 0;
    const margin = Number(s.margin) || 0;
    const berHpp = Number(s.omzet_ber_hpp) || 0;
    const cakupan = omzet > 0 ? Math.round((berHpp / omzet) * 100) : 0;
    // Sumbu waktu yang SAMA untuk semua garis, diambil dari deret
    // keseluruhan. Kalau tiap barang memakai periodenya sendiri, dua garis
    // bersebelahan akan punya arti sumbu yang berbeda — dan itu menipu.
    const periode = (deret || []).map((d) => d.periode);
    const jual = rapikanTren(topJual);
    const tren = rapikanTren(topTren);

    const tanpaKategori = (barang || [])
      .filter((x) => !x.kategori_nama || x.kategori_nama === '(tanpa kategori)').length;

    wadah.innerHTML = `
      <div class="ringkas">
        <div class="sel"><div class="lbl">Omzet</div>
          <div class="nilai">${esc(penuh(omzet))}</div></div>
        <div class="sel"><div class="lbl">Margin</div>
          <div class="nilai">${esc(penuh(margin))}</div></div>
      </div>
      <div class="ringkas">
        <div class="sel"><div class="lbl">Jumlah order</div>
          <div class="nilai">${esc(String(s.jml_order ?? 0))}</div></div>
        <div class="sel"><div class="lbl">Rata per order</div>
          <div class="nilai">${esc(penuh(s.rata_order))}</div></div>
      </div>

      ${cakupan < 100 ? `
      <div class="peringatan">
        <b>Margin ini belum lengkap</b>
        HPP baru terisi untuk <b>${cakupan}%</b> dari omzet periode ini, jadi
        angka margin di atas hanya menghitung bagian itu. Lengkapi HPP lewat
        Admin → Barang supaya marginnya utuh.
      </div>` : ''}

      <div class="kartu">
        <div class="judul-bagian">Omzet &amp; margin</div>
        ${grafikBatang(deret || [], r.satuan)}
      </div>

      <div class="kartu">
        <div class="judul-bagian">Sales${sid ? ' — semua, untuk perbandingan' : ''}</div>
        ${(sales || []).length ? `
        <div class="daftar-kartu">${kartuSales(sales, sid)}</div>
        <div class="daftar-tabel grafik-gulir">
          <table class="sheet dasbor-tabel">
            <thead><tr>
              <th style="width:100px">Nama</th>
              <th style="width:100px">Omzet</th>
              <th style="width:100px">Margin</th>
              <th style="width:56px">Order</th>
              <th style="width:88px">Toko/hari</th>
              <th style="width:110px">Paling banyak dijual</th>
            </tr></thead>
            <tbody>
              ${sales.map((x) => `
                <tr class="${x.sales_id === sid ? 'baris-pilih' : ''}">
                  <td><b>${esc(x.nama || '—')}</b>
                    ${x.kode_sales && x.kode_sales !== x.nama
                      ? `<span class="kode">${esc(x.kode_sales)}</span>` : ''}</td>
                  <td class="num">${esc(penuh(x.omzet))}</td>
                  <td class="num">${esc(marginTeks(x.margin))}</td>
                  <td class="num">${esc(String(x.jml_order ?? 0))}</td>
                  <td class="num">${esc(String(x.rata_toko_per_hari ?? 0))}
                    <span class="ket-kecil">${esc(String(x.hari_aktif ?? 0))} hari aktif</span></td>
                  <td>${esc(x.barang_teratas || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="bantuan">
          ${sid ? 'Tabel ini tetap memuat semua sales supaya bisa dibandingkan; yang Anda pilih ditandai. Angka di bagian lain hanya milik sales itu.<br>' : ''}
          <b>Toko/hari</b> = rata-rata berapa toko berbeda yang ada ordernya,
          dihitung hanya pada hari sales itu benar-benar menjual — bukan dibagi
          seluruh hari di rentang ini.
        </div>` : '<div class="kosong-pesan">Belum ada order di rentang ini.</div>'}
      </div>

      ${bagianTren(
        'Barang omzet terbesar',
        'Garis = omzet barang itu di tiap ' + esc(r.satuan) + '. Tiap barang memakai '
        + 'skalanya sendiri, jadi yang dibaca BENTUKNYA — naik, turun, atau sekali ramai lalu diam.',
        jual, periode, (x) => Number(x.omzet) || 0,
        (b) => `<b>${esc(penuh(b.omzet))}</b> · ${esc(String(b.order))} order · `
             + `${esc(String(b.toko))} toko · ${esc(penuh(b.qty))} ${esc(b.satuan)}`)}

      ${bagianTren(
        'Barang paling menyebar',
        'Diurut dari berapa <b>toko berbeda</b> yang memesannya, baru berapa kali dipesan. '
        + 'Garis = jumlah order di tiap ' + esc(r.satuan) + '. '
        + '50 order dari satu toko itu satu pelanggan rajin; 10 order dari 10 toko itu barang yang sedang dicari orang.',
        tren, periode, (x) => Number(x.jml_order) || 0,
        (b) => `<b>${esc(String(b.toko))} toko</b> · ${esc(String(b.order))} order · `
             + `${esc(penuh(b.omzet))}`)}

      <div class="kartu">
        <div class="judul-bagian">Kategori paling banyak dijual</div>
        ${(kategori || []).length ? `
        <div class="daftar-kartu">${kartuKategori(kategori)}</div>
        <div class="daftar-tabel grafik-gulir">
          <table class="sheet dasbor-tabel">
            <thead><tr>
              <th style="width:150px">Kategori</th>
              <th style="width:100px">Omzet</th>
              <th style="width:100px">Margin</th>
              <th style="width:70px">Barang</th>
              <th style="width:56px">Order</th>
            </tr></thead>
            <tbody>
              ${kategori.map((x) => `
                <tr>
                  <td>${esc(x.kategori_nama)}</td>
                  <td class="num">${esc(penuh(x.omzet))}</td>
                  <td class="num">${esc(marginTeks(x.margin))}</td>
                  <td class="num">${esc(String(x.jml_barang ?? 0))}</td>
                  <td class="num">${esc(String(x.jml_order ?? 0))}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${tanpaKategori > 0 ? `
        <div class="peringatan di-bawah">
          <b>Kategori belum diisi</b>
          ${esc(String(tanpaKategori))} dari ${esc(String((barang || []).length))} barang yang
          terjual belum punya kategori, jadi daftar di atas belum bisa dipakai
          mengambil keputusan. Isi kategorinya lewat Admin → Barang (edit massal),
          baru angka ini jadi berarti.
        </div>` : ''}` : '<div class="kosong-pesan">Belum ada order di rentang ini.</div>'}
      </div>

      <div class="kartu">
        <div class="judul-bagian">Seluruh barang yang terjual</div>
        ${(barang || []).length ? `
        <input type="text" id="cari-barang" placeholder="Cari barang atau kategori…"
               autocomplete="off">
        <div class="bantuan" id="hitung-barang">${esc(String(barang.length))} barang berbeda terjual</div>
        <div class="daftar-kartu gulir-tinggi" id="kartu-barang">${kartuBarang(barang)}</div>
        <div class="daftar-tabel grafik-gulir gulir-tinggi">
          <table class="sheet dasbor-tabel">
            <thead><tr>
              <th style="width:150px">Barang</th>
              <th style="width:90px">Kategori</th>
              <th style="width:80px">Terjual</th>
              <th style="width:100px">Omzet</th>
              <th style="width:100px">Margin</th>
              <th style="width:48px">Toko</th>
            </tr></thead>
            <tbody id="isi-barang">${barisBarang(barang)}</tbody>
          </table>
        </div>` : '<div class="kosong-pesan">Belum ada order di rentang ini.</div>'}
      </div>

      <div class="bantuan" style="text-align:center">
        ${esc(dari)} s/d ${esc(sampai)} · nilai penuh:
        omzet ${esc(rupiah(omzet))}, margin ${esc(rupiah(margin))}
      </div>`;

    const kotakCari = wadah.querySelector('#cari-barang');
    if (kotakCari) {
      const isiBarang = wadah.querySelector('#isi-barang');
      const hitung = wadah.querySelector('#hitung-barang');
      kotakCari.addEventListener('input', () => {
        const k = kotakCari.value.trim().toLowerCase();
        const sisa = k
          ? barang.filter((x) => (x.barang_nama || '').toLowerCase().includes(k)
              || (x.kategori_nama || '').toLowerCase().includes(k))
          : barang;
        isiBarang.innerHTML = barisBarang(sisa);
        wadah.querySelector('#kartu-barang').innerHTML = kartuBarang(sisa);
        hitung.textContent = `${sisa.length} barang berbeda terjual`;
      });
    }
  }

  await muat();
}
