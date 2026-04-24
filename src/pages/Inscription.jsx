import { useState } from 'react';
import { supabase } from '../services/supabase';

export default function Inscription({ onNavigateToLogin }) {
  const [etape, setEtape] = useState(1);

  // Étape 1 — Identité
  const [prenom, setPrenom]               = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirm, setConfirm]             = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);

  // Étape 2 — Clé API
  const [cleApi, setCleApi]               = useState('');
  const [showCle, setShowCle]             = useState(false);

  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');

  // ── Validation étape 1 ──────────────────────────────────────────────────
  const handleEtape1 = () => {
    setError('');
    if (!prenom.trim() || !email.trim() || !password || !confirm) {
      setError('Remplis tous les champs.');
      return;
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setEtape(2);
  };

  // ── Création compte + profil ─────────────────────────────────────────────
  const handleInscription = async () => {
    setError('');
    if (!cleApi.trim().startsWith('sk-ant-')) {
      setError('La clé API doit commencer par sk-ant-');
      return;
    }
    setLoading(true);
    try {
      // 1. Créer le compte Supabase Auth
      const { data, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;

      // 2. Créer le profil dans la table users
      const { error: profileError } = await supabase.from('users').insert({
        id:                 data.user.id,
        email,
        prenom:             prenom.trim(),
        role:               'user',
        cle_api_anthropic:  cleApi.trim(),
        actif:              true,
      });
      if (profileError) throw profileError;

      setEtape(3);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('Cette adresse email est déjà utilisée.');
      } else {
        setError('Une erreur est survenue. Réessaie.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
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
  };

  const inputWithIconStyle = {
    ...inputStyle,
    padding: '14px 48px 14px 16px',
    marginBottom: 0,
  };

  const btnPrimary = {
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
    marginTop: 8,
    transition: 'background 0.15s',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#1C3829', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: '#C4623A', fontSize: 22, fontWeight: 700, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.5px' }}>&gt;&gt;</span>
        <span style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.3px' }}>Next Move</span>
      </div>

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

        {/* ── ÉTAPE 1 — Identité ── */}
        {etape === 1 && (
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 34, fontWeight: 300, color: '#1C3829', fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>Bienvenue,</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: '#1C3829', fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>crée ton compte.</div>
            </div>

            <input
              type="text"
              placeholder="Prénom"
              value={prenom}
              onChange={e => setPrenom(e.target.value)}
              autoComplete="given-name"
              style={inputStyle}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              style={inputStyle}
            />

            {/* Mot de passe */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mot de passe (min. 8 caractères)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                style={inputWithIconStyle}
              />
              <button
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0, color: '#A09080' }}
                aria-label="Afficher le mot de passe"
              >{showPassword ? '🙈' : '👁'}</button>
            </div>

            {/* Confirmer */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirmer le mot de passe"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                style={inputWithIconStyle}
              />
              <button
                onClick={() => setShowConfirm(v => !v)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0, color: '#A09080' }}
                aria-label="Afficher la confirmation"
              >{showConfirm ? '🙈' : '👁'}</button>
            </div>

            {error && (
              <div style={{ color: '#C4623A', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 16, padding: '10px 14px', background: '#FDF0EB', borderRadius: 8, border: '0.5px solid #C4623A' }}>
                {error}
              </div>
            )}

            <button onClick={handleEtape1} style={btnPrimary}>Continuer →</button>

            <div style={{ textAlign: 'center', color: '#A09080', fontSize: 13, fontFamily: 'Inter, sans-serif', marginTop: 24 }}>
              Déjà un compte ?{' '}
              <button
                onClick={onNavigateToLogin}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1C3829', fontWeight: 600, fontSize: 13, fontFamily: 'Inter, sans-serif', padding: 0, textDecoration: 'underline' }}
              >
                Se connecter →
              </button>
            </div>
          </>
        )}

        {/* ── ÉTAPE 2 — Clé API ── */}
        {etape === 2 && (
          <>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 34, fontWeight: 300, color: '#1C3829', fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>Ta clé API,</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: '#1C3829', fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>dernière étape.</div>
            </div>

            {/* Carte info */}
            <div style={{ background: '#F0EBE3', borderRadius: 10, padding: '14px 16px', marginBottom: 20, border: '0.5px solid #DDD8CE' }}>
              <div style={{ fontSize: 13, color: '#1C3829', fontFamily: 'Inter, sans-serif', lineHeight: 1.6 }}>
                Elle te permet d'utiliser l'IA.<br />
                Elle est chiffrée et n'est jamais partagée.
              </div>
            </div>

            {/* Champ clé */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type={showCle ? 'text' : 'password'}
                placeholder="sk-ant-…"
                value={cleApi}
                onChange={e => setCleApi(e.target.value)}
                autoComplete="off"
                style={inputWithIconStyle}
              />
              <button
                onClick={() => setShowCle(v => !v)}
                style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 0, color: '#A09080' }}
                aria-label="Afficher la clé"
              >{showCle ? '🙈' : '👁'}</button>
            </div>

            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#A09080', fontFamily: 'Inter, sans-serif', marginBottom: 20, display: 'inline-block' }}
            >
              Obtenir ma clé →
            </a>

            {error && (
              <div style={{ color: '#C4623A', fontSize: 13, fontFamily: 'Inter, sans-serif', marginBottom: 16, padding: '10px 14px', background: '#FDF0EB', borderRadius: 8, border: '0.5px solid #C4623A' }}>
                {error}
              </div>
            )}

            <button onClick={handleInscription} disabled={loading} style={btnPrimary}>
              {loading ? 'Création du compte…' : 'Créer mon compte'}
            </button>

            <button
              onClick={() => { setEtape(1); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A09080', fontSize: 13, fontFamily: 'Inter, sans-serif', marginTop: 16, textAlign: 'center', width: '100%' }}
            >
              ← Retour
            </button>
          </>
        )}

        {/* ── ÉTAPE 3 — Confirmation ── */}
        {etape === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
            {/* Icône ✓ */}
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: '#C4623A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
            }}>
              <span style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, lineHeight: 1 }}>✓</span>
            </div>

            <div style={{ fontSize: 24, fontWeight: 700, color: '#1C3829', fontFamily: 'Inter, sans-serif', marginBottom: 8, textAlign: 'center' }}>
              Bienvenue, {prenom} !
            </div>
            <div style={{ fontSize: 16, color: '#A09080', fontFamily: 'Inter, sans-serif', marginBottom: 40, textAlign: 'center' }}>
              Next Move est prêt.
            </div>

            {/* Le onAuthStateChange prend le relais — bouton décoratif */}
            <button
              style={{ ...btnPrimary, marginTop: 0 }}
              disabled
            >
              Démarrer →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
