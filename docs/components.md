# Dashboard Components

The server-rendered dashboard is composed from Pug partials under `components/`. The shared asset registry in `components/registry.js` supplies CSS and JavaScript paths through `app.locals.components`; the login and forgot pages use their page-scoped lists so dashboard behavior is not loaded on authentication screens.

## Add a Component

1. Create `components/Name/name.pug`, `name.css`, and `name.js`.
2. Register the component in `components/registry.js` using the folder and asset basename.
3. Include the Pug partial from its page or parent component. Use relative includes so the source remains outside the public static directory.
4. Keep CSS selectors component-owned. Prefix new classes with a component name, such as `.navbar__item` or `.stat-card__value`; use `body.home-body.dark-mode` for dashboard dark-mode overrides.
5. Keep browser behavior in the matching JavaScript file. Home component scripts load after jQuery, DataTables, and existing page dependencies; auth component scripts load after their page libraries.
6. Add focused route or service coverage, then run `npm test`, `node --test tests/route.test.js`, and `npm run check`.

The `/components` static mount serves only `.css` and `.js` files. Pug files are compiled on the server and are not exposed as source assets. The `components/_template/` directory is the starter example.

## Existing Components

Dashboard sections are split into Navbar, Sidebar, IntakeForm, DataTable, SearchBar, ContactCard, HelpSection, AccountSecurity, Toast, ConfirmModal, Footer, and the reusable StatCard and responsive-table mixins. LoginCard and ForgotCard own the authentication page markup and client behavior. RecordDetailModal, SessionWarning, and AnalyticsChart remain registered scaffolds for their separate pending product features.
