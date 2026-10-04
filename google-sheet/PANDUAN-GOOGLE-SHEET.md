# Pantau order lewat Google Sheet

Order yang masuk dari sales muncul sendiri di Google Sheet, disegarkan
**tiap 10 menit**. Tidak perlu buka aplikasi, tidak perlu unduh-lalu-impor.

Satu sheet **Order**: satu baris per barang — tanggal, no order, sales, kode sales,
toko, kota, kode toko, barang, satuan, jumlah, harga satuan, harga per kg, total kg,
subtotal, total order, catatan, dan **catatan tambahan** dari sales.

---

## Langkah 1 — akun khusus untuk Sheet ✅ SUDAH SELESAI

**Tidak perlu Anda kerjakan.** Sudah saya jalankan langsung di database Anda.

Akun `sheet`, peran **pemantau**.

> PIN-nya **sengaja tidak ditulis di sini** — repo ini publik. PIN ada di
> `sql/08-pemantau.sql` di komputer Anda (folder `sql/` tidak ikut ke repo).

> **Kenapa bukan pakai akun admin?**
> PIN yang disimpan di skrip akan menetap bertahun-tahun. Kalau itu PIN admin,
> siapa pun yang bisa membuka skripnya bisa **mengubah dan menghapus order**.
> Peran `pemantau` **hanya bisa membaca** — tidak bisa mengubah, menghapus,
> atau menambah apa pun, dan **tidak bisa melihat HPP**.
> Kalau PIN-nya bocor, yang bisa dilakukan hanya melihat.

Mau ganti PIN-nya? **Admin → Akun → Ganti PIN** pada akun `sheet`, lalu
perbarui property `PIN` di Langkah 3.

## Langkah 2 — buat skripnya DARI DALAM Sheet

> ⚠️ **Ini bagian yang paling sering salah.** Skripnya **harus** dibuat dari
> dalam Google Sheet-nya. Kalau dibuat lewat <https://script.google.com>
> (proyek terpisah), skripnya **tidak tahu Sheet mana yang harus diisi**,
> menu **Order Sales** tidak akan muncul, dan Sheet tetap kosong.
> Kalau sudah begitu, lihat **"Menu Order Sales tidak muncul"** di bawah.

1. Buka <https://sheets.new> → beri nama, mis. **Order Sales**
2. Dari Sheet itu: menu **Extensions → Apps Script**
3. Hapus isi `Code.gs` yang ada, **tempel seluruh isi `google-sheet/Kode.gs`**
4. Klik ikon **simpan** (💾)

Anda **tidak perlu** menekan **Deploy**. Skrip ini bekerja dengan pemicu waktu,
bukan web app — jadi URL `.../exec` tidak diperlukan.

## Langkah 3 — isi 3 pengaturan rahasia

Masih di Apps Script: ikon **gerigi** (Project Settings) → gulir ke
**Script properties** → **Add script property**, isi tiga baris ini:

| Property | Value |
|---|---|
| `URL` | `https://aaurlqaqpldoohfnvcyx.supabase.co` |
| `KUNCI` | kunci **anon public** Supabase Anda (yang panjang, mulai `eyJ…`) |
| `PIN` | PIN akun `sheet` (lihat `sql/08-pemantau.sql` di komputer Anda) |

Klik **Save script properties**.

> PIN sengaja **tidak** ditulis di dalam kode. Jadi kalau berkas skripnya
> tersalin atau dibagikan, PIN-nya tidak ikut terbawa.

## Langkah 4 — jalankan sekali & pasang otomatis

1. Kembali ke Google Sheet-nya, **tutup dan buka lagi** (supaya menunya muncul)
2. Menu baru **Order Sales** akan ada di atas
3. Klik **Order Sales → Segarkan sekarang**
   - Google akan minta izin sekali: **Review permissions → pilih akun Anda →
     Advanced → Go to (nama proyek) → Allow**. Ini normal, izinnya untuk
     skrip Anda sendiri.
   - Sheet **Order** akan terisi
4. Klik **Order Sales → Pasang penyegaran otomatis** → jadi tiap 10 menit

Selesai. Di kanan atas sheet **Order** ada tulisan "Diperbarui: …" supaya Anda
tahu kapan terakhir disegarkan.

