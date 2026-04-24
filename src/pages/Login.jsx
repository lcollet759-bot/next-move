import { useState } from 'react';
import { signIn } from '../services/db';

export default function Login({ onNavigateToInscription, authErrorMessage }) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Remplis tous les champs.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await signIn(email, password);
      // onAuthStateChange dans AppContext prend le relais automatiquement
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('network') || msg.includes('fetch')) {
        setError('Impossible de se connecter. Vérifie ta connexion.');
      } else {
        setError('Email ou mot de passe incorrect.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F5F0',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1C3829',
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          color: '#C4623A',
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '-0.5px',
        }}>&gt;&gt;</span>
        <span style={{
          color: '#FFFFFF',
          fontSize: 17,
          fontWeight: 700,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '-0.3px',
        }}>Next Move</span>
      </div>

      {/* Contenu */}
      <div style={{
        flex: 1,
        padding: '40px 24px 32px',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 420,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}>
        {/* Titre */}
        <div style={{ marginBottom: 36 }}>
          <div style={{
            fontSize: 34,
            fontWeight: 300,
            color: '#1C3829',
            fontFamily: 'Inter, sans-serif',
            lineHeight: 1.2,
          }}>Bon retour,</div>
          <div style={{
            fontSize: 34,
            fontWeight: 700,
            color: '#1C3829',
            fontFamily: 'Inter, sans-serif',
            lineHeight: 1.2,
          }}>connecte-toi.</div>
        </div>

        {/* Champ email */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="email"
          style={{
            width: '100%',
            padding: '14px 16px',
            background: '#FFFFFF',
            border: '0.5px solid #DDD8CE',
            borderRadius: 10,
            fontSize: 15,
            fontFamily: 'Inter, sans-serif',
            color: '#1C3829',
            outline: 'none',
            marginBottom: 12,
            boxSizing: 'border-box',
          }}
        />

        {/* Champ mot de passe */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '14px 48px 14px 16px',
              background: '#FFFFFF',
              border: '0.5px solid #DDD8CE',
              borderRadius: 10,
              fontSize: 15,
              fontFamily: 'Inter, sans-serif',
              color: '#1C3829',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: 'absolute',
              right: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
              lineHeight: 1,
              color: '#A09080',
            }}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>

        {/* Message d'erreur (compte désactivé ou erreur auth) */}
        {(authErrorMessage || error) && (
          <div style={{
            color: '#C4623A',
            fontSize: 13,
            fontFamily: 'Inter, sans-serif',
            marginBottom: 16,
            padding: '10px 14px',
            background: '#FDF0EB',
            borderRadius: 8,
            border: '0.5px solid #C4623A',
          }}>
            {authErrorMessage || error}
          </div>
        )}

        {/* Bouton Se connecter */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '15px 24px',
            background: loading ? '#A09080' : '#1C3829',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: 28,
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>

        {/* Lien inscription */}
        <div style={{
          textAlign: 'center',
          color: '#A09080',
          fontSize: 13,
          fontFamily: 'Inter, sans-serif',
        }}>
          Pas encore de compte ?{' '}
          <button
            onClick={onNavigateToInscription}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#1C3829',
              fontWeight: 600,
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Créer un compte →
          </button>
        </div>
      </div>
    </div>
  );
}
