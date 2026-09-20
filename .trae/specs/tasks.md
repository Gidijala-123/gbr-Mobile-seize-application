# Implementation Tasks - UI Enhancement

| Task | Priority | Status | Depends On |
|------|----------|--------|------------|
| 1 | high | pending | - |
| 2 | high | pending | 1 |
| 3 | high | pending | 1 |
| 4 | high | pending | 1 |
| 5 | high | pending | 3,4 |
| 6 | high | pending | 5 |
| 7 | medium | pending | 6 |
| 8 | medium | pending | 7 |
| 9 | high | pending | 2,3,4,5,6,7,8 |

---

## Task 1: Refresh signlog.css - Login/Signup styling polish

**Scope**: public/stylesheets/signlog.css

**Objective**: Modernize the login/signup page aesthetic while keeping the panda animation and flip form intact. Replace dated colors with a sophisticated deep-indigo + teal palette. Tighten spacing, smooth gradients, polish inputs and buttons.

### Changes
- Replace the `html` background with a more sophisticated gradient
- Refine `body` container: slightly softer shadow, max-width cap, cleaner edge treatment
- Keep `.login-shell` grid layout; adjust paddings for breathing room
- Keep `.panda` (all ear/face/eye/hand/foot) dimensions and behavior; ensure sizing still scales relative to container on small screens
- Refine `.formlogin` / `.formsignup` gradients to a more professional palette (deep indigo / teal accents); increase border-radius to ~16-20px, slightly stronger but softer shadow
- Refine `.field` input styling: consistent `border-radius`, more elegant bottom border accent color (cyan/teal), better padding and `:focus` glow, ensure placeholder/label animation still works
- Upgrade `.bbtn2` button: consistent border-radius (24-28px), a cohesive gradient, hover state is lift + subtle brightness change instead of harsh color flip
- Refine star-field `#stars`, `#stars2`, `#stars3` to keep the animated effect but reduce visual noise if needed (optional – leave intact by default)
- Keep all `.footer1`, `.footer4`, `.hover1`, `.hover2` behavior; adjust colors to match new palette
- Keep `.label__icon` positioning pattern; ensure color harmonizes with inputs
- Keep responsive @media (max-width: 767px) rules; ensure small-screen forms have proper max-widths and input font-size >= 16px to avoid iOS zoom

### Test Requirements

**rule TR-1.1**: Panda visible + eyes track mouse
- Pass condition: On `/`, `.panda` element visible. Mousing across the page changes `.eye-ball` dimensions (jQuery `mousemove` handler sets width/height).
- Evidence source: Manual browser test.

**rule TR-1.2**: Flip-toggle still works
- Pass condition: Clicking "Login here!" label flips to login form; "Goto Signup" flips back. `.flippercheckbox` checked/unchecked state drives rotateY(180deg) on `.form_container`.
- Evidence source: Manual interaction + DOM class inspection.

**rule TR-1.3**: Password toggle + match indicator work
- Pass condition: `.toggle-password` click toggles fa-eye/fa-eye-slash and input type. Typing in `#password1`/`#password2` live-updates `#message` color/text between matching/non-matching states.
- Evidence source: Manual interaction test.

---

## Task 2: Rework Forgot Password page (forgot.pug + inline style clean-up)

**Scope**: views/forgot.pug and any helper CSS in public/stylesheets/

**Objective**: Match the login page's aesthetic. Extract styles from inline attributes and add proper CSS. Remove the hacked-together box-shadow string and basic border. Keep functionality (form POST /postforgot, Angular controller, back button, anti-inspect scripts).

