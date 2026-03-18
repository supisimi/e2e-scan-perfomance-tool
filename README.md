# E2E Testing Scan Performance

Desktop-first, static React application for scan-workflow test execution, timing analysis, and local reporting.

## What This App Does

- Create and manage test sessions with metadata and notes
- Run fixed `multi-range-v1` guided workflow
- Capture scanner input and manual fallback input
- Persist sessions and full event logs in IndexedDB (no backend)
- Compute live workflow metrics (`short4`, `mixed`, `long4`, `mid4`, `fullCycle`)
- Export per-session artifacts (JSON, CSV, PDF summary)
- Visualize performance and invalid scans in dashboard charts

## Technology Stack

- React 18 + TypeScript + Vite
- React Router (`HashRouter`-compatible setup for GitHub Pages)
- IndexedDB via `idb`
- Recharts for dashboard charts
- jsPDF/html2canvas for report export

## Project Structure (High Level)

```text
src/
├── app/                  # app shell + router
├── data/                 # db schema, repositories, hooks
├── features/
│   ├── dashboard/        # metrics dashboard + filters/charts
│   ├── sessions/         # create/edit/detail session pages
│   ├── workflow/         # guided workflow runner
│   ├── reports/          # JSON/CSV/PDF export services
│   ├── passcodeGate/     # lightweight client-side gate (isolated)
│   └── captures/         # legacy capture page
├── lib/                  # workflow definitions, metrics, barcode classifier
├── shared/               # styles, reusable UI state components, shared types
└── types/                # domain models
```

## Local Development

1. Install Node.js 20+.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Optional lock screen (casual UI lock only):

   - Copy `.env.example` to `.env`
   - Set:

   ```bash
   VITE_APP_PASSCODE=your-passcode
   ```

4. Start dev server:

   ```bash
   npm run dev
   ```

## Build, Validate, and Preview

```bash
npm run lint
npm run build
npm run preview
```

Build now also prepares GitHub Pages artifacts:

- `dist/404.html` (copied from `index.html`)
- `dist/.nojekyll`

## Demo Data (For Testing)

- Open the Dashboard.
- Use `Seed Demo Data` to quickly generate sample sessions.
- Use `Reset and Seed Demo` to replace existing local sessions with fresh demo data.

## GitHub Pages Deployment

Repository target:

- `https://github.com/workaroundgmbh/e2e_testing_scan_performance`

One-time GitHub setup:

1. Repository Settings → Pages
2. Source: `Deploy from a branch`
3. Branch: `gh-pages`
4. Folder: `/ (root)`

Deploy command:

```bash
npm run deploy
```

This runs:

1. `npm run build`
2. Pages artifact preparation (`404.html`, `.nojekyll`)
3. publish `dist/` to `gh-pages`

## Accessibility and UX Notes

- Consistent loading/error/empty state components in key pages
- Table captions and ARIA labels for data tables
- Keyboard-visible focus styles for interactive controls
- `aria-live` status feedback in workflow and lock-screen interactions

## Security Note (Important)

The passcode gate is intentionally lightweight and **not real authentication/security**.
It only reduces casual access in a static client-side deployment.

## Deployment Checklist

See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for a step-by-step publish checklist.
