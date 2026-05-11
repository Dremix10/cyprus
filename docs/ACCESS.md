# Access

## Production Admin/Data API

- Domain: `https://aegist.dev`
- Header: `Authorization: Bearer $DATA_API_KEY`
- Server source of truth: `/home/dev/cyprus/.env` on the production droplet
- Secret-manager item: `Cyprus production DATA_API_KEY`

The current `DATA_API_KEY` value is not stored in git. If API calls return
`401 Unauthorized`, the local value is probably missing or stale.

## Collaborator Setup

1. Get the current value from the shared 1Password item
   `Cyprus production DATA_API_KEY`.
2. Set it in the local shell that runs admin/API scripts:

   ```bash
   export DATA_API_KEY="value-from-1password"
   ```

3. Test it:

   ```bash
   curl -s https://aegist.dev/admin/api/tables \
     -H "Authorization: Bearer $DATA_API_KEY"
   ```

Do not paste the token into project docs, GitHub comments, issue threads, or
plain chat. Rotate it if it appears anywhere public or semi-public.
