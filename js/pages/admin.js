// Halaman admin: lihat semua order, ekspor Excel, kelola master & akun.

import * as db from '../db.js';
import { buatFormOrder } from '../form-order.js';
import { buatFormBarang } from '../form-barang.js';
import {
  esc, rupiah, angka, keAngka, hariIni, tanggalPendek,
  pesan, tanya, unduh, keCSV, pecahTempelan, rincianItem, lembar,
} from '../util.js';

let tabAktif = 'order';

export async function gambar(isi, ctx) {
  isi.innerHTML = `
    <div class="tab" id="tab">
      <button type="button" data-t="order">📄 Order</button>
      <button type="button" data-t="toko">🏪 Toko</button>
      <button type="button" data-t="barang">📦 Barang</button>
      <button type="button" data-t="akun">👤 Akun</button>
    </div>
    <div id="panel"></div>`;

  const panel = isi.querySelector('#panel');

  isi.querySelector('#tab').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    tabAktif = b.dataset.t;
    pilihTab(panel, isi, ctx);
  });

  pilihTab(panel, isi, ctx);
}

function pilihTab(panel, isi, ctx) {
  isi.querySelectorAll('#tab button').forEach((b) => {
    b.classList.toggle('aktif', b.dataset.t === tabAktif);
  });

  // Tiap tab dapat wadahnya SENDIRI. Kalau pengguna ganti tab sebelum
  // yang lama selesai memuat, tulisan yang terlambat masuk ke wadah lama
  // yang sudah dilepas dari halaman — tidak menabrak tab yang baru.
  const wadah = document.createElement('div');
  wadah.innerHTML = `<div class="memuat"><div class="putar"></div>Memuat…</div>`;
  panel.replaceChildren(wadah);

  const jalan = { order: tabOrder, toko: tabToko, barang: tabBarang, akun: tabAkun }[tabAktif];
  jalan(wadah, ctx).catch((e) => {
    console.error(e);
    wadah.innerHTML = `<div class="kosong-pesan"><span class="ikon">⚠️</span>${esc(e.message || 'Gagal memuat.')}</div>`;
  });
}

/* ============================================================
   TAB 1 — ORDER + EKSPOR EXCEL
   ============================================================ */
