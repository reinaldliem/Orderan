// Pencocokan teks untuk dropdown pencarian (pilih.js). Dipisah dari
// tampilan supaya bisa diuji tanpa browser.
//
// Dua tingkat:
//  COCOK — setiap kata yang diketik ada di nama, urutan bebas. Kata boleh
//          awal kata di nama ("sem" -> SEMEN, "seng 10" -> SENG GEL ... 10
//          FEET) atau singkatan yang dipakai daftar: potongan ("gelombang"
//          -> GEL) dan huruf mati ("hitam" -> HTM, "pintu" -> PNT,
//          "tanggung" -> TGG, "solvex" -> SLVX), dua arah.
//  MIRIP — tidak semua kata cocok, tapi sebagian besar cocok atau hanya
//          beda satu huruf ("loker" -> LOKET, "fet" -> FEET). Ditawarkan
//          sebagai "Mungkin maksud Anda" sebelum sales memakai nama baru.
// Angka tidak pernah dianggap salah ketik: 30 tidak mirip 40 (30CM dan
// 40CM barang berbeda). Tidak ada nama yang diubah atau digabung.

/**
 * Pecah teks jadi kata huruf kecil. Tanda baca jadi pemisah, tapi 1/2 dan
 * 0.2 / 7,5 tetap utuh (koma desimal dibaca titik). Angka yang diikuti
 * satuan dipisah ("40kg" = "40 kg"), ukuran "2 x 3" = "2x3". Kode huruf+angka
 * TETAP SATU kata (A3, BD2, OT10, M4): A3 tidak boleh cocok dengan A5.
 */
