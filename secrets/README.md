# Repo-Based Secrets

This directory can hold encrypted secrets that are safe to commit. Do not commit
plaintext `.env` files.

## Tool

Use `age`:

```bash
brew install age
```

## Collaborator Flow

The collaborator creates a private identity and sends only the public key:

```bash
scripts/secrets/generate-age-identity.sh
```

That command prints a public key starting with `age1...`. Add that public key to
`secrets/age-recipients.txt` and commit it.

## Owner Flow

After recipients are added, encrypt the production admin API env:

```bash
scripts/secrets/encrypt-cyprus-env.sh
git add secrets/age-recipients.txt secrets/cyprus.production.env.age
git commit -m "Add encrypted Cyprus production env"
git push origin dev
```

The encrypted file can be committed because it can only be decrypted by the
private keys matching the public recipients.

## Collaborator Decrypt

After pulling the repo:

```bash
scripts/secrets/decrypt-cyprus-env.sh
set -a
. ./.env.production.local
set +a
curl -s https://aegist.dev/admin/api/tables \
  -H "Authorization: Bearer $DATA_API_KEY"
```

`.env.production.local` is ignored by git.
