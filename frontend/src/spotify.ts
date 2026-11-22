const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const redirectUri = `${window.location.origin}/spotify-callback`;
const scopes = ["user-read-private","user-read-email","playlist-read-private","playlist-read-collaborative","user-read-playback-state","user-modify-playback-state","user-read-currently-playing"];

function randomString(length:number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, v => chars[v % chars.length]).join("");
}
async function challenge(verifier:string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
}
export async function connectSpotify() {
  if (!clientId) throw new Error("Add VITE_SPOTIFY_CLIENT_ID to frontend/.env first.");
  const verifier = randomString(64);
  sessionStorage.setItem("spotify_verifier", verifier);
  const codeChallenge = await challenge(verifier);
  const params = new URLSearchParams({
    client_id:clientId, response_type:"code", redirect_uri:redirectUri,
    code_challenge_method:"S256", code_challenge:codeChallenge, scope:scopes.join(" ")
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}
export async function finishSpotifyLogin(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;
  const verifier = sessionStorage.getItem("spotify_verifier");
  if (!verifier || !clientId) throw new Error("Spotify login session missing. Please reconnect.");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:clientId,grant_type:"authorization_code",code,redirect_uri:redirectUri,code_verifier:verifier})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Spotify authorization failed.");
  sessionStorage.setItem("spotify_access_token", data.access_token);
  if (data.refresh_token) sessionStorage.setItem("spotify_refresh_token", data.refresh_token);
  sessionStorage.removeItem("spotify_verifier");
  window.history.replaceState({}, document.title, "/");
  return data.access_token as string;
}
export function spotifyToken() { return sessionStorage.getItem("spotify_access_token"); }
export function disconnectSpotify() {
  sessionStorage.removeItem("spotify_access_token");
  sessionStorage.removeItem("spotify_refresh_token");
}
export async function spotifyGet(path:string) {
  const token = spotifyToken();
  if (!token) throw new Error("Connect Spotify first.");
  const response = await fetch(`https://api.spotify.com/v1/${path}`, {headers:{Authorization:`Bearer ${token}`}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Spotify API request failed.");
  return data;
}
export async function spotifyCommand(path:string, method="PUT") {
  const token = spotifyToken();
  if (!token) throw new Error("Connect Spotify first.");
  const response = await fetch(`https://api.spotify.com/v1/${path}`, {method,headers:{Authorization:`Bearer ${token}`}});
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(()=>({}));
    throw new Error(data.error?.message || "Playback command unavailable. Check Premium and active device.");
  }
}
