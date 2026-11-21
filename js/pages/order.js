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

  // .buat-order: di komputer (mode desktop admin) form disusun dua kolom —
  // hanya di halaman ini, bukan di lembar "Ubah order" yang memakai form sama.
  isi.innerHTML = `
    <div class="buat-order">
    <div class="baris-batch">${ikon('tanggal', 15)}<span>${kode}</span></div>
    <div id="slot-form"></div>
    <button type="button" class="btn hijau blok-bawah" id="btn-simpan">
      ${ikon('centang', 20)}Simpan Order
    </button>
    <div class="bantuan" style="text-align:center;margin-top:12px">
      Isian tersimpan sementara di HP — aman kalau aplikasi tertutup.
    </div>
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
          cash: d.cash,
          item: d.item,
        }));
      } catch { /* abaikan */ }
    }, 250);
  }

  // ---------------- tambah ke order tadi ----------------
  // Sales yang lupa satu barang dulu membuat order BARU ke toko yang sama
  // (50 kunjungan jadi 105 order, Okt–Nov 2026). Kalau hari ini sudah ada
  // order ke toko itu yang belum dinotakan admin, sales boleh memilih
  // menambahkan barangnya ke order itu. Admin diberi tahu lewat lonceng.
  let target = null;        // order hari ini yang masih boleh ditambah
  let modeTambah = false;
  let slotTadi = null;
  let nomorCek = 0;

  function gambarTadi() {
    if (!slotTadi) return;
    if (!target) { slotTadi.innerHTML = ''; perbaruiTombol(); return; }
    const n = (target.pesanan_item || []).length;
    slotTadi.innerHTML = `
      <div class="order-tadi">
        <div class="order-tadi-ket">Hari ini sudah ada order ke toko ini:
          <b>${esc(target.no_pesanan)}</b> · ${n} barang · ${esc(rupiah(target.total))}</div>
        <div class="saring" role="group" aria-label="Simpan sebagai">
          <button type="button" data-tadi="0" class="${modeTambah ? '' : 'aktif'}" aria-pressed="${!modeTambah}">Order baru</button>
          <button type="button" data-tadi="1" class="${modeTambah ? 'aktif' : ''}" aria-pressed="${modeTambah}">Tambah ke order itu</button>
        </div>
        ${modeTambah ? `<div class="bantuan">Barang di bawah masuk ke ${esc(target.no_pesanan)}.
          Admin mendapat pemberitahuan barang tambahan.</div>` : ''}
      </div>`;
    perbaruiTombol();
  }

  async function cekOrderTadi(t, slot) {
    slotTadi = slot;
    const no = ++nomorCek;
    target = null;
    modeTambah = false;
    gambarTadi();
    if (!t?.id || !uid) return;
    try {
      const rows = await db.pilih('pesanan', {
        select: 'id,no_pesanan,total,pesanan_item(id,nota_dibuat,no_nota)',
        sales_id: 'eq.' + uid,
        toko_id: 'eq.' + t.id,
        tanggal: 'eq.' + hariIni(),
        order: 'id.desc',
        limit: 5,
      });
      if (no !== nomorCek) return;   // toko sudah diganti lagi
      target = rows.find((p) => !(p.pesanan_item || []).some((i) => i.nota_dibuat || i.no_nota)) || null;
      gambarTadi();
    } catch { /* tanpa sinyal: simpan sebagai order baru seperti biasa */ }
  }

  const form = buatFormOrder({
    status,
    awal: draf,
    saatUbah: simpanDraf,
    saatToko: cekOrderTadi,
    ambilHargaTerakhir: (tokoId) => db.rpc('harga_terakhir', { p_toko_id: tokoId }),
  });
  isi.querySelector('#slot-form').appendChild(form.el);

  // dipasang di .buat-order (dibuat ulang tiap halaman digambar), bukan di
  // #isi — supaya 'Buat order lagi' tidak menumpuk pendengar lama
  isi.querySelector('.buat-order').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tadi]');
    if (!b) return;
    const mau = b.dataset.tadi === '1';
    if (mau === modeTambah) return;
    modeTambah = mau;
    gambarTadi();
  });

  // ---------------- simpan ----------------
  const btn = isi.querySelector('#btn-simpan');
  function perbaruiTombol() {
    btn.innerHTML = modeTambah && target
      ? `${ikon('tambah', 20)}Tambah ke ${esc(target.no_pesanan)}`
      : `${ikon('centang', 20)}Simpan Order`;
  }
  btn.addEventListener('click', async () => {
    const keliru = form.salah();
    if (keliru) {
      pesan(keliru, 'salah');
      if (keliru.includes('toko')) form.fokusToko();
      return;
    }

    const d = form.baca();
    const total = form.total();
    // Harga Rp 0 hampir selalu lupa diisi (ratusan barang baru belum berharga).
    // Tidak diblokir — bisa saja barang bonus — tapi harus disadari dulu.
    const nol = form.hargaNol();
    if (nol.length && !(await tanya('Ada harga Rp 0',
      `${nol.join(', ')} — harganya masih Rp 0. Kalau lupa, tekan Batal lalu isi harganya.`,
      'Tetap simpan'))) return;
    const tambah = modeTambah && target ? target : null;
    if (!(await tanya(
      tambah ? `Tambahkan ke ${tambah.no_pesanan}?` : 'Simpan order ini?',
      tambah
        ? `${d.item.length} barang · ${rupiah(total)} ditambahkan ke order tadi. Admin mendapat pemberitahuan.`
        : `${d.toko_nama} · ${d.item.length} barang · total ${rupiah(total)}`,
      tambah ? 'Ya, tambahkan' : 'Ya, simpan'))) return;

    btn.disabled = true;
    btn.innerHTML = 'Menyimpan…';
    try {
      let hasil;
      if (tambah) {
        try {
          hasil = { ...(await db.rpc('tambah_ke_pesanan', { p_id: tambah.id, p_data: d })), ditambahkan: true };
        } catch (e) {
          // Admin baru saja mulai membuat notanya (atau tanggal sudah berganti):
          // tawarkan simpan sebagai order baru, isian tidak hilang.
          if (!/order baru/i.test(e.message || '')) throw e;
          const sebab = String(e.message).replace(/\s*—\s*simpan sebagai order baru\.?\s*$/i, '.');
          if (!(await tanya('Tidak bisa ditambahkan', `${sebab} Simpan sebagai order baru?`, 'Simpan order baru'))) return;
          hasil = await db.rpc('buat_pesanan', { p_data: d });
        }
      } else {
        hasil = await db.rpc('buat_pesanan', { p_data: d });
      }
      localStorage.removeItem(KUNCI_DRAF);
      segarkanMaster({ paksa: true }).catch(() => {});   // toko/barang baru dari sales
      tampilkanBerhasil(isi, hasil, ctx);
    } catch (e) {
      pesan(e.message || 'Gagal menyimpan.', 'salah');
    } finally {
      btn.disabled = false;
      perbaruiTombol();
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
  // Admin tidak punya halaman Riwayat: ordernya terlihat di Admin → Order.
  const peran = ctx.status?.profil?.peran;
  const adminkah = peran === 'admin' || peran === 'ceo';
  // Order yang selesai dicap, bukan diberi tanda centang hijau raksasa:
  // nomornya distensil besar, totalnya duduk di blok terbalik.
  isi.innerHTML = `
    <div class="tercetak">
      <div class="tercetak-cap">${ikon('centang', 22)}<span>${hasil.ditambahkan ? 'Ditambahkan' : 'Tersimpan'}</span></div>
      <div class="tercetak-no">${esc(hasil.no_pesanan)}</div>
      ${hasil.ditambahkan ? `<div class="bantuan" style="text-align:center">${esc(String(hasil.ditambah))}
        barang masuk ke order ini. Admin sudah diberi tahu.</div>` : ''}
      <div class="total-kotak">
        <span class="lbl">Total order</span>
        <span class="nilai">${esc(rupiah(hasil.total))}</span>
      </div>
      <button type="button" class="btn" id="btn-lagi">${ikon('tambah', 20)}Buat order lagi</button>
      <div style="height:10px"></div>
      ${adminkah
        ? '<a class="btn abu" href="#/admin">Lihat di meja order</a>'
        : '<a class="btn abu" href="#/riwayat">Lihat order saya</a>'}
    </div>`;

  isi.querySelector('#btn-lagi').addEventListener('click', () => gambar(isi, ctx));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  pesan(hasil.ditambahkan
    ? `${hasil.ditambah} barang ditambahkan ke ${hasil.no_pesanan}.`
    : 'Order ' + hasil.no_pesanan + ' tersimpan.', 'ok');
}
