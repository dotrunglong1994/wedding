/// <reference path="../pb_data/types.d.ts" />

// Cho phép user có role admin (không chỉ superuser) duyệt/khoá tài khoản (verified)
// và đặt lại mật khẩu cho người khác — đúng như các nút đang hiển thị ở trang /users.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.manageRule = "@request.auth.id != '' && @request.auth.role = 'admin'";
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.manageRule = null;
  app.save(users);
});
