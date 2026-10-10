const App = require('../../../models/App');
const Logger = require('../../../utils/Logger');
const logger = new Logger();
const { isDangerousUrl } = require('../../../utils/urlSafety');
const loadConfig = require('../../../utils/loadConfig');
const { computeSyncPlan } = require('../../../utils/syncDiff');
const applySyncPlan = require('../../../utils/applySyncPlan');

const useKubernetes = async () => {
  try {
    const k8s = await import('@kubernetes/client-node');
    const { useOrdering: orderType, unpinStoppedApps } = await loadConfig();

    let ingresses = [];

    // --- Connect to the Kubernetes API ---
    // works only if running inside a Kubernetes cluster
    try {
      const kc = new k8s.KubeConfig();
      kc.loadFromCluster(); // Load credentials

      const k8sNetworkingV1Api = kc.makeApiClient(k8s.NetworkingV1Api);
      const res = await k8sNetworkingV1Api.listIngressForAllNamespaces();
      ingresses = res.body.items;
    } catch (err) {
      // detailed error => connection fail
      logger.log(`Can't connect to the Kubernetes API. Is Flame running in a cluster? Error: ${err.message}`, 'ERROR');
      return; // stop no connection
    }

    if (ingresses && ingresses.length > 0) {
      // --- ingresses annotations ---
      const kubernetesApps = ingresses
        .filter((e) => e.metadata && e.metadata.annotations) // annotations exist???
        .map((ingress) => ingress.metadata.annotations)
        .filter(
          (annotations) =>
            'flame.pawelmalak/name' in annotations &&
            'flame.pawelmalak/url' in annotations &&
            /^app/.test(annotations['flame.pawelmalak/type'])
        )
        .filter((annotations) => {
          if (isDangerousUrl(annotations['flame.pawelmalak/url'])) {
            logger.log(
              `Skipping Kubernetes app "${annotations['flame.pawelmalak/name']}": unsafe URL scheme`,
              'WARN'
            );
            return false;
          }
          return true;
        })
        .map((annotations) => ({
          name: annotations['flame.pawelmalak/name'],
          url: annotations['flame.pawelmalak/url'],
          icon: annotations['flame.pawelmalak/icon'] || 'kubernetes',
        }));

      // --- Sync db with discovered apps ---
      const currentApps = await App.findAll({ order: [[orderType, 'ASC']] });

      const plan = computeSyncPlan(currentApps, kubernetesApps, {
        source: 'kubernetes',
        unpinStopped: unpinStoppedApps,
      });

      await applySyncPlan(plan);
    }
  } catch (err) {
    logger.log(`An unexpected error occurred in the Kubernetes service: ${err.message}`, 'ERROR');
  }
};

module.exports = useKubernetes;
