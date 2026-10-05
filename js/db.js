// Klien Supabase ringan (tanpa pustaka luar) — dibuat kecil supaya cepat di HP.
// Hanya yang dipakai: login PIN, perpanjang token, baca tabel, panggil RPC.

import { CONFIG } from './config.js';

const KUNCI_SESI = 'order-sesi-v1';

/**
 * Sesi disimpan PER TAB (sessionStorage), bukan permanen (localStorage):
 * menutup tab / browser = harus masuk lagi. Muat ulang tetap masuk.
 * Permintaan pemilik — sebelumnya membuka situs dari riwayat browser
 * langsung masuk tanpa PIN.
 */
const tempatSesi = (() => {
  try { return window.sessionStorage; } catch { return null; }
})();

/**
 * Berapa lama satu sesi berlaku, dihitung sejak MASUK — bukan sejak
 * pemakaian terakhir. Lewat batas ini token tidak diperpanjang lagi dan
 * pengguna wajib memasukkan username + PIN lagi.
 *
 * Mau ubah? Ganti angka di baris ini saja; sisanya ikut sendiri.
 */
export const SESI_BERLAKU_JAM = 12;
const SESI_BERLAKU_MS = SESI_BERLAKU_JAM * 60 * 60 * 1000;

let sesi = null;
let profil = null;

/**
 * Kenapa sesi terakhir putus — bukan karena tombol Keluar:
 *   'habis'    = lewat batas SESI_BERLAKU_JAM
 *   'perangkat'= akun ini masuk di perangkat ke-3; perangkat ini yang paling
 *                lama, jadi dikeluarkan server (maks 2 perangkat per akun)
 */
let alasanKeluar = null;

try {
  sesi = JSON.parse(tempatSesi?.getItem(KUNCI_SESI) || 'null');
} catch {
  sesi = null;
}

// Sesi versi lama tersimpan permanen di localStorage. Dibuang dan dicabut
// di server SEKALI; setelah itu semua orang masuk lagi satu kali.
try {
  const lama = JSON.parse(localStorage.getItem(KUNCI_SESI) || 'null');
  localStorage.removeItem(KUNCI_SESI);
  if (lama?.access_token) cabutDiServer(lama.access_token);
} catch { /* abaikan */ }

/**
 * Sesi tanpa penanda `mulai` berasal dari versi sebelum fitur ini ada.
 * Sengaja dianggap habis: sekali saja semua orang diminta masuk lagi,
 * setelah itu setiap sesi punya titik mulai yang jelas.
 */
function lewatBatas(s) {
  return !s || typeof s.mulai !== 'number' || Date.now() - s.mulai >= SESI_BERLAKU_MS;
}

/** Buang sesi yang sudah habis. Mengembalikan true kalau memang dibuang. */
function buangKalauHabis() {
  if (!sesi || !lewatBatas(sesi)) return false;
  const token = sesi.access_token;
  simpanSesi(null);
  profil = null;
  alasanKeluar = 'habis';
  cabutDiServer(token);   // supaya refresh_token-nya tidak bisa dipakai lagi
  return true;
}

/**
 * Cabut token di server. Sengaja tidak ditunggu — sesi lokal sudah hilang.
 * scope=local WAJIB: tanpa itu Supabase mengeluarkan SEMUA perangkat akun
 * ini, padahal satu akun boleh aktif di 2 perangkat.
 */
function cabutDiServer(token) {
  if (!token) return;
  try {
    fetch(CONFIG.URL + '/auth/v1/logout?scope=local', {
      method: 'POST',
      headers: { apikey: CONFIG.KUNCI_PUBLIK, Authorization: 'Bearer ' + token },
    }).catch(() => {});
  } catch { /* tidak ada internet — biarkan, sesi lokal sudah dihapus */ }
}

/** Kenapa sesi terakhir putus: 'habis' | 'perangkat' | null. Dipakai layar masuk. */
export function sesiHabis() {
  return alasanKeluar;
}

/** Dipanggil layar masuk setelah pemberitahuannya ditampilkan. */
export function lupakanSesiHabis() {
  alasanKeluar = null;
}

buangKalauHabis();