async function tabOrder(panel, ctx) {
  const akhir = hariIni();
  const awal = mundur(akhir, 30);

  panel.innerHTML = `
    <div class="kartu">
      <div class="judul-bagian">Rentang tanggal</div>
      <div class="dua">
        <div><label class="label" for="d1">Dari</label><input type="date" id="d1" value="${awal}"></div>
        <div><label class="label" for="d2">Sampai</label><input type="date" id="d2" value="${akhir}"></div>
      </div>
      <div class="baris" style="margin-top:12px">
        <label class="label" for="f-sales">Sales</label>
        <select id="f-sales"><option value="">Semua sales</option></select>
      </div>
      <div class="tombol-baris">
        <button type="button" class="btn" id="btn-tampil">Tampilkan</button>
        <button type="button" class="btn hijau" id="btn-excel">⬇ Excel</button>
      </div>
    </div>
    <div class="ringkas" id="ringkas"></div>
    <div id="hasil"></div>`;

  const salesList = await db.pilih('profil', { select: 'id,nama,username,peran', order: 'nama.asc' });
  const sel = panel.querySelector('#f-sales');
  sel.insertAdjacentHTML(
    'beforeend',
    salesList
      .filter((p) => p.peran === 'sales')
      .map((p) => `<option value="${esc(p.id)}">${esc(p.nama)}</option>`)
      .join('')
  );

  const namaSales = Object.fromEntries(salesList.map((p) => [p.id, p.nama]));

  async function tarik() {
    const d1 = panel.querySelector('#d1').value || awal;
    const d2 = panel.querySelector('#d2').value || akhir;
    const sid = sel.value;
    // dua syarat pada kolom yang sama -> pakai penyaring "and"
    const q = {
      select: 'id,no_pesanan,tanggal,sales_id,toko_id,toko_nama,catatan,total,' +
              'pesanan_item(urut,barang_id,barang_nama,satuan,qty,harga,harga_per_kg,berat_kg,subtotal),' +
              'pesanan_catatan(teks,dibuat_pada)',
      and: `(tanggal.gte.${d1},tanggal.lte.${d2})`,
      order: 'tanggal.desc,id.desc',
      limit: 2000,
    };
    if (sid) q.sales_id = 'eq.' + sid;
    return db.pilih('pesanan', q);
  }

  async function tampilkan() {
    const hasil = panel.querySelector('#hasil');
    hasil.innerHTML = `<div class="memuat"><div class="putar"></div>Memuat…</div>`;
    const baris = await tarik();
    terakhir = baris;

    panel.querySelector('#ringkas').innerHTML = `
      <div class="sel"><div class="lbl">JUMLAH ORDER</div><div class="nilai">${baris.length}</div></div>
      <div class="sel"><div class="lbl">TOTAL NILAI</div><div class="nilai">${esc(
        rupiah(baris.reduce((s, p) => s + Number(p.total || 0), 0))
      )}</div></div>`;

    if (!baris.length) {
      hasil.innerHTML = `<div class="kosong-pesan"><span class="ikon">📄</span>Tidak ada order pada rentang ini.</div>`;
      return;
    }

    hasil.innerHTML = baris
      .map((p) => {
        const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
        return `
        <div class="riwayat">
          <button type="button" class="riwayat-kepala" data-id="${esc(p.id)}">
            <span class="kiri">
              <span class="toko">${esc(p.toko_nama)}</span>
              <span class="meta">${esc(tanggalPendek(p.tanggal))} · ${esc(p.no_pesanan)} · ${esc(namaSales[p.sales_id] || '—')}</span>
            </span>
            <span class="uang">${esc(rupiah(p.total))}</span>
          </button>
          <div class="riwayat-isi" id="ai-${esc(p.id)}" hidden>
            <table>${item
              .map(
                (i) => `<tr><td>${esc(i.barang_nama)}
                  <div class="ket">${esc(rincianItem(i))}</div></td>
                  <td>${esc(rupiah(i.subtotal))}</td></tr>`
              )
              .join('')}</table>
            ${p.catatan ? `<div class="ket" style="margin-top:10px">📝 ${esc(p.catatan)}</div>` : ''}
            ${(p.pesanan_catatan || []).length ? `<div class="catatan-daftar">${
              (p.pesanan_catatan || []).map((c) => `<div class="catatan-baris">${esc(c.teks)}
                <span class="siapa">Catatan tambahan dari sales</span></div>`).join('')
            }</div>` : ''}
            <div class="tombol-baris" style="margin-top:14px">
              <button type="button" class="btn kecil" style="width:100%"
                      data-ubah="${esc(p.id)}">Ubah order</button>
              <button type="button" class="btn abu kecil" style="width:100%;color:var(--merah)"
                      data-hapus="${esc(p.id)}">Hapus</button>
            </div>
          </div>
        </div>`;
      })
      .join('');
  }

  let terakhir = [];

  panel.querySelector('#hasil').addEventListener('click', async (e) => {
    const hapus = e.target.closest('[data-hapus]');
    if (hapus) {
      if (!(await tanya('Hapus order?', 'Order dan semua barangnya akan hilang permanen.', 'Ya, hapus'))) return;
      try {
        await db.rpc('hapus_pesanan', { p_id: Number(hapus.dataset.hapus) });
        pesan('Order dihapus.', 'ok');
        tampilkan();
      } catch (err) { pesan(err.message, 'salah'); }
      return;
    }

    const ubah = e.target.closest('[data-ubah]');
    if (ubah) {
      const p = terakhir.find((x) => String(x.id) === ubah.dataset.ubah);
      if (p) bukaUbahOrder(p, ctx, tampilkan);
      return;
    }

    const kepala = e.target.closest('.riwayat-kepala');
    if (!kepala) return;
    const box = panel.querySelector('#ai-' + CSS.escape(kepala.dataset.id));
    if (box) box.hidden = !box.hidden;
  });

  panel.querySelector('#btn-tampil').addEventListener('click', () => tampilkan().catch((e) => pesan(e.message, 'salah')));

  panel.querySelector('#btn-excel').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = 'Menyiapkan…';
    try {
      const d1 = panel.querySelector('#d1').value || awal;
      const d2 = panel.querySelector('#d2').value || akhir;
      const q = {
        select: 'tanggal,no_pesanan,sales,toko,barang,satuan,jumlah,harga,harga_per_kg,total_kg,subtotal,catatan',
        and: `(tanggal.gte.${d1},tanggal.lte.${d2})`,
        order: 'tanggal.desc,no_pesanan.desc,urut.asc',
        limit: 20000,
      };
      if (sel.value) q.sales_id = 'eq.' + sel.value;
      const baris = await db.pilih('v_ekspor', q);
      if (!baris.length) { pesan('Tidak ada data untuk diunduh.', 'salah'); return; }

      // Excel Indonesia pakai koma sebagai desimal
      const des = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

      const csv = keCSV(
        ['Tanggal', 'No Order', 'Sales', 'Toko', 'Barang', 'Satuan', 'Jumlah',
         'Harga Satuan', 'Harga per Kg', 'Total Kg', 'Subtotal', 'Catatan'],
        baris.map((r) => [
          r.tanggal, r.no_pesanan, r.sales, r.toko, r.barang, r.satuan,
          des(r.jumlah), des(r.harga), des(r.harga_per_kg), des(r.total_kg),
          des(r.subtotal), r.catatan || '',
        ])
      );
      unduh(`order-${d1}-sd-${d2}.csv`, csv);
      pesan(`${baris.length} baris diunduh. Buka dengan Excel.`, 'ok');
    } catch (err) {
      pesan(err.message || 'Gagal mengunduh.', 'salah');
    } finally {
      b.disabled = false;
      b.textContent = '⬇ Excel';
    }
  });

  await tampilkan();
}

