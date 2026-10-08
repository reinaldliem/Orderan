// Order milik sendiri: lihat isinya, status notanya, dan tambah catatan.
// Sales TIDAK bisa mengubah atau menghapus order — itu hak admin.
// Kalau ada yang salah, sales menambah catatan, admin yang memperbaiki.
//
// Status nota diisi admin di Admin → Order (per barang). Di sini sales hanya
// MELIHATNYA: apakah ordernya masih pending atau sudah dibuatkan nota.

import * as db from '../db.js';
import { ikon } from '../ikon.js';
import {
  esc, rupiah, tanggalPendek, hariIni, pesan, rincianItem, lembar,
} from '../util.js';

const PILIH_KOLOM =
  'id,no_pesanan,tanggal,toko_id,toko_nama,catatan,total,' +
  'pesanan_item(urut,barang_id,barang_nama,satuan,qty,harga,harga_per_kg,berat_kg,subtotal,' +
  'nota_dibuat,no_nota),' +
  'pesanan_catatan(id,teks,dibuat_pada,dibaca_pada)';

// Dibuka di HARIAN (pemilik): setiap hari baru riwayat mulai kosong lagi;
// order sebelumnya tetap bisa dilihat lewat tombol mundur / Mingguan / Bulanan.
// Pilihan bertahan selama tab ini terbuka (pindah ke tab Order lalu kembali
// tidak mengembalikannya ke awal).
const pilihan = { jenis: 'hari', geser: 0, status: 'semua' };

/* ---------------- periode: satu hari, Senin–Minggu, atau satu bulan kalender ---------------- */
const FMT_HARI = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
});
const FMT_BULAN = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FMT_TGL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const FMT_JAM = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

const keTgl = (iso) => new Date(iso + 'T00:00:00Z');
const keIso = (d) => d.toISOString().slice(0, 10);

function hitungPeriode(jenis, geser) {
  const hari = keTgl(hariIni());   // tanggal WIB hari ini
  if (jenis === 'hari') {
    const d = new Date(hari);
    d.setUTCDate(hari.getUTCDate() - geser);
    return {
      dari: keIso(d), sampai: keIso(d),
      judul: FMT_HARI.format(d),
      sebutan: geser === 0 ? 'Hari ini' : geser === 1 ? 'Kemarin' : `${geser} hari lalu`,
    };
  }
  if (jenis === 'minggu') {
    const senin = new Date(hari);
    senin.setUTCDate(hari.getUTCDate() - ((hari.getUTCDay() + 6) % 7) - 7 * geser);
    const minggu = new Date(senin);
    minggu.setUTCDate(senin.getUTCDate() + 6);
    const kiri = senin.getUTCMonth() === minggu.getUTCMonth()
      ? String(senin.getUTCDate()) : FMT_TGL.format(senin);
    return {
      dari: keIso(senin), sampai: keIso(minggu),
      judul: `${kiri} – ${FMT_TGL.format(minggu)} ${minggu.getUTCFullYear()}`,
      sebutan: geser === 0 ? 'Minggu ini' : geser === 1 ? 'Minggu lalu' : `${geser} minggu lalu`,
    };
  }
  const awal = new Date(Date.UTC(hari.getUTCFullYear(), hari.getUTCMonth() - geser, 1));
  const akhir = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 0));
  return {
    dari: keIso(awal), sampai: keIso(akhir),
    judul: FMT_BULAN.format(awal),
    sebutan: geser === 0 ? 'Bulan ini' : geser === 1 ? 'Bulan lalu' : `${geser} bulan lalu`,
  };
}

/**
 * Status nota satu ORDER, dari status tiap barangnya. Barang dalam satu order
 * bisa beda perusahaan -> beda nota, jadi bisa sebagian sudah.
 *   pending  = belum ada barang yang dibuat notanya
 *   sebagian = sebagian barang sudah (masih termasuk "Pending" di saringan)
 *   sudah    = semua barang sudah dibuat notanya
 */
function statusNota(p) {
  const item = p.pesanan_item || [];
  const sudah = item.filter((i) => i.nota_dibuat).length;
  if (item.length && sudah === item.length) return { kunci: 'sudah', teks: 'Sudah nota' };
  if (sudah > 0) return { kunci: 'sebagian', teks: `Nota ${sudah}/${item.length}` };
  return { kunci: 'pending', teks: 'Pending' };
}

