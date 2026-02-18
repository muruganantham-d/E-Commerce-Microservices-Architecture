import { useEffect, useMemo, useState } from "react";
import { loginUser, registerUser } from "./api/auth.client";
import { createProduct, getProductById, listProducts } from "./api/product.client";
import { placeOrder } from "./api/order.client";
import { useAuthStore } from "./store/auth.store";

function parseError(error) {
  const message =
    error &&
    error.response &&
    error.response.data &&
    (error.response.data.error || error.response.data.message);

  if (message) {
    return message;
  }

  return error && error.message ? error.message : "Unexpected error";
}

function App() {
  const { token, user, setAuth, clearAuth } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [products, setProducts] = useState([]);
  const [productsBusy, setProductsBusy] = useState(false);
  const [productsError, setProductsError] = useState("");

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("10");
  const [newInventory, setNewInventory] = useState("10");
  const [createBusy, setCreateBusy] = useState(false);

  const [orderBusyByProductId, setOrderBusyByProductId] = useState({});
  const [quantityByProductId, setQuantityByProductId] = useState({});
  const [orderLogs, setOrderLogs] = useState([]);

  const userId = useMemo(() => (user ? user.userId : ""), [user]);

  async function refreshProducts() {
    setProductsBusy(true);
    setProductsError("");
    try {
      const items = await listProducts();
      setProducts(Array.isArray(items) ? items : []);
    } catch (error) {
      setProductsError(parseError(error));
    } finally {
      setProductsBusy(false);
    }
  }

  useEffect(() => {
    refreshProducts();
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const response = await loginUser({
        email: email.trim(),
        password
      });
      setAuth(response.token, response.user);
      setAuthMessage(`Logged in as ${response.user.email} (${response.user.userId})`);
      await refreshProducts();
    } catch (error) {
      setAuthError(parseError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      await registerUser({
        email: email.trim(),
        password
      });
      const response = await loginUser({
        email: email.trim(),
        password
      });
      setAuth(response.token, response.user);
      setAuthMessage(`Registered and logged in as ${response.user.email}`);
      await refreshProducts();
    } catch (error) {
      setAuthError(parseError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    clearAuth();
    setAuthMessage("Logged out");
  }

  async function handleCreateProduct(event) {
    event.preventDefault();
    setCreateBusy(true);
    setProductsError("");
    try {
      await createProduct({
        name: newName.trim(),
        price: Number(newPrice),
        inventory: Number(newInventory)
      });
      setNewName("");
      setNewPrice("10");
      setNewInventory("10");
      await refreshProducts();
    } catch (error) {
      setProductsError(parseError(error));
    } finally {
      setCreateBusy(false);
    }
  }

  function setOrderBusy(productId, value) {
    setOrderBusyByProductId((previous) => ({
      ...previous,
      [productId]: value
    }));
  }

  async function handlePlaceOrder(product) {
    if (!userId) {
      setAuthError("Login is required before placing an order.");
      return;
    }

    const productId = product.productId;
    const quantity = Number(quantityByProductId[productId] || 1);
    if (quantity <= 0) {
      setProductsError("Order quantity must be greater than zero.");
      return;
    }

    const idempotencyKey = `web-order-${Date.now()}-${productId}`;
    setOrderBusy(productId, true);
    setProductsError("");

    try {
      const before = await getProductById(productId);
      const order = await placeOrder(
        {
          userId,
          items: [
            {
              productId,
              quantity,
              unitPrice: Number(product.price)
            }
          ]
        },
        idempotencyKey
      );
      const after = await getProductById(productId);
      const delta = Number(before.inventory) - Number(after.inventory);

      const message = `orderId=${order.orderId} productId=${productId} qty=${quantity} inventory ${before.inventory} -> ${after.inventory} (delta=${delta}) idempotencyKey=${idempotencyKey}`;
      setOrderLogs((previous) => [message, ...previous].slice(0, 8));
      await refreshProducts();
    } catch (error) {
      setProductsError(parseError(error));
    } finally {
      setOrderBusy(productId, false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <h1>Ecom Web</h1>
        <p className="subtle">Auth + Product + Order UI against backend services.</p>
        <p className="subtle">Auth: 127.0.0.1:4001, Product: 127.0.0.1:4002, Order: 127.0.0.1:4003</p>
      </section>

      <section className="panel">
        <h2>Login / Register</h2>
        <form className="form" onSubmit={handleLogin}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password123"
              required
            />
          </label>
          <div className="actions">
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Logging in..." : "Login"}
            </button>
            <button type="button" disabled={authBusy} onClick={handleRegister}>
              {authBusy ? "Please wait..." : "Register"}
            </button>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </form>
        <p className="subtle">JWT stored in Zustand + localStorage.</p>
        <p className="token">Token: {token ? `${token.slice(0, 24)}...` : "not logged in"}</p>
        <p className="token">User: {user ? `${user.email} (${user.userId})` : "none"}</p>
        {authMessage ? <p className="ok">{authMessage}</p> : null}
        {authError ? <p className="error">{authError}</p> : null}
      </section>

      <section className="panel">
        <h2>Create Product</h2>
        <form className="form" onSubmit={handleCreateProduct}>
          <label>
            Name
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New product"
              required
            />
          </label>
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
              required
            />
          </label>
          <label>
            Inventory
            <input
              type="number"
              min="0"
              step="1"
              value={newInventory}
              onChange={(event) => setNewInventory(event.target.value)}
              required
            />
          </label>
          <div className="actions">
            <button type="submit" disabled={createBusy}>
              {createBusy ? "Creating..." : "Create Product"}
            </button>
            <button type="button" onClick={refreshProducts} disabled={productsBusy}>
              Refresh
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Products</h2>
        {productsBusy ? <p className="subtle">Loading products...</p> : null}
        {productsError ? <p className="error">{productsError}</p> : null}
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Inventory</th>
                <th>Order Qty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="5">No products yet</td>
                </tr>
              ) : (
                products.map((product) => {
                  const productId = product.productId;
                  const busy = Boolean(orderBusyByProductId[productId]);
                  return (
                    <tr key={productId}>
                      <td>
                        <strong>{product.name}</strong>
                        <div className="subtle">{productId}</div>
                      </td>
                      <td>
                        {product.currency} {product.price}
                      </td>
                      <td>{product.inventory}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={quantityByProductId[productId] || "1"}
                          onChange={(event) =>
                            setQuantityByProductId((previous) => ({
                              ...previous,
                              [productId]: event.target.value
                            }))
                          }
                        />
                      </td>
                      <td>
                        <button type="button" onClick={() => handlePlaceOrder(product)} disabled={busy}>
                          {busy ? "Ordering..." : "Place Order"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Order Logs</h2>
        {orderLogs.length === 0 ? (
          <p className="subtle">No orders placed from UI yet.</p>
        ) : (
          <ul className="logs">
            {orderLogs.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
