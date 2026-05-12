const state = {
  orders: [],
  filteredOrders: [],
  selectedOrder: null,
  selectedItems: [],
  selectedItemKeys: new Set(),
  itemsByOrderId: new Map(),
  selectedItemKeysByOrderId: new Map(),
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
  labelsEndpoint: "/labels?limit=5000"
};

const defaultAppState = {
  selectedOrderId: "",
  orderSearch: "",
  repeatByQuantity: false,
  selectedItemOrderId: "",
  selectedItemKeys: [],
  selectedItemKeysByOrderId: {}
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

function getCurrentAppState() {
  const selectedOrderId = state.selectedOrder ? orderIdString(state.selectedOrder) : "";
  const selectedItemKeysByOrderId = serializeSelectionMap();
  return {
    selectedOrderId,
    orderSearch: els.orderSearch.value,
    repeatByQuantity: els.repeatByQuantity.checked,
    selectedItemOrderId: selectedOrderId,
    selectedItemKeys: selectedOrderId ? [...(state.selectedItemKeysByOrderId.get(selectedOrderId) || new Set())] : [],
    selectedItemKeysByOrderId
  };
}

function saveAppState(appState = getCurrentAppState()) {
  localStorage.setItem(appStateKey, JSON.stringify(appState));
}

function applyAppState(appState) {
  els.orderSearch.value = appState.orderSearch || "";
  els.repeatByQuantity.checked = Boolean(appState.repeatByQuantity);
  state.selectedItemKeysByOrderId = loadPersistedSelectionMap(appState);
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
  const status = purchaseOrder.status || order.status || order.state;
  const date = purchaseOrder.orderedOn || purchaseOrder.receivedOn || order.orderedOn || order.created_at;
  return [supplier, status, date].map(displayValue).filter(Boolean).join(" • ");
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

function formatMoney(value, currency = "") {
  if (value === undefined || value === null || value === "") return "";
  const numeric = numericValue(value);
  if (numeric === null) return displayValue(value);
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol"
      }).format(numeric);
    } catch {
      return `${numeric.toFixed(2)} ${currency}`;
    }
  }
  return numeric.toFixed(2);
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

function normalizeItem(item, index, order = state.selectedOrder) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  const partId = purchaseOrderItem.part || item.part;
  const knownPart = state.partsById.get(partId) || {};
  const part =
    knownPart.part ||
    (Object.keys(knownPart).length ? knownPart : null) ||
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
  const computedValue = numericValue(explicitValue) === null && unitPrice !== null ? unitPrice * normalizedQuantity : explicitValue;
  const lotDetails = firstLotDetails(purchaseOrderItem.lot, item.lot, deepFind(item, ["lot", "batch"]));
  const status = purchaseOrderItem.status || deepFind(item, ["status", "state", "receivedStatus"]) || "";
  const orderDetails = getOrderLabelDetails(order);

  return {
    key: getItemKey(item, index),
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
    price: formatMoney(price, currency),
    value: formatMoney(computedValue, currency),
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

    state.orders = unwrapCollection(payload);
    await loadParts();
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
  const normalizedItems = rawItems.map((item, index) => normalizeItem(item, index, order));
  state.itemsByOrderId.set(orderId, normalizedItems);
  return normalizedItems;
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

async function loadParts() {
  if (state.partsById.size) return;

  try {
    const payload = await bomistFetch("/parts?limit=5000");
    const parts = unwrapCollection(payload);
    state.partsById = new Map(parts.map(part => [part.part?.id || part.id || part._id, part]).filter(([id]) => id));
  } catch {
    state.partsById = new Map();
  }
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

  els.ordersList.innerHTML = state.filteredOrders.map(order => {
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
}

function clearSelection({ persist = false } = {}) {
  state.selectedOrder = null;
  state.selectedItems = [];
  state.selectedItemKeys = new Set();
  els.emptyState.classList.remove("hidden");
  els.orderDetails.classList.add("hidden");
  els.itemsTable.innerHTML = "";
  els.printButton.disabled = true;
  updateSelectionSummary();
  renderOrders();
  if (persist) saveAppState();
}

async function selectOrder(orderId, { persist = true } = {}) {
  const order = state.orders.find(item => String(getOrderId(item)) === String(orderId));
  if (!order) {
    clearSelection({ persist });
    return;
  }

  state.selectedOrder = order;
  state.selectedItems = await loadOrderItems(order);

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

  state.selectedItemKeys = new Set(state.selectedItems.map(item => item.key));
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

els.refreshButton.addEventListener("click", loadOrders);
els.clearBasketButton.addEventListener("click", clearPrintBasket);
els.printButton.addEventListener("click", printLabels);
els.orderSearch.addEventListener("input", filterOrders);
els.repeatByQuantity.addEventListener("change", () => saveAppState());
els.selectAllItemsButton.addEventListener("click", () => setSelectedItems(() => true));
els.selectNoItemsButton.addEventListener("click", () => setSelectedItems(() => false));
els.selectLotItemsButton.addEventListener("click", () => setSelectedItems(item => Boolean(item.lotNumber || item.lotComment)));
els.createLabelPathButton.addEventListener("click", createLabelPath);
els.ordersList.addEventListener("click", event => {
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
