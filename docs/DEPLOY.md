# Hosting CareerOS (free)

CareerOS runs on **Vercel Hobby** (free, made by the Next.js team) with the **Neon free** database you already use.
Every merge to `main` redeploys automatically. Nothing here needs a card.

## Limits that matter (checked 2026-10-23)

| | Free limit | CareerOS |
|---|---|---|
| Function size | 250 MB | largest function ≈ 24 MB (the local embedding model is left out, see below) |
| Function time | 300 s per request | search steps ≤ 15 s; Fit Report and search routes set 60 s; CV upload stays well under 300 s |
| Disk | read-only (only `/tmp` is writable) | nothing is written to disk; files live in Postgres |
| Use | personal, non-commercial | a personal tool |

**Embeddings online:** the local model (`transformers.js` + `onnxruntime-node`, ~300 MB) can't fit in a hosted function,
so `next.config.ts` leaves it out of the bundle and the hosted app uses the same model on Cloudflare
(`EMBEDDING_PROVIDERS=cloudflare`). Vectors stay comparable with the ones made locally.

**Database:** the hosted app uses the same Neon database as `npm run dev`, so your profile, jobs and applications are
the same in both. Schema changes (new migrations) must be applied once with `npm run db:deploy` before the code that
needs them is merged; CareerOS doesn't run migrations during a deploy. Use the direct connection string (the one in
`.env`): a single user needs only a few connections, and it avoids pooler limits on the transactions the app uses.

## One-time setup (you do this; Claude never handles your keys or logins)

1. **Vercel account:** go to <https://vercel.com/signup>, choose **Hobby**, and sign up with **GitHub**.
2. **Import the repository:** **Add New… → Project → Import** `SagarGYadav/careeros`. When GitHub asks which
   repositories Vercel may see, choose **Only select repositories → careeros**.
3. **Settings on the import screen:** framework **Next.js** (detected), root directory `./`, build and install commands
   left as they are (`npm install` runs `prisma generate`, then `next build`).
4. **Environment variables:** open **Environment Variables**, click in the first key box and paste the whole contents of
   your local `.env` (Vercel splits it into variables). Then change these before deploying:

   | Variable | Hosted value | Why |
   |---|---|---|
   | `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` (fill in after step 5) | sign-in cookies and links use the public address |
   | `BETTER_AUTH_SECRET` | a new random value: run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | keep the hosted sessions separate from local ones |
   | `ALLOW_SIGNUP` | `false` | the site is public: nobody else can create an account and use your AI and search quotas. Your account already exists in the shared database. |
   | `EMBEDDING_PROVIDERS` | `cloudflare` | the local model isn't deployed |
   | `DATABASE_URL_TEST` | delete it | tests never run on Vercel |

   Keep everything else as in `.env` (AI, job search, web search and Cloudflare keys, `DEEP_SEARCH_ENABLED`, …).
5. **Deploy.** When it finishes, copy the production address from the project page (e.g.
   `https://careeros-sagar.vercel.app`), set `BETTER_AUTH_URL` to it under **Settings → Environment Variables**, then
   **Deployments → ⋯ → Redeploy**.
6. Open the address and sign in with your usual email and password.

## After that

- Merging to `main` deploys to the same address within a few minutes. Pull requests get their own preview address;
  sign-in only works on the production address (that's what `BETTER_AUTH_URL` allows).
- Changed a key? Update it under **Settings → Environment Variables** and redeploy.
- Something broken only online? **Deployments → the deployment → Logs** shows server errors (CareerOS never logs your
  personal details or keys).
