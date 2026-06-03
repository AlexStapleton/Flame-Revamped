# Publishing the image to Docker Hub

This repo includes a GitHub Actions workflow
([`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml))
that builds the `linux/amd64` image from [`.docker/Dockerfile`](../.docker/Dockerfile)
and pushes it to Docker Hub. Do the one-time setup below, then publishing is just
pushing a git tag.

The published image will be: `docker.io/<your-username>/flame-revamped`.

---

## One-time setup

### 1. Create the Docker Hub repository
1. Sign in at https://hub.docker.com.
2. **Repositories → Create repository.**
3. Name it **`flame-revamped`** (must match `IMAGE_NAME` in the workflow — change
   one to match the other if you prefer a different name).
4. Set visibility to **Public** so anyone can `docker pull` it. (Private also works,
   but pullers must `docker login`.)

### 2. Create a Docker Hub access token
1. **Account Settings → Security → Personal access tokens → Generate new token.**
2. Description: `github-actions`, permissions: **Read, Write, Delete**.
3. Copy the token now — you can't see it again.

### 3. Add the credentials as GitHub repository secrets
In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret.**
Add both:

| Secret name | Value |
|-------------|-------|
| `DOCKERHUB_USERNAME` | your Docker Hub username |
| `DOCKERHUB_TOKEN` | the access token from step 2 |

---

## Publishing a release

Tag a commit and push the tag — the workflow does the rest:

```sh
git tag v1.0.0
git push origin v1.0.0
```

That publishes three tags to Docker Hub:
- `<username>/flame-revamped:1.0.0`
- `<username>/flame-revamped:1.0`
- `<username>/flame-revamped:latest`

You can also trigger it by hand: **Actions → "Build and publish Docker image" →
Run workflow** (lets you type the tag, default `latest`).

---

## Pulling and running

```sh
docker pull <username>/flame-revamped:latest

docker run -d \
  --name flame \
  -p 5005:5005 \
  -v /path/to/host/data:/app/data \
  -e PASSWORD='choose-a-strong-password' \
  --restart unless-stopped \
  <username>/flame-revamped:latest
```

Or with compose — see [`.docker/docker-compose.yml`](../.docker/docker-compose.yml)
and set `image:` to `<username>/flame-revamped:latest`.

> **Set a strong `PASSWORD`.** The app refuses to start with no password and warns
> on the old default `flame_password`. The `data` volume must be persistent so the
> auto-generated `data/secret.key` (JWT signing key) survives restarts.

---

## Manual build & push (no GitHub Actions)

If you'd rather build locally (needs Docker with buildx, logged in via
`docker login`):

```sh
docker buildx build \
  --platform linux/amd64 \
  -f .docker/Dockerfile \
  -t <username>/flame-revamped:latest \
  --push .
```

---

## Notes
- The build context excludes `node_modules`, `data`, `.env`, and build output via
  [`.dockerignore`](../.dockerignore), so no secrets or local state are baked in.
- The image runs as the non-root `node` user and sets `NODE_ENV=production`.
- To add ARM support later, switch the workflow's `file:` to
  `.docker/Dockerfile.multiarch` and set
  `platforms: linux/amd64,linux/arm64` (slower builds via emulation).
