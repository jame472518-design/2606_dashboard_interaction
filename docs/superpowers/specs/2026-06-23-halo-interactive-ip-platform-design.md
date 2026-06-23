# Halo 互動 IP 平台 — 設計文件

- 日期：2026-06-23
- 狀態：設計已確認，待寫實作計畫
- 硬體：AMD Strix Halo 迷你主機，32GB 統一記憶體，Windows 11
- 首個應用場域：展覽 / 體驗館 / 觀光

---

## 1. 目標與範圍

在店內擺一台 Halo，作為**可互動的 IP 角色**。資料存在本地，顧客可與 IP 對話。
平台需**多客戶可抽換**：不同客戶 = 不同資料夾，統一首頁切換；設定外置，方便換模型與加客戶。

### 核心需求
- 全本地：離線可用、無月費、資料不外流。
- 多租戶：一套程式碼服務多客戶，加客戶／改人設／換模型只動資料夾與設定檔，不碰程式碼。
- 分階段：先做文字 kiosk MVP，再疊加語音、虛擬形象、手機端。
- 雙語：繁體中文 + 英文。
- IP 形象一致：忠實承載客戶官方 IP 外型與品牌，不靠 AI 即時生成角色臉。

### 非目標（YAGNI）
- 不做雲端後台 / 帳號系統。
- 不落地顧客個資（只保留當前對話的短期記憶）。
- Phase 1 不做語音、不做 Live2D（後續階段才加）。

---

## 2. 整體架構

```
店內螢幕 (Kiosk 瀏覽器, 全螢幕)
        │
        ▼
本地 Web App ──► Orchestrator (對話協調層)
                     │
     ┌───────────────┼────────────────┐
     ▼               ▼                ▼
 本地 LLM        知識庫 (RAG)       人設 / 形象規則
 (Ollama)     向量檢索+結構化資料    (persona + ip_rules)
```

**設計原則**：平台程式碼、客戶資料、設定三者解耦。LLM / 知識庫 / 人設互不影響；語音與形象是後續「插件式」疊加，不動核心。

### 技術選型（Phase 1）

| 元件 | 選擇 | 理由 |
|------|------|------|
| LLM 執行 | Ollama (Windows) | 安裝簡單、API 穩定、Strix Halo 可用 Vulkan/ROCm 加速 |
| 對話模型 | Qwen2.5 14B Instruct（起步） | 32GB 跑得順、中英雙語強 |
| 知識庫 | 結構化 Markdown + 向量檢索 (RAG) | 回答有依據、不亂編 |
| Embedding | bge-m3 | 全本地、中英文皆強 |
| 向量庫 | 本地輕量向量庫 | 全本地 |
| 前端 | 本地網頁 App（瀏覽器全螢幕 kiosk） | 後續階段沿用 |
| 後端 | 單一本地服務（Python 或 Node，實作計畫定案） | 協調 LLM + RAG + 人設 |

---

## 3. 部署模式（單一 server + 模式切換）

同一套程式碼，用 `config/global.yaml` 的 `mode` 決定開機行為：

- **hub**：首頁列出所有 tenants，自由切換（開發 / 展示用）。
- **single**：鎖定單一 tenant，開機直接進入該 IP，不顯示其他客戶（實際擺到客戶店裡時用）。

```yaml
# config/global.yaml
mode: hub                 # hub 首頁可切換 / single 鎖定一個客戶
active_tenant: museum-A   # single 模式時生效
llm:
  provider: ollama
  model: qwen2.5:14b      # 換模型只改這裡
  base_url: http://localhost:11434
embedding:
  model: bge-m3
server: { port: 8080, default_lang: zh-TW }
```

> 不採用「每客戶獨立 process/port」方案：實際每台 Halo 在店裡只服務一個客戶，single 模式即可達成隔離。

---

## 4. 目錄結構

```
halo-ip-platform/
├── config/
│   └── global.yaml          # 全域：mode、預設 model、embedding、port、語言
├── tenants/                  # 每個客戶/產品一個資料夾
│   ├── _template/            # 新客戶範本（複製即用）
│   ├── museum-A/
│   │   ├── tenant.yaml       # 此客戶：display_name、語言、model 覆寫、ui
│   │   ├── character/        # IP 形象包（見 §6）
│   │   ├── persona/          # 人設 / system prompt 模板
│   │   ├── knowledge/        # 結構化知識資料 (md)
│   │   ├── index/            # 向量索引（build 產物，可重建）
│   │   └── assets/           # logo 等
│   └── expo-B/ ...
├── server/                   # 後端協調服務
└── web/
    ├── home/                 # 統一首頁（hub 模式列出 tenants）
    └── chat/                 # 對話頁
```

