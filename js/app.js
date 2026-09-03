// Rangka aplikasi: cek login, pasang bar bawah, ganti halaman.

import { BELUM_DISETEL } from './config.js';
import * as db from './db.js';
import { esc, pesan } from './util.js';

const app = document.getElementById('app');

export const status = {
  profil: null,
  toko: [],
  barang: [],
  tokoSaya: null,      // Set berisi id toko yang jadi tanggung jawab sales ini
  pengajuanPending: 0, // untuk lencana notifikasi admin
};

// ------------------------------------------------------------
// Master data: tampil instan dari simpanan HP, lalu disegarkan
// di belakang layar. Ini yang membuat aplikasi tidak terasa lemot.
// ------------------------------------------------------------
const KUNCI_MASTER = 'order-master-v2';

function muatMasterLokal() {
  try {
    const m = JSON.parse(localStorage.getItem(KUNCI_MASTER) || 'null');
    if (m && Array.isArray(m.toko) && Array.isArray(m.barang)) {
      status.toko = m.toko;
      status.barang = m.barang;
      status.tokoSaya = Array.isArray(m.tokoSaya) ? new Set(m.tokoSaya) : null;
      return true;
    }
  } catch { /* abaikan */ }
  return false;
}

export async function segarkanMaster({ paksa = false } = {}) {
  if (!paksa && status.toko.length && status.barang.length) {
    ambilMaster().catch(() => {});   // segarkan tanpa menahan tampilan
    return;
  }
  await ambilMaster();
}

async function ambilMaster() {
  const kode = status.profil?.kode_sales;

  const [toko, barang, punyaSaya] = await Promise.all([
    db.pilih('toko', {
      select: 'id,kode,nama,kota,alamat', aktif: 'eq.true', order: 'nama.asc', limit: 5000,
    }),
    db.pilih('barang', {
      select: 'id,kode,nama,satuan,harga_rekomendasi,berat_kg',
      aktif: 'eq.true', order: 'nama.asc', limit: 5000,
    }),
    kode
      ? db.pilih('toko_sales', { select: 'toko_id', kode_sales: 'eq.' + kode, limit: 5000 })
      : Promise.resolve(null),
  ]);

  status.toko = toko;
  status.barang = barang;
  status.tokoSaya = punyaSaya ? new Set(punyaSaya.map((r) => r.toko_id)) : null;

  try {
    localStorage.setItem(KUNCI_MASTER, JSON.stringify({
      toko, barang,
      tokoSaya: status.tokoSaya ? [...status.tokoSaya] : null,
      pada: Date.now(),
    }));
  } catch { /* penuh — abaikan */ }
}

export function hapusMasterLokal() {
  localStorage.removeItem(KUNCI_MASTER);
  status.toko = [];
  status.barang = [];
  status.tokoSaya = null;
}

// ------------------------------------------------------------
// Lencana notifikasi: berapa pengajuan yang menunggu admin
// ------------------------------------------------------------
export async function segarkanPengajuan() {
  if (status.profil?.peran !== 'admin') { status.pengajuanPending = 0; return 0; }
  try {
    const n = await db.rpc('jml_pengajuan_pending');
    status.pengajuanPending = Number(n) || 0;
  } catch {
    status.pengajuanPending = 0;
  }
  gambarLencana();
  return status.pengajuanPending;
}

function gambarLencana() {
  const a = document.querySelector('.bar a[href="#/admin"]');
  if (!a) return;
  a.querySelector('.lencana')?.remove();
  if (status.pengajuanPending > 0) {
    const s = document.createElement('span');
    s.className = 'lencana';
    s.textContent = status.pengajuanPending > 99 ? '99+' : String(status.pengajuanPending);
    s.title = status.pengajuanPending + ' pengajuan menunggu';
    a.appendChild(s);
  }
}

// ------------------------------------------------------------
// Kerangka halaman
// ------------------------------------------------------------
const HALAMAN = {
  order:   { judul: 'Buat Order', ikon: '📝', label: 'Order',   modul: './pages/order.js' },
  riwayat: { judul: 'Order Saya', ikon: '📄', label: 'Riwayat', modul: './pages/riwayat.js' },
  admin:   { judul: 'Admin',      ikon: '⚙️', label: 'Admin',   modul: './pages/admin.js', adminSaja: true },
};

function rutaSekarang() {
  const h = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return HALAMAN[h] ? h : 'order';
}

