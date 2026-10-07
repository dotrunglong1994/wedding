import sys, os, sqlite3, json

# Dam bao in tieng Viet tren Windows console
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def parse_env_file():
    env_vars = {}
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

def configure_smtp(gmail, app_password, app_url="http://localhost:3000", sender_name="Hệ Thống Thiệp Cưới"):
    clean_pass = app_password.replace(" ", "").strip()
    clean_gmail = gmail.strip()
    clean_url = app_url.rstrip("/")

    if not clean_gmail or not clean_pass:
        print("❌ Lỗi: Gmail hoặc App Password rỗng!")
        return False

    db_paths = [
        os.path.join(os.path.dirname(__file__), 'pb_data', 'data.db'),
        'C:/project/pocketbase/pb_data/data.db'
    ]

    vietnamese_template = {
        "subject": "Khôi phục mật khẩu tài khoản {APP_NAME}",
        "body": (
            "<p>Xin chào,</p>\n"
            "<p>Bạn (hoặc ai đó) vừa yêu cầu khôi phục mật khẩu cho tài khoản trên <strong>{APP_NAME}</strong>.</p>\n"
            "<p>Vui lòng bấm vào liên kết bên dưới để tạo mật khẩu mới:</p>\n"
            "<p style=\"margin: 20px 0;\">\n"
            "  <a style=\"display: inline-block; padding: 11px 24px; background: #8b5cf6; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-family: sans-serif;\" href=\"{APP_URL}/login?token={TOKEN}\" target=\"_blank\" rel=\"noopener\">Đặt Lại Mật Khẩu Ngay</a>\n"
            "</p>\n"
            "<p style=\"color: #666; font-size: 13px;\"><i>Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email. Mật khẩu hiện tại của bạn vẫn được giữ an toàn.</i></p>\n"
            "<p>Trân trọng,<br/>Đội ngũ {APP_NAME}</p>"
        )
    }

    success = False
    for db_path in db_paths:
        if not os.path.exists(db_path):
            continue
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()

            # 1. Update _params -> settings
            c.execute("SELECT value FROM _params WHERE id='settings'")
            row = c.fetchone()
            if row:
                settings = json.loads(row[0].decode() if isinstance(row[0], bytes) else row[0])
                settings["smtp"] = {
                    "enabled": True,
                    "host": "smtp.gmail.com",
                    "port": 587,
                    "username": clean_gmail,
                    "password": clean_pass,
                    "authMethod": "PLAIN",
                    "tls": False,
                    "localName": ""
                }
                settings["meta"]["senderName"] = sender_name
                settings["meta"]["senderAddress"] = clean_gmail
                settings["meta"]["appName"] = sender_name
                settings["meta"]["appURL"] = clean_url

                new_val = json.dumps(settings)
                c.execute("UPDATE _params SET value=? WHERE id='settings'", (new_val,))
                print(f"[{db_path}] [OK] Da kich hoat Gmail SMTP ({clean_gmail})")

            # 2. Update resetPasswordTemplate in users & _superusers
            for col_name in ['users', '_superusers']:
                c.execute("SELECT options FROM _collections WHERE name=?", (col_name,))
                col_row = c.fetchone()
                if col_row and col_row[0]:
                    opts = json.loads(col_row[0])
                    opts["resetPasswordTemplate"] = vietnamese_template
                    c.execute("UPDATE _collections SET options=? WHERE name=?", (json.dumps(opts), col_name))
                    print(f"[{db_path}] [OK] Da cap nhat mau thu tieng Viet cho '{col_name}'")

            conn.commit()
            conn.close()
            success = True
        except Exception as e:
            print(f"[{db_path}] [ERROR] Loi:", e)

    return success

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        gmail_arg = sys.argv[1]
        pass_arg = sys.argv[2]
        url_arg = sys.argv[3] if len(sys.argv) > 3 else "http://localhost:3000"
        configure_smtp(gmail_arg, pass_arg, url_arg)
    else:
        # Tự động đọc từ file .env nếu không truyền tham số
        env = parse_env_file()
        gmail_env = env.get("SMTP_USER", "")
        pass_env = env.get("SMTP_PASS", "")
        url_env = env.get("APP_URL", env.get("PUBLIC_PB_URL", "http://localhost:3000"))
        sender_env = env.get("SENDER_NAME", "Hệ Thống Thiệp Cưới")

        if gmail_env and pass_env:
            print("Đang đọc cấu hình Gmail từ file .env...")
            configure_smtp(gmail_env, pass_env, url_env, sender_env)
        else:
            print("CÁCH SỬ DỤNG:")
            print("1. Chạy với tham số:")
            print("   python configure_gmail_smtp.py <gmail_address> <16_char_app_password> [app_url]")
            print("2. Hoặc điền SMTP_USER và SMTP_PASS vào file .env rồi chạy:")
            print("   python configure_gmail_smtp.py")
