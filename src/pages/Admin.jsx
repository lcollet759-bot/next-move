import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getAllUsers, toggleUserActif } from '../services/db';

export default function Admin() {
  const { userProfile } = useApp();
  const navigate = useNavigate();
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userProfile?.role !== 'admin') return;
    getAllUsers().then(setUsers).finally(() => setLoading(false));
  }, [userProfile]);

  if (userProfile?.role !== 'admin') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#A09080', fontFamily: 'Inter, sans-serif' }}>
        Accès non autorisé.
      </div>
    );
  }

  const handleToggle = async (userId, currentActif) => {
    if (userId === userProfile.id) return; // l'admin ne peut pas se désactiver lui-même
    const newActif = !currentActif;
    await toggleUserActif(userId, newActif);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, actif: newActif } : u));
  };

  const nbTotal = users.length;

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1C3829', padding: '20px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter, sans-serif', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Retour
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ color: '#C4623A', fontSize: 16, fontWeight: 700, letterSpacing: '-0.5px' }}>&gt;&gt;</span>
        <span style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700 }}>Admin</span>
      </div>

      {/* Corps */}
      <div style={{ padding: '24px 16px 40px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Section Utilisateurs */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#A09080', margin: '0 0 10px 4px' }}>
            Utilisateurs
          </p>

          {loading ? (
            <p style={{ fontSize: 13, color: '#A09080', padding: '16px 0' }}>Chargement…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#DDD8CE', borderRadius: 12, overflow: 'hidden', border: '0.5px solid #DDD8CE' }}>
              {users.map((u, i) => {
                const isAdmin   = u.role === 'admin';
                const isSelf    = u.id === userProfile.id;
                const isFirst   = i === 0;
                const isLast    = i === users.length - 1;

                return (
                  <div
                    key={u.id}
                    style={{
                      background: '#FFFFFF',
                      padding: '13px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderRadius: isFirst ? '12px 12px 0 0' : isLast ? '0 0 12px 12px' : 0,
                    }}
                  >
                    {/* Avatar initiale */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isAdmin ? '#1C3829' : '#F0EBE3',
                      color: isAdmin ? '#FFFFFF' : '#A09080',
                      fontSize: 14, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {u.prenom?.[0]?.toUpperCase() || '?'}
                    </div>

                    {/* Infos */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1C3829', margin: 0, lineHeight: 1.3 }}>
                        {u.prenom || '—'}
                      </p>
                      <p style={{ fontSize: 11, color: '#A09080', margin: 0, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </p>
                      <p style={{ fontSize: 11, color: '#A09080', margin: 0, lineHeight: 1.4, textTransform: 'capitalize' }}>
                        {isAdmin ? 'Admin' : 'Utilisateur'}
                      </p>
                    </div>

                    {/* Indicateur / Toggle */}
                    {isAdmin ? (
                      <span style={{ fontSize: 18, color: '#1C3829', lineHeight: 1 }} title="Admin — toujours actif">●</span>
                    ) : (
                      <button
                        onClick={() => handleToggle(u.id, u.actif)}
                        disabled={isSelf}
                        aria-label={u.actif ? 'Désactiver' : 'Activer'}
                        style={{
                          width: 44, height: 26, borderRadius: 13, border: 'none',
                          background: u.actif ? '#1C3829' : '#DDD8CE',
                          cursor: isSelf ? 'not-allowed' : 'pointer',
                          padding: 0, position: 'relative', flexShrink: 0,
                          transition: 'background 0.2s',
                          opacity: isSelf ? 0.4 : 1,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3,
                          left: u.actif ? 'auto' : 3,
                          right: u.actif ? 3 : 'auto',
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#FFFFFF',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s, right 0.2s',
                        }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section Statistiques */}
        {!loading && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#A09080', margin: '0 0 10px 4px' }}>
              Statistiques
            </p>
            <div style={{ background: '#FFFFFF', borderRadius: 12, border: '0.5px solid #DDD8CE', padding: '16px' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1C3829', margin: 0 }}>
                {nbTotal} utilisateur{nbTotal !== 1 ? 's' : ''}
              </p>
              <p style={{ fontSize: 12, color: '#A09080', margin: '2px 0 0' }}>
                inscrits au total · {users.filter(u => u.actif).length} actifs
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
