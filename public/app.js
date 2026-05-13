const state = {
  orders: [],
  filteredOrders: [],
  selectedOrder: null,
  selectedItems: [],
  selectedItemKeys: new Set(),
  itemsByOrderId: new Map(),
  selectedItemKeysByOrderId: new Map(),
  costAllocationByOrderId: new Map(),
  costAllocationDocumentsByOrderId: new Map(),
  costAllocationDataByOrderId: new Map(),
  expandedStatusGroups: new Map(),
  partsById: new Map(),
  labelsById: new Map(),
  lotsById: new Map()
};

const settingsKey = "bomist-helper-settings";
const appStateKey = "bomist-helper-state";
const defaultSettings = {
  apiBaseUrl: "http://localhost:3333"
};

const bomistEndpoints = {
  ordersEndpoint: "/purchase_orders?limit=100",
  detailsEndpoint: "/purchase_orders/{id}/items",
  orderMutationEndpoint: "/purchase_orders/{orderId}",
  itemMutationEndpoint: "/purchase_orders/{orderId}/items/{itemId}",
  partDetailsEndpoint: "/parts/{partId}",
  documentsEndpoint: "/documents",
  orderDocumentsEndpoint: "/purchase_orders/{orderId}/documents",
  orderDocumentLinkEndpoint: "/purchase_orders/{orderId}/documents/{documentId}",
  labelsEndpoint: "/labels?limit=5000"
};

const helperDataSchema = "bomist-helper.cost-allocation";
const helperDataVersion = 1;
const helperDocumentCategory = "BOMist Helper";

const defaultAppState = {
  selectedOrderId: "",
  orderSearch: "",
  repeatByQuantity: false,
  selectedItemOrderId: "",
  selectedItemKeys: [],
  selectedItemKeysByOrderId: {},
  costAllocationByOrderId: {}
};

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  clearBasketButton: document.querySelector("#clearBasketButton"),
  printButton: document.querySelector("#printButton"),
  ordersCount: document.querySelector("#ordersCount"),
  orderSearch: document.querySelector("#orderSearch"),
  ordersList: document.querySelector("#ordersList"),
  emptyState: document.querySelector("#emptyState"),
  orderDetails: document.querySelector("#orderDetails"),
  selectedOrderTitle: document.querySelector("#selectedOrderTitle"),
  selectedOrderMeta: document.querySelector("#selectedOrderMeta"),
  itemsTable: document.querySelector("#itemsTable"),
  apiBaseUrl: document.querySelector("#apiBaseUrl"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  labelPathInput: document.querySelector("#labelPathInput"),
  createLabelPathButton: document.querySelector("#createLabelPathButton"),
  labelPathStatus: document.querySelector("#labelPathStatus"),
  repeatByQuantity: document.querySelector("#repeatByQuantity"),
  selectedItemsCount: document.querySelector("#selectedItemsCount"),
  selectAllItemsButton: document.querySelector("#selectAllItemsButton"),
  selectNoItemsButton: document.querySelector("#selectNoItemsButton"),
  selectLotItemsButton: document.querySelector("#selectLotItemsButton"),
  costRows: document.querySelector("#costRows"),
  externalItemRows: document.querySelector("#externalItemRows"),
  addCostRowButton: document.querySelector("#addCostRowButton"),
  addExternalItemRowButton: document.querySelector("#addExternalItemRowButton"),
  allocationSummary: document.querySelector("#allocationSummary"),
  allocationPreview: document.querySelector("#allocationPreview"),
  applyCostAllocationButton: document.querySelector("#applyCostAllocationButton"),
  costAllocationStatus: document.querySelector("#costAllocationStatus"),
  printArea: document.querySelector("#printArea")
};

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(settingsKey) || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function clearReferenceData() {
  state.partsById = new Map();
  state.labelsById = new Map();
  state.lotsById = new Map();
}

function loadAppState() {
  try {
    return { ...defaultAppState, ...JSON.parse(localStorage.getItem(appStateKey) || "{}") };
  } catch {
    return { ...defaultAppState };
  }
}

function orderIdString(order) {
  return String(getOrderId(order) || "");
}

function loadPersistedSelectionMap(appState = loadAppState()) {
  const entries = appState.selectedItemKeysByOrderId && typeof appState.selectedItemKeysByOrderId === "object"
    ? Object.entries(appState.selectedItemKeysByOrderId)
    : [];
  const selectionMap = new Map(
    entries.map(([orderId, keys]) => [
      String(orderId),
      new Set(Array.isArray(keys) ? keys.map(String) : [])
    ])
  );

  if (!selectionMap.size && appState.selectedItemOrderId && Array.isArray(appState.selectedItemKeys)) {
    selectionMap.set(String(appState.selectedItemOrderId), new Set(appState.selectedItemKeys.map(String)));
  }

  return selectionMap;
}

function serializeSelectionMap() {
  return Object.fromEntries(
    [...state.selectedItemKeysByOrderId.entries()]
      .map(([orderId, keys]) => [orderId, [...keys]])
  );
}

function defaultCostAllocationDraft() {
  return {
    costs: [{ label: "Delivery", amount: "" }],
    externalItems: []
  };
}

function loadPersistedCostAllocationMap(appState = loadAppState()) {
  const entries = appState.costAllocationByOrderId && typeof appState.costAllocationByOrderId === "object"
    ? Object.entries(appState.costAllocationByOrderId)
    : [];

  return new Map(entries.map(([orderId, draft]) => [String(orderId), normalizeCostAllocationDraft(draft)]));
}

function normalizeCostAllocationDraft(draft) {
  const normalized = draft && typeof draft === "object" ? draft : {};
  const costs = Array.isArray(normalized.costs)
    ? normalized.costs.map(row => ({
      label: String(row?.label || ""),
      amount: String(row?.amount || "")
    }))
    : defaultCostAllocationDraft().costs;
  const externalItems = Array.isArray(normalized.externalItems)
    ? normalized.externalItems.map(row => ({
      label: String(row?.label || ""),
      value: String(row?.value || "")
    }))
    : [];

  return {
    costs: costs.length ? costs : defaultCostAllocationDraft().costs,
    externalItems
  };
}

function serializeCostAllocationMap() {
  return Object.fromEntries([...state.costAllocationByOrderId.entries()]);
}

function getCurrentAppState() {
  const selectedOrderId = state.selectedOrder ? orderIdString(state.selectedOrder) : "";
  const selectedItemKeysByOrderId = serializeSelectionMap();
  return {
    selectedOrderId,
    orderSearch: els.orderSearch.value,
    repeatByQuantity: els.repeatByQuantity.checked,
    selectedItemOrderId: selectedOrderId,
    selectedItemKeys: selectedOrderId ? [...(state.selectedItemKeysByOrderId.get(selectedOrderId) || new Set())] : [],
    selectedItemKeysByOrderId,
    costAllocationByOrderId: serializeCostAllocationMap()
  };
}

function saveAppState(appState = getCurrentAppState()) {
  localStorage.setItem(appStateKey, JSON.stringify(appState));
}

function applyAppState(appState) {
  els.orderSearch.value = appState.orderSearch || "";
  els.repeatByQuantity.checked = Boolean(appState.repeatByQuantity);
  state.selectedItemKeysByOrderId = loadPersistedSelectionMap(appState);
  state.costAllocationByOrderId = loadPersistedCostAllocationMap(appState);
}

function applySettings(settings) {
  els.apiBaseUrl.value = settings.apiBaseUrl;
}

function readSettings() {
  return {
    apiBaseUrl: els.apiBaseUrl.value.trim() || defaultSettings.apiBaseUrl
  };
}

async function bomistFetch(path, options = {}) {
  const settings = readSettings();
  const url = new URL("/api/bomist", window.location.origin);
  url.searchParams.set("baseUrl", settings.apiBaseUrl);
  url.searchParams.set("path", path);

  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  }

  return data;
}

function unwrapCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.docs,
    payload.rows,
    payload.data,
    payload.results,
    payload.items,
    payload.orders,
    payload.purchaseOrders,
    payload.parts,
    payload.labels,
    payload.lots
  ];

  const found = candidates.find(Array.isArray);
  if (!found) return [];

  return found.map(item => item.doc || item.value || item);
}

