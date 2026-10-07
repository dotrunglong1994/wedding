const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PB_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';

// Đọc sẵn template index.html vào bộ nhớ đệm có kiểm tra mtime
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');
const LOGIN_HTML_PATH = path.join(__dirname, 'login.html');
const DASHBOARD_HTML_PATH = path.join(__dirname, 'dashboard.html');
const ADMIN_HTML_PATH = path.join(__dirname, 'admin_pocketbase.html');
const USERS_HTML_PATH = path.join(__dirname, 'users.html');

let cachedIndexHtml = null;
let lastIndexMtime = 0;

function getIndexHtml() {
  try {
    const stat = fs.statSync(INDEX_HTML_PATH);
    if (!cachedIndexHtml || stat.mtimeMs > lastIndexMtime) {
      cachedIndexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
      lastIndexMtime = stat.mtimeMs;
    }
    return cachedIndexHtml;
  } catch (err) {
    if (cachedIndexHtml) return cachedIndexHtml;
    return fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Bộ nhớ đệm ngắn hạn cho metadata thiệp cưới (tránh spam request khi có nhiều crawler cùng lúc)
const weddingCache = new Map();
const WEDDING_CACHE_TTL = 15000; // 15 giây

/**
 * Lấy thông tin thiệp cưới từ PocketBase theo slug hoặc id
 */
async function fetchWeddingData(slugOrId) {
  if (!slugOrId) return null;

  const now = Date.now();
  const cached = weddingCache.get(slugOrId);
  if (cached && (now - cached.timestamp < WEDDING_CACHE_TTL)) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    // 1. Thử tìm theo slug trước
    const filter = encodeURIComponent(`slug="${slugOrId}"`);
    const slugUrl = `${PB_URL}/api/collections/wedding_content/records?filter=(${filter})&perPage=1`;
    const res = await fetch(slugUrl, { signal: controller.signal });
    clearTimeout(timer);

    let result = null;
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        result = data.items[0];
      }
    }

    // 2. Fallback thử tìm theo ID (nếu slug truyền vào là ID record)
    if (!result) {
      const idController = new AbortController();
      const idTimer = setTimeout(() => idController.abort(), 2000);
      const idRes = await fetch(`${PB_URL}/api/collections/wedding_content/records/${slugOrId}`, { signal: idController.signal });
      clearTimeout(idTimer);

      if (idRes.ok) {
        result = await idRes.json();
      }
    }

    if (result) {
      weddingCache.set(slugOrId, { data: result, timestamp: now });
      if (result.id) weddingCache.set(result.id, { data: result, timestamp: now });
      if (result.slug) weddingCache.set(result.slug, { data: result, timestamp: now });
      if (weddingCache.size > 200) {
        const oldestKey = weddingCache.keys().next().value;
        weddingCache.delete(oldestKey);
      }
      return result;
    }
  } catch (err) {
    console.warn(`[PocketBase] Không thể lấy dữ liệu cho slug "${slugOrId}":`, err.message);
  }
  return null;
}

/**
 * Thay thế Metadata (Open Graph / Zalo / Facebook / Twitter) vào nội dung HTML
 */
