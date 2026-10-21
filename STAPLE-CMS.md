# HYS Flanges CMS integration

This repository's local folder is still named `kaijin`; its GitHub repository is `Staple-LLC/hysflanges`.

## What can be edited

- Homepage headings, introductory text, buttons, slideshow and search metadata.
- About us text and images.
- Product and catalogue landing pages plus shared product categories.
- Flange products and fitting products: add, remove, reorder and edit products, descriptions, images and specification rows. Items marked private are excluded from publication. These collections render on the existing category pages; they do not create individual product URLs.
- Flange catalogue headings and technical diagram images.
- Fittings technical sheets: add, remove, reorder and edit titles and HTTPS PDF links. The build updates the embedded PDF viewer and download link together. PDFs can be dragged into the document field or chosen with the file picker (up to 10 MB). Uploads stay private until publishing. Existing HTTPS PDF links remain supported. Video files still use HTTPS links.
- Company and distributor information, telephone, fax, emails, enquiry-form email recipient and distributor website. Shared details update the footer and contact page together. Changing the distributor website regenerates its QR code.
- Contact page headings and introduction.
- Videos page headings, poster image and HTTPS MP4 video URL.

There is no Blog collection because the current website has no blog. Navigation and design changes still require development. Old removed-product URLs remain redirect pages.

## How publishing works

1. The CMS stores drafts in Supabase. Changes are private until publishing.
2. Java captures a validated snapshot and commits only `src/cms/website-content.json` through the Staple CMS Publisher GitHub App.
3. Vercel runs `npm run build`.
4. `scripts/cms-build.mjs` copies the existing `dist/` templates/assets into ignored `site/`, then applies the published content to the ten active HTML pages.
5. Vercel deploys `site/`; Java checks the matching production deployment before reporting success.

The existing `dist/` folder is the checked-in template source for this static copy. Do not replace it with generated output. Missing CMS sections fall back to the imported source; explicit empty collections stay empty. Imported initial content renders the original ten HTML pages byte for byte. Uploaded images resolve to the existing CMS public-media bucket after the publishing worker promotes them. No database keys or live API requests are used by the public website.

## Initial rollout

Migration `202610220001_pdf_media.sql` adds typed PDF upload support without replacing saved catalogue content. Migration `202610210007_hys_content.sql` registers twelve content sections and an immutable initial baseline. It preserves pre-existing entries and subscriptions. If no subscription exists it grants a thirty-day `onboarding_trial`; no payment is collected. The development billing bypass stays disabled.

The source integration must be committed and pushed once before verifying the publishing connection. Review the changes, then deploy them through the normal Git workflow. `vercel.json` sets `buildCommand` to `npm run build` and `outputDirectory` to `site`. Check that the deployed project uses these repository settings.

After the source commit is on `main`, sign in to Staple CMS as the platform administrator, choose Administration → Publishing → HYS Flanges, enter the values in `cms-connection.json`, and click **Verify and connect**. Java checks repository access, website ID and the initial content baseline. This check must not be bypassed by writing an unverified baseline directly to the database.

The connection details are non-secret:

- GitHub: `Staple-LLC/hysflanges`, branch `main`
- Managed file: `src/cms/website-content.json`
- GitHub App installation: `173725116`
- Vercel project: `prj_1NhA9ASHxXidnYeO7X7VgqXQUbGY`
- Vercel team: `team_p2NKzC3lkpIHKlcJ8XaltcvR`

## Development and verification

```sh
npm install
npm run test:cms
npm run build
npm run dev
```

Vite builds and serves `site/` on startup. Restart the development server after changing the CMS JSON. HLS segment serving is preserved. Keep `cms-onboarding.json`, `src/cms/bindings.json` and `src/cms/asset-manifest.json` under version control: they describe the schema, rendering bindings and imported images. Changes to template structure should update bindings and their regression tests together.

Tests cover initial visual-markup preservation, safe text rendering, shared details, product additions and specifications, private/empty collections, PDF viewer/download synchronization, media ownership, video replacement, form recipient, QR regeneration and legacy redirects.
