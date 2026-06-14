/**
 * @splinetool/viewer у WebView на Android (splineswift URL).
 * Нативний design.spline.runtime на Android давав SIGABRT у engineCreate (Rust panic у рендері матеріалів).
 */
const SPLINE_VIEWER_CDN =
  'https://cdn.jsdelivr.net/npm/@splinetool/viewer@1.9.37/build/spline-viewer.js';

function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function buildAndroidSplineViewerHtml(sceneUrl) {
  const url = escapeHtmlAttr(sceneUrl);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1.0,user-scalable=no" />
<style>
  html,body{margin:0;padding:0;background:#000;overflow:hidden;width:100%;height:100%;}
  spline-viewer{display:block;width:100%;height:100%;}
</style>
<script type="module" src="${SPLINE_VIEWER_CDN}"></script>
</head>
<body>
<spline-viewer url="${url}" loading="eager" style="width:100%;height:100vh;"></spline-viewer>
</body>
</html>`;
}