### Changes
- Keep `ng-app="forgotapp"` and `ng-controller="forgotController"` and form submit behavior exactly as-is
- Keep the existing `<script>` blocks entirely unchanged (Angular module + contextmenu/F12 prevention)
- Wrap page in a layout that mirrors login page: centered card container with gradient background, rounded corners, soft shadow, similar color theme
- Replace the `<div class="col-md-4 col-md-offset-4" style="border:1px solid black; ...">` with a clean card component using a dedicated CSS class (e.g., `.forgot-card`)
- Style the input + button to match the login form inputs/buttons (same radius, focus effects, button gradient)
- Replace the back-arrow `<i style="margin-left:150px; ...">` with a styled link/button that has a clean hover state
- Keep the `Note:` text block; style it as an `.alert` or callout with soft amber background

### Test Requirements

**rule TR-2.1**: Form submits to /postforgot
- Pass condition: Browser network tab shows POST to `/postforgot` with JSON body `{email: "..."}` when button is clicked.
- Evidence source: Network panel inspection (or, if backend unavailable, confirm form action and Angular $http URL match).

**rule TR-2.2**: Back navigation works
- Pass condition: Clicking the back arrow/link navigates to "/" (login page).
- Evidence source: Manual click test.

---

## Task 3: Home page – Extract inline CSS from home.pug into stylesheets

**Scope**: views/home.pug (remove `<style>...</style>` block lines ~18-82 and many inline style attributes), public/stylesheets/style.css (add replacement classes), and (minimally) public/stylesheets/default.css.

**Objective**: Move the entire inline `<style>` block from home.pug into style.css, organized by component. Replace inline `style="..."` attributes on elements like `body`, `.header`, `aside #sidebar`, `#main-content`, table wrappers, stat cards, form elements, `.containerr`/`.main` with reusable CSS classes. DO NOT remove IDs or data-attributes. DO NOT change any structure.

### Changes
1. **Copy the `<style>` block lines 18-82 into style.css**, placed at the bottom with a comment marker such as `/* --- Home Page Styles (migrated from home.pug) --- */`. Ensure rules still apply correctly (they will, because selectors are unchanged).
2. **Replace inline style on `<body>`** (`background-color:lightyellow; height:100%; position:fixed; overflow-y:scroll; overflow-x:hidden; font-family:Tw Cen MT; -webkit-transition:...; background-size:cover;`) with a CSS class `body.home-body` with equivalent properties but improved background (a very light gradient, e.g., `#f5f7fb` to `#eef2f7`, `font-family: 'Inter', 'Segoe UI', Lato, sans-serif;`).
3. **Replace `.header` inline style** (`background:url(...)` and `height:3.7vw;`) with a class `.app-header { background: linear-gradient(135deg, #1e3a8a, #0f766e); background-size: cover; height: 60px; min-height: 60px; }`. Add the image as a background-image with overlay gradient if desired.
4. **Replace `#sidebar.nav-collapse` inline style** (`background:url(...)`, `position:fixed`, `overflow-x:hidden`) with a class `.app-sidebar { background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%); }`. The image can remain as a layered background-image at low opacity or replaced by solid gradient for professionalism.
5. **Replace inline styles on individual sidebar `<li> <a>` items** (e.g., `style="margin-bottom:1vw;padding: 0.4vw 0vw 1.5vw 0.8vw;"`) – migrate values into existing `ul.sidebar-menu li a` rule in style.css (already has very similar padding; adjust if needed to match).
6. **Replace inline styles on Dashboard stat-card divs** where present.
7. **Replace inline styles on Contact tab** – the `.x1`, `.x2`, etc. styles migrated to default.css (they already partially live there).
8. **Keep every inline style that is used as a dynamic toggle target by JS**, specifically: `style="display:none;"` on #fmgrp (start hidden), `style="height:49vh;margin-top:1vh;..."` on search table wrapper can be converted to a class, as long as the JS toggle still works.

### Test Requirements

**rule TR-3.1**: All tabs render and activate via bootstrap tabs
- Pass condition: Clicking sidebar nav items (Dashboard, Over-all list, Mobiles at office, Mobiles Returned, Search, Contact Staff) switches to their respective .tab-pane with correct visibility. Help tab still opens from header.
- Evidence source: Manual click-through of all tabs.

