// Halaman utama: buat order baru.

import * as db from '../db.js';
import { buatFormOrder } from '../form-order.js';
import { esc, rupiah, hariIni, tanggalPanjang, pesan, tanya } from '../util.js';

const KUNCI_DRAF = 'order-draf-v2';

export async function gambar(isi, ctx) {
  const { status, segarkanMaster } = ctx;
  await segarkanMaster();

  const tgl = hariIni();
  const draf = bacaDraf(tgl);

  isi.innerHTML = `
    <div class="kartu rapat">
      <div class="judul-bagian">Tanggal order</div>
      <div style="font-size:17px;font-weight:700;letter-spacing:-.02em">
        📅 ${esc(tanggalPanjang(tgl))}
      </div>
      <div class="bantuan">Terisi otomatis hari ini.</div>
    </div>
    <div id="slot-form"></div>
    <button type="button" class="btn hijau blok-bawah" id="btn-simpan">✔ Simpan Order</button>
    <div class="bantuan" style="text-align:center;margin-top:12px">
      Isian tersimpan sementara di HP — aman kalau aplikasi tertutup.
    </div>`;

  // ---------------- draf ----------------
  // Dideklarasikan SEBELUM form dibuat: buatFormOrder() memanggil
  // saatUbah() sekali saat dibangun, jadi `jam` harus sudah ada.
  let jam = null;
  function simpanDraf() {
    clearTimeout(jam);
    jam = setTimeout(() => {
      try {
        const d = form.baca();
        const adaIsi = d.toko_nama || d.item.some((i) => i.barang_nama || i.qty);
        if (!adaIsi) { localStorage.removeItem(KUNCI_DRAF); return; }
        localStorage.setItem(KUNCI_DRAF, JSON.stringify({
          tgl,
          toko: d.toko_id || d.toko_nama ? { id: d.toko_id, nama: d.toko_nama } : null,
          catatan: d.catatan,
          item: d.item,
        }));
      } catch { /* abaikan */ }
    }, 250);
  }

  const form = buatFormOrder({ status, awal: draf, saatUbah: simpanDraf });
  isi.querySelector('#slot-form').appendChild(form.el);

  // ---------------- simpan ----------------
  const btn = isi.querySelector('#btn-simpan');
  btn.addEventListener('click', async () => {
    const keliru = form.salah();
    if (keliru) {
      pesan(keliru, 'salah');
      if (keliru.includes('toko')) form.fokusToko();
      return;
    }

    const d = form.baca();
    const total = form.total();
    if (!(await tanya('Simpan order ini?',
      `${d.toko_nama} · ${d.item.length} barang · total ${rupiah(total)}`, 'Ya, simpan'))) return;

    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
      const hasil = await db.rpc('buat_pesanan', { p_data: d });
      localStorage.removeItem(KUNCI_DRAF);
      segarkanMaster({ paksa: true }).catch(() => {});   // toko/barang baru dari sales
      tampilkanBerhasil(isi, hasil, ctx);
    } catch (e) {
      pesan(e.message || 'Gagal menyimpan.', 'salah');
    } finally {
      btn.disabled = false;
      btn.textContent = '✔ Simpan Order';
    }
  });
}

function bacaDraf(tgl) {
  try {
    const d = JSON.parse(localStorage.getItem(KUNCI_DRAF) || 'null');
    if (!d || d.tgl !== tgl) return null;
    const adaIsi = d.toko || (d.item || []).some((i) => i.barang_nama || i.qty);
    return adaIsi ? d : null;
  } catch {
    return null;
  }
}

function tampilkanBerhasil(isi, hasil, ctx) {
  isi.innerHTML = `
    <div class="kartu" style="text-align:center;padding:30px 18px">
      <div style="font-size:50px;line-height:1">✅</div>
      <h2 style="font-size:20px;margin:12px 0 6px">Order tersimpan</h2>
      <p style="color:var(--teks-2);margin:0 0 20px;font-size:14.5px;line-height:1.6">
        Nomor order <span class="kode">${esc(hasil.no_pesanan)}</span><br>
        Total <b style="color:var(--teks)">${esc(rupiah(hasil.total))}</b>
      </p>
      <button type="button" class="btn hijau" id="btn-lagi">+ Buat order lagi</button>
      <div style="height:10px"></div>
      <a class="btn abu" href="#/riwayat" style="text-decoration:none">Lihat order saya</a>
    </div>`;

  isi.querySelector('#btn-lagi').addEventListener('click', () => gambar(isi, ctx));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  pesan('Order ' + hasil.no_pesanan + ' tersimpan.', 'ok');
}
