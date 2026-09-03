// Form isi order yang dipakai di DUA tempat:
//   1. Sales membuat order baru   (pages/order.js)
//   2. Admin mengubah order       (pages/admin.js)
// Satu tempat saja supaya aturan harga per-kilo tidak ditulis berulang.

import { buatPilih } from './pilih.js';
import { rupiah, angka, keAngka, pesan, tanya } from './util.js';

/**
 * @param {object} o
 * @param {object} o.status            status aplikasi (punya .toko, .barang, .tokoSaya)
 * @param {object} [o.awal]            isi awal: {toko:{id,nama,info}, catatan, item:[...]}
 * @param {boolean} [o.pakaiCatatan]   tampilkan kotak catatan (default true)
 * @param {() => void} [o.saatUbah]    dipanggil setiap ada perubahan
 * @returns {{el:HTMLElement, baca:Function, total:Function, salah:Function, fokusToko:Function}}
 */
let nomorForm = 0;

export function buatFormOrder(o) {
  const pakaiCatatan = o.pakaiCatatan !== false;
  const uid = 'f' + ++nomorForm;   // id unik: dua form boleh hidup bersamaan

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="kartu" data-slot="toko"></div>

    <div class="kartu">
      <div class="judul-bagian">Barang yang dipesan</div>
      <div data-slot="item"></div>
      <button type="button" class="btn garis" data-aksi="tambah">+ Tambah barang</button>
    </div>

    ${pakaiCatatan ? `
    <div class="kartu">
      <label class="label" for="catatan-${uid}">Catatan</label>
      <textarea id="catatan-${uid}" data-slot="catatan"
                placeholder="Contoh: kirim besok pagi, minta nota terpisah…"></textarea>
    </div>` : ''}

    <div class="total-kotak">
      <span class="lbl">Total order</span>
      <span class="nilai" data-slot="total">Rp 0</span>
    </div>`;

  const slotToko = el.querySelector('[data-slot="toko"]');
  const slotItem = el.querySelector('[data-slot="item"]');
  const elCatatan = el.querySelector('[data-slot="catatan"]');
  const elTotal = el.querySelector('[data-slot="total"]');

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
    saatPilih: () => ubah(),
  });
  slotToko.appendChild(pilihToko.el);

  // ---------------- item ----------------
  const items = [];

  function dataBarang() {
    return o.status.barang.map((b) => {
      const berat = Number(b.berat_kg) || null;
      const rek = Number(b.harga_rekomendasi) || 0;
      // Untuk barang per-kilo, harga_rekomendasi berarti harga per KG.
      const info = berat
        ? (rek ? `${rupiah(rek)}/kg · ` : 'harga per kg · ') +
          `1 ${b.satuan} = ${angka(berat)} kg`
        : `${rupiah(rek)} / ${b.satuan}`;
      return {
        id: b.id,
        nama: b.nama,
        info: info + (b.kode ? ` · ${b.kode}` : ''),
        kata: b.kode || '',
        satuan: b.satuan,
        berat_kg: berat,
        harga_rekomendasi: rek,
      };
    });
  }

  function tambahItem(awal) {
    const baris = { satuan: 'pcs', beratKg: null };

    const kotak = document.createElement('div');
    kotak.className = 'item';
    kotak.innerHTML = `
      <div class="item-atas">
        <span class="no"></span>
        <b>Barang</b>
        <button type="button" class="buang" aria-label="Hapus barang">&times;</button>
      </div>
      <div data-slot="pilih"></div>
      <div class="dua">
        <div>
          <label class="label">Jumlah</label>
          <input type="text" class="qty" inputmode="decimal" placeholder="0" enterkeyhint="next">
          <div class="bantuan satuan-teks">satuan: -</div>
        </div>
        <div>
          <label class="label label-harga">Harga satuan</label>
          <input type="text" class="harga" inputmode="numeric" placeholder="0" enterkeyhint="done">
          <div class="bantuan rekom">&nbsp;</div>
        </div>
      </div>
      <div class="sub-item"><span>Subtotal</span><b class="sub">Rp 0</b></div>`;

    const inQty = kotak.querySelector('.qty');
    const inHarga = kotak.querySelector('.harga');
    const elSub = kotak.querySelector('.sub');
    const elSatuan = kotak.querySelector('.satuan-teks');
    const elRekom = kotak.querySelector('.rekom');
    const elLabelHarga = kotak.querySelector('.label-harga');

    const pilihBarang = buatPilih({
      label: 'Nama barang',
      judul: 'Pilih barang',
      placeholder: 'Ketuk untuk memilih barang…',
      data: dataBarang,
      saatPilih: (v) => {
        if (v?.ekstra) {
          const e = v.ekstra;
          baris.satuan = e.satuan;
          baris.beratKg = e.berat_kg || null;
          if (baris.beratKg) {
            elLabelHarga.textContent = 'Harga per kg';
            inHarga.placeholder = 'harga 1 kg';
            elSatuan.textContent = `satuan: ${e.satuan} · 1 ${e.satuan} = ${angka(baris.beratKg)} kg`;
            // harga_rekomendasi barang per-kilo = harga per KG; isi sebagai awalan
            inHarga.value = e.harga_rekomendasi ? angka(e.harga_rekomendasi) : '';
          } else {
            elLabelHarga.textContent = 'Harga satuan';
            inHarga.placeholder = '0';
            elSatuan.textContent = 'satuan: ' + e.satuan;
            elRekom.textContent = 'Rekomendasi ' + rupiah(e.harga_rekomendasi);
            if (!keAngka(inHarga.value)) inHarga.value = angka(e.harga_rekomendasi);
          }
        } else {
          baris.satuan = 'pcs';
          baris.beratKg = null;
          elLabelHarga.textContent = 'Harga satuan';
          inHarga.placeholder = '0';
          elSatuan.textContent = 'satuan: pcs (barang baru)';
          elRekom.textContent = 'Barang baru — isi harga sendiri';
        }
        ubah();
        if (!keAngka(inQty.value)) inQty.focus();
      },
    });
    kotak.querySelector('[data-slot="pilih"]').appendChild(pilihBarang.el);

    inQty.addEventListener('input', ubah);
    inHarga.addEventListener('input', ubah);
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
        satuan: baris.satuan || 'pcs',
        qty: keAngka(inQty.value),
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
      if (!baris.beratKg) return;
      const sat = baris.satuan;
      elSatuan.textContent = d.qty
        ? `${angka(d.qty)} ${sat} = ${angka(d.qty * baris.beratKg)} kg`
        : `1 ${sat} = ${angka(baris.beratKg)} kg`;
      elRekom.textContent = d.harga_per_kg ? `= ${rupiah(d.harga)} / ${sat}` : 'Isi harga per kg';
    };

    baris.tulis = (d) => {
      if (d.barang_nama) {
        baris.satuan = d.satuan || 'pcs';
        baris.beratKg = Number(d.berat_kg) || null;
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

  el.querySelector('[data-aksi="tambah"]').addEventListener('click', () => {
    const b = tambahItem();
    b.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  elCatatan?.addEventListener('input', () => o.saatUbah?.());

  // ---------------- isi awal ----------------
  const awal = o.awal;
  if (awal?.toko) pilihToko.set(awal.toko);
  if (awal?.catatan && elCatatan) elCatatan.value = awal.catatan;
  if (awal?.item?.length) awal.item.forEach((i) => tambahItem(i));
  else tambahItem();
  ubah();

  // ---------------- keluaran ----------------
  function baca() {
    const t = pilihToko.nilai();
    return {
      toko_id: t?.id ?? null,
      toko_nama: (t?.nama || '').trim(),
      catatan: (elCatatan?.value || '').trim(),
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
    fokusToko: () => pilihToko.el.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    bukaToko: () => pilihToko.buka(),
  };
}
