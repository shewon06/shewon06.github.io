# PRIME HR NEXT LEVEL

Cloud-first HR management platform for PRIME Agri Business & Plantations (Pvt.) Ltd.

This repository contains a cloud-connected FIRST RELEASE of an HR application. GitHub Pages serves the web interface. Supabase Auth/Postgres holds the actual employee data. All business records are protected by Row Level Security; no staff data is stored in this public repo.

## Implemented
- Responsive online HR interface
- Account registration and email/password login
- Administrator approval and employee / HR / admin roles
- Employee directory with create, edit, search and CSV export
- Attendance via database server-timestamp check-in/out
- Leave requests and HR approval/rejection
- Recruitment candidates and pipeline
- Live dashboard scoped by server-level permissions
- Branch master data seeded with general company locations

## Planned (NOT implemented)
- Compliant payroll, EPF/ETF/APIT, bank files and payslips
- Bulk appointment letters, document workflows and signatures
- Monthly performance, KPIs and sales hierarchies
- GPS/biometric attendance, native phone app, asset tracking
- Full production test suite, security audit, backups and retention review

IMPORTANT: Do NOT import sensitive employee records, salaries, identity documents or bank details until account setup, permissions tests, backups, and policy/compliance review are completed.

## GitHub source
https://github.com/shewon06/shewon06.github.io/tree/main/prime-hr-next-level

Source files: index.html, styles.css, app.js, config.js, schema.sql. The new folder does not replace any existing project files.

## Supabase setup
1. Create a Supabase project OWNED by your organisation: https://supabase.com
2. Open Supabase SQL Editor. Paste and execute the complete contents of schema.sql. Verify all tables, triggers, policies and functions exist.
3. In Authentication > Providers > Email, enable email/password registration and email confirmation. Configure company-approved SMTP and MFA for administrators.
4. Copy the PROJECT URL and PUBLISHABLE key from your Supabase project settings. The publishable/anon key is public by design when RLS is configured correctly; NEVER use a secret or service_role key in the browser.
5. Edit config.js on GitHub and replace both REPLACE_WITH... placeholders with the URL and PUBLISHABLE key.
6. In Authentication > URL Configuration, set the actual website Site URL and its full application path under Redirect URLs as applicable.

## First admin
1. Open the website and choose Request an account. Register with the intended administrator's email and confirm it.
2. In Supabase SQL Editor, execute this SQL using the administrator's actual verified email:

    UPDATE public.profiles
    SET role='admin', is_active=true
    WHERE email=lower('YOUR_REAL_ADMIN_EMAIL@example.com');

3. Sign out and sign in again. The User access panel will become available.
4. All subsequent signup accounts are INACTIVE until an administrator explicitly approves them.
5. HR creates an Employee Directory record with exactly the same email as the signup so attendance and leave can link to the correct user.

## Publishing with GitHub Pages
The target repository is shewon06/shewon06.github.io. It has a custom-domain CNAME pointing to wonsolutions.me. When GitHub Pages is enabled for branch main, folder /(root), the expected application path is:
https://wonsolutions.me/prime-hr-next-level/

If Pages is not enabled, visit GitHub repository > Settings > Pages > Build and deployment > Deploy from a branch > main > /(root) > Save. Verify the real published URL shown in Settings > Pages. Uploading code alone does not prove that the live website is published.

GitHub Pages only hosts the web UI. Real authentication and database storage require Supabase; this system will show a setup screen until the keys are configured.

## Security & operational notes
- NEVER commit authentic HR records, NIC numbers, passwords, employee documents, pay slips, bank information or private keys to public source control.
- Registered accounts start with inactive employee role; only admin can approve or set roles.
- HR access and employee ownership are checked in PostgreSQL RLS policies, not merely hidden in the UI.
- Only database RPC writes attendance using server time, but this does NOT verify the person's physical location.
- Employee self-service requires a linked active employee record; HR accounts that have no employee record cannot check in.
- Leave approvals are restricted to HR roles; no statutory leave-balance engine is implemented.
- Test all policies using at least two separate employee test accounts and a third HR account before importing real data.
- Obtain required staff privacy notices and company approvals before deploying data processing, and configure backups, audit trails, retention and MFA.
- Test salary/payroll rules with competent local accountants before implementing payroll.

## Next development phases
Phase 2: Company-approved letters, bulk upload, onboarding, staff file vault, audit log.
Phase 3: EPF, ETF, APIT, monthly payroll, allowances and banking/pay slip controls.
Phase 4: Zonal hierarchy, sales performance KPIs, asset register and mobile/PWA support.
