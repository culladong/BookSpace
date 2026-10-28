
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Account.css";

const API_URL = "http://localhost:3000/api/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(location.state?.message || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login gagal.");
      }

      // Penyimpanan sederhana untuk pengembangan lokal.
      localStorage.setItem("bookspace_token", data.token);
      localStorage.setItem("bookspace_user", JSON.stringify(data.user));

      navigate("/", { replace: true });
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

        <h1>Selamat datang kembali</h1>
        <p className="account-description">
          Login untuk melanjutkan perjalanan membacamu.
        </p>

        {message && <div className="account-message">{message}</div>}

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="account-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="account-field">
            <label htmlFor="login-password">Kata sandi</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="account-submit" disabled={loading}>
            {loading ? "Memproses..." : "Login"}
          </button>
        </form>

        <p className="account-switch">
          Belum punya akun? <Link to="/register">Daftar</Link>
        </p>

        <Link to="/" className="account-back">
          ← Kembali ke katalog
        </Link>
      </section>
    </main>
  );
}
