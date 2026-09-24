import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./contrast.html", import.meta.url));
createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
}).listen(4173, "127.0.0.1", () => console.log("http://127.0.0.1:4173"));
