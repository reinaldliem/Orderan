---
name: Order Sales
description: Aplikasi order sales distributor bahan bangunan — dunia cetakan karung semen.
colors:
  tinta: "#17130f"
  tinta-tekan: "#000000"
  tinta-2: "#645740"
  tinta-3: "#857657"
  kraft: "#ddd0b8"
  kraft-tua: "#cdbd9f"
  kraft-muda: "#e7dcc9"
  kraft-pudar: "#bcab8a"
  blok: "#f4efe4"
  blok-fokus: "#fffdf8"
  garis: "#b9a885"
  garis-kuat: "#8e7c58"
  sinyal: "#b4371f"
  sinyal-muda: "#f0ded5"
  tunggu: "#8a5a12"
  tunggu-muda: "#eadcc0"
typography:
  display:
    fontFamily: "Anton, Archivo, system-ui, Impact, sans-serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Anton, Archivo, system-ui, Impact, sans-serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0"
  title:
    fontFamily: "Anton, Archivo, system-ui, Impact, sans-serif"
    fontSize: "27px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  subtitle:
    fontFamily: "Anton, Archivo, system-ui, Impact, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.01em"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.13em"
rounded:
  none: "0"
  hairline: "2px"
spacing:
  tight: "8px"
  snug: "10px"
  base: "12px"
  block: "15px"
  frame: "16px"
components:
  button-primary:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.blok}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.none}"
    padding: "13px 20px"
    height: "52px"
  button-primary-active:
    backgroundColor: "{colors.tinta-tekan}"
    textColor: "{colors.blok}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    typography: "{typography.subtitle}"
    rounded: "{rounded.none}"
    padding: "13px 20px"
    height: "52px"
  button-danger:
    backgroundColor: "{colors.sinyal}"
    textColor: "{colors.blok}"
    rounded: "{rounded.none}"
  input-field:
    backgroundColor: "{colors.blok}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "12px 13px"
    height: "52px"
  block-card:
    backgroundColor: "{colors.kraft-muda}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.none}"
    padding: "15px"
  reversed-total:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.blok}"
    typography: "{typography.headline}"
    rounded: "{rounded.none}"
    padding: "14px 16px"
  nav-item-active:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.blok}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "66px"
---

# Design System: Order Sales

## Overview

**Creative North Star: "Sak Semen"**

Permukaan karung semen sudah menjadi sistem informasi jauh sebelum ada
aplikasi. Satu tinta pekat ditekan ke kertas kraft kasar. Nama produk
distensil setinggi mungkin supaya terbaca dari ujung gudang. Beratnya
duduk di dalam blok terbalik, bukan sekadar dicetak lebih besar. Kode
batch berbisik kecil di pojok. Tidak ada satu pun bayangan, tidak ada
satu pun sudut membulat, dan tidak ada yang melayang — karena tinta
tidak melayang, ia meresap.

Sistem ini meminjam disiplin itu secara utuh, bukan sebagai hiasan.
Aplikasinya dipakai sales sambil berdiri di dalam toko bangunan, satu
tangan memegang HP, pelanggan menunggu di depan, matahari siang
memantul di layar. Kraft dengan tinta nyaris hitam memberi kontras
paling keras yang bisa diberikan sepasang warna, dan huruf stensil
tebal terbaca lebih cepat daripada apa pun yang lebih sopan. Kecepatan
di sini bukan soal halaman dimuat berapa milidetik — melainkan berapa
lama pelanggan menunggu.

Yang ditolak sistem ini dinyatakan terang-terangan: kartu putih
melayang di atas abu muda, sudut membulat, bayangan lembut, satu aksen
teal. Susunan itu bukan buruk; ia hanya tidak bisa dibedakan dari
aplikasi order mana pun, dan itulah yang membuatnya ditinggalkan.

