# 小恐龍 — 分層素材清單（眨眼 + 對嘴 + Live2D 用）

要做到「即時呼吸 + 眨眼 + 嘴型對嘴」，平面圖不夠，需要**把部位拆成獨立圖層**，並補上「閉眼 / 不同嘴型」的畫。
這是你自己的原創角色，原檔（PSD/AI/Procreate）應該能匯出這些圖層。

---

## 兩條路

### 路 A — 分層 PNG + Canvas 即時合成（較快，建議先做）
不用 Live2D 工具。你匯出下列**去背 PNG 圖層**，我在瀏覽器用 Canvas 即時疊合並驅動：
眨眼 = 切換 eyes_open / eyes_closed；對嘴 = 依 TTS 音量切換 mouth_closed / mid / open。
→ 可在 **Phase 2**（接上語音）就讓嘴動起來。

**需要的圖層（全部去背、同一畫布尺寸、像素對齊）：**
| 圖層 | 說明 |
|------|------|
| `body.png` | 身體＋頭（不含眼睛、嘴巴） |
| `eyes_open.png` | 睜眼 |
| `eyes_closed.png` | 閉眼（眨眼用） |
| `mouth_closed.png` | 閉嘴 |
| `mouth_mid.png` | 半開 |
| `mouth_open.png` | 張嘴 |
| `cheeks.png`（可選） | 腮紅，做臉紅表情 |
| `brows.png`（可選） | 眉毛，做表情 |

建議尺寸：短邊 ≥ 1500px、PNG-24 透明背景、各圖層**對齊同一張畫布**（直接從同一個 PSD 各圖層輸出即可，不要各自裁切位移）。

### 路 B — 正規 Live2D（最完整，Phase 3）
最自然：眨眼、轉頭、身體擺動、物理（耳朵/尾巴晃）、嘴型同步，全在瀏覽器 WebGL 即時渲染
（用 pixi-live2d-display / Cubism Web SDK）。

**需要：** 一個**分層 PSD**，圖層拆得更細（左右眼分開、上下眼皮、嘴巴張閉、眉毛、頭髮/尾巴分段做物理）。
通常由繪師在 Live2D Cubism 裡 rig 成 `.model3.json` + `.moc3` + 貼圖。你提供分層 PSD，我們再 rig（或委外繪師）。

---

## 給繪師/你的一句話需求
> 「請把小恐龍原檔，依上表各部位**分圖層匯出去背 PNG**（路 A），
> 或提供**分層 PSD**（路 B / Live2D）。各圖層請對齊同一畫布、不要位移。」

備註：目前 repo 內的 `portrait/idle.png`、`expressions/*.png` 是從 IG 截圖裁切的暫時 placeholder（有浮水印、低解析、含背景），上線前一併換成上述去背原檔。