/** Admin mengubah order. Hanya admin yang boleh. */
function bukaUbahOrder(p, ctx, selesai) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);

  const tirai = lembar('Ubah order', `
    <div class="bantuan" style="margin:0 0 14px">
      Order <span class="kode">${esc(p.no_pesanan)}</span> ·
      ${esc(tanggalPendek(p.tanggal))} · sekarang ${esc(rupiah(p.total))}
    </div>
    <div id="u-form"></div>
    <div style="height:14px"></div>
    <button type="button" class="btn" id="u-simpan">Simpan perubahan</button>`);

  const form = buatFormOrder({
    status: ctx.status,
    awal: {
      toko: { id: p.toko_id, nama: p.toko_nama },
      catatan: p.catatan || '',
      item,
    },
  });
  tirai.querySelector('#u-form').appendChild(form.el);

  tirai.addEventListener('click', async (e) => {
    if (!e.target.closest('#u-simpan')) return;
    const keliru = form.salah();
    if (keliru) { pesan(keliru, 'salah'); return; }

    const b = tirai.querySelector('#u-simpan');
    b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      await db.rpc('ubah_pesanan', { p_id: p.id, p_data: form.baca() });
      pesan('Order diperbarui.', 'ok');
      tirai.remove();
      await selesai();
    } catch (err) {
      pesan(err.message, 'salah');
      b.disabled = false; b.textContent = 'Simpan perubahan';
    }
  });
}

function mundur(iso, hari) {
  const d = new Date(iso + 'T00:00:00+07:00');
  d.setDate(d.getDate() - hari);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(d);
}

/* ============================================================
   TAB 2 & 3 — MASTER TOKO / BARANG
   ============================================================ */
async function tabToko(panel, ctx) {
  await tabMaster(panel, ctx, {
    tabel: 'toko',
    judul: 'Toko',
    kolomImpor: 'Kode toko · Nama toko · Alamat · Kota · Telepon',
    contoh: 'PTI.MKM\tTOKO MAKMUR\tJL MELATI 12\tPATI\t08123456789',
    select: 'id,kode,nama,alamat,kota,telepon,sumber,aktif',
    rpcImpor: 'impor_toko',
    keImpor: (k) => {
      const s = k.slice();
      if (s.length > 4 && /^\d+$/.test(s[0])) s.shift();      // buang kolom NO
      // 5 kolom = ada kode di depan; 4 kolom atau kurang = tanpa kode
      return s.length >= 5
        ? { kode: s[0] || null, nama: s[1], alamat: s[2], kota: s[3], telepon: s[4] }
        : { kode: null, nama: s[0], alamat: s[1], kota: s[2], telepon: s[3] };
    },
    catatanImpor:
      'Kolom NO di depan otomatis dilewati. Kalau daftar Anda tidak punya kolom Kode, ' +
      'tempel saja 4 kolom (Nama · Alamat · Kota · Telepon) — juga terbaca.',
    pratinjau: (r) =>
      [r.nama, r.kota, r.kode ? 'kode ' + r.kode : '', r.telepon].filter(Boolean).join(' · '),
    ket: (r) => [r.kota, r.kode, r.alamat, r.telepon].filter(Boolean).join(' · '),
    formTambah: () => `
      <div class="dua">
        <div><label class="label">Kode toko</label><input type="text" id="f-kode" placeholder="PTI.MKM"></div>
        <div><label class="label">Kota</label><input type="text" id="f-kota" placeholder="PATI"></div>
      </div>
      <div class="baris" style="margin-top:10px"><label class="label">Nama toko</label>
        <input type="text" id="f-nama" placeholder="TOKO MAKMUR"></div>
      <div class="baris"><label class="label">Alamat</label><input type="text" id="f-alamat"></div>
      <div class="baris"><label class="label">Telepon</label>
        <input type="tel" id="f-telepon" inputmode="tel"></div>`,
    bacaForm: (p) => ({
      kode: p.querySelector('#f-kode').value.trim() || null,
      nama: p.querySelector('#f-nama').value.trim(),
      kota: p.querySelector('#f-kota').value.trim() || null,
      telepon: p.querySelector('#f-telepon').value.trim() || null,
      alamat: p.querySelector('#f-alamat').value.trim() || null,
    }),
    formUbah: (r) => `
      <div class="dua">
        <div><label class="label">Kode toko</label><input type="text" id="e-kode" value="${esc(r.kode || '')}"></div>
        <div><label class="label">Kota</label><input type="text" id="e-kota" value="${esc(r.kota || '')}"></div>
      </div>
      <div class="baris" style="margin-top:10px"><label class="label">Nama toko</label>
        <input type="text" id="e-nama" value="${esc(r.nama)}"></div>
      <div class="baris"><label class="label">Alamat</label>
        <input type="text" id="e-alamat" value="${esc(r.alamat || '')}"></div>
      <div class="baris"><label class="label">Telepon</label>
        <input type="tel" id="e-telepon" value="${esc(r.telepon || '')}"></div>`,
    bacaUbah: (w) => ({
      kode: w.querySelector('#e-kode').value.trim() || null,
      nama: w.querySelector('#e-nama').value.trim(),
      kota: w.querySelector('#e-kota').value.trim() || null,
      telepon: w.querySelector('#e-telepon').value.trim() || null,
      alamat: w.querySelector('#e-alamat').value.trim() || null,
    }),
  });
}