---

## Kalau ada masalah

**Cara tercepat: jalankan pemeriksa mandiri.**
**Order Sales → Periksa masalah (diagnosa)** — dia memberi tahu langkah mana
yang gagal. Kalau menunya tidak ada: di Apps Script, pilih fungsi `diagnosa`
di kotak sebelah tombol **Run** → **Run** → baca **Execution log** di bawah.

Hasilnya seperti ini:

```
OK    Script properties lengkap (URL, KUNCI, PIN)
OK    Sheet tujuan: "Order Sales" (Sheet aktif)
OK    Login akun "sheet" berhasil
OK    Baca v_pantau berhasil: 1 baris
CATAT Penyegaran otomatis belum dipasang — jalankan pasangPemicu()
```

| Pesan | Artinya |
|---|---|
| **Menu Order Sales tidak muncul** | Skripnya proyek terpisah, bukan dibuat dari dalam Sheet. Dua pilihan: (a) ulangi Langkah 2 dari dalam Sheet, atau (b) tambah satu property lagi: `SHEET_ID` = kode panjang di alamat Sheet Anda (`docs.google.com/spreadsheets/d/`**`KODE-INI`**`/edit`), lalu jalankan fungsi `segarkan` dari editor |
| `Skrip ini tidak menempel pada Google Sheet mana pun` | Sama seperti di atas — isi `SHEET_ID` |
| `SHEET_ID tidak bisa dibuka` | Salah salin kodenya, atau Sheet-nya milik akun Google lain |
| `Script properties belum lengkap` | Langkah 3 belum diisi atau salah nama property (harus huruf besar semua) |
| `PIN akun "sheet" salah, atau akunnya belum dibuat` | PIN di property tidak sama dengan PIN akun `sheet` |
| `Gagal membaca v_pantau (kode 404)` | View-nya hilang dari database — bilang saja, saya pasang lagi |
| Sheet berisi judul kolom + tulisan miring "Belum ada order yang masuk" | **Sambungannya berhasil.** Memang belum ada order di database — baris muncul sendiri begitu ada order masuk |
| Sheet benar-benar putih, baris judul pun tidak ada | Skripnya menulis ke **file Sheet lain**. Jalankan **Segarkan sekarang** dan baca baris **"Alamat file:"** pada kotak yang muncul — kalau alamat itu bukan Sheet yang Anda buka, perbaiki property `SHEET_ID` |

## Hal yang perlu diketahui

- **Sheet ditulis ulang setiap penyegaran**, bukan ditambah. Jadi kalau admin
  mengubah atau menghapus order di aplikasi, Sheet ikut terkoreksi — tidak ada
  baris kembar dan tidak ada data hantu.
- Karena ditulis ulang, **jangan mengedit langsung di sheet Order** —
  suntingan Anda akan tertimpa. Kalau mau menghitung sendiri, buat sheet baru
  dan rujuk ke sheet Order pakai formula.
- **HPP tidak ikut** ke Sheet. Itu disengaja: akun `pemantau` tidak diizinkan
  membacanya. Untuk melihat HPP, pakai halaman Admin di aplikasi.
- Kolom **Catatan Tambahan** berisi koreksi yang ditulis sales (mis. "jumlah
  seharusnya 25 sak"). Itu tandanya order perlu Anda perbaiki lewat
  **Admin → Order → Ubah order**.
- Batas: 20.000 baris barang per penyegaran. Kalau nanti terlampaui, bilang saja —
  gampang diubah jadi "ambil 3 bulan terakhir".
- Mau lebih sering dari 10 menit? Ubah `everyMinutes(10)` di bagian
  `pasangPemicu()`. Pilihan yang diizinkan Google: 1, 5, 10, 15, atau 30.
- Mau matikan? **Order Sales → Matikan penyegaran otomatis**.
- Kalau Anda sudah menekan **Deploy → Web app** sebelumnya, URL `.../exec`
  itu sekarang berfungsi sebagai "segarkan sekarang" lewat alamat web —
  membukanya akan menyegarkan Sheet dan menampilkan status. Tidak wajib dipakai,
  dan **jangan dibagikan** karena terikat akun Google Anda.
