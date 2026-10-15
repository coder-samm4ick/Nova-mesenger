// Переписывает корневые пути в статическом экспорте под подкаталог GitHub
// Pages (/Nova-mesenger). Next сам префиксует чанки и basePath-ссылки, но
// авторские <a href="/web"> и значения в RSC-полезной нагрузке остаются
// корневыми — на Pages они дают 404. Скрипт идемпотентен: уже префиксированные
// пути не трогает. Запускается автоматически из build-pages.mjs.
//
// Важно: во всех правилах за литералом `"/` уже съеден ведущий слэш, поэтому
// в негативный lookahead идёт путь БЕЗ него (Nova-mesenger/..., а не
// /Nova-mesenger/...) — иначе повторный проход удваивает префикс.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = (process.env.NOVA_BASE_PATH || "/Nova-mesenger").trim().replace(/\/+$/, "");
if (!base) {
  console.log("NOVA_BASE_PATH пуст — префиксация путей пропущена");
  process.exit(0);
}

const root = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
// base для подстановки в замену (без экранирования) и экранированная версия
// для regex; body — путь без ведущого слэша (он уже съеден литералом `"/`)
const escBase = base.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const body = escBase.replace(/^\\?\//, "");
const guard = `${body}/`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(html|txt)$/.test(name)) out.push(p);
  }
  return out;
}

let files = 0;
let changed = 0;
let rewritten = 0;

for (const file of walk(root)) {
  const src = readFileSync(file, "utf8");
  let text = src;
  const isHtml = file.endsWith(".html");

  const before = text.length;
  if (isHtml) {
    // href="..." и src="..." в разметке (съедаем `"/`, дальше путь без слэша)
    text = text.replace(new RegExp(`(href|src)="/(?!${guard})`, "g"), `$1="${base}/`);
    // значения внутри RSC-полезной нагрузки (экранированные кавычки)
    text = text.replace(new RegExp(`\\\\"/(?!${guard}|/)`, "g"), `\\"${base}/`);
    // ссылки метаданных (content="...")
    text = text.replace(new RegExp(`content="/(?!${guard})`, "g"), `content="${base}/`);
  } else {
    // .txt — чистый JSON/RSC для клиентских переходов
    text = text.replace(new RegExp(`"/(?!${guard}|/)`, "g"), `"${base}/`);
  }

  files++;
  if (text !== src) {
    writeFileSync(file, text, "utf8");
    changed++;
    rewritten += Math.abs(text.length - before);
  }
}

console.log(
  `Пути переписаны под ${base}: файлов ${files}, изменено ${changed}, символов ${rewritten}`,
);