function simpanSesi(s) {
  sesi = s;
  try {
    if (s) tempatSesi?.setItem(KUNCI_SESI, JSON.stringify(s));
    else tempatSesi?.removeItem(KUNCI_SESI);
  } catch { /* penyimpanan diblokir: sesi tetap hidup di memori tab ini */ }
}

function pesanGagal(data, status) {
  const t =
    data?.msg || data?.message || data?.error_description || data?.error ||
    data?.hint || (typeof data === 'string' ? data : '');
  if (/invalid login credentials/i.test(t)) return 'Username atau PIN salah.';
  if (/email not confirmed/i.test(t)) return 'Akun belum diaktifkan. Hubungi admin.';
  if (status === 0) return 'Tidak ada koneksi internet. Coba lagi.';
  return t || `Gagal (kode ${status}).`;
}

async function kirim(path, { method = 'GET', body, headers = {}, pakaiToken = true } = {}) {
  const h = {
    apikey: CONFIG.KUNCI_PUBLIK,
    'Content-Type': 'application/json',
    ...headers,
  };
  if (pakaiToken) {
    const token = await tokenSegar();
    h.Authorization = 'Bearer ' + (token || CONFIG.KUNCI_PUBLIK);
  }

  let res;
  try {
    res = await fetch(CONFIG.URL + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Tidak ada koneksi internet. Coba lagi.');
  }

  const teks = await res.text();
  let data = null;
  if (teks) {
    try { data = JSON.parse(teks); } catch { data = teks; }
  }

  if (!res.ok) {
    if (res.status === 401 && pakaiToken) {
      simpanSesi(null);
      profil = null;
    }
    throw new Error(pesanGagal(data, res.status));
  }
  return data;
}

/** Token yang masih hidup; diperpanjang otomatis kalau hampir mati. */
async function tokenSegar() {
  if (!sesi) return null;
  // Sesi yang sudah lewat batas TIDAK diperpanjang — inilah yang membuat
  // pengguna benar-benar harus masuk lagi, bukan sekadar diberi pesan.
  if (buangKalauHabis()) return null;
  if (sesi.kedaluwarsa - Date.now() > 60_000) return sesi.access_token;
  try {
    const d = await kirim('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: sesi.refresh_token },
      pakaiToken: false,
    });
    simpanSesi({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      user_id: d.user?.id ?? sesi.user_id,
      kedaluwarsa: Date.now() + (d.expires_in ?? 3600) * 1000,
      mulai: sesi.mulai,   // JANGAN direset: batas dihitung sejak masuk
    });
    return sesi.access_token;
  } catch {
    simpanSesi(null);
    profil = null;
    return null;
  }
}

/** Login pakai username + PIN. */
export async function masuk(username, pin) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(pin || '').trim();
  if (!u) throw new Error('Username belum diisi.');
  if (!/^\d{6}$/.test(p)) throw new Error('PIN harus 6 angka.');

  const d = await kirim('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: u + CONFIG.DOMAIN_LOGIN, password: p },
    pakaiToken: false,
  });

  simpanSesi({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    user_id: d.user?.id,
    kedaluwarsa: Date.now() + (d.expires_in ?? 3600) * 1000,
    mulai: Date.now(),   // titik hitung batas sesi
  });

  alasanKeluar = null;
  profil = null;
  const pr = await profilSaya();
  if (!pr) {
    simpanSesi(null);
    throw new Error('Akun belum punya profil. Hubungi admin.');
  }
  if (!pr.aktif) {
    simpanSesi(null);
    throw new Error('Akun sudah dinonaktifkan. Hubungi admin.');
  }
  return pr;
}

export async function keluar() {
  const token = sesi?.access_token;
  simpanSesi(null);
  profil = null;
  alasanKeluar = null;    // keluar sendiri, bukan kehabisan waktu
  cabutDiServer(token);
}

/**
 * Lapor ke server bahwa tab ini masih hidup, sekaligus tanya apakah sesinya
 * masih berlaku. Jawaban server (cek_sesi):
 *   'aktif'       -> lanjut
 *   'dikeluarkan' -> akun ini masuk di perangkat ke-3 dan perangkat ini yang
 *                    paling lama tidak dipakai (maks 2 perangkat per akun)
 *   'ditutup'     -> halaman ini sudah ditinggalkan > 2 menit lalu dibuka lagi
 *                    (mis. tab yang dipulihkan browser) -> wajib masuk lagi
 * Tanpa internet dianggap masih berlaku, supaya sales di lapangan tidak terlempar.
 */
