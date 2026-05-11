const state = {
  orders: [],
  filteredOrders: [],
  selectedOrder: null,
  selectedItems: [],
  partsById: new Map(),
  lotsById: new Map()
};

const settingsKey = "bomist-helper-settings";
const appStateKey = "bomist-helper-state";
const defaultSettings = {
  apiBaseUrl: "http://localhost:3333",
  ordersEndpoint: "/purchase_orders?limit=100",
  ordersSelector: "{}",
  detailsEndpoint: "/purchase_orders/{id}/items"
};

const defaultAppState = {
  selectedOrderId: "",
  orderSearch: "",
  labelFormat: "medium",
  repeatByQuantity: false
};

const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  refreshButton: document.querySelector("#refreshButton"),
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
  ordersEndpoint: document.querySelector("#ordersEndpoint"),
  ordersSelector: document.querySelector("#ordersSelector"),
  detailsEndpoint: document.querySelector("#detailsEndpoint"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  labelFormat: document.querySelector("#labelFormat"),
  repeatByQuantity: document.querySelector("#repeatByQuantity"),
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

function loadAppState() {
  try {
    return { ...defaultAppState, ...JSON.parse(localStorage.getItem(appStateKey) || "{}") };
  } catch {
    return { ...defaultAppState };
  }
}

function getCurrentAppState() {
  return {
    selectedOrderId: state.selectedOrder ? String(getOrderId(state.selectedOrder) || "") : "",
    orderSearch: els.orderSearch.value,
    labelFormat: els.labelFormat.value,
    repeatByQuantity: els.repeatByQuantity.checked
  };
}

function saveAppState(appState = getCurrentAppState()) {
  localStorage.setItem(appStateKey, JSON.stringify(appState));
}

function applyAppState(appState) {
  els.orderSearch.value = appState.orderSearch || "";
  els.labelFormat.value = appState.labelFormat || defaultAppState.labelFormat;
  els.repeatByQuantity.checked = Boolean(appState.repeatByQuantity);
}

function applySettings(settings) {
  els.apiBaseUrl.value = settings.apiBaseUrl;
  els.ordersEndpoint.value = settings.ordersEndpoint;
  els.ordersSelector.value = settings.ordersSelector;
  els.detailsEndpoint.value = settings.detailsEndpoint;
}

function readSettings() {
  return {
    apiBaseUrl: els.apiBaseUrl.value.trim() || defaultSettings.apiBaseUrl,
    ordersEndpoint: els.ordersEndpoint.value.trim() || defaultSettings.ordersEndpoint,
    ordersSelector: els.ordersSelector.value.trim() || defaultSettings.ordersSelector,
    detailsEndpoint: els.detailsEndpoint.value.trim() || defaultSettings.detailsEndpoint
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
    payload.purchaseOrders
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

function normalizeItem(item, index, order = state.selectedOrder) {
  const purchaseOrderItem = item.purchase_order_item || item.purchaseOrderItem || item;
  const partId = purchaseOrderItem.part || item.part;
  const knownPart = state.partsById.get(partId) || {};
  const part = knownPart.part || item.partSnapshot || item.purchaseItem || item.product || {};
  const quote = item.quote || item.supplierPart || {};
  const description =
    part.description ||
    part.value ||
    purchaseOrderItem.product?.description ||
    deepFind(item, ["description", "name"]) ||
    `Item ${index + 1}`;
  const catalogNumber =
    part.mpn ||
    part.manufacturerPartNumber ||
    part.partNumber ||
    part.ipn ||
    purchaseOrderItem.product?.sku ||
    deepFind(item, ["mpn", "manufacturerPartNumber", "catalogNumber", "sku", "partNumber", "ipn"]) ||
    partId;
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

  return {
    raw: item,
    index: index + 1,
    name: String(description),
    description: String(description),
    catalogNumber: catalogNumber ? String(catalogNumber) : "",
    mpn: catalogNumber ? String(catalogNumber) : "",
    supplier: displayValue(supplier) || displayValue(orderSupplier),
    quantity: normalizedQuantity,
    price: formatMoney(price, currency),
    value: formatMoney(computedValue, currency),
    lot: [lotDetails.number, lotDetails.comment].filter(Boolean).join(" - "),
    lotNumber: lotDetails.number,
    lotComment: lotDetails.comment,
    status: status ? String(status) : ""
  };
}

function setConnection(message, className = "") {
  els.connectionStatus.textContent = message;
  els.connectionStatus.className = className;
}

async function loadOrders() {
  const settings = readSettings();
  const selectedOrderId = state.selectedOrder ? getOrderId(state.selectedOrder) : loadAppState().selectedOrderId;
  setConnection("Connecting to BOMist...");
  els.ordersList.innerHTML = `<div class="hint">Loading orders...</div>`;
  els.printButton.disabled = true;

  try {
    await bomistFetch("/");
    let payload;

    if (settings.ordersEndpoint.startsWith("/search")) {
      payload = await bomistFetch(settings.ordersEndpoint, {
        method: "POST",
        body: settings.ordersSelector
      });
    } else {
      payload = await bomistFetch(settings.ordersEndpoint);
    }

    state.orders = unwrapCollection(payload);
    await loadParts();
    await loadLots();
    filterOrders();
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
    setConnection(`No connection or incompatible endpoint: ${error.message}`, "status-error");
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

function filterOrders() {
  const query = els.orderSearch.value.trim().toLowerCase();
  state.filteredOrders = state.orders.filter(order => {
    const haystack = `${getOrderTitle(order)} ${getOrderMeta(order)} ${getOrderId(order)}`.toLowerCase();
    return haystack.includes(query);
  });
  renderOrders();
  saveAppState();
}

function renderOrders() {
  els.ordersCount.textContent = state.filteredOrders.length;

  if (!state.filteredOrders.length) {
    els.ordersList.innerHTML = `<div class="hint">No orders found. Check the selector or endpoint in the integration panel.</div>`;
    return;
  }

  els.ordersList.innerHTML = state.filteredOrders.map(order => {
    const id = getOrderId(order);
    const active = state.selectedOrder && String(getOrderId(state.selectedOrder)) === String(id) ? " active" : "";
    return `
      <button class="order-row${active}" data-order-id="${escapeHtml(String(id || ""))}">
        <strong>${escapeHtml(getOrderTitle(order))}</strong>
        <span>${escapeHtml(getOrderMeta(order) || String(id || ""))}</span>
      </button>
    `;
  }).join("");
}

function clearSelection({ persist = false } = {}) {
  state.selectedOrder = null;
  state.selectedItems = [];
  els.emptyState.classList.remove("hidden");
  els.orderDetails.classList.add("hidden");
  els.itemsTable.innerHTML = "";
  els.printButton.disabled = true;
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
  let detailsPayload = order;
  const existingItems = getItems(order);

  if (!existingItems.length && orderId) {
    const path = readSettings().detailsEndpoint.replace("{id}", encodeURIComponent(orderId));
    try {
      detailsPayload = await bomistFetch(path);
    } catch {
      detailsPayload = order;
    }
  }

  const rawItems = Array.isArray(detailsPayload) ? unwrapCollection(detailsPayload) : getItems(detailsPayload);
  state.selectedItems = rawItems.map((item, index) => normalizeItem(item, index, order));
  renderOrders();
  renderDetails(order);
  if (persist) saveAppState();
}

function renderDetails(order) {
  els.emptyState.classList.add("hidden");
  els.orderDetails.classList.remove("hidden");
  els.selectedOrderTitle.textContent = getOrderTitle(order);
  els.selectedOrderMeta.textContent = getOrderMeta(order) || getOrderId(order) || "";

  if (!state.selectedItems.length) {
    els.itemsTable.innerHTML = `<tr><td colspan="7">No items found in this order. Check the details endpoint or the data structure in Swagger.</td></tr>`;
    els.printButton.disabled = true;
    return;
  }

  els.itemsTable.innerHTML = state.selectedItems.map(item => `
    <tr>
      <td>${item.index}</td>
      <td><span class="item-name"><strong>${escapeHtml(item.catalogNumber || "-")}</strong><small>${escapeHtml(item.description || "-")}</small></span></td>
      <td class="numeric">${escapeHtml(String(item.quantity))}</td>
      <td class="numeric">${escapeHtml(item.price || "-")}</td>
      <td class="numeric">${escapeHtml(item.value || "-")}</td>
      <td><span class="lot-info"><strong>${escapeHtml(item.lotNumber || "-")}</strong>${item.lotComment ? `<small>${escapeHtml(item.lotComment)}</small>` : ""}</span></td>
      <td>${escapeHtml(item.status || "-")}</td>
    </tr>
  `).join("");
  els.printButton.disabled = false;
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
  const sizes = {
    small: ["50mm", "30mm"],
    medium: ["70mm", "36mm"],
    wide: ["89mm", "36mm"]
  };
  return sizes[els.labelFormat.value] || sizes.medium;
}

function buildLabels() {
  const [width, height] = getLabelSize();
  els.printArea.style.setProperty("--label-width", width);
  els.printArea.style.setProperty("--label-height", height);

  const labels = [];

  for (const item of state.selectedItems) {
    const count = els.repeatByQuantity.checked ? Math.max(1, Math.min(500, Math.round(item.quantity))) : 1;
    for (let copy = 0; copy < count; copy += 1) {
      labels.push(`
        <section class="label">
          <h3>${escapeHtml(item.catalogNumber || item.mpn || "Catalog: -")}</h3>
          <p>${escapeHtml(item.description || "")}</p>
          ${item.lot ? `<p>LOT: ${escapeHtml(item.lot)}</p>` : ""}
          <p class="qty">Qty: ${escapeHtml(String(item.quantity))}</p>
        </section>
      `);
    }
  }

  els.printArea.innerHTML = labels.join("");
}

function printLabels() {
  buildLabels();
  window.print();
}

els.refreshButton.addEventListener("click", loadOrders);
els.printButton.addEventListener("click", printLabels);
els.orderSearch.addEventListener("input", filterOrders);
els.labelFormat.addEventListener("change", () => saveAppState());
els.repeatByQuantity.addEventListener("change", () => saveAppState());
els.ordersList.addEventListener("click", event => {
  const row = event.target.closest(".order-row");
  if (row) selectOrder(row.dataset.orderId);
});
els.saveSettingsButton.addEventListener("click", () => {
  saveSettings(readSettings());
  loadOrders();
});

applySettings(loadSettings());
applyAppState(loadAppState());
loadOrders();
