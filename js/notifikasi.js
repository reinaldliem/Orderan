// Lonceng notifikasi untuk admin: catatan tambahan dari sales.
//
// Sales menambah catatan pada order (mis. minta revisi harga). Admin melihat
// angka merah di lonceng di pojok atas; diketuk -> daftar pendek (siapa,
// toko, isi catatan). Ketuk satu -> langsung ke order itu dan catatannya
// dianggap sudah dibaca. Sengaja ringan: bukan halaman/tab tersendiri.
//
// Angka diperbarui tiap menit & saat aplikasi dibuka (dipanggil app.js).

import * as db from './db.js';
import { ikon } from './ikon.js';
import { esc, pesan } from './util.js';

let jml = 0;               // catatan yang belum dibaca admin
let pernahDiisi = false;   // pemberitahuan "catatan baru" hanya setelah angka pertama
let panel = null;          // panel daftar yang sedang terbuka
let tombolAktif = null;

const FMT_WAKTU = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit',
});

/** Tombol lonceng untuk header (hanya dipasang untuk admin). */
export function tombolLonceng() {
  return `<button type="button" class="btn-atas lonceng" id="btn-lonceng"
            aria-haspopup="dialog" aria-expanded="false" aria-label="Notifikasi catatan dari sales">
      ${ikon('lonceng', 19)}<span class="lencana" data-lencana="catatan" hidden></span></button>`;
}

export function pasangLonceng(tombol) {
  if (!tombol) return;
  tombol.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel) tutup(); else buka(tombol);
  });
  pasangAngka();
}

function pasangAngka() {
  document.querySelectorAll('[data-lencana="catatan"]').forEach((el) => {
    el.textContent = jml > 99 ? '99+' : String(jml);
    el.hidden = jml === 0;
  });
  const t = document.getElementById('btn-lonceng');
  if (t) t.setAttribute('aria-label', jml ? `Notifikasi: ${jml} catatan baru dari sales` : 'Notifikasi catatan dari sales');
}

/** Tanya server berapa catatan yang belum dibaca. Tanpa internet: angka lama dibiarkan. */
export async function segarkan() {
  let n;
  try {
    n = Number(await db.rpc('jml_catatan_baru')) || 0;
  } catch {
    return;
  }
  if (pernahDiisi && n > jml) {
    pesan(`${n - jml} catatan baru dari sales — ketuk lonceng di atas.`, 'ok');
  }
  jml = n;
  pernahDiisi = true;
  pasangAngka();
}

/** Keluar: semua dibuang, supaya akun berikutnya mulai bersih. */
export function lupakan() {
  jml = 0;
  pernahDiisi = false;
  tutup();
}

/* ---------------- panel daftar ---------------- */
function tutup() {
  if (!panel) return;
  panel.remove();
  panel = null;
  document.removeEventListener('click', klikLuar, true);
  document.removeEventListener('keydown', tombolEsc);
  window.removeEventListener('hashchange', tutup);
  tombolAktif?.setAttribute('aria-expanded', 'false');
  tombolAktif = null;
}

function klikLuar(e) {
  if (panel && !panel.contains(e.target) && !tombolAktif?.contains(e.target)) tutup();
}

function tombolEsc(e) {
  if (e.key === 'Escape') { tutup(); tombolAktif?.focus(); }
}

async function buka(tombol) {
  tombolAktif = tombol;
  tombol.setAttribute('aria-expanded', 'true');
  panel = document.createElement('div');
  panel.className = 'panel-notif';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Notifikasi');
  panel.innerHTML = `
    <div class="pn-kepala">
      <b>Notifikasi</b>
      <button type="button" class="pn-semua" hidden>Tandai semua dibaca</button>
    </div>
    <div class="pn-isi"><div class="memuat"><div class="putar"></div>Memuat…</div></div>`;
  document.body.appendChild(panel);

  // tepat di bawah header, rata kanan dengan isi aplikasi
  const kepala = tombol.closest('.atas') || document.querySelector('.atas');
  const r = (kepala || tombol).getBoundingClientRect();
  panel.style.top = `${Math.max(8, r.bottom + 6)}px`;
  panel.style.right = `${Math.max(12, window.innerWidth - r.right + 12)}px`;

  document.addEventListener('click', klikLuar, true);
  document.addEventListener('keydown', tombolEsc);
  window.addEventListener('hashchange', tutup);

  panel.addEventListener('click', async (e) => {
    const semua = e.target.closest('.pn-semua');
    if (semua) {
      semua.disabled = true;
      try {
        await db.rpc('tandai_semua_catatan_dibaca');
        await segarkan();
        isiPanel([], {});
      } catch (err) {
        semua.disabled = false;
        pesan(err.message, 'salah');
      }
      return;
    }
    const item = e.target.closest('[data-pesanan]');
    if (!item) return;
    const id = item.dataset.pesanan;
    try {
      await db.rpc('tandai_catatan_dibaca', { p_pesanan_id: Number(id) });
    } catch { /* tetap buka ordernya */ }
    segarkan();
    tutup();
    location.hash = `#/admin/order/${id}`;
  });

  try {
    const [catatan, orang] = await Promise.all([
      db.pilih('pesanan_catatan', {
        select: 'id,teks,dibuat_pada,oleh,pesanan_id,pesanan(no_pesanan,toko_nama)',
        dibaca_pada: 'is.null',
        order: 'dibuat_pada.desc,id.desc',
        limit: 50,
      }),
      db.pilih('profil', { select: 'id,nama' }),
    ]);
    if (!panel) return;   // sudah ditutup selagi memuat
    isiPanel(catatan, Object.fromEntries(orang.map((o) => [o.id, o.nama])));
  } catch (err) {
    if (!panel) return;
    panel.querySelector('.pn-isi').innerHTML =
      `<div class="pn-kosong">${esc(err.message || 'Gagal memuat notifikasi.')}</div>`;
  }
}

function isiPanel(catatan, nama) {
  if (!panel) return;
  panel.querySelector('.pn-semua').hidden = catatan.length === 0;
  panel.querySelector('.pn-isi').innerHTML = catatan.length
    ? catatan.map((c) => `
      <button type="button" class="pn-item" data-pesanan="${esc(c.pesanan_id)}">
        <span class="pn-siapa">${esc(nama[c.oleh] || 'Sales')} · ${esc(c.pesanan?.toko_nama || '')}</span>
        <span class="pn-teks">${esc(c.teks)}</span>
        <span class="pn-waktu">${esc(c.pesanan?.no_pesanan || '')} · ${esc(FMT_WAKTU.format(new Date(c.dibuat_pada)))}</span>
      </button>`).join('')
    : `<div class="pn-kosong">Tidak ada catatan baru dari sales.</div>`;
}
