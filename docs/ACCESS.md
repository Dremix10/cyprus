# Access

## Production Admin/Data API

- Domain: `https://aegist.dev`
- Header: `Authorization: Bearer $DATA_API_KEY`
- Server source of truth: `/home/dev/cyprus/.env` on the production droplet
- Repo secret path after setup: `secrets/cyprus.production.env.age`

The current `DATA_API_KEY` value is not stored in plaintext git. If API calls
return `401 Unauthorized`, the local value is probably missing or stale.

## Collaborator Setup

1. Install `age`:

   ```bash
   brew install age
   ```

2. Generate a private identity and send the printed public key to the repo
   owner:

   ```bash
   scripts/secrets/generate-age-identity.sh
   ```

3. After the owner commits `secrets/cyprus.production.env.age`, decrypt it:

   ```bash
   scripts/secrets/decrypt-cyprus-env.sh
   set -a
   . ./.env.production.local
   set +a
   ```

4. Test it:

   ```bash
   curl -s https://aegist.dev/admin/api/tables \
     -H "Authorization: Bearer $DATA_API_KEY"
   ```

## Owner Setup

1. Add the collaborator's `age1...` public key to
   `secrets/age-recipients.txt`.
2. Encrypt the current production key into the repo:

   ```bash
   scripts/secrets/encrypt-cyprus-env.sh
   git add secrets/age-recipients.txt secrets/cyprus.production.env.age
   git commit -m "Add encrypted Cyprus production env"
   git push origin dev
   ```

Only the encrypted file should be committed. `.env.production.local` and other
plaintext env files are ignored.

Do not paste the token into project docs, GitHub comments, issue threads, or
plain chat. Rotate it if it appears anywhere public or semi-public.
