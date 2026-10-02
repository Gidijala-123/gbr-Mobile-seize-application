# Deployment Guide

This project is designed to run on a Node.js host such as Render or a similar production platform.

## Prerequisites

- Node.js 20 LTS
- MongoDB Atlas or another MongoDB deployment
- A production-ready SMTP or Gmail-compatible mail provider
- A domain or public HTTPS origin if you want working verification links and public endpoints

## 1. Prepare MongoDB

1. Create a MongoDB Atlas cluster or use an existing deployment.
2. Create a database user with connection permissions.
3. Add your deployment IPs to the Atlas network access list.
4. Copy the connection string and store it in your environment variables as `MONGODB_URI`.

## 2. Prepare environment variables

Create a production `.env` file or add the variables in your hosting UI. At minimum:

```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
SESSION_SECRET=replace-with-a-long-random-secret
GMAIL_USER=your-email@example.com
GMAIL_PASS=your-gmail-app-password
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_REJECT_UNAUTHORIZED=true
EMAIL_FROM_NAME=GBR Mobile Storage
EMAIL_FROM_ADDRESS=
COLLEGE_NAME=Aditya College of Institutions
COLLEGE_ADDRESS=Aditya PG College, Ayodhya Nagar, Kakinada, Andhra Pradesh 533437
COLLEGE_PHONE=0884-2346661
PUBLIC_APP_URL=https://your-domain.example
```

Additional optional values may be added based on your deployment, mail provider, and monitoring needs. The repo keeps these in `.env.example` and the app reads them at runtime.
`EMAIL_FROM_ADDRESS` falls back to `GMAIL_USER`; any custom sender address must be authorized with the configured provider.
Leave `SMTP_HOST` empty for Gmail. Use `SMTP_REJECT_UNAUTHORIZED=false` only for a trusted local MailHog/MailDev service that uses a self-signed certificate; keep it `true` in production.

## 3. Build and deploy

For Render:

- Build command: `npm install --legacy-peer-deps`
- Start command: `npm start`
- Node version: `20`
- Health check: `/health` or a similar lightweight endpoint if added in the deployment layer

## 4. Verify the app

After deploy:

1. Open the application URL.
2. Create a test user account.
3. Sign in and verify the dashboard loads.
4. Create a sample record.
5. Confirm the record can be edited, returned, and deleted.
6. Validate password reset and SMTP delivery in the configured environment.

## 5. Production checks

- Keep `SESSION_SECRET` stable across deployments or users will be forced to log in again.
- Use app passwords or SMTP credentials stored in the platform secret manager instead of source control.
- Review server logs when deployment fails, especially database connection and email-delivery errors.
- Rotate credentials if any local `.env` file or debug script exposed them.

## 6. Common deployment issues

### MongoDB connection failures

- Check the Atlas IP whitelist.
- Confirm the connection string is valid.
- Ensure the database user has the correct access privileges.

### Login or session issues

- Confirm `SESSION_SECRET` is set.
- Check that `NODE_ENV` is set appropriately for production.
- Review the app logs for session-store initialization errors.

### Email delivery problems

- Ensure the Gmail account has app-password support enabled.
- Verify the account allows SMTP access from the deployment environment.
- Confirm the `GMAIL_USER` and `GMAIL_PASS` values are not stale.
