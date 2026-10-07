/**
 * Tiện ích cấu hình Gmail SMTP cho PocketBase
 * Cách dùng: node configure_gmail_smtp.js <gmail> <app_password> [app_url]
 * Ví dụ: node configure_gmail_smtp.js wedding@gmail.com "abcd efgh ijkl mnop" http://localhost:3000
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Kiểm tra tham số
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Cách dùng: node configure_gmail_smtp.js <gmail> <16_ky_tu_app_password> [app_url]');
  console.log('Ví dụ: node configure_gmail_smtp.js wedding@gmail.com "abcd efgh ijkl mnop" http://localhost:3000');
  process.exit(1);
}

const gmail = args[0].trim();
const appPassword = args[1].replace(/\s+/g, '').trim();
const appUrl = (args[2] || 'http://localhost:3000').replace(/\/+$/, '');

console.log(`Đang cấu hình Gmail SMTP:`);
console.log(` - Gmail: ${gmail}`);
console.log(` - App URL: ${appUrl}`);

// Chạy cấu hình qua python nếu có, hoặc báo thành công
try {
  execSync(`python configure_gmail_smtp.py "${gmail}" "${appPassword}" "${appUrl}"`, { stdio: 'inherit' });
} catch (e) {
  console.error('Lỗi khi chạy cấu hình:', e.message);
}
