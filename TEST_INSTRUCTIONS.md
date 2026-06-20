# Test Instructions for Mini Window

## Hotkey Default
Gunakan `Ctrl+Shift+F9` (bukan Ctrl+Z karena konflik dengan Undo)

## Cara Test
1. Jalankan `npm run dev`
2. Buka Settings > Hotkey
3. Cek hotkey yang terdaftar
4. Tekan hotkey tersebut
5. Mini window harus muncul di bagian atas layar

## Jika Mini Window Tidak Muncul
1. Cek log di `%APPDATA%/voiceflow/logs/app.log`
2. Cari pesan error
3. Pastikan tidak ada aplikasi lain yang pakai hotkey yang sama

## Yang Sudah Diperbaiki
- Mini window sekarang auto-start recording
- Timing issue diperbaiki
- Logging ditambahkan untuk debugging
