# Mộc Café OS — AWS deployment add-on

This folder adds an **AWS-specific** Docker Compose file and Caddy HTTPS proxy.
It does **not** replace the repository's `docker-compose.yml`, and it does
**not** contain any key, database backup or password.

## 1. Prepare source on Windows

Extract this ZIP **into the root** of `A:\MocCafeOS` so you have:

```
A:\MocCafeOS\docker-compose.aws.yml
A:\MocCafeOS\deploy\Caddyfile
A:\MocCafeOS\deploy\aws.env.template
A:\MocCafeOS\deploy\README-AWS.md
```

In Windows CMD:

```cmd
cd /d A:\MocCafeOS
git status
git add docker-compose.aws.yml deploy/Caddyfile deploy/aws.env.template deploy/README-AWS.md
git diff --cached --stat
git commit -m "deploy: add AWS production compose and Caddy config"
git push origin main
```

Before staging files, ensure `.gitignore` ignores `.secrets/`, `*.pem` and
`.env.aws`. **Never commit secrets**.

## 2. Prepare EC2

- Ubuntu x86_64, Docker Engine and Docker Compose installed.
- Prefer **8 GiB RAM or more** for SQL Server + .NET + frontend on one host.
  A `c7i-flex.large` with ~3.7 GiB system RAM has a meaningful out-of-memory risk.
- Expose only inbound TCP **80 and 443** to the Internet. Permit SSH 22
  only from a trusted client IPv4/32. Do NOT expose SQL Server 1433.
- Use an Elastic IP and a DNS name for stable customer QR links.
- Rotate an SSH private key if it has appeared in screenshots or been shared.

## 3. Pull deployment files and create private environment

On Ubuntu:

```bash
cd ~/cf-manager
git pull --ff-only origin main
ls -l docker-compose.aws.yml deploy/Caddyfile deploy/aws.env.template
cp deploy/aws.env.template .env.aws
chmod 600 .env.aws
openssl rand -hex 32
nano .env.aws
```

Set a unique strong SQL password and a new random JWT secret. The JWT secret
must be at least 32 bytes (64 hex digits is suitable). Keep the file only on
EC2; do not copy it to GitHub or paste it into chats.

For HTTP-only initial testing set `SITE_ADDRESS=:80` and
`PUBLIC_FRONTEND_URL=http://YOUR_PUBLIC_IP`. **Do not log in or process real
orders over HTTP.** When a domain and DNS are ready, set
`SITE_ADDRESS=cafe.example.com` and
`PUBLIC_FRONTEND_URL=https://cafe.example.com` and restart `caddy`/`backend`.

Validate Compose syntax and interpolated environment:

```bash
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml config --quiet
```

**Do not run `docker compose config` without `--quiet` and share its output**:
that output includes resolved passwords.

## 4. IMPORTANT: Real database first

The original `docker-compose.yml` is explicitly for a **fresh demo database**.
The AWS file disables Development-only `EnsureCreated` and seeding. It **will
not silently initialize** a production database. The deployed API requires
an existing schema, such as a safely restored `MocCafeDB` backup whose SQL
Server version is compatible with the destination. Never restore a backup
from a newer SQL Server onto an older version. Verify source SQL version:

```sql
SELECT @@VERSION;
```

On AWS (after adequate RAM is available):

```bash
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d db
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml logs --tail=60 db
```

Take a full SQL Server backup on Windows first, transfer it privately by SCP,
then use `RESTORE FILELISTONLY` to identify the exact logical data/log file
names and `RESTORE DATABASE ... WITH MOVE` to Linux paths. Do NOT use
`WITH REPLACE` by default, do NOT delete the Docker volume, and do not run
`EnsureCreated()` against an already migrated database. Confirm EF migrations
and backup compatibility before enabling production services.

## 5. Start services only after DB restoration

```bash
cd ~/cf-manager
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --build backend frontend caddy
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml ps
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml logs --tail=60 backend
```

`frontend/nginx.conf` already proxies `/api/` and `/hubs/` to `backend:8080`.
Caddy routes public web traffic to that frontend/Nginx container. The API
and SQL Server are not exposed directly to the Internet by this Compose file.

## 6. HTTPS, operations and limitations

Point the DNS A record to your stable EC2/Elastic IP, enable ports 80 and 443,
update the site variables, and recreate the relevant services:

```bash
sudo docker compose --env-file .env.aws -f docker-compose.aws.yml up -d --force-recreate backend caddy
```

Test TLS, login, guest QR URL generation, API calls and SignalR websockets.
Implement independent/off-instance database backups, TLS-only authentication,
monitoring and resource alerts before live use. Banking demo flows are **not**
verified bank settlements. This add-on has been statically validated only;
container builds and runtime behavior must be tested on your EC2.
