#!/usr/bin/env node
const https = require("https");
const readline = require("readline");
const { parse } = require("url");

const TMDB_KEY = "cc0c294ab8a2535a4ebe9b0604104ffa";
const GITHUB_TOKEN = "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";
const GITHUB_USER = "g91077516-star";
const GITHUB_REPO = "plixtv-data";
const GITHUB_FILE = "movies.json";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const preguntar = t => new Promise(r => rl.question(t, a => r(a.trim())));

function req(url, opts = {}) {
  return new Promise((res, rej) => {
    const u = parse(url);
    const r = https.request({ hostname: u.hostname, path: u.path, method: opts.method || "GET", headers: { "User-Agent": "PlixTV", ...opts.headers } }, resp => {
      let d = ""; resp.on("data", c => d += c); resp.on("end", () => { try { res({ data: JSON.parse(d), status: resp.statusCode }); } catch(e) { res({ data: d, status: resp.statusCode }); } });
    });
    r.on("error", rej); if (opts.body) r.write(opts.body); r.end();
  });
}

async function getFile() {
  const r = await req(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" } });
  return { content: JSON.parse(Buffer.from(r.data.content, "base64").toString()), sha: r.data.sha };
}

async function saveFile(content, sha, msg) {
  const body = JSON.stringify({ message: msg, content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"), sha });
  const r = await req(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, { method: "PUT", headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body });
  return r.status;
}

async function search(name) {
  const [mr, tr] = await Promise.all([
    req(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-419`),
    req(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(name)}&language=es-419`)
  ]);
  return [...(mr.data.results||[]).slice(0,5).map(r=>({...r,_type:"Película",_year:(r.release_date||"?").slice(0,4)})),
          ...(tr.data.results||[]).slice(0,5).map(r=>({...r,_type:"Serie",_year:(r.first_air_date||"?").slice(0,4)}))
  ].sort((a,b)=>(b.popularity||0)-(a.popularity||0)).slice(0,8);
}

async function details(r) {
  const isSerie = r._type === "Serie";
  const res = await req(isSerie ? `https://api.themoviedb.org/3/tv/${r.id}?api_key=${TMDB_KEY}&language=es-419&append_to_response=credits,translations` : `https://api.themoviedb.org/3/movie/${r.id}?api_key=${TMDB_KEY}&language=es-419&append_to_response=credits,translations`);
  return res.data;
}

function titleLatino(d, type) {
  const isSerie = type === "Serie";
  const trans = d.translations?.translations || [];
  const t = trans.find(t => t.iso_639_1==="es"&&t.iso_3166_1==="MX") || trans.find(t => t.iso_639_1==="es"&&t.iso_3166_1==="AR") || trans.find(t => t.iso_639_1==="es");
  if (t) { const title = isSerie ? t.data.name : t.data.title; if (title?.trim()) return title.trim(); }
  return isSerie ? (d.name||d.original_name) : (d.title||d.original_title);
}

async function pedirEpisodios() {
  const eps = []; let T=1, E=1;
  console.log("\n📺 Agregar episodios (Enter sin URL para terminar)\n");
  while(true) {
    const url = await preguntar(`   T${T}E${E} — URL (Enter para terminar): `);
    if (!url) break;
    const titulo = await preguntar(`   T${T}E${E} — Título (Enter saltear): `);
    eps.push({ temporada:T, episodio:E, titulo: titulo||`Episodio ${E}`, streamUrl:url });
    console.log(`   ✓ T${T}E${E} agregado`); E++;
    const c = await preguntar(`   ¿Siguiente T${T}E${E}? (Enter=sí / nro temporada): `);
    if (c && !isNaN(parseInt(c))) { T=parseInt(c); E=1; }
  }
  return eps;
}

async function main() {
  console.log("\n🎬 PLIXTV — Agregar película o serie\n");
  let elegido = null;
  while (!elegido) {
    const input = await preguntar("   Título: ");
    if (!input) continue;
    console.log(`\n🔍 Buscando "${input}"...\n`);
    let res; try { res = await search(input); } catch(e) { console.log("   Error.\n"); continue; }
    if (!res.length) { console.log("   Sin resultados.\n"); continue; }
    console.log("   Resultados:\n");
    res.forEach((r,i) => { const n = r._type==="Serie"?(r.name||r.original_name):(r.title||r.original_title); console.log(`   ${i+1}. ${n} (${r._year}) — ${r._type} ★${r.vote_average?.toFixed(1)||"?"}`); });
    console.log(`   ${res.length+1}. Buscar de nuevo\n`);
    const e = await preguntar("   ¿Cuál? (número): ");
    const idx = parseInt(e)-1;
    if (idx===res.length) { console.log(""); continue; }
    if (isNaN(idx)||idx<0||idx>=res.length) { console.log("   Inválido.\n"); continue; }
    elegido = res[idx];
  }
  const streamUrl = await preguntar("\n   URL del reproductor: ");
  if (!streamUrl) { console.error("❌ Requerido."); rl.close(); process.exit(1); }
  let episodios = [];
  try {
    console.log("\n⏳ Obteniendo info...");
    const d = await details(elegido);
    const type = elegido._type; const isSerie = type==="Serie";
    const title = titleLatino(d, type);
    const year = parseInt((isSerie?d.first_air_date:d.release_date||"0").slice(0,4));
    const runtime = isSerie?(d.episode_run_time?.[0]||0):(d.runtime||0);
    const duration = isSerie?`${runtime}min por ep.`:`${Math.floor(runtime/60)}h ${runtime%60}min`;
    console.log(`\n✅ Info:\n   Título: ${title}\n   Año: ${year}\n   Tipo: ${type}\n   Rating: ★${d.vote_average?.toFixed(1)}`);
    const confirm = await preguntar(`\n   ¿"${title}" es correcto? (Enter=sí / escribí el correcto): `);
    const finalTitle = confirm || title;
    if (isSerie) { const a = await preguntar("\n   ¿Agregar episodios? (s/n): "); if (a.toLowerCase()==="s") episodios = await pedirEpisodios(); }
    rl.close();
    console.log("\n⬆️  Subiendo a GitHub...");
    const { content, sha } = await getFile();
    if (!content.movies) content.movies = [];
    const newId = content.movies.length ? Math.max(...content.movies.map(m=>m.id))+1 : 1;
    content.movies.push({ id:newId, title:finalTitle, year, genres:(d.genres||[]).map(g=>g.name), rating:Math.round((d.vote_average||0)*10)/10, age:"+13", duration, match:"95%", type, poster:d.poster_path?`https://image.tmdb.org/t/p/w500${d.poster_path}`:"", backdrop:d.backdrop_path?`https://image.tmdb.org/t/p/w1280${d.backdrop_path}`:"", streamUrl, description:(d.overview||"Sin descripción.").slice(0,300), actors:(d.credits?.cast||[]).slice(0,5).map(a=>a.name), tags:(d.genres||[]).slice(0,3).map(g=>g.name), ...(episodios.length?{episodios}:{}) });
    const status = await saveFile(content, sha, `Agregar: ${finalTitle}`);
    if (status===200||status===201) { console.log(`\n🎬 "${finalTitle}" subida! (id: ${newId})\n   Ya aparece en la web y la app.\n`); }
    else { console.error(`❌ Error (status: ${status})`); }
  } catch(e) { rl.close(); console.error("\n❌ Error:", e.message); process.exit(1); }
}
main();
