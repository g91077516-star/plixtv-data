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

async function main() {
  console.log("\n📺 PLIXTV — Agregar canal de TV\n");
  const nombre = await preguntar("   Nombre del canal: ");
  if (!nombre) { rl.close(); return; }
  const streamUrl = await preguntar("   URL del stream: ");
  if (!streamUrl) { rl.close(); return; }
  const logo = await preguntar("   URL del logo (Enter saltear): ");
  const categoria = await preguntar("   Categoría (Noticias/Deportes/Entretenimiento/General): ");
  rl.close();
  console.log("\n⬆️  Subiendo a GitHub...");
  try {
    const { content, sha } = await getFile();
    if (!content.channels) content.channels = [];
    const newId = content.channels.length ? Math.max(...content.channels.map(c=>c.id))+1 : 1;
    content.channels.push({ id:newId, name:nombre, streamUrl, logo:logo||`https://via.placeholder.com/300x200/111/fff?text=${encodeURIComponent(nombre)}`, category:categoria||"General" });
    const status = await saveFile(content, sha, `Agregar canal: ${nombre}`);
    if (status===200||status===201) { console.log(`\n📺 "${nombre}" agregado! (id: ${newId})\n`); }
    else { console.error(`❌ Error (status: ${status})`); }
  } catch(e) { console.error("\n❌ Error:", e.message); }
}
main();
