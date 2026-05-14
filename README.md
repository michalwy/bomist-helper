# BOMist Helper

Local web app for working with the BOMist API. The first implemented workflow includes:

- loading the order list from local BOMist,
- showing the items of the selected order,
- distributing invoice-level extra costs across order items,
- preparing a shared print selection from one or more orders,
- normalizing part values by inserting a space between the number and unit and adding ohm units when missing,
- creating BOMist label trees from pasted label paths.

The main navigation separates order workflows, part-focused tools, label tools, and settings. The `Orders` workspace contains purchase-order loading, cost distribution, and print selection. The `Parts` workspace contains tools that operate directly on parts. The `Labels` workspace contains global label tools such as label path creation.

## Run Locally

1. In BOMist, enable the local API in `Settings > API`.
2. Make sure the API is available at `http://localhost:3333`.
3. Run this in the project directory:

```bash
npm start
```

4. Open the app:

```text
http://localhost:3000
```

## Default Integration

The app uses these BOMist 2.14.x endpoints:

- order list: `GET /purchase_orders?limit=100`
- order items: `GET /purchase_orders/{id}/items`
- order item update: `PUT /purchase_orders/{orderId}/items/{itemId}`
- part list: `GET /parts?limit=5000`
- parts for enriching labels: `GET /parts/{part_id}` for parts used by loaded order items
- part update: `PUT /parts/{part_id}`
- labels for display and path creation: `GET /labels?limit=5000`
- label creation: `POST /labels`

The `Settings` workspace lets you change the API URL without editing code. Endpoint paths are fixed to the BOMist 2.14.x API shape, and the API URL setting is stored locally in the browser.

## Additional Cost Distribution

After selecting an order, use `Distribute additional costs` to enter shipping, tax, or other invoice-level cost rows. You can also enter named invoice-only items for rows that exist on the real invoice but should not be added to BOMist. The app includes those invoice-only values in the proportional split, then updates only existing BOMist order items with recalculated unit price and total value. Item values are calculated to two decimal places, while unit prices are calculated and saved with up to six decimal places.

Additional costs are distributed in cents across all participating values using the largest-remainder method, so rounding does not leave an undistributed cent. Invoice-only rows can receive part of that cent-level distribution, but only BOMist item rows are updated.

Draft cost rows and invoice-only items are stored in browser state per order while editing. When you use `Update BOMist items`, the app also writes BOMist Helper metadata to a BOMist document attached to the purchase order. The document is named `BOMist Helper Data - <order number>`, uses the category `BOMist Helper`, and stores JSON in `notes`. It includes the extra cost rows, invoice-only item labels and values, totals, currency, apply timestamp, original item price/value, and the last allocated cost per item. When you later reopen the order, the app can prefill the previous costs and recalculate from the original item values instead of adding costs on top of already adjusted prices. If an existing item price has changed in BOMist since the last helper allocation, the app uses the current BOMist value as the new base for that item. Setting all additional costs to zero on an order with saved metadata restores original BOMist item prices. Invoice-only rows are still never sent as BOMist order items.

## Part Value Normalization

In the `Parts` workspace, use `Normalize part values` to scan all parts and preview values where the numeric value touches a recognized unit, a resistance value uses compact decimal notation, or a resistance value is missing the ohm symbol. Applying the preview updates only the BOMist part `value` field, changing examples such as `10kΩ`, `4.7uF`, `6.3V`, `4k7`, `10 k`, and `20` to `10 kΩ`, `4.7 uF`, `6.3 V`, `4.7 kΩ`, `10 kΩ`, and `20 Ω`.

## Label Printing

After selecting an order, use the item checkboxes to choose which rows should produce labels. You can move between orders and keep building one shared print selection; the order list shows how many loaded rows are selected for each order. The quick selection buttons can select all rows, no rows, or only rows with LOT data for the current order. Use `Clear basket` to remove all selected rows from all orders. The `Print labels` button opens the print view for all selected rows, with an option to repeat labels by item quantity.

## Label Path Creation

In the `Labels` workspace, use `Create label path` to paste a hierarchy with one label per line or labels separated by `>`. The app trims whitespace from each label name, checks existing labels under the same parent, and creates only missing nodes.
