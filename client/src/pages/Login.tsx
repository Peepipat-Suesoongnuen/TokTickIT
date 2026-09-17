import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext.js";

// All account-specific failures share one safe generic message so unknown
// email, wrong password, inactive, and locked accounts stay
// indistinguishable (api-spec §3.1). Inactive users authenticate through the
// same generic 401 path — no separate account-state copy exists.
function loginErrorMessage(err: unknown): string {
  const e = err as {
    status?: number;
    body?: { error?: { code?: string; message?: string } } | null;
  };
  const status = e?.status;
  const code = e?.body?.error?.code;
  if (status === 401 || code === "INVALID_CREDENTIALS") {
    return "Invalid email or password.";
  }
  if (status === 429 || code === "TOO_MANY_ATTEMPTS") {
    return "Too many login attempts. Please try again later.";
  }
  return "Unable to sign in. Please try again.";
}

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const emailRequired = email.trim().length === 0;
    const passwordRequired = password.length === 0;
    setEmailError(emailRequired ? "Email is required." : "");
    setPasswordError(passwordRequired ? "Password is required." : "");
    setFormError("");
    if (emailRequired || passwordRequired) {
      document.getElementById(emailRequired ? "login-email" : "login-password")?.focus();
      return;
    }
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setFormError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container py-4 d-flex flex-column align-items-center">
      <div className="w-100" style={{ maxWidth: 480 }}>
      <h1 className="h4 mb-1">
        TokTickIT <span className="text-success">IT Service Desk</span>
      </h1>
      <p>Sign in with your TokTickIT account to continue.</p>
      <div className="card p-4">
        <form onSubmit={onSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="login-email" className="form-label">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailError && <div className="invalid-feedback d-block">{emailError}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="login-password" className="form-label">
              Password
            </label>
            <div className="input-group">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-outline-secondary text-success"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => {
                  setShowPassword((s) => !s);
                  document.getElementById("login-password")?.focus();
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"></path>
                  <circle cx="12" cy="12" r="2.5"></circle>
                  {showPassword && <path d="M4 4l16 16"></path>}
                </svg>
              </button>
            </div>
            {passwordError && <div className="invalid-feedback d-block">{passwordError}</div>}
          </div>
          {formError && (
            <div role="alert" className="alert alert-danger">
              {formError}
            </div>
          )}
          <button type="submit" className="btn btn-success w-100" disabled={busy}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
      </div>
    </main>
  );
}