function deepFind(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  const queue = [obj];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    for (const key of keys) {
      if (current[key] !== undefined && current[key] !== null && current[key] !== "") {
        return current[key];
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return undefined;
}

function displayValue(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") {
    return value.name || value.code || value.number || value.id || "";
  }
  return String(value);
}

function firstDisplayValue(...values) {
  for (const value of values) {
    const displayed = displayValue(value);
    if (displayed) return displayed;
  }
  return "";
}

function formatDateOnly(value) {
  const displayed = displayValue(value);
  if (!displayed) return "";

  const isoDate = displayed.match(/\d{4}-\d{2}-\d{2}/);
  if (isoDate) return isoDate[0];

  return displayed.split(/[T\s]/)[0];
}

function labelName(label) {
  if (!label) return "";
  if (typeof label !== "object") {
    const knownLabel = state.labelsById.get(String(label));
    if (knownLabel) return labelName(knownLabel);
    const labelText = String(label);
    return looksLikeOpaqueId(labelText) ? "" : labelText;
  }

  const knownLabel = state.labelsById.get(String(label.id || label._id || ""));
  if (knownLabel && knownLabel !== label) return labelName(knownLabel);

  return displayValue(label.name || label.label || label.title || label.value || label.code);
}

function getLabelId(label) {
  if (!label || typeof label !== "object") return "";
  return String(label.id || label._id || label.label?.id || label.label?._id || "");
}

function getLabelParentId(label) {
  if (!label || typeof label !== "object") return "";
  const parent = label.parentId ?? label.parent_id ?? label.parent ?? label.label?.parentId ?? label.label?.parent_id;
  return parent === undefined || parent === null ? "" : String(parent);
}

function labelHierarchy(label, seen = new Set()) {
  if (label && typeof label !== "object") {
    const knownLabel = state.labelsById.get(String(label));
    if (knownLabel) return labelHierarchy(knownLabel, seen);
  }

  if (!label || typeof label !== "object" || seen.has(label)) {
    return labelName(label);
  }

  seen.add(label);

  const knownLabel = state.labelsById.get(String(label.id || label._id || ""));
  if (knownLabel && knownLabel !== label && !seen.has(knownLabel)) {
    return labelHierarchy(knownLabel, seen);
  }

  if (typeof label.path === "string" && label.path.trim()) return formatLabelPath(label.path);
  if (typeof label.fullName === "string" && label.fullName.trim()) return formatLabelPath(label.fullName);
  if (typeof label.fullPath === "string" && label.fullPath.trim()) return formatLabelPath(label.fullPath);

  const parents = Array.isArray(label.parents)
    ? label.parents.flatMap(parent => labelHierarchy(parent, seen).split(" > ").filter(Boolean))
    : labelHierarchy(label.parent || label.parentId || label.parent_id || label.parentLabel || label.parent_label, seen).split(" > ").filter(Boolean);
  const current = labelName(label);

  return [...parents, current].filter(Boolean).join(" > ");
}

function normalizeLabelName(value) {
  return String(value || "").trim();
}

function formatLabelPath(value) {
  return value
    .split(/\s*(?:>| - )\s*/g)
    .map(part => part.trim())
    .filter(Boolean)
    .join(" > ");
}

function parseLabelPath(value) {
  return String(value || "")
    .split(/\r?\n|>/g)
    .map(normalizeLabelName)
    .filter(Boolean);
}

function labelsCollectionPath() {
  return bomistEndpoints.labelsEndpoint;
}

function labelsMutationPath() {
  return labelsCollectionPath().split("?")[0] || "/labels";
}

function looksLikeOpaqueId(value) {
  return /^[a-f0-9]{24}$/i.test(value) || /^[a-z0-9_-]{16,}$/i.test(value);
}

function formatLabels(...values) {
  const labels = values.flatMap(value => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  });

  const formatted = labels.map(label => labelHierarchy(label)).filter(Boolean);
  return [...new Set(formatted)].join(", ");
}

function getOrderId(order) {
  return order._id || order.id || order.uuid || order.purchase_order?.id || order.purchaseOrder?.id || order.purchaseOrder?._id;
}

function getOrderTitle(order) {
  const purchaseOrder = order.purchase_order || order.purchaseOrder || order.order || {};
  return String(
    purchaseOrder.purchaseNumber ||
      purchaseOrder.orderNumber ||
      purchaseOrder.number ||
      purchaseOrder.description ||
      order.purchaseNumber ||
      order.orderNumber ||
      order.number ||
      getOrderId(order) ||
      "Order without a number"
  );
}

function getOrderMeta(order) {
  const purchaseOrder = order.purchase_order || order.purchaseOrder || order.order || {};
  const supplier = purchaseOrder.supplier?.name || purchaseOrder.supplierName || order.supplierName;
  const status = getOrderStatus(order);
  const date = purchaseOrder.orderedOn || purchaseOrder.receivedOn || order.orderedOn || order.created_at;
  return [supplier, status, date].map(displayValue).filter(Boolean).join(" • ");
}

function getOrderStatus(order) {
  const purchaseOrder = order.purchase_order || order.purchaseOrder || order.order || {};
  return purchaseOrder.status || order.status || order.state || "";
}

function orderStatusLabel(order) {
  return displayValue(getOrderStatus(order)) || "No status";
}

function normalizeStatusKey(status) {
  return String(status || "No status").trim().toLowerCase() || "no status";
}

function isStatusGroupExpanded(statusKey) {
  if (state.expandedStatusGroups.has(statusKey)) return state.expandedStatusGroups.get(statusKey);
  return statusKey === "open";
}

function getOrderDateValue(order) {
  const purchaseOrder = order.purchase_order || order.purchaseOrder || order.order || {};
  const candidates = [
    purchaseOrder.orderedOn,
    purchaseOrder.createdAt,
    purchaseOrder.created_at,
    purchaseOrder.receivedOn,
    purchaseOrder.updatedAt,
    order.orderedOn,
    order.createdAt,
    order.created_at,
    order.receivedOn,
    order.updatedAt,
    order.updated_at
  ];
  const rawDate = candidates.find(value => displayValue(value));
  const timestamp = Date.parse(displayValue(rawDate));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortOrdersNewestFirst(orders) {
  return [...orders].sort((a, b) => {
    const dateDiff = getOrderDateValue(b) - getOrderDateValue(a);
    if (dateDiff) return dateDiff;
    return getOrderTitle(b).localeCompare(getOrderTitle(a), undefined, { numeric: true, sensitivity: "base" });
  });
}

function groupedOrdersByStatus(orders) {
  const groupsByStatus = new Map();

  for (const order of orders) {
    const label = orderStatusLabel(order);
    const key = normalizeStatusKey(label);
    if (!groupsByStatus.has(key)) {
      groupsByStatus.set(key, {
        key,
        label,
        orders: [],
        newestDate: 0
      });
    }

    const group = groupsByStatus.get(key);
    group.orders.push(order);
    group.newestDate = Math.max(group.newestDate, getOrderDateValue(order));
  }

  return [...groupsByStatus.values()].sort((a, b) => {
    if (a.key === "open" && b.key !== "open") return -1;
    if (b.key === "open" && a.key !== "open") return 1;
    return b.newestDate - a.newestDate || a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

function getItems(order) {
  const itemCandidates = [
    order.items,
    order.lines,
    order.purchase_order_items,
    order.purchase_order?.items,
    order.purchase_order?.lines,
    order.purchaseOrder?.items,
    order.purchaseOrder?.lines,
    order.order?.items,
    order.data?.items
  ];

  const direct = itemCandidates.find(Array.isArray);
  if (direct) return direct;

  const nested = deepFind(order, ["items", "lines"]);
  return Array.isArray(nested) ? nested : [];
}

function quantityValue(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.value === "number") return value.value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 1;
}

function numericValue(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object") {
    return numericValue(value.value ?? value.amount ?? value.price ?? value.total);
  }
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(",", ".");
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function parseHelperDataValue(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value && typeof value === "object" ? value : null;
}

function costAllocationDataFromDocument(document) {
  const documentData = document?.document && typeof document.document === "object" ? document.document : document || {};
  const data = parseHelperDataValue(documentData.notes);
  return data?.schema === helperDataSchema ? data : null;
}

function allocationDraftFromOrderData(data) {
  if (!data?.allocation) return null;
  return normalizeCostAllocationDraft({
    costs: data.allocation.costs,
    externalItems: data.allocation.externalItems
  });
}

function hasMeaningfulCostAllocationDraft(draft) {
  const normalized = normalizeCostAllocationDraft(draft);
  return normalized.costs.some(row => parsePositiveAmount(row.amount) > 0) ||
    normalized.externalItems.some(row => parsePositiveAmount(row.value) > 0);
}

function hasSavedCostAllocation(orderId) {
  return Boolean(state.costAllocationDataByOrderId.get(String(orderId)));
}

function helperDocumentUrl(orderId) {
  return `bomist-helper://cost-allocation/${encodeURIComponent(orderId)}`;
}

function helperDocumentName(order) {
  return `BOMist Helper Data - ${getOrderTitle(order)}`;
}

function documentData(document) {
  return document?.document && typeof document.document === "object" ? document.document : document || {};
}

function getDocumentId(document) {
  const data = documentData(document);
  return data.id || document?.id || document?._id || "";
}

function costAllocationItemData(orderId, itemId) {
  const data = state.costAllocationDataByOrderId.get(String(orderId));
  if (!data || !Array.isArray(data.items)) return null;
  return data.items.find(item => String(item.itemId) === String(itemId)) || null;
}

function formatMoney(value, currency = "", options = {}) {
  if (value === undefined || value === null || value === "") return "";
  const numeric = numericValue(value);
  if (numeric === null) return displayValue(value);
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;

  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits,
        maximumFractionDigits
      }).format(numeric);
    } catch {
      return `${numeric.toFixed(maximumFractionDigits)} ${currency}`;
    }
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(numeric);
}

