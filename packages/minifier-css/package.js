Package.describe({
  summary: 'CSS minifier',
  version: '1.5.1'
});

Npm.depends({
  postcss: '7.0.27',
  cssnano: '4.1.10'
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.mainModule('minifier.js', 'server');
  api.export('CssTools');
});

Package.onTest(function (api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.addFiles([
    'tests/minifier-tests.js',
    'tests/urlrewriting-tests.js'
  ], 'server');
});
