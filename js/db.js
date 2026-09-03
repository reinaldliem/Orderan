// Klien Supabase ringan (tanpa pustaka luar) — dibuat kecil supaya cepat di HP.
// Hanya yang dipakai: login PIN, perpanjang token, baca tabel, panggil RPC.

import { CONFIG } from './config.js';

const KUNCI_SESI = 'order-sesi-v1';
let sesi = null;
let profil = null;

try {
  sesi = JSON.parse(localStorage.getItem(KUNCI_SESI) || 'null');
} catch {
  sesi = null;
}

function simpanSesi(s) {
  sesi = s;
  if (s) localStorage.setItem(KUNCI_SESI, JSON.stringify(s));
  else localStorage.removeItem(KUNCI_SESI);
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
  });

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
  if (token) {
    try {
      await fetch(CONFIG.URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: CONFIG.KUNCI_PUBLIK, Authorization: 'Bearer ' + token },
      });
    } catch { /* biarkan — sesi lokal sudah dihapus */ }
  }
}

export function adaSesi() {
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

/**
 * SELECT sederhana. Contoh:
 *   pilih('barang', { select: 'id,nama', aktif: 'eq.true', order: 'nama.asc', limit: 500 })
 */
export async function pilih(tabel, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  }
  if (!q.has('select')) q.set('select', '*');
  return kirim(`/rest/v1/${tabel}?${q.toString()}`);
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