function gambarKerangka(kunci) {
  const h = HALAMAN[kunci];
  const adminkah = status.profil?.peran === 'admin';
  const menu = Object.entries(HALAMAN).filter(([, v]) => !v.adminSaja || adminkah);
  const pr = status.profil;

  app.innerHTML = `
    <header class="atas">
      <div>
        <h1>${esc(h.judul)}</h1>
        <div class="sub">${esc(pr?.nama || '')}${
          adminkah ? ' · admin' : pr?.kode_sales ? ' · ' + esc(pr.kode_sales) : ''
        }</div>
      </div>
      <div class="kanan">
        <button type="button" class="btn-atas" id="btn-keluar">Keluar</button>
      </div>
    </header>
    <main class="isi" id="isi"></main>
    <nav class="bar">
      ${menu
        .map(
          ([k, v]) => `<a href="#/${k}" class="${k === kunci ? 'aktif' : ''}">
              <span class="ikon">${v.ikon}</span><span>${esc(v.label)}</span></a>`
        )
        .join('')}
    </nav>`;

  document.body.classList.remove('tanpa-bar');
  document.getElementById('btn-keluar').addEventListener('click', keluarSekarang);
  gambarLencana();
  return document.getElementById('isi');
}

async function keluarSekarang() {
  const { tanya } = await import('./util.js');
  if (!(await tanya('Keluar dari aplikasi?',
    'Anda perlu memasukkan username dan PIN lagi untuk masuk.', 'Ya, keluar'))) return;
  await db.keluar();
  hapusMasterLokal();
  status.profil = null;
  location.hash = '';
  mulai();
}

let sedangGambar = false;

async function gambarHalaman() {
  if (sedangGambar) return;
  sedangGambar = true;
  try {
    const kunci = rutaSekarang();
    const h = HALAMAN[kunci];

    if (h.adminSaja && status.profil?.peran !== 'admin') {
      location.hash = '#/order';
      return;
    }

    const isi = gambarKerangka(kunci);
    isi.innerHTML = `<div class="memuat"><div class="putar"></div>Memuat…</div>`;

    const modul = await import(h.modul);
    await modul.gambar(isi, {
      status, segarkanMaster, hapusMasterLokal, segarkanPengajuan,
    });
  } catch (e) {
    console.error(e);
    pesan(e.message || 'Terjadi kesalahan.', 'salah');
    const isi = document.getElementById('isi');
    if (isi) {
      isi.innerHTML = `<div class="kosong-pesan">
        <span class="ikon">⚠️</span>${esc(e.message || 'Terjadi kesalahan.')}
        <div style="margin-top:16px"><button type="button" class="btn abu kecil"
          onclick="location.reload()">Muat ulang</button></div>
      </div>`;
    }
  } finally {
    sedangGambar = false;
  }
}

// ------------------------------------------------------------
// Halaman login
// ------------------------------------------------------------
async function gambarLogin() {
  document.body.classList.add('tanpa-bar');
  const modul = await import('./pages/login.js');
  await modul.gambar(app, {
    setelahMasuk: async (pr) => {
      status.profil = pr;
      await segarkanMaster({ paksa: true });
      segarkanPengajuan();
      if (!location.hash) location.hash = '#/order';
      gambarHalaman();
    },
  });
}

// ------------------------------------------------------------
// Bar bawah harus sembunyi saat papan tombol HP terbuka
// ------------------------------------------------------------
function pantauPapanTombol() {
  const vv = window.visualViewport;
  if (!vv) return;
  let dasar = vv.height;
  const cek = () => {
    const terbuka = dasar - vv.height > 140;
    document.body.classList.toggle('kb-open', terbuka);
    if (!terbuka) dasar = Math.max(dasar, vv.height);
  };
  vv.addEventListener('resize', cek);
  window.addEventListener('orientationchange', () => { dasar = vv.height; });
}

// ------------------------------------------------------------
// Mulai
// ------------------------------------------------------------
async function mulai() {
  if (BELUM_DISETEL) {
    // Belum tahu alamat databasenya -> tampilkan layar pengaturan,
    // bukan menyuruh pemilik mengedit berkas kode.
    const modul = await import('./pages/sambung.js');
    await modul.gambar(app, {
      setelahTersambung: async () => { location.reload(); },
    });
    return;
  }

  if (!db.adaSesi()) { await gambarLogin(); return; }

  try {
    const pr = await db.profilSaya();
    if (!pr || !pr.aktif) { await db.keluar(); await gambarLogin(); return; }
    status.profil = pr;
  } catch (e) {
    await gambarLogin();
    if (e.message) pesan(e.message, 'salah');
    return;
  }

  muatMasterLokal();
  if (!location.hash) location.hash = '#/order';
  await gambarHalaman();
  segarkanMaster().catch(() => {});
  segarkanPengajuan();

  // Notifikasi pengajuan: periksa berkala + saat kembali ke aplikasi
  setInterval(() => { if (status.profil) segarkanPengajuan(); }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && status.profil) segarkanPengajuan();
  });
}

window.addEventListener('hashchange', () => {
  if (status.profil) gambarHalaman();
});

pantauPapanTombol();
mulai();