/** Ambil HPP dari hasil sisipan PostgREST (bisa objek atau array). */
function bacaHpp(r) {
  const b = r?.barang_biaya;
  const v = Array.isArray(b) ? b[0]?.hpp : b?.hpp;
  return v === undefined || v === null ? null : Number(v);
}

/**
 * Petakan satu baris tempelan Excel ke barang.
 * Urutan yang didukung (kolom NO di depan otomatis dilewati):
 *   6 kolom: KODE · NAMA · SAT · STOK · HARGA JUAL · HPP   (persis daftar harga Anda)
 *   5 kolom: KODE · NAMA · SAT · HARGA JUAL · HPP
 *   4 kolom: KODE · NAMA · SAT · HARGA JUAL
 *   3 kolom: NAMA · SAT · HARGA JUAL
 */
export function barisKeBarang(k) {
  const s = k.slice();
  if (s.length > 3 && /^\d+$/.test(s[0])) s.shift();   // buang kolom NO
  const b = { kode: null, nama: '', satuan: 'pcs', harga_rekomendasi: 0, hpp: null };

  if (s.length >= 6) {
    [b.kode, b.nama, b.satuan] = s;
    b.harga_rekomendasi = keAngka(s[4]);               // s[3] = STOK, dilewati
    b.hpp = keAngka(s[5]);
  } else if (s.length === 5) {
    [b.kode, b.nama, b.satuan] = s;
    b.harga_rekomendasi = keAngka(s[3]);
    b.hpp = keAngka(s[4]);
  } else if (s.length === 4) {
    [b.kode, b.nama, b.satuan] = s;
    b.harga_rekomendasi = keAngka(s[3]);
  } else {
    b.nama = s[0] || '';
    b.satuan = s[1] || 'pcs';
    b.harga_rekomendasi = keAngka(s[2]);
  }

  b.kode = (b.kode || '').trim() || null;
  b.nama = (b.nama || '').trim();
  b.satuan = (b.satuan || '').trim() || 'pcs';
  return b;
}

async function tabBarang(panel, ctx) {
  await tabMaster(panel, ctx, {
    tabel: 'barang',
    judul: 'Barang',
    kolomImpor: 'Kode · Nama barang · Satuan · Harga jual · HPP',
    contoh: 'R041-003\tAFUR BCP STENLIS\tPCS\t25.000\t17.500',
    select: 'id,kode,nama,satuan,harga_rekomendasi,berat_kg,kategori,sumber,aktif,barang_biaya(hpp)',
    rpcImpor: 'impor_barang',
    keImpor: barisKeBarang,
    pratinjau: (r) =>
      `${r.nama} — ${rupiah(r.harga_rekomendasi)} / ${r.satuan}` +
      (r.kode ? ` · kode ${r.kode}` : '') +
      (r.hpp ? ` · HPP ${rupiah(r.hpp)}` : ''),
    catatanImpor:
      'Kolom NO di depan otomatis dilewati. Kalau daftar Anda masih pakai ' +
      'kolom STOK (Kode · Nama · Sat · Stok · Harga jual · HPP), itu juga terbaca — ' +
      'stok diabaikan. HPP hanya terlihat oleh admin. Untuk barang yang harganya ' +
      'per kilo, pakai tombol "+ Tambah".',

    ket: (r) => {
      const hpp = bacaHpp(r);
      const berat = Number(r.berat_kg) || null;
      const rek = Number(r.harga_rekomendasi) || 0;
      const bagian = [
        berat
          // barang per-kilo: harga_rekomendasi = harga per KG
          ? (rek ? `${rupiah(rek)}/kg` : 'harga per kg') +
            ` · 1 ${r.satuan} = ${angka(berat)} kg`
          : `${rupiah(rek)} / ${r.satuan}`,
      ];
      if (r.kode) bagian.push(r.kode);
      if (hpp !== null) {
        // Untuk barang per-kilo, harga jual DAN HPP dua-duanya per kg,
        // jadi marginnya tetap bisa dihitung.
        const m = rek > 0 ? Math.round(((rek - hpp) / rek) * 100) : null;
        bagian.push(
          `HPP ${rupiah(hpp)}${berat ? '/kg' : ''}` + (m === null ? '' : ` (margin ${m}%)`)
        );
      }
      if (r.kategori) bagian.push(r.kategori);
      return bagian.join(' · ');
    },

    // Tambah & Ubah barang memakai form universal yang sama.
    sheetTambah: (c, selesai) => bukaFormBarang(null, c, selesai),
    sheetUbah: (r, c, selesai) => bukaFormBarang(r, c, selesai),
  });
}

