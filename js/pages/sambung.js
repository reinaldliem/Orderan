// Layar "Sambungkan ke database".
// Muncul kalau aplikasi belum tahu alamat databasenya. Tujuannya supaya
// pemilik tidak perlu membuka berkas kode sama sekali.

import { CONFIG, simpanSambungan } from '../config.js';
import { esc, pesan } from '../util.js';

/** Baca isi tengah token JWT tanpa memverifikasi apa pun — hanya untuk cek peran. */
function bacaPeranKunci(kunci) {
  const k = String(kunci || '').trim();
  if (k.startsWith('sb_secret_')) return 'service_role';
  if (k.startsWith('sb_publishable_')) return 'anon';
  const bagian = k.split('.');
  if (bagian.length !== 3) return null;
  try {
    const isi = JSON.parse(
      atob(bagian[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    return isi.role || null;
  } catch {
    return null;
  }
}

/**
 * Terima bermacam bentuk, keluarkan alamat database yang benar.
 * Supabase sering mengubah tata letak dashboard, jadi jangan memaksa
 * pemilik menemukan tulisan "Project URL".
 *
 *   https://abcdefgh.supabase.co              -> apa adanya
 *   abcdefgh.supabase.co                      -> ditambah https://
 *   https://supabase.com/dashboard/project/abcdefgh/settings/api
 *                                              -> https://abcdefgh.supabase.co
 *   abcdefgh                                   -> https://abcdefgh.supabase.co
 *   postgresql://...@db.abcdefgh.supabase.co.. -> https://abcdefgh.supabase.co
 */
export function bersihkanUrl(teks) {
  let t = String(teks || '').trim();
  if (!t) return '';

  // alamat dashboard: .../project/<ref>/...
  const dash = t.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,})/i);
  if (dash) return 'https://' + dash[1].toLowerCase() + '.supabase.co';

  // alamat sambungan database: db.<ref>.supabase.co
  const dbHost = t.match(/\bdb\.([a-z0-9]{16,})\.supabase\.co\b/i);
  if (dbHost) return 'https://' + dbHost[1].toLowerCase() + '.supabase.co';

  // sudah berbentuk <ref>.supabase.co
  const langsung = t.match(/\b([a-z0-9]{16,})\.supabase\.co\b/i);
  if (langsung) return 'https://' + langsung[1].toLowerCase() + '.supabase.co';

  // hanya kode proyeknya saja
  if (/^[a-z0-9]{16,}$/i.test(t)) return 'https://' + t.toLowerCase() + '.supabase.co';

  // bukan bentuk yang dikenal — rapikan sedikit lalu biarkan divalidasi
  t = t.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  return t;
}

