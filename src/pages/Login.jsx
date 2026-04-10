import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password) return

    setError('')
    setLoading(true)

    try {
      const ok = await login(password)
      if (ok) {
        navigate('/aujourdhui', { replace: true })
      } else {
        setError('Mot de passe incorrect.')
      }
    } catch (err) {
      setError('Une erreur est survenue. Veuillez réessayer.')
      console.error('[Login]', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">✦</div>
        <h1 className="login-title">Next Move</h1>
        <p className="login-subtitle">Saisissez votre mot de passe pour accéder à vos dossiers.</p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <label className="label">Mot de passe</label>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />

          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            style={{ marginTop: 20 }}
            disabled={loading || !password}
          >
            {loading ? 'Vérification…' : 'Accéder'}
          </button>
        </form>
      </div>

      <style>{`
        .login-page {
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          padding: 24px;
        }
        .login-card {
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .login-logo {
          font-size: 40px;
          color: var(--green);
          margin-bottom: 14px;
          line-height: 1;
        }
        .login-title {
          font-size: 26px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 8px;
          text-align: center;
        }
        .login-subtitle {
          font-size: 14px;
          color: var(--text-muted);
          text-align: center;
          line-height: 1.55;
          margin-bottom: 28px;
        }
        .login-error {
          color: var(--red);
          font-size: 13px;
          background: var(--red-light);
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          margin-top: 10px;
        }
      `}</style>
    </div>
  )
}
