# Docker image CVE review (v1.8.1 → Alpine runtime)

Date: 2026-10-10. Docker Hub listed a large number of CVEs on
`alexstapo/flame-revamped:1.8.1`. This note records what they were, which of
them Flame can actually reach, what was changed, and what is left.

## How the image was scanned

- Scanner: trivy 0.69.3 (checksum verified against the release), vulnerability
  scanner only, `linux/amd64` platform.
- Image: `alexstapo/flame-revamped:1.8.1`, amd64 digest
  `sha256:f06ee5d96c54…`, built 2026-10-10 from `.docker/Dockerfile.multiarch`
  on `node:24-bookworm-slim` (Debian 12.15).
- Docker Hub's own scanner (Docker Scout) uses a different database, so its
  exact counts can differ a little. The sources are the same.

## What the v1.8.1 scan found

370 findings (one per package and CVE), 182 unique CVE IDs.

| Source | Critical | High | Medium | Low | Unknown | Fix available upstream |
|---|---|---|---|---|---|---|
| Debian 12 OS packages (base image) | 5 | 25 | 67 | 67 | 4 | 13 findings, all in `perl-base` |
| npm, bundled inside the Node image | 0 | 8 | 12 | 1 | 0 | 20 of 21 |
| Flame's own dependencies (`/app/node_modules`) | 0 | 0 | 0 | 0 | 0 | n/a |

(Counts are unique CVE IDs per row.)

### Debian 12 OS packages

Of 349 OS findings, Debian has a fix for only 13 (`perl-base`). The rest are
marked `affected` (247), `fix_deferred` (72) or `will_not_fix` (17), so
`apt-get upgrade` could not have cleared them. The critical ones:

| CVE | Package | Reachable in Flame? |
|---|---|---|
| CVE-2026-13221, CVE-2026-42496, CVE-2026-8376 | perl-base | No. Flame never runs Perl. It is only in the image because Debian's package tools need it. |
| CVE-2025-7458 | libsqlite3-0 | No. The sqlite3 npm module uses its own bundled SQLite (3.52.0) and does not link to the system library (checked with `ldd`). The package was installed but unused. |
| CVE-2023-45853 | zlib1g (minizip) | No. Node uses its own bundled zlib, and Flame does not create zip files. |

The high ones are spread over util-linux (`mount`, `libblkid`, …), curl and
libcurl, gnutls, OpenSSL (`libssl3`), systemd libraries, ncurses, gzip and
acl. Flame never shells out (no `child_process` anywhere in the server), and
Node uses its own statically linked OpenSSL (3.5.8) and zlib. The only OS
binary Flame's image runs is `curl`, for the HEALTHCHECK against
`http://localhost:5005/health`, which never talks to anything outside the
container.

### npm, bundled inside the Node image

All 21 Node.js findings are under `/usr/local/lib/node_modules/npm`:
undici 6.27.0, tar 7.5.19, brace-expansion 5.0.7, ip-address 10.2.0,
http-cache-semantics 4.2.0 and postcss-selector-parser 7.1.4. These are npm's
own dependencies. Flame starts with `node server.js` and never runs npm inside
the container, so none of them are reachable. They show up in every
`node:24-*` image until the Node image ships a newer npm.

### Flame's own dependencies

None. This matches `npm audit` being clean in the server and the client
after v1.8.1.

## What changed

1. **Runtime and server build stages moved from `node:24-bookworm-slim` to
   `node:24-alpine`** (`.docker/Dockerfile.multiarch`, which is what CI
   publishes). Scanning the bare base images on 2026-10-10:

   | Base image | OS findings | Critical | High |
   |---|---|---|---|
   | node:24-bookworm-slim (Debian 12) | 241 | 4 | 54 |
   | node:24-trixie-slim (Debian 13) | 164 | 0 | 43 |
   | gcr.io/distroless/nodejs24-debian13 | 31 | 0 | 0 |
   | **node:24-alpine (Alpine 3.24)** | **1** (fixable) | 0 | 0 |

   Alpine was picked because it is by far the cleanest, the single-arch
   `.docker/Dockerfile` already used it, and it keeps a shell and curl so
   existing compose healthchecks keep working. Distroless was ruled out
   because it has no shell or curl, which would break the `curl -fs …/health`
   healthcheck that users copied from the README into their compose files.
   Debian 13 still carries 43 high findings with no fix.
2. **`apk upgrade`** in the runtime stage, to pick up Alpine fixes released
   after the base image was built (the one zlib finding in the base image has
   a fix).
3. **npm, npx, corepack and yarn are removed from the runtime stage.** That
   removes all 21 Node.js findings. Nothing in Flame needs them at runtime.
4. **`libsqlite3-0` is no longer installed** (it was unused, see above). The
   sqlite3 module is still compiled from source for each architecture, now
   against musl.
5. The single-arch `.docker/Dockerfile` gets the same runtime changes and no
   longer installs `jq` and the `sqlite` CLI, which Flame never used and the
   published image never had.

### Compatibility

- The `node` user is uid/gid 1000 in both images, so existing `/app/data`
  volumes keep working without a chown.
- The SQLite library is the same bundled 3.52.0, so the database file is
  unchanged.
- The container has `sh` (busybox) but no `bash`. Nothing in Flame or its
  docs uses bash inside the container.
- DNS resolution now goes through musl instead of glibc. That only matters
  for unusual `resolv.conf` setups; the weather API and update check use
  normal public hostnames.

## Results after the change

Filled in from a scan of the `:dev` image built by CI from this branch. See
the PR for the numbers.

## What is left and why

- Anything still reported after the change is listed in the PR description,
  with the reason it was left.
- Future npm CVEs no longer affect the image, because npm is not in it.
- New Alpine CVEs will appear over time. Each release build picks up fixes
  through `apk upgrade`, so rebuilding is enough; no Dockerfile change is
  needed.
