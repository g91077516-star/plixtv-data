#!/usr/bin/env node
const https = require("https");
const readline = require("readline");
const { parse } = require("url");

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

const CAMPOS_MOVIE = [
  { key:"title", label:"Título" },
  { key:"year", label:"Año", num:true },
  { key:"rating", label:"Rating (ej: 8.5)", num:true },
  { key:"duration", label:"Duración (ej: 2h 10min)" },
  { key:"age", label:"Clasificación (ej: +13)" },
  { key:"description", label:"Descripción" },
  { key:"streamUrl", label:"URL del reproductor" },
  { key:"poster", label:"URL del póster" },
  { key:"backdrop", label:"URL del fondo" },
];
const CAMPOS_CANAL = [
  { key:"name", label:"Nombre" },
  { key:"streamUrl", label:"URL del stream" },
  { key:"logo", label:"URL del logo" },
  { key:"category", label:"Categoría" },
];

async function main() {
  console.log("\n✏️  PLIXTV — Editar\n");
  const tipo = await preguntar("   ¿Qué editar? (1=Película/Serie, 2=Canal): ");
  const esCanal = tipo === "2";
  const { content, sha } = await getFile();
  const lista = esCanal ? (content.channels||[]) : (content.movies||[]);
  if (!lista.length) { console.log("\n   Lista vacía.\n"); rl.close(); return; }
  const input = await preguntar(`   Nombre/Título (o parte): `);
  if (!input) { rl.close(); return; }
  const res = lista.filter(m => (esCanal?m.name:m.title).toLowerCase().includes(input.toLowerCase()));
  if (!res.length) { console.log(`\n   No encontrado.\n`); rl.close(); return; }
  let elegido;
  if (res.length === 1) { elegido = res[0]; }
  else {
    console.log("\n   Resultados:\n");
    res.forEach((m,i) => console.log(`   ${i+1}. ${esCanal?m.name:`${m.title} (${m.year})`}`));
    const e = await preguntar("\n   ¿Cuál? (número): ");
    const idx = parseInt(e)-1;
    if (isNaN(idx)||idx<0||idx>=res.length) { console.log("   Inválido.\n"); rl.close(); return; }
    elegido = res[idx];
  }
  const campos = esCanal ? CAMPOS_CANAL : CAMPOS_MOVIE;
  const nombre = esCanal ? elegido.name : `${elegido.title} (${elegido.year})`;
  console.log(`\n   Editando: "${nombre}"\n`);
  let editando = true;
  while (editando) {
    console.log("   ¿Qué editás?\n");
    campos.forEach((c,i) => console.log(`   ${i+1}. ${c.label}`));
    console.log(`   ${campos.length+1}. Terminar\n`);
    const e = await preguntar("   Opción: ");
    const idx = parseInt(e)-1;
    if (idx===campos.length) { editando=false; break; }
    if (isNaN(idx)||idx<0||idx>=campos.length) { console.log("\n   Inválido.\n"); continue; }
    const campo = campos[idx];
    const val = await preguntar(`\n   Nuevo valor para "${campo.label}": `);
    if (!val) { console.log("   Cancelado.\n"); continue; }
    elegido[campo.key] = campo.num && !isNaN(parseFloat(val)) ? parseFloat(val) : val;
    console.log(`\n   ✓ "${campo.label}" actualizado\n`);
    const s = await preguntar("   ¿Editás otro campo? (s/n): ");
    if (s.toLowerCase()!=="s") editando=false;
    console.log("");
  }
  rl.close();
  if (esCanal) { content.channels = (content.channels||[]).map(c => c.id===elegido.id?elegido:c); }
  else { content.movies = (content.movies||[]).map(m => m.id===elegido.id?elegido:m); }
  console.log("\n⬆️  Guardando...");
  const status = await saveFile(content, sha, `Editar: ${nombre}`);
  if (status===200||status===201) { console.log(`\n✅ "${nombre}" guardado.\n`); }
  else { console.error(`❌ Error (status: ${status})`); }
}
main();
