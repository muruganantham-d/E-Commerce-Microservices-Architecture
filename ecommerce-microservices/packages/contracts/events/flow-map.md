# Event Flow Map

## Place Order
1. `order-service` receives place-order request.
2. `order-service` validates user/product synchronously (gRPC) where required.
3. `order-service` persists the order and publishes `order.created` to `ecom.order.order.v1` (key=`orderId`).
4. `product-service` consumes `order.created`, allocates/decrements stock, and publishes `inventory.updated` to `ecom.product.inventory.v1` (key=`productId`).
5. `order-service` consumes `inventory.updated`.
6. If stock allocation fails or is reversed, `order-service` emits `order.cancelled` to `ecom.order.order.v1`.

## Product Update
1. `product-service` updates product catalog data.
2. `product-service` publishes `product.updated` to `ecom.product.catalog.v1` (key=`productId`).
3. Downstream consumers (for example `order-service`) refresh local caches/read models.
4. When quantity changes, `product-service` also publishes `inventory.updated` to `ecom.product.inventory.v1`.
