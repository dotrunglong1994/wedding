# HƯỚNG DẪN TRIỂN KHAI DỰ ÁN TRÊN VPS BẰNG DOCKER COMPOSE

Tài liệu này hướng dẫn chi tiết từ A-Z cách đưa toàn bộ hệ thống Thiệp Cưới (bao gồm **Node.js Web Server**, **PocketBase Backend & Database**, và **SSL/Tên miền**) lên máy chủ VPS Ubuntu/Debian.

---

## 1. YÊU CẦU TRÊN VPS
Đăng nhập SSH vào VPS của bạn và cài đặt Docker + Docker Compose (nếu chưa có):

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Docker & Docker Compose Plugin
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

---

## 2. ĐƯA MÃ NGUỒN LÊN VPS

Cách 1: Nếu dùng Git:
```bash
git clone <URL_REPO_CUA_BAN> /var/www/wedding
cd /var/www/wedding
```

Cách 2: Nếu copy trực tiếp file từ máy tính lên VPS (dùng SCP hoặc FileZilla / WinSCP):
```bash
scp -r * user@IP_VPS:/var/www/wedding/
cd /var/www/wedding
```

---

## 3. CẤU HÌNH FILE MÔI TRƯỜNG (.env)

Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
nano .env
```
Nội dung file `.env`:
- Nếu chưa có tên miền (chạy bằng IP):
  ```env
  PUBLIC_PB_URL=http://<IP_VPS_CUA_BAN>:8090
  PORT=3000
  ```
- Nếu đã có tên miền (ví dụ: `yourdomain.com` và `pb.yourdomain.com`):
  ```env
  PUBLIC_PB_URL=https://pb.yourdomain.com
  PORT=3000
  ```

---

## 4. KHỞI CHẠY BẰNG DOCKER COMPOSE

Tại thư mục dự án `/var/www/wedding`, chạy:
```bash
# Build và khởi chạy ngầm tất cả container
docker compose up -d --build
```

Kiểm tra trạng thái các container:
```bash
docker compose ps
```
Nếu thấy cả 2 container `wedding_pocketbase` và `wedding_web` đều ở trạng thái `Up`, hệ thống đã chạy thành công!

- **Giao diện Web**: `http://IP_VPS:3000`
  - Đăng nhập: `http://IP_VPS:3000/login`
  - Quản trị: `http://IP_VPS:3000/dashboard`
  - Chỉnh sửa: `http://IP_VPS:3000/admin`
  - Xem thiệp: `http://IP_VPS:3000/thiep/<slug>`
- **PocketBase Admin**: `http://IP_VPS:8090/_/`
  *(Lần đầu truy cập tạo tài khoản Admin cho PocketBase)*

---

## 5. CẤU HÌNH TÊN MIỀN & SSL HTTPS (CHỌN 1 TRONG 2 CÁCH)

### CÁCH 1: Dùng Nginx có sẵn trên VPS (Phổ biến nhất)
1. Cài đặt Nginx & Certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

2. Tạo file cấu hình Nginx:
```bash
sudo nano /etc/nginx/sites-available/wedding.conf
```
Dán nội dung sau (thay `yourdomain.com` bằng domain thật của bạn):
```nginx
# 1. Trang Web Thiệp Cưới
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 2. Trang PocketBase Backend
server {
    listen 80;
    server_name pb.yourdomain.com;

    client_max_body_size 50M; # Cho phép upload ảnh dung lượng lớn

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Kích hoạt và cấp chứng chỉ SSL miễn phí tự động:
```bash
sudo ln -s /etc/nginx/sites-available/wedding.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Cấp chứng chỉ SSL tự động Let's Encrypt:
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d pb.yourdomain.com
```

---

## 6. MỘT SỐ LỆNH QUẢN TRỊ THƯỜNG DÙNG

- **Xem log hệ thống**:
  ```bash
  docker compose logs -f
  # hoặc xem riêng log web:
  docker compose logs -f web
  ```
- **Khởi động lại**:
  ```bash
  docker compose restart
  ```
- **Dừng hệ thống**:
  ```bash
  docker compose down
  ```
- **Cập nhật mã nguồn khi có code mới**:
  ```bash
  git pull
  docker compose up -d --build web
  ```
- **Sao lưu dữ liệu**:
  Dữ liệu database SQLite và ảnh của PocketBase nằm hoàn toàn trong thư mục `./pb_data` trên VPS. Bạn chỉ cần sao lưu thư mục này là an toàn 100%.