function injectWeddingMeta(htmlContent, wedding, req) {
  if (!wedding) return htmlContent;

  const groom = wedding.groomName || 'Chú Rể';
  const bride = wedding.brideName || 'Cô Dâu';
  const title = `Thiệp Cưới - ${groom} & ${bride}`;

  let dateStr = '';
  if (wedding.weddingDay && wedding.weddingMonth && wedding.weddingYear) {
    dateStr = ` • Ngày ${wedding.weddingDay}/${wedding.weddingMonth}/${wedding.weddingYear}`;
  }

  const desc = wedding.introText || `Trân trọng kính mời quý khách đến dự lễ cưới chung vui cùng ${groom} & ${bride}${dateStr}!`;

  // Xây dựng URL ảnh đại diện cho Open Graph
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  let imageUrl = `${protocol}://${host}/images/wedding_couple_hero.jpg`;
  if (wedding.hero) {
    const publicPb = process.env.PUBLIC_PB_URL || `${protocol}://${host}`;
    imageUrl = `${publicPb}/api/files/${wedding.collectionId || 'wedding_content'}/${wedding.id}/${wedding.hero}`;
  }

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(desc);
  const safeImage = escapeHtml(imageUrl);
  const safeUrl = escapeHtml(fullUrl);

  // Nhúng sẵn dữ liệu thiệp để trình duyệt client hiển thị tức thì không cần đợi fetch
  const safeInitialJson = JSON.stringify(wedding).replace(/</g, '\\u003c');
  const initialDataScript = `<script>window.__INITIAL_WEDDING_DATA__ = ${safeInitialJson};</script>`;

  // Áp dụng sẵn bảng màu template từ phía máy chủ để tránh chớp màu (FOUC)
  const TEMPLATE_SERVER_THEMES = {
    'classic-red': { primary: '#7a0c16', primaryLight: '#9c1c28', primaryDark: '#58060e', accent: '#d4a373', pinkSoft: '#fceceb', bgPage: '#e8eaee' },
    'pastel-pink': { primary: '#be185d', primaryLight: '#db2777', primaryDark: '#9d174d', accent: '#f472b6', pinkSoft: '#fdf2f8', bgPage: '#fce7f3' },
    'sage-green':  { primary: '#15803d', primaryLight: '#16a34a', primaryDark: '#14532d', accent: '#4ade80', pinkSoft: '#f0fdf4', bgPage: '#dcfce7' },
    'luxury-gold': { primary: '#854d0e', primaryLight: '#a16207', primaryDark: '#713f12', accent: '#eab308', pinkSoft: '#fefce8', bgPage: '#fef08a' },
    'ocean-blue':  { primary: '#1e40af', primaryLight: '#3b82f6', primaryDark: '#1e3a8a', accent: '#38bdf8', pinkSoft: '#f0f9ff', bgPage: '#e0f2fe' },
    'lavender':    { primary: '#6d28d9', primaryLight: '#8b5cf6', primaryDark: '#5b21b6', accent: '#a78bfa', pinkSoft: '#f5f3ff', bgPage: '#ede9fe' }
  };
  const th = TEMPLATE_SERVER_THEMES[wedding.template];
  const themeStyle = th ? `<style id="server-theme">:root{--primary:${th.primary};--primary-light:${th.primaryLight};--primary-dark:${th.primaryDark};--accent:${th.accent};--pink-soft:${th.pinkSoft};--bg-page:${th.bgPage};}</style>` : '';

  // Thay thế các thẻ trong file HTML
  let output = htmlContent
    .replace(/<title>.*?<\/title>/i, `<title>${safeTitle}</title>`)
    .replace(/<meta property="og:title" content=".*?" \/>/i, `<meta property="og:title" content="${safeTitle}" />`)
    .replace(/<meta property="og:description" content=".*?" \/>/i, `<meta property="og:description" content="${safeDesc}" />`)
    .replace(/<meta property="og:image" content=".*?" \/>/i, `<meta property="og:image" content="${safeImage}" />`)
    .replace(/<meta property="og:url" content=".*?" \/>/i, `<meta property="og:url" content="${safeUrl}" />`)
    .replace(/<meta name="twitter:title" content=".*?" \/>/i, `<meta name="twitter:title" content="${safeTitle}" />`)
    .replace(/<meta name="twitter:description" content=".*?" \/>/i, `<meta name="twitter:description" content="${safeDesc}" />`)
    .replace(/<meta name="twitter:image" content=".*?" \/>/i, `<meta name="twitter:image" content="${safeImage}" />`);

  if (output.includes('</head>')) {
    output = output.replace('</head>', `${themeStyle}\n${initialDataScript}\n</head>`);
  }
  return output;
}

// ==========================================
// 1. CHUYỂN HƯỚNG CÁC LINK CŨ CÓ ĐUÔI .HTML
// ==========================================
app.get('/login.html', (req, res) => res.redirect(301, '/login'));
app.get('/dashboard.html', (req, res) => res.redirect(301, '/dashboard'));
app.get('/users.html', (req, res) => res.redirect(301, '/users'));
app.get(['/admin.html', '/admin_pocketbase.html'], (req, res) => res.redirect(301, '/admin'));
app.get('/wedding.html', (req, res) => res.redirect(301, '/'));