/* ============================================================
   Satu form untuk SEMUA bentuk barang.
   Admin sendiri yang mengatur:
     - dasar harga : per satuan  atau  per kilo
     - ukuran      : satu saja   atau  beberapa sekaligus
   Contoh yang tertampung: semen per SAK · paku per DUS 25 kg ·
   kawat seng per ROL yang tiap ukuran beratnya beda.
   ============================================================ */
function bukaFormBarang(r, ctx, selesai) {
  const ubah = !!r;

  const tirai = lembar(ubah ? 'Ubah barang' : 'Tambah barang', `
    <div id="fb-slot"></div>
    ${ubah ? `
    <label style="display:flex;gap:11px;align-items:center;margin:14px 0;font-size:15px">
      <input type="checkbox" id="fb-aktif" ${r.aktif ? 'checked' : ''}
             style="width:22px;height:22px;min-height:22px;padding:0">
      Tampilkan di daftar pilihan sales
    </label>` : '<div style="height:14px"></div>'}
    <button type="button" class="btn" id="fb-simpan">
      ${ubah ? 'Simpan perubahan' : 'Simpan barang'}
    </button>`);

  const form = buatFormBarang({
    // Saat mengubah, satu barang saja — daftar ukuran tidak masuk akal di sini.
    bolehUkuran: !ubah,
    awal: ubah ? {
      kode: r.kode,
      nama: r.nama,
      satuan: r.satuan,
      harga_rekomendasi: r.harga_rekomendasi,
      berat_kg: r.berat_kg,
      kategori: r.kategori,
      hpp: bacaHpp(r),
    } : null,
  });
  tirai.querySelector('#fb-slot').appendChild(form.el);

  tirai.addEventListener('click', async (e) => {
    if (!e.target.closest('#fb-simpan')) return;

    const keliru = form.salah();
    if (keliru) { pesan(keliru, 'salah'); return; }

    const baris = form.baca();
    const btn = tirai.querySelector('#fb-simpan');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';

    try {
      if (ubah) {
        const d = baris[0];
        await db.ubah('barang', r.id, {
          kode: d.kode,
          nama: d.nama,
          satuan: d.satuan,
          harga_rekomendasi: d.harga_rekomendasi,
          berat_kg: d.berat_kg,
          kategori: d.kategori,
          aktif: tirai.querySelector('#fb-aktif').checked,
          sumber: 'master',
        });
        if (d.hpp !== null) {
          await db.rpc('set_hpp', { p_barang_id: r.id, p_hpp: d.hpp });
        }
        pesan('Tersimpan.', 'ok');
      } else {
        // impor_barang menangani 1 maupun banyak baris, sekaligus HPP-nya
        const n = await db.rpc('impor_barang', { p_baris: baris });
        pesan(n > 1 ? `${n} barang tersimpan.` : 'Barang ditambahkan.', 'ok');
      }

      tirai.remove();
      await selesai();
      ctx.segarkanMaster({ paksa: true }).catch(() => {});
    } catch (err) {
      pesan(/duplicate|unique/i.test(err.message)
        ? 'Nama itu sudah ada di daftar barang.' : err.message, 'salah');
      btn.disabled = false;
      btn.textContent = ubah ? 'Simpan perubahan' : 'Simpan barang';
    }
  });
}

