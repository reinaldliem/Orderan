// Halaman masuk: username + PIN 6 angka.

import * as db from '../db.js';
import { DARI_LAYAR, hapusSambungan } from '../config.js';
import { pesan, tanya } from '../util.js';

export async function gambar(app, { setelahMasuk }) {
  const ingat = localStorage.getItem('order-username') || '';

  app.innerHTML = `
    <main class="masuk">
      <div class="logo">📋</div>
      <h1>Order Sales</h1>
      <p class="halo">Masuk dulu untuk mulai membuat order</p>

      <form id="form-masuk" autocomplete="on" novalidate>
        <div class="baris">
          <label class="label" for="u">Username</label>
          <input type="text" id="u" name="username" value="${ingat.replace(/"/g, '&quot;')}"
                 placeholder="contoh: aan" autocapitalize="none"
                 autocorrect="off" spellcheck="false" autocomplete="username"
                 enterkeyhint="next" inputmode="text">
        </div>

        <div class="baris">
          <label class="label" for="p">PIN (6 angka)</label>
          <input type="password" id="p" name="pin" class="pin-input" placeholder="······"
                 inputmode="numeric" autocomplete="current-password"
                 maxlength="6" enterkeyhint="go">
          <div class="bantuan">
            <label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--teks-2);cursor:pointer">
              <input type="checkbox" id="lihat" style="width:20px;height:20px;min-height:20px;padding:0">
              Tampilkan PIN
            </label>
          </div>
        </div>

        <button type="submit" class="btn" id="btn-masuk">Masuk</button>
      </form>

      <p class="bantuan" style="text-align:center;margin-top:18px">
        Lupa PIN? Hubungi admin untuk PIN baru.
      </p>

      ${DARI_LAYAR ? `
      <p style="text-align:center;margin-top:22px">
        <button type="button" id="btn-sambungan"
                style="background:none;border:none;font-family:inherit;font-size:13px;
                       color:var(--teks-3);text-decoration:underline;cursor:pointer;
                       min-height:44px;padding:0 12px">
          Ganti sambungan database
        </button>
      </p>` : ''}
    </main>`;

  const form = app.querySelector('#form-masuk');
  const u = app.querySelector('#u');
  const p = app.querySelector('#p');
  const btn = app.querySelector('#btn-masuk');

  app.querySelector('#lihat').addEventListener('change', (e) => {
    p.type = e.target.checked ? 'text' : 'password';
  });

  p.addEventListener('input', () => {
    p.value = p.value.replace(/\D/g, '').slice(0, 6);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const un = u.value.trim().toLowerCase();
    const pin = p.value.trim();

    if (!un) { pesan('Username belum diisi.', 'salah'); u.focus(); return; }
    if (pin.length !== 6) { pesan('PIN harus 6 angka.', 'salah'); p.focus(); return; }

    btn.disabled = true;
    btn.textContent = 'Sedang masuk…';
    try {
      const pr = await db.masuk(un, pin);
      localStorage.setItem('order-username', un);
      pesan('Selamat datang, ' + pr.nama, 'ok');
      await setelahMasuk(pr);
    } catch (err) {
      pesan(err.message || 'Gagal masuk.', 'salah');
      p.value = '';
      p.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Masuk';
    }
  });

  app.querySelector('#btn-sambungan')?.addEventListener('click', async () => {
    if (!(await tanya('Ganti sambungan database?',
      'Anda akan diminta menempel Project URL dan kunci anon public lagi.',
      'Ya, ganti'))) return;
    hapusSambungan();
    location.reload();
  });

  if (ingat) p.focus(); else u.focus();
}
