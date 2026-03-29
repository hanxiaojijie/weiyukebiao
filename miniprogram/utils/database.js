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

async function fetchAllDocs(collectionName, options = {}) {
  const {
    where = {},
    orderBy = null,
    pageSize = 100,
  } = options;

  const collection = db.collection(collectionName);
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 100, 100));
  const all = [];
  let skip = 0;

  while (true) {
    let query = collection.where(where);
    query = applyOrder(query, orderBy);
    const res = await query.skip(skip).limit(safePageSize).get();
    const list = res.data || [];
    all.push(...list);

    if (list.length < safePageSize) {
      break;
    }

    skip += list.length;
  }

  return all;
}

module.exports = {
  fetchAllDocs,
};
