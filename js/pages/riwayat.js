// Order milik sendiri: lihat isinya dan tambah catatan.
// Sales TIDAK bisa mengubah atau menghapus order — itu hak admin.
// Kalau ada yang salah, sales menambah catatan, admin yang memperbaiki.

import * as db from '../db.js';
import {
  esc, rupiah, tanggalPendek, pesan, rincianItem, lembar,
} from '../util.js';

const SEKALI = 20;

const PILIH_KOLOM =
  'id,no_pesanan,tanggal,toko_id,toko_nama,catatan,total,' +
  'pesanan_item(urut,barang_id,barang_nama,satuan,qty,harga,harga_per_kg,berat_kg,subtotal),' +
  'pesanan_catatan(id,teks,dibuat_pada)';

export async function gambar(isi, ctx) {
  const { status } = ctx;
  let mulaiDari = 0;
  let habis = false;
  let semua = [];

  isi.innerHTML = `
    <div class="ringkas" id="ringkas"></div>
    <div id="daftar"><div class="memuat"><div class="putar"></div>Memuat order…</div></div>
    <button type="button" class="btn abu" id="btn-lagi" style="display:none">Muat lebih banyak</button>`;

  const elDaftar = isi.querySelector('#daftar');
  const btnLagi = isi.querySelector('#btn-lagi');

  async function ambil() {
    const baris = await db.pilih('pesanan', {
      select: PILIH_KOLOM,
      sales_id: 'eq.' + status.profil.id,
      order: 'tanggal.desc,id.desc',
      offset: mulaiDari,
      limit: SEKALI,
    });
    if (baris.length < SEKALI) habis = true;
    mulaiDari += baris.length;
    semua.push(...baris);
  }

  async function muatUlang() {
    mulaiDari = 0; habis = false; semua = [];
    await ambil();
    gambarSemua();
  }

  function gambarRingkas() {
    const bulan = new Date().toISOString().slice(0, 7);
    const b = semua.filter((p) => String(p.tanggal).startsWith(bulan));
    isi.querySelector('#ringkas').innerHTML = `
      <div class="sel"><div class="lbl">Order bulan ini</div><div class="nilai">${b.length}</div></div>
      <div class="sel"><div class="lbl">Nilai bulan ini</div><div class="nilai">${esc(
        rupiah(b.reduce((s, p) => s + Number(p.total || 0), 0))
      )}</div></div>`;
  }

  function gambarDaftar() {
    if (!semua.length) {
      elDaftar.innerHTML = `<div class="kosong-pesan">
        <span class="ikon">📄</span>Belum ada order.<br>
        Buat order pertama Anda di tab <b>Order</b>.</div>`;
      return;
    }
    elDaftar.innerHTML = semua.map((p) => kartuOrder(p)).join('');
  }

  function gambarSemua() {
    gambarDaftar();
    gambarRingkas();
    btnLagi.style.display = habis ? 'none' : '';
  }

  // ---------------- aksi di dalam kartu ----------------
  elDaftar.addEventListener('click', (e) => {
    const kepala = e.target.closest('.riwayat-kepala');
    if (kepala) {
      const box = elDaftar.querySelector('#isi-' + CSS.escape(kepala.dataset.id));
      if (box) box.hidden = !box.hidden;
      return;
    }

    const tCatatan = e.target.closest('[data-catatan]');
    if (tCatatan) {
      const p = semua.find((x) => String(x.id) === tCatatan.dataset.catatan);
      if (p) bukaTambahCatatan(p, muatUlang);
    }
  });

  btnLagi.addEventListener('click', async () => {
    btnLagi.disabled = true;
    btnLagi.textContent = 'Memuat…';
    try {
      await ambil();
      gambarSemua();
    } catch (err) {
      pesan(err.message || 'Gagal memuat.', 'salah');
    } finally {
      btnLagi.disabled = false;
      btnLagi.textContent = 'Muat lebih banyak';
    }
  });

  await ambil();
  gambarSemua();
}

/* ============================================================
   Satu kartu order
   ============================================================ */
function kartuOrder(p) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
  const catatan = (p.pesanan_catatan || []).slice()
    .sort((a, b) => String(a.dibuat_pada).localeCompare(String(b.dibuat_pada)));

  return `
  <div class="riwayat">
    <button type="button" class="riwayat-kepala" data-id="${esc(p.id)}">
      <span class="kiri">
        <span class="toko">${esc(p.toko_nama)}</span>
        <span class="meta">
          <span>${esc(tanggalPendek(p.tanggal))}</span>
          <span class="kode">${esc(p.no_pesanan)}</span>
          <span>${item.length} barang</span>
        </span>
      </span>
      <span class="uang">${esc(rupiah(p.total))}</span>
    </button>

    <div class="riwayat-isi" id="isi-${esc(p.id)}" hidden>
      <table>${item.map((i) => `<tr>
        <td>${esc(i.barang_nama)}<div class="ket">${esc(rincianItem(i))}</div></td>
        <td>${esc(rupiah(i.subtotal))}</td></tr>`).join('')}</table>

      ${p.catatan ? `<div class="ket" style="margin-top:12px">📝 ${esc(p.catatan)}</div>` : ''}

      ${catatan.length ? `<div class="catatan-daftar">${catatan
        .map((c) => `<div class="catatan-baris">${esc(c.teks)}
          <span class="siapa">Catatan tambahan · ${esc(tanggalPendek(String(c.dibuat_pada).slice(0, 10)))}</span>
        </div>`).join('')}</div>` : ''}

      <button type="button" class="btn abu kecil" data-catatan="${esc(p.id)}"
              style="width:100%;margin-top:14px">+ Tambah catatan</button>
      <div class="bantuan">Order yang sudah tersimpan hanya bisa diubah admin.
        Kalau ada yang salah, tulis di catatan — admin akan melihatnya.</div>
    </div>
  </div>`;
}

/* ============================================================
   Lembar: tambah catatan
   ============================================================ */
function bukaTambahCatatan(p, selesai) {
  const tirai = lembar('Tambah catatan', `
    <div class="bantuan" style="margin:0 0 12px">
      Untuk order <span class="kode">${esc(p.no_pesanan)}</span> — ${esc(p.toko_nama)}.
      Catatan hanya bisa <b>ditambah</b>, tidak bisa dihapus.
    </div>
    <textarea id="c-teks" maxlength="500"
      placeholder="Contoh: minta kirim sore · jumlah semen seharusnya 25 sak"></textarea>
    <div class="bantuan" id="c-sisa">500 huruf tersisa</div>
    <div style="height:14px"></div>
    <button type="button" class="btn" id="c-simpan">Simpan catatan</button>`);

  const ta = tirai.querySelector('#c-teks');
  const sisa = tirai.querySelector('#c-sisa');
  ta.addEventListener('input', () => {
    sisa.textContent = (500 - ta.value.length) + ' huruf tersisa';
  });

  tirai.addEventListener('click', async (e) => {
    if (!e.target.closest('#c-simpan')) return;
    const teks = ta.value.trim();
    if (!teks) { pesan('Catatan masih kosong.', 'salah'); return; }
    const b = tirai.querySelector('#c-simpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      await db.rpc('tambah_catatan', { p_pesanan_id: p.id, p_teks: teks });
      pesan('Catatan ditambahkan.', 'ok');
      tirai.remove();
      await selesai();
    } catch (err) {
      pesan(err.message, 'salah');
      b.disabled = false; b.textContent = 'Simpan catatan';
    }
  });

  setTimeout(() => ta.focus(), 120);
}
