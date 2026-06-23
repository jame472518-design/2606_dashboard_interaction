# 新增客戶（tenant）步驟

平台本體不用動，每個客戶就是 `tenants/` 底下一個資料夾。

## 步驟
1. 複製本資料夾：`tenants/_template/` → `tenants/<客戶代號>/`
   （客戶代號用英數與 - _，例：`museum_ocean`。`_` 開頭的資料夾會被當範本、不顯示在首頁。）
2. 改 `tenant.yaml`：填 `display_name`、語言、（可選）語音 `voice`、（可選）覆寫 `llm.model`。
3. 改 `persona/guide.md`：寫這個角色的人設與說話風格。
4. 改 `character/character.yaml`：填品牌色、`ip_rules`（角色底線）。
5. 寫知識庫 `knowledge/`：一條知識一個 `.md`（看本資料夾的 info-hours.md 範例）。
   中英文分檔：`xxx.md`（lang: zh-TW）、`xxx.en.md`（lang: en）。
6. 建索引：`node src/indexer.js <客戶代號>`（改了知識或換 embedding 模型都要重建）。
7. 形象（可選，做會動的角色）：把 6 張去背對齊 PNG 放 `character/rig/`
   （body / eyes_open / eyes_closed / mouth_closed / mouth_mid / mouth_open）。
   沒放的話，對話頁會畫一個「程式占位角色」（目前占位造型是為小恐龍做的暴龍，
   非恐龍主題的客戶建議提供自己的 rig 素材）。
8. `npm start` → 首頁就會出現這個客戶；single 模式則在 config/global.yaml 設 active_tenant。

## 不用動程式碼
換模型、加客戶、改人設、調語音、更新知識，全部只動 `config/` 與 `tenants/` 裡的設定檔與資料夾。
