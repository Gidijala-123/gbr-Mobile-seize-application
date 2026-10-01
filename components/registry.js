const componentFiles = [
  ["Shared", "shared"],
  ["Navbar", "navbar"],
  ["Sidebar", "sidebar"],
  ["StatCard", "stat-card"],
  ["IntakeForm", "intake-form"],
  ["DataTable", "data-table"],
  ["SearchBar", "search-bar"],
  ["RecordDetailModal", "record-detail-modal"],
  ["Toast", "toast"],
  ["ConfirmModal", "confirm-modal"],
  ["ContactCard", "contact-card"],
  ["HelpSection", "help-section"],
  ["LoginCard", "login-card"],
  ["ForgotCard", "forgot-card"],
  ["Footer", "footer"],
  ["DarkModeToggle", "dark-mode-toggle"],
  ["SessionWarning", "session-warning"],
  ["AnalyticsChart", "analytics-chart"],
  ["AccountSecurity", "account-security"],
];

module.exports = componentFiles.map(([name, file]) => ({
  name,
  css: `/components/${name}/${file}.css`,
  js: `/components/${name}/${file}.js`,
}));
