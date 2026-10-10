// Pure diff computation for Docker/Kubernetes app discovery.
//
// Given the apps already in the database and the items discovered this run,
// work out the minimal set of writes needed. Apps are matched by `name`.
//
// Ownership model: apps.source is null for apps created by hand, or
// 'docker' / 'kubernetes' for apps a sync created or adopted. A sync only ever
// unpins apps it owns (same source), so manual apps and apps owned by the other
// source are never touched. Apps created before the `source` column existed have
// source=null; the first sync that matches one by name adopts it. A previously
// discovered app that never reappears therefore stays source=null and is not
// auto-unpinned (accepted limitation).
//
// iconRule (optional): { forUpdate(item, existingApp) -> icon string, or
// undefined to keep the existing icon; forCreate(item) -> icon string }.
// Default is to use the discovered icon for both.

const defaultIconRule = {
  forUpdate: (item) => item.icon,
  forCreate: (item) => item.icon,
};

const computeSyncPlan = (
  existingApps,
  discoveredItems,
  { source, unpinStopped = false, iconRule = defaultIconRule } = {}
) => {
  const byName = new Map();
  for (const app of existingApps) {
    // first match wins, as with Array.find
    if (!byName.has(app.name)) byName.set(app.name, app);
  }

  const creates = [];
  const createdByName = new Map();
  const updates = [];
  const updatesById = new Map();
  const discoveredNames = new Set();

  for (const item of discoveredItems) {
    discoveredNames.add(item.name);

    const existing = byName.get(item.name);

    if (!existing) {
      const fields = {
        name: item.name,
        url: item.url,
        icon: iconRule.forCreate(item),
        isPinned: true,
        source,
      };
      // Duplicate name within one run: the later item wins, no second row.
      const prev = createdByName.get(item.name);
      if (prev) {
        Object.assign(prev, fields);
      } else {
        createdByName.set(item.name, fields);
        creates.push(fields);
      }
      continue;
    }

    const desired = { url: item.url, isPinned: true, source };
    const icon = iconRule.forUpdate(item, existing);
    if (icon !== undefined) desired.icon = icon;

    const fields = {};
    for (const [key, value] of Object.entries(desired)) {
      const differs =
        key === 'isPinned' ? !existing.isPinned : existing[key] !== value;
      if (differs) fields[key] = value;
    }

    const prev = updatesById.get(existing.id);
    if (prev) {
      // same app matched twice in one run: merge, later item wins
      Object.assign(prev.fields, fields);
    } else if (Object.keys(fields).length > 0) {
      const entry = { id: existing.id, fields };
      updatesById.set(existing.id, entry);
      updates.push(entry);
    }
  }

  const unpins = [];
  if (unpinStopped) {
    for (const app of existingApps) {
      if (
        app.source === source &&
        app.isPinned &&
        !discoveredNames.has(app.name)
      ) {
        unpins.push(app.id);
      }
    }
  }

  return { creates, updates, unpins };
};

module.exports = { computeSyncPlan };
