import crypto from "node:crypto";
import { addAccount, buildAccount, getOAuthClients, loadAccounts, saveOAuthClients, updateAccount, type Account, type OAuthProvider } from "./store.js";

/**
 * OAuth 2.0 con PKCE para apps de escritorio (redirección a loopback). Los tokens se guardan solo en este equipo.
 * El usuario registra su propia app (Client ID) en Google Cloud / Azure: CasaMail no incluye credenciales de terceros.
 */
const MS_SCOPES = ["https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send", "offline_access"];
export const PROVIDERS: Record<OAuthProvider, {
  label: string; preset: "gmail" | "outlook"; redirectHost: string; scopes: string[]; refreshScopes?: string[];
  authUrl: (tenant?: string) => string; tokenUrl: (tenant?: string) => string; extra: Record<string, string>;
}> = {
  google: {
    label: "Google", preset: "gmail", redirectHost: "127.0.0.1", scopes: ["https://mail.google.com/", "openid", "email"],
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: () => "https://oauth2.googleapis.com/token",
    extra: { access_type: "offline", prompt: "consent" },
  },
  microsoft: {
    label: "Microsoft", preset: "outlook", redirectHost: "localhost", scopes: [...MS_SCOPES, "openid", "email", "profile"], refreshScopes: MS_SCOPES,
    authUrl: (t = "common") => `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`, tokenUrl: (t = "common") => `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
    extra: { prompt: "select_account" },
  },
};

// Solo para pruebas automáticas: redirige los endpoints a un proveedor falso local.
const MOCK = process.env.CASAMAIL_OAUTH_MOCK;
const authEndpoint = (p: OAuthProvider, t?: string) => (MOCK ? `${MOCK}/authorize` : PROVIDERS[p].authUrl(t));
const tokenEndpoint = (p: OAuthProvider, t?: string) => (MOCK ? `${MOCK}/token` : PROVIDERS[p].tokenUrl(t));

const b64u = (b: Buffer) => b.toString("base64url");

interface Pending {
  provider: OAuthProvider; verifier: string; redirectUri: string; clientId: string; clientSecret?: string; tenant?: string;
  created: number; status: "pending" | "done" | "error"; email?: string; error?: string;
}
const pending = new Map<string, Pending>();
const TTL = 10 * 60_000;
const sweep = () => { for (const [k, v] of pending) if (Date.now() - v.created > TTL) pending.delete(k); };

export function clientConfig(provider: OAuthProvider) {
  const c = getOAuthClients()[provider] as { clientId: string; clientSecret?: string; tenant?: string } | undefined;
  return c?.clientId ? c : null;
}
export function saveClient(provider: OAuthProvider, c: { clientId?: string; clientSecret?: string; tenant?: string }) {
  if (!c.clientId) return;
  const all = getOAuthClients(), old = (all[provider] ?? {}) as { clientSecret?: string };
  // un secreto vacío o enmascarado conserva el guardado
  const clientSecret = c.clientSecret && !c.clientSecret.startsWith("••••") ? c.clientSecret : old.clientSecret;
  (all as Record<string, unknown>)[provider] = { clientId: c.clientId.trim(), ...(clientSecret ? { clientSecret: clientSecret.trim() } : {}), ...(c.tenant ? { tenant: c.tenant.trim() } : {}) };
  saveOAuthClients(all);
}

export function redirectUriFor(provider: OAuthProvider, port: number) {
  return `http://${PROVIDERS[provider].redirectHost}:${port}/oauth/callback`;
}

/** Paso 1: genera la URL de autorización (PKCE S256 + state aleatorio de un solo uso). */
export function startAuth(provider: OAuthProvider, redirectUri: string, loginHint?: string) {
  sweep();
  const c = clientConfig(provider);
  if (!c) throw new Error(`Falta el Client ID de ${PROVIDERS[provider].label}. Configúralo primero.`);
  const verifier = b64u(crypto.randomBytes(48)), state = b64u(crypto.randomBytes(24));
  pending.set(state, { provider, verifier, redirectUri, clientId: c.clientId, clientSecret: c.clientSecret, tenant: c.tenant, created: Date.now(), status: "pending" });
  const q = new URLSearchParams({
    client_id: c.clientId, redirect_uri: redirectUri, response_type: "code", scope: PROVIDERS[provider].scopes.join(" "),
    state, code_challenge: b64u(crypto.createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
    ...PROVIDERS[provider].extra, ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return { url: `${authEndpoint(provider, c.tenant)}?${q}`, state };
}

async function tokenRequest(url: string, body: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };
  if (!r.ok || j.error) { const e = new Error(j.error_description || j.error || `HTTP ${r.status}`) as Error & { code?: string }; e.code = j.error; throw e; }
  return j;
}

function emailFromIdToken(idt?: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(idt!.split(".")[1], "base64url").toString("utf8")) as { email?: string; preferred_username?: string; upn?: string };
    return (p.email || p.preferred_username || p.upn || "").toLowerCase() || null;
  } catch { return null; }
}

/** Paso 2: el navegador volvió al callback. Canjea el código, crea/actualiza la cuenta. */
export async function completeAuth(state: string, q: { code?: string; error?: string; error_description?: string }): Promise<{ ok: boolean; email?: string; error?: string }> {
  const p = pending.get(state);
  if (!p || p.status !== "pending" || Date.now() - p.created > TTL) return { ok: false, error: "Solicitud no válida o caducada. Vuelve a empezar desde CasaMail." };
  const fail = (error: string) => { p.status = "error"; p.error = error; return { ok: false, error }; };
  if (q.error) return fail(q.error_description || q.error);
  if (!q.code) return fail("El proveedor no devolvió ningún código.");
  try {
    const t = await tokenRequest(tokenEndpoint(p.provider, p.tenant), {
      grant_type: "authorization_code", code: q.code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: p.verifier,
      ...(p.clientSecret ? { client_secret: p.clientSecret } : {}),
    });
    if (!t.refresh_token) return fail("El proveedor no entregó permiso de larga duración (refresh token). Revoca el acceso previo de CasaMail en tu cuenta y reintenta.");
    const email = emailFromIdToken(t.id_token);
    if (!email) return fail("No se pudo determinar el email de la cuenta.");
    const existing = loadAccounts().find((a) => a.email.toLowerCase() === email);
    const acc = buildAccount({ id: existing?.id, email, pass: "", preset: PROVIDERS[p.provider].preset });
    acc.oauth = { provider: p.provider, clientId: p.clientId, clientSecret: p.clientSecret, tenant: p.tenant, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
    addAccount(acc);
    p.status = "done"; p.email = email;
    return { ok: true, email };
  } catch (e) { return fail((e as Error).message); }
}

export function status(state: string) {
  const p = pending.get(state);
  if (!p) return { status: "unknown" as const };
  const r = { status: p.status, email: p.email, error: p.error };
  if (p.status !== "pending") pending.delete(state);
  return r;
}

// ---------- tokens de acceso ----------
export class ReauthError extends Error { constructor(m: string) { super(m); this.name = "ReauthError"; } }
const inflight = new Map<string, Promise<string>>();

/** Devuelve un access token válido; lo renueva (y lo guarda) si caducó o está por caducar. */
export async function getAccessToken(acc: Account): Promise<string> {
  const latest = loadAccounts().find((a) => a.id === acc.id)?.oauth ?? acc.oauth;
  if (!latest) throw new Error("La cuenta no usa OAuth");
  if (latest.accessToken && (latest.expiresAt ?? 0) - 60_000 > Date.now()) return latest.accessToken;
  let run = inflight.get(acc.id);
  if (!run) {
    run = refresh(acc.id, latest).finally(() => inflight.delete(acc.id));
    inflight.set(acc.id, run);
  }
  return run;
}

async function refresh(id: string, o: NonNullable<Account["oauth"]>): Promise<string> {
  try {
    const sc = PROVIDERS[o.provider].refreshScopes;
    const t = await tokenRequest(tokenEndpoint(o.provider, o.tenant), {
      grant_type: "refresh_token", refresh_token: o.refreshToken, client_id: o.clientId,
      ...(o.clientSecret ? { client_secret: o.clientSecret } : {}), ...(sc ? { scope: sc.join(" ") } : {}),
    });
    if (!t.access_token) throw new Error("Respuesta sin access_token");
    updateAccount(id, (a) => ({ ...a, oauth: { ...a.oauth!, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, refreshToken: t.refresh_token ?? a.oauth!.refreshToken } }));
    return t.access_token;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_grant" || code === "invalid_client" || code === "unauthorized_client")
      throw new ReauthError("La autorización de esta cuenta caducó o fue revocada. Vuelve a conectarla (Ajustes → Cuentas → Reconectar).");
    throw new Error(`No se pudo renovar el acceso OAuth: ${(e as Error).message}`);
  }
}
