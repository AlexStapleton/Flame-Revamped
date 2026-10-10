const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { listIngresses } = require('../controllers/apps/docker/useKubernetes');

// A fake API server stands in for the cluster, so this checks the real client
// library's request path and response shape.
test('listIngresses returns the items of the cluster-wide ingress list', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        kind: 'IngressList',
        apiVersion: 'networking.k8s.io/v1',
        metadata: {},
        items: [
          { metadata: { name: 'web', annotations: { 'flame.pawelmalak/name': 'Web' } } },
        ],
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const k8s = await import('@kubernetes/client-node');
    const kc = new k8s.KubeConfig();
    kc.loadFromOptions({
      // Plain http is only allowed with skipTLSVerify; fine for a local fake.
      clusters: [
        { name: 'c', server: `http://127.0.0.1:${server.address().port}`, skipTLSVerify: true },
      ],
      users: [{ name: 'u' }],
      contexts: [{ name: 'ctx', cluster: 'c', user: 'u' }],
      currentContext: 'ctx',
    });

    const items = await listIngresses(k8s, kc);
    assert.deepStrictEqual(seen, ['/apis/networking.k8s.io/v1/ingresses']);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].metadata.annotations['flame.pawelmalak/name'], 'Web');
  } finally {
    server.close();
  }
});
