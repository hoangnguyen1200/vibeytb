# 🚀 Triển Khai Kênh YouTube Automation lên Production (VPS Ubuntu)

Hệ thống YouTube Automation Auto-Pilot của chúng ta bao gồm 2 cụm xử lý độc lập để tối ưu chi phí và kiểm soát rủi ro:
1. **Orchestrator-Cron:** Quét trend và dùng AI viết kịch bản (Phase 1 & Phase 2). Chạy ngầm mỗi 6 tiếng.
2. **Worker-Render:** Daemon dò tìm kịch bản đã được duyệt (Phase 3 & Phase 4). Cứ mỗi 1 phút thức dậy ngó Database một lần.

Dưới đây là từng bước copy-paste lên terminal VPS Ubuntu để Deploy hoàn chỉnh.

---

## Bước 1: Chuẩn Bị Môi Trường Cở Bản (Node.js & PM2)

Cập nhật Server và Cài đặt Node.js:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Cài đặt PM2 (Tiến trình quản lý chạy ngầm siêu cấp):
```bash
sudo npm install -g pm2
# Kích hoạt PM2 tự khởi động cùng OS
pm2 startup
```

---

## Bước 2: Setup System & Cài Đặt Phụ Thuộc (Playwright)

Clone source code của bạn về VPS (hoặc copy sang):
```bash
# Giả sử bạn để code ở ~/youtube-automation
cd ~/youtube-automation
npm install
```

**🔥 ĐẶC BIỆT LƯU Ý CHO PLAYWRIGHT:**
Playwright cần chạy trình duyệt ẩn để chèn Cookie đăng Video lên YouTube. Môi trường Ubuntu trần sẽ thiếu file thư viện đồ họa Linux. Chạy lệnh sau để Playwright tự động tải các gói `xvfb`, `libgbm`, v.v...:

```bash
# Cài đặt trình duyệt ẩn (Chromium)
npx playwright install chromium

# Cài đặt các gói phụ thuộc bắt buộc của hệ điều hành cho trình duyệt
npx playwright install-deps
```

---

## Bước 3: Cấu hình API Keys (.env)

Tạo file biến môi trường gốc và cắm Keys vào (Hệ thống đã có logic gọi API thực):
```bash
cp .env.example .env
nano .env
```

Hãy chắc chắn bạn đã điền:
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (Database)
- `GEMINI_API_KEY` (Cho Phase 2)
- `TTS_API_KEY` (Cho Phase 3 Audio)
- `VEO_API_KEY` (Cho Phase 3 Video)

---

## Bước 4: Khởi Động Vòng Lặp Bất Tử (PM2 Ecosystem)

Mọi cấu hình phức tạp đã được định nghĩa sẵn trong file `ecosystem.config.js`. Giờ bạn chỉ cần gõ 1 lệnh khởi động song song cả 2 module:

```bash
# Đứng trong thư mục gốc của project chứa file ecosystem.config.js
pm2 start ecosystem.config.js
```

Sau đó lưu toàn bộ tiến trình vào thẻ nhớ để reboot server không bị bay màu:
```bash
pm2 save
```

---

## CÁC LỆNH QUẢN LÝ THƯỜNG DÙNG

**Xem trạng thái bảng điều khiển PM2 (CPU / RAM):**
```bash
pm2 status
```

**Xem bảng Log (Bắt lỗi khi TTS/Veo/Playwright crash):**
```bash
# Xem log tập trung của cả hệ thống
pm2 logs 

# Xem log riêng rẽ
pm2 logs youtube-orchestrator-cron
pm2 logs youtube-worker-render
```

**Duyệt Kịch Bản Thủ Công (Human-in-the-loop Gate):**
Định kỳ hệ thống tạo kịch bản sẽ chờ ở trạng thái `pending_approval`. Mở Terminal trong VPS (hoặc remote ssh) và gõ lệnh:
```bash
npx tsx src/scripts/human-approval.ts
```
> Trả lời "Y" để Worker Render bắt đầu tiêu tiền API. Trả lời "N" để loại bỏ kịch bản dở tệ.