function formatUnitPrice(value, currency = "") {
  return formatMoney(value, currency, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
}

function getLotDetails(value) {
  if (!value) return { number: "", comment: "" };
  if (typeof value !== "object") {
    return getLotDetails(state.lotsById.get(value));
  }

  const lot = value.lot || value;

  const number = displayValue(
    lot.number ||
      lot.lotNumber ||
      lot.code ||
      lot.altCode ||
      lot.name ||
      lot.batchNumber ||
      lot.batch
  );
  const comment = displayValue(
    lot.comment ||
      lot.comments ||
      lot.note ||
      lot.notes ||
      lot.description
  );

  return { number, comment };
}

function firstLotDetails(...values) {
  for (const value of values) {
    const details = getLotDetails(value);
    if (details.number || details.comment) return details;
  }
  return { number: "", comment: "" };
}

function getOrderLabelDetails(order) {
  const purchaseOrder = order?.purchase_order || order?.purchaseOrder || order?.order || {};
  const number = getOrderTitle(order || {});
  const date = formatDateOnly(
    purchaseOrder.orderedOn ||
      purchaseOrder.receivedOn ||
      purchaseOrder.createdAt ||
      order?.orderedOn ||
      order?.receivedOn ||
      order?.created_at ||
      order?.createdAt
  );
  const supplier = displayValue(
    purchaseOrder.supplier ||
      purchaseOrder.supplierName ||
      order?.supplier ||
      order?.supplierName
  );

  return { number, date, supplier };
}

function getItemKey(item, index) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  const id = purchaseOrderItem.id ||
    purchaseOrderItem._id ||
    purchaseOrderItem.uuid ||
    item.id ||
    item._id ||
    item.uuid;

  return id ? String(id) : `row-${index + 1}`;
}

function getItemId(item) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  const id = purchaseOrderItem.id ||
    purchaseOrderItem._id ||
    purchaseOrderItem.uuid ||
    item.id ||
    item._id ||
    item.uuid;

  return id ? String(id) : "";
}

function getPartId(value) {
  if (!value) return "";
  if (typeof value !== "object") return String(value);

  const part = value.part && typeof value.part === "object" ? value.part : value;
  const id = part.id || part._id || part.uuid || value.id || value._id || value.uuid;
  return id ? String(id) : "";
}

function getItemPartId(item) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  return getPartId(purchaseOrderItem.part || item.part);
}

function normalizeItem(item, index, order = state.selectedOrder) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  const linkedPart = purchaseOrderItem.part || item.part;
  const partId = getPartId(linkedPart);
  const knownPart = state.partsById.get(partId) || {};
  const inlinePart = linkedPart && typeof linkedPart === "object" ? linkedPart : null;
  const part =
    knownPart.part ||
    (Object.keys(knownPart).length ? knownPart : null) ||
    inlinePart?.part ||
    inlinePart ||
    item.partSnapshot ||
    item.purchaseItem ||
    item.product ||
    {};
  const quote = item.quote || item.supplierPart || {};
  const product = purchaseOrderItem.product || item.product || {};
  const description = firstDisplayValue(
    part.description,
    part.value,
    part.name,
    product.description,
    product.name,
    item.partSnapshot?.description,
    item.partSnapshot?.name,
    item.purchaseItem?.description,
    item.purchaseItem?.name
  );
  const catalogNumber =
    part.mpn ||
    part.manufacturerPartNumber ||
    part.partNumber ||
    part.ipn ||
    purchaseOrderItem.product?.sku ||
    deepFind(item, ["mpn", "manufacturerPartNumber", "catalogNumber", "sku", "partNumber", "ipn"]) ||
    partId;
  const category = formatLabels(
    part.label,
    part.labels,
    part.labelPath,
    part.label_path,
    deepFind(item, ["label", "labels", "labelPath", "label_path"])
  );
  const manufacturer = displayValue(
    part.manufacturer ||
      part.manufacturerName ||
      part.mfr ||
      purchaseOrderItem.product?.manufacturer ||
      deepFind(item, ["manufacturer", "manufacturerName", "mfr"])
  );
  const supplier = deepFind(item, ["supplier", "supplierName", "vendor"]) || deepFind(quote, ["supplier", "supplierName", "vendor"]);
  const orderData = order?.purchase_order || order?.purchaseOrder || {};
  const orderSupplier = orderData.supplier?.name || orderData.supplierName || order?.supplierName || "";
  const quantity = deepFind(item, ["quantity", "qty", "orderedQuantity", "amount"]) || purchaseOrderItem.pricing?.qty || 1;
  const normalizedQuantity = quantityValue(quantity);
  const pricing = purchaseOrderItem.pricing || item.pricing || quote.pricing || {};
  const currency =
    displayValue(pricing.currency || pricing.currencyCode || item.currency || item.currencyCode || quote.currency || quote.currencyCode);
  const price =
    pricing.unitPrice ??
    pricing.price ??
    pricing.unitCost ??
    pricing.cost ??
    item.unitPrice ??
    item.price ??
    quote.unitPrice ??
    quote.price;
  const explicitValue =
    pricing.total ??
    pricing.totalPrice ??
    pricing.extendedPrice ??
    pricing.value ??
    item.total ??
    item.totalPrice ??
    item.extendedPrice;
  const unitPrice = numericValue(price);
  const explicitValueNumber = numericValue(explicitValue);
  const computedValue = explicitValueNumber === null && unitPrice !== null ? unitPrice * normalizedQuantity : explicitValue;
  const computedValueNumber = numericValue(computedValue);
  const lineValue = computedValueNumber === null ? null : roundAmount(computedValueNumber, 2);
  const itemId = getItemId(item);
  const orderId = orderIdString(order);
  const allocationItemData = costAllocationItemData(orderId, itemId);
  const lastAllocation = allocationItemData?.lastAllocation || {};
  const hasAllocationItemData = Boolean(allocationItemData);
  const allocationMatchesCurrentPrice = hasAllocationItemData &&
    amountsClose(lineValue, lastAllocation.adjustedValue, 2) &&
    amountsClose(unitPrice, lastAllocation.adjustedUnitPrice, 6);
  const allocationBaseChanged = hasAllocationItemData && !allocationMatchesCurrentPrice;
  const originalPricing = !allocationBaseChanged ? allocationItemData?.originalPricing || {} : {};
  const allocationBaseValue = numericValue(originalPricing.lineValue) ?? lineValue;
  const allocationBaseUnitPrice = numericValue(originalPricing.unitPrice) ?? unitPrice;
  const lotDetails = firstLotDetails(purchaseOrderItem.lot, item.lot, deepFind(item, ["lot", "batch"]));
  const status = purchaseOrderItem.status || deepFind(item, ["status", "state", "receivedStatus"]) || "";
  const orderDetails = getOrderLabelDetails(order);

  return {
    key: getItemKey(item, index),
    itemId,
    raw: item,
    index: index + 1,
    name: String(description),
    description: String(description),
    catalogNumber: catalogNumber ? String(catalogNumber) : "",
    mpn: catalogNumber ? String(catalogNumber) : "",
    category,
    manufacturer,
    supplier: displayValue(supplier) || displayValue(orderSupplier),
    quantity: normalizedQuantity,
    currency,
    unitPrice,
    lineValue,
    allocationBaseValue,
    allocationBaseUnitPrice,
    allocationBaseChanged,
    allocationItemData,
    price: formatUnitPrice(price, currency),
    value: formatMoney(lineValue, currency),
    lot: [lotDetails.number, lotDetails.comment].filter(Boolean).join(" - "),
    lotNumber: lotDetails.number,
    lotComment: lotDetails.comment,
    orderNumber: orderDetails.number,
    orderDate: orderDetails.date,
    orderSupplier: orderDetails.supplier,
    status: status ? String(status) : ""
  };
}

