// Rangka aplikasi: cek login, pasang bar bawah, ganti halaman.

import { BELUM_DISETEL } from './config.js';
import * as db from './db.js';
import { ikon } from './ikon.js';
import { esc, pesan } from './util.js';
import * as notif from './notifikasi.js';

const app = document.getElementById('app');

export const status = {
  profil: null,
  toko: [],
  barang: [],
  tokoSaya: null,      // Set berisi id toko yang jadi tanggung jawab sales ini
};

// ------------------------------------------------------------
// Master data: tampil instan dari simpanan HP, lalu disegarkan
// di belakang layar. Ini yang membuat aplikasi tidak terasa lemot.
// ------------------------------------------------------------
const KUNCI_MASTER = 'order-master-v2';

// Daftar toko & barang ikut disimpan per tab (sessionStorage), sama seperti
// sesi: tidak tersisa di HP/komputer setelah tabnya ditutup. Sisa versi lama
// di localStorage dibuang.
const tempatMaster = (() => {
  try { localStorage.removeItem(KUNCI_MASTER); } catch { /* abaikan */ }
  try { return window.sessionStorage; } catch { return null; }
})();

function muatMasterLokal() {
  try {
    const m = JSON.parse(tempatMaster?.getItem(KUNCI_MASTER) || 'null');
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
      select: 'id,kode,nama,kota,alamat', aktif: 'eq.true', order: 'nama.asc,id.asc', limit: 5000,
    }),
    db.pilih('barang', {
      select: 'id,kode,nama,satuan,harga_rekomendasi,berat_kg',
      aktif: 'eq.true', order: 'nama.asc,id.asc', limit: 5000,
    }),
    kode
      ? db.pilih('toko_sales', { select: 'toko_id', kode_sales: 'eq.' + kode, order: 'toko_id.asc', limit: 5000 })
      : Promise.resolve(null),
  ]);

  status.toko = toko;
  status.barang = barang;
  status.tokoSaya = punyaSaya ? new Set(punyaSaya.map((r) => r.toko_id)) : null;

  try {
    tempatMaster?.setItem(KUNCI_MASTER, JSON.stringify({
      toko, barang,
      tokoSaya: status.tokoSaya ? [...status.tokoSaya] : null,
      pada: Date.now(),
    }));
  } catch { /* penuh — abaikan */ }
}

export function hapusMasterLokal() {
  try { tempatMaster?.removeItem(KUNCI_MASTER); } catch { /* abaikan */ }
  status.toko = [];
  status.barang = [];
  status.tokoSaya = null;
}