async function tabMaster(panel, ctx, o) {
  let data = [];

  panel.innerHTML = `
    <div class="kartu">
      <input type="text" id="cari" placeholder="Cari ${esc(o.judul.toLowerCase())}…" autocomplete="off">
      <div class="tombol-baris" style="margin-top:10px">
        <button type="button" class="btn kecil" id="btn-tambah" style="width:auto">+ Tambah</button>
        <button type="button" class="btn abu kecil" id="btn-impor" style="width:auto">📋 Tempel dari Excel</button>
      </div>
      <div class="bantuan" id="hitung"></div>
    </div>
    <div id="isi-master"></div>`;

  const wadah = panel.querySelector('#isi-master');
  const cari = panel.querySelector('#cari');

  async function muat() {
    data = await db.pilih(o.tabel, { select: o.select, order: 'nama.asc', limit: 5000 });
    gambarList();
  }

  function gambarList() {
    const q = cari.value.trim().toLowerCase();
    const cocok = (q ? data.filter((r) => r.nama.toLowerCase().includes(q)) : data).slice(0, 200);
    const elHitung = panel.querySelector('#hitung');
    if (elHitung) {
      elHitung.textContent =
        `${data.length} ${o.judul.toLowerCase()} · ${data.filter((r) => r.sumber === 'sales').length} usulan dari sales`;
    }

    if (!cocok.length) {
      wadah.innerHTML = `<div class="kosong-pesan"><span class="ikon">📭</span>${
        data.length ? 'Tidak ada yang cocok.' : 'Belum ada data. Tekan "Tempel dari Excel" untuk mengisi sekaligus.'
      }</div>`;
      return;
    }

    wadah.innerHTML = cocok
      .map(
        (r) => `
      <div class="riwayat">
        <button type="button" class="riwayat-kepala" data-id="${esc(r.id)}">
          <span class="kiri">
            <span class="toko">${esc(r.nama)}
              ${r.sumber === 'sales' ? '<span class="tanda usul">usulan sales</span>' : ''}
              ${!r.aktif ? '<span class="tanda mati">nonaktif</span>' : ''}</span>
            <span class="meta">${esc(o.ket(r))}</span>
          </span>
          <span class="uang" style="font-size:20px;color:var(--teks-2)">›</span>
        </button>
      </div>`
      )
      .join('') + (data.length > 200 && !q ? `<div class="bantuan" style="text-align:center">Menampilkan 200 teratas — pakai kotak cari.</div>` : '');
  }

  cari.addEventListener('input', gambarList);

  wadah.addEventListener('click', (e) => {
    const k = e.target.closest('.riwayat-kepala');
    if (!k) return;
    const r = data.find((x) => String(x.id) === k.dataset.id);
    if (r) bukaUbah(r);
  });

  function bukaUbah(r) {
    // Tabel yang punya lembar sendiri (barang) memakai itu.
    if (o.sheetUbah) { o.sheetUbah(r, ctx, muat); return; }

    const tirai = document.createElement('div');
    tirai.className = 'tirai';
    tirai.innerHTML = `
      <div class="lembar" role="dialog" aria-modal="true">
        <div class="lembar-atas"><div class="tajuk">
          <h3>Ubah ${esc(o.judul.toLowerCase())}</h3>
          <button type="button" class="tutup" aria-label="Tutup">&times;</button>
        </div></div>
        <div class="daftar" style="padding:14px">
          ${o.formUbah(r)}
          <label style="display:flex;gap:10px;align-items:center;margin:14px 0;font-size:15px">
            <input type="checkbox" id="e-aktif" ${r.aktif ? 'checked' : ''}
                   style="width:22px;height:22px;min-height:22px;padding:0">
            Tampilkan di daftar pilihan sales
          </label>
          <button type="button" class="btn" id="e-simpan">Simpan perubahan</button>
        </div>
      </div>`;

    tirai.addEventListener('click', async (e) => {
      if (e.target === tirai || e.target.closest('.tutup')) { tirai.remove(); return; }
      if (!e.target.closest('#e-simpan')) return;

      const isiBaru = { ...o.bacaUbah(tirai), aktif: tirai.querySelector('#e-aktif').checked, sumber: 'master' };
      if (!isiBaru.nama) { pesan('Nama tidak boleh kosong.', 'salah'); return; }
      const b = tirai.querySelector('#e-simpan');
      b.disabled = true; b.textContent = 'Menyimpan…';
      try {
        await db.ubah(o.tabel, r.id, isiBaru);
        await o.simpanTambahan?.(r.id, tirai, 'e');
        pesan('Tersimpan.', 'ok');
        tirai.remove();
        await muat();
        ctx.segarkanMaster({ paksa: true }).catch(() => {});
      } catch (err) {
        pesan(err.message, 'salah');
        b.disabled = false; b.textContent = 'Simpan perubahan';
      }
    });
    document.body.appendChild(tirai);
  }

  panel.querySelector('#btn-tambah').addEventListener('click', () => {
    if (o.sheetTambah) { o.sheetTambah(ctx, muat); return; }

    const tirai = document.createElement('div');
    tirai.className = 'tirai';
    tirai.innerHTML = `
      <div class="lembar" role="dialog" aria-modal="true">
        <div class="lembar-atas"><div class="tajuk">
          <h3>Tambah ${esc(o.judul.toLowerCase())}</h3>
          <button type="button" class="tutup" aria-label="Tutup">&times;</button>
        </div></div>
        <div class="daftar" style="padding:14px">
          ${o.formTambah()}
          <div style="height:14px"></div>
          <button type="button" class="btn" id="f-simpan">Simpan</button>
        </div>
      </div>`;

    tirai.addEventListener('click', async (e) => {
      if (e.target === tirai || e.target.closest('.tutup')) { tirai.remove(); return; }
      if (!e.target.closest('#f-simpan')) return;

      const baru = o.bacaForm(tirai);
      if (!baru.nama) { pesan('Nama belum diisi.', 'salah'); return; }
      const b = tirai.querySelector('#f-simpan');
      b.disabled = true; b.textContent = 'Menyimpan…';
      try {
        const hasil = await db.sisip(o.tabel, baru);
        const idBaru = Array.isArray(hasil) ? hasil[0]?.id : hasil?.id;
        if (idBaru) await o.simpanTambahan?.(idBaru, tirai, 'f');
        pesan('Ditambahkan.', 'ok');
        tirai.remove();
        await muat();
        ctx.segarkanMaster({ paksa: true }).catch(() => {});
      } catch (err) {
        pesan(/duplicate|unique/i.test(err.message) ? 'Nama itu sudah ada di daftar.' : err.message, 'salah');
        b.disabled = false; b.textContent = 'Simpan';
      }
    });
    document.body.appendChild(tirai);
  });

  panel.querySelector('#btn-impor').addEventListener('click', () => {
    const tirai = document.createElement('div');
    tirai.className = 'tirai';
    tirai.innerHTML = `
      <div class="lembar" role="dialog" aria-modal="true">
        <div class="lembar-atas"><div class="tajuk">
          <h3>Tempel dari Excel</h3>
          <button type="button" class="tutup" aria-label="Tutup">&times;</button>
        </div></div>
        <div class="daftar" style="padding:14px">
          <div class="peringatan">
            <b>Urutan kolom harus:</b>${esc(o.kolomImpor)}
            <div style="margin-top:8px">Blok baris di Excel → Salin → tempel di kotak bawah.
            Nama yang sudah ada akan <b>diperbarui</b>, bukan digandakan.</div>
            ${o.catatanImpor ? `<div style="margin-top:8px">${esc(o.catatanImpor)}</div>` : ''}
          </div>
          <textarea id="tempel" style="min-height:160px" placeholder="${esc(o.contoh)}"></textarea>
          <div class="bantuan" id="pratinjau">Belum ada baris.</div>
          <div style="height:12px"></div>
          <button type="button" class="btn" id="i-simpan" disabled>Impor</button>
        </div>
      </div>`;

    const ta = tirai.querySelector('#tempel');
    const btn = tirai.querySelector('#i-simpan');
    const pra = tirai.querySelector('#pratinjau');
    let baris = [];

    ta.addEventListener('input', () => {
      baris = pecahTempelan(ta.value).map(o.keImpor).filter((r) => r.nama);
      if (!baris.length) {
        pra.textContent = 'Belum ada baris.';
      } else {
        // tampilkan hasil baca 3 baris pertama supaya salah kolom langsung kelihatan
        pra.innerHTML =
          `<b>${baris.length} baris siap diimpor.</b> Hasil baca 3 baris pertama:` +
          baris.slice(0, 3).map((r) => `<div>• ${esc(o.pratinjau(r))}</div>`).join('');
      }
      btn.disabled = !baris.length;
    });

    tirai.addEventListener('click', async (e) => {
      if (e.target === tirai || e.target.closest('.tutup')) { tirai.remove(); return; }
      if (!e.target.closest('#i-simpan')) return;

      btn.disabled = true; btn.textContent = 'Mengimpor…';
      try {
        const n = await db.rpc(o.rpcImpor, { p_baris: baris });
        pesan(`${n} baris masuk.`, 'ok');
        tirai.remove();
        await muat();
        ctx.segarkanMaster({ paksa: true }).catch(() => {});
      } catch (err) {
        pesan(err.message, 'salah');
        btn.disabled = false; btn.textContent = 'Impor';
      }
    });
    document.body.appendChild(tirai);
  });

  await muat();
}

