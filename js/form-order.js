// Form isi order yang dipakai di DUA tempat:
//   1. Sales membuat order baru   (pages/order.js)
//   2. Admin mengubah order       (pages/admin.js)
// Satu tempat saja supaya aturan harga per-kilo tidak ditulis berulang.

import { ikon } from './ikon.js';
import { buatPilih } from './pilih.js';
import { esc, rupiah, angka, keAngka, keJumlah, pesan, tanya } from './util.js';

const F_TGL = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
/** "12 Nov" — cukup untuk "kapan terakhir"; tahunnya hampir selalu tahun ini. */
const tglSingkat = (iso) => (iso ? F_TGL.format(new Date(iso + 'T00:00:00+07:00')) : '');

/**
 * Keterangan koli di bawah Jumlah: "1 koli = 144 PCS", atau setelah jumlah
 * diisi "288 PCS = 2 koli" / "300 PCS = 2 koli + 12 PCS". Jumlah TETAP
 * dalam satuan jual — koli hanya membantu sales menghitung, tidak mengubah
 * harga maupun cara kerja barang per-kilo.
 */
export function teksKoli(qty, isi, sat) {
  if (!isi) return '';
  if (qty > 0 && qty >= isi) {
    const koli = Math.floor(qty / isi + 1e-9);
    const sisa = Math.round((qty - koli * isi) * 100) / 100;
    return `${angka(qty)} ${sat} = ${angka(koli)} koli` + (sisa > 0 ? ` + ${angka(sisa)} ${sat}` : '');
  }
  return `1 koli = ${angka(isi)} ${sat}`;
}

/**
 * @param {object} o
 * @param {object} o.status            status aplikasi (punya .toko, .barang, .tokoSaya)
 * @param {object} [o.awal]            isi awal: {toko:{id,nama,info}, catatan, item:[...]}
 * @param {boolean} [o.pakaiCatatan]   tampilkan kotak catatan (default true)
 * @param {() => void} [o.saatUbah]    dipanggil setiap ada perubahan
 * @param {(toko:object|null, slot:HTMLElement) => void} [o.saatToko]
 *                                     dipanggil saat toko dipilih/diganti (juga untuk isi awal);
 *                                     `slot` = tempat kosong di bawah pilihan toko
 * @param {(tokoId:number) => Promise<Array>} [o.ambilHargaTerakhir]
 *                                     harga terakhir per barang ke toko itu (RPC harga_terakhir)
 * @param {string} [o.ketHargaLalu]    awalan keterangannya, default "Terakhir ke toko ini"
 * @returns {{el:HTMLElement, baca:Function, total:Function, salah:Function, fokusToko:Function}}
 */
let nomorForm = 0;