function setConnection(message, className = "") {
  els.connectionStatus.textContent = message;
  els.connectionStatus.className = className;
}

async function loadOrders() {
  const selectedOrderId = state.selectedOrder ? getOrderId(state.selectedOrder) : loadAppState().selectedOrderId;
  setConnection("Connecting to BOMist...");
  els.ordersList.innerHTML = `<div class="hint">Loading orders...</div>`;
  els.printButton.disabled = true;
  state.itemsByOrderId = new Map();
  state.selectedItems = [];

  try {
    await bomistFetch("/");
    const payload = await bomistFetch(bomistEndpoints.ordersEndpoint);

    state.orders = sortOrdersNewestFirst(unwrapCollection(payload));
    await loadLabels();
    await loadLots();
    filterOrders({ persist: false });
    await loadPersistedSelectedOrderItems();
    if (selectedOrderId) {
      await selectOrder(selectedOrderId);
    } else {
      clearSelection({ persist: true });
    }
    setConnection(`Connected to BOMist. Loaded orders: ${state.orders.length}.`, "status-ok");
  } catch (error) {
    state.orders = [];
    state.filteredOrders = [];
    clearSelection();
    renderOrders();
    setConnection(`No connection or incompatible BOMist API: ${error.message}`, "status-error");
  }
}

async function loadOrderItems(order) {
  const orderId = orderIdString(order);
  if (state.itemsByOrderId.has(orderId)) return state.itemsByOrderId.get(orderId);

  let detailsPayload = order;
  const existingItems = getItems(order);

  if (!existingItems.length && orderId) {
    const path = bomistEndpoints.detailsEndpoint.replace("{id}", encodeURIComponent(orderId));
    try {
      detailsPayload = await bomistFetch(path);
    } catch {
      detailsPayload = order;
    }
  }

  const rawItems = Array.isArray(detailsPayload) ? unwrapCollection(detailsPayload) : getItems(detailsPayload);
  await loadPartsForItems(rawItems);
  const normalizedItems = rawItems.map((item, index) => normalizeItem(item, index, order));
  state.itemsByOrderId.set(orderId, normalizedItems);
  return normalizedItems;
}

async function loadOrderDetails(order) {
  const orderId = orderIdString(order);
  if (!orderId) return order;

  try {
    return await bomistFetch(buildOrderMutationPath(orderId));
  } catch {
    return order;
  }
}

async function loadCostAllocationDocument(orderId) {
  const path = bomistEndpoints.orderDocumentsEndpoint.replace("{orderId}", encodeURIComponent(orderId));

  try {
    const payload = await bomistFetch(path);
    const documents = unwrapCollection(payload);
    const expectedUrl = helperDocumentUrl(orderId);
    const found = documents.find(document => {
      const data = documentData(document);
      const parsed = costAllocationDataFromDocument(document);
      return data.url === expectedUrl || parsed?.schema === helperDataSchema;
    });

    if (!found) {
      state.costAllocationDocumentsByOrderId.delete(orderId);
      state.costAllocationDataByOrderId.delete(orderId);
      return null;
    }

    const data = costAllocationDataFromDocument(found);
    state.costAllocationDocumentsByOrderId.set(orderId, found);
    if (data) {
      state.costAllocationDataByOrderId.set(orderId, data);
    } else {
      state.costAllocationDataByOrderId.delete(orderId);
    }
    return found;
  } catch {
    state.costAllocationDocumentsByOrderId.delete(orderId);
    state.costAllocationDataByOrderId.delete(orderId);
    return null;
  }
}

async function loadPersistedSelectedOrderItems() {
  const orderIds = [...state.selectedItemKeysByOrderId.keys()].filter(orderId => {
    const selectedKeys = state.selectedItemKeysByOrderId.get(orderId);
    return selectedKeys && selectedKeys.size;
  });

  for (const orderId of orderIds) {
    const order = state.orders.find(item => orderIdString(item) === orderId);
    if (order) {
      await loadOrderItems(order);
    }
  }
}

async function loadPart(partId) {
  const id = String(partId || "");
  if (!id || state.partsById.has(id)) return;

  try {
    const path = bomistEndpoints.partDetailsEndpoint.replace("{partId}", encodeURIComponent(id));
    const part = await bomistFetch(path);
    state.partsById.set(id, part);
  } catch {
    state.partsById.delete(id);
  }
}

async function loadPartsForItems(items) {
  const partIds = [...new Set(items.map(getItemPartId).filter(Boolean))]
    .filter(partId => !state.partsById.has(partId));

  await Promise.all(partIds.map(loadPart));
}

async function loadLabels() {
  if (state.labelsById.size) return;

  const labelEndpoints = [
    labelsCollectionPath(),
    "/part_labels?limit=5000",
    "/partLabels?limit=5000"
  ].filter((endpoint, index, endpoints) => endpoint && endpoints.indexOf(endpoint) === index);

  for (const endpoint of labelEndpoints) {
    try {
      const payload = await bomistFetch(endpoint);
      const labels = unwrapCollection(payload);
      if (!labels.length) continue;

      state.labelsById = new Map(
        labels
          .map(label => {
            const labelData = label.label && typeof label.label === "object" ? label.label : label;
            return [labelData.id || labelData._id || label.id || label._id, labelData];
          })
          .filter(([id]) => id)
      );
      return;
    } catch {
      state.labelsById = new Map();
    }
  }
}

async function refreshLabels() {
  state.labelsById = new Map();
  await loadLabels();
}

function findExistingLabel(name, parentId = "") {
  const normalizedName = normalizeLabelName(name).toLocaleLowerCase();
  const normalizedParentId = String(parentId || "");

  return [...state.labelsById.values()].find(label => {
    return labelName(label).trim().toLocaleLowerCase() === normalizedName &&
      getLabelParentId(label) === normalizedParentId;
  });
}

function addLabelToIndex(label) {
  const labelData = label?.label && typeof label.label === "object" ? label.label : label;
  const id = getLabelId(labelData) || getLabelId(label);
  if (id) state.labelsById.set(id, labelData);
  return labelData;
}

async function createSingleLabel(name, parentId) {
  const payload = await bomistFetch(labelsMutationPath(), {
    method: "POST",
    body: JSON.stringify({
      label: {
        parentId: parentId || null,
        name
      }
    })
  });

  const created = addLabelToIndex(payload);
  const createdId = getLabelId(created);
  if (createdId) return created;

  await refreshLabels();
  return findExistingLabel(name, parentId);
}

function setLabelPathStatus(message, className = "") {
  els.labelPathStatus.textContent = message;
  els.labelPathStatus.className = `hint ${className}`.trim();
}

async function createLabelPath() {
  const pathParts = parseLabelPath(els.labelPathInput.value);

  if (!pathParts.length) {
    setLabelPathStatus("Enter at least one label name.", "status-warn");
    return;
  }

  els.createLabelPathButton.disabled = true;
  setLabelPathStatus("Checking existing labels...");

  try {
    await refreshLabels();

    let parentId = "";
    let createdCount = 0;
    let reusedCount = 0;

    for (const name of pathParts) {
      let label = findExistingLabel(name, parentId);

      if (label) {
        reusedCount += 1;
      } else {
        setLabelPathStatus(`Creating: ${name}...`);
        label = await createSingleLabel(name, parentId);
        createdCount += 1;
      }

      const nextParentId = getLabelId(label);
      if (!nextParentId) {
        throw new Error(`BOMist did not return an id for label "${name}".`);
      }
      parentId = nextParentId;
    }

    await refreshLabels();
    setLabelPathStatus(`Ready: ${pathParts.join(" > ")}. Created ${createdCount}, reused ${reusedCount}.`, "status-ok");
  } catch (error) {
    setLabelPathStatus(`Could not create label path: ${error.message}`, "status-error");
  } finally {
    els.createLabelPathButton.disabled = false;
  }
}

async function loadLots() {
  if (state.lotsById.size) return;

  try {
    const payload = await bomistFetch("/lots?limit=5000");
    const lots = unwrapCollection(payload);
    state.lotsById = new Map(lots.map(lot => [lot.lot?.id || lot.id || lot._id, lot]).filter(([id]) => id));
  } catch {
    state.lotsById = new Map();
  }
}

function filterOrders({ persist = true } = {}) {
  const query = els.orderSearch.value.trim().toLowerCase();
  state.filteredOrders = state.orders.filter(order => {
    const haystack = `${getOrderTitle(order)} ${getOrderMeta(order)} ${getOrderId(order)}`.toLowerCase();
    return haystack.includes(query);
  });
  renderOrders();
  if (persist) saveAppState();
}