/* ============================================================
   TAB 4 — AKUN
   ============================================================ */
async function tabAkun(panel) {
  panel.innerHTML = `
    <div class="kartu">
      <div class="judul-bagian">Tambah akun baru</div>
      <div class="dua">
        <div><label class="label">Username</label>
          <input type="text" id="a-user" placeholder="sales14" autocapitalize="none" spellcheck="false"></div>
        <div><label class="label">PIN (6 angka)</label>
          <input type="text" id="a-pin" inputmode="numeric" maxlength="6" placeholder="123456"></div>
      </div>
      <div class="baris" style="margin-top:10px"><label class="label">Nama lengkap</label>
        <input type="text" id="a-nama" placeholder="Budi Santoso"></div>
      <div class="baris"><label class="label">Peran</label>
        <select id="a-peran"><option value="sales">Sales</option><option value="admin">Admin</option></select></div>
      <button type="button" class="btn" id="a-simpan">Buat akun</button>
    </div>
    <div class="judul-bagian">Daftar akun</div>
    <div id="daftar-akun"></div>`;

  const wadah = panel.querySelector('#daftar-akun');

  async function muat() {
    const baris = await db.pilih('profil', { select: '*', order: 'peran.asc,nama.asc' });
    wadah.innerHTML = baris
      .map(
        (p) => `
      <div class="riwayat">
        <div style="padding:13px 14px;display:flex;gap:10px;align-items:center">
          <div style="min-width:0;flex:1">
            <div style="font-weight:700;font-size:15.5px;letter-spacing:-.015em">${esc(p.nama)}
              ${p.peran === 'admin' ? '<span class="tanda admin">admin</span>' : ''}
              ${!p.aktif ? '<span class="tanda mati">nonaktif</span>' : ''}</div>
            <div style="font-size:12.5px;color:var(--teks-2);margin-top:4px;
                        display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="kode">${esc(p.username)}</span>
              ${p.kode_sales ? `<span>kode ${esc(p.kode_sales)}</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:0 14px 14px;flex-wrap:wrap">
          <button type="button" class="btn abu kecil" style="flex:1 1 30%"
                  data-nama="${esc(p.username)}" data-nama-lama="${esc(p.nama)}">Ubah nama</button>
          <button type="button" class="btn abu kecil" style="flex:1 1 30%" data-pin="${esc(p.username)}">Ganti PIN</button>
          <button type="button" class="btn ${p.aktif ? 'abu' : 'hijau'} kecil" style="flex:1 1 30%${
                    p.aktif ? ';color:var(--merah)' : ''}"
                  data-aktif="${esc(p.username)}" data-nilai="${p.aktif ? '0' : '1'}">
            ${p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
        </div>
      </div>`
      )
      .join('');
  }

  wadah.addEventListener('click', async (e) => {
    const namaBtn = e.target.closest('[data-nama]');
    if (namaBtn) {
      const baru = prompt('Nama lengkap untuk ' + namaBtn.dataset.nama + ':',
                          namaBtn.dataset.namaLama || '');
      if (baru === null || !baru.trim()) return;
      try {
        await db.rpc('ubah_profil', { p_username: namaBtn.dataset.nama, p_nama: baru.trim() });
        pesan('Nama diperbarui.', 'ok');
        muat();
      } catch (err) { pesan(err.message, 'salah'); }
      return;
    }

    const pin = e.target.closest('[data-pin]');
    if (pin) {
      const baru = prompt(`PIN baru untuk ${pin.dataset.pin} (6 angka):`);
      if (baru === null) return;
      if (!/^\d{6}$/.test(baru.trim())) { pesan('PIN harus 6 angka.', 'salah'); return; }
      try {
        await db.rpc('ganti_pin', { p_username: pin.dataset.pin, p_pin_baru: baru.trim() });
        pesan('PIN diganti. Beritahu yang bersangkutan.', 'ok');
      } catch (err) { pesan(err.message, 'salah'); }
      return;
    }

    const akt = e.target.closest('[data-aktif]');
    if (!akt) return;
    const hidup = akt.dataset.nilai === '1';
    if (!(await tanya(
      hidup ? 'Aktifkan akun?' : 'Nonaktifkan akun?',
      hidup ? `${akt.dataset.aktif} bisa masuk lagi.` : `${akt.dataset.aktif} tidak bisa masuk sampai diaktifkan lagi.`,
      'Ya'
    ))) return;
    try {
      await db.rpc('set_akun_aktif', { p_username: akt.dataset.aktif, p_aktif: hidup });
      pesan('Tersimpan.', 'ok');
      muat();
    } catch (err) { pesan(err.message, 'salah'); }
  });

  panel.querySelector('#a-pin').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  panel.querySelector('#a-simpan').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const u = panel.querySelector('#a-user').value.trim().toLowerCase();
    const n = panel.querySelector('#a-nama').value.trim();
    const p = panel.querySelector('#a-pin').value.trim();
    const r = panel.querySelector('#a-peran').value;

    if (!/^[a-z0-9._-]{2,20}$/.test(u)) { pesan('Username 2-20 huruf kecil/angka.', 'salah'); return; }
    if (!n) { pesan('Nama lengkap belum diisi.', 'salah'); return; }
    if (!/^\d{6}$/.test(p)) { pesan('PIN harus 6 angka.', 'salah'); return; }

    b.disabled = true; b.textContent = 'Membuat…';
    try {
      await db.rpc('buat_akun', { p_username: u, p_nama: n, p_pin: p, p_peran: r });
      pesan(`Akun ${u} dibuat.`, 'ok');
      panel.querySelector('#a-user').value = '';
      panel.querySelector('#a-nama').value = '';
      panel.querySelector('#a-pin').value = '';
      muat();
    } catch (err) {
      pesan(err.message, 'salah');
    } finally {
      b.disabled = false; b.textContent = 'Buat akun';
    }
  });

  await muat();
}
