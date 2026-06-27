import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT ?? 5173);
const root = process.cwd();
const webRoot = process.argv[2] === 'dist' ? join(root, 'dist') : root;
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = normalize(join(webRoot, requestedPath));

  if (!filePath.startsWith(webRoot)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentTypes.get(extname(filePath)) ?? 'text/plain' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, () => {
  console.log(`Servidor listo: http://localhost:${port}`);
});
