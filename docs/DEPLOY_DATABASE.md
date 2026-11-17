# Which database entrance to set on Vercel

Set two environment variables on Vercel. Put the values there only. Do not commit them.

**DATABASE_URL** is what the running app uses. Point it at Supabase's transaction pooler, the entrance on port 6543.

**DIRECT_URL** is what `prisma migrate deploy` uses during the build. Point it at Supabase's session pooler (port 5432) or the direct database entrance. Do not point it at the transaction pooler.

If DIRECT_URL is missing, migrations use DATABASE_URL. Set both, so a build is not trying to migrate through the transaction entrance.

You do not set a pool size for this. Each running copy of the app opens one connection.