**rule TR-3.2**: Live clock still renders
- Pass condition: `#date_time` innerHTML updates every second with day/date/time string (the `date_time()` function writes into it).
- Evidence source: Manual observation for 2+ seconds.

**rule TR-3.3**: Sidebar logo flip still works
- Pass condition: Hovering `.flip-box` rotates `.flip-box-inner` by rotateY(180deg) to show back image.
- Evidence source: Manual hover test.

**rule TR-3.4**: No inline style block remains in head of home.pug (except any < 5 lines needed for dynamic JS values)
- Pass condition: Grep for `<style>` in home.pug head – none present, OR style block is 0 lines.
- Evidence source: File read of home.pug lines 1-100.

---

## Task 4: Home page layout polish – Header, Sidebar, Main content area

**Scope**: public/stylesheets/style.css (mostly)

**Objective**: Professionalize the chrome of the dashboard – the top header bar, the sidebar, and the main content wrapper. Use modern admin-dashboard aesthetics: soft shadows, consistent spacing, a sophisticated color scheme (deep slate-blue sidebar, indigo/teal gradient header, off-white content background).

### Changes
- **Body background**: Replace lightyellow with a very light neutral gradient (e.g., `#f8fafc` to `#eef2f7`)
- **Header (.header / .app-header)**:
  - Solid or subtle gradient (deep indigo + teal)
  - White or light text for datetime
  - Increase `.inner-width-neon` buttons' polish: consistent 8px border-radius, proper padding, no neon glow; clean primary button (white text, white/teal outline, subtle hover lift)
  - Refine `.sidebar-toggle-box .fa-bars` color for contrast
  - Datetime `#date_time` styling: clean white/light text, slightly larger font-size, good vertical centering
