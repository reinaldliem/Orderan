// Order milik sendiri: lihat, tambah catatan, ajukan perubahan/pembatalan.
// Sales TIDAK bisa mengubah atau menghapus order langsung — semua lewat pengajuan.

import * as db from '../db.js';
import { buatFormOrder, tabelRingkas } from '../form-order.js';
import {
  esc, rupiah, tanggalPendek, pesan, tanya, rincianItem, lembar,
} from '../util.js';

const SEKALI = 20;

const PILIH_KOLOM =
  'id,no_pesanan,tanggal,toko_id,toko_nama,catatan,total,' +
  'pesanan_item(urut,barang_id,barang_nama,satuan,qty,harga,harga_per_kg,berat_kg,subtotal),' +
  'pesanan_catatan(id,teks,dibuat_pada),' +
  'pengajuan(id,no_pengajuan,jenis,status,alasan,catatan_admin,usulan,dibuat_pada)';

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
    const nunggu = semua.filter((p) => pengajuanTerakhir(p)?.status === 'pending').length;
    isi.querySelector('#ringkas').innerHTML = `
      <div class="sel"><div class="lbl">Order bulan ini</div><div class="nilai">${b.length}</div></div>
      <div class="sel"><div class="lbl">Nilai bulan ini</div><div class="nilai">${esc(
        rupiah(b.reduce((s, p) => s + Number(p.total || 0), 0))
      )}</div></div>
      ${nunggu ? `<div class="sel"><div class="lbl">Pengajuan</div>
        <div class="nilai" style="color:var(--tunggu)">${nunggu}</div></div>` : ''}`;
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

  function gambarSemua() { gambarDaftar(); gambarRingkas(); btnLagi.style.display = habis ? 'none' : ''; }

  // ---------------- aksi di dalam kartu ----------------
  elDaftar.addEventListener('click', async (e) => {
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
      return;
    }

    const tUbah = e.target.closest('[data-ajukan-ubah]');
    if (tUbah) {
      const p = semua.find((x) => String(x.id) === tUbah.dataset.ajukanUbah);
      if (p) bukaAjukanUbah(p, status, muatUlang);
      return;
    }

    const tHapus = e.target.closest('[data-ajukan-hapus]');
    if (tHapus) {
      const p = semua.find((x) => String(x.id) === tHapus.dataset.ajukanHapus);
      if (p) bukaAjukanHapus(p, muatUlang);
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
function pengajuanTerakhir(p) {
  const d = (p.pengajuan || []).slice()
    .sort((a, b) => String(b.dibuat_pada).localeCompare(String(a.dibuat_pada)));
  return d[0] || null;
}

const TANDA = {
  pending:   { kelas: 'tunggu', teks: 'Menunggu admin' },
  disetujui: { kelas: 'setuju', teks: 'Perubahan disetujui' },
  ditolak:   { kelas: 'tolak',  teks: 'Pengajuan ditolak' },
};

function kartuOrder(p) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
  const catatan = (p.pesanan_catatan || []).slice()
    .sort((a, b) => String(a.dibuat_pada).localeCompare(String(b.dibuat_pada)));
  const pg = pengajuanTerakhir(p);
  const t = pg ? TANDA[pg.status] : null;
  const nunggu = pg?.status === 'pending';

  return `
  <div class="riwayat">
    <button type="button" class="riwayat-kepala" data-id="${esc(p.id)}">
      <span class="kiri">
        <span class="toko">${esc(p.toko_nama)}</span>
        <span class="meta">
          <span>${esc(tanggalPendek(p.tanggal))}</span>
          <span class="kode">${esc(p.no_pesanan)}</span>
          <span>${item.length} barang</span>
          ${t ? `<span class="tanda ${t.kelas}">${esc(t.teks)}</span>` : ''}
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

      ${pg ? kotakPengajuan(pg) : ''}

      <div class="tombol-baris" style="margin-top:14px">
        <button type="button" class="btn abu kecil" data-catatan="${esc(p.id)}"
                style="width:100%">+ Catatan</button>
        ${nunggu ? '' : `
        <button type="button" class="btn garis kecil" data-ajukan-ubah="${esc(p.id)}"
                style="width:100%">Ajukan ubah</button>`}
      </div>
      ${nunggu ? '' : `
      <button type="button" class="btn abu kecil" data-ajukan-hapus="${esc(p.id)}"
              style="width:100%;margin-top:8px;color:var(--merah)">Ajukan pembatalan order</button>`}
      <div class="bantuan">Order yang sudah tersimpan hanya bisa diubah admin.
        Ajukan perubahannya di sini, admin yang menyetujui.</div>
    </div>
  </div>`;
}

function kotakPengajuan(pg) {
  const kelas = pg.status === 'disetujui' ? 'setuju' : pg.status === 'ditolak' ? 'tolak' : '';
  const judul = {
    pending: 'Pengajuan menunggu keputusan admin',
    disetujui: 'Pengajuan sudah disetujui',
    ditolak: 'Pengajuan ditolak admin',
  }[pg.status];
  const jenis = pg.jenis === 'hapus' ? 'Pembatalan order' : 'Perubahan isi order';

  return `
  <div class="pengajuan-kotak ${kelas}">
    <b>${esc(judul)}</b>
    ${esc(jenis)} · <span class="kode">${esc(pg.no_pengajuan)}</span>
    ${pg.alasan ? `<div style="margin-top:6px">Alasan Anda: ${esc(pg.alasan)}</div>` : ''}
    ${pg.catatan_admin ? `<div style="margin-top:6px">Catatan admin: ${esc(pg.catatan_admin)}</div>` : ''}
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
      placeholder="Contoh: minta kirim sore, nota atas nama pemilik…"></textarea>
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

/* ============================================================
   Lembar: ajukan perubahan isi order
   ============================================================ */
function bukaAjukanUbah(p, status, selesai) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);

  const tirai = lembar('Ajukan perubahan order', `
    <div class="peringatan">
      <b>Order belum berubah sampai admin menyetujui</b>
      Ubah isinya di bawah seperti biasa, lalu kirim. Admin akan melihat
      perbandingan sebelum dan sesudah.
    </div>
    <div class="kolom" style="background:var(--permukaan-2);border-radius:var(--r-kecil);padding:12px;margin-bottom:14px">
      <div class="judul-bagian">Isi sekarang</div>
      <div class="banding">${tabelRingkas(item)}</div>
    </div>
    <div id="a-form"></div>
    <div class="kartu" style="box-shadow:none;padding:0;margin:14px 0 0">
      <label class="label" for="a-alasan">Alasan perubahan</label>
      <textarea id="a-alasan" maxlength="300"
        placeholder="Contoh: pelanggan menambah 5 sak semen"></textarea>
    </div>
    <div style="height:14px"></div>
    <button type="button" class="btn" id="a-kirim">Kirim pengajuan ke admin</button>`);

  const form = buatFormOrder({
    status,
    awal: {
      toko: { id: p.toko_id, nama: p.toko_nama },
      catatan: p.catatan || '',
      item,
    },
  });
  tirai.querySelector('#a-form').appendChild(form.el);

  tirai.addEventListener('click', async (e) => {
    if (!e.target.closest('#a-kirim')) return;
    const keliru = form.salah();
    if (keliru) { pesan(keliru, 'salah'); return; }

    const usulan = form.baca();
    const alasan = tirai.querySelector('#a-alasan').value.trim();
    if (!alasan) { pesan('Tulis dulu alasan perubahannya.', 'salah'); return; }

    const b = tirai.querySelector('#a-kirim');
    b.disabled = true; b.textContent = 'Mengirim…';
    try {
      const h = await db.rpc('ajukan_perubahan', {
        p_pesanan_id: p.id, p_jenis: 'ubah', p_alasan: alasan, p_usulan: usulan,
      });
      pesan('Pengajuan ' + h.no_pengajuan + ' terkirim. Menunggu admin.', 'ok');
      tirai.remove();
      await selesai();
    } catch (err) {
      pesan(err.message, 'salah');
      b.disabled = false; b.textContent = 'Kirim pengajuan ke admin';
    }
  });
}

/* ============================================================
   Lembar: ajukan pembatalan
   ============================================================ */
function bukaAjukanHapus(p, selesai) {
  const tirai = lembar('Ajukan pembatalan order', `
    <div class="peringatan">
      <b>Order tidak langsung terhapus</b>
      Admin yang memutuskan. Order <span class="kode">${esc(p.no_pesanan)}</span>
      (${esc(p.toko_nama)}, ${esc(rupiah(p.total))}) tetap berlaku sampai disetujui.
    </div>
    <label class="label" for="h-alasan">Alasan pembatalan</label>
    <textarea id="h-alasan" maxlength="300"
      placeholder="Contoh: pelanggan membatalkan, salah toko"></textarea>
    <div style="height:14px"></div>
    <button type="button" class="btn merah" id="h-kirim">Kirim pengajuan pembatalan</button>`);

  tirai.addEventListener('click', async (e) => {
    if (!e.target.closest('#h-kirim')) return;
    const alasan = tirai.querySelector('#h-alasan').value.trim();
    if (!alasan) { pesan('Tulis dulu alasan pembatalannya.', 'salah'); return; }
    if (!(await tanya('Kirim pengajuan pembatalan?',
      'Admin akan memutuskan. Order belum terhapus.', 'Ya, kirim'))) return;

    const b = tirai.querySelector('#h-kirim');
    b.disabled = true; b.textContent = 'Mengirim…';
    try {
      const h = await db.rpc('ajukan_perubahan', {
        p_pesanan_id: p.id, p_jenis: 'hapus', p_alasan: alasan,
      });
      pesan('Pengajuan ' + h.no_pengajuan + ' terkirim.', 'ok');
      tirai.remove();
      await selesai();
    } catch (err) {
      pesan(err.message, 'salah');
      b.disabled = false; b.textContent = 'Kirim pengajuan pembatalan';
    }
  });
}
