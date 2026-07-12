import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    // Only trigger for VoiceFlow project
    if (!ctx.cwd.endsWith("VoiceFlow")) return;

    ctx.ui.notify("🔊 VoiceFlow: Loading project skills...", "info");

    // Inject user message to force skill loading on first turn
    pi.sendMessage({
      customType: "voiceflow-autoload",
      content: `[VoiceFlow Auto-Load]
      
⚠️ WAJIB — Sebelum melanjutkan, LOAD dan BACA ketiga skill berikut:

1. \`/skill:voiceflow-changelog\`
   → Tracking perubahan, update session-handoff, commit format, extract technical debt

2. \`/skill:voiceflow-electron\`
   → Pattern IPC, window management, preload, build config

3. \`/skill:voiceflow-audio\`
   → Whisper integration, VAD, recording pipeline, performance tuning

📖 Baca juga:
- \`AGENTS.md\` (root) — arsitektur lengkap UI, komponen, data layer, audio pipeline
- \`.pi/AGENTS.md\` — quick reference & checklist
- \`session-handoff.md\` — status session sebelumnya

Setelah membaca, lanjutkan pekerjaan sesuai instruksi.`,
      display: true,
      details: {
        type: "system-instruction",
        priority: "high",
      },
    });
  });
}
