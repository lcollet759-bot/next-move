import { createClient } from '@supabase/supabase-js'

// La clé anon est publique par conception (Supabase anon public key).
// L'accès aux données est protégé par les politiques RLS et le mot de passe de l'app.
const SUPABASE_URL      = 'https://txjschrjzwhvziroexvb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4anNjaHJqendodnppcm9leHZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTIxOTcsImV4cCI6MjA5MTUyODE5N30.aj6vHUry2ROyV-09WfB-y_rp70h-Ox1lwfmTsbZJRxQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