**Key Characteristics:**
- Kertas kraft sebagai ladang, tinta pekat sebagai satu-satunya suara
- Huruf stensil kondensasi untuk setiap angka yang penting
- Nol bayangan — kedalaman dinyatakan garis tinta, bukan ketinggian
- Keadaan ditandai bentuk cetak, bukan perbedaan warna
- Warna dikurung di tepi; ladang data tetap tanpa warna
- Satu gagasan gerak saja: tekanan tinta

## Colors

Palet ini satu bahan dan satu tinta: seluruh ladang adalah gradasi
kertas kraft, seluruh isinya adalah gradasi tinta cetak, dan merah
oksida hanya muncul ketika ada yang bisa rusak.

### Primary
- **Tinta Cetak** (`#17130f`): Satu-satunya suara. Teks utama, garis
  pemisah, latar tombol utama, latar blok terbalik, dan latar kepala
  halaman. Dipakai tanpa hemat — justru kepadatannya yang membuat
  kraft terbaca sebagai kertas.
- **Tinta Tekan** (`#000000`): Hanya muncul sepersekian detik saat
  tombol ditekan, sebagai pemekatan tinta.

### Secondary
- **Merah Oksida** (`#b4371f`): Bahaya saja — tombol hapus, pesan
  galat, tanda akun nonaktif. Tidak pernah dipakai untuk menarik
  perhatian pada sesuatu yang aman.
- **Merah Oksida Muda** (`#f0ded5`): Latar sangat tipis di belakang
  tindakan merusak yang sedang ditekan.

### Tertiary
- **Kuning Tanah** (`#8a5a12`): Satu-satunya nada peringatan — sesi
  berakhir, order perlu diperiksa, sambungan belum siap. Bukan galat,
  hanya sesuatu yang menunggu.
- **Kuning Tanah Muda** (`#eadcc0`): Ladang peringatan yang tenang.

### Neutral
- **Kraft** (`#ddd0b8`): Ladang utama seluruh aplikasi.
- **Kraft Muda** (`#e7dcc9`): Bidang yang naik — blok tercetak, lembar
  pilihan, bar bawah.
- **Kraft Tua** (`#cdbd9f`): Bidang yang masuk ke dalam — keadaan
  tertekan, pilihan yang sedang disentuh.
- **Blok** (`#f4efe4`): Blok terbalik. Ladang setiap angka besar dan
  setiap isian yang menunggu diketik.
- **Blok Fokus** (`#fffdf8`): Ladang isian yang sedang diketik —
  sedikit lebih putih dari blok, cukup menandai fokus tanpa cincin cahaya.
- **Kraft Pudar** (`#bcab8a`): Label kecil di atas tinta.
- **Tinta Tipis** (`#645740`) dan **Tinta Paling Tipis** (`#857657`):
  Teks sekunder dan label. Keduanya diturunkan dari rona kraft, bukan
  dicampur dari abu-abu.
- **Garis** (`#b9a885`) dan **Garis Kuat** (`#8e7c58`): Tik registrasi
  dan tepi isian.

### Named Rules

**The Confined Colour Rule.** Merah oksida muncul di tepat lima tempat
dan semuanya bahaya: tombol hapus, latar galat, pembatalan, tanda
nonaktif, dan batas pesan salah. Ladang datanya sendiri — angka, nama
toko, nama barang — selamanya tanpa warna. Uji: kalau sebuah warna
dipakai untuk menyenangkan mata dan bukan untuk memperingatkan, ia
salah tempat.

**The Tinted Grey Rule.** Tidak ada abu-abu di sistem ini. Setiap teks
sekunder diturunkan dari rona kraft (`#645740`, `#857657`), sehingga
terbaca sebagai tinta yang menipis di atas kertas, bukan sebagai
lapisan kelabu yang ditempel. Ambang kontras terendah yang terukur di
build ini 4,63:1.

## Typography

