# Morpheus API Atlas

Learn-by-doing lab for the **HPE Morpheus Data API (v9.0)** — 1,004 endpoints indexed, 11 guided missions,
runnable straight from the browser against your own appliance.

> Set your appliance URL + token once. Every command on every page rewrites itself with your values.
> Read-only calls run instantly; anything that changes state shows the payload and asks you to confirm.

---

## Quick start (Docker)

```bash
# 1. build
docker build -t morpheus-api-atlas:latest .

# 2. run
docker run -d --name atlas -p 2222:2222 --restart unless-stopped morpheus-api-atlas:latest

# 3. open
http://localhost:2222
```

The container must be on a network that can **reach your Morpheus appliance** (LAN/DMZ). Nothing else is required —
no database, no config files, no dependencies.

### Multi-arch build with buildx (amd64 + arm64)

```bash
# one-time builder setup
docker buildx create --name atlasbuilder --use

# build for both architectures and push to your registry
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/<your-user>/morpheus-api-atlas:latest \
  --push .

# or build for the local machine only and load into the local daemon
docker buildx build --platform linux/amd64 -t morpheus-api-atlas:latest --load .
```

### Docker Compose

```bash
docker compose up -d --build
```

### Useful runtime options

```bash
# change the listen port (container side)
docker run -d -p 8080:8080 -e PORT=8080 morpheus-api-atlas

# pin the relay so it can ONLY talk to one Morpheus appliance (recommended for shared deployments)
docker run -d -p 2222:2222 -e ALLOWED_HOST=morpheus.yourco.com morpheus-api-atlas
```

---

## Kubernetes

Manifests are in [`k8s/`](k8s/) — namespace, deployment (non-root, read-only FS, probes), service, and an
nginx-class ingress preconfigured for `morpheusatlas.init0xff.com` (edit the host for your domain).

```bash
# build & push the image first (see buildx above), update image: in k8s/deployment.yaml, then:
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/ingress.yaml

kubectl -n atlas get pods,ingress
```

TLS: uncomment the `cert-manager` annotation and `tls:` block in `k8s/ingress.yaml` if you run cert-manager.

---

## How execute-from-browser works (the relay)

Browsers can't call Morpheus directly (Morpheus sends no CORS headers), so the Atlas container relays:

```
Browser UI ──POST /run──> Atlas container ──HTTPS──> Morpheus appliance
```

Relay properties:
- Forwards **only `/api/*` paths**, only GET / POST / PUT / DELETE, only `http`/`https` base URLs, 30 s timeout.
- Requests to link-local / cloud-metadata addresses (169.254.x.x, metadata.google.internal) are blocked.
- Accepts self-signed appliance certificates.
- The bearer token is passed through **per request** — never stored, never logged server-side.
- Optional `ALLOWED_HOST` env var pins the relay to a single appliance hostname — **strongly recommended**
  for any shared deployment, since an unpinned relay can reach other hosts on its network.

**Deployment guidance:** intended for lab / internal / DMZ use. Anyone who can reach the Atlas port can relay
API calls *using their own token* — do not expose it to the internet without an auth layer in front
(ingress basic-auth, OAuth proxy, or network policy).

---

## Features

- **Environment panel** — `$BASE_URL` + `$TOKEN` once; live substitution everywhere; token maskable on screen while Copy still copies the real value. **Profiles**: save/load named environments (token excluded unless you opt in), export/import as JSON.
- **Run buttons** — output in a side panel with status pill (401/403/404/422 explained in plain English), latency, pretty JSON.
- **Pickers** — lookup steps render clickable, filterable rows (built for 100+ groups/zones); clicking captures the variable. Create responses auto-capture IDs.
- **Confirm gate** — POST/PUT/DELETE show the fully-resolved payload (editable) before executing.
- **Run history** — every call this session: status, latency, view body, one-click re-run.
- **Cleanup tracker** — every resource Atlas creates is listed with a one-click (confirmed) DELETE. No more littered labs.
- **Multi-language commands** — every runnable step shows curl / Python / PowerShell / Ansible tabs.
- **Mission export** — download any mission as a Postman collection (token left blank) or a bash script (reads `MORPHEUS_TOKEN` from env).
- **11 guided missions** — auth, provisioning, approvals, MKS + kubeconfig, scheduled automation, ServiceNow approvals, tenant RBAC, instance lifecycle, troubleshooting, quotas, workflows + Cypher.
- **References** — API patterns cheat-sheet, UI-click → API-call map (~60 rows), and all 1,004 endpoints browsable/searchable with real methods and copyable commands.

---

## Security & committing this repo

- The codebase contains **no credentials**. Tokens exist only in the user's browser (and optionally in browser-local
  profiles on their machine) and transit only through the relay to the appliance.
- `.gitignore` excludes env files, keys, exported profile JSONs, and packaging artifacts — safe to publish as-is.
- Exported Postman collections deliberately leave the `TOKEN` variable blank; exported bash scripts read
  `MORPHEUS_TOKEN` from the environment instead of embedding it.

## Project structure

```
server.js              static file server + /run relay (zero dependencies)
Dockerfile             node:20-alpine, non-root friendly, ~55 MB image
docker-compose.yml
k8s/                   namespace, deployment, service, ingress (morpheusatlas.init0xff.com)
app/index.html         UI shell + design system
app/missions.js        mission content
app/app.js             engine: router, env, runner, pickers, history, exports
app/data/endpoints.js  parsed API data (1,004 endpoints)
parse.py               regenerate endpoints data from a fresh apidocs scrape
```

## Regenerating the endpoint data

```bash
# point SRC in parse.py at a fresh scrape of apidocs.morpheusdata.com, then:
python3 parse.py     # writes app/data/endpoints.json
python3 - <<'PY'
import json; d=json.load(open('app/data/endpoints.json'))
open('app/data/endpoints.js','w').write('window.ATLAS_DATA='+json.dumps(d,separators=(",",":"))+';')
PY
```
