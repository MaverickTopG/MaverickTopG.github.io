import fs from 'fs';
import path from 'path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8'
};

const getContentType = (ext) => MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';

const resolveAdminFile = (segments) => {
  const baseDir = path.join(process.cwd(), 'public', 'admin');
  const safeSegments = Array.isArray(segments) ? segments.filter(Boolean) : [];
  const cleanedSegments = safeSegments.filter((segment) => segment !== '..' && segment !== '.');
  let relativePath = cleanedSegments.join('/');

  if (!relativePath || relativePath.endsWith('/')) {
    relativePath = path.posix.join(relativePath, 'index.html');
  }

  if (!path.extname(relativePath)) {
    relativePath = path.posix.join(relativePath, 'index.html');
  }

  const filePath = path.join(baseDir, relativePath);
  const normalizedBase = path.normalize(baseDir) + path.sep;
  const normalizedFile = path.normalize(filePath);

  if (!normalizedFile.startsWith(normalizedBase)) {
    return null;
  }

  return normalizedFile;
};

const sendResponse = (res, status, content, contentType) => {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.write(content);
  res.end();
};

export async function getServerSideProps({ params, res }) {
  const filePath = resolveAdminFile(params?.path);
  if (!filePath) {
    sendResponse(res, 400, 'Bad Request', 'text/plain; charset=utf-8');
    return { props: {} };
  }

  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      sendResponse(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      return { props: {} };
    }
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    const contentType = getContentType(ext);
    sendResponse(res, 200, content, contentType);
    return { props: {} };
  } catch (error) {
    sendResponse(
      res,
      404,
      '<!doctype html><html><head><meta charset="utf-8" /><title>Not Found</title></head><body>Not Found</body></html>',
      'text/html; charset=utf-8'
    );
    return { props: {} };
  }
}

export default function AdminCatchAll() {
  return null;
}