export async function gambar(app, { setelahTersambung }) {
  document.body.classList.add('tanpa-bar');

  app.innerHTML = `
    <header class="atas">
      <div>
        <h1>Sambungkan ke database</h1>
        <div class="sub">Sekali saja, lalu tidak ditanya lagi</div>
      </div>
    </header>

    <main class="isi">
      <div class="kartu">
        <div class="judul-bagian">Kotak 1 — alamat database</div>
        <p style="margin:0 0 10px;font-size:14.5px;line-height:1.6">
          <b>Tidak perlu mencari tulisan "Project URL".</b> Buka proyek Anda di
          supabase.com, lalu <b>copy saja seluruh alamat di address bar</b> —
          yang bentuknya seperti ini:
        </p>
        <div class="kode" style="display:block;padding:9px 11px;line-height:1.5;white-space:normal">
          https://supabase.com/dashboard/project/<b>abcdefghijklmnop</b>
        </div>
        <p style="margin:10px 0 0;font-size:14.5px;line-height:1.6">
          Tempel apa adanya ke kotak pertama. Aplikasi akan mengambil sendiri
          bagian yang dibutuhkan.
        </p>
      </div>

      <div class="kartu">
        <div class="judul-bagian">Kotak 2 — kunci</div>
        <p style="margin:0;font-size:14.5px;line-height:1.7">
          Di halaman proyek, cari menu <b>Project Settings</b> (ikon gerigi) →
          lalu <b>API Keys</b>, atau <b>Data API</b>, atau <b>API</b> —
          namanya berbeda tergantung versi Supabase.
        </p>
        <p style="margin:10px 0 0;font-size:14.5px;line-height:1.7">
          Ada juga tombol <b>Connect</b> di bagian atas halaman proyek; di situ
          alamat dan kuncinya ditampilkan bersamaan.
        </p>
        <p style="margin:10px 0 0;font-size:14.5px;line-height:1.7">
          Yang dicopy: kunci bertanda <b>anon</b> / <b>public</b> /
          <b>publishable</b>. Teksnya panjang, mulai <code>eyJ…</code> atau
          <code>sb_publishable_…</code>
        </p>
      </div>

      <div class="peringatan">
        <b>Jangan pakai kunci "service_role"</b>
        Di halaman yang sama ada kunci lain bernama <code>service_role</code> —
        itu kunci rahasia, jangan dipakai di sini. Yang benar bertuliskan
        <code>anon</code> <code>public</code>. Aplikasi ini akan menolak
        kalau yang ditempel salah.
      </div>

      <div class="kartu">
        <div class="baris">
          <label class="label" for="s-url">1. Alamat database</label>
          <input type="text" id="s-url" inputmode="url"
                 autocapitalize="none" autocorrect="off" spellcheck="false"
                 placeholder="tempel alamat address bar Supabase di sini">
          <div class="bantuan" id="s-cek-url">
            Boleh alamat dashboard, boleh <code>https://xxx.supabase.co</code>,
            boleh kode proyeknya saja.
          </div>
        </div>
        <div class="baris">
          <label class="label" for="s-kunci">2. Kunci anon / public</label>
          <textarea id="s-kunci" rows="4"
                    autocapitalize="none" autocorrect="off" spellcheck="false"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."></textarea>
          <div class="bantuan" id="s-cek">Teksnya panjang — tempel saja seluruhnya.</div>
        </div>
        <button type="button" class="btn" id="s-simpan">Sambungkan</button>
      </div>

      <div class="kartu">
        <div class="judul-bagian">Belum punya database?</div>
        <p style="margin:0;font-size:14.5px;line-height:1.6;color:var(--teks-2)">
          Buat dulu proyek Supabase (gratis, region <b>Singapore</b>), lalu jalankan
          dua berkas SQL: <code>PASANG-SEMUA.sql</code> dan <code>02-akun.sql</code>.
          Langkahnya ada di <b>CARA-PASANG.md</b>.
        </p>
      </div>
    </main>`;

  const inUrl = app.querySelector('#s-url');
  const inKunci = app.querySelector('#s-kunci');
  const elCek = app.querySelector('#s-cek');
  const elCekUrl = app.querySelector('#s-cek-url');
  const btn = app.querySelector('#s-simpan');

  const URL_BENAR = /^https:\/\/[a-z0-9]+\.supabase\.co$/i;

  inUrl.addEventListener('input', () => {
    const t = inUrl.value.trim();
    if (!t) {
      elCekUrl.innerHTML = 'Boleh alamat dashboard, boleh <code>https://xxx.supabase.co</code>, ' +
                           'boleh kode proyeknya saja.';
      elCekUrl.style.color = '';
      return;
    }
    const u = bersihkanUrl(t);
    if (URL_BENAR.test(u)) {
      elCekUrl.textContent = '✔ Terbaca sebagai: ' + u;
      elCekUrl.style.color = 'var(--hijau)';
    } else {
      elCekUrl.textContent = 'Belum terbaca. Tempel alamat lengkap dari address bar Supabase.';
      elCekUrl.style.color = 'var(--tunggu)';
    }
  });

  inKunci.addEventListener('input', () => {
    const peran = bacaPeranKunci(inKunci.value);
    if (!inKunci.value.trim()) {
      elCek.textContent = 'Teksnya panjang — tempel saja seluruhnya.';
      elCek.style.color = '';
    } else if (peran === 'anon') {
      elCek.textContent = '✔ Kunci benar (anon public).';
      elCek.style.color = 'var(--hijau)';
    } else if (peran === 'service_role') {
      elCek.textContent = '✘ Ini kunci service_role — jangan dipakai. Ambil yang anon public.';
      elCek.style.color = 'var(--merah)';
    } else {
      elCek.textContent = 'Belum terbaca sebagai kunci Supabase. Pastikan tersalin utuh.';
      elCek.style.color = 'var(--tunggu)';
    }
  });

  btn.addEventListener('click', async () => {
    const url = bersihkanUrl(inUrl.value);
    const kunci = inKunci.value.trim();

    if (!URL_BENAR.test(url)) {
      pesan('Alamat database belum terbaca. Tempel alamat dari address bar Supabase.', 'salah');
      inUrl.focus();
      return;
    }
    if (!kunci) { pesan('Kuncinya belum ditempel.', 'salah'); inKunci.focus(); return; }

    const peran = bacaPeranKunci(kunci);
    if (peran === 'service_role') {
      pesan('Itu kunci service_role. Ambil kunci "anon public".', 'salah');
      inKunci.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Mengecek sambungan…';
    try {
      // Uji betulan: minta 1 baris dari tabel barang.
      const res = await fetch(url + '/rest/v1/barang?select=id&limit=1', {
        headers: { apikey: kunci, Authorization: 'Bearer ' + kunci },
      });

      if (res.status === 404) {
        throw new Error('Database tersambung, tapi tabelnya belum ada. ' +
                        'Jalankan dulu PASANG-SEMUA.sql di Supabase → SQL Editor.');
      }
      if (res.status === 401 || res.status === 403) {
        // 401/403 dari PostgREST justru menandakan kunci & RLS bekerja:
        // tamu memang tidak boleh membaca apa pun.
        simpanSambungan(url, kunci);
        pesan('Tersambung. Silakan masuk.', 'ok');
        await setelahTersambung();
        return;
      }
      if (!res.ok) {
        throw new Error('Sambungan gagal (kode ' + res.status + '). Periksa URL dan kuncinya.');
      }

      simpanSambungan(url, kunci);
      pesan('Tersambung ke database.', 'ok');
      await setelahTersambung();
    } catch (e) {
      pesan(e.message?.includes('Failed to fetch')
        ? 'Tidak bisa menghubungi database. Periksa internet dan Project URL.'
        : (e.message || 'Sambungan gagal.'), 'salah');
      btn.disabled = false;
      btn.textContent = 'Sambungkan';
    }
  });

  if (!CONFIG.URL.includes('XXXX')) inUrl.value = CONFIG.URL;
  setTimeout(() => inUrl.focus(), 120);
}
