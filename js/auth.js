import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabaseUrl, supabaseKey } from './config.js';
export const db = createClient(supabaseUrl, supabaseKey);
export const $ = id => document.getElementById(id);
export function message(s, error = false) { const e = $('message'); if (e) { e.textContent = s; e.className = error ? 'error' : 'notice'; } }
export async function getAccess() { const { data: { user }, error } = await db.auth.getUser(); if (error || !user) return { user: null }; const [m, r] = await Promise.all([db.from('tbb_memberships').select('status').eq('user_id', user.id).maybeSingle(), db.from('tbb_user_roles').select('role').eq('user_id', user.id)]); if (m.error || r.error) throw new Error(m.error?.message || r.error?.message); return { user, status: m.data?.status || 'pending', admin: (r.data || []).some(x => x.role === 'admin') }; }
export async function route() { const a = await getAccess(); location.href = !a.user ? 'login.html' : a.admin && a.status === 'approved' ? 'admin.html' : a.status === 'approved' ? 'member.html' : 'pending.html'; }
export async function requireAccess(admin = false) { const a = await getAccess(); if (!a.user || a.status !== 'approved' || (admin && !a.admin)) { await route(); return null; } return a; }
export async function logout() { await db.auth.signOut(); location.href = 'login.html'; }
