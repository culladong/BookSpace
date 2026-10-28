
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./index.css";

const API_BASE = "http://localhost:3000/api";

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("bookspace_token");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || `Permintaan gagal (${response.status}).`
    );
  }

  return data;
}

export default function Storefront() {
  const navigate = useNavigate();

  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bookspace_user")) || null;
    } catch {
      return null;
    }
  });

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartError, setCartError] = useState("");
  const [busyBookId, setBusyBookId] = useState(null);
  const [cartMessage, setCartMessage] = useState("");

  // Mengambil katalog buku
  useEffect(() => {
    let active = true;

    async function fetchBooks() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`${API_BASE}/books`);

        if (!response.ok) {
          throw new Error("Gagal mengambil katalog buku.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Format data katalog tidak sesuai.");
        }

        if (active) setBooks(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchBooks();

    return () => {
      active = false;
    };
  }, []);

  // Mengambil keranjang dari MySQL
  const loadCart = useCallback(async () => {
    if (!localStorage.getItem("bookspace_token")) {
      setCart([]);
      return;
    }

    try {
      setCartLoading(true);
      setCartError("");

      const data = await apiRequest("/cart");
      setCart(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setCartError(err.message);

      if (/token|login|kedaluwarsa/i.test(err.message)) {
        setCart([]);
      }
    } finally {
      setCartLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadCart();
    } else {
      setCart([]);
    }
  }, [user, loadCart]);

  // Memastikan jumlah keranjang berdasarkan item yang tersimpan
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + Number(item.price) * Number(item.quantity),
        0
      ),
    [cart]
  );

  const categories = useMemo(
    () => [
      "Semua",
      ...new Set(books.map((book) => book.category).filter(Boolean)),
    ],
    [books]
  );

  const filteredBooks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return books.filter((book) => {
      const matchesCategory =
        category === "Semua" || book.category === category;

      const matchesSearch = [
        book.title,
        book.author,
        book.category,
      ].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      );

      return matchesCategory && matchesSearch;
    });
  }, [books, search, category]);

  async function addToCart(book) {
    if (!user || !localStorage.getItem("bookspace_token")) {
      navigate("/login");
      return;
    }

    setBusyBookId(book.id);
    setCartError("");
    setCartMessage("");

    try {
      await apiRequest("/cart", {
        method: "POST",
        body: JSON.stringify({
          bookId: book.id,
          quantity: 1,
        }),
      });

      await loadCart();
      setCartOpen(true);
      setCartMessage(`${book.title} ditambahkan ke keranjang.`);
    } catch (err) {
      setCartError(err.message);
      setCartOpen(true);
    } finally {
      setBusyBookId(null);
    }
  }

  async function changeQuantity(item, newQuantity) {
    if (newQuantity < 1) {
      await removeFromCart(item.book_id);
      return;
    }

    setBusyBookId(item.book_id);
    setCartError("");
    setCartMessage("");

    try {
      await apiRequest(`/cart/${item.book_id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity: newQuantity }),
      });

      await loadCart();
    } catch (err) {
      setCartError(err.message);
    } finally {
      setBusyBookId(null);
    }
  }

  async function removeFromCart(bookId) {
    setBusyBookId(bookId);
    setCartError("");
    setCartMessage("");

    try {
      await apiRequest(`/cart/${bookId}`, {
        method: "DELETE",
      });

      await loadCart();
      setCartMessage("Buku dihapus dari keranjang.");
    } catch (err) {
      setCartError(err.message);
    } finally {
      setBusyBookId(null);
    }
  }

  async function clearCart() {
    if (!cart.length) return;

    setCartError("");
    setCartMessage("");

    try {
      await apiRequest("/cart", { method: "DELETE" });
      setCart([]);
      setCartMessage("Keranjang berhasil dikosongkan.");
    } catch (err) {
      setCartError(err.message);
    }
  }

  function handleLogout() {
    localStorage.removeItem("bookspace_token");
    localStorage.removeItem("bookspace_user");
    setUser(null);
    setCart([]);
    setCartOpen(false);
    setCartMessage("");
    setCartError("");
    navigate("/");
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="logo" href="#beranda">
          <span className="logo-icon">B</span>
          <span>BookSpace</span>
        </a>

        <nav className="nav-links">
          <a href="#beranda">Beranda</a>
          <a href="#katalog">Katalog</a>
          <a href="#tentang">Tentang</a>
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <span className="user-greeting">
                Halo, {user.name || user.email || "Pembaca"}!
              </span>
              <button
                type="button"
                className="logout-button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          ) : (
            <Link className="login-link" to="/login">
              Login
            </Link>
          )}

          <button
            type="button"
            className="cart-button"
            onClick={() => {
              setCartOpen(true);
              setCartMessage("");
              if (user) loadCart();
            }}
          >
            🛒 Keranjang
            <span className="cart-count">{cartCount}</span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="beranda">
          <div className="hero-content">
            <span className="hero-label">TEMUKAN CERITA BARUMU</span>
            <h1>
              Setiap buku punya
              <br />
              <span>ceritanya sendiri.</span>
            </h1>
            <p>
              Temukan buku yang menginspirasi, menemani, dan membuka
              jendela baru untuk duniamu.
            </p>
            <a className="hero-button" href="#katalog">
              Jelajahi Katalog <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="hero-decoration" aria-hidden="true">
            <span>BOOKS</span>
            <span>IDEAS</span>
            <span>WORLDS</span>
          </div>
        </section>

        <section className="benefits">
          <div className="benefit-item">
            <span aria-hidden="true">📚</span>
            <div>
              <strong>Pilihan Beragam</strong>
              <p>Buku untuk setiap minat</p>
            </div>
          </div>
          <div className="benefit-item">
            <span aria-hidden="true">🌿</span>
            <div>
              <strong>Temukan Inspirasi</strong>
              <p>Ide baru di setiap halaman</p>
            </div>
          </div>
          <div className="benefit-item">
            <span aria-hidden="true">🛍️</span>
            <div>
              <strong>Belanja Praktis</strong>
              <p>Keranjang tersimpan di akunmu</p>
            </div>
          </div>
        </section>

        <section className="catalog-section" id="katalog">
          <div className="section-heading">
            <div>
              <span className="section-eyebrow">KOLEKSI KAMI</span>
              <h2>Jelajahi Katalog</h2>
              <p>Temukan bacaan berikutnya yang akan kamu sukai.</p>
            </div>
          </div>

          <div className="catalog-toolbar">
            <input
              type="search"
              className="search-input"
              placeholder="Cari judul, penulis, atau kategori..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Cari buku"
            />

            <div className="category-filters">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`category-chip ${
                    category === item ? "active" : ""
                  }`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="catalog-status">Memuat katalog buku...</div>
          ) : error ? (
            <div className="catalog-status error">
              {error}
              <button type="button" onClick={() => window.location.reload()}>
                Coba lagi
              </button>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="catalog-status">
              Tidak ada buku yang cocok dengan pencarianmu.
            </div>
          ) : (
            <div className="book-grid">
              {filteredBooks.map((book) => (
                <article className="book-card" key={book.id}>
                  <div className="book-cover-wrap">
                    {book.cover_url ? (
                      <img
                        className="book-cover"
                        src={book.cover_url}
                        alt={`Sampul ${book.title}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="book-cover-placeholder">
                        <span>BOOKSPACE</span>
                        <strong>{book.title}</strong>
                        <small>{book.author}</small>
                      </div>
                    )}
                    <span className="book-category">
                      {book.category}
                    </span>
                  </div>

                  <div className="book-info">
                    <h3>{book.title}</h3>
                    <p className="book-author">{book.author}</p>

                    {book.description && (
                      <p className="book-description">
                        {book.description}
                      </p>
                    )}

                    <div className="book-card-bottom">
                      <div>
                        <strong className="book-price">
                          {formatRupiah(book.price)}
                        </strong>
                        <small className="book-stock">
                          {Number(book.stock) > 0
                            ? `Stok: ${book.stock}`
                            : "Stok habis"}
                        </small>
                      </div>

                      <button
                        type="button"
                        className="add-cart-button"
                        disabled={
                          Number(book.stock) < 1 ||
                          busyBookId === book.id
                        }
                        onClick={() => addToCart(book)}
                      >
                        {busyBookId === book.id
                          ? "Menambahkan..."
                          : Number(book.stock) < 1
                            ? "Habis"
                            : "+ Keranjang"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="about-section" id="tentang">
          <span className="section-eyebrow">TENTANG BOOKSPACE</span>
          <h2>Ruang kecil untuk dunia yang luas.</h2>
          <p>
            BookSpace hadir untuk membantumu menemukan bacaan yang tepat,
            menyimpan pilihan buku favoritmu di keranjang, dan menjadikan
            setiap perjalanan membaca lebih menyenangkan.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <a className="logo footer-logo" href="#beranda">
          <span className="logo-icon">B</span>
          <span>BookSpace</span>
        </a>
        <p>Temukan cerita. Buka dunia.</p>
        <small>© {new Date().getFullYear()} BookSpace</small>
      </footer>

      {cartOpen && (
        <div
          className="cart-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCartOpen(false);
            }
          }}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Keranjang belanja"
          >
            <div className="cart-drawer-header">
              <div>
                <span className="section-eyebrow">BOOKSPACE</span>
                <h2>Keranjangmu</h2>
                <p>{cartCount} buku dalam keranjang</p>
              </div>
              <button
                type="button"
                className="cart-close-button"
                aria-label="Tutup keranjang"
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>

            {!user ? (
              <div className="cart-empty">
                <div className="cart-empty-icon">🛍️</div>
                <h3>Login untuk mulai berbelanja</h3>
                <p>
                  Masuk ke akunmu agar keranjang dapat tersimpan di
                  database.
                </p>
                <button
                  type="button"
                  className="checkout-button"
                  onClick={() => navigate("/login")}
                >
                  Login sekarang
                </button>
              </div>
            ) : cartLoading && cart.length === 0 ? (
              <div className="cart-empty">
                <p>Memuat keranjang...</p>
              </div>
            ) : cartError && cart.length === 0 ? (
              <div className="cart-empty">
                <h3>Keranjang belum dapat dimuat</h3>
                <p>{cartError}</p>
                <button
                  type="button"
                  className="checkout-button"
                  onClick={loadCart}
                >
                  Coba lagi
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div className="cart-empty">
                <div className="cart-empty-icon">📚</div>
                <h3>Keranjang masih kosong</h3>
                <p>Yuk, temukan buku yang menarik perhatianmu.</p>
                <button
                  type="button"
                  className="checkout-button"
                  onClick={() => {
                    setCartOpen(false);
                    document
                      .getElementById("katalog")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  Jelajahi katalog
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <article className="cart-item" key={item.book_id}>
                      {item.cover_url ? (
                        <img
                          className="cart-item-cover"
                          src={item.cover_url}
                          alt={`Sampul ${item.title}`}
                        />
                      ) : (
                        <div className="cart-item-cover cart-item-placeholder">
                          📖
                        </div>
                      )}

                      <div className="cart-item-details">
                        <h3>{item.title}</h3>
                        <p>{item.author}</p>
                        <strong>{formatRupiah(item.price)}</strong>

                        <div className="cart-item-actions">
                          <div className="quantity-control">
                            <button
                              type="button"
                              aria-label={`Kurangi jumlah ${item.title}`}
                              disabled={busyBookId === item.book_id}
                              onClick={() =>
                                changeQuantity(
                                  item,
                                  Number(item.quantity) - 1
                                )
                              }
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              aria-label={`Tambah jumlah ${item.title}`}
                              disabled={
                                busyBookId === item.book_id ||
                                Number(item.quantity) >= Number(item.stock)
                              }
                              onClick={() =>
                                changeQuantity(
                                  item,
                                  Number(item.quantity) + 1
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            className="remove-cart-item"
                            disabled={busyBookId === item.book_id}
                            onClick={() => removeFromCart(item.book_id)}
                          >
                            Hapus
                          </button>
                        </div>

                        <p className="cart-item-subtotal">
                          Subtotal:{" "}
                          {formatRupiah(
                            Number(item.price) * Number(item.quantity)
                          )}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="cart-drawer-footer">
                  {cartMessage && (
                    <p className="cart-success-message">{cartMessage}</p>
                  )}
                  {cartError && (
                    <p className="cart-error-message">{cartError}</p>
                  )}

                  <div className="cart-total-row">
                    <span>Total belanja</span>
                    <strong>{formatRupiah(cartTotal)}</strong>
                  </div>

                  <p className="cart-note">
                    Total ini belum termasuk biaya pengiriman.
                  </p>

                  <button
                    type="button"
                    className="checkout-button"
                    onClick={() =>
                      setCartMessage(
                        "Keranjang tersimpan. Fitur checkout akan dibuat pada tahap berikutnya."
                      )
                    }
                  >
                    Lanjut ke checkout
                  </button>

                  <button
                    type="button"
                    className="clear-cart-button"
                    onClick={clearCart}
                    disabled={Boolean(busyBookId)}
                  >
                    Kosongkan keranjang
                  </button>
                </div>
              </>
            )}

            {user && cartError && cart.length > 0 && (
              <p className="cart-error-message cart-global-error">
                {cartError}
              </p>
            )}
            {user && cartMessage && cart.length === 0 && (
              <p className="cart-success-message cart-global-error">
                {cartMessage}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