export async function cekPerangkat() {
  if (!sesi) return false;
  let st;
  try {
    st = await rpc('cek_sesi');
  } catch {
    return !!sesi;   // gagal tersambung / token ditolak: diurus di tempat lain
  }
  if (st === 'dikeluarkan') {
    simpanSesi(null);   // sesinya sudah dihapus server, tidak perlu logout
    profil = null;
    alasanKeluar = 'perangkat';
    return false;
  }
  if (st === 'ditutup') {
    const token = sesi?.access_token;
    simpanSesi(null);
    profil = null;
    alasanKeluar = null;
    cabutDiServer(token);
    return false;
  }
  return true;
}

/**
 * Halaman ditinggalkan (tab ditutup, pindah situs, atau muat ulang — browser
 * tidak membedakannya). Tandai sesinya "tertutup" di server supaya kalau ada
 * login baru, sesi inilah yang dibuang lebih dulu — bukan HP yang masih
 * dipakai. Muat ulang aman: laporan berikutnya dalam 2 menit membatalkan tanda.
 */
export function tandaiTutup() {
  if (!sesi?.access_token) return;
  try {
    fetch(CONFIG.URL + '/rest/v1/rpc/tutup_sesi', {
      method: 'POST',
      keepalive: true,   // tetap terkirim walau halamannya sedang ditutup
      headers: {
        apikey: CONFIG.KUNCI_PUBLIK,
        Authorization: 'Bearer ' + sesi.access_token,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }).catch(() => {});
  } catch { /* abaikan */ }
}

export function adaSesi() {
  buangKalauHabis();
  return !!sesi;
}

/** Profil pengguna yang sedang login (di-cache). */
export async function profilSaya() {
  if (profil) return profil;
  if (!sesi) return null;
  const r = await pilih('profil', { select: '*', id: 'eq.' + sesi.user_id, limit: 1 });
  profil = r[0] || null;
  return profil;
}

/** Supabase memberi paling banyak 1.000 baris per permintaan (bawaan). */
const PER_HALAMAN = 1000;

/**
 * SELECT sederhana. Contoh:
 *   pilih('barang', { select: 'id,nama', aktif: 'eq.true', order: 'nama.asc', limit: 500 })
 *
 * Diambil bertahap per 1.000 baris sampai `limit` (tanpa limit = semua).
 * Tanpa ini, hasil di atas 1.000 baris TERPOTONG DIAM-DIAM oleh server.
 * Karena itu `order` harus unik (tambahkan id sebagai pemutus seri), supaya
 * tidak ada baris yang terlewat atau terulang di antara dua halaman.
 */
export async function pilih(tabel, params = {}) {
  const q = new URLSearchParams();
  let batas = Infinity;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'limit') batas = Number(v);
    else if (k === 'offset') continue;   // diatur di bawah
    else q.append(k, v);
  }
  if (!q.has('select')) q.set('select', '*');
  let mulaiDari = Number(params.offset) || 0;

  const hasil = [];
  while (hasil.length < batas) {
    const ambil = Math.min(PER_HALAMAN, batas - hasil.length);
    q.set('limit', String(ambil));
    q.set('offset', String(mulaiDari));
    const baris = await kirim(`/rest/v1/${tabel}?${q.toString()}`);
    if (!Array.isArray(baris)) return baris;
    for (const r of baris) hasil.push(r);
    if (baris.length < ambil) break;
    mulaiDari += baris.length;
  }
  return hasil;
}

/** Panggil fungsi RPC di database. */
export async function rpc(nama, args = {}) {
  return kirim(`/rest/v1/rpc/${nama}`, { method: 'POST', body: args });
}

/** INSERT / UPDATE untuk tabel master (hanya lolos bila admin — disaring RLS). */
export async function sisip(tabel, baris) {
  return kirim(`/rest/v1/${tabel}?select=*`, {
    method: 'POST',
    body: baris,
    headers: { Prefer: 'return=representation' },
  });
}

export async function ubah(tabel, id, isi) {
  return kirim(`/rest/v1/${tabel}?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    body: isi,
    headers: { Prefer: 'return=representation' },
  });
}
