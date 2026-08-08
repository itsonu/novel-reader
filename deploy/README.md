# Enabling the GitHub Pages deploy

`pages.yml` lives here instead of `.github/workflows/` only because the token used for
the first push lacked the `workflow` OAuth scope. To activate it:

```bash
gh auth refresh -h github.com -s workflow      # opens a browser, one time
mkdir -p .github/workflows
git mv deploy/pages.yml .github/workflows/pages.yml
git commit -m "ci: enable GitHub Pages deploy"
git push
```

Then in **Settings → Pages**, set **Source: GitHub Actions**, and add these repo
*variables* (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `SITE_URL` | `https://itsonu.github.io/novel-reader` |
| `BASE_PATH` | `/novel-reader` |
| `SUPABASE_URL` | optional — set to prerender your public catalogue |
| `SUPABASE_ANON_KEY` | optional, same |
