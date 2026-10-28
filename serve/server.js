
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { requireAuth } from "./auth.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.json({ message: "BookSpace API berjalan!" });
});

// ==========================================
// KATALOG BUKU
// ==========================================

app.get("/api/books", async (req, res) => {
  try {
    const [books] = await pool.query(
      `SELECT id, title, author, category,
              description, price, cover_url, stock
       FROM books
       ORDER BY id DESC`
    );

    res.json(books);
  } catch (error) {
    console.error("Gagal mengambil buku:", error.message);
    res.status(500).json({
      message: "Gagal mengambil data buku.",
    });
  }
});

// ==========================================
// KERANJANG BELANJA
// ==========================================

// Mengambil keranjang milik pengguna yang login
app.get("/api/cart", requireAuth, async (req, res) => {
  try {
    const [items] = await pool.execute(
      `SELECT
         ci.book_id,
         ci.quantity,
         b.title,
         b.author,
         b.category,
         b.price,
         b.cover_url,
         b.stock,
         (b.price * ci.quantity) AS subtotal
       FROM cart_items ci
       JOIN books b ON b.id = ci.book_id
       WHERE ci.user_id = ?
       ORDER BY ci.updated_at DESC`,
      [req.user.id]
    );

    const total = items.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0
    );

    const itemCount = items.reduce(
      (sum, item) => sum + Number(item.quantity),
      0
    );

    res.json({ items, total, itemCount });
  } catch (error) {
    console.error("Gagal mengambil keranjang:", error.message);
    res.status(500).json({
      message: "Gagal mengambil keranjang.",
    });
  }
});

// Menambahkan buku ke keranjang
app.post("/api/cart", requireAuth, async (req, res) => {
  const bookId = Number(req.body?.bookId);
  const quantity =
    req.body?.quantity === undefined
      ? 1
      : Number(req.body.quantity);

  if (
    !Number.isSafeInteger(bookId) ||
    bookId < 1 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    return res.status(400).json({
      message: "ID buku atau jumlah tidak valid.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [books] = await connection.execute(
      "SELECT id, stock FROM books WHERE id = ? FOR UPDATE",
      [bookId]
    );

    if (books.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Buku tidak ditemukan.",
      });
    }

    const stock = Number(books[0].stock);

    const [existing] = await connection.execute(
      `SELECT quantity FROM cart_items
       WHERE user_id = ? AND book_id = ?
       FOR UPDATE`,
      [req.user.id, bookId]
    );

    const currentQuantity =
      existing.length > 0
        ? Number(existing[0].quantity)
        : 0;

    const newQuantity = currentQuantity + quantity;

    if (
      !Number.isSafeInteger(newQuantity) ||
      newQuantity > stock
    ) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: `Stok tersedia hanya ${stock} buku.`,
      });
    }

    if (existing.length > 0) {
      await connection.execute(
        `UPDATE cart_items
         SET quantity = ?
         WHERE user_id = ? AND book_id = ?`,
        [newQuantity, req.user.id, bookId]
      );
    } else {
      await connection.execute(
        `INSERT INTO cart_items (user_id, book_id, quantity)
         VALUES (?, ?, ?)`,
        [req.user.id, bookId, quantity]
      );
    }

    await connection.commit();
    transactionStarted = false;

    res.json({
      message: "Buku berhasil ditambahkan ke keranjang.",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Gagal menambahkan buku:", error.message);
    res.status(500).json({
      message: "Gagal menambahkan buku ke keranjang.",
    });
  } finally {
    if (connection) connection.release();
  }
});

