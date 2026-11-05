# Cadangan otomatis ke Google Drive

Tiap malam sekitar jam 23.00 WIB, seluruh data aplikasi Order (order, isi order,
catatan, barang, HPP, toko, pembagian toko-sales, akun tanpa PIN) disimpan sebagai
satu berkas di folder Google Drive **Cadangan Order Sales**. Berjalan di server
Google, jadi komputer tidak perlu menyala.

- Berkas harian disimpan **60 hari**. Setelah itu hanya cadangan **tanggal 1**
  tiap bulan yang disimpan (arsip bulanan, tidak pernah dibuang).
- Berkas lama dipindah ke **Sampah** Drive (masih bisa dikembalikan 30 hari).
- Anda mendapat **email** kalau cadangan gagal, atau kalau jumlah order tiba-tiba
  turun lebih dari separuh (tanda ada data terhapus).
- Ukuran sekarang ±800 KB per berkas — kuota Drive gratis (15 GB) cukup bertahun-tahun.

## Pasang (sekali saja, ±10 menit)

1. **Buat akun cadangan.** Aplikasi Order → Admin → Akun → Tambah akun baru:
   - Username: `cadangan`
   - Nama: `Cadangan otomatis`
   - Peran: **Pemantau**
   - PIN: 6 angka pilihan Anda (catat — dipakai di langkah 3)

   Akun ini hanya bisa **membaca**. Tidak bisa membuka aplikasi, tidak bisa
   mengubah atau menghapus apa pun.

2. **Buat proyek skrip.** Buka [script.google.com](https://script.google.com) →
   **New project** → beri nama `Cadangan Order Sales` → hapus seluruh isi
   `Code.gs` → tempel seluruh isi berkas `Cadangan.gs`. Tekan ikon simpan.

3. **Isi PIN.** Ikon roda gigi (**Project Settings**) → paling bawah
   **Script properties** → **Add script property**:
   - Property: `PIN`
   - Value: PIN akun `cadangan`

   Tekan **Save script properties**.

4. **Pasang jadwal.** Kembali ke editor (ikon `< >`). Di daftar fungsi di atas,
   pilih **pasangJadwal** → **Run**. Google akan meminta izin:
   **Review permissions** → pilih akun Google Anda → **Advanced** →
   **Go to Cadangan Order Sales (unsafe)** → **Allow**.
   (Peringatan "unsafe" muncul untuk semua skrip buatan sendiri.)

5. **Uji sekali.** Pilih fungsi **cadangkan** → **Run**. Di *Execution log*
   muncul "Cadangan tersimpan: …". Buka Google Drive → folder
   **Cadangan Order Sales** → berkas pertama sudah ada.

## Kalau ada masalah

Pilih fungsi **diagnosa** → **Run**, lalu baca *Execution log*. Setiap langkah
diberi tanda OK / GAGAL beserta penyebabnya.

| Pesan | Artinya |
|---|---|
| PIN akun "cadangan" salah, atau akunnya belum dibuat | Ulangi langkah 1 atau 3 |
| Fungsi ambil_cadangan belum ada di database | `sql/17-cadangan.sql` belum dijalankan di Supabase |
| Jadwal otomatis belum dipasang | Jalankan **pasangJadwal** |

## Memulihkan

Berkas cadangan memuat semua tabel beserta urutan memulihkannya
(`urutan_pulih`). Kalau suatu saat data harus dikembalikan, ambil berkas dari
tanggal yang diinginkan dan serahkan ke teknisi — **jangan** mencoba menempelnya
sendiri ke database. PIN tidak ikut dicadangkan; setelah pemulihan penuh, setiap
akun dibuat ulang dengan PIN baru.
