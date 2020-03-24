const sourcemap = Npm.require("source-map");
const createHash = Npm.require("crypto").createHash;
const LRU = Npm.require("lru-cache");

Plugin.registerMinifier({
    extensions: ["css"],
    archMatching: "web"
  }, 
  () => new CssToolsMinifier()
);

const mergeCache = new LRU({
  max: 100
});

class CssToolsMinifier {

  processFilesForBundle(files, options) {
    const mode = options.minifyMode;

    if (!files.length) return;

    const merged = mergeCss(files);

    if (mode === 'development') {
      files[0].addStylesheet({
        data: merged.code,
        sourceMap: merged.sourceMap,
        path: 'merged-stylesheets.css'
      });
      return;
    }

    // this is an array for backwards compatability reasons
    // only one file will ever be returned
    const minifiedFiles = CssTools.minifyCss(merged.code);

    if (files.length) {
      minifiedFiles.forEach(function (minified) {
        files[0].addStylesheet({
          data: minified
        });
      });
    }
  }
}


const hashFiles = Profile("hashFiles", function (files) {
  const hash = createHash("sha1");
  files.forEach(f => {
    hash.update(f.getSourceHash()).update("\0");
  });
  return hash.digest("hex");
});

function disableSourceMappingURLs(css) {
  return css.replace(/# sourceMappingURL=/g,
                     "# sourceMappingURL_DISABLED=");
}

// Merge CSS files into one file, fixing up source maps and
// pulling any @import directives up to the top since the 
// CSS spec does not allow @import's to appear in the middle 
// of a file.
const mergeCss = Profile("mergeCss", function (css) {
  const hashOfFiles = hashFiles(css);
  let merged = mergeCache.get(hashOfFiles);
  if (merged) {
    return merged;
  }

  // Filenames passed to AST manipulator mapped to their original files
  const originals = {};

  const cssAsts = css.map(function (file) {
    const filename = file.getPathInBundle();
    originals[filename] = file;
    let ast;
    try {
      const parseOptions = { source: filename, position: true };
      const css = disableSourceMappingURLs(file.getContentsAsString());
      ast = CssTools.parseCss(css, parseOptions);
      ast.filename = filename;
    }
    catch (err) {
      if (err.reason) {
        file.error({
          message: err.reason,
          line:    err.line,
          column:  err.column
        });
      }
      else {
        // Just in case it's not the normal error the library makes.
        file.error({
          message: err.message
        });
      }

      return {
        type: "stylesheet",
        stylesheet: { rules: [] },
        filename: filename
      };
    }
    return ast;
  });

  const warnCb = function (filename, msg) {
    // XXX make this a buildmessage.warning call rather than a random log.
    //     this API would be like buildmessage.error, but wouldn't cause
    //     the build to fail.
    console.log(filename + ': warn: ' + msg);
  };

  const mergedCssAst = CssTools.mergeCssAsts(cssAsts, warnCb);

  // Overwrite the CSS files list with the new concatenated file
  const stringifiedCss = CssTools.stringifyCss(mergedCssAst, {
    sourcemap: true,
    // don't try to read the referenced sourcemaps from the input
    inputSourcemaps: false
  });

  if (! stringifiedCss.code) {
    mergeCache.set(hashOfFiles, merged = { code: '' });
    return merged;
  }

  // Add the contents of the input files to the source map of the new file
  stringifiedCss.map.sourcesContent =
    stringifiedCss.map.sources.map(function (filename) {
      const file = originals[filename] || null;
      return file && file.getContentsAsString();
    });

  // Compose the concatenated file's source map with source maps from the
  // previous build step if necessary.
  const newMap = Profile.time("composing source maps", function () {
    const newMap = new sourcemap.SourceMapGenerator();
    const concatConsumer = new sourcemap.SourceMapConsumer(stringifiedCss.map);

    // Create a dictionary of source map consumers for fast access
    const consumers = Object.create(null);

    Object.keys(originals).forEach(function (name) {
      const file = originals[name];
      const sourceMap = file.getSourceMap();

      if (sourceMap) {
        try {
          consumers[name] = new sourcemap.SourceMapConsumer(sourceMap);
        } catch (err) {
          // If we can't apply the source map, silently drop it.
          //
          // XXX This is here because there are some less files that
          // produce source maps that throw when consumed. We should
          // figure out exactly why and fix it, but this will do for now.
        }
      }
    });

    // Maps each original source file name to the SourceMapConsumer that
    // can provide its content.
    const sourceToConsumerMap = Object.create(null);

    // Find mappings from the concatenated file back to the original files
    concatConsumer.eachMapping(function (mapping) {
      let source = mapping.source;
      const consumer = consumers[source];

      let original = {
        line: mapping.originalLine,
        column: mapping.originalColumn
      };

      // If there is a source map for the original file, e.g., if it has been
      // compiled from Less to CSS, find the source location in the original's
      // original file. Otherwise, use the mapping of the concatenated file's
      // source map.
      if (consumer) {
        const newOriginal = consumer.originalPositionFor(original);

        // Finding the original position should always be possible (otherwise,
        // one of the source maps would have incorrect mappings). However, in
        // case there is something wrong, use the intermediate mapping.
        if (newOriginal.source !== null) {
          original = newOriginal;
          source = original.source;

          if (source) {
            // Since the new consumer provided a different
            // original.source, we should ask it for the original source
            // content instead of asking the concatConsumer.
            sourceToConsumerMap[source] = consumer;
          }
        }
      }

      if (source && ! sourceToConsumerMap[source]) {
        // If we didn't set sourceToConsumerMap[source] = consumer above,
        // use the concatConsumer to determine the original content.
        sourceToConsumerMap[source] = concatConsumer;
      }

      // Add a new mapping to the final source map
      newMap.addMapping({
        generated: {
          line: mapping.generatedLine,
          column: mapping.generatedColumn
        },
        original: original,
        source: source
      });
    });

    // The consumer.sourceContentFor and newMap.setSourceContent methods
    // are relatively fast, but not entirely trivial, so it's better to
    // call them only once per source, rather than calling them every time
    // we call newMap.addMapping in the loop above.
    Object.keys(sourceToConsumerMap).forEach(function (source) {
      const consumer = sourceToConsumerMap[source];
      const content = consumer.sourceContentFor(source);
      newMap.setSourceContent(source, content);
    });

    return newMap;
  });

  mergeCache.set(hashOfFiles, merged = {
    code: stringifiedCss.code,
    sourceMap: newMap.toString()
  });

  return merged;
});
