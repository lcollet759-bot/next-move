import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

const SESSION_KEY = 'app_session'

// Hash SHA-256 du mot de passe fixe — ne jamais afficher en clair dans l'UI
const FIXED_PWD_HASH = '1f0f1a4c65f845e04f6e8610a305752646b99a5596b4e03aedd2671e5cd9e59f'

// ── SHA-256 pur JS — fonctionne sur HTTP et HTTPS ─────────────────────────
// Implémentation conforme RFC 6234, sans dépendance à crypto.subtle.
const SHA256_K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]

function sha256(str) {
  const r  = (x, n) => (x >>> n) | (x << (32 - n))
  const bytes  = new TextEncoder().encode(str)
  const blen   = bytes.length
  const padLen = (blen + 9 + 63) & ~63
  const buf    = new Uint8Array(padLen)
  buf.set(bytes)
  buf[blen] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(padLen - 4, (blen * 8) >>> 0)

  let h0=0x6a09e667, h1=0xbb67ae85, h2=0x3c6ef372, h3=0xa54ff53a
  let h4=0x510e527f, h5=0x9b05688c, h6=0x1f83d9ab, h7=0x5be0cd19

  for (let off = 0; off < padLen; off += 64) {
    const W = new Uint32Array(64)
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i-15],7) ^ r(W[i-15],18) ^ (W[i-15] >>> 3)
      const s1 = r(W[i-2],17) ^ r(W[i-2],19)  ^ (W[i-2]  >>> 10)
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0
    }
    let a=h0, b=h1, c=h2, d=h3, e=h4, f=h5, g=h6, h=h7
    for (let i = 0; i < 64; i++) {
      const S1 = r(e,6)  ^ r(e,11) ^ r(e,25)
      const ch = ((e & f) ^ (~e & g)) >>> 0
      const T1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0
      const S0 = r(a,2)  ^ r(a,13) ^ r(a,22)
      const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0
      const T2 = (S0 + mj) >>> 0
      h=g; g=f; f=e; e=(d+T1)>>>0
      d=c; c=b; b=a; a=(T1+T2)>>>0
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0
  }

  return [h0,h1,h2,h3,h4,h5,h6,h7]
    .map(n => n.toString(16).padStart(8,'0')).join('')
}

// ── Auth provider ─────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!sessionStorage.getItem(SESSION_KEY)
  )

  const login = useCallback(async (password) => {
    const hash = sha256(password)
    if (hash === FIXED_PWD_HASH) {
      sessionStorage.setItem(SESSION_KEY, '1')
      setIsAuthenticated(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    setIsAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
