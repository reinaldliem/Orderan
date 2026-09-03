// Dropdown pencarian buatan sendiri.
// Sengaja BUKAN <datalist> — datalist tidak jalan di iPhone.
// Dipakai untuk daftar toko & barang, dan boleh ketik nama baru.

import { esc } from './util.js';

/**
 * @param {object} o
 * @param {string} o.label            teks di atas kotak
 * @param {string} o.placeholder      tulisan saat belum dipilih
 * @param {() => Array} o.data        () => [{id, nama, info}]
 * @param {(hasil:{id:number|null, nama:string}) => void} o.saatPilih
 * @param {boolean} [o.bolehBaru]     izinkan nama ketikan bebas (default true)
 * @param {string}  [o.judul]         judul lembar pilihan
 * @param {Array<{kunci:string,teks:string,uji:(d:any)=>boolean}>} [o.saring]
 *        tombol saringan di dalam lembar (mis. "Toko saya" / "Semua toko")
 * @returns {{el:HTMLElement, set:(v:{id:number|null,nama:string}|null)=>void, nilai:()=>object|null}}
 */
export function buatPilih(o) {
  const bolehBaru = o.bolehBaru !== false;
  let nilai = null;
  let saringAktif = o.saring?.[0]?.kunci ?? null;   // ingat pilihan antar-buka

  const wadah = document.createElement('div');
  wadah.className = 'baris';
  wadah.innerHTML = `
    <label class="label">${esc(o.label)}</label>
    <button type="button" class="pilih">
      <span class="utama kosong">${esc(o.placeholder || 'Pilih…')}</span>
    </button>`;

  const tombol = wadah.querySelector('.pilih');

  function gambar() {
    if (!nilai) {
      tombol.innerHTML = `<span class="utama kosong">${esc(o.placeholder || 'Pilih…')}</span>`;
      return;
    }
    tombol.innerHTML =
      `<span class="utama">${esc(nilai.nama)}</span>` +
      (nilai.info ? `<span class="info">${esc(nilai.info)}</span>` : '');
  }

  function set(v) {
    nilai = v ? { ...v } : null;
    gambar();
  }

  tombol.addEventListener('click', () => buka());

  function buka() {
    const semuaData = o.data() || [];

    const tirai = document.createElement('div');
    tirai.className = 'tirai';
    tirai.innerHTML = `
      <div class="lembar" role="dialog" aria-modal="true">
        <div class="lembar-atas">
          <div class="tajuk">
            <h3>${esc(o.judul || o.label)}</h3>
            <button type="button" class="tutup" aria-label="Tutup">&times;</button>
          </div>
          <input type="text" class="cari" placeholder="Ketik untuk mencari…"
                 autocomplete="off" enterkeyhint="done">
          ${o.saring ? `<div class="saring">${o.saring
            .map((s) => `<button type="button" data-saring="${esc(s.kunci)}"
                          class="${s.kunci === saringAktif ? 'aktif' : ''}">${esc(s.teks)}</button>`)
            .join('')}</div>` : ''}
        </div>
        <div class="daftar"></div>
      </div>`;

    const cari = tirai.querySelector('.cari');
    const daftar = tirai.querySelector('.daftar');

    function isiDaftar() {
      const q = cari.value.trim().toLowerCase();
      const uji = o.saring?.find((s) => s.kunci === saringAktif)?.uji;
      const semua = uji ? semuaData.filter(uji) : semuaData;
      // dicocokkan ke nama DAN kata bantu (mis. kode barang), jadi
      // sales boleh cari pakai kode kalau lebih hafal kodenya
      const cocok = q
        ? semua
            .filter((d) =>
              (String(d.nama) + ' ' + (d.kata || '')).toLowerCase().includes(q)
            )
            .slice(0, 80)
        : semua.slice(0, 80);

      // Sudah persis sama dengan nama ATAU kode yang ada? Jangan tawarkan "buat baru".
      const samaTepat =
        q &&
        semua.some(
          (d) =>
            String(d.nama).toLowerCase() === q ||
            String(d.kata || '').toLowerCase() === q
        );

      const tombolBaru =
        bolehBaru && q && !samaTepat
          ? `<button type="button" class="opsi baru" data-baru="1">
               + Pakai "${esc(cari.value.trim())}" (belum ada di daftar)
             </button>`
          : '';

      const daftarOpsi = cocok
        .map(
          (d) => `<button type="button" class="opsi" data-id="${esc(d.id)}">
                    <div class="nm">${esc(d.nama)}</div>
                    ${d.info ? `<div class="ket">${esc(d.info)}</div>` : ''}
                  </button>`
        )
        .join('');

      // Kalau ada hasil cocok, tombol "buat baru" ditaruh di BAWAH supaya
      // tidak gampang salah ketuk. Kalau tidak ada hasil, baru ditaruh di atas.
      let html = cocok.length ? daftarOpsi + tombolBaru : tombolBaru + daftarOpsi;

      if (!cocok.length && !tombolBaru) {
        html += `<div class="habis">${
          semua.length ? 'Tidak ada yang cocok.' : 'Daftar masih kosong. Minta admin mengisi data.'
        }</div>`;
      } else if (semua.length > 80 && !q) {
        html += `<div class="habis">Menampilkan 80 dari ${semua.length}. Ketik untuk mencari.</div>`;
      }

      daftar.innerHTML = html;
    }

    function tutup() {
      tirai.remove();
    }

    cari.addEventListener('input', isiDaftar);
    cari.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });

    tirai.addEventListener('click', (e) => {
      if (e.target === tirai || e.target.closest('.tutup')) { tutup(); return; }

      const tombolSaring = e.target.closest('[data-saring]');
      if (tombolSaring) {
        saringAktif = tombolSaring.dataset.saring;
        tirai.querySelectorAll('[data-saring]').forEach((b) => {
          b.classList.toggle('aktif', b.dataset.saring === saringAktif);
        });
        isiDaftar();
        return;
      }

      const opsi = e.target.closest('.opsi');
      if (!opsi) return;

      if (opsi.dataset.baru) {
        set({ id: null, nama: cari.value.trim() });
      } else {
        const d = semuaData.find((x) => String(x.id) === opsi.dataset.id);
        if (d) set({ id: d.id, nama: d.nama, info: d.info, ekstra: d });
      }
      tutup();
      o.saatPilih?.(nilai);
    });

    document.body.appendChild(tirai);
    isiDaftar();
    // fokus ditunda supaya papan tombol HP tidak melompat-lompat
    setTimeout(() => cari.focus(), 90);
  }

  gambar();
  return { el: wadah, set, nilai: () => nilai, buka };
}
