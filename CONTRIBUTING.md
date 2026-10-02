# Contributing

Thanks for helping improve this project.

## Local setup

1. Use Node.js 20 LTS.
2. Clone the repository and install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Copy the example environment file and fill in the required values:
   ```bash
   copy .env.example .env
   ```
4. Start MongoDB locally or connect to MongoDB Atlas.
5. Seed the database if needed:
   ```bash
   npm run seed
   ```
6. Start the app in development mode:
   ```bash
   npm run dev
   ```

## Working conventions

- Keep code changes focused and scoped to one concern.
- Prefer small, readable commits.
- Do not commit real credentials, secrets, or session keys.
- Match the existing project style and naming conventions.
- Add or update tests when a change affects app behavior.

## Commit message format

Use conventional commits such as:

- `feat:` for user-facing features
- `fix:` for bug fixes
- `refactor:` for internal cleanup
- `docs:` for documentation changes
- `chore:` for setup and tooling

Examples:

```bash
git commit -m "feat: add record audit timeline"
git commit -m "fix: prevent duplicate device intake"
git commit -m "docs: add deployment guide"
```

## Pull request checklist

Before opening a PR:

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] The change is covered by a relevant test where practical
- [ ] UI changes include a screenshot or short description
- [ ] Environment variable changes are documented in `.env.example`
- [ ] No secrets or credentials are committed

## Review guidance

- Keep the diff easy to reason about.
- Prefer the smallest fix that addresses the root cause.
- For security or auth changes, include a brief explanation of the risk and mitigation.
- If a change touches routes or database logic, confirm it still respects session checks and validation.
