
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Account.css";

const API_URL = "http://localhost:3000/api/auth";

export default function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Pendaftaran gagal.");
      }

      navigate("/login", {
        state: {
          message: "Pendaftaran berhasil. Silakan login.",
          email,
        },
      });
    } catch (error) {
      setMessage(
        error.message === "Failed to fetch"
          ? "Backend tidak dapat dihubungi. Pastikan server berjalan."
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="account-page">
      <section className="account-card">
        <Link to="/" className="account-logo">
          Book<span>Space</span>.
        </Link>

        <h1>Buat akun baru</h1>
        <p className="account-description">
          Bergabunglah dengan BookSpace dan temukan bacaan favoritmu.
        </p>

        {message && <div className="account-message">{message}</div>}

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="account-field">
            <label htmlFor="register-name">Nama lengkap</label>
            <input
              id="register-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </div>

          <div className="account-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="account-field">
            <label htmlFor="register-password">Kata sandi</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </div>

          <div className="account-field">
            <label htmlFor="register-confirm">Konfirmasi kata sandi</label>
            <input
              id="register-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />
          </div>

          <button className="account-submit" disabled={loading}>
            {loading ? "Mendaftarkan..." : "Daftar sekarang"}
          </button>
        </form>

        <p className="account-switch">
          Sudah punya akun? <Link to="/login">Login</Link>
        </p>

        <Link to="/" className="account-back">
          ← Kembali ke katalog
        </Link>
      </section>
    </main>
  );
}