**Display Font:** Anton (fallback Archivo, system-ui, Impact)
**Body Font:** Archivo (fallback system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** tidak ada muka ketiga — lihat The No-Mono Rule.

**Character:** Anton adalah satu-satunya berat yang dimilikinya:
kondensasi, huruf besar, tanpa kompromi — stensil yang ditekan ke
karung. Archivo berdiri di belakangnya sebagai muka pekerja dengan
angka tabular yang rapi berkolom. Pasangan ini tidak pernah bertukar
peran: Anton tidak pernah dipakai untuk prosa, Archivo tidak pernah
dipakai untuk angka yang harus terbaca dari seberang meja.

### Hierarchy
- **Display** (Anton 400, 44px, 0.98): Identitas aplikasi di layar
  masuk. Muncul tepat sekali.
- **Headline** (Anton 400, 34–40px, 1): Angka yang menjadi keputusan —
  total order di blok terbalik, nomor order pada layar tersimpan.
- **Title** (Anton 400, 26–27px, 1): Judul halaman di kepala, dan
  nilai pada sel ringkasan.
- **Subtitle** (Anton 400, 19–23px, 1.1): Nama toko, judul blok, teks
  tombol utama, subtotal baris barang, judul kotak tanya.
- **Body** (Archivo 600, 16px, 1.5): Isian dan teks berjalan. 16px
  bukan pilihan rasa — di bawah itu iOS memperbesar layar sendiri saat
  isian disentuh.
- **Label** (Archivo 700, 10,5–11,5px, 0.1–0.14em, HURUF BESAR):
  Setiap nama kolom, nama bagian, dan kode batch.

### Named Rules

**The Stencil-For-Numbers Rule.** Anton dipakai untuk angka dan nama
yang menjadi keputusan, tidak pernah untuk kalimat. Kalau sebuah teks
perlu dibaca dua kali untuk dimengerti, ia bukan milik Anton.

**The No-Mono Rule.** Sistem ini tidak punya muka monospace. Kode toko,
nomor order, dan nama berkas memakai muka body yang direnggangkan
(`letter-spacing: .06em`, huruf besar) dengan `font-variant-numeric:
tabular-nums`. Menambah muka ketiga hanya demi kesan "teknis" adalah
kostum, bukan sistem.

## Layout

Satu kolom, dikunci **560px** dan dipusatkan; di bawah itu aplikasi
mengisi penuh lebar layar. Lebar ini dipilih dari pemakaian, bukan dari
titik putus: aplikasinya tetap satu kolom di layar lebar karena
admin pun memeriksa order dengan cara yang sama seperti sales
membuatnya.

Irama jaraknya lima langkah: **8px** untuk jarak ikon ke teks, **10px**
untuk kelompok rapat (tombol berdampingan, antar baris barang), **12px**
untuk pemisah antar bagian, **15px** untuk padding di dalam blok
tercetak, dan **16px** untuk bingkai kepala halaman. Isi halaman diberi
margin kiri-kanan 14px, menyusut jadi 11px di bawah 375px.

Jarak di atas judul selalu lebih besar daripada di bawahnya, sehingga
judul menempel pada isinya, bukan mengambang di antara dua bagian.

Satu titik putus saja: **374px**. Di bawahnya, huruf stensil menyusut
(44→38px pada layar masuk, 34→28px pada blok total), sel ringkasan
dibiarkan membungkus, dan renggang PIN dikurangi. Tidak ada titik putus
ke atas — tata letaknya memang tidak berubah.

### Named Rules

**The One-Hand Rule.** Setiap alur utama harus bisa diselesaikan satu
tangan sambil berdiri. Apa pun yang menuntut dua tangan, layar lebar,
atau tempat menaruh HP adalah kegagalan rancangan, bukan keterbatasan
pemakai.

## Elevation & Depth

**Sistem ini tidak punya bayangan sama sekali.** Nol `box-shadow` di
seluruh lembar gaya — ini terukur, bukan kiasan. Cetakan tidak
melayang di atas kertas; ia meresap ke dalamnya.

Kedalaman dinyatakan tiga cara saja:
1. **Garis tinta.** Border 2px tinta memisahkan blok tercetak dari
   ladang. Border 3px menandai batas struktural yang lebih besar —
   tepi atas bar bawah, tepi bawah pesan melayang, tepi lembar pilihan.
2. **Nada kertas.** Tiga tingkat kraft menyatakan arah: `kraft-muda`
   naik, `kraft` datar, `kraft-tua` masuk ke dalam.
3. **Pembalikan.** Yang paling penting tidak dinaikkan — ia dibalik.
   Tinta jadi ladang, kertas jadi tulisan.

### Named Rules

**The Ink-On-Paper Rule.** Tidak ada bayangan, tidak ada gradien, tidak
ada kaca buram, dan tidak ada elemen yang mengambang. Kalau sesuatu
perlu dibedakan dari sekitarnya, ia diberi garis tinta atau dibalik —
tidak pernah diangkat.

**The Reversed Block Rule.** Angka yang menjadi keputusan duduk di
dalam blok terbalik, bukan sekadar dibesarkan. Itulah cara karung
menandai beratnya, dan itulah cara aplikasi ini menandai total.

## Shapes

Radiusnya **nol**. Bukan kecil — nol. Dua nilai yang tercatat
(`none: 0`, `hairline: 2px`) ada karena variabel warisan masih dirujuk
beberapa kelas lama; keduanya terbaca sebagai sudut tajam di layar.
Satu-satunya lingkaran penuh di seluruh sistem adalah cincin pemuat
yang memang harus berputar.

Bahasa bentuknya persegi dari ujung ke ujung: blok tercetak, isian,
tombol, tab, tanda keadaan, bahkan tombol tutup berbentuk kotak 44px.
Tepi adalah garis tinta 2px; batas struktural 3px.

Satu bentuk sengaja miring: cap "TERSIMPAN" diputar **−1,5°**. Cap
yang ditekan tangan tidak pernah lurus sempurna, dan kemiringan itulah
yang membuatnya terbaca sebagai cap, bukan sebagai lencana.

## Components

### Buttons
- **Shape:** Persegi penuh, tanpa radius (`0`). Tinggi 52px; varian
  kecil 44px.
- **Primary:** Ladang tinta (`#17130f`), teks blok (`#f4efe4`), huruf
  stensil 19px huruf besar, padding 13px 20px.
- **Hover / Active:** Tinta memekat ke hitam murni dan seluruh tombol
  mengecil ke `scale(.97)` selama 120ms. Tidak ada pantulan.
- **Ghost:** Latar transparan, tepi tinta 2px, teks tinta. Saat
  ditekan, ladangnya menjadi `kraft-tua`.
- **Danger:** Ladang merah oksida (`#b4371f`). Hanya untuk tindakan
  yang menghapus.
- **Kecil:** Memakai muka body 700 huruf besar, bukan stensil — supaya
  tombol sekunder tidak pernah berteriak sekeras tombol utama.

### Chips
- **Style:** `tanda` adalah kotak bergaris 2px tanpa latar, huruf
  10,5px huruf besar direnggangkan 0.1em.
- **State:** Dibedakan **bentuk**, bukan warna — garis penuh untuk
  keadaan netral, garis putus-putus untuk yang menunggu, teks dicoret
  untuk yang mati, dan pembalikan penuh (ladang tinta) untuk admin.

### Cards / Containers
- **Corner Style:** Nol.
- **Background:** `kraft-muda` (`#e7dcc9`) di atas ladang `kraft`.
- **Shadow Strategy:** Tidak ada — lihat The Ink-On-Paper Rule.
- **Border:** Tinta 2px, penuh mengelilingi.
- **Internal Padding:** 15px; varian rapat 13px.

### Inputs / Fields
- **Style:** Ladang blok (`#f4efe4`), tepi `garis-kuat` 2px, radius
  nol, tinggi minimum 52px, teks 16px berat 600.
- **Focus:** Tepinya menjadi tinta penuh dan ladangnya memutih sedikit
  (`#fffdf8`). Tidak ada cincin cahaya.
- **Placeholder:** `tinta-3`, berat 500.

### Navigation
- **Bar bawah:** Palang tercetak menempel di dasar layar, tepi atas
  tinta 3px, tanpa bayangan dan tanpa radius. Tiap tautan dipisah garis
  2px. Tautan aktif **dibalik** — ladang tinta, teks blok — bukan
  diberi warna aksen.
- **Tab admin:** Blok persegi di atas garis tinta 3px; tab aktif
  dibalik. Menggulir mendatar tanpa batang gulir terlihat.
- **Mobile:** Bar bawah disembunyikan saat papan tombol terbuka
  (`body.kb-open`).

### Blok Total (signature)
Komponen penanda sistem ini. Ladang tinta penuh lebar, label kecil
`kraft-pudar` di kiri, dan angka Anton 34px warna blok di kanan. Saat
nilainya berubah, angkanya **mencetak ulang**: dari `blur(2px)` opacity
.55 menjadi tajam dalam 160ms. Ia tidak pernah menggeser, tidak pernah
menghitung naik, tidak pernah memantul.

### Cap Tersimpan (signature)
Kotak bergaris tinta 3px berisi ikon centang dan kata TERSIMPAN,
diputar −1,5°, diikuti nomor order Anton 40px. Menggantikan tanda
centang hijau raksasa yang biasa dipakai untuk konfirmasi.

## Do's and Don'ts

### Do:
- **Do** letakkan setiap angka keputusan di dalam blok terbalik
  (ladang `#17130f`, teks `#f4efe4`), bukan sekadar membesarkan hurufnya.
- **Do** nyatakan keadaan dengan bentuk cetak — garis penuh,
  garis putus-putus, coretan, pembalikan — supaya tetap terbaca di
  bawah matahari dan tetap terbaca kalau dicetak hitam-putih.
- **Do** turunkan setiap teks sekunder dari rona kraft (`#645740`,
  `#857657`) dan ukur kontrasnya; ambang terendah yang diterima 4,5:1.
- **Do** beri warna pada permukaan bawaan peramban: pilihan teks,
  caret, batang gulir, cincin fokus, tombol kalender, dan `<code>`.
  Semuanya sudah ditetapkan dari palet yang sama di `:root`.
- **Do** pakai satu gagasan gerak saja — `scale(.97)` dengan pemekatan
  tinta, 120ms, `cubic-bezier(.23, 1, .32, 1)`.
- **Do** gambar ikon baru pada kisi 24 dengan goresan 2, ujung **siku**
  dan sudut **lancip**, lalu daftarkan di `js/ikon.js`.

### Don't:
- **Don't** menambahkan `box-shadow` apa pun. Sistem ini nol bayangan,
  dan itu terukur.
- **Don't** membulatkan sudut. Radiusnya nol, termasuk pada tombol,
  isian, tanda, dan lembar.
- **Don't** memakai merah oksida untuk apa pun selain bahaya, atau
  memasukkan warna ke dalam ladang data.
- **Don't** memakai abu-abu netral. Setiap nada redup diturunkan dari
  kraft.
- **Don't** memakai emoji sebagai ikon. Emoji dirender berbeda di tiap
  HP, ukurannya tidak bisa dikendalikan, dan warnanya tidak ikut tema.
- **Don't** menambah muka huruf ketiga, terutama monospace, hanya untuk
  memberi kesan teknis.
- **Don't** memberi pantulan (`bounce`, `overshoot`) pada gerak apa pun,
  dan jangan menganimasikan tindakan yang dipicu papan tombol.
- **Don't** memakai Anton untuk kalimat, atau Archivo untuk angka yang
  harus terbaca dari seberang meja.
