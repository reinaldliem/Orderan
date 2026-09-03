// Form barang yang bisa diatur sendiri — dipakai untuk TAMBAH dan UBAH.
// Admin yang menentukan bentuk barangnya:
//
//   Dasar harga  : per satuan  (Rp per PCS/DUS/ROL)
//                  per kilo    (Rp per kg, dijual per satuan besar)
//   Ukuran       : satu saja, atau beberapa ukuran sekaligus
//
// Jadi satu pintu untuk semua: semen per sak, paku per dus 25 kg,
// kawat seng per rol yang tiap ukuran beratnya beda.

import { esc, rupiah, angka, keAngka, pecahTempelan } from './util.js';

let nomorFormBarang = 0;

/**
 * @param {object} o
 * @param {object} [o.awal]           isi awal (untuk mode ubah)
 * @param {boolean} [o.bolehUkuran]   izinkan mode beberapa ukuran (default true)
 * @param {() => void} [o.saatUbah]
 * @returns {{el:HTMLElement, baca:Function, salah:Function}}
 */
export function buatFormBarang(o = {}) {
  const uid = 'b' + ++nomorFormBarang;
  const awal = o.awal || null;
  const bolehUkuran = o.bolehUkuran !== false;

  // Barang lama yang beratnya terisi = barang per-kilo.
  let dasar = awal && Number(awal.berat_kg) ? 'kilo' : 'satuan';
  let banyak = false;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="kartu">
      <div class="judul-bagian">Dasar harga</div>
      <div class="saring">
        <button type="button" data-dasar="satuan">Per satuan</button>
        <button type="button" data-dasar="kilo">Per kilo</button>
      </div>
      <div class="bantuan" data-slot="jelas"></div>
    </div>

    <div class="kartu">
      <div class="dua">
        <div><label class="label" for="${uid}-kode">Kode</label>
          <input type="text" id="${uid}-kode" data-f="kode" placeholder="mis. L080"></div>
        <div><label class="label" for="${uid}-satuan">Satuan jual</label>
          <input type="text" id="${uid}-satuan" data-f="satuan" placeholder="PCS / DUS / ROL"></div>
      </div>
      <div class="baris" style="margin-top:10px">
        <label class="label" for="${uid}-nama">Nama barang</label>
        <input type="text" id="${uid}-nama" data-f="nama" placeholder="mis. KAWAT SENG">
        <div class="bantuan" data-slot="jelas-nama"></div>
      </div>
      <div class="baris">
        <label class="label" for="${uid}-kategori">Kategori (boleh dikosongkan)</label>
        <input type="text" id="${uid}-kategori" data-f="kategori">
      </div>
    </div>

    ${bolehUkuran ? `
    <div class="kartu rapat">
      <label style="display:flex;gap:11px;align-items:flex-start;cursor:pointer">
        <input type="checkbox" data-f="banyak"
               style="width:22px;height:22px;min-height:22px;padding:0;flex:0 0 auto;margin-top:2px">
        <span style="font-size:14.5px;line-height:1.5">
          <b>Barang ini punya beberapa ukuran</b>
          <span style="display:block;color:var(--teks-2);font-size:13px;margin-top:3px"
                data-slot="jelas-ukuran"></span>
        </span>
      </label>
    </div>` : ''}

    <!-- satu ukuran -->
    <div class="kartu" data-blok="tunggal">
      <div class="judul-bagian" data-slot="judul-tunggal">Harga</div>
      <div class="dua" data-blok="berat-tunggal">
        <div><label class="label">Berat 1 satuan (kg)</label>
          <input type="text" data-f="berat" inputmode="decimal" placeholder="mis. 25"></div>
        <div><label class="label" data-slot="label-harga">Harga jual</label>
          <input type="text" data-f="harga" inputmode="numeric" placeholder="0"></div>
      </div>
      <div class="baris" style="margin-top:10px">
        <label class="label" data-slot="label-hpp">HPP (hanya admin)</label>
        <input type="text" data-f="hpp" inputmode="numeric" placeholder="boleh dikosongkan">
      </div>
    </div>

    <!-- beberapa ukuran -->
    <div data-blok="banyak" hidden>
      <div class="judul-bagian">Daftar ukuran</div>
      <div data-slot="baris"></div>
      <button type="button" class="btn garis" data-aksi="tambah-ukuran">+ Tambah ukuran</button>

      <div class="kartu" style="box-shadow:none;padding:0;margin:16px 0 0">
        <label class="label" for="${uid}-tempel">Atau tempel dari Excel</label>
        <textarea id="${uid}-tempel" data-f="tempel" style="min-height:88px"></textarea>
        <div class="bantuan" data-slot="jelas-tempel"></div>
      </div>
    </div>

    <div class="kartu rapat" style="background:var(--permukaan-2)">
      <div class="judul-bagian">Hasil yang akan dibuat</div>
      <div class="bantuan" data-slot="pratinjau" style="margin-top:0"></div>
    </div>`;

  const q = (s) => el.querySelector(s);
  const inNama = q('[data-f="nama"]');
  const inSatuan = q('[data-f="satuan"]');
  const inKode = q('[data-f="kode"]');
  const inKategori = q('[data-f="kategori"]');
  const inBerat = q('[data-f="berat"]');
  const inHarga = q('[data-f="harga"]');
  const inHpp = q('[data-f="hpp"]');
  const cbBanyak = q('[data-f="banyak"]');
  const taTempel = q('[data-f="tempel"]');
  const wadahBaris = q('[data-slot="baris"]');

  // ---------------- baris ukuran ----------------
  function tambahBaris(isi) {
    const b = document.createElement('div');
    b.className = 'item';
    b.innerHTML = `
      <div class="item-atas">
        <span class="no"></span><b>Ukuran</b>
        <button type="button" class="buang" aria-label="Hapus ukuran">&times;</button>
      </div>
      <div class="baris">
        <label class="label">Ukuran / keterangan</label>
        <input type="text" data-u="ukuran" placeholder="mis. BWG 20">
      </div>
      <div class="dua" data-u-blok="berat">
        <div><label class="label">Berat (kg)</label>
          <input type="text" data-u="berat" inputmode="decimal" placeholder="12"></div>
        <div><label class="label" data-u-label="harga">Harga</label>
          <input type="text" data-u="harga" inputmode="numeric" placeholder="0"></div>
      </div>
      <div class="baris" style="margin-top:10px">
        <label class="label" data-u-label="hpp">HPP</label>
        <input type="text" data-u="hpp" inputmode="numeric" placeholder="boleh dikosongkan">
      </div>`;
    b.querySelector('.buang').addEventListener('click', () => { b.remove(); gambar(); });
    b.querySelectorAll('input').forEach((i) => i.addEventListener('input', gambar));
    if (isi) {
      b.querySelector('[data-u="ukuran"]').value = isi.ukuran || '';
      if (isi.berat) b.querySelector('[data-u="berat"]').value = angka(isi.berat);
      if (isi.harga) b.querySelector('[data-u="harga"]').value = angka(isi.harga);
      if (isi.hpp) b.querySelector('[data-u="hpp"]').value = angka(isi.hpp);
    }
    wadahBaris.appendChild(b);
    return b;
  }

  // ---------------- susun hasil ----------------
  function susun() {
    const nama = inNama.value.trim();
    const satuan = inSatuan.value.trim() || 'PCS';
    const kode = inKode.value.trim();
    const kategori = inKategori.value.trim() || null;
    const perKilo = dasar === 'kilo';

    if (!banyak) {
      const harga = keAngka(inHarga.value);
      const hpp = inHpp.value.trim() ? keAngka(inHpp.value) : null;
      const berat = perKilo ? keAngka(inBerat.value) : 0;
      return [{
        kode: kode || null,
        nama,
        satuan,
        harga_rekomendasi: harga,
        berat_kg: perKilo && berat ? berat : null,
        kategori,
        hpp,
      }];
    }

    const out = [];
    let n = 0;
    [...wadahBaris.querySelectorAll('.item')].forEach((b) => {
      const uk = b.querySelector('[data-u="ukuran"]').value.trim();
      const berat = keAngka(b.querySelector('[data-u="berat"]').value);
      const harga = keAngka(b.querySelector('[data-u="harga"]').value);
      const teksHpp = b.querySelector('[data-u="hpp"]').value.trim();

      // baris dianggap terisi kalau ada harga, atau (mode kilo) ada beratnya
      if (perKilo ? !berat : !harga) return;
      n += 1;
      out.push({
        kode: kode ? `${kode}-${n}` : null,
        nama: [nama, uk].filter(Boolean).join(' '),
        satuan,
        harga_rekomendasi: harga,
        berat_kg: perKilo ? berat : null,
        kategori,
        hpp: teksHpp ? keAngka(teksHpp) : null,
      });
    });
    return out;
  }

  /** @returns {string|null} */
  function salah() {
    if (!inNama.value.trim()) return 'Nama barang belum diisi.';
    const baris = susun();
    if (!baris.length) {
      return banyak
        ? (dasar === 'kilo'
            ? 'Belum ada ukuran yang berisi berat.'
            : 'Belum ada ukuran yang berisi harga.')
        : 'Isian belum lengkap.';
    }
    if (dasar === 'kilo' && baris.some((r) => !r.berat_kg)) {
      return 'Berat (kg) belum diisi.';
    }
    return null;
  }

  // ---------------- tampilan mengikuti pilihan ----------------
  function gambar() {
    const perKilo = dasar === 'kilo';

    el.querySelectorAll('[data-dasar]').forEach((b) =>
      b.classList.toggle('aktif', b.dataset.dasar === dasar));

    q('[data-slot="jelas"]').innerHTML = perKilo
      ? 'Harga dihitung <b>per kilo</b>, tapi barangnya dijual per satuan besar. ' +
        'Sales mengisi harga per kg, aplikasi mengalikan dengan beratnya. ' +
        '<br>Contoh: paku per DUS 25 kg · kawat seng per ROL.'
      : 'Harga langsung <b>per satuan jual</b>. Ini yang biasa. ' +
        '<br>Contoh: semen per SAK, amplas per LBR.';

    q('[data-slot="jelas-nama"]').textContent = banyak
      ? 'Cukup nama dasarnya. Ukuran ditambahkan otomatis di belakang nama.'
      : '';

    const jelasUkuran = q('[data-slot="jelas-ukuran"]');
    if (jelasUkuran) {
      jelasUkuran.textContent = perKilo
        ? 'Pilih ini kalau tiap ukuran beratnya beda — mis. kawat seng BWG 20 = 12 kg, BWG 22 = 9 kg.'
        : 'Pilih ini kalau satu nama punya beberapa ukuran dengan harga berbeda.';
    }

    q('[data-blok="tunggal"]').hidden = banyak;
    q('[data-blok="banyak"]').hidden = !banyak;
    q('[data-blok="berat-tunggal"]').classList.toggle('dua', perKilo);
    inBerat.closest('div').hidden = !perKilo;

    q('[data-slot="judul-tunggal"]').textContent = perKilo ? 'Berat & harga per kilo' : 'Harga';
    q('[data-slot="label-harga"]').textContent = perKilo ? 'Harga per kg' : 'Harga jual';
    q('[data-slot="label-hpp"]').textContent = perKilo
      ? 'HPP per kg (hanya admin)' : 'HPP (hanya admin)';

    const sat = inSatuan.value.trim() || 'satuan';
    inBerat.previousElementSibling.textContent = `Berat 1 ${sat} (kg)`;

    // kolom & contoh tempelan ikut mode
    el.querySelectorAll('[data-u-blok="berat"]').forEach((d) => {
      const kotakBerat = d.querySelector('[data-u="berat"]').closest('div');
      kotakBerat.hidden = !perKilo;
      d.classList.toggle('dua', perKilo);
    });
    el.querySelectorAll('[data-u-label="harga"]').forEach((l) => {
      l.textContent = perKilo ? 'Harga per kg' : 'Harga jual';
    });
    el.querySelectorAll('[data-u-label="hpp"]').forEach((l) => {
      l.textContent = perKilo ? 'HPP per kg' : 'HPP';
    });
    [...wadahBaris.querySelectorAll('.item')].forEach((b, i) => {
      b.querySelector('.no').textContent = i + 1;
    });

    if (taTempel) {
      taTempel.placeholder = perKilo
        ? 'BWG 20\t12\t16000\nBWG 22\t9\t16500'
        : '2 INCI\t18000\n3 INCI\t18500';
      q('[data-slot="jelas-tempel"]').innerHTML = perKilo
        ? 'Urutan kolom: <b>Ukuran · Berat kg · Harga per kg · HPP per kg</b> ' +
          '(dua terakhir boleh dikosongkan). Menempel mengganti daftar di atas.'
        : 'Urutan kolom: <b>Ukuran · Harga jual · HPP</b> ' +
          '(HPP boleh dikosongkan). Menempel mengganti daftar di atas.';
    }

    // pratinjau
    const baris = susun();
    const pra = q('[data-slot="pratinjau"]');
    if (!inNama.value.trim()) {
      pra.textContent = 'Nama barang belum diisi.';
    } else if (!baris.length) {
      pra.textContent = 'Isian belum lengkap.';
    } else {
      pra.innerHTML = `<b>${baris.length} barang:</b>` + baris.map((r) => {
        const harga = r.berat_kg
          ? `${r.harga_rekomendasi ? rupiah(r.harga_rekomendasi) + '/kg · ' : ''}1 ${r.satuan} = ${angka(r.berat_kg)} kg`
          : `${rupiah(r.harga_rekomendasi)} / ${r.satuan}`;
        return `<div style="margin-top:5px">• ${esc(r.nama)} — ${esc(harga)}` +
               `${r.hpp ? ' · HPP ' + esc(rupiah(r.hpp)) + (r.berat_kg ? '/kg' : '') : ''}` +
               `${r.kode ? ' · <span class="kode">' + esc(r.kode) + '</span>' : ''}</div>`;
      }).join('');
    }

    o.saatUbah?.();
  }

  // ---------------- kejadian ----------------
  el.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dasar]');
    if (d) { dasar = d.dataset.dasar; gambar(); return; }
    if (e.target.closest('[data-aksi="tambah-ukuran"]')) { tambahBaris(); gambar(); }
  });

  el.querySelectorAll('[data-f="nama"],[data-f="satuan"],[data-f="kode"],[data-f="kategori"],' +
                      '[data-f="berat"],[data-f="harga"],[data-f="hpp"]')
    .forEach((i) => i.addEventListener('input', gambar));

  cbBanyak?.addEventListener('change', () => {
    banyak = cbBanyak.checked;
    if (banyak && !wadahBaris.querySelector('.item')) tambahBaris();
    gambar();
  });

  taTempel?.addEventListener('input', () => {
    const baris = pecahTempelan(taTempel.value);
    if (!baris.length) return;
    const perKilo = dasar === 'kilo';
    wadahBaris.replaceChildren();
    baris.forEach((k) => tambahBaris(perKilo
      ? { ukuran: k[0], berat: keAngka(k[1]), harga: keAngka(k[2]), hpp: keAngka(k[3]) }
      : { ukuran: k[0], harga: keAngka(k[1]), hpp: keAngka(k[2]) }));
    gambar();
  });

  // ---------------- isi awal ----------------
  if (awal) {
    inKode.value = awal.kode || '';
    inNama.value = awal.nama || '';
    inSatuan.value = awal.satuan || 'PCS';
    inKategori.value = awal.kategori || '';
    if (awal.harga_rekomendasi) inHarga.value = angka(awal.harga_rekomendasi);
    if (awal.berat_kg) inBerat.value = angka(awal.berat_kg);
    if (awal.hpp !== null && awal.hpp !== undefined) inHpp.value = angka(awal.hpp);
  } else {
    inSatuan.value = 'PCS';
  }

  gambar();

  return { el, baca: susun, salah, perKilo: () => dasar === 'kilo' };
}
