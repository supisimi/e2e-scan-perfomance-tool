# GitHub Pages Deployment Checklist

## Preflight

- [ ] Pull latest `main`
- [ ] Verify Node.js 20+ is available
- [ ] Verify dependencies installed (`npm install`)
- [ ] Optional: confirm `.env` values needed for production

## Quality Gates

- [ ] Run lint: `npm run lint`
- [ ] Run production build: `npm run build`
- [ ] Confirm `dist/` contains:
  - [ ] `index.html`
  - [ ] `404.html`
  - [ ] `.nojekyll`

## GitHub Pages Configuration (One-time or verify)

- [ ] Repository Settings → Pages
- [ ] Source = Deploy from a branch
- [ ] Branch = `gh-pages`
- [ ] Folder = `/ (root)`

## Deploy

- [ ] Run deploy: `npm run deploy`
- [ ] Wait for deploy command to finish successfully
- [ ] Open Pages URL and verify app loads

## Post-Deploy Smoke Test

- [ ] Dashboard loads without console/runtime errors
- [ ] New Session form saves successfully
- [ ] Runner opens and records scans
- [ ] Session detail page opens and export buttons work
- [ ] Refreshing/reopening still works (HashRouter pathing)

## Rollback Option

- [ ] If deploy is broken, redeploy the previous known-good commit to `gh-pages`