function renderOrders() {
  els.ordersCount.textContent = state.filteredOrders.length;

  if (!state.filteredOrders.length) {
    els.ordersList.innerHTML = `<div class="hint">No orders found. Check that BOMist is running and the local API address is correct.</div>`;
    return;
  }

  els.ordersList.innerHTML = groupedOrdersByStatus(state.filteredOrders).map(group => {
    const expanded = isStatusGroupExpanded(group.key);
    const ordersHtml = group.orders.map(order => {
      const id = getOrderId(order);
      const orderId = String(id || "");
      const active = state.selectedOrder && String(getOrderId(state.selectedOrder)) === String(id) ? " active" : "";
      const selectedCount = selectedItemsForOrder(orderId).length;
      return `
        <button class="order-row${active}" data-order-id="${escapeHtml(orderId)}">
          <span class="order-row-title">
            <strong>${escapeHtml(getOrderTitle(order))}</strong>
            ${selectedCount ? `<span class="order-selection-count">${selectedCount}</span>` : ""}
          </span>
          <span>${escapeHtml(getOrderMeta(order) || String(id || ""))}</span>
        </button>
      `;
    }).join("");

    return `
      <section class="order-status-group">
        <button class="order-status-toggle" type="button" data-status-key="${escapeHtml(group.key)}" aria-expanded="${expanded}">
          <span>
            <span class="order-status-arrow" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
            <strong>${escapeHtml(group.label)}</strong>
          </span>
          <span class="order-status-count">${group.orders.length}</span>
        </button>
        <div class="order-status-items${expanded ? "" : " hidden"}">
          ${ordersHtml}
        </div>
      </section>
    `;
  }).join("");
}

function clearSelection({ persist = false } = {}) {
  state.selectedOrder = null;
  state.selectedItems = [];
  state.selectedItemKeys = new Set();
  els.emptyState.classList.remove("hidden");
  els.orderDetails.classList.add("hidden");
  els.itemsTable.innerHTML = "";
  renderCostAllocationPanel();
  els.printButton.disabled = true;
  updateSelectionSummary();
  renderOrders();
  if (persist) saveAppState();
}

async function selectOrder(orderId, { persist = true } = {}) {
  let order = state.orders.find(item => String(getOrderId(item)) === String(orderId));
  if (!order) {
    clearSelection({ persist });
    return;
  }

  order = await loadOrderDetails(order);
  const orderIndex = state.orders.findIndex(item => String(getOrderId(item)) === String(orderId));
  if (orderIndex >= 0) state.orders[orderIndex] = order;
  await loadCostAllocationDocument(String(orderId));
  state.itemsByOrderId.delete(String(orderId));
  state.selectedOrder = order;
  state.selectedItems = await loadOrderItems(order);
  hydrateCostAllocationDraftFromOrder(order);

  restoreItemSelection(order);
  renderOrders();
  renderDetails(order);
  if (persist) saveAppState();
}

function restoreItemSelection(order) {
  const orderId = orderIdString(order);
  const persistedKeys = state.selectedItemKeysByOrderId.get(orderId);
  const validKeys = new Set(state.selectedItems.map(item => item.key));

  if (persistedKeys) {
    state.selectedItemKeys = new Set([...persistedKeys].filter(key => validKeys.has(key)));
    state.selectedItemKeysByOrderId.set(orderId, new Set(state.selectedItemKeys));
    return;
  }

  state.selectedItemKeys = new Set();
  state.selectedItemKeysByOrderId.set(orderId, new Set(state.selectedItemKeys));
}

function renderDetails(order) {
  els.emptyState.classList.add("hidden");
  els.orderDetails.classList.remove("hidden");
  els.selectedOrderTitle.textContent = getOrderTitle(order);
  els.selectedOrderMeta.textContent = getOrderMeta(order) || getOrderId(order) || "";

  if (!state.selectedItems.length) {
    els.itemsTable.innerHTML = `<tr><td colspan="8">No items found in this order. Check the order data in BOMist.</td></tr>`;
    els.printButton.disabled = true;
    updateSelectionSummary();
    renderCostAllocationPanel();
    return;
  }

  els.itemsTable.innerHTML = state.selectedItems.map(item => `
    <tr>
      <td class="select-column">
        <label class="item-select" title="Print label for this item">
          <input type="checkbox" data-item-key="${escapeHtml(item.key)}" ${state.selectedItemKeys.has(item.key) ? "checked" : ""}>
        </label>
      </td>
      <td>${item.index}</td>
      <td><span class="item-name"><strong>${escapeHtml(item.catalogNumber || "-")}</strong><small>${escapeHtml(item.description || "-")}</small></span></td>
      <td class="numeric">${escapeHtml(String(item.quantity))}</td>
      <td class="numeric">${escapeHtml(item.price || "-")}</td>
      <td class="numeric">${escapeHtml(item.value || "-")}</td>
      <td><span class="lot-info"><strong>${escapeHtml(item.lotNumber || "-")}</strong>${item.lotComment ? `<small>${escapeHtml(item.lotComment)}</small>` : ""}</span></td>
      <td>${escapeHtml(item.status || "-")}</td>
    </tr>
  `).join("");
  updateSelectionSummary();
  renderCostAllocationPanel();
}

function currentCostAllocationDraft() {
  if (!state.selectedOrder) return defaultCostAllocationDraft();
  const orderId = orderIdString(state.selectedOrder);
  if (!state.costAllocationByOrderId.has(orderId)) {
    state.costAllocationByOrderId.set(orderId, defaultCostAllocationDraft());
  }
  return normalizeCostAllocationDraft(state.costAllocationByOrderId.get(orderId));
}

function readCostAllocationDraftFromDom() {
  return normalizeCostAllocationDraft({
    costs: [...els.costRows.querySelectorAll(".allocation-row")].map(row => ({
      label: row.querySelector("[data-cost-label]")?.value || "",
      amount: row.querySelector("[data-cost-amount]")?.value || ""
    })),
    externalItems: [...els.externalItemRows.querySelectorAll(".allocation-row")].map(row => ({
      label: row.querySelector("[data-external-label]")?.value || "",
      value: row.querySelector("[data-external-value]")?.value || ""
    }))
  });
}

function saveCurrentCostAllocationDraft({ persist = true } = {}) {
  if (!state.selectedOrder) return;
  state.costAllocationByOrderId.set(orderIdString(state.selectedOrder), readCostAllocationDraftFromDom());
  if (persist) saveAppState();
}

function hydrateCostAllocationDraftFromOrder(order) {
  const orderId = orderIdString(order);
  const savedDraft = allocationDraftFromOrderData(state.costAllocationDataByOrderId.get(orderId));
  if (!savedDraft) return;

  const currentDraft = state.costAllocationByOrderId.get(orderId);
  if (!currentDraft || !hasMeaningfulCostAllocationDraft(currentDraft)) {
    state.costAllocationByOrderId.set(orderId, savedDraft);
  }
}

function parsePositiveAmount(value) {
  const numeric = numericValue(value);
  return numeric !== null && numeric > 0 ? numeric : 0;
}

function roundAmount(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function amountsClose(left, right, precision = 2) {
  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber === null || rightNumber === null) return false;
  return Math.abs(leftNumber - rightNumber) < 1 / (10 ** precision);
}

function centsValue(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

function distributeCents(totalCents, participants) {
  if (!totalCents || !participants.length) return participants.map(() => 0);

  const baseTotal = participants.reduce((sum, participant) => sum + participant.baseValue, 0);
  if (!baseTotal) return participants.map(() => 0);

  const allocations = participants.map((participant, index) => {
    const exactCents = totalCents * (participant.baseValue / baseTotal);
    const floorCents = Math.floor(exactCents);
    return {
      index,
      floorCents,
      remainder: exactCents - floorCents,
      baseValue: participant.baseValue
    };
  });
  const allocatedFloorCents = allocations.reduce((sum, allocation) => sum + allocation.floorCents, 0);
  let remainingCents = totalCents - allocatedFloorCents;
  const sortedByRemainder = [...allocations].sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.baseValue !== a.baseValue) return b.baseValue - a.baseValue;
    return a.index - b.index;
  });

  for (let index = 0; index < remainingCents; index += 1) {
    sortedByRemainder[index % sortedByRemainder.length].floorCents += 1;
  }

  return allocations
    .sort((a, b) => a.index - b.index)
    .map(allocation => allocation.floorCents);
}

