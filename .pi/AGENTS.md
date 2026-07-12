# VoiceFlow Pi Context

## Wajib Dilakukan di Setiap Session

1. **Baca AGENTS.md** (root project) untuk guidelines lengkap UI, komponen, data layer
2. **Baca session-handoff.md** untuk lanjutkan dari session sebelumnya
3. **Load skill voiceflow-changelog** — baca SKILL.md-nya
4. **Load skill voiceflow-electron** — baca SKILL.md-nya
5. **Load skill voiceflow-audio** — baca SKILL.md-nya

Setelah membaca skill:
- Ikuti instruksi **voiceflow-changelog** untuk tracking perubahan
- Ikuti **voiceflow-electron** untuk pattern Electron
- Ikuti **voiceflow-audio** untuk optimasi audio

## Session Start Checklist
- [ ] Baca `session-handoff.md` (kalau ada)
- [ ] Baca `AGENTS.md` (root)
- [ ] Load skill `voiceflow-changelog`
- [ ] Load skill `voiceflow-electron`
- [ ] Load skill `voiceflow-audio`
- [ ] Catat perubahan di CHANGELOG
- [ ] Pahami arsitektur UI sebelum modifikasi
- [ ] Pahami data flow (settings, IPC, database)

## UI / Component Reference Cepat
| Komponen | File | Catatan |
|----------|------|---------|
| MiniBar | `src/App.tsx:58` | Floating bar horizontal |
| VerticalMiniBar | `src/components/VerticalMiniBar.tsx` | Floating bar vertikal |
| HomePage | `src/App.tsx:641` | Recording utama |
| Models | `src/pages/Models.tsx` | Download model AI |
| History | `src/pages/History.tsx` | Riwayat transkripsi |
| Settings | `src/pages/Settings.tsx` | 7 tab settings |
| Notification | `src/components/Notification.tsx` | Toast system |
| useRecorder | `src/hooks/useRecorder.ts` | Recording hook |
| Window.electronAPI | `src/types/electron.d.ts` | Semua IPC API |
