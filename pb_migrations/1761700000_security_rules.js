/// <reference path="../pb_data/types.d.ts" />

// Siết quyền truy cập:
// - Đăng ký mới không được tự gán role admin hoặc verified = true
// - Thành viên không được tự đổi role / verified của chính mình (chỉ admin mới được)
// - Thiệp: chỉ tài khoản đã được duyệt mới được tạo/sửa/xoá; owner phải là chính mình và không được đổi owner
const USERS_RULES = {
  createRule: "(@request.body.role:isset = false || @request.body.role = 'member') && (@request.body.verified:isset = false || @request.body.verified = false)",
  updateRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || (id = @request.auth.id && (@request.body.role:isset = false || @request.body.role = role) && (@request.body.verified:isset = false || @request.body.verified = verified)))",
};

const WEDDING_RULES = {
  createRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.verified = true && @request.body.owner = @request.auth.id))",
  updateRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.verified = true && (owner = '' || owner = @request.auth.id) && (@request.body.owner:isset = false || @request.body.owner = owner)))",
  deleteRule: "@request.auth.id != '' && (@request.auth.role = 'admin' || (@request.auth.verified = true && (owner = '' || owner = @request.auth.id)))",
};

const OLD_USERS_RULES = {
  createRule: "",
  updateRule: "@request.auth.id != '' && (id = @request.auth.id || @request.auth.role = 'admin')",
};

const OLD_WEDDING_RULES = {
  createRule: "@request.auth.id != ''",
  updateRule: "@request.auth.id != '' && (owner = '' || owner = @request.auth.id || @request.auth.role = 'admin')",
  deleteRule: "@request.auth.id != '' && (owner = '' || owner = @request.auth.id || @request.auth.role = 'admin')",
};

function applyRules(app, name, rules) {
  const collection = app.findCollectionByNameOrId(name);
  Object.keys(rules).forEach((k) => { collection[k] = rules[k]; });
  app.save(collection);
}

migrate((app) => {
  applyRules(app, "users", USERS_RULES);
  applyRules(app, "wedding_content", WEDDING_RULES);
}, (app) => {
  applyRules(app, "users", OLD_USERS_RULES);
  applyRules(app, "wedding_content", OLD_WEDDING_RULES);
});
