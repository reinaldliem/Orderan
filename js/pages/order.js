// Halaman utama: buat order baru.

import * as db from '../db.js';
import { buatFormOrder } from '../form-order.js';
import { ikon } from '../ikon.js';
import { esc, rupiah, hariIni, tanggalPanjang, pesan, tanya } from '../util.js';

const KUNCI_DRAF = 'order-draf-v2';

export async function gambar(isi, ctx) {
  const { status, segarkanMaster } = ctx;
  await segarkanMaster();

  const tgl = hariIni();
  const uid = status.profil?.id;
  const draf = bacaDraf(tgl, uid);

  // Baris kode batch: tanggal dan kode sales, kecil, di paling atas —
  // seperti kode cetak di pojok karung. Bukan kartu tersendiri.
  const kode = [tanggalPanjang(tgl), status.profil?.kode_sales || status.profil?.nama]
    .filter(Boolean).map(esc).join(' · ');

  isi.innerHTML = `
    <div class="baris-batch">${ikon('tanggal', 15)}<span>${kode}</span></div>
    <div id="slot-form"></div>
    <button type="button" class="btn hijau blok-bawah" id="btn-simpan">
      ${ikon('centang', 20)}Simpan Order
    </button>
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
          uid,   // draf hanya kembali untuk akun yang sama (HP bisa dipakai bergantian)
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
    btn.innerHTML = 'Menyimpan…';
    try {
      const hasil = await db.rpc('buat_pesanan', { p_data: d });
      localStorage.removeItem(KUNCI_DRAF);
      segarkanMaster({ paksa: true }).catch(() => {});   // toko/barang baru dari sales
      tampilkanBerhasil(isi, hasil, ctx);
    } catch (e) {
      pesan(e.message || 'Gagal menyimpan.', 'salah');
    } finally {
      btn.disabled = false;
      btn.innerHTML = ikon('centang', 20) + 'Simpan Order';
    }
  });
}

/**
 * Draf sengaja tetap di localStorage (bukan per tab seperti sesi): kalau
 * browser HP menutup tab saat sales mengetik order di depan pelanggan,
 * isiannya kembali setelah masuk lagi. Tapi hanya untuk AKUN YANG SAMA —
 * draf akun lain di HP yang sama tidak pernah ditampilkan.
 */
function bacaDraf(tgl, uid) {
  try {
    const d = JSON.parse(localStorage.getItem(KUNCI_DRAF) || 'null');
    if (!d || d.tgl !== tgl || !uid || d.uid !== uid) return null;
    const adaIsi = d.toko || (d.item || []).some((i) => i.barang_nama || i.qty);
    return adaIsi ? d : null;
  } catch {
    return null;
  }
}

function tampilkanBerhasil(isi, hasil, ctx) {
  // Order yang selesai dicap, bukan diberi tanda centang hijau raksasa:
  // nomornya distensil besar, totalnya duduk di blok terbalik.
  isi.innerHTML = `
    <div class="tercetak">
      <div class="tercetak-cap">${ikon('centang', 22)}<span>Tersimpan</span></div>
      <div class="tercetak-no">${esc(hasil.no_pesanan)}</div>
      <div class="total-kotak">
        <span class="lbl">Total order</span>
        <span class="nilai">${esc(rupiah(hasil.total))}</span>
      </div>
      <button type="button" class="btn" id="btn-lagi">${ikon('tambah', 20)}Buat order lagi</button>
      <div style="height:10px"></div>
      <a class="btn abu" href="#/riwayat">Lihat order saya</a>
    </div>`;

  isi.querySelector('#btn-lagi').addEventListener('click', () => gambar(isi, ctx));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  pesan('Order ' + hasil.no_pesanan + ' tersimpan.', 'ok');
}