function buildAllocationRows() {
  const draft = currentCostAllocationDraft();
  const costs = draft.costs.map(row => ({
    ...row,
    amountNumber: parsePositiveAmount(row.amount)
  }));
  const externalItems = draft.externalItems.map(row => ({
    ...row,
    valueNumber: parsePositiveAmount(row.value)
  }));
  const bomistItems = state.selectedItems.map(item => ({
    item,
    baseValue: item.allocationBaseValue ?? item.lineValue,
    quantity: item.quantity || 1
  }));
  const usableBomistItems = bomistItems.filter(row => row.baseValue !== null && row.baseValue !== undefined && row.baseValue >= 0);
  const totalExtraCost = costs.reduce((sum, row) => sum + row.amountNumber, 0);
  const bomistBaseValue = usableBomistItems.reduce((sum, row) => sum + row.baseValue, 0);
  const externalBaseValue = externalItems.reduce((sum, row) => sum + row.valueNumber, 0);
  const allocationBaseValue = bomistBaseValue + externalBaseValue;
  const currency = state.selectedItems.find(item => item.currency)?.currency || "";
  const participants = [
    ...usableBomistItems.map(row => ({ type: "bomist", baseValue: row.baseValue })),
    ...externalItems
      .filter(row => row.valueNumber > 0)
      .map(row => ({ type: "external", baseValue: row.valueNumber }))
  ];
  const participantAllocatedCents = distributeCents(centsValue(totalExtraCost), participants);
  const bomistAllocatedCents = participantAllocatedCents.slice(0, usableBomistItems.length);
  const externalAllocatedCents = participantAllocatedCents.slice(usableBomistItems.length);
  const rows = usableBomistItems.map((row, index) => {
    const share = allocationBaseValue > 0 ? row.baseValue / allocationBaseValue : 0;
    const allocatedCost = (bomistAllocatedCents[index] || 0) / 100;
    const adjustedValue = roundAmount(row.baseValue + allocatedCost, 2);
    const adjustedUnitPrice = row.quantity > 0 ? adjustedValue / row.quantity : adjustedValue;
    const originalPricing = row.item.allocationItemData?.originalPricing || {
      unitPrice: row.item.allocationBaseUnitPrice,
      lineValue: row.baseValue,
      quantity: row.quantity,
      currency: row.item.currency
    };
    return {
      ...row,
      share,
      allocatedCost,
      adjustedValue,
      adjustedUnitPrice: roundAmount(adjustedUnitPrice, 6),
      originalPricing
    };
  });
  const bomistAllocatedCost = bomistAllocatedCents.reduce((sum, cents) => sum + cents, 0) / 100;
  const externalAllocatedCost = externalAllocatedCents.reduce((sum, cents) => sum + cents, 0) / 100;

  return {
    costs,
    externalItems,
    rows,
    skippedItems: state.selectedItems.length - usableBomistItems.length,
    changedBaseItems: rows.filter(row => row.item.allocationBaseChanged).length,
    totalExtraCost,
    bomistBaseValue,
    externalBaseValue,
    bomistAllocatedCost,
    externalAllocatedCost,
    allocationBaseValue,
    currency
  };
}

function renderAllocationRows(container, rows, template) {
  container.innerHTML = rows.map(template).join("");
}

function focusAllocationField(container, selector, index) {
  const input = container.querySelector(`${selector}[data-row-index="${index}"]`);
  input?.focus();
}

function renderCostAllocationPanel() {
  if (!els.costRows || !state.selectedOrder) return;

  const draft = currentCostAllocationDraft();
  renderAllocationRows(els.costRows, draft.costs, (row, index) => `
    <div class="allocation-row">
      <input type="text" data-cost-label data-row-index="${index}" value="${escapeHtml(row.label)}" aria-label="Cost label" placeholder="Cost label">
      <input type="text" inputmode="decimal" data-cost-amount data-row-index="${index}" value="${escapeHtml(row.amount)}" aria-label="Cost amount" placeholder="0.00">
      <button class="text-button" type="button" data-remove-cost="${index}">Remove</button>
    </div>
  `);
  renderAllocationRows(els.externalItemRows, draft.externalItems, (row, index) => `
    <div class="allocation-row">
      <input type="search" data-external-label data-row-index="${index}" value="${escapeHtml(row.label)}" aria-label="External row name" placeholder="Item label" autocomplete="new-password" data-lpignore="true" data-1p-ignore>
      <input type="search" inputmode="decimal" data-external-value data-row-index="${index}" value="${escapeHtml(row.value)}" aria-label="External row amount" placeholder="0.00" autocomplete="new-password" data-lpignore="true" data-1p-ignore>
      <button class="text-button" type="button" data-remove-external="${index}">Remove</button>
    </div>
  `);

  if (!draft.externalItems.length) {
    els.externalItemRows.innerHTML = `<p class="hint compact-hint">No invoice-only rows added.</p>`;
  }

  updateAllocationPreview();
}