```yaml
# tenants/museum-A/tenant.yaml
display_name: "海洋博物館"
persona_file: persona/guide.md
languages: [zh-TW, en]
llm: { model: qwen2.5:32b }   # 覆寫全域；沒寫就吃 global 預設
ui:
  default_view: showcase      # showcase 全螢幕形象 / chat 直接開對話
  voice_first: true           # 預設語音優先（Phase 2）
  chat_panel:
    position: bottom          # bottom / right / left
    collapsible: true
  portrait:
    chat_scale: corner        # 展開對話時形象縮到 corner / side
```

**規則**：tenant 沒設定的吃 global 預設；換模型／加客戶只動設定檔與資料夾。

---

## 5. 人設與知識庫資料結構

原則：人設一個檔、知識一條一個檔，純文字 Markdown，非工程人員可編輯。

### 人設檔 `persona/guide.md`

```markdown
---
name_zh: 小海
name_en: Coral
voice: 親切、口語、略帶俏皮
languages: [zh-TW, en]
---
## 角色
你是「小海」，海洋博物館的 AI 導覽員……
## 說話風格
- 一次講重點，不長篇大論。
- 不確定或資料沒寫的，就說「這我不太確定」，引導去服務台——絕不亂編。
## 開場白
- zh-TW: 「嗨～我是小海！想先看哪一區呢？」
- en: "Hi! I'm Coral. Which zone would you like to explore first?"
```

### 知識庫 `knowledge/` — 一條知識一個檔

```markdown
---
id: exhibit-002
type: exhibit          # exhibit 展品 | faq 常見問題 | info 場館資訊 | story 故事背景
title: 深海發光生物區
lang: zh-TW
zone: 2F-A
tags: [深海, 生物發光, 水母]
---
這一區展示深海中會發光的生物……
```

- 英文版另存 `exhibit-002.en.md`（`lang: en`）→ 依提問語言檢索對應語言條目。
- `type: info`（時間/票價/廁所）做成首頁快捷鈕，最常問的不用打字。

### 索引 `index/`（自動產物）

`build` 指令：掃 `knowledge/` → 切塊 → 算 embedding (bge-m3) → 存本地向量庫。
資料增修後重跑一次，不碰程式碼。

---

## 6. IP 形象包（維持外型一致）

每個 tenant 一個 `character/`，平台**忠實承載**客戶官方 IP，不 AI 即時生成角色臉。

```
tenants/museum-A/character/
├── character.yaml       # 形象規格（單一真相來源）
├── reference/           # 官方設定圖、三視圖、表情表（角色聖經）
├── portrait/            # Phase 1 kiosk 顯示用立繪
├── expressions/         # idle / talking / happy / thinking
└── live2d/              # Phase 3：依官方外型製作的 Live2D 模型
```

```yaml
# character.yaml
name_zh: 小海
brand:
  primary_color: "#0A6E8C"
  accent_color:  "#FFD23F"
  font: "client-brand-font"
  logo: character/reference/logo.png
visual:
  portrait: character/portrait/idle.png
  expressions:
    idle:     character/expressions/idle.png
    talking:  character/expressions/talking.png
    happy:    character/expressions/happy.png
    thinking: character/expressions/thinking.png
ip_rules:                  # 注入系統 prompt 的形象紅線
  - 自稱固定用「小海」，不可改名
  - 不做違反角色設定的發言
```

### 維持外型一致的三原則
1. **不 AI 生臉**：用客戶官方立繪 + 表情圖，依對話狀態切換 → 外型 100% 忠於原作。
2. **品牌套全畫面**：`character.yaml` 配色/字體/logo 套進整個 kiosk UI。
3. **跨階段不走樣**：語氣 + 視覺 + 聲音同在形象包內對齊；Phase 3 的 Live2D 以官方設定圖為本去 rig；`ip_rules` 鎖名字與底線。