// Mengubah jumlah buku dalam keranjang
app.patch("/api/cart/:bookId", requireAuth, async (req, res) => {
  const bookId = Number(req.params.bookId);
  const quantity = Number(req.body?.quantity);

  if (
    !Number.isSafeInteger(bookId) ||
    bookId < 1 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    return res.status(400).json({
      message: "ID buku atau jumlah tidak valid.",
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [books] = await connection.execute(
      "SELECT id, stock FROM books WHERE id = ? FOR UPDATE",
      [bookId]
    );

    if (books.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Buku tidak ditemukan.",
      });
    }

    const [items] = await connection.execute(
      `SELECT quantity FROM cart_items
       WHERE user_id = ? AND book_id = ?
       FOR UPDATE`,
      [req.user.id, bookId]
    );

    if (items.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Item tidak ditemukan di keranjang.",
      });
    }

    const stock = Number(books[0].stock);

    if (quantity > stock) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: `Stok tersedia hanya ${stock} buku.`,
      });
    }

    await connection.execute(
      `UPDATE cart_items
       SET quantity = ?
       WHERE user_id = ? AND book_id = ?`,
      [quantity, req.user.id, bookId]
    );

    await connection.commit();
    transactionStarted = false;

    res.json({
      message: "Jumlah buku berhasil diperbarui.",
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Gagal memperbarui keranjang:", error.message);
    res.status(500).json({
      message: "Gagal memperbarui keranjang.",
    });
  } finally {
    if (connection) connection.release();
  }
});

// Menghapus satu buku dari keranjang
app.delete("/api/cart/:bookId", requireAuth, async (req, res) => {
  const bookId = Number(req.params.bookId);

  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    return res.status(400).json({
      message: "ID buku tidak valid.",
    });
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM cart_items
       WHERE user_id = ? AND book_id = ?`,
      [req.user.id, bookId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Item tidak ditemukan di keranjang.",
      });
    }

    res.json({ message: "Buku berhasil dihapus." });
  } catch (error) {
    console.error("Gagal menghapus buku:", error.message);
    res.status(500).json({
      message: "Gagal menghapus buku dari keranjang.",
    });
  }
});

// Mengosongkan keranjang pengguna
app.delete("/api/cart", requireAuth, async (req, res) => {
  try {
    await pool.execute(
      "DELETE FROM cart_items WHERE user_id = ?",
      [req.user.id]
    );

    res.json({
      message: "Keranjang berhasil dikosongkan.",
    });
  } catch (error) {
    console.error("Gagal mengosongkan keranjang:", error.message);
    res.status(500).json({
      message: "Gagal mengosongkan keranjang.",
    });
  }
});

// ==========================================
// PENDAFTARAN PENGGUNA
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Nama, email, dan kata sandi wajib diisi.",
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        message: "Nama harus terdiri dari 2–100 karakter.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: "Format email tidak valid.",
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Kata sandi harus terdiri dari 8–72 karakter.",
      });
    }

    const [existingUsers] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Email sudah terdaftar.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (?, ?, ?)`,
      [cleanName, cleanEmail, passwordHash]
    );

    res.status(201).json({
      message: "Pendaftaran berhasil. Silakan login.",
      user: {
        id: result.insertId,
        name: cleanName,
        email: cleanEmail,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Email sudah terdaftar.",
      });
    }

    console.error("Gagal mendaftar:", error.message);
    res.status(500).json({ message: "Pendaftaran gagal." });
  }
});

// ==========================================
// LOGIN PENGGUNA
// ==========================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        message: "Email dan kata sandi wajib diisi.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const [users] = await pool.execute(
      `SELECT id, name, email, password_hash
       FROM users
       WHERE email = ?`,
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Email atau kata sandi salah.",
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Email atau kata sandi salah.",
      });
    }

    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET,
      {
        subject: String(user.id),
        expiresIn: "2h",
      }
    );

    res.json({
      message: "Login berhasil.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Gagal login:", error.message);
    res.status(500).json({ message: "Login gagal." });
  }
});

// ==========================================
// PROFIL PENGGUNA
// ==========================================

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, name, email FROM users WHERE id = ?",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "Pengguna tidak ditemukan.",
      });
    }

    res.json({ user: users[0] });
  } catch (error) {
    console.error("Gagal mengambil profil:", error.message);
    res.status(500).json({
      message: "Gagal mengambil profil.",
    });
  }
});

// ==========================================
// MENJALANKAN SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

async function startServer() {
  let connection;

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET belum diatur di file .env");
    }

    connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    connection = null;

    app.listen(PORT, () => {
      console.log(`BookSpace API: http://localhost:${PORT}`);
      console.log(`Katalog: http://localhost:${PORT}/api/books`);
      console.log("Endpoint register, login, dan profil siap.");
      console.log("Endpoint keranjang siap.");
    });
  } catch (error) {
    if (connection) connection.release();

    console.error("Gagal menjalankan backend:", error.message);
    process.exit(1);
  }
}

startServer();