// Xử lý favicon nhanh chóng không cần query DB
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ==========================================
// 2. STATIC FILES (Ảnh, Nhạc, Thư mục images)
// ==========================================
app.use(['/images', '/thiep/images', '/t/images'], express.static(path.join(__dirname, 'images')));
app.get(['/nhac.mp3', '/thiep/nhac.mp3', '/t/nhac.mp3'], (req, res) => res.sendFile(path.join(__dirname, 'nhac.mp3')));
app.get('/pb_schema.json', (req, res) => res.sendFile(path.join(__dirname, 'pb_schema.json')));

// Proxy ảnh/file từ PocketBase để phục vụ preview mạng xã hội và tránh lỗi CORS/cổng
app.get('/api/files/:collection/:id/:filename', async (req, res) => {
  try {
    const { collection, id, filename } = req.params;
    const thumb = req.query.thumb ? `?thumb=${encodeURIComponent(req.query.thumb)}` : '';
    const pbFileUrl = `${PB_URL}/api/files/${collection}/${id}/${filename}${thumb}`;
    const pbRes = await fetch(pbFileUrl);
    if (!pbRes.ok) return res.status(pbRes.status).end();

    res.setHeader('Content-Type', pbRes.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await pbRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).end();
  }
});

// ==========================================
// 3. CLEAN ROUTES CHO HỆ THỐNG QUẢN TRỊ
// ==========================================
app.get(['/login', '/reset-password', '/forgot-password'], (req, res) => {
  res.sendFile(LOGIN_HTML_PATH);
});

app.get('/dashboard', (req, res) => {
  res.sendFile(DASHBOARD_HTML_PATH);
});

app.get('/users', (req, res) => {
  res.sendFile(USERS_HTML_PATH);
});

app.get('/admin', (req, res) => {
  res.sendFile(ADMIN_HTML_PATH);
});

// ==========================================
// 4. ROUTE THIỆP CƯỚI: /thiep/:slug & /t/:slug
// ==========================================
async function handleWeddingRoute(slug, req, res) {
  try {
    let html = getIndexHtml();
    const wedding = await fetchWeddingData(slug);
    if (wedding) {
      html = injectWeddingMeta(html, wedding, req);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('Lỗi render thiệp cưới:', err);
    res.sendFile(INDEX_HTML_PATH);
  }
}

app.get(['/thiep/:slug', '/t/:slug'], async (req, res) => {
  await handleWeddingRoute(req.params.slug, req, res);
});

// ==========================================
// 5. TRANG CHỦ HOẶC ROOT SLUG (domain.com/:slug)
// ==========================================
app.get('/', async (req, res) => {
  // Nếu có query param ?slug=
  const slug = req.query.slug || req.query.id;
  if (slug) {
    await handleWeddingRoute(slug, req, res);
  } else {
    res.sendFile(INDEX_HTML_PATH);
  }
});

// Catch-all cho các slug ở root (domain.com/:slug)
const RESERVED_ROUTES = ['login', 'dashboard', 'admin', 'users', 'reset-password', 'forgot-password', 'register', 'index', 'images', 'api', 'nhac.mp3', 'favicon.ico'];
app.get('/:slug', async (req, res, next) => {
  const slug = req.params.slug;
  if (RESERVED_ROUTES.includes(slug.toLowerCase())) {
    return next();
  }
  await handleWeddingRoute(slug, req, res);
});

// Khởi động server nếu chạy độc lập
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🎉 Web Server Thiệp Cưới đang chạy tại: http://localhost:${PORT}`);
    console.log(`📡 Kết nối PocketBase: ${PB_URL}`);
    console.log(`✨ Các đường dẫn sạch:`);
    console.log(`   - Xem thiệp:  http://localhost:${PORT}/thiep/:slug`);
    console.log(`   - Bảng quản trị: http://localhost:${PORT}/dashboard`);
    console.log(`   - Đăng nhập:  http://localhost:${PORT}/login`);
    console.log(`   - Chỉnh sửa:  http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
