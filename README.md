# BOMist Helper

Local web app for working with the BOMist API. The first implemented workflow includes:

- loading the order list from local BOMist,
- showing the items of the selected order,
- preparing printable labels for each item.

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
- parts for enriching labels: `GET /parts?limit=5000`

The `Integration` panel lets you change the API URL and endpoints without editing code. Settings are stored locally in the browser.

## Label Printing

After selecting an order, use the item checkboxes to choose which rows should produce labels. The quick selection buttons can select all rows, no rows, or only rows with LOT data. The `Print labels` button opens the print view for selected rows, with an option to repeat labels by item quantity.
