// ===========================================================
// 共享组件：顶部导航 + 页面骨架
// ===========================================================

const NAV_ITEMS = [
  { href: "index.html", key: "record", label: "记一笔弹窗", num: "01", desc: "两段式选择" },
  { href: "statistics.html", key: "statistics", label: "统计卡片", num: "02", desc: "子项折叠" },
  { href: "admin.html", key: "admin", label: "子项管理后台", num: "03", desc: "增删改停用" },
  { href: "ledger-table.html", key: "ledger", label: "流水表格", num: "04", desc: "两级筛选" },
];

function TopNav({ activeKey }) {
  return React.createElement(
    "header",
    { className: "topbar" },
    React.createElement(
      "div",
      { className: "topbar-inner" },
      React.createElement(
        "a",
        { href: "index.html", className: "brand" },
        React.createElement("span", { className: "brand-mark" }, "账"),
        React.createElement("span", null, "账本分类重构"),
        React.createElement("span", { className: "brand-sub" }, "· Demo")
      ),
      React.createElement(
        "nav",
        { className: "nav-tabs" },
        NAV_ITEMS.map((item) =>
          React.createElement(
            "a",
            {
              key: item.key,
              href: item.href,
              className: "nav-tab" + (item.key === activeKey ? " active" : ""),
            },
            React.createElement("span", { className: "num" }, item.num),
            React.createElement("span", null, item.label)
          )
        )
      )
    )
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  return React.createElement(
    "div",
    { className: "page-header" },
    React.createElement("p", { className: "page-eyebrow" }, eyebrow),
    React.createElement("h1", { className: "page-title" }, title),
    subtitle ? React.createElement("p", { className: "page-subtitle" }, subtitle) : null,
    children
  );
}

function Callout({ children }) {
  return React.createElement(
    "div",
    { className: "callout" },
    React.createElement("span", { className: "callout-icon" }, "i"),
    React.createElement("div", null, children)
  );
}

// 暴露到 window
Object.assign(window, {
  NAV_ITEMS,
  TopNav,
  PageHeader,
  Callout,
});
