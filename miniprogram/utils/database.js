const db = wx.cloud.database();

function applyOrder(query, orderBy) {
  if (!orderBy) {
    return query;
  }

  if (Array.isArray(orderBy)) {
    return orderBy.reduce((current, item) => current.orderBy(item.field, item.direction), query);
  }

  return query.orderBy(orderBy.field, orderBy.direction);
}

function applyFields(query, fields) {
  if (!fields) {
    return query;
  }

  return query.field(fields);
}

function buildQuery(collectionName, options = {}) {
  const {
    where = {},
    orderBy = null,
    fields = null,
  } = options;

  let query = db.collection(collectionName).where(where);
  query = applyOrder(query, orderBy);
  query = applyFields(query, fields);
  return query;
}

async function fetchAllDocs(collectionName, options = {}) {
  const {
    pageSize = 100,
    maxRecords = Infinity,
  } = options;

  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 100, 100));
  const safeMaxRecords = Math.max(Number(maxRecords) || 0, 0) || Infinity;
  const all = [];
  let skip = 0;

  while (all.length < safeMaxRecords) {
    const currentLimit = Math.min(safePageSize, safeMaxRecords - all.length);
    const res = await buildQuery(collectionName, options).skip(skip).limit(currentLimit).get();
    const list = res.data || [];
    all.push(...list);

    if (list.length < currentLimit) {
      break;
    }

    skip += list.length;
  }

  return all;
}

async function fetchDocs(collectionName, options = {}) {
  const {
    limit = 20,
  } = options;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const res = await buildQuery(collectionName, options).limit(safeLimit).get();
  return res.data || [];
}

async function countDocs(collectionName, options = {}) {
  const res = await buildQuery(collectionName, options).count();
  return Number(res?.total || 0);
}

module.exports = {
  countDocs,
  fetchDocs,
  fetchAllDocs,
};