### 客戶圖片輸入分級
| 層級 | 客戶提供 | Phase 1 | Phase 3 |
|------|---------|---------|---------|
| Tier 1 最低 | 1 張高解析立繪（透明 PNG 佳） | 直接用 | 單張圖做會說話頭像（SadTalker 類）或生成表情經人工核可 |
| Tier 2 較好 | 立繪 + 一組表情圖 | 表情切換、零生成 | 表情更自然 |
| Tier 3 最佳 | PSD 分層原檔 | — | 正規 Live2D rig（眨眼/轉頭/嘴型同步） |

- 一張圖即可起步；Live2D 關鍵在「分層」，素材清單把 PSD 分層檔列為加分項。
- 圖片是設計素材，非餵給 LLM 的 runtime 輸入。
- 兩種客戶都支援：自帶 IP（丟官方素材）/ 沒有 IP（我們從頭設計，產出放進形象包）。

---

## 7. Phase 1 MVP — 畫面與資料流

### 可收縮雙狀態畫面

**狀態 A — 形象全螢幕（預設、沉浸）**：立繪佔滿、會切表情；輕提示「點我打字，或直接跟我說話」；兼做 attract 待機畫面；給 Phase 2 語音互動用。

**狀態 B — 展開對話**：點「打字」後對話面板滑出、形象縮到角落；點「收合」回到狀態 A。

兩狀態行為由 `tenant.yaml` 的 `ui` 區塊客製（預設視圖、面板位置、是否可收合、形象縮放、語音優先）。

### 對話資料流
```
顧客輸入(中/EN)
  → Orchestrator：
      1. 判定語言（或用切換鈕）
      2. query → embedding(bge-m3)
      3. 從該 tenant 的 index 檢索 top-k 知識條目（對應語言）
      4. 組 prompt：人設 + ip_rules + 檢索到的知識 + 近幾輪對話
  → Ollama (Qwen2.5) 回答
      - 有命中知識 → 依據回答，立繪切「講話」
      - 沒命中    → fallback：「這我不太確定，可以問服務台喔」
  → 串流顯示回答 → 回到待機表情
```

### 關鍵規則
1. **強制 grounding**：檢索不到相關知識走 fallback，不讓模型瞎掰。
2. **短期記憶、不存個資**：只留當前顧客近幾輪對話；閒置逾時（例如 60 秒）自動清空回待機。
3. **快捷鈕來自知識庫**：`type: info` 條目做成一鍵按鈕。
4. **回應速度**：本地 14B 約數秒；串流逐字顯示讓等待有感。

### Phase 1 驗收標準
- 一台 Halo，店內螢幕全螢幕開機自動進入。
- 選定 tenant（hub 切換 / single 鎖定）。
- 顧客能用中/英文字問展館問題，得到有依據的回答，立繪會切表情。
- 換客戶／改人設／更新知識／換模型，全靠改資料夾與設定檔。

---

## 8. 分階段路線圖

| 階段 | 內容 | 做法 |
|------|------|------|
| **Phase 1** | 多租戶文字 kiosk + RAG + 形象切換 + 設定外置 | 自己寫（市面無現成多租戶 RAG kiosk） |
| **Phase 2** | 語音：本地 ASR (Whisper 類) + TTS | 整合 Open-LLM-VTuber 元件（AMD 友善、MIT、吃 Ollama） |
| **Phase 3** | 會動會講話的虛擬形象 | Live2D（有 PSD 分層）或單張圖會說話頭像（SadTalker 類） |
| **Phase 4** | QR → 手機端，Halo 當店內 WiFi 本地伺服器、多人同時用 | 沿用後端 API |

### 借 vs 自己做（網路調研結論）
- **自己做**：多租戶切換 + 設定外置 + RAG 知識庫（市面無此組合，是核心差異）。
- **借 Open-LLM-VTuber**：語音 (ASR/TTS) + Live2D（Phase 2/3）；MIT、支援非 NVIDIA GPU/CPU，適配 Strix Halo。
- **參考**：VirtualMuseumGuide（RAG 博物館導覽）。
- **不用 Handcrafted Persona Engine**：雖為 kiosk/博物館用途，但只支援 Windows + NVIDIA CUDA，Strix Halo（AMD APU）用不了。

參考連結：
- https://github.com/Open-LLM-VTuber/Open-LLM-VTuber
- https://github.com/fagenorn/handcrafted-persona-engine
- https://github.com/MariusKras/VirtualMuseumGuide
