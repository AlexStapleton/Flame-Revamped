// Status fields are admin-only — never expose infra health to guests. Strips them
// from a plain app object, returning a copy. Pure + testable.
const STATUS_FIELDS = [
  'status',
  'statusCheckedAt',
  'statusCheckEnabled',
  'statusCheckUrl',
];

const redactAppForGuest = (plainApp) => {
  const o = { ...plainApp };
  for (const field of STATUS_FIELDS) delete o[field];
  return o;
};

module.exports = { STATUS_FIELDS, redactAppForGuest };