function updateAllocationPreview() {
  if (!state.selectedOrder || !els.allocationPreview) return;
  const orderId = orderIdString(state.selectedOrder);
  const data = buildAllocationRows();
  const canApply = data.allocationBaseValue > 0 &&
    data.rows.some(row => row.item.itemId) &&
    (data.bomistAllocatedCost > 0 || hasSavedCostAllocation(orderId));

  els.allocationSummary.innerHTML = `
    <div><strong>${escapeHtml(formatMoney(data.totalExtraCost, data.currency))}</strong><span>additional costs</span></div>
    <div><strong>${escapeHtml(formatMoney(data.bomistBaseValue, data.currency))}</strong><span>BOMist item value</span></div>
    <div><strong>${escapeHtml(formatMoney(data.externalBaseValue, data.currency))}</strong><span>invoice-only value</span></div>
  `;

  if (!data.rows.length) {
    els.allocationPreview.innerHTML = `<p class="hint">No order item has a numeric value to allocate costs against.</p>`;
  } else {
    els.allocationPreview.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Catalog number</th>
            <th class="numeric">Base value</th>
            <th class="numeric">Share</th>
            <th class="numeric">Added cost</th>
            <th class="numeric">New unit price</th>
            <th class="numeric">New value</th>
          </tr>
        </thead>
        <tbody>
          ${data.rows.map(row => `
            <tr>
              <td><span class="item-name"><strong>${escapeHtml(row.item.catalogNumber || "-")}</strong><small>${escapeHtml(row.item.description || "-")}</small></span></td>
              <td class="numeric">${escapeHtml(formatMoney(row.baseValue, data.currency))}</td>
              <td class="numeric">${(row.share * 100).toFixed(2)}%</td>
              <td class="numeric">${escapeHtml(formatMoney(row.allocatedCost, data.currency))}</td>
              <td class="numeric">${escapeHtml(formatUnitPrice(row.adjustedUnitPrice, data.currency))}</td>
              <td class="numeric">${escapeHtml(formatMoney(row.adjustedValue, data.currency))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  els.applyCostAllocationButton.disabled = !canApply;
  if (data.skippedItems) {
    setCostAllocationStatus(`${data.skippedItems} item(s) without numeric value are skipped.`, "status-warn");
  } else if (data.changedBaseItems) {
    setCostAllocationStatus(`${data.changedBaseItems} item(s) changed in BOMist since the last allocation. Current values will be used as the new base.`, "status-warn");
  } else if (!data.totalExtraCost) {
    if (hasSavedCostAllocation(orderId)) {
      setCostAllocationStatus("Ready to restore original BOMist item prices and save zero additional costs.", "status-ok");
    } else {
      setCostAllocationStatus("Enter at least one additional cost amount.", "");
    }
  } else if (!data.allocationBaseValue) {
    setCostAllocationStatus("Enter item values greater than zero before applying costs.", "status-warn");
  } else if (!data.bomistAllocatedCost) {
    setCostAllocationStatus("All additional costs are assigned to invoice-only values; nothing to update in BOMist.", "status-warn");
  } else {
    setCostAllocationStatus(`Ready to update BOMist item prices. BOMist share: ${formatMoney(data.bomistAllocatedCost, data.currency)}.`, "status-ok");
  }
}

function setCostAllocationStatus(message, className = "") {
  els.costAllocationStatus.textContent = message;
  els.costAllocationStatus.className = `hint ${className}`.trim();
}

function pricingMoney(value, currency, existingValue) {
  const existingCurrency = displayValue(existingValue?.currency);
  return {
    value,
    currency: currency || existingCurrency || "USD"
  };
}

function purchaseOrderItemProductPayload(product = {}) {
  return {
    sku: displayValue(product.sku),
    ...(product.url ? { url: displayValue(product.url) } : {})
  };
}

function purchaseOrderItemPayload(item, adjusted) {
  const rawItem = item.raw || {};
  const purchaseOrderItem = rawItem.purchase_order_item || rawItem.purchaseOrderItem || rawItem;
  const existingPricing = purchaseOrderItem.pricing || rawItem.pricing || {};
  const currency = adjusted.item.currency ||
    displayValue(existingPricing.unitPrice?.currency) ||
    displayValue(existingPricing.totalPrice?.currency) ||
    displayValue(existingPricing.total?.currency);
  const updatedItem = {
    ...(purchaseOrderItem.part ? { part: displayValue(purchaseOrderItem.part) } : {}),
    ...(purchaseOrderItem.status ? { status: displayValue(purchaseOrderItem.status) } : {}),
    ...(purchaseOrderItem.storage ? { storage: displayValue(purchaseOrderItem.storage) } : {}),
    ...(purchaseOrderItem.receivedOn ? { receivedOn: displayValue(purchaseOrderItem.receivedOn) } : {}),
    ...(purchaseOrderItem.lot ? { lot: displayValue(purchaseOrderItem.lot) } : {}),
    product: purchaseOrderItemProductPayload(purchaseOrderItem.product || rawItem.product || {}),
    pricing: {
      ...(existingPricing.qty !== undefined ? { qty: existingPricing.qty } : { qty: adjusted.item.quantity }),
      unitPrice: pricingMoney(adjusted.adjustedUnitPrice, currency, existingPricing.unitPrice),
      totalPrice: pricingMoney(adjusted.adjustedValue, currency, existingPricing.totalPrice || existingPricing.total)
    }
  };

  return {
    wrapped: {
      purchase_order_item: updatedItem
    }
  };
}

async function tryUpdateBomistOrderItem(path, payloads) {
  const attempts = [
    { method: "PUT", body: payloads.wrapped }
  ];
  const errors = [];

  for (const attempt of attempts) {
    try {
      return await bomistFetch(path, {
        method: attempt.method,
        body: JSON.stringify(attempt.body)
      });
    } catch (error) {
      errors.push(`${attempt.method}: ${error.message}`);
    }
  }

  throw new Error(errors.join("; "));
}

function buildItemMutationPath(orderId, itemId) {
  return bomistEndpoints.itemMutationEndpoint
    .replace("{orderId}", encodeURIComponent(orderId))
    .replace("{itemId}", encodeURIComponent(itemId));
}

async function updateBomistOrderItem(orderId, row) {
  const path = buildItemMutationPath(orderId, row.item.itemId);
  return {
    path,
    result: await tryUpdateBomistOrderItem(path, purchaseOrderItemPayload(row.item, row))
  };
}

function buildOrderMutationPath(orderId) {
  return bomistEndpoints.orderMutationEndpoint.replace("{orderId}", encodeURIComponent(orderId));
}

function buildOrderDocumentsPath(orderId) {
  return bomistEndpoints.orderDocumentsEndpoint.replace("{orderId}", encodeURIComponent(orderId));
}

function buildOrderDocumentLinkPath(orderId, documentId) {
  return bomistEndpoints.orderDocumentLinkEndpoint
    .replace("{orderId}", encodeURIComponent(orderId))
    .replace("{documentId}", encodeURIComponent(documentId));
}

function buildDocumentMutationPath(documentId) {
  return `${bomistEndpoints.documentsEndpoint}/${encodeURIComponent(documentId)}`;
}

async function findCostAllocationDocumentByUrl(orderId) {
  const payload = await bomistFetch(`${bomistEndpoints.documentsEndpoint}?limit=5000`);
  const expectedUrl = helperDocumentUrl(orderId);
  return unwrapCollection(payload).find(document => documentData(document).url === expectedUrl) || null;
}

function buildCostAllocationData(allocationRun, rows) {
  return {
    schema: helperDataSchema,
    version: helperDataVersion,
    appliedAt: allocationRun.appliedAt,
    orderId: allocationRun.orderId,
    allocation: {
      costs: allocationRun.costs,
      externalItems: allocationRun.externalItems,
      totalExtraCost: allocationRun.totalExtraCost,
      bomistBaseValue: allocationRun.bomistBaseValue,
      externalBaseValue: allocationRun.externalBaseValue,
      allocationBaseValue: allocationRun.allocationBaseValue,
      bomistAllocatedCost: allocationRun.bomistAllocatedCost,
      externalAllocatedCost: allocationRun.externalAllocatedCost,
      currency: allocationRun.currency
    },
    items: rows.map(row => ({
      itemId: row.item.itemId,
      catalogNumber: row.item.catalogNumber,
      originalPricing: row.originalPricing,
      lastAllocation: {
        baseValue: row.baseValue,
        allocatedCost: row.allocatedCost,
        adjustedValue: row.adjustedValue,
        adjustedUnitPrice: row.adjustedUnitPrice,
        share: row.share,
        currency: allocationRun.currency || row.item.currency
      }
    }))
  };
}

function costAllocationDocumentPayload(order, allocationData) {
  return {
    document: {
      name: helperDocumentName(order),
      category: helperDocumentCategory,
      notes: JSON.stringify(allocationData),
      url: helperDocumentUrl(allocationData.orderId)
    }
  };
}

async function saveCostAllocationDocument(orderId, allocationData) {
  const existingDocument = state.costAllocationDocumentsByOrderId.get(orderId);
  const existingDocumentId = existingDocument ? getDocumentId(existingDocument) : "";
  const payload = costAllocationDocumentPayload(state.selectedOrder, allocationData);

  if (existingDocumentId) {
    await bomistFetch(buildDocumentMutationPath(existingDocumentId), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const updatedDocument = {
      ...existingDocument,
      document: {
        ...documentData(existingDocument),
        ...payload.document,
        id: existingDocumentId
      }
    };
    state.costAllocationDocumentsByOrderId.set(orderId, updatedDocument);
  } else {
    const savedDocument = await bomistFetch(bomistEndpoints.documentsEndpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const documentId = getDocumentId(savedDocument) || getDocumentId(await findCostAllocationDocumentByUrl(orderId));
    if (!documentId) {
      throw new Error("BOMist did not return an id for the helper document.");
    }
    await bomistFetch(buildOrderDocumentLinkPath(orderId, documentId), { method: "PUT" });
    await loadCostAllocationDocument(orderId);
  }

  state.costAllocationDataByOrderId.set(orderId, allocationData);
}

async function applyCostAllocation() {
  if (!state.selectedOrder) return;
  saveCurrentCostAllocationDraft();
  const orderId = orderIdString(state.selectedOrder);
  const data = buildAllocationRows();
  const updateRows = data.rows.filter(row => row.item.itemId);

  if (!data.allocationBaseValue || (!data.bomistAllocatedCost && !hasSavedCostAllocation(orderId)) || !updateRows.length) {
    updateAllocationPreview();
    return;
  }

  els.applyCostAllocationButton.disabled = true;
  setCostAllocationStatus(`Updating ${updateRows.length} BOMist item(s)...`);

  try {
    const allocationRun = {
      appliedAt: new Date().toISOString(),
      orderId,
      costs: data.costs
        .filter(row => row.label.trim() || row.amountNumber > 0)
        .map(row => ({ label: row.label.trim(), amount: row.amountNumber })),
      externalItems: data.externalItems
        .filter(row => row.label.trim() || row.valueNumber > 0)
        .map(row => ({ label: row.label.trim(), value: row.valueNumber })),
      totalExtraCost: data.totalExtraCost,
      bomistBaseValue: data.bomistBaseValue,
      externalBaseValue: data.externalBaseValue,
      allocationBaseValue: data.allocationBaseValue,
      bomistAllocatedCost: data.bomistAllocatedCost,
      externalAllocatedCost: data.externalAllocatedCost,
      currency: data.currency
    };

    for (const row of updateRows) {
      await updateBomistOrderItem(orderId, { ...row, allocationRun });
    }

    await saveCostAllocationDocument(orderId, buildCostAllocationData(allocationRun, updateRows));

    state.costAllocationByOrderId.set(orderId, normalizeCostAllocationDraft({
      costs: allocationRun.costs,
      externalItems: allocationRun.externalItems
    }));
    saveAppState();
    state.itemsByOrderId.delete(orderId);
    state.selectedItems = await loadOrderItems(state.selectedOrder);
    restoreItemSelection(state.selectedOrder);
    renderDetails(state.selectedOrder);
    setCostAllocationStatus(`Updated ${updateRows.length} BOMist item(s) and saved allocation data in BOMist.`, "status-ok");
  } catch (error) {
    updateAllocationPreview();
    setCostAllocationStatus(`Could not update BOMist items: ${error.message}`, "status-error");
  }
}

function selectedItems() {
  if (!state.selectedOrder) return [];
  return selectedItemsForOrder(orderIdString(state.selectedOrder));
}

function selectedItemsForOrder(orderId) {
  const items = state.itemsByOrderId.get(String(orderId)) || [];
  const selectedKeys = state.selectedItemKeysByOrderId.get(String(orderId)) || new Set();
  return items.filter(item => selectedKeys.has(item.key));
}

function allSelectedItems() {
  return [...state.selectedItemKeysByOrderId.keys()].flatMap(orderId => selectedItemsForOrder(orderId));
}

function updateSelectionSummary() {
  if (!els.selectedItemsCount) return;

  const selectedCount = selectedItems().length;
  const totalCount = state.selectedItems.length;
  const allSelectedCount = allSelectedItems().length;
  els.selectedItemsCount.textContent = `${selectedCount} of ${totalCount} selected here, ${allSelectedCount} total`;
  els.printButton.disabled = allSelectedCount === 0;
  els.clearBasketButton.disabled = allSelectedCount === 0;
}

function setSelectedItems(predicate) {
  state.selectedItemKeys = new Set(
    state.selectedItems
      .filter(predicate)
      .map(item => item.key)
  );
  if (state.selectedOrder) {
    state.selectedItemKeysByOrderId.set(orderIdString(state.selectedOrder), new Set(state.selectedItemKeys));
  }
  renderDetails(state.selectedOrder);
  renderOrders();
  saveAppState();
}

function clearPrintBasket() {
  state.selectedItemKeys = new Set();
  state.selectedItemKeysByOrderId = new Map(
    [...state.selectedItemKeysByOrderId.keys()].map(orderId => [orderId, new Set()])
  );

  if (state.selectedOrder) {
    state.selectedItemKeysByOrderId.set(orderIdString(state.selectedOrder), new Set());
    renderDetails(state.selectedOrder);
  } else {
    updateSelectionSummary();
  }

  renderOrders();
  saveAppState();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getLabelSize() {
  return ["66mm", "30mm"];
}

function buildLabels() {
  const [width, height] = getLabelSize();
  els.printArea.style.setProperty("--label-width", width);
  els.printArea.style.setProperty("--label-height", height);

  const labels = [];

  for (const item of allSelectedItems()) {
    const count = els.repeatByQuantity.checked ? Math.max(1, Math.min(500, Math.round(item.quantity))) : 1;
    const partDetails = [
      item.category ? `<span class="label-category">${escapeHtml(item.category)}</span>` : "",
      item.description ? `<span class="label-description">${escapeHtml(item.description)}</span>` : ""
    ].filter(Boolean).join("");
    const orderDetails = [
      item.orderNumber ? `<span>${escapeHtml(item.orderNumber)}</span>` : "",
      item.orderDate ? `<span>${escapeHtml(item.orderDate)}</span>` : "",
      item.orderSupplier ? `<span>${escapeHtml(item.orderSupplier)}</span>` : ""
    ].filter(Boolean).join("");
    const hasLotDetails = Boolean(item.lotNumber || item.lotComment);

    for (let copy = 0; copy < count; copy += 1) {
      labels.push(`
        <section class="label${hasLotDetails ? " has-lot" : ""}">
          <div class="label-heading">
            <h3>${escapeHtml(item.catalogNumber || item.mpn || "Catalog: -")}</h3>
            ${item.manufacturer ? `<span>${escapeHtml(item.manufacturer)}</span>` : ""}
          </div>
          ${partDetails ? `<div class="label-details">${partDetails}</div>` : ""}
          ${hasLotDetails ? `
            <div class="label-lot">
              ${item.lotNumber ? `<span>LOT: ${escapeHtml(item.lotNumber)}</span>` : ""}
              ${item.lotComment ? `<span>${escapeHtml(item.lotComment)}</span>` : ""}
            </div>
          ` : ""}
          ${orderDetails ? `<div class="label-order">${orderDetails}</div>` : ""}
        </section>
      `);
    }
  }

  els.printArea.innerHTML = labels.join("");
}

function printLabels() {
  if (!allSelectedItems().length) return;
  buildLabels();
  window.print();
}

els.refreshButton.addEventListener("click", () => {
  clearReferenceData();
  loadOrders();
});
els.clearBasketButton.addEventListener("click", clearPrintBasket);
els.printButton.addEventListener("click", printLabels);
els.orderSearch.addEventListener("input", filterOrders);
els.repeatByQuantity.addEventListener("change", () => saveAppState());
els.selectAllItemsButton.addEventListener("click", () => setSelectedItems(() => true));
els.selectNoItemsButton.addEventListener("click", () => setSelectedItems(() => false));
els.selectLotItemsButton.addEventListener("click", () => setSelectedItems(item => Boolean(item.lotNumber || item.lotComment)));
els.addCostRowButton.addEventListener("click", () => {
  if (!state.selectedOrder) return;
  saveCurrentCostAllocationDraft({ persist: false });
  const draft = currentCostAllocationDraft();
  const newIndex = draft.costs.length;
  draft.costs.push({ label: "", amount: "" });
  state.costAllocationByOrderId.set(orderIdString(state.selectedOrder), draft);
  renderCostAllocationPanel();
  focusAllocationField(els.costRows, "[data-cost-label]", newIndex);
  saveAppState();
});
els.addExternalItemRowButton.addEventListener("click", () => {
  if (!state.selectedOrder) return;
  saveCurrentCostAllocationDraft({ persist: false });
  const draft = currentCostAllocationDraft();
  const newIndex = draft.externalItems.length;
  draft.externalItems.push({ label: "", value: "" });
  state.costAllocationByOrderId.set(orderIdString(state.selectedOrder), draft);
  renderCostAllocationPanel();
  focusAllocationField(els.externalItemRows, "[data-external-label]", newIndex);
  saveAppState();
});
els.applyCostAllocationButton.addEventListener("click", applyCostAllocation);
els.costRows.addEventListener("input", () => {
  saveCurrentCostAllocationDraft();
  updateAllocationPreview();
});
els.externalItemRows.addEventListener("input", () => {
  saveCurrentCostAllocationDraft();
  updateAllocationPreview();
});
els.costRows.addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-cost]");
  if (!removeButton || !state.selectedOrder) return;
  saveCurrentCostAllocationDraft({ persist: false });
  const draft = currentCostAllocationDraft();
  draft.costs.splice(Number(removeButton.dataset.removeCost), 1);
  state.costAllocationByOrderId.set(orderIdString(state.selectedOrder), normalizeCostAllocationDraft(draft));
  renderCostAllocationPanel();
  saveAppState();
});
els.externalItemRows.addEventListener("click", event => {
  const removeButton = event.target.closest("[data-remove-external]");
  if (!removeButton || !state.selectedOrder) return;
  saveCurrentCostAllocationDraft({ persist: false });
  const draft = currentCostAllocationDraft();
  draft.externalItems.splice(Number(removeButton.dataset.removeExternal), 1);
  state.costAllocationByOrderId.set(orderIdString(state.selectedOrder), normalizeCostAllocationDraft(draft));
  renderCostAllocationPanel();
  saveAppState();
});
els.createLabelPathButton.addEventListener("click", createLabelPath);
els.ordersList.addEventListener("click", event => {
  const toggle = event.target.closest(".order-status-toggle");
  if (toggle) {
    const statusKey = toggle.dataset.statusKey;
    state.expandedStatusGroups.set(statusKey, !isStatusGroupExpanded(statusKey));
    renderOrders();
    return;
  }

  const row = event.target.closest(".order-row");
  if (row) selectOrder(row.dataset.orderId);
});
els.itemsTable.addEventListener("change", event => {
  const checkbox = event.target.closest('input[type="checkbox"][data-item-key]');
  if (!checkbox || !state.selectedOrder) return;

  if (checkbox.checked) {
    state.selectedItemKeys.add(checkbox.dataset.itemKey);
  } else {
    state.selectedItemKeys.delete(checkbox.dataset.itemKey);
  }

  state.selectedItemKeysByOrderId.set(orderIdString(state.selectedOrder), new Set(state.selectedItemKeys));
  updateSelectionSummary();
  renderOrders();
  saveAppState();
});
els.saveSettingsButton.addEventListener("click", () => {
  saveSettings(readSettings());
  clearReferenceData();
  loadOrders();
});

applySettings(loadSettings());
applyAppState(loadAppState());
loadOrders();