export async function gambar(isi, ctx) {
  const { status } = ctx;
  let semua = [];        // order pada periode terpilih
  let nomorTarik = 0;    // tarikan yang terlambat datang tidak boleh menimpa yang baru

  isi.innerHTML = `
    <div class="kartu saring-riwayat">
      <div class="saring" id="r-jenis" role="group" aria-label="Lihat per">
        <button type="button" data-jenis="hari">Harian</button>
        <button type="button" data-jenis="minggu">Mingguan</button>
        <button type="button" data-jenis="bulan">Bulanan</button>
      </div>
      <div class="periode">
        <button type="button" class="geser" id="r-mundur" aria-label="Periode sebelumnya">${ikon('mundur', 22)}</button>
        <div class="periode-teks" aria-live="polite">
          <b id="r-judul"></b>
          <span id="r-sebutan"></span>
        </div>
        <button type="button" class="geser" id="r-maju" aria-label="Periode berikutnya">${ikon('maju', 22)}</button>
      </div>
      <div class="saring" id="r-status" role="group" aria-label="Status nota">
        <button type="button" data-status="semua">Semua</button>
        <button type="button" data-status="pending">Pending</button>
        <button type="button" data-status="sudah">Sudah</button>
      </div>
    </div>
    <div class="ringkas tiga" id="ringkas"></div>
    <div id="daftar"><div class="memuat"><div class="putar"></div>Memuat order…</div></div>`;

  const elDaftar = isi.querySelector('#daftar');
  const btnMundur = isi.querySelector('#r-mundur');
  const btnMaju = isi.querySelector('#r-maju');

  function tandaiPilihan() {
    isi.querySelectorAll('#r-jenis [data-jenis]').forEach((b) => {
      const aktif = b.dataset.jenis === pilihan.jenis;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-pressed', String(aktif));
    });
    isi.querySelectorAll('#r-status [data-status]').forEach((b) => {
      const aktif = b.dataset.status === pilihan.status;
      b.classList.toggle('aktif', aktif);
      b.setAttribute('aria-pressed', String(aktif));
    });
    const per = hitungPeriode(pilihan.jenis, pilihan.geser);
    isi.querySelector('#r-judul').textContent = per.judul;
    isi.querySelector('#r-sebutan').textContent = per.sebutan;
    btnMaju.disabled = pilihan.geser === 0;   // tidak ada order di masa depan
  }

  async function ambil() {
    const n = ++nomorTarik;
    const per = hitungPeriode(pilihan.jenis, pilihan.geser);
    try {
      const baris = await db.pilih('pesanan', {
        select: PILIH_KOLOM,
        sales_id: 'eq.' + status.profil.id,
        and: `(tanggal.gte.${per.dari},tanggal.lte.${per.sampai})`,
        order: 'tanggal.desc,id.desc',
      });
      if (n !== nomorTarik) return;
      semua = baris;
      // judul ikut diperbarui: kalau aplikasi terbuka melewati tengah malam,
      // "Hari ini" sudah berganti tanggal
      isi.querySelector('#r-judul').textContent = per.judul;
      isi.querySelector('#r-sebutan').textContent =
        `${per.sebutan} · diperbarui ${FMT_JAM.format(new Date())}`;
      gambarSemua();
    } catch (err) {
      if (n !== nomorTarik) return;
      elDaftar.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('peringatan', 40)}</span>${
        esc(err.message || 'Gagal memuat order.')}</div>`;
    }
  }

  function tampil() {
    if (pilihan.status === 'semua') return semua;
    return semua.filter((p) => (statusNota(p).kunci === 'sudah') === (pilihan.status === 'sudah'));
  }

  function gambarRingkas(daftar) {
    const nPending = semua.filter((p) => statusNota(p).kunci !== 'sudah').length;
    isi.querySelector('#ringkas').innerHTML = `
      <div class="sel"><div class="lbl">Order</div><div class="nilai">${daftar.length}</div></div>
      <div class="sel${nPending ? ' ada-pending' : ''}"><div class="lbl">Pending nota</div><div class="nilai">${nPending}</div></div>
      <div class="sel"><div class="lbl">Nilai order</div><div class="nilai">${esc(
        rupiah(daftar.reduce((s, p) => s + Number(p.total || 0), 0)))}</div></div>`;
  }

  function gambarSemua() {
    const daftar = tampil();
    gambarRingkas(daftar);
    const per = hitungPeriode(pilihan.jenis, pilihan.geser);
    // "hari ini" / "minggu ini" untuk periode sekarang, "pada <tanggal>" untuk yang lalu
    const pada = pilihan.geser === 0 ? per.sebutan.toLowerCase() : `pada ${per.judul}`;

    if (!semua.length) {
      elDaftar.innerHTML = `<div class="kosong-pesan">
        <span class="ikon">${ikon('kosong', 40)}</span>Belum ada order ${esc(pada)}.
        ${pilihan.geser === 0 ? '<br>Buat order baru di tab <b>Order</b>.' : ''}</div>`;
      return;
    }
    if (!daftar.length) {
      elDaftar.innerHTML = pilihan.status === 'pending'
        ? `<div class="kosong-pesan"><span class="ikon">${ikon('centang', 40)}</span>Semua order ${
            esc(pada)} sudah dibuatkan nota.</div>`
        : `<div class="kosong-pesan"><span class="ikon">${ikon('jam', 40)}</span>Belum ada order ${
            esc(pada)} yang sudah dibuatkan nota.</div>`;
      return;
    }
    elDaftar.innerHTML = daftar.map((p) => kartuOrder(p)).join('');
  }

  /* ---------------- saringan ---------------- */
  isi.querySelector('#r-jenis').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jenis]');
    if (!b || b.dataset.jenis === pilihan.jenis) return;
    pilihan.jenis = b.dataset.jenis;
    pilihan.geser = 0;   // ganti mingguan/bulanan -> mulai dari periode sekarang
    tandaiPilihan();
    ambil();
  });
  btnMundur.addEventListener('click', () => { pilihan.geser += 1; tandaiPilihan(); ambil(); });
  btnMaju.addEventListener('click', () => {
    if (pilihan.geser === 0) return;
    pilihan.geser -= 1; tandaiPilihan(); ambil();
  });
  isi.querySelector('#r-status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b || b.dataset.status === pilihan.status) return;
    pilihan.status = b.dataset.status;
    tandaiPilihan();
    gambarSemua();   // tidak perlu ke server: datanya sudah ada
  });

  // Status nota bisa berubah kapan saja (admin sedang membuat nota), jadi
  // setiap kali aplikasi dibuka lagi datanya diambil ulang.
  const saatTerlihat = () => {
    if (!elDaftar.isConnected) { document.removeEventListener('visibilitychange', saatTerlihat); return; }
    if (!document.hidden) ambil();
  };
  document.addEventListener('visibilitychange', saatTerlihat);

  // ---------------- aksi di dalam kartu ----------------
  elDaftar.addEventListener('click', (e) => {
    const kepala = e.target.closest('.riwayat-kepala');
    if (kepala) {
      const box = elDaftar.querySelector('#isi-' + CSS.escape(kepala.dataset.id));
      if (box) {
        box.hidden = !box.hidden;
        kepala.setAttribute('aria-expanded', String(!box.hidden));
      }
      return;
    }

    const tCatatan = e.target.closest('[data-catatan]');
    if (tCatatan) {
      const p = semua.find((x) => String(x.id) === tCatatan.dataset.catatan);
      if (p) bukaTambahCatatan(p, ambil);
    }
  });

  tandaiPilihan();
  await ambil();
}

/* ============================================================
   Satu kartu order
   ============================================================ */
function keteranganNota(i) {
  if (i.nota_dibuat) return i.no_nota ? `Nota ${i.no_nota}` : 'Nota sudah dibuat';
  return 'Nota pending';
}

function kartuOrder(p) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
  const catatan = (p.pesanan_catatan || []).slice()
    .sort((a, b) => String(a.dibuat_pada).localeCompare(String(b.dibuat_pada)));
  const st = statusNota(p);

  return `
  <div class="riwayat">
    <button type="button" class="riwayat-kepala" data-id="${esc(p.id)}" aria-expanded="false"
            aria-controls="isi-${esc(p.id)}">
      <span class="kiri">
        <span class="toko">${esc(p.toko_nama)}</span>
        <span class="meta">
          <span>${esc(tanggalPendek(p.tanggal))}</span>
          <span class="kode">${esc(p.no_pesanan)}</span>
          <span>${item.length} barang</span>
          <span class="tanda nota-${st.kunci}">${esc(st.teks)}</span>
        </span>
      </span>
      <span class="uang">${esc(rupiah(p.total))}</span>
    </button>

    <div class="riwayat-isi" id="isi-${esc(p.id)}" hidden>
      <table>${item.map((i) => `<tr>
        <td>${esc(i.barang_nama)}<div class="ket">${esc(rincianItem(i))}</div>
          <div class="ket ket-nota${i.nota_dibuat ? ' sudah' : ''}">${esc(keteranganNota(i))}</div></td>
        <td>${esc(rupiah(i.subtotal))}</td></tr>`).join('')}</table>

      ${p.catatan ? `<div class="ket catatan-cap">${ikon('catatan', 14)}${esc(p.catatan)}</div>` : ''}

      ${catatan.length ? `<div class="catatan-daftar">${catatan
        .map((c) => `<div class="catatan-baris">${esc(c.teks)}
          <span class="siapa">Catatan tambahan · ${esc(tanggalPendek(String(c.dibuat_pada).slice(0, 10)))} · ${
            c.dibaca_pada ? 'sudah dibaca admin' : 'belum dibaca admin'}</span>
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
      Admin langsung mendapat pemberitahuan. Catatan hanya bisa <b>ditambah</b>,
      tidak bisa dihapus.
    </div>
    <textarea id="c-teks" maxlength="500"
      placeholder="Contoh: harga semen minta jadi Rp 52.000 · jumlah semen seharusnya 25 sak"></textarea>
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
      pesan('Catatan terkirim ke admin.', 'ok');
      tirai.remove();
      await selesai();
    } catch (err) {
      pesan(err.message, 'salah');
      b.disabled = false; b.textContent = 'Simpan catatan';
    }
  });

  setTimeout(() => ta.focus(), 120);
}
