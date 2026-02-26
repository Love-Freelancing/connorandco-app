# Encrypted Railway environment variables

This folder supports storing Railway environment variables in an encrypted YAML file.

## Files

- `services.template.yaml`: non-secret template
- `services.enc.yaml`: encrypted secret file (commit this)

## One-time setup

1. Install `age` and `sops` locally (macOS):

   ```bash
   brew install age sops
   ```

2. Generate an age key pair:

   ```bash
   mkdir -p ~/.config/sops/age
   age-keygen -o ~/.config/sops/age/keys.txt
   ```

3. Copy the public key (`age1...`) into `.sops.yaml` by replacing `REPLACE_WITH_YOUR_AGE_PUBLIC_KEY`.
4. Add the private key content to GitHub secret `SOPS_AGE_KEY`.

## Create encrypted secrets file

```bash
cp ops/secrets/services.template.yaml ops/secrets/services.yaml
# fill real secret values in services.yaml
sops --encrypt --input-type yaml --output-type yaml ops/secrets/services.yaml > ops/secrets/services.enc.yaml
rm ops/secrets/services.yaml
```

## Update encrypted file later

```bash
sops ops/secrets/services.enc.yaml
```

CI decrypts `services.enc.yaml` and syncs variables into Railway before deploy.