export function pecahKata(teks) {
  return String(teks ?? '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/½/g, ' 1/2').replace(/¾/g, ' 3/4').replace(/¼/g, ' 1/4')
    .replace(/(\d)\s*x\s*(\d)/g, '$1x$2')
    .replace(/(\d)[.,](\d)/g, '$1\u0001$2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9/\u0001]+/)
    .map((k) => k.replace(/\u0001/g, '.'))
    .filter((k) => k && k !== '/');
}

/**
 * Kata yang SAMA dengan ejaan berbeda — disusun dari analisa usulan sales
 * (14 Nov 2026) dan dari daftar resmi sendiri (GRAJI & GERGAJI sama-sama ada).
 * Kata pertama = bentuk baku. Hanya ejaan kata yang sama: merek yang BERBEDA
 * tidak pernah disamakan (camar ≠ camel, viper ≠ vipro), dan nama barang di
 * database tidak diubah — ini hanya membantu pencarian.
 */
const SINONIM = [
  // salah ketik / ejaan lain yang dipakai sales
  ['gergaji', 'graji'],
  ['selang', 'slang', 'selan'],
  ['shower', 'sower'],
  ['loket', 'loker'],
  ['toren', 'toten'],
  ['talang', 'talng'],
  ['standar', 'standart', 'standard', 'setandat'],
  ['jelly', 'jely'],
  ['pipa', 'piva'],
  // ejaan nama barang
  ['knee', 'kenie', 'keni', 'elbow'],
  ['sock', 'sok'],
  ['sekrup', 'skrup', 'sekerup'],
  ['gipsum', 'gypsum'],
  ['dobel', 'double', 'doble'],
  ['rubber', 'ruber'],
  ['sealant', 'sealent'],
  ['classic', 'clasic', 'klasik'],
  ['flexible', 'fleksibel', 'flexibel', 'fleksible'],
  // merek yang sama, ejaan berbeda
  ['watertec', 'wattertec', 'watertek'],
  ['solvex', 'solvek'],
  ['handjin', 'hanjin'],
  ['fumetax', 'fumextax'],
  ['maxtech', 'maxech', 'maxtec', 'maxtek'],
  ['shliper', 'sliper', 'shilper'],
  ['matrix', 'mtrix'],
  ['rhino', 'rino'],
  ['sapphire', 'saphire'],
  // warna & bahan: daftar memakai bahasa Inggris, sales mengetik Indonesia
  ['hitam', 'black'],
  ['putih', 'white'],
  ['emas', 'gold'],
  ['bening', 'clear'],
  ['abu', 'grey', 'gray'],
  ['kuningan', 'brass'],
  ['chrome', 'crom', 'krom', 'crome', 'chrom'],
  ['stainless', 'stenlis', 'stainles', 'stenles', 'stenless'],
  // ukuran
  ['feet', 'fet', 'ft', 'feel'],
  // ejaan baku vs sehari-hari
  ['kran', 'keran'],
  ['stang', 'setang'],
  ['magnet', 'mahnet'],
  ['amplas', 'ampelas'],
  ['closet', 'kloset'],
  ['wastafel', 'westafel'],
  ['baut', 'baud'],
  ['fisher', 'fischer', 'fiser'],
  ['nepel', 'nipel', 'nipple'],
];
// Singkatan beberapa kata: daftar memakai keduanya (AFUR BCP STENLIS dan
// BAK CUCI PIRING SAVIC), sales juga (Bcp subron). Satu baris yang punya
// salah satunya mendapat yang lain, jadi ketik "bcp" atau "bak cuci piring"
// menemukan semuanya.
const FRASA = [['bcp', ['bak', 'cuci', 'piring']]];

const KANON = new Map();
for (const [baku, ...lain] of SINONIM) for (const k of [baku, ...lain]) KANON.set(k, baku);

/** Bentuk baku sebuah kata (graji -> gergaji); kata lain dikembalikan apa adanya. */
export const kanon = (k) => KANON.get(k) || k;

const adaAngka = (k) => /[0-9]/.test(k);

/** Jarak edit <= 1 (ganti / sisip / hapus satu huruf). */
function bedaSatu(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

const tanpaHidup = (k) => !/[aeiou]/.test(k);

/** `pendek` = huruf-huruf `panjang` yang dilompati (kng < kuningan), huruf awal sama. */
function lompatan(pendek, panjang) {
  if (pendek[0] !== panjang[0] || pendek.length >= panjang.length) return false;
  let j = 0;
  for (const h of panjang) if (h === pendek[j]) j += 1;
  return j === pendek.length;
}

// Satuan bukan singkatan/potongan nama: tanpa ini "kuning" dianggap cocok
// dengan KG, dan "paku" dengan PAK (1 PAK @200PCS).
const SATUAN = new Set(['kg', 'mm', 'cm', 'gr', 'mtr', 'ml', 'lt', 'pcs', 'psg', 'btg', 'lbr', 'pak', 'dos']);

// Tawaran mirip dari satu kata saja hanya kalau kata itu khas (ada di
// sedikit barang): "bendrat" ya, "pvc" / "kawat" tidak.
const BATAS_KHAS = 5;

/**
 * Singkatan huruf mati, dua arah. Ketikan singkat minimal 3 huruf. Di daftar
 * 2 huruf hanya kalau hurufnya kembar dan sama dengan huruf akhir (GG =
 * gagang, SS = stainless) — TB, KL, SN di daftar adalah kode/merek, bukan
 * singkatan "tembok", "kecil", "semprotan".
 */
function singkatan(q, k) {
  const duaKembar = k.length === 2 && k[0] === k[1] && k[1] === q[q.length - 1];
  if (tanpaHidup(k) && !SATUAN.has(k) && (k.length >= 3 || duaKembar) && lompatan(k, q)) return true;
  if (tanpaHidup(q) && q.length >= 3 && lompatan(q, k)) return true;
  return false;
}

/**
 * Nilai satu kata ketikan terhadap kata-kata sebuah nama:
 * 1 = awal kata, 0.9 = singkatan, 0.6 = beda satu huruf, 0 = tidak ada.
 * Kata berangka harus SAMA PERSIS ("2" bukan "20", "1" bukan "1/2"), kecuali
 * kata terakhir yang mungkin masih diketik ("seng 1" boleh menemukan 10).
 */
function nilaiKata(q, kataNama, terakhir) {
  let terbaik = 0;
  const angka = adaAngka(q);
  for (const k of kataNama) {
    if (angka) {
      if (k === q || (terakhir && k.startsWith(q))) return 1;
      continue;
    }
    if (k.startsWith(q)) return 1;
    if (adaAngka(k)) continue;
    if (singkatan(q, k)) { terbaik = 0.9; continue; }
    if (q.length < 3 || k.length < 3 || SATUAN.has(k)) continue;
    if (q.startsWith(k)) terbaik = Math.max(terbaik, 0.9);
    else if (terbaik < 0.6 && bedaSatu(q, k)) terbaik = 0.6;
  }
  return terbaik;
}

/**
 * Siapkan sekali per pembukaan daftar: teks utuh & kata-kata tiap baris.
 * Bentuk baku ikut DITAMBAHKAN (bukan menggantikan): GRAJI BESI punya kata
 * "graji" dan "gergaji", jadi ketik "gra" tetap menemukannya lewat awal kata.
 */
export function siapkan(data) {
  return data.map((d) => {
    const teks = String(d.nama) + ' ' + (d.kata || '');
    const kata = pecahKata(teks);
    const tambah = kata.map(kanon).filter((k, i) => k !== kata[i]);
    for (const [singkat, panjang] of FRASA) {
      if (kata.includes(singkat)) tambah.push(...panjang);
      else if (panjang.every((k) => kata.includes(k))) tambah.push(singkat);
    }
    return { d, utuh: teks.toLowerCase(), kata: tambah.length ? [...new Set([...kata, ...tambah])] : kata };
  });
}

/**
 * @param {Array} siap  hasil siapkan()
 * @param {string} q    yang diketik
 * @returns {{cocok:Array, mirip:Array}} data asli; mirip hanya diisi kalau cocok kosong
 */
// Tawaran mirip paling banyak 3: lebih dari itu, tombol "Tetap pakai nama
// baru" di bawahnya tertutup papan tombol HP.
export function cari(siap, q, { batas = 80, batasMirip = 3 } = {}) {
  const teks = String(q ?? '').trim().toLowerCase();
  if (!teks) return { cocok: siap.slice(0, batas).map((s) => s.d), mirip: [] };
  const kataQ = pecahKata(teks).map(kanon);
  // Spasi / tanda inci di akhir = angka terakhir sudah selesai diketik.
  const selesai = /[\s"'”]$/.test(String(q));
  const kenaPerKata = kataQ.map(() => 0);

  const cocok = [];
  const calon = [];
  siap.forEach((s, urut) => {
    // Cara lama (potongan teks persis) tetap berlaku dan paling diutamakan.
    if (s.utuh.includes(teks)) {
      cocok.push({ s, urut, skor: 3 + (s.utuh.startsWith(teks) ? 1 : 0) });
      return;
    }
    if (!kataQ.length) return;
    const nilai = kataQ.map((k, i) => nilaiKata(k, s.kata, i === kataQ.length - 1 && !selesai));
    // Kekhasan kata dihitung dari kecocokan SUNGGUHAN (>= 0.9) saja: "stang"
    // ada di 2 barang, meski salah-ketiknya mirip "tang" di 14 barang.
    nilai.forEach((v, i) => { if (v >= 0.9) kenaPerKata[i] += 1; });
    if (nilai.every((v) => v >= 0.9)) {
      cocok.push({ s, urut, skor: 1 + (s.kata[0]?.startsWith(kataQ[0]) ? 1 : 0) });
      return;
    }
    const kena = nilai.filter((v) => v >= 0.6).length;
    const jumlah = nilai.reduce((a, b) => a + b, 0);
    // Separuh kata atau lebih harus kena, dan setidaknya satu KATA (huruf,
    // 3+) yang kena — angka atau satu huruf saja ("8", "m") tidak cukup.
    const kataKena = kataQ.some((k, i) => !adaAngka(k) && k.length >= 3 && nilai[i] >= 0.6);
    if (kena * 2 >= kataQ.length && kataKena && jumlah >= 1) {
      calon.push({ s, urut, nilai, kena, skor: jumlah / kataQ.length });
    }
  });

  const urutkan = (a, b) => b.skor - a.skor || a.urut - b.urut;
  cocok.sort(urutkan);
  if (cocok.length) return { cocok: cocok.slice(0, batas).map((x) => x.s.d), mirip: [] };

  // Tepat separuh kata yang kena: hanya kalau salah satunya kata khas.
  const layak = calon.filter((c) => c.kena * 2 > kataQ.length || c.nilai.some((v, i) =>
    v >= 0.6 && !adaAngka(kataQ[i]) && kataQ[i].length >= 3 && kenaPerKata[i] <= BATAS_KHAS));
  // Nilai sama: nama yang lebih pendek (sedikit kata tambahan) lebih dekat.
  layak.sort((a, b) => b.skor - a.skor || a.s.kata.length - b.s.kata.length || a.urut - b.urut);
  return { cocok: [], mirip: layak.slice(0, batasMirip).map((x) => x.s.d) };
}
