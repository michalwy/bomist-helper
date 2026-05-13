# BOMist Helper

Local web app for working with the BOMist API. The first implemented workflow includes:

- loading the order list from local BOMist,
- showing the items of the selected order,
- distributing invoice-level extra costs across order items,
- preparing a shared print selection from one or more orders,
- creating BOMist label trees from pasted label paths.

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
- parts for enriching labels: `GET /parts?limit=5000`
- labels for display and path creation: `GET /labels?limit=5000`
- label creation: `POST /labels`

The `Integration` panel lets you change the API URL without editing code. Endpoint paths are fixed to the BOMist 2.14.x API shape, and the API URL setting is stored locally in the browser.

## Additional Cost Distribution

After selecting an order, use `Distribute additional costs` to enter shipping, tax, or other invoice-level cost rows. You can also enter invoice-only item values for rows that exist on the real invoice but should not be added to BOMist. The app includes those invoice-only values in the proportional split, then updates only existing BOMist order items with recalculated unit price and total value. Item values are calculated to two decimal places, while unit prices are calculated and saved with up to six decimal places.

Additional costs are distributed in cents across all participating values using the largest-remainder method, so rounding does not leave an undistributed cent. Invoice-only rows can receive part of that cent-level distribution, but only BOMist item rows are updated.

Draft cost rows and invoice-only values are stored in browser state per order. They are not written to BOMist unless you use `Update BOMist items`, and invoice-only rows are never sent to BOMist. After a successful update, the draft values are cleared so the same costs are not applied twice by accident.

## Label Printing

After selecting an order, use the item checkboxes to choose which rows should produce labels. You can move between orders and keep building one shared print selection; the order list shows how many loaded rows are selected for each order. The quick selection buttons can select all rows, no rows, or only rows with LOT data for the current order. Use `Clear basket` to remove all selected rows from all orders. The `Print labels` button opens the print view for all selected rows, with an option to repeat labels by item quantity.

## Label Path Creation

Use the `Create label path` panel to paste a hierarchy with one label per line or labels separated by `>`. The app trims whitespace from each label name, checks existing labels under the same parent, and creates only missing nodes.
