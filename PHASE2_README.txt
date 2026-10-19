THE BADDIES BOOKSHELF 2.0 — PHASE 2

1. Back up your site or create a Git branch.
2. Copy the HTML files into the website root, js/* into its js/ folder, css/* into its css/ folder. Do NOT replace home.html, library.html, js/script.js or any existing assets.
3. Supabase Authentication > URL Configuration: set Site URL to your Netlify production URL. Add allowed Redirect URLs for https://YOUR-SITE.netlify.app/login.html and https://YOUR-SITE.netlify.app/update-password.html (plus custom domain equivalents). Configure email confirmation and SMTP as needed.
4. Deploy to a private preview/staging site first. Open /login.html. Test the two existing admin accounts, member signup, email confirmation, pending status, admin approval, rejection, sign out, and password recovery.
5. The existing SQL's RLS profile SELECT policy exposes all profile columns to approved members. Before collecting private profile information or launching social features, replace it with field-safe public profile views and privacy-specific RLS. This is NOT ready for public launch yet.
6. The SQL's security-definer helper functions should be reviewed/hardened, with EXECUTE grants restricted appropriately. Confirm admin-only update and role-assignment protections in a separate test user session.
7. No navigation edits were made to the existing site. Add a login link only after staging tests pass.
8. The registration trigger must exist from Phase 1. Confirm email-confirmation redirect allowlist. Never put service-role or secret keys in browser files.
