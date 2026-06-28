# Despliegue en el homelab

Stack: Docker Compose + Cloudflare Tunnel. La app corre en un contenedor
(`apigeneral:local`) que publica el puerto host **8088 → 8000**; el túnel de
Cloudflare expone el dominio por HTTPS apuntando a `http://127.0.0.1:8088`.

## 1. Subir el código (Forgejo)

En tu máquina (este repo ya está inicializado y con el commit inicial):

```bash
git remote add origin <REPO_URL>     # p.ej. ssh://git@homelab:2222/erik/apigeneral.git
git push -u origin main
```

## 2. Construir y levantar en el homelab

```bash
git clone <REPO_URL> apigeneral
cd apigeneral

# Crear el archivo de entorno de producción a partir del ejemplo
cp .env.production.example .env.production

# Generar claves fuertes para las escrituras (NO dejar vacías en prod)
echo "INGEST_API_KEY=$(openssl rand -hex 24)" >> .env.production
echo "ADMIN_API_KEY=$(openssl rand -hex 24)" >> .env.production
# (editar .env.production para quitar las líneas vacías duplicadas y, si aplica,
#  poner HOSPITALES_API_KEY)

mkdir -p data
docker compose up -d --build
```

Verificar:

```bash
docker compose ps
curl -s http://127.0.0.1:8088/health
# -> {"ok":true,...,"writes_protected":true,"node_id":"homelab"}
```

## 3. Exponer por Cloudflare Tunnel

> `cloudflared` corre en el host (no hay contenedor cloudflared), así que
> `127.0.0.1:8088` lo alcanza. Si lo movieras a un contenedor, usa la IP del
> host o una red Docker compartida en vez de `127.0.0.1`.

**Opción A — túnel gestionado por archivo (`/etc/cloudflared/config.yml`):**

```yaml
ingress:
  - hostname: <DOMINIO>            # p.ej. datos.tudominio.com
    service: http://127.0.0.1:8088
  - service: http_status:404
```

```bash
cloudflared tunnel route dns <NOMBRE_TUNEL> <DOMINIO>
sudo systemctl restart cloudflared
```

**Opción B — túnel gestionado por dashboard (Zero Trust):**
Networks → Tunnels → tu túnel → *Public Hostname* → Add:
`<DOMINIO>` → tipo HTTP → URL `127.0.0.1:8088`.

Acceso final: `https://<DOMINIO>`

## 4. Actualizaciones

```bash
cd apigeneral
git pull
docker compose up -d --build      # reconstruye y reinicia; el índice persiste en ./data
```

## Notas

- **Persistencia:** el índice SQLite vive en `./data/index.db` (volumen `./data:/data`).
  Respáldalo si importa. WAL activado; el FS del homelab soporta locking de `-wal`.
- **Seguridad:** las escrituras son fail-closed. Si `INGEST_API_KEY`/`ADMIN_API_KEY`
  quedan vacías, `/api/ingest` y `/api/sources/.../sync` responden 503. No uses
  `ALLOW_OPEN_WRITES` en producción.
- **Federación:** desactivada por defecto. Para que este nodo jale de peers,
  pon `FEDERATION_PULL_ENABLED=1` y registra peers vía `POST /api/peers`.
- **Logs:** `docker compose logs -f apigeneral` (o `container_logs` por el MCP).
