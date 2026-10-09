// Halaman admin: lihat semua order, ekspor Excel, kelola master & akun.

import * as db from '../db.js';
import { ikon } from '../ikon.js';
import { buatFormOrder } from '../form-order.js';
import { buatFormBarang } from '../form-barang.js';
import {
  esc, rupiah, angka, keAngka, hariIni, tanggalPendek,
  pesan, tanya, unduh, keCSV, keCSVSheet, pecahTempelan, rincianItem, lembar,
} from '../util.js';

let tabAktif = 'order';
let bukaOrderNanti = null;   // id order yang diminta lonceng notifikasi

export async function gambar(isi, ctx) {
  isi.innerHTML = `
    <div class="tab" id="tab">
      <button type="button" data-t="order">${ikon('nota', 17)}Order</button>
      <button type="button" data-t="toko">${ikon('toko', 17)}Toko</button>
      <button type="button" data-t="barang">${ikon('barang', 17)}Barang</button>
      <button type="button" data-t="akun">${ikon('akun', 17)}Akun</button>
    </div>
    <div id="panel"></div>`;

  const panel = isi.querySelector('#panel');

  // Datang dari lonceng notifikasi: #/admin/order/<id> -> buka order itu.
  // Alamatnya langsung dirapikan supaya muat ulang tidak membukanya lagi.
  const dariLonceng = /^#\/admin\/order\/(\d+)/.exec(location.hash);
  if (dariLonceng) {
    tabAktif = 'order';
    bukaOrderNanti = Number(dariLonceng[1]);
    history.replaceState(null, '', '#/admin');
  }

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
  // Tabel order butuh layar lebar; tab lain tetap satu kolom 560px.
  document.body.classList.toggle('lebar', tabAktif === 'order');

  // Tiap tab dapat wadahnya SENDIRI. Kalau pengguna ganti tab sebelum
  // yang lama selesai memuat, tulisan yang terlambat masuk ke wadah lama
  // yang sudah dilepas dari halaman — tidak menabrak tab yang baru.
  const wadah = document.createElement('div');
  wadah.innerHTML = `<div class="memuat"><div class="putar"></div>Memuat…</div>`;
  panel.replaceChildren(wadah);

  const jalan = { order: tabOrder, toko: tabToko, barang: tabBarang, akun: tabAkun }[tabAktif];
  jalan(wadah, ctx).catch((e) => {
    console.error(e);
    wadah.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('peringatan', 40)}</span>${esc(e.message || 'Gagal memuat.')}</div>`;
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
      <div class="saring-order">
        <div><label class="label" for="d1">Dari</label>
          <input type="date" id="d1" value="${awal}"></div>
        <div><label class="label" for="d2">Sampai</label>
          <input type="date" id="d2" value="${akhir}"></div>
        <div><label class="label" for="f-sales">Sales</label>
          <select id="f-sales"><option value="">Semua sales</option></select></div>
        <div><span class="label" id="lbl-status">Status nota</span>
          <div class="saring" id="f-status" role="group" aria-labelledby="lbl-status">
            <button type="button" data-status="semua" aria-pressed="false">Semua</button>
            <button type="button" data-status="pending" aria-pressed="true" class="aktif">Pending</button>
            <button type="button" data-status="sudah" aria-pressed="false">Sudah</button>
          </div></div>
        <div><label class="label" for="f-cari">Cari</label>
          <input type="text" id="f-cari" placeholder="Toko, sales, barang, no nota…"
                 autocomplete="off" enterkeyhint="search"></div>
      </div>
      <div class="tombol-baris aksi-order">
        <button type="button" class="btn" id="btn-segarkan">${ikon('segarkan', 19)}Segarkan</button>
        <button type="button" class="btn abu kecil" id="btn-salin">${ikon('tempel', 17)}Salin tabel</button>
        <button type="button" class="btn abu kecil" id="btn-excel">${ikon('unduh', 17)}Excel</button>
        <button type="button" class="btn abu kecil" id="btn-sheet">${ikon('unduh', 17)}Google Sheet</button>
      </div>
      <div class="info-segar" id="info-segar" aria-live="polite"></div>
    </div>
    <div class="ringkas empat" id="ringkas"></div>
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

  const inD1 = panel.querySelector('#d1');
  const inD2 = panel.querySelector('#d2');
  const inCari = panel.querySelector('#f-cari');
  const btnSegarkan = panel.querySelector('#btn-segarkan');
  const elInfo = panel.querySelector('#info-segar');
  const elHasil = panel.querySelector('#hasil');

  const BATAS_ORDER = 5000;  // per tarikan; lebih dari ini -> admin diminta mempersempit tanggal
  let pesanan = [];          // hasil tarikan terakhir
  let idBaru = new Set();    // order yang muncul sejak tarikan sebelumnya
  let idLama = null;         // id order pada tarikan sebelumnya (null = belum pernah)
  let kunciLama = '';        // saringan pada tarikan sebelumnya
  let tampil = [];           // baris yang sedang terlihat, untuk Salin tabel & unduh
  let status = 'pending';    // saringan status nota: semua | pending | sudah
  // Barang yang statusnya baru diubah TIDAK langsung hilang dari saringan
  // Pending/Sudah — supaya salah centang masih bisa dibatalkan di tempat.
  // Dikosongkan saat saringan diganti atau Segarkan ditekan.
  let tetapTampil = new Set();
  const menyimpan = new Map(); // id barang -> no nota yang sedang dikirim

  const KOLOM_ORDER =
    'id,no_pesanan,tanggal,sales_id,toko_id,toko_nama,catatan,total,' +
    'pesanan_item(id,urut,barang_id,barang_nama,satuan,qty,harga,harga_per_kg,berat_kg,subtotal,' +
    'nota_dibuat,no_nota,nota_pada),' +
    'pesanan_catatan(id,teks,dibuat_pada,dibaca_pada)';

  async function tarik() {
    const d1 = inD1.value || awal;
    const d2 = inD2.value || akhir;
    // dua syarat pada kolom yang sama -> pakai penyaring "and"
    const q = {
      select: KOLOM_ORDER,
      and: `(tanggal.gte.${d1},tanggal.lte.${d2})`,
      order: 'tanggal.desc,id.desc',
      limit: BATAS_ORDER,
    };
    if (sel.value) q.sales_id = 'eq.' + sel.value;
    return db.pilih('pesanan', q);
  }

  /**
   * Tarik ulang dengan saringan yang sama. Order yang belum ada pada tarikan
   * sebelumnya ditandai BARU — itulah order yang masuk sejak admin terakhir
   * melihat. Kalau saringannya diganti, tidak ada yang ditandai: bagi saringan
   * baru semuanya "baru", jadi tanda itu tidak berarti apa-apa.
   */
  async function segarkan() {
    const kunci = [inD1.value, inD2.value, sel.value].join('|');
    const asli = btnSegarkan.innerHTML;
    btnSegarkan.disabled = true;
    btnSegarkan.innerHTML = `${ikon('segarkan', 19)}Memuat…`;
    try {
      pesanan = await tarik();
      const sekarang = new Set(pesanan.map((p) => p.id));
      const bandingkan = idLama !== null && kunci === kunciLama;
      idBaru = bandingkan
        ? new Set([...sekarang].filter((id) => !idLama.has(id)))
        : new Set();
      idLama = sekarang;
      kunciLama = kunci;
      tetapTampil = new Set();

      const jam = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit',
      }).format(new Date());
      const penuh = pesanan.length >= BATAS_ORDER;
      elInfo.textContent = `Diperbarui ${jam}` + (bandingkan
        ? (idBaru.size ? ` · ${idBaru.size} order baru` : ' · tidak ada order baru')
        : '') + (penuh
        ? ` · hanya ${BATAS_ORDER.toLocaleString('id-ID')} order terbaru yang tampil, persempit tanggalnya`
        : '');
      elInfo.classList.toggle('ada-baru', idBaru.size > 0 || penuh);
      gambarTabel();
    } catch (e) {
      pesan(e.message || 'Gagal memuat order.', 'salah');
    } finally {
      btnSegarkan.disabled = false;
      btnSegarkan.innerHTML = asli;
    }
  }

  /** Lolos saringan status? Barang yang baru diubah tetap tampil (lihat tetapTampil). */
  function lolosStatus(i) {
    if (status === 'semua' || tetapTampil.has(i.id)) return true;
    return status === 'sudah' ? !!i.nota_dibuat : !i.nota_dibuat;
  }

  /**
   * Hitung baris yang tampil. Cari dulu, baru saringan status.
   * "Pending" dihitung dari semua barang yang cocok dengan pencarian —
   * tidak ikut saringan status — supaya admin selalu tahu sisa pekerjaannya.
   */
  function hitung() {
    const q = inCari.value.trim().toLowerCase();
    const baris = [];
    let nOrder = 0;
    let total = 0;
    let nPending = 0;
    let adaCocok = false;

    for (const p of pesanan) {
      const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
      // Cocok di toko / no order -> semua barangnya ikut.
      // Cocok di nama barang / no nota -> hanya barang itu.
      const cocokOrder = !q ||
        String(p.toko_nama).toLowerCase().includes(q) ||
        String(namaSales[p.sales_id] ?? '').toLowerCase().includes(q) ||
        String(p.no_pesanan).toLowerCase().includes(q);
      const cocok = cocokOrder ? item : item.filter((i) =>
        String(i.barang_nama).toLowerCase().includes(q) ||
        String(i.no_nota ?? '').toLowerCase().includes(q));
      if (cocok.length) adaCocok = true;
      nPending += cocok.filter((i) => !i.nota_dibuat).length;

      const terpilih = cocok.filter(lolosStatus);
      if (!terpilih.length) continue;
      nOrder += 1;
      terpilih.forEach((i, k) => {
        baris.push({ p, i, awalOrder: k === 0 });
        total += Number(i.subtotal || 0);
      });
    }
    return { baris, nOrder, total, nPending, adaCocok };
  }

  function gambarRingkas({ baris, nOrder, total, nPending }) {
    panel.querySelector('#ringkas').innerHTML = `
      <div class="sel"><div class="lbl">Order</div><div class="nilai">${nOrder}</div></div>
      <div class="sel"><div class="lbl">Baris barang</div><div class="nilai">${baris.length}</div></div>
      <div class="sel${nPending ? ' ada-pending' : ''}"><div class="lbl">Pending nota</div><div class="nilai">${nPending}</div></div>
      <div class="sel"><div class="lbl">Total nilai</div><div class="nilai">${esc(rupiah(total))}</div></div>`;
  }

  /** Tanggal ala Excel Indonesia: 05/10/2026. */
  const tglSel = (iso) => String(iso).split('-').reverse().join('/');

  /**
   * Lembar kerja seperti Excel: satu baris per BARANG, garis di setiap sel,
   * nomor baris di kiri, kepala kolom & nomor baris membeku saat digulir,
   * baris total di bawah. Urutan kolom mengikuti contoh pemilik:
   * tanggal - toko - barang - jumlah - harga - jumlah harga (+ no order),
   * lalu di ujung: centang Sudah/Pending dan No Nota dari program nota utama.
   */
  function gambarTabel() {
    const h = hitung();
    const { baris, nOrder, total } = h;
    tampil = baris;
    gambarRingkas(h);

    if (!pesanan.length) {
      elHasil.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('kosong', 40)}</span>Belum ada order pada rentang ini.</div>`;
      return;
    }
    if (!h.adaCocok) {
      elHasil.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('cari', 40)}</span>Tidak ada yang cocok dengan “${esc(inCari.value.trim())}”.</div>`;
      return;
    }
    if (!baris.length) {
      elHasil.innerHTML = status === 'pending'
        ? `<div class="kosong-pesan"><span class="ikon">${ikon('centang', 40)}</span>Semua barang di sini sudah dibuat notanya.</div>`
        : `<div class="kosong-pesan"><span class="ikon">${ikon('kosong', 40)}</span>Belum ada barang yang dibuat notanya di sini.</div>`;
      return;
    }

    elHasil.innerHTML = `
      <div class="lembar-kerja" role="region" aria-label="Order per barang" tabindex="0">
        <table class="sheet">
          <thead><tr>
            <th scope="col" class="k-nomor">#</th>
            <th scope="col">Tanggal</th>
            <th scope="col">Sales</th>
            <th scope="col">Toko</th>
            <th scope="col">Barang</th>
            <th scope="col" class="ang">Jumlah</th>
            <th scope="col" class="ang">Harga</th>
            <th scope="col" class="ang">Jumlah Harga</th>
            <th scope="col">No Order</th>
            <th scope="col" class="k-cek">Nota</th>
            <th scope="col">No Nota</th>
          </tr></thead>
          <tbody>${baris.map((b, k) => barisTabel(b, k + 1)).join('')}</tbody>
          <tfoot><tr>
            <td class="k-nomor"></td>
            <td colspan="6">Total · ${nOrder} order · ${baris.length} barang</td>
            <td class="ang">${esc(angka(total))}</td>
            <td></td>
            <td class="k-cek"></td>
            <td></td>
          </tr></tfoot>
        </table>
      </div>`;
  }

  /** Nomor nota yang tertinggal di barang Pending = nota lama, perlu dibuat ulang. */
  const notaBasi = (i) => !i.nota_dibuat && !!i.no_nota;
  const JUDUL_BASI = 'Nomor nota lama: barang ini diubah setelah notanya dibuat. ' +
                     'Buat nota baru, lalu tempel nomornya di sini.';

  function barisTabel({ p, i, awalOrder }, nomor) {
    const baru = idBaru.has(p.id);
    const adaCatatan = (p.pesanan_catatan || []).length > 0;
    const catatanBaru = (p.pesanan_catatan || []).some((c) => !c.dibaca_pada);
    const basi = notaBasi(i);
    const kelas = [awalOrder && 'awal-order', baru && 'baru', i.nota_dibuat && 'sudah']
      .filter(Boolean).join(' ');
    return `
      <tr class="${kelas}" data-pesanan="${esc(p.id)}" data-item="${esc(i.id)}">
        <td class="k-nomor"${baru ? ' title="Order baru sejak terakhir disegarkan"' : ''}>${baru ? 'BARU' : nomor}</td>
        <td>${esc(tglSel(p.tanggal))}</td>
        <td>${esc(namaSales[p.sales_id] || '—')}</td>
        <td class="k-toko">${esc(p.toko_nama)}${
          catatanBaru
            ? `<span class="tanda-catatan baru" title="Catatan baru dari sales — belum dibaca">${ikon('catatan', 14)}</span>`
            : adaCatatan
              ? `<span class="tanda-catatan" title="Ada catatan tambahan dari sales">${ikon('catatan', 14)}</span>`
              : ''}</td>
        <td>${esc(i.barang_nama)}</td>
        <td class="ang">${esc(angka(i.qty))} ${esc(i.satuan)}</td>
        <td class="ang">${esc(angka(i.harga))}${
          i.harga_per_kg ? `<span class="ket">${esc(angka(i.harga_per_kg))}/kg</span>` : ''}</td>
        <td class="ang k-sub">${esc(angka(i.subtotal))}</td>
        <td><button type="button" class="buka-order" data-buka="${esc(p.id)}"
                    title="Buka order ini">${esc(p.no_pesanan)}</button></td>
        <td class="k-cek"><label class="cek-nota">
          <input type="checkbox" data-cek="${esc(i.id)}"${i.nota_dibuat ? ' checked' : ''}
                 aria-label="Sudah dibuat nota: ${esc(i.barang_nama)}, ${esc(p.toko_nama)}">
          <span class="kotak" aria-hidden="true">${ikon('centang', 16)}</span>
          <span class="teks">${i.nota_dibuat ? 'Sudah' : 'Pending'}</span>
        </label></td>
        <td class="k-nota"><input type="text" class="isi-nota${basi ? ' basi' : ''}"
               data-nota="${esc(i.id)}" value="${esc(i.no_nota ?? '')}"
               placeholder="Tempel no nota" maxlength="60" autocomplete="off"
               autocapitalize="off" spellcheck="false" enterkeyhint="next"
               aria-label="No nota untuk ${esc(i.barang_nama)}, ${esc(p.toko_nama)}"${
               basi ? ` title="${esc(JUDUL_BASI)}"` : ''}></td>
      </tr>`;
  }

  /* ---------- status & nomor nota: disimpan per barang, lewat RPC admin ---------- */

  function cariItem(id) {
    for (const p of pesanan) {
      const i = (p.pesanan_item || []).find((x) => String(x.id) === String(id));
      if (i) return i;
    }
    return null;
  }

  /**
   * Terapkan jawaban server ke data & ke baris di layar TANPA menggambar ulang
   * tabel — fokus, posisi gulir, dan isian yang sedang diketik tidak terganggu.
   */
  function terapkan(r) {
    const i = cariItem(r.id);
    if (!i) return;
    i.nota_dibuat = !!r.nota_dibuat;
    i.no_nota = r.no_nota ?? null;
    i.nota_pada = r.nota_pada ?? null;
    tetapTampil.add(i.id);

    const tr = elHasil.querySelector(`tr[data-item="${CSS.escape(String(i.id))}"]`);
    if (tr) {
      tr.classList.toggle('sudah', i.nota_dibuat);
      const cb = tr.querySelector('[data-cek]');
      cb.checked = i.nota_dibuat;
      tr.querySelector('.cek-nota .teks').textContent = i.nota_dibuat ? 'Sudah' : 'Pending';
      const inp = tr.querySelector('[data-nota]');
      if (document.activeElement !== inp) inp.value = i.no_nota ?? '';
      const basi = notaBasi(i);
      inp.classList.toggle('basi', basi);
      if (basi) inp.title = JUDUL_BASI; else inp.removeAttribute('title');
    }
    gambarRingkas(hitung());
  }

  async function ubahStatus(cb) {
    const mau = cb.checked;
    cb.disabled = true;
    try {
      const hasil = await db.rpc('set_status_nota', { p_item_ids: [Number(cb.dataset.cek)], p_dibuat: mau });
      const r = Array.isArray(hasil) ? hasil[0] : null;
      if (!r) throw new Error('Barang ini sudah tidak ada. Tekan Segarkan.');
      terapkan(r);
    } catch (err) {
      cb.checked = !mau;
      pesan(err.message || 'Gagal menyimpan status nota.', 'salah');
    } finally {
      cb.disabled = false;
    }
  }

  /**
   * Simpan no nota yang ditempel admin. Server yang memutuskan: nomor terisi
   * -> otomatis Sudah. Website tidak pernah membuat nomor nota sendiri.
   */
  async function simpanNota(inp) {
    const id = inp.dataset.nota;
    const i = cariItem(id);
    if (!i) return;
    const nilai = inp.value.trim();
    if (nilai === (i.no_nota ?? '') || menyimpan.get(id) === nilai) return;

    menyimpan.set(id, nilai);
    try {
      const r = await db.rpc('set_no_nota', { p_item_id: Number(id), p_no_nota: nilai });
      if (menyimpan.get(id) !== nilai) return;   // sudah diganti lagi, simpanan berikutnya menang
      if (document.activeElement === inp && inp.value.trim() === nilai) inp.value = r.no_nota ?? '';
      terapkan(r);
      const sel = inp.closest('td');
      sel?.classList.add('tersimpan');
      setTimeout(() => sel?.classList.remove('tersimpan'), 1200);
    } catch (err) {
      if (menyimpan.get(id) === nilai) inp.value = i.no_nota ?? '';
      pesan(err.message || 'Gagal menyimpan no nota.', 'salah');
    } finally {
      if (menyimpan.get(id) === nilai) menyimpan.delete(id);
    }
  }

  elHasil.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-cek]');
    if (cb) { ubahStatus(cb); return; }
    const inp = e.target.closest('[data-nota]');
    if (inp) simpanNota(inp);
  });
  // Tempel = MENGGANTI isi sel (seperti Excel) lalu langsung tersimpan, tanpa
  // Enter. Salinan dari sel Excel/program nota sering membawa Enter di ujung;
  // yang dipakai hanya baris pertama yang berisi.
  elHasil.addEventListener('paste', (e) => {
    const inp = e.target.closest('[data-nota]');
    if (!inp || !e.clipboardData) return;
    const baris = e.clipboardData.getData('text').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!baris.length) return;
    e.preventDefault();
    inp.value = baris[0].slice(0, 60);
    if (baris.length > 1) pesan('Yang ditempel lebih dari satu baris — hanya baris pertama yang dipakai.', 'salah');
    simpanNota(inp);
  });
  // Masuk ke isian = isinya terblok, jadi tempelan MENGGANTI nomor lama.
  elHasil.addEventListener('focusin', (e) => {
    const inp = e.target.closest('[data-nota]');
    if (inp) inp.select();
  });
  // Enter = simpan & turun ke baris berikutnya, seperti Excel. Esc = batal.
  elHasil.addEventListener('keydown', (e) => {
    const inp = e.target.closest('[data-nota]');
    if (!inp) return;
    if (e.key === 'Escape') {
      inp.value = cariItem(inp.dataset.nota)?.no_nota ?? '';
      inp.blur();
      return;
    }
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const semua = [...elHasil.querySelectorAll('[data-nota]')];
    const lanjut = semua[semua.indexOf(inp) + 1];
    if (lanjut) lanjut.focus(); else inp.blur();
  });

  function keteranganNota(i) {
    if (i.nota_dibuat) return i.no_nota ? `Nota ${i.no_nota}` : 'Nota sudah dibuat';
    return i.no_nota ? `Nota pending · nomor lama ${i.no_nota}` : 'Nota pending';
  }

  /** Order lengkap: rincian, catatan, lalu Ubah / Hapus. */
  function bukaDetail(p) {
    const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
    const catatan = p.pesanan_catatan || [];
    const tirai = lembar(`Order ${p.no_pesanan}`, `
      <div class="detail-kepala">
        <div class="toko">${esc(p.toko_nama)}</div>
        <div class="bantuan" style="margin:4px 0 0">
          ${esc(tanggalPendek(p.tanggal))} · ${esc(namaSales[p.sales_id] || '—')}</div>
      </div>
      <div class="riwayat-isi detail-isi">
        <table>${item.map((i) => `<tr><td>${esc(i.barang_nama)}
            <div class="ket">${esc(rincianItem(i))}</div>
            <div class="ket ket-nota${i.nota_dibuat ? ' sudah' : ''}">${esc(keteranganNota(i))}</div></td>
            <td>${esc(rupiah(i.subtotal))}</td></tr>`).join('')}</table>
        ${p.catatan ? `<div class="ket catatan-cap">${ikon('catatan', 14)}${esc(p.catatan)}</div>` : ''}
        ${daftarCatatanHtml(catatan)}
      </div>
      ${catatan.some((c) => !c.dibaca_pada) ? `
      <button type="button" class="btn garis kecil" data-aksi="baca" style="width:100%;margin-bottom:10px">
        ${ikon('centang', 17)}Tandai catatan sudah dibaca</button>` : ''}
      <div class="total-kotak">
        <span class="lbl">Total order</span>
        <span class="nilai">${esc(rupiah(p.total))}</span>
      </div>
      <div class="tombol-baris">
        <button type="button" class="btn kecil" data-aksi="ubah" style="width:100%">Ubah order</button>
        <button type="button" class="btn abu kecil" data-aksi="hapus"
                style="width:100%;color:var(--merah)">Hapus</button>
      </div>`);

    tirai.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-aksi]');
      if (!b) return;
      if (b.dataset.aksi === 'baca') {
        b.disabled = true;
        try {
          await db.rpc('tandai_catatan_dibaca', { p_pesanan_id: Number(p.id) });
          pesan('Catatan ditandai sudah dibaca.', 'ok');
          tirai.remove();
          ctx.segarkanLencana?.();
          segarkan();
        } catch (err) {
          b.disabled = false;
          pesan(err.message, 'salah');
        }
        return;
      }
      if (b.dataset.aksi === 'ubah') {
        tirai.remove();
        bukaUbahOrder(p, ctx, segarkan);
        return;
      }
      if (!(await tanya('Hapus order?',
        `${p.no_pesanan} · ${p.toko_nama} — order dan semua barangnya hilang permanen.`,
        'Ya, hapus'))) return;
      try {
        await db.rpc('hapus_pesanan', { p_id: Number(p.id) });
        pesan('Order dihapus.', 'ok');
        tirai.remove();
        segarkan();
      } catch (err) {
        pesan(err.message, 'salah');
      }
    });
  }

  function bukaBaris(id) {
    const p = pesanan.find((x) => String(x.id) === String(id));
    if (p) bukaDetail(p);
  }

  // Klik sel = baris itu jadi baris aktif (nomor barisnya menyala), seperti
  // sel aktif di Excel — membantu admin tidak salah baris saat menyalin ke
  // program nota. Teks di sel tetap bisa diblok & disalin. Order dibuka lewat
  // nomor order di ujung baris, atau dobel-klik barisnya.
  elHasil.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buka]');
    if (b) { bukaBaris(b.dataset.buka); return; }
    const tr = e.target.closest('tbody tr[data-pesanan]');
    if (!tr) return;
    elHasil.querySelectorAll('tr.terpilih').forEach((x) => x.classList.remove('terpilih'));
    tr.classList.add('terpilih');
  });
  elHasil.addEventListener('dblclick', (e) => {
    // dobel-klik di isian no nota = memblok teks, bukan membuka order
    if (e.target.closest('[data-buka], .k-cek, .k-nota')) return;
    const tr = e.target.closest('tbody tr[data-pesanan]');
    if (tr) bukaBaris(tr.dataset.pesanan);
  });

  /**
   * Salin semua baris yang sedang tampil sebagai teks bertab. Ditempel di
   * Excel / Google Sheets, kolomnya langsung terpisah. Angka ditulis polos
   * (10000, bukan "10.000") supaya dibaca sebagai angka; desimal pakai koma
   * seperti Excel Indonesia.
   */
  async function salinTabel() {
    if (!tampil.length) { pesan('Tidak ada baris untuk disalin.', 'salah'); return; }
    const des = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
    const sel1 = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
    const teks = [
      ['Tanggal', 'Sales', 'Toko', 'Barang', 'Jumlah', 'Satuan', 'Harga', 'Jumlah Harga', 'No Order',
       'Status Nota', 'No Nota'],
      ...tampil.map(({ p, i }) => [
        tglSel(p.tanggal), namaSales[p.sales_id] || '', p.toko_nama, i.barang_nama, des(i.qty), i.satuan,
        des(i.harga), des(i.subtotal), p.no_pesanan,
        i.nota_dibuat ? 'Sudah' : 'Pending', i.no_nota ?? '',
      ]),
    ].map((r) => r.map(sel1).join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(teks);
      pesan(`${tampil.length} baris disalin. Tempel di Excel atau program nota.`, 'ok');
    } catch {
      pesan('Perangkat ini tidak mengizinkan menyalin otomatis. Pakai tombol Excel.', 'salah');
    }
  }

  panel.querySelector('#btn-salin').addEventListener('click', () => salinTabel());

  btnSegarkan.addEventListener('click', () => segarkan());
  inD1.addEventListener('change', () => segarkan());
  inD2.addEventListener('change', () => segarkan());
  sel.addEventListener('change', () => segarkan());
  inCari.addEventListener('input', () => gambarTabel());
  panel.querySelector('#f-status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]');
    if (!b || b.dataset.status === status) return;
    status = b.dataset.status;
    tetapTampil = new Set();
    panel.querySelectorAll('#f-status [data-status]').forEach((x) => {
      const aktif = x === b;
      x.classList.toggle('aktif', aktif);
      x.setAttribute('aria-pressed', String(aktif));
    });
    gambarTabel();
  });

  /**
   * Satu fungsi untuk dua tujuan.
   *   'excel' -> pemisah ";" + baris sep= + desimal koma  (Excel Indonesia)
   *   'sheet' -> pemisah ","  tanpa sep=  + desimal titik  (Google Sheets)
   * Google Sheets tidak mengerti baris "sep=;", makanya berkas Excel
   * jatuh ke satu kolom di sana.
   * Yang diunduh = yang sedang terlihat di lembar kerja (tanggal, sales,
   * status nota, pencarian), dengan status & no nota terbaru dari server.
   */
  async function ekspor(tujuan, tombol) {
    const asli = tombol.innerHTML;   // innerHTML, bukan textContent: tombolnya berikon
    tombol.disabled = true;
    tombol.textContent = 'Menyiapkan…';
    try {
      const d1 = inD1.value || awal;
      const d2 = inD2.value || akhir;
      const q = {
        select: 'tanggal,no_pesanan,sales,toko,barang,satuan,jumlah,harga,' +
                'harga_per_kg,total_kg,subtotal,catatan,item_id,nota_dibuat,no_nota',
        and: `(tanggal.gte.${d1},tanggal.lte.${d2})`,
        order: 'tanggal.desc,no_pesanan.desc,urut.asc',
        limit: 20000,
      };
      if (sel.value) q.sales_id = 'eq.' + sel.value;
      const idTampil = new Set(tampil.map(({ i }) => String(i.id)));
      const baris = (await db.pilih('v_ekspor', q)).filter((r) => idTampil.has(String(r.item_id)));
      if (!baris.length) { pesan('Tidak ada data untuk diunduh.', 'salah'); return; }

      const kolom = ['Tanggal', 'No Order', 'Sales', 'Toko', 'Barang', 'Satuan',
                     'Jumlah', 'Harga Satuan', 'Harga per Kg', 'Total Kg',
                     'Subtotal', 'Catatan', 'Status Nota', 'No Nota'];
      const st = (r) => (r.nota_dibuat ? 'Sudah' : 'Pending');

      let isi;
      if (tujuan === 'sheet') {
        // angka dikirim sebagai number -> desimal titik, dibaca sebagai angka
        const n = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));
        isi = keCSVSheet(kolom, baris.map((r) => [
          r.tanggal, r.no_pesanan, r.sales, r.toko, r.barang, r.satuan,
          n(r.jumlah), n(r.harga), n(r.harga_per_kg), n(r.total_kg),
          n(r.subtotal), r.catatan || '', st(r), r.no_nota || '',
        ]));
      } else {
        // Excel Indonesia: desimal pakai koma
        const des = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
        isi = keCSV(kolom, baris.map((r) => [
          r.tanggal, r.no_pesanan, r.sales, r.toko, r.barang, r.satuan,
          des(r.jumlah), des(r.harga), des(r.harga_per_kg), des(r.total_kg),
          des(r.subtotal), r.catatan || '', st(r), r.no_nota || '',
        ]));
      }

      const nama = `order-${d1}-sd-${d2}${tujuan === 'sheet' ? '-sheet' : ''}.csv`;
      await unduh(nama, isi);
      const ket = { semua: '', pending: ' (Pending saja)', sudah: ' (Sudah saja)' }[status];
      pesan(`${baris.length} baris diunduh${ket}.` +
            (tujuan === 'sheet' ? ' Buka Google Sheets → File → Import.' : ' Buka dengan Excel.'),
            'ok');
    } catch (err) {
      pesan(err.message || 'Gagal mengunduh.', 'salah');
    } finally {
      tombol.disabled = false;
      tombol.innerHTML = asli;
    }
  }

  panel.querySelector('#btn-excel').addEventListener('click',
    (e) => ekspor('excel', e.currentTarget));
  panel.querySelector('#btn-sheet').addEventListener('click',
    (e) => ekspor('sheet', e.currentTarget));

  await segarkan();

  // Diminta lonceng notifikasi: buka order itu. Kalau di luar rentang tanggal
  // yang tampil, ambil sendiri.
  if (bukaOrderNanti) {
    const id = bukaOrderNanti;
    bukaOrderNanti = null;
    let p = pesanan.find((x) => Number(x.id) === id);
    if (!p) {
      try {
        p = (await db.pilih('pesanan', { select: KOLOM_ORDER, id: 'eq.' + id }))[0];
      } catch { /* ditangani di bawah */ }
    }
    if (p) bukaDetail(p);
    else pesan('Order itu tidak ditemukan — mungkin sudah dihapus.', 'salah');
  }
}

/* ============================================================
   CATATAN TAMBAHAN DARI SALES — dipakai rincian order
   ============================================================ */
const FMT_WAKTU_CATATAN = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit',
});

/** Daftar catatan; yang belum dibaca admin diberi tanda BARU. Lama ke baru. */
function daftarCatatanHtml(catatan) {
  if (!catatan?.length) return '';
  const urut = catatan.slice()
    .sort((a, b) => String(a.dibuat_pada).localeCompare(String(b.dibuat_pada)));
  return `<div class="catatan-daftar">${urut.map((c) => {
    const baru = !c.dibaca_pada;
    return `<div class="catatan-baris${baru ? ' baru' : ''}">${esc(c.teks)}
      <span class="siapa">${baru ? '<span class="tanda nota-pending">Baru</span>' : ''}
        ${esc(FMT_WAKTU_CATATAN.format(new Date(c.dibuat_pada)))}${baru ? '' : ' · sudah dibaca'}</span></div>`;
  }).join('')}</div>`;
}

/** Admin mengubah order. Hanya admin yang boleh. */
function bukaUbahOrder(p, ctx, selesai) {
  const item = (p.pesanan_item || []).slice().sort((a, b) => a.urut - b.urut);
  const nBernota = item.filter((i) => i.nota_dibuat).length;

  const tirai = lembar('Ubah order', `
    <div class="bantuan" style="margin:0 0 14px">
      Order <span class="kode">${esc(p.no_pesanan)}</span> ·
      ${esc(tanggalPendek(p.tanggal))} · sekarang ${esc(rupiah(p.total))}
    </div>
    ${nBernota ? `<div class="peringatan"><b>${nBernota} barang sudah dibuat notanya</b>
      Barang yang jumlah atau harganya diubah kembali Pending; nomor nota
      lamanya tampil dicoret supaya notanya dibuat ulang.</div>` : ''}
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
        <button type="button" class="btn abu kecil" id="btn-impor" style="width:auto">${ikon('tempel', 17)}Tempel dari Excel</button>
      </div>
      <div class="bantuan" id="hitung"></div>
    </div>
    <div id="isi-master"></div>`;

  const wadah = panel.querySelector('#isi-master');
  const cari = panel.querySelector('#cari');

  async function muat() {
    data = await db.pilih(o.tabel, { select: o.select, order: 'nama.asc,id.asc', limit: 5000 });
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
      wadah.innerHTML = `<div class="kosong-pesan"><span class="ikon">${ikon('kosong', 40)}</span>${
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
          <button type="button" class="tutup" aria-label="Tutup">${ikon('silang', 18)}</button>
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
          <button type="button" class="tutup" aria-label="Tutup">${ikon('silang', 18)}</button>
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
          <button type="button" class="tutup" aria-label="Tutup">${ikon('silang', 18)}</button>
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
