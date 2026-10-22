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

function tanggalISO(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function rentangTanggal(hari) {
  const sampai = new Date();
  const dari = new Date(sampai.getTime() - (hari - 1) * 86400000);
  return { dari: tanggalISO(dari), sampai: tanggalISO(sampai) };
}

/** Angka uang yang dipadatkan untuk label grafik: 12.210.000 -> 12,2 jt */
function padat(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' jt';
  if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + ' rb';
  return String(Math.round(v));
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

  const L = 44, K = 8, A = 14, B = 26;          // tepi kiri, kanan, atas, bawah
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
              font-weight="700">${esc(padat(puncak * f))}</text>`;
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

export async function gambar(isi, ctx) {
  const { status } = ctx;

  isi.innerHTML = `
    <div class="tab" id="tab-rentang">
      ${RENTANG.map((r) => `<button type="button" data-r="${r.k}"
         class="${r.k === rentangAktif ? 'aktif' : ''}">${esc(r.label)}</button>`).join('')}
    </div>
    <div id="dasbor"><div class="memuat"><div class="putar"></div>Memuat…</div></div>`;

  const wadah = isi.querySelector('#dasbor');

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

    const [ringkasRow, deret, sales, barang] = await Promise.all([
      db.rpc('dasbor_ringkas', { p_dari: dari, p_sampai: sampai }),
      db.rpc('dasbor_deret', { p_dari: dari, p_sampai: sampai, p_satuan: r.satuan }),
      db.rpc('dasbor_sales', { p_dari: dari, p_sampai: sampai }),
      db.rpc('dasbor_barang', { p_dari: dari, p_sampai: sampai, p_limit: 12 }),
    ]);

    const s = (Array.isArray(ringkasRow) ? ringkasRow[0] : ringkasRow) || {};
    const omzet = Number(s.omzet) || 0;
    const margin = Number(s.margin) || 0;
    const berHpp = Number(s.omzet_ber_hpp) || 0;
    const cakupan = omzet > 0 ? Math.round((berHpp / omzet) * 100) : 0;

    wadah.innerHTML = `
      <div class="ringkas">
        <div class="sel"><div class="lbl">Omzet</div>
          <div class="nilai">${esc(padat(omzet))}</div></div>
        <div class="sel"><div class="lbl">Margin</div>
          <div class="nilai">${esc(padat(margin))}</div></div>
      </div>
      <div class="ringkas">
        <div class="sel"><div class="lbl">Jumlah order</div>
          <div class="nilai">${esc(String(s.jml_order ?? 0))}</div></div>
        <div class="sel"><div class="lbl">Rata per order</div>
          <div class="nilai">${esc(padat(s.rata_order))}</div></div>
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
        <div class="judul-bagian">Sales</div>
        ${(sales || []).length ? `
        <div class="grafik-gulir">
          <table class="sheet dasbor-tabel">
            <thead><tr>
              <th style="min-width:130px">Nama</th>
              <th style="min-width:100px">Omzet</th>
              <th style="min-width:100px">Margin</th>
              <th style="min-width:70px">Order</th>
              <th style="min-width:110px">Toko/hari</th>
              <th style="min-width:190px">Paling banyak dijual</th>
            </tr></thead>
            <tbody>
              ${sales.map((x) => `
                <tr>
                  <td><b>${esc(x.nama || '—')}</b>
                    ${x.kode_sales ? `<span class="kode">${esc(x.kode_sales)}</span>` : ''}</td>
                  <td class="num">${esc(padat(x.omzet))}</td>
                  <td class="num">${esc(padat(x.margin))}</td>
                  <td class="num">${esc(String(x.jml_order ?? 0))}</td>
                  <td class="num">${esc(String(x.rata_toko_per_hari ?? 0))}
                    <span class="ket-kecil">${esc(String(x.hari_aktif ?? 0))} hari aktif</span></td>
                  <td>${esc(x.barang_teratas || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="bantuan">
          <b>Toko/hari</b> = rata-rata berapa toko berbeda yang ada ordernya,
          dihitung hanya pada hari sales itu benar-benar menjual — bukan dibagi
          seluruh hari di rentang ini.
        </div>` : '<div class="kosong-pesan">Belum ada order di rentang ini.</div>'}
      </div>

      <div class="kartu">
        <div class="judul-bagian">Barang paling laku</div>
        ${(barang || []).length ? `
        <div class="grafik-gulir">
          <table class="sheet dasbor-tabel">
            <thead><tr>
              <th style="min-width:200px">Barang</th>
              <th style="min-width:110px">Terjual</th>
              <th style="min-width:100px">Omzet</th>
              <th style="min-width:100px">Margin</th>
            </tr></thead>
            <tbody>
              ${barang.map((x) => `
                <tr>
                  <td>${esc(x.barang_nama)}</td>
                  <td class="num">${esc(String(Number(x.qty) || 0))} ${esc(x.satuan || '')}</td>
                  <td class="num">${esc(padat(x.omzet))}</td>
                  <td class="num">${esc(padat(x.margin))}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<div class="kosong-pesan">Belum ada order di rentang ini.</div>'}
      </div>

      <div class="bantuan" style="text-align:center">
        ${esc(dari)} s/d ${esc(sampai)} · nilai penuh:
        omzet ${esc(rupiah(omzet))}, margin ${esc(rupiah(margin))}
      </div>`;
  }

  await muat();
}
