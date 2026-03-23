# Self-Hosted Runner Migration — Bypass Cloudflare IP Block

## Bối Cảnh

GitHub Actions sử dụng **Data Center IP (Azure)** bị Cloudflare block hàng loạt. Pipeline không thể quay video các website AI mới/lạ → giới hạn nội dung kênh YouTube Shorts.

**Giải pháp**: Chuyển sang Self-Hosted Runner trên PC DELL (Windows) của user → dùng ISP/Residential IP → bypass Cloudflare tự do.

---

## Giờ Chạy Tối Ưu — Peak View Shorts Cho Khán Giả Mỹ

Cần tìm giờ thỏa mãn **2 điều kiện**:
1. Laptop bạn **đang bật** (giờ làm việc VN: 8 AM - 6 PM)
2. Video upload vào **peak hours US** để có impression ban đầu tốt nhất

### Bảng Phân Tích Giờ Vàng

| Giờ VN (UTC+7) | Giờ EST (US) | US Activity | Laptop bạn |
|---|---|---|---|
| 8:00 AM | 9:00 PM (tối hôm trước) | 🔥 Peak evening scroll | ✅ Vừa mở máy |
| **9:00 AM** | **10:00 PM** | **🔥🔥 Peak late-night scroll** | **✅ Đang làm việc** |
| 10:00 AM | 11:00 PM | 🔥 Trước khi ngủ | ✅ Đang làm việc |
| 11:00 AM | 12:00 AM (midnight) | ⬇️ Giảm dần | ✅ Đang làm việc |
| 2:00 PM | 5:00 AM | ❌ Ngủ | ✅ Đang làm việc |
| 5:00 PM | 8:00 AM | ⬇️ Sáng sớm | ✅ Sắp tan |

> [!IMPORTANT]
> **Giờ tối ưu nhất: 9:00 AM Vietnam = 10:00 PM EST = 7:00 PM PST**
>
> - East Coast (EST): 10 PM — đỉnh điểm lướt TikTok/Shorts trước khi ngủ
> - West Coast (PST): 7 PM — khung giờ vàng buổi tối
> - Laptop bạn chắc chắn đang bật ở công ty
> - Pipeline mất ~15-20 phút → Video upload lúc 9:20 AM VN = 10:20 PM EST

**Cron UTC**: `0 2 * * *` (9 AM Vietnam = 2 AM UTC)

---

## Proposed Changes

### Workflow & CI/CD

#### [MODIFY] [daily-pipeline.yml](file:///c:/Users/DELL/OneDrive/Desktop/Vibing/VibeYtb/.github/workflows/daily-pipeline.yml)

Thay đổi lớn — chuyển từ `ubuntu-latest` sang `self-hosted` Windows:

1. `runs-on: ubuntu-latest` → `runs-on: self-hosted`
2. Cron: `0 20 * * *` → `0 2 * * *` (9 AM VN)
3. Xóa các step Linux-only: `Install Xvfb`, `Install FFmpeg`, `sudo apt-get`
4. Xóa `xvfb-run` wrapper (Windows có display sẵn)
5. Step `Create .env` đổi từ bash `echo >>` sang PowerShell syntax
6. Xóa step `Install Playwright browsers` (đã cài sẵn bên local)
7. Giữ `workflow_dispatch` để trigger thủ công

---

### Playwright Config

#### [MODIFY] [playwright.ts](file:///c:/Users/DELL/OneDrive/Desktop/Vibing/VibeYtb/vibeytb/src/utils/playwright.ts)

1. Bỏ logic `isCI` check `GITHUB_ACTIONS` (không còn cần headed mode hack)
2. Trở về mặc định `headless: true` (self-hosted runner có resident IP, không cần trick display)

> [!NOTE]
> Trên Windows self-hosted, Playwright `headless: true` vẫn bypass Cloudflare vì IP là Residential/ISP, không phải Data Center.

---

### Generator Prompt

#### [MODIFY] [generator.ts](file:///c:/Users/DELL/OneDrive/Desktop/Vibing/VibeYtb/vibeytb/src/agents/agent-2-strategist/generator.ts)

1. Gỡ bỏ whitelist URL constraint (không còn cần giới hạn domain)
2. Trở lại prompt tự do: "Use any public URL that does NOT require login. Avoid sites with heavy anti-bot: chatgpt.com, claude.ai, bard.google.com"

---

## Verification Plan

### Setup Runner
1. User cài GitHub Actions Runner trên PC DELL theo hướng dẫn
2. Chạy `./run.cmd` để runner online
3. Kiểm tra runner hiện trên GitHub repo Settings → Actions → Runners

### Test Pipeline
1. Trigger thủ công bằng `workflow_dispatch`
2. Xác nhận pipeline pickup bởi self-hosted runner
3. Kiểm tra Playwright truy cập được website AI bất kỳ (không bị Cloudflare)
4. Xác nhận video upload thành công lên YouTube

### Cron Test
1. Kiểm tra cron `0 2 * * *` trigger đúng 9 AM VN
2. Nếu laptop offline lúc trigger → kiểm tra job queue khi laptop bật lại