- **Sidebar (#sidebar / .app-sidebar)**:
  - Dark slate / navy gradient background
  - Sidebar menu items: white text, pink/cyan accent icons (keep existing icon colors or soften slightly), hover state is a subtle background highlight + left accent bar instead of current neon red glow box-shadow; active state is clearly highlighted
  - Remove current jarring `box-shadow: 0px 0px 10px 3px red` on hover. Replace with `background: rgba(255,255,255,0.08); border-left: 3px solid #22d3ee;`
  - `.qw` (Mobile Seize heading) animation: tone down from neon rainbow cyan to a clean white glow with subtle blue/cyan accent
- **Main content (#main-content / .wrapper)**:
  - Content background white with very light card containers
  - `anim-typewriter` (DashBoard / List headers): refine to an elegant serif/display look, center properly, remove jarring text-shadow combo; use clean deep-indigo text with a soft underline accent
  - Tab content panes: add consistent padding-top so content doesn't feel cramped

### Test Requirements

**rubric TR-4.1**: Chrome polish score
- Dimension: Header + sidebar + content area look professional, clean, modern, cohesive
- Scale 0-5: Anchors per AC-8
- Pass threshold: >= 4
- Evidence source: Screenshot + visual inspection.

**rule TR-4.2**: Sidebar toggle still functional
- Pass condition: Clicking `.sidebar-toggle-box .fa-bars` toggles a sidebar-collapsed state as before (existing logic in common-scripts.js). No errors in console.
- Evidence source: Manual click + console check.

---

## Task 5: Home page – Dashboard form + Stat cards

**Scope**: home.pug DOM + style.css

**Objective**: Redesign the dashboard stat cards (.dd1) and the data-entry form into a polished, card-based layout. Consistent spacing, card containers with border-radius/shadow, refined form-control inputs.

### Changes
- **Stat cards (.dd1, .p1, .pp1)**:
  - Current .dd1: #ff9f00 solid bg, huge multi-shadow, awkward p1/pp1 layout.
  - Replace with a 3-column card row, each card: white bg, subtle shadow, border-top/border-left accent in brand color
  - Card title ("Total Mobiles", "Mobiles at office", "Returned Mobiles"): muted text, medium weight, small icon prefix
  - Count number (.pp1): large, bold, brand-primary accent color, centered
  - Hover: subtle lift + soft shadow darken
- **Data-entry form (#form form.form-group)**:
  - Wrap form in a white card with soft shadow and border-radius (~12px)
  - Card header: "New Seizure Entry" with an icon
  - Form columns (.col-md-4 x 3): consistent vertical rhythm of label + input pairs
  - All `.form-control` inputs: consistent height (40-44px), 8px border-radius, light gray border, `:focus` state with teal/cyan ring + border (no harsh outline), proper label spacing above
  - Labels: consistent sizing, uppercase small text or medium gray, bold only if needed for hierarchy
  - Textarea (#rsn2): same treatment as inputs, resize vertical only
  - Submit button (.btn2 "Submit and Print"): large primary button, centered, consistent radius (~10px), brand gradient, hover is lift + darker, proper padding and min-height for clickability
  - Note: keep existing input IDs exactly (dat2, tim2, snm2, pnm2, enm2, clg2, brc2, yr2, sec2, spn2, ppn2, epn2, rno2, gid2, eid2, mdl2, mcl2, ime2, rsn2). Keep selects options intact.

### Test Requirements

**rule TR-5.1**: Form fields still submit correctly
- Pass condition: Every field name attribute matches routes/index.js normalizeStudentRecord: Date,Time,sname,pname,ename,clg,brch,year,sec,spno,ppno,epno,rno,gid(Generated_ID disabled),eid,mmodel,mclr,imei,rsn
- Evidence source: DOM inspection of each input's `name` attribute.

**rule TR-5.2**: Submit button still triggers print (pdf class JS) if enabled
- Pass condition: The `.pdf.btn2` button is still present with both classes; click handler from click.js still targets it (confirmation via DOM inspection only).
- Evidence source: DOM class inspection.

**rubric TR-5.3**: Card/Form polish score
- Scale 0-5 per AC-8 anchors.
- Pass threshold: >= 4.
- Evidence source: Screenshot.

---

## Task 6: Home page – Data Tables (Total / At Office / Returned)

**Scope**: style.css (table styling), home.pug (remove inline table-cell styles)

**Objective**: Replace current jarring table look (thick orange borders, #44921f dark green headers, #f9f2df body) with a modern, clean admin-datatable style: white cards, subtle row striping, light gray borders, clean header background with brand accent, proper padding and consistent font sizes.

### Changes
- **Wrap each DataTable section in a card** (white bg, border-radius, shadow) with a section header (matches page header aesthetic, smaller scale)
- **`.table-responsive`**:
  - Adjust sizing: remove forced vw height if possible or make it min-height + max-height overflow
  - Clean padding inside card
- **`thead` / `th`**:
  - Remove 0.2vw solid orange border and #44921f background
  - Use: background `#f1f5f9` or very light brand tint, text `#0f172a` (dark slate), bottom border 1px solid #e2e8f0
  - Sticky top still works (keep position: sticky; top: 0)
  - Proper padding 12px 16px, font-size 13-14px, font-weight 600
  - Consistent border-radius on corners
- **`td`**:
  - Remove 0.2vw orange borders and #f9f2df background
  - Background: white for odd, #f8fafc for even rows (striped), border-bottom 1px solid #e2e8f0
  - Padding 10px 16px, font-size 13-14px, text color #1e293b
  - Text-align center okay but left-align names/strings for readability is acceptable (choose one consistent approach)
- **`.bbb` Transfer button**:
  - Style as a small primary/secondary pill button (not `color:white; background:#12b0f9; font-size:1vw;` without radius)
  - Proper padding 6px 14px, border-radius 6px, hover darken, cursor pointer
- **`.edit` Edit button**:
  - Remove old `background: orange; border:none; border-radius:0.3vw;`
  - Use a warning/secondary style consistent with Transfer: small pill, consistent padding/radius

### Test Requirements

**rule TR-6.1**: Datatables initialize
- Pass condition: Console no errors, `#example2_wrapper`, `#example3_wrapper`, `#example4_wrapper` are rendered by DataTables plugin with export button toolbar visible.
- Evidence source: Console + DOM inspection.

**rule TR-6.2**: Transfer button still actionable
- Pass condition: `.bbb` elements in #example2 have value=member.rno set. Clicking triggers the form submit or handler (verify class + value attr present).
- Evidence source: DOM inspection.

**rubric TR-6.3**: Table polish score
- Scale 0-5 per AC-8 anchors.
- Pass threshold: >= 4.
- Evidence source: Screenshot.

---

## Task 7: Home page – Search/Edit tab + Contact tab + Help tab polish

**Scope**: style.css, default.css, component.css (dl-menu), home.pug inline style removal

### Changes
**Search tab**:
- **`.srcbar` / `#wrap` animated search bar**: Keep the running-man animation intact (all Splitting chars, sparks, blob, plunge classes referenced in JS MUST remain). BUT clean up the visuals:
  - Search input: keep rounded pill look, use slightly more elegant gradient or clean white with ring, not aqua->yellow with `0.4vh #ff7b0a` orange border. Modernize to white bg with teal accent ring, dark placeholder text.
  - Submit button wrap (orange/pink gradient): soften or harmonize with palette; do NOT remove spark classes or b:before/b:after because plunge animation depends on them.
- **#example5 search results table**: same treatment as Task 6 (clean table style)
- **#fmgrp edit form**:
  - Current gradient `linear-gradient(to top, #a18cd1 0%, #fbc2eb 100%)` + thick `2px solid black` border is dated
  - Redesign as a clean white card with border-radius/shadow, same input styles as Task 5 (.lb labels and .inp inputs – refactor those classes).
  - `.btn4` "update" button: consistent primary-button style instead of `1vw solid red` border.
  - Keep `slideInDown` animation class name and effect intact.
  - Keep all field IDs unchanged: Date, Time, sname, pname, ename, clg, brch, year, sec, spno, ppno, epno, rno, _id, eid, mmodel, mclr, imei, rsn.

**Contact tab**:
- `.containerr .demo-4 .main` / `header.clearfix`: Already have gradient (`linear-gradient(to top right,#08D9D9,pink)`). Harmonize the palette to brand colors (soft teal + indigo accents, not hot pink + cyan combo). Keep border-radius, but soften.
- `.dl-menu` / `.dl-trigger` (nav button): keep all existing classes because component.css targets them. Just refine colors: `.demo-4 .dl-menuwrapper button/ul` (#34495e slate-gray) is fine, but adjust menu item hover from `tomato` + aqua to a clean brand accent.
- `.cnt0` Class Teacher card and `.cntf0` faculty cards:
  - Refine `.mn`, `.cnth1/.cnth2`, `.cntr`, `.cntf1/.cntf2` classes: consistent border-radius, shadow depth, colors matching palette. No hot-pink borders everywhere; use subtle teal/indigo accents.
  - Keep background-image inline styles on `style='background:url(...)'` for faculty photos (those are dynamic per-section).

**Help tab**:
- Current `.rr` + navbar list: basic styling.
- Refactor to a card: white bg, soft shadow, header "Help / FAQ", list items as clean accordion-like links or list with bullets.
- Keep all link hrefs exactly: `#link1` through `#link8`. Keep all content paragraphs intact (the troubleshooting text).
- `.gg` animated-text classes: keep `animated-text` keyframes if desired (harmless) but clean colors for readability.

### Test Requirements

**rule TR-7.1**: Search animation + filter still works
- Pass condition: Type a value in #myInput and submit `.srch`. Table #example5 display becomes block; rows filter by rollno. `.field p` appended with Splitting chars; #wrap.plunge class added; sparks/animation plays, then removes after 4s (observe or verify timeout path still reachable by function body present).
- Evidence source: Manual interaction.

**rule TR-7.2**: Edit toggle still works
- Pass condition: Clicking `.edit` calls toggle(); #fmgrp displays.
- Evidence source: Click an Edit button.

**rule TR-7.3**: Edit form submits to /update
- Pass condition: #fmgrp form action="/update" method="post" still set.
- Evidence source: DOM inspection of form tag.

**rule TR-7.4**: Contact dl-menu still functional
- Pass condition: Clicking `.dl-trigger` opens menu; sub-levels still animate via component.css animation classes. No console errors from dlmenu plugin.
- Evidence source: Click through submenus + console.

**rubric TR-7.5**: Sub-page polish score
- Dimension: Search/Edit, Contact, Help tabs look clean, professional, consistent.
- Scale 0-5 per AC-8 anchors.
- Pass threshold: >= 4.
- Evidence source: Screenshot per tab.

---

## Task 8: Responsive design pass + final consistency tweaks

**Scope**: style.css, style-responsive.css, signlog.css, forgot page

**Objective**: Ensure everything holds together well at 1024px (tablet landscape), 768px (tablet portrait), and 375px (mobile). No horizontal page-level overflow. Tables scroll within their wrapper. Buttons and inputs are touch-friendly.

### Changes
- Review and update @media rules in style.css and style-responsive.css. Ensure:
  - Sidebar on < 768px is not fixed but scrolls with page
  - Stat cards on dashboard stack vertically on small screens (col-md-4 bootstrap already helps)
  - Form inputs have min-height 40px and readable font-size
  - Login forms at small widths: per existing media queries already present; ensure padding, font-sizes, button sizes are touch-safe (44px high min for buttons)
- Ensure portrait orientation warning (`#warning-message`) still displays when orientation is portrait on small screens.
- Any hard `height: xx vw` that forces overflow should become `min-height` + `max-height: xxvh` with overflow-y auto where appropriate

### Test Requirements

**rule TR-8.1**: No horizontal scrollbars on viewports 1024x768 and 375x667
- Pass condition: At both sizes, `document.documentElement.scrollWidth <= window.innerWidth` (no body-level horizontal overflow). Tables inside .table-responsive may scroll internally, which is fine.
- Evidence source: Resize test + manual check.

**rule TR-8.2**: Forms usable on mobile (375px)
- Pass condition: Input fields are not clipped; buttons are visible without scrolling sideways; submit buttons at least 40px tall.
- Evidence source: Screenshot at 375px.

---

## Task 9: Verification – Full end-to-end run and final check

**Scope**: All artifacts

**Objective**: Start the application, browse each page, open DevTools console, exercise forms and navigation, capture final screenshots or notes as evidence that Acceptance Criteria AC-1 through AC-12 are met.

### Steps
1. Ensure dependencies installed (`npm install` if node_modules missing).
2. Create .env from .env.example if missing; MONGODB_URI may be absent, causing DB failure but pages still render.
3. Start server (`npm start`).
4. Visit http://localhost:3000/ – test login/signup UI, password toggles, panda.
5. Visit /forgot directly – test layout, back link.
6. If login redirect without DB, test page rendering at least; alternatively test via direct URL or by mocking session cookie (acceptable if app cannot reach Mongo – only UI evidence is needed for the rubric ACs).
7. Open console, verify no NEW errors vs. baseline (existing errors from missing Mongo/script are fine).
8. Screenshot key pages as evidence.

### Test Requirements

**rule TR-9.1**: App starts and serves pages
- Pass condition: `npm start` exits cleanly with listening message; browser loads / and /forgot with HTTP 200. /home either redirects (no session) or renders 200 if session set.
- Evidence source: Terminal output + browser HTTP status.

**rule TR-9.2**: No new console errors
- Pass condition: Compare baseline console (before changes if possible) vs. current. Any new error introduced by our markup/CSS is a fail.
- Evidence source: Browser console screenshots or log copy.
