# CineHub

Movies & shows app for **Android phones and Android TV** (one APK).

- Email sign-up / sign-in with **Supabase**, user profiles
- **Admin panel** inside the app: add your provider sources; users only ever see
  your labels ("Server 1", "Server 2" …) – never the provider names
- Netflix-style animated sign-in / sign-up, full D-pad support for TV
- No in-app update check or update notifications

## 1. Supabase (once)

1. Dashboard → **SQL Editor** → paste `supabase/schema.sql` → **Run**
2. Dashboard → **Authentication → Providers → Email**: enabled.
   (Optional: turn **Confirm email** off if you want instant sign-in after sign-up.)
3. Open the app, **sign up with your email**.
4. Back in SQL Editor, make yourself admin:

   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_EMAIL@example.com';
   ```
5. Re-open the app → **Settings → Account → Admin Panel** → *Add server*.

The project URL and **publishable** key are already set in `app.config.js`
(override with `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` env vars). Never put the
`service_role` / secret key in the app.

## 2. Build the APK (GitHub Actions)

```bash
unzip cinehub-app.zip && cd cinehub-app
npm install                      # also creates package-lock.json with the new deps
git init && git add . && git commit -m "CineHub"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then GitHub → **Actions → Build CineHub APK → Run workflow**.
The APK appears under the run's **Artifacts** and under **Releases**.

### Keep the same signing key (so updates install over old versions)

```bash
keytool -genkeypair -v -keystore cinehub.keystore -alias cinehub \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 cinehub.keystore        # copy the output
```
Repo → Settings → Secrets and variables → Actions → add:
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` (cinehub), `KEY_PASSWORD`.
Keep `cinehub.keystore` safe and never commit it.

## 3. Local dev

```bash
npm install
npm run android        # phone
npm run android:tv     # Android TV
```

## License

See `LICENSE` / `NOTICE` — the upstream code is under the PolyForm Noncommercial
License. Keep those files with the source.
