# Pacific GFX — bản thiết kế (prototype)

Thiết kế các scene fullscreen theo phong cách VCT 2024 Pacific để duyệt trước khi đưa vào template của app.
Đây là HTML tĩnh độc lập, **không** dùng code của app và không ảnh hưởng `src/`.

## Scene

| File                       | Nội dung                                        |
| -------------------------- | ----------------------------------------------- |
| `map-update.html`          | Map mới + tỉ lệ thắng agent                     |
| `prize-pool.html`          | Tiền thưởng (tổng tiền chạy số random rồi chốt) |
| `ace-players.html`         | Ace players trong tuần                          |
| `patch-notes.html`         | Buff / Nerf / map mới                           |
| `groups.html`              | Alpha group vs Omega group                      |
| `championship-points.html` | Điểm championship                               |
| `playoffs.html`            | Bracket playoffs                                |
| `schedule.html`            | Lịch thi đấu                                    |
| `winner.html`              | Bumper đội thắng                                |
| `transition.html`          | Bumper chuyển cảnh (`?t=TOP 5                   | PLAYS`) |

Tất cả 1920×1080. Animation dùng GSAP (`anim.js`), một master timeline `window.__tl`.

## Chạy

Tài nguyên (ảnh agent/map, GSAP, nền nướng sẵn) không commit; tải về bằng:

```sh
node design/pacific-gfx/scripts/setup.mjs          # cần Chrome (PLAYWRIGHT_CHANNEL mặc định = chrome)
```

Mở trực tiếp file HTML trong Chrome, hoặc thêm làm Browser Source 1920×1080 trong OBS.

Tuỳ chọn, chỉ để test nội bộ: logo đội và ảnh tuyển thủ thật từ vlr.gg. Không có thì dùng ô giả.

```sh
node design/pacific-gfx/scripts/fetch-real.mjs
```

Xuất MP4 60fps + GIF để duyệt (cần `ffmpeg`), file ra `design/pacific-gfx/out/`:

```sh
node design/pacific-gfx/scripts/record.mjs [scene ...]
```