export function buatFormOrder(o) {
  const pakaiCatatan = o.pakaiCatatan !== false;
  const uid = 'f' + ++nomorForm;   // id unik: dua form boleh hidup bersamaan

  const el = document.createElement('div');
  // Kelas fo-* hanya penanda tata letak: di halaman Buat Order versi komputer
  // (mode desktop admin) blok-blok ini disusun dua kolom oleh CSS.
  el.className = 'form-order';
  el.innerHTML = `
    <div class="kartu fo-toko" data-slot="toko"></div>

    <div class="kartu fo-barang">
      <div class="judul-bagian">Barang yang dipesan</div>
      <div data-slot="item"></div>
      <button type="button" class="btn garis" data-aksi="tambah">+ Tambah barang</button>
    </div>

    <div class="kartu fo-catatan">
      <button type="button" class="tombol-cash" data-slot="cash" aria-pressed="false">
        <span class="kotak-cash" aria-hidden="true">${ikon('centang', 16)}</span>
        <span class="teks-cash"><b>CASH</b><small>Ketuk kalau toko bayar tunai</small></span>
      </button>
      ${pakaiCatatan ? `
      <label class="label" for="catatan-${uid}" style="margin-top:14px">Catatan</label>
      <textarea id="catatan-${uid}" data-slot="catatan"
                placeholder="Contoh: kirim besok pagi, minta nota terpisah…"></textarea>` : ''}
    </div>

    <div class="total-kotak fo-total">
      <span class="lbl">Total order</span>
      <span class="nilai" data-slot="total">Rp 0</span>
    </div>`;

  const slotToko = el.querySelector('[data-slot="toko"]');
  const slotItem = el.querySelector('[data-slot="item"]');
  const elCatatan = el.querySelector('[data-slot="catatan"]');
  const elTotal = el.querySelector('[data-slot="total"]');
  const elCash = el.querySelector('[data-slot="cash"]');

  // ---------------- CASH ----------------
  // Satu ketukan menggantikan catatan "cash"/"kontan" yang dulu diketik
  // (pemilik, 21 Nov 2026). Di rekap admin tampil sebagai tempo "CASH".
  let cash = false;
  function aturCash(v) {
    cash = !!v;
    elCash.classList.toggle('aktif', cash);
    elCash.setAttribute('aria-pressed', String(cash));
    elCash.querySelector('small').textContent = cash ? 'Toko bayar tunai — bukan tempo' : 'Ketuk kalau toko bayar tunai';
  }
  elCash.addEventListener('click', () => { aturCash(!cash); o.saatUbah?.(); });

  // ---------------- harga terakhir per toko (milik sales ini) ----------------
  // Harga hampir selalu hasil nego per toko; harga yang sama dengan order
  // terakhir ke toko itu terulang 94% kali. Server hanya mengirim harga dari
  // sales yang sedang masuk — harga sales lain ke toko yang sama tidak terlihat.
  const ketHargaLalu = o.ketHargaLalu || 'Terakhir ke toko ini';
  let hargaLalu = new Map();   // barang_id -> {harga, harga_per_kg, tanggal}
  let nomorHarga = 0;
  async function muatHargaLalu(t) {
    const no = ++nomorHarga;
    hargaLalu = new Map();
    items.forEach((b) => b.terapkanHargaLalu());
    if (!o.ambilHargaTerakhir || !t?.id) { ubah(); return; }
    try {
      const rows = await o.ambilHargaTerakhir(t.id);
      if (no !== nomorHarga) return;   // toko sudah diganti lagi
      hargaLalu = new Map((rows || []).map((r) => [String(r.barang_id), r]));
      items.forEach((b) => b.terapkanHargaLalu());
      ubah();
    } catch { /* tanpa sinyal: tetap pakai harga rekomendasi */ }
  }

  // ---------------- toko ----------------
  function dataToko() {
    const punyaSaya = o.status.tokoSaya;
    const semua = o.status.toko.map((t) => ({
      id: t.id,
      nama: t.nama,
      info: [t.kota, t.kode, t.alamat].filter(Boolean).join(' · '),
      kata: t.kode || '',
      milikSaya: punyaSaya ? punyaSaya.has(t.id) : false,
    }));
    return semua;
  }

  const pilihToko = buatPilih({
    label: 'Nama toko / pelanggan',
    judul: 'Pilih toko',
    placeholder: 'Ketuk untuk memilih toko…',
    data: dataToko,
    saring: o.status.tokoSaya && o.status.tokoSaya.size
      ? [
          { kunci: 'saya', teks: 'Toko saya', uji: (d) => d.milikSaya },
          { kunci: 'semua', teks: 'Semua toko', uji: () => true },
        ]
      : null,
    saatPilih: () => {
      ubah();
      const t = pilihToko.nilai();
      muatHargaLalu(t);
      o.saatToko?.(t, slotTokoEkstra);
    },
  });
  slotToko.appendChild(pilihToko.el);
  const slotTokoEkstra = document.createElement('div');
  slotTokoEkstra.className = 'toko-ekstra';
  slotToko.appendChild(slotTokoEkstra);

  // ---------------- item ----------------
  const items = [];

  function dataBarang() {
    return o.status.barang.map((b) => {
      const berat = Number(b.berat_kg) || null;
      const koli = Number(b.isi_koli) || null;
      const rek = Number(b.harga_rekomendasi) || 0;
      // Untuk barang per-kilo, harga_rekomendasi berarti harga per KG.
      const info = berat
        ? (rek ? `${rupiah(rek)}/kg · ` : 'harga per kg · ') +
          `1 ${b.satuan} = ${angka(berat)} kg`
        : `${rupiah(rek)} / ${b.satuan}`;
      return {
        id: b.id,
        nama: b.nama,
        info: info + (koli ? ` · 1 koli = ${angka(koli)} ${b.satuan}` : '') + (b.kode ? ` · ${b.kode}` : ''),
        kata: b.kode || '',
        satuan: b.satuan,
        berat_kg: berat,
        isi_koli: koli,
        harga_rekomendasi: rek,
      };
    });
  }

  /** Identitas barang di satu baris: id master, atau nama untuk barang ketikan bebas. */
  function kunciBarang(id, nama) {
    return id !== null && id !== undefined
      ? 'id:' + id
      : 'nama:' + String(nama || '').trim().toLowerCase();
  }

  /** Isi koli barang dari master (untuk draf & ubah order yang hanya menyimpan id). */
  function koliDari(barangId) {
    if (!barangId) return null;
    const b = o.status.barang.find((x) => String(x.id) === String(barangId));
    return Number(b?.isi_koli) || null;
  }

  function tambahItem(awal) {
    // hargaOtomatis: harga diisi aplikasi (rekomendasi / harga terakhir), belum
    // diketik sales — boleh diganti otomatis kalau tokonya diganti.
    const baris = { satuan: 'PCS', beratKg: null, isiKoli: null, rek: 0, hargaOtomatis: false };

    const kotak = document.createElement('div');
    kotak.className = 'item';
    kotak.innerHTML = `
      <div class="item-atas">
        <span class="no"></span>
        <b>Barang</b>
        <button type="button" class="buang" aria-label="Hapus barang">${ikon('silang', 18)}</button>
      </div>
      <div data-slot="pilih"></div>
      <div class="dua">
        <div>
          <label class="label">Jumlah</label>
          <input type="text" class="qty" inputmode="decimal" placeholder="0" enterkeyhint="next">
          <div class="bantuan satuan-teks">satuan: -</div>
          <div class="bantuan koli-teks" hidden></div>
        </div>
        <div>
          <label class="label label-harga">Harga satuan</label>
          <input type="text" class="harga" inputmode="numeric" placeholder="0" enterkeyhint="done">
          <div class="bantuan rekom">&nbsp;</div>
          <button type="button" class="harga-lalu" hidden></button>
        </div>
      </div>
      <div class="sub-item"><span>Subtotal</span><b class="sub">Rp 0</b></div>`;

    const inQty = kotak.querySelector('.qty');
    const inHarga = kotak.querySelector('.harga');
    const elSub = kotak.querySelector('.sub');
    const elSatuan = kotak.querySelector('.satuan-teks');
    const elKoli = kotak.querySelector('.koli-teks');
    const elRekom = kotak.querySelector('.rekom');
    const elLabelHarga = kotak.querySelector('.label-harga');
    const elLalu = kotak.querySelector('.harga-lalu');

    const pilihBarang = buatPilih({
      label: 'Nama barang',
      judul: 'Pilih barang',
      ketMirip: 'Mungkin maksud Anda? Cek merek & ukurannya',
      placeholder: 'Ketuk untuk memilih barang…',
      data: dataBarang,
      saatPilih: (v) => {
        // Barangnya benar-benar BERGANTI, atau sales hanya memilih ulang barang
        // yang sama? Dulu harga barang lama ikut tertinggal saat barang diganti
        // (semen Rp 52.000 -> paku tetap Rp 52.000). Memilih ulang barang yang
        // sama tetap mempertahankan harga nego yang sudah diketik.
        const sebelumnya = baris.kunci;
        baris.kunci = kunciBarang(v?.id, v?.nama);
        const sama = sebelumnya === baris.kunci;
        const ganti = sebelumnya !== undefined && !sama;
        if (v?.ekstra) {
          const e = v.ekstra;
          const rek = Number(e.harga_rekomendasi) || 0;
          baris.satuan = e.satuan;
          baris.beratKg = e.berat_kg || null;
          baris.isiKoli = e.isi_koli || null;
          baris.rek = rek;
          // harga awalan: harga terakhir sales ini ke toko ini, kalau ada; kalau
          // tidak, harga rekomendasi (untuk barang per-kilo = harga per KG)
          const awalan = hargaAwalan(v.id);
          if (baris.beratKg) {
            elLabelHarga.textContent = 'Harga per kg';
            inHarga.placeholder = 'harga 1 kg';
            elSatuan.textContent = `satuan: ${e.satuan} · 1 ${e.satuan} = ${angka(baris.beratKg)} kg`;
            if (!sama || baris.hargaOtomatis) {
              inHarga.value = awalan ? angka(awalan) : '';
              baris.hargaOtomatis = true;
            }
          } else {
            elLabelHarga.textContent = 'Harga satuan';
            inHarga.placeholder = '0';
            elSatuan.textContent = 'satuan: ' + e.satuan;
            elRekom.textContent = rek ? 'Rekomendasi ' + rupiah(rek) : 'Belum ada harga di daftar — isi sendiri';
            // Pilihan pertama: harga yang sudah diketik sebelum memilih barang dibiarkan.
            if (ganti || !keAngka(inHarga.value) || baris.hargaOtomatis) {
              inHarga.value = awalan ? angka(awalan) : '';
              baris.hargaOtomatis = true;
            }
          }
        } else {
          baris.satuan = 'PCS';
          baris.beratKg = null;
          baris.isiKoli = null;
          elLabelHarga.textContent = 'Harga satuan';
          inHarga.placeholder = '0';
          elSatuan.textContent = 'satuan: PCS (barang baru)';
          elRekom.textContent = 'Barang baru — isi harga sendiri';
          baris.rek = 0;
          if (ganti) inHarga.value = '';
        }
        tulisKetLalu();
        ubah();
        if (!keJumlah(inQty.value)) inQty.focus();
      },
    });
    kotak.querySelector('[data-slot="pilih"]').appendChild(pilihBarang.el);
    baris.bukaPilih = () => pilihBarang.buka();

    /** Harga yang dipakai sebagai awalan untuk barang ini (0 = tidak ada). */
    function hargaAwalan(id) {
      const lalu = id !== null && id !== undefined ? hargaLalu.get(String(id)) : null;
      if (lalu) return Number(baris.beratKg ? lalu.harga_per_kg : lalu.harga) || baris.rek;
      return baris.rek;
    }
    /** Keterangan "Terakhir ke toko ini: Rp …" — diketuk = harganya dipakai. */
    function tulisKetLalu() {
      const id = pilihBarang.nilai()?.id;
      const lalu = id !== null && id !== undefined ? hargaLalu.get(String(id)) : null;
      const h = lalu ? Number(baris.beratKg ? lalu.harga_per_kg : lalu.harga) : 0;
      elLalu.hidden = !h;
      if (h) {
        elLalu.dataset.harga = String(h);
        elLalu.innerHTML = `${esc(ketHargaLalu)}: <b>${esc(rupiah(h))}${baris.beratKg ? '/kg' : ''}</b>`
          + ` · ${esc(tglSingkat(lalu.tanggal))}`;
      }
    }
    // Toko diganti: keterangan ikut, dan harga yang masih buatan aplikasi
    // (belum diketik sales) diganti harga terakhir toko yang baru.
    baris.terapkanHargaLalu = () => {
      tulisKetLalu();
      const id = pilihBarang.nilai()?.id;
      if (baris.hargaOtomatis && id !== null && id !== undefined) {
        const h = hargaAwalan(id);
        inHarga.value = h ? angka(h) : '';
      }
    };
    elLalu.addEventListener('click', () => {
      inHarga.value = angka(Number(elLalu.dataset.harga) || 0);
      baris.hargaOtomatis = true;
      ubah();
    });

    inQty.addEventListener('input', ubah);
    inHarga.addEventListener('input', () => { baris.hargaOtomatis = false; ubah(); });
    inHarga.addEventListener('blur', () => {
      const n = keAngka(inHarga.value);
      inHarga.value = n ? angka(n) : '';
    });

    kotak.querySelector('.buang').addEventListener('click', async () => {
      if (items.length === 1) { pesan('Minimal harus ada satu barang.', 'salah'); return; }
      const nama = pilihBarang.nilai()?.nama;
      if (nama && !(await tanya('Hapus barang ini?', nama, 'Ya, hapus'))) return;
      const i = items.indexOf(baris);
      if (i >= 0) items.splice(i, 1);
      kotak.remove();
      nomori();
      ubah();
    });

    baris.el = kotak;
    baris.subEl = elSub;

    baris.baca = () => {
      const v = pilihBarang.nilai();
      const diisi = keAngka(inHarga.value);
      const d = {
        barang_id: v?.id ?? null,
        barang_nama: v?.nama || '',
        satuan: baris.satuan || 'PCS',
        qty: keJumlah(inQty.value),
        harga: diisi,
      };
      if (baris.beratKg) {
        d.harga_per_kg = diisi;
        d.berat_kg = baris.beratKg;
        d.harga = Math.round(diisi * baris.beratKg * 100) / 100;
      }
      return d;
    };

    baris.perbaruiInfo = (d) => {
      const tk = teksKoli(d.qty, baris.isiKoli, baris.satuan);
      elKoli.textContent = tk;
      elKoli.hidden = !tk;
      if (!baris.beratKg) return;
      const sat = baris.satuan;
      elSatuan.textContent = d.qty
        ? `${angka(d.qty)} ${sat} = ${angka(d.qty * baris.beratKg)} kg`
        : `1 ${sat} = ${angka(baris.beratKg)} kg`;
      elRekom.textContent = d.harga_per_kg ? `= ${rupiah(d.harga)} / ${sat}` : 'Isi harga per kg';
    };

    baris.tulis = (d) => {
      if (d.barang_nama) {
        baris.kunci = kunciBarang(d.barang_id, d.barang_nama);
        baris.satuan = d.satuan || 'PCS';
        baris.beratKg = Number(d.berat_kg) || null;
        baris.isiKoli = koliDari(d.barang_id);
        baris.rek = Number(o.status.barang.find((x) => String(x.id) === String(d.barang_id))?.harga_rekomendasi) || 0;
        let info = '';
        if (baris.beratKg) {
          info = `harga per kg · 1 ${baris.satuan} = ${angka(baris.beratKg)} kg`;
          elLabelHarga.textContent = 'Harga per kg';
          inHarga.placeholder = 'harga 1 kg';
        } else {
          if (!d.barang_id) info = 'barang baru';
          elSatuan.textContent = 'satuan: ' + baris.satuan;
        }
        pilihBarang.set({ id: d.barang_id, nama: d.barang_nama, info });
      }
      if (d.qty) inQty.value = angka(d.qty);
      const h = baris.beratKg ? d.harga_per_kg : d.harga;
      if (h) inHarga.value = angka(h);
      tulisKetLalu();
    };

    items.push(baris);
    slotItem.appendChild(kotak);
    nomori();
    if (awal) baris.tulis(awal);
    return baris;
  }

  function nomori() {
    items.forEach((b, i) => { b.el.querySelector('.no').textContent = i + 1; });
  }

  function ubah() {
    let total = 0;
    for (const b of items) {
      const d = b.baca();
      const sub = d.qty * d.harga;
      total += sub;
      b.subEl.textContent = rupiah(sub);
      b.perbaruiInfo(d);
    }
    elTotal.textContent = rupiah(total);
    o.saatUbah?.();
    return total;
  }

  // "Tambah barang" langsung membuka daftar barang: langkah berikutnya memang
  // selalu memilih barang, jadi satu ketukan dihemat untuk setiap barang.
  // Gulirnya INSTAN, bukan halus: saat lembar terbuka, util.js mencatat posisi
  // halaman — posisi di tengah animasi akan tercatat salah, dan setelah lembar
  // ditutup pengguna mendarat di tempat yang keliru.
  el.querySelector('[data-aksi="tambah"]').addEventListener('click', () => {
    const b = tambahItem();
    b.el.scrollIntoView({ block: 'center', behavior: 'instant' });
    b.bukaPilih();
  });

  elCatatan?.addEventListener('input', () => o.saatUbah?.());

  // ---------------- isi awal ----------------
  const awal = o.awal;
  if (awal?.toko) pilihToko.set(awal.toko);
  aturCash(awal?.cash);
  if (awal?.catatan && elCatatan) elCatatan.value = awal.catatan;
  if (awal?.item?.length) awal.item.forEach((i) => tambahItem(i));
  else tambahItem();
  ubah();
  // Ditunda satu putaran: pemanggil baru menerima `form` setelah fungsi ini selesai.
  if (awal?.toko) {
    setTimeout(() => {
      const t = pilihToko.nilai();
      muatHargaLalu(t);
      o.saatToko?.(t, slotTokoEkstra);
    }, 0);
  }

  // ---------------- keluaran ----------------
  function baca() {
    const t = pilihToko.nilai();
    return {
      toko_id: t?.id ?? null,
      toko_nama: (t?.nama || '').trim(),
      catatan: (elCatatan?.value || '').trim(),
      cash,
      item: items.map((b) => b.baca()).filter((d) => d.barang_nama || d.qty || d.harga),
    };
  }

  /** @returns {string|null} pesan kesalahan pertama, atau null kalau sudah benar */
  function salah() {
    const d = baca();
    if (!d.toko_nama) return 'Nama toko belum dipilih.';
    if (!d.item.length) return 'Belum ada barang yang diisi.';
    for (let i = 0; i < d.item.length; i++) {
      const x = d.item[i];
      if (!x.barang_nama) return `Barang ke-${i + 1} belum dipilih.`;
      if (!(x.qty > 0)) return `Jumlah "${x.barang_nama}" belum diisi.`;
      if (x.berat_kg && !(x.harga_per_kg > 0)) return `Harga per kg "${x.barang_nama}" belum diisi.`;
      if (!(x.harga >= 0)) return `Harga "${x.barang_nama}" belum benar.`;
    }
    return null;
  }

  return {
    el,
    baca,
    salah,
    total: () => baca().item.reduce((s, d) => s + d.qty * d.harga, 0),
    /** Nama barang yang harganya masih Rp 0 — barang baru dari daftar global belum berharga. */
    hargaNol: () => baca().item.filter((d) => !(d.harga > 0)).map((d) => d.barang_nama),
    fokusToko: () => pilihToko.el.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    bukaToko: () => pilihToko.buka(),
  };
}
