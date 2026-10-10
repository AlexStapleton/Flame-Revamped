const App = require('../../../models/App');
const http = require('node:http');
const Logger = require('../../../utils/Logger');
const logger = new Logger();
const { isDangerousUrl } = require('../../../utils/urlSafety');
const loadConfig = require('../../../utils/loadConfig');
const { computeSyncPlan } = require('../../../utils/syncDiff');
const applySyncPlan = require('../../../utils/applySyncPlan');

const CONTAINERS_FILTER = encodeURIComponent(
  JSON.stringify({ status: ['running'] })
);

/**
 * Build the request for the Docker "list containers" endpoint.
 *
 * - No scheme and host includes 'localhost': use the local unix socket.
 * - No scheme otherwise: plain http://<host> (backward compatible).
 * - Explicit http:// or https:// scheme: use that base URL as-is.
 */
const buildDockerRequest = (host) => {
  const query = `/containers/json?filters=${CONTAINERS_FILTER}`;

  if (/^https?:\/\//i.test(host)) {
    return { url: `${host.replace(/\/+$/, '')}${query}` };
  }

  const base = host.replace(/\/+$/, '');

  if (base.includes('localhost')) {
    return {
      url: `http://${base}${query}`,
      socketPath: '/var/run/docker.sock',
    };
  }

  return { url: `http://${base}${query}` };
};

const DOCKER_TIMEOUT_MS = 10000;

// GET a Docker API URL and parse the JSON body. Built-in fetch can't talk to a
// unix socket, so the local socket goes through node:http; TCP hosts use fetch.
// Rejects on non-2xx, like axios did.
const dockerGet = async ({ url, socketPath }) => {
  if (!socketPath) {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOCKER_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Docker API responded with HTTP ${res.status}`);
    return res.json();
  }

  const { pathname, search } = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.get(
      { socketPath, path: pathname + search, timeout: DOCKER_TIMEOUT_MS },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('error', reject);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Docker API responded with HTTP ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Docker API request timed out')));
    req.on('error', reject);
  });
};

const useDocker = async () => {
  const {
    useOrdering: orderType,
    unpinStoppedApps,
    dockerHost: host,
  } = await loadConfig();

  let containers = null;

  // Get list of containers
  try {
    containers = await dockerGet(buildDockerRequest(host));
  } catch {
    logger.log(`Can't connect to the Docker API on ${host}`, 'ERROR');
  }

  if (containers) {
    const apps = await App.findAll({
      order: [[orderType, 'ASC']],
    });

    // Filter out containers without any annotations
    containers = containers.filter((e) => Object.keys(e.Labels).length !== 0);

    const dockerApps = [];

    for (const container of containers) {
      let labels = container.Labels;

      // Traefik labels for URL configuration
      if (!('flame.url' in labels)) {
        for (const label of Object.keys(labels)) {
          if (/^traefik.*.frontend.rule/.test(label)) {
            // Traefik 1.x
            let value = labels[label];

            if (value.indexOf('Host') !== -1) {
              value = value.split('Host:')[1];
              labels['flame.url'] =
                'https://' + value.split(',').join(';https://');
            }
          } else if (/^traefik.*?\.rule/.test(label)) {
            // Traefik 2.x
            const value = labels[label];

            if (value.indexOf('Host') !== -1) {
              const regex = /\`([a-zA-Z0-9\.\-]+)\`/g;
              const domains = [];

              let match;
              while ((match = regex.exec(value)) != null) {
                domains.push('http://' + match[1]);
              }

              if (domains.length > 0) {
                labels['flame.url'] = domains.join(';');
              }
            }
          }
        }
      }

      // add each container as flame formatted app
      if (
        'flame.name' in labels &&
        'flame.url' in labels &&
        /^app/.test(labels['flame.type'])
      ) {
        for (let i = 0; i < labels['flame.name'].split(';').length; i++) {
          const names = labels['flame.name'].split(';');
          const urls = labels['flame.url'].split(';');
          let icons = '';

          if ('flame.icon' in labels) {
            icons = labels['flame.icon'].split(';');
          }

          const appUrl = urls[i] || urls[0];
          if (isDangerousUrl(appUrl)) {
            logger.log(
              `Skipping Docker app "${names[i] || names[0]}": unsafe URL scheme`,
              'WARN'
            );
            continue;
          }

          dockerApps.push({
            name: names[i] || names[0],
            url: appUrl,
            icon: icons[i] || 'docker',
          });
        }
      }
    }

    // Docker's icon rules: 'custom' never overrides an existing icon, and the
    // default 'docker' icon never overrides a non-docker icon already set.
    const iconRule = {
      forUpdate: (item, app) =>
        item.icon === 'custom' ||
        (item.icon === 'docker' && app.icon != 'docker')
          ? undefined
          : item.icon,
      forCreate: (item) => (item.icon === 'custom' ? 'docker' : item.icon),
    };

    const plan = computeSyncPlan(apps, dockerApps, {
      source: 'docker',
      unpinStopped: unpinStoppedApps,
      iconRule,
    });

    await applySyncPlan(plan);
  }
};

useDocker.buildDockerRequest = buildDockerRequest;
useDocker.dockerGet = dockerGet;

module.exports = useDocker;