// ------------------------------------------------------------
// Kerangka halaman
// ------------------------------------------------------------
const HALAMAN = {
  order:   { judul: 'Buat Order', ikon: 'nota',    label: 'Order',   modul: './pages/order.js' },
  riwayat: { judul: 'Order Saya', ikon: 'riwayat', label: 'Riwayat', modul: './pages/riwayat.js' },
  admin:   { judul: 'Admin',      ikon: 'admin',   label: 'Admin',   modul: './pages/admin.js', adminSaja: true },
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
        ${adminkah ? notif.tombolLonceng() : ''}
        <button type="button" class="btn-atas" id="btn-keluar">${ikon('keluar', 17)}Keluar</button>
      </div>
    </header>
    <main class="isi" id="isi"></main>
    <nav class="bar">
      ${menu
        .map(
          ([k, v]) => `<a href="#/${k}" class="${k === kunci ? 'aktif' : ''}">
              ${ikon(v.ikon, 21)}<span>${esc(v.label)}</span></a>`
        )
        .join('')}
    </nav>`;

  // Lebar 1280px hanya untuk tab Order di Admin; admin.js memasangnya lagi.
  document.body.classList.remove('tanpa-bar', 'lebar');
  document.getElementById('btn-keluar').addEventListener('click', keluarSekarang);
  notif.pasangLonceng(document.getElementById('btn-lonceng'));
  return document.getElementById('isi');
}

async function keluarSekarang() {
  const { tanya } = await import('./util.js');
  if (!(await tanya('Keluar dari aplikasi?',
    'Anda perlu memasukkan username dan PIN lagi untuk masuk.', 'Ya, keluar'))) return;
  await db.keluar();
  lupakanLencana();
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
    await modul.gambar(isi, { status, segarkanMaster, hapusMasterLokal, segarkanLencana });
  } catch (e) {
    console.error(e);
    pesan(e.message || 'Terjadi kesalahan.', 'salah');
    const isi = document.getElementById('isi');
    if (isi) {
      isi.innerHTML = `<div class="kosong-pesan">
        <span class="ikon">${ikon('peringatan', 40)}</span>${esc(e.message || 'Terjadi kesalahan.')}
        <div style="margin-top:16px"><button type="button" class="btn abu kecil"
          onclick="location.reload()">Muat ulang</button></div>
      </div>`;
    }
  } finally {
    sedangGambar = false;
  }
}

// ------------------------------------------------------------
// Lonceng notifikasi catatan dari sales (admin saja) — lihat notifikasi.js.
// Bukan admin: tidak pernah bertanya ke server.
// ------------------------------------------------------------
function segarkanLencana() {
  if (status.profil?.peran === 'admin') return notif.segarkan();
}

function lupakanLencana() {
  notif.lupakan();
}

// ------------------------------------------------------------
// Halaman login
// ------------------------------------------------------------
async function gambarLogin() {
  document.body.classList.add('tanpa-bar');
  document.body.classList.remove('lebar');
  const modul = await import('./pages/login.js');
  await modul.gambar(app, {
    setelahMasuk: async (pr) => {
      status.profil = pr;
      await segarkanMaster({ paksa: true });
      if (!location.hash) location.hash = '#/order';
      await gambarHalaman();
      segarkanLencana();
    },
  });
}

// ------------------------------------------------------------
// Batas waktu sesi
//
// Kalau sesi habis saat aplikasi sedang terbuka, pengguna harus langsung
// dikembalikan ke layar masuk — bukan dibiarkan mengetik satu order penuh
// lalu baru ditolak waktu menekan Simpan.
//
// Dicek tiap menit DAN setiap kali aplikasi kembali terlihat, karena di HP
// timer sering dibekukan selama aplikasi ada di latar belakang.
//
// Sekalian ditanyakan ke server apakah sesi perangkat ini masih ada: satu
// akun maksimal 2 perangkat, login ke-3 mengeluarkan perangkat paling lama.
// ------------------------------------------------------------
let sedangCek = false;

const PESAN_KELUAR = {
  perangkat: 'Akun Anda dipakai masuk di perangkat lain, jadi perangkat ini dikeluarkan.',
  diam: `Aplikasi tidak dipakai lebih dari ${db.BATAS_DIAM_MENIT} menit. Silakan masuk lagi.`,
  habis: 'Sesi Anda sudah berakhir. Silakan masuk lagi.',
};

async function cekSesi() {
  if (!status.profil || sedangCek) return;    // sudah di layar masuk / sedang dicek
  sedangCek = true;
  try {
    // adaSesi() sekaligus memeriksa batas 12 jam & 30 menit tidak berjalan.
    if (db.adaSesi()) {
      db.tandaHidup();                          // halaman ini sedang berjalan
      if (await db.cekPerangkat()) {            // dan server masih mengakui sesinya
        segarkanLencana();                      // sekalian: ada catatan baru dari sales?
        return;
      }
    }
    if (!status.profil) return;                 // sudah keluar lewat jalan lain

    const alasan = db.sesiHabis();
    lupakanLencana();
    hapusMasterLokal();
    status.profil = null;
    location.hash = '';
    await gambarLogin();
    pesan(PESAN_KELUAR[alasan] || PESAN_KELUAR.habis, 'salah');
  } finally {
    sedangCek = false;
  }
}

function pantauSesi() {
  setInterval(cekSesi, 60_000);
  document.addEventListener('visibilitychange', () => {
    // Ditinggal: catat saatnya. Di HP setelah ini halaman dibekukan/dimatikan.
    if (document.hidden) db.tandaHidup();
    else cekSesi();
  });
  // Tab ditutup / pindah situs: beri tahu server (lihat db.tandaiTutup).
  window.addEventListener('pagehide', () => db.tandaiTutup());
  // Kembali lewat tombol Back dari cache browser: kode tidak dimuat ulang,
  // jadi tanya server lagi apakah sesinya masih berlaku.
  window.addEventListener('pageshow', (e) => { if (e.persisted) cekSesi(); });
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
    // Tanya server DULU sebelum isi aplikasi tampil: sesi ini bisa saja sudah
    // dikeluarkan perangkat lain atau tabnya sudah ditutup lalu dipulihkan.
    if (!(await db.cekPerangkat())) {
      const alasan = db.sesiHabis();
      await gambarLogin();
      if (alasan === 'perangkat') pesan(PESAN_KELUAR.perangkat, 'salah');
      return;
    }
    db.tandaHidup();
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
  segarkanLencana();
}

window.addEventListener('hashchange', () => {
  if (status.profil) gambarHalaman();
});

pantauPapanTombol();
pantauSesi();
mulai();
