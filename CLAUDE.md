# Halo 互動 IP 平台

在 AMD Strix Halo 迷你主機（32GB、Windows 11）上做的**店內可互動 IP 角色平台**。
全本地（Ollama + Qwen2.5 + RAG），多租戶可抽換，分階段開發。

## 設計文件
- 規格：`docs/superpowers/specs/2026-06-23-halo-interactive-ip-platform-design.md`
- 給人看的 HTML：同目錄 `...design.html`

## 核心原則
- **全本地**：離線可用、無月費、資料不外流。
- **多租戶**：每客戶一個 `tenants/<name>/` 資料夾；設定外置（`config/global.yaml` + `tenant.yaml`）。換模型／加客戶／改人設只動設定檔與資料夾，**不碰程式碼**。
- **部署模式**：`mode: hub`（首頁切換）/ `single`（鎖定一客戶）。
- **雙語**：繁體中文 + 英文。
- **IP 形象一致**：用客戶**自己擁有或授權**的官方素材，不 AI 即時生成角色臉。
- **強制 grounding**：知識庫沒寫的就說不知道，不亂編。

## 分階段
P1 多租戶文字 kiosk + RAG（自己寫）→ P2 語音（借 Open-LLM-VTuber）→ P3 Live2D／會說話頭像 → P4 手機 QR。

## 進行中的 tenant
- `PORJECT/project1_cute_dragon/` — 第一個專案。主角是**自家原創**的可愛綠色小恐龍（IG `@thevibinbun`），定位**兒童互動**。
  - `screen-showcase.html` — Phase 1 狀態 A「全螢幕形象」初步畫面（可點擊切表情、雙語）。
  - `character/` — 形象素材（目前為截圖裁切的 placeholder，待換去背高解析原檔）。

## 慣例
- 與使用者溝通一律用**繁體中文**。
- git 操作（commit/push）需使用者點頭才執行。
