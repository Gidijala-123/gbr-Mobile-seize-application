# GBR Mobile Storage Application

A full-stack web application for managing mobile phones collected from students at an educational institution. The system gives authorized staff a central workspace to register stored devices, track their current status, update records, and maintain a searchable operational history.

The project demonstrates practical application development across authentication, server-side rendering, MongoDB persistence, email integration, responsive dashboard design, and browser-based reporting.

## Product Overview

The application replaces a fragmented manual process with a structured digital workflow:

1. Staff members create an account or sign in.
2. A device seizure is recorded with student, parent, employee, device, and incident details.
3. The record is automatically marked `At_office`.
4. Staff can review all records, filter operational views, search by roll number, and edit details.
5. When a device is handed back, staff can transfer it and mark it `Returned`.
6. Tables can be exported or printed for operational reporting.

## Key Functionalities

## Environment Setup

This project expects a `.env` file in the project root with the values below:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
SESSION_SECRET=replace-with-a-long-random-secret
PORT=4444
NODE_ENV=development
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-gmail-app-password-without-spaces
```

Notes:
- `MONGODB_URI` is required for the app and session store to start.
- `SESSION_SECRET` is required in production.
- For Gmail, use a 16-character app password. If you paste it with spaces, the app now strips whitespace automatically for smoother setup.

### Authentication and account access

- Signup flow with email uniqueness enforced through a MongoDB unique index.
- Login validation against stored account records.
- Session-based access control for the main dashboard.
- Logout flow that destroys the active session.
- Forgot-password workflow that generates a temporary seven-character credential and sends it through Gmail SMTP.
- Login visitor logging and error reporting collections for operational traceability.

### Device seizure management

- Structured intake form for recording:
  - Seizure date and time
  - Student name and phone number
  - Roll number
  - College, branch, year, and section
  - Parent name and phone number
  - Employee name, phone number, and employee ID
  - Mobile model, color, and IMEI number
  - Reason for seizure
- Automatic initial status assignment as `At_office`.
- MongoDB-generated record identifiers for traceability.

### Dashboard and record operations

- Dashboard counters for total devices, devices currently at the office, and returned devices.
- Separate operational views for:
  - Overall device list
  - Devices at the office
  - Returned devices
- Status transition action to mark a device as returned using its roll number.
- Search and edit workflow for existing student/device records.
- Server-side update route for modifying captured data.
- Status-aware table styling for quick visual scanning.

### Reporting and usability

- DataTables-powered tables with pagination and interactive data presentation.
- CSV, Excel, PDF, and print export options for device lists.
- Responsive sidebar navigation and mobile-friendly dashboard behavior.
- Help section with operational troubleshooting guidance.
- Staff contact directory organized by program, year, and college.
- Visual feedback for actions such as status changes and password recovery.

## Tech Stack

### Backend

- Node.js
- Express 4
- Pug 3 for server-side HTML rendering
- MongoDB Atlas
- Monk for MongoDB access
- Express Session with a MongoDB-backed session store
- Nodemailer for Gmail SMTP email delivery
- dotenv for environment configuration
- Cryptr for application-level credential encryption

### Frontend

- Pug templates
- AngularJS 1.7 for authentication and password-recovery interactions
- jQuery for browser interactions and AJAX requests
- Bootstrap 3/4 styles and components
- DataTables and DataTables Buttons
- jQuery UI, DC Accordion, NiceScroll, and DLMenu
- jsPDF, pdfMake, JSZip, and DataTables export extensions
- Font Awesome icons and Google Fonts

## Architecture

```text
Browser
  |
  | HTTP requests and AJAX actions
  v
Express application
  |-- Pug views and static assets
  |-- Session middleware
  |-- Authentication and access checks
  |-- CRUD and status-transition routes
  |-- Nodemailer email integration
  v
MongoDB Atlas
  |-- registration_coll
  |-- student_data
  |-- visitors_of_page
  `-- error_reports
```

The application follows a server-rendered MVC-style structure:

