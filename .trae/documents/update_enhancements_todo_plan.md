# Update ENHANCEMENTS_TODO.md — Additional Project-Specific Improvements Implementation Plan

## Repository Research

The existing `ENHANCEMENTS_TODO.md` (314 lines) already contains ~110+ improvement items across 16 well-organized categories. After a broad audit of the actual codebase, I identified **additional concrete, codebase-specific gaps that are NOT yet listed**. These are grounded in actual code observations, not generic ideas:

### Confirmed Findings (NOT in the existing todo):

**Security & Auth:**
- The `requireLogin` middleware (defined in routes/index.js) is **never actually mounted** on any protected route — only inline `hasSessionUser()` predicates are used.
- 5 of 7 DB routes (`/hh`, `/change`, `/edit`, `/update`, `/delete`) do NOT write to `error_reports` via `recordError()` — only auth routes do, so there's no audit trail for operational errors.
- `POST /hh` and `GET /home` **destroy the user session on any DB error** (even transient ones like connection blips) → logs user out unnecessarily.
- 7-char temp passwords from `/postforgot` violate the 10-char password rule enforced during signup.
- Session cookie `sameSite=lax` should be `strict`.
- Password reset OTP email has hardcoded "Your Brand Inc", "Bhargava Gidijala", "+91 9493818156" — not the real institution branding (Aditya College of Institutions).
- `normalizeStudentRecord` drops `_id`/`gid` — update/delete match by `rno` which could match multiple documents (no unique guarantee).

**Architecture / Data Layer:**
- `monk` is listed as a `package.json` dependency but **never `require()`d anywhere** — pure dead weight.
- `scripts/seed.js` locally duplicates `hashPassword()` + `sanitizeMongoUri()` instead of importing shared modules.
- `routes/index.js` nodemailer `transporter` is created **per-request** inside `/postforgot` (should be module-level singleton).
- Only 4 Mongo indexes exist (`email` unique, `rno`, `status`). The other collections (`visitors_of_page`, `error_reports`, sessions metadata) have 0 indexes.
- Body parser 100kb limit + parameterLimit 100 is hardcoded — should be env-configurable and higher for Excel bulk imports later.
- The `/users` Express router stub returns literal `"respond with a resource"` from Express generator.

**User / Account:**
- Login route checks for `!hasSessionUser()` but doesn't redirect authenticated users away from the login page (they can re-login again while logged in under a 2nd account).
- Forgot flow emails a temporary password (never expires or gets revoked until someone actually resets).

**Core Device Features:**
- `delete` uses hard `remove()` — inconsistent with the existing P2 plan for soft-delete 2.7. No pre-delete confirm/dialog from server-side.
- Intake form (`/hh`) has NO server-side duplicate detection — IMEI, roll-no in same class could be duplicated 10×.

**Search Filters / Reporting:**
- `student_data.countDocuments()` queries in `/home` are not used — it does `data.length` on all docs → slow N-doc load just to count.
- DataTables use fully client-side `draw:50` on all 5 example tables → >1000 rows will slow browser to a crawl.

**UI/UX:**
- `/`, `/forgot` are done with AngularJS 1.7.9 — brittle to maintain, no design system (task 6.1 covers redesign).
- **Delete** operations use no front-end confirm (just `$.post`).
- No session-expiry warning even though cookie is hardcoded 8hr TTL.
- `app.js` 404 page just says `Not Found` — no branded error page.

**Developer Experience:**
- 0 env vars documented: `.env.example` file does not exist. Copy-paste instructions: missing.
- `usersRouter` stub from Express generator can be deleted (unused).
- `package.json` missing `dev`/`nodemon` script (10.2 in TODO but should be concrete).
- No `npm run seed` script reference for existing `scripts/seed.js`.

**Testing:**
- Current test harness in `scripts/app-tests.js` uses `Module._load` monkey-patching (fragile) instead of actual supertest agent.

**Data Migration/Seeding:**
- `visitors_of_page` indexes missing (no `createdAt` / `email` index — report queries will do COLLSCAN).
- `error_reports` has zero indexes.

**Mobile / Installability:**
- `<meta name="viewport">` tag may be missing zoom controls (need to confirm).

**Notification & Email:**
- Nodemailer uses `service: 'gmail'` with password — Gmail disabled this in 2022. OAuth2 or App Passwords needed. Document fix.

## Files and Modules

- `g:\My Projects\gbr_Mobile_seize_application\ENHANCEMENTS_TODO.md` — EDIT only. Append ~40 new codebase-specific items into existing categories as new numbered rows (e.g., 1.11, 1.12…, 2.14, 2.15… etc). Update the meta footer (last updated, "items: ~150+"). No new categories beyond the existing 16.

## Implementation Steps

1. **Research existing section numbering** (6 UI/UX stops at 6.12). For each category find the LAST numbered item.
2. **Append rows** into each of the 16 sections following the existing 4-column Markdown table format (#, Task, Priority, Effort, Status, Notes/AC).
3. **Priority-tag each new item** by severity: session-destroy-on-error → P0, dead monk dep → P1, email-branding → P2, etc.
4. **Effort-tag** using the same S/M/L/XL scale already established (S<2h, M 2-8h, L 8-24h, XL>24h).
5. **Status column** defaults to `⬜` for all new items.
6. **Update the final footer metadata**: "Last updated: today", "Total items: ~150+ across 16 categories", append a ⭐ call-out listing 5 most notable newly-added codebase-specific tasks.
7. **Optionally extend the Phases section** (Phase 1-5 at bottom of doc) with the highest-priority new finds (P0 session destroy, P0 requireLogin mount, P1 indexes).
8. **Add to Quick Wins** list any S-effort items identified (e.g., remove monk, delete usersRouter stub, create .env.example).
9. **Do NOT touch** the Pug, CSS, JS, or app code in this task — only the markdown.

## Dependencies and Considerations

- The file uses a strict 6-column table layout. Existing row content uses inline links, italics, nested code blocks with backticks. Match this convention exactly — no table format deviation.
- Existing Priority / Effort semantics MUST be preserved. Do not invent P4 / XXL.
- Do not create new sections (no 17.x). Add new items to the most fitting existing 16 sections.
- Avoid duplicating items that already exist in ENHANCEMENTS_TODO.md (e.g., security 1.6 already covers input sanitization, don't add a second row).
- Keep "Notes/Acceptance Criteria" concrete, specific to the code findings above rather than general.

## Validation

1. Open the file with the Read tool and visually inspect every modified table — ensure columns align, no broken markdown tables.
2. Count the new rows per section and verify totals in the footer.
3. Run a quick `wc -l` or read the footer of the file to ensure it's >314 lines (bigger than original).
4. Run a markdown linter or paste preview to ensure tables render without misaligned pipes.

## Risks

- **Risk 1: Markdown table column drift** — Mitigation: append row-by-row and follow exact pipe/column spacing of last existing row in each table.
- **Risk 2: Duplicate items vs existing tasks** — Mitigation: read each section's full existing list before writing new rows; cross-reference against the original ~110 items.
- **Risk 3: Overly generic items that don't match codebase facts** — Mitigation: keep every row's Notes/AC tied to concrete file references or the findings listed in Research above.
