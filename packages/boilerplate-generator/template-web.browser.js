import template from './template';

function sri(sri, mode) {
  return (sri && mode) ? ` integrity="sha512-${sri}" crossorigin="${mode}" ` : '';
}

function headTemplate({ bundledJsCssUrlRewriteHook, sriMode, head, dynamicHead, css = [], htmlAttributes = {} }) {
   
  const headSections = head.split(/<meteor-bundled-css[^<>]*>/, 2);

  const cssBundle = [...(css).map(file =>
    template('  <link rel="stylesheet" type="text/css" class="__meteor-css__" href="<%- href %>"<%= sri %>>')({
      href: bundledJsCssUrlRewriteHook(file.url),
      sri: sri(file.sri, sriMode),
    })
  )].join('\n');

  return [
    '<html' + Object.keys(htmlAttributes).map( key => template(' <%= attrName %>="<%- attrValue %>"')({ attrName: key, attrValue: htmlAttributes[key] }) ).join('') + '>',
    '<head>',
    (headSections.length === 1) ? [cssBundle, headSections[0]].join('\n') : [headSections[0], cssBundle, headSections[1]].join('\n'),
    dynamicHead,
    '</head>',
    '<body>',
  ].join('\n');

 }

// Template function for rendering the boilerplate html for browsers
function closeTemplate({ meteorRuntimeConfig, meteorRuntimeHash,rootUrlPathPrefix, inlineScriptsAllowed, bundledJsCssUrlRewriteHook, sriMode, js = [], additionalStaticJs = [] }) {
  
  return [
    '',
    inlineScriptsAllowed ? template('  <script type="text/javascript">__meteor_runtime_config__ = JSON.parse(decodeURIComponent(<%= conf %>))</script>')({ conf: meteorRuntimeConfig }) : template('  <script type="text/javascript" src="<%- src %>/meteor_runtime_config.js?hash=<%- hash %>"></script>')({ src: rootUrlPathPrefix, hash: meteorRuntimeHash }),
    '',
    ...(js).map(file => template('  <script type="text/javascript" src="<%- src %>"<%= sri %>></script>')({ src: bundledJsCssUrlRewriteHook(file.url), sri: sri(file.sri, sriMode) })
    ),
    ...(additionalStaticJs).map(({ contents, pathname }) => ( inlineScriptsAllowed ? template('  <script><%= contents %></script>')({ contents }) : template('  <script type="text/javascript" src="<%- src %>"></script>')({ src: rootUrlPathPrefix + pathname })
    )),
    '',
    '',
    '</body>',
    '</html>'
  ].join('\n');

}

export { headTemplate, closeTemplate }