- `app.js` configures middleware, sessions, static assets, routes, views, and error handling.
- `routes/index.js` owns authentication, password recovery, dashboard loading, device intake, search, update, status transition, and logout behavior.
- `routes/users.js` contains the default Express users route.
- `views/` contains Pug pages for authentication, password recovery, dashboard operations, and error handling.
- `public/` contains stylesheets, images, fonts, and browser-side libraries/scripts.

## Main Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Render login and signup page |
| `GET` | `/forgot` | Render forgot-password page |
| `POST` | `/postsignup` | Create a user account |
| `POST` | `/postlogin` | Authenticate a user and create a session |
| `POST` | `/postforgot` | Generate and email a temporary credential |
| `GET` | `/home` | Render the authenticated dashboard and device lists |
| `POST` | `/hh` | Register a seized device |
| `POST` | `/change` | Mark a device as returned |
| `POST` | `/edit` | Fetch a record by roll number |
| `POST` | `/update` | Update an existing record |
| `GET` | `/logout` | Destroy the current session |

## Data Model

### `student_data`

Each seizure record stores the following operational fields:

`Date`, `Time`, `sname`, `spno`, `rno`, `clg`, `brch`, `year`, `sec`, `pname`, `ppno`, `ename`, `epno`, `eid`, `rsn`, `mmodel`, `imei`, `mclr`, and `status`.

### Supporting collections

- `registration_coll`: registered staff email and encrypted credential data.
- `visitors_of_page`: login visitor name and visit timestamp.
- `error_reports`: captured signup/login failure details and timestamps.

## Getting Started

### Prerequisites

- Node.js 14+ recommended for this legacy dependency set.
- npm.
- A MongoDB Atlas cluster and database user.
- A Gmail account or SMTP-compatible mail provider for password recovery.

### Installation

```bash
npm install --legacy-peer-deps
```

### Environment variables

Copy `.env.example` to `.env` locally, or add these variables to Render:

```env
MONGODB_URI=mongodb+srv://your-user:your-password@your-cluster/mobile_seize_db
SESSION_SECRET=replace-with-a-long-random-secret
GMAIL_USER=your-email@example.com
GMAIL_PASS=your-app-password
```

Gmail requires an app password when two-step verification is enabled. Never commit real credentials, database connection strings, or app passwords to source control. Rotate any credentials that were previously present in a local or public `.env` file.

### Run locally

```bash
npm start
```

The Express server starts through `bin/www`. Open `http://localhost:4444`, create an account, and sign in to access the dashboard.

## Engineering Highlights

- Designed a complete business workflow around a real operational problem.
- Used asynchronous route handlers and parallel MongoDB queries to load dashboard data efficiently.
- Added database-level uniqueness enforcement for account emails.
- Separated operational records from visitor and error-reporting data.
- Combined server-side rendering with focused AJAX interactions for responsive staff workflows.
- Integrated client-side export formats to support administrative reporting.
- Added defensive error handling around database, authentication, email, and update operations.

### Production Hardening Status

The repository includes the following production hardening:

- MongoDB credentials and session secrets are environment-based.
- New credentials use salted scrypt hashes; legacy encrypted credentials migrate on successful login.
- Passwords are not written to error reports.
- Authenticated data routes enforce session access.
- Sessions use MongoDB persistence through `connect-mongo`.
- Secure, proxy-aware cookies are enabled in production.
- Request body limits and static asset caching are configured.
- Indexes are created for account email, roll number, and device status.
- Unused legacy runtime dependencies were removed.
- `npm audit --omit=dev` reports zero vulnerabilities.

Before production traffic, configure all Render environment variables and test the live MongoDB connection, signup, login, password reset email, dashboard CRUD, and logout flows against the deployed service.

## Portfolio Summary

**GBR Mobile Storage Application** is a full-stack operations platform built with Node.js, Express, Pug, and MongoDB Atlas. It digitizes the end-to-end workflow for recording student mobile-phone storage, monitoring devices held at the office, processing returns, editing records, and generating administrative reports. The project highlights secure-access patterns, server-rendered application design, NoSQL data modeling, email automation, AJAX interactions, and practical dashboard UX.

## License

This project currently uses the repository's existing ISC package license declaration.
