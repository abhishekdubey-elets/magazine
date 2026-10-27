/*
 * PressFlow - build an InDesign document from a PressFlow manifest.
 *
 * Runs inside Adobe's InDesign API (Custom Scripts) as ExtendScript (ES3).
 * Input:  params.manifest  - path (in the working folder) of a
 *                            "pressflow.indesign-manifest/2" JSON file
 *         params.options   - { pdfPreset, jpegResolution, outputs, preflightProfile }
 * Assets: manifest.json, links/* (images), "Document Fonts/*" (fonts)
 * Output: output/<name>.pdf|.indd|.idml, output/page-NN.jpg, output/report.json
 *
 * InDesign does all composition: paragraph styles, hyphenation and
 * justification, threaded text flow, image fitting and PDF/X export.
 * Individual item failures are recorded as warnings so one bad frame
 * never stops an issue from being produced.
 */

/* globals app, File, Folder, MeasurementUnits, RulerOrigin, ColorModel, ColorSpace, Justification,
   Capitalization, VerticalJustification, FitOptions, CornerOptions, FontStatus, ExportFormat,
   ExportRangeOrAllPages, JPEGOptionsQuality, PageNumberingOptions, SaveOptions, UserInteractionLevels, GradientType,
   SpecialCharacters, NothingEnum */

var PF = {
  wf: '',
  doc: null,
  swatches: {},
  styles: {},
  items: {},
  layers: {},
  masters: {},
  report: {
    pages: 0,
    parents: 0,
    layers: [],
    styles: 0,
    stories: 0,
    overset: [],
    autoFitted: [],
    missingFonts: [],
    images: [],
    preflight: null,
    warnings: [],
    timings: {}
  },
  uploads: []
};

/* ------------------------------------------------------------- JSON */

PF.quote = function (s) {
  return '"' + String(s).replace(/[\\"\u0000-\u001f\u2028\u2029]/g, function (c) {
    var m = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
    return m[c] || ('\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
  }) + '"';
};

PF.stringify = function (v) {
  var i, out, k;
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return PF.quote(v);
  if (v instanceof Array) {
    out = [];
    for (i = 0; i < v.length; i++) out.push(PF.stringify(v[i]));
    return '[' + out.join(',') + ']';
  }
  out = [];
  for (k in v) {
    if (v.hasOwnProperty(k) && typeof v[k] !== 'function') out.push(PF.quote(k) + ':' + PF.stringify(v[k]));
  }
  return '{' + out.join(',') + '}';
};

PF.parse = function (s) {
  // Input comes from our own server; ExtendScript (ES3) has no JSON object.
  return eval('(' + s + ')');
};

/* ------------------------------------------------------------ files */

PF.path = function (rel) {
  return PF.wf + String(rel).replace(/\//g, '\\');
};

PF.readText = function (rel) {
  var f = new File(PF.path(rel));
  f.encoding = 'UTF-8';
  if (!f.open('r')) throw new Error('Cannot read ' + rel);
  var t = f.read();
  f.close();
  return t;
};

PF.writeText = function (rel, text) {
  var f = new File(PF.path(rel));
  f.encoding = 'UTF-8';
  f.open('w');
  f.write(text);
  f.close();
};

PF.upload = function (rel) {
  PF.uploads.push({ path: rel });
};

PF.warn = function (msg) {
  PF.report.warnings.push(msg);
  try { app.consoleerr('PressFlow: ' + msg); } catch (e) {}
};

PF.time = function (key, start) {
  PF.report.timings[key] = (new Date()).getTime() - start;
};

/* ----------------------------------------------------------- colour */

PF.swatch = function (hex) {
  var doc = PF.doc;
  if (!hex) return doc.swatches.itemByName('None');
  hex = String(hex).toLowerCase();
  if (hex === '#ffffff') return doc.swatches.itemByName('Paper');
  if (PF.swatches[hex]) return PF.swatches[hex];
  var name = 'PF ' + hex;
  var c = doc.colors.itemByName(name);
  if (!c.isValid) {
    c = doc.colors.add({
      name: name,
      model: ColorModel.PROCESS,
      space: ColorSpace.RGB,
      colorValue: [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)]
    });
  }
  PF.swatches[hex] = c;
  return c;
};

PF.gradientCount = 0;

PF.gradientSwatch = function (g) {
  var key = 'gradient:' + PF.stringify(g.stops);
  if (PF.swatches[key]) return PF.swatches[key];
  var grad = PF.doc.gradients.add({ name: 'PF Gradient ' + (++PF.gradientCount), type: GradientType.LINEAR });
  var stops = grad.gradientStops;
  while (stops.length < g.stops.length) stops.add();
  for (var i = 0; i < g.stops.length; i++) {
    stops.item(i).stopColor = PF.swatch(g.stops[i].color);
    stops.item(i).location = g.stops[i].location;
  }
  PF.swatches[key] = grad;
  return grad;
};

/*
 * Colour changes become a gradient swatch; opacity changes (fades over photos)
 * become a gradient feather, which InDesign keeps live and editable.
 */
PF.applyGradient = function (item, g) {
  var opaque = true;
  var oneColour = true;
  var i;
  for (i = 0; i < g.stops.length; i++) {
    if (g.stops[i].opacity < 100) opaque = false;
    if (g.stops[i].color !== g.stops[0].color) oneColour = false;
  }
  try {
    if (oneColour) {
      item.fillColor = PF.swatch(g.stops[0].color);
    } else {
      item.fillColor = PF.gradientSwatch(g);
      item.gradientFillAngle = g.angle;
    }
    if (!opaque) {
      var gf = item.transparencySettings.gradientFeatherSettings;
      gf.applied = true;
      gf.type = GradientType.LINEAR;
      gf.angle = g.angle;
      var os = gf.opacityGradientStops;
      while (os.length < g.stops.length) os.add();
      for (i = 0; i < g.stops.length; i++) {
        os.item(i).opacity = g.stops[i].opacity;
        os.item(i).location = g.stops[i].location;
      }
    }
  } catch (e) {
    PF.warn('Gradient simplified to a solid colour: ' + e.message);
    item.fillColor = PF.swatch(g.stops[g.stops.length - 1].color);
  }
};

PF.opacity = function (item, value) {
  if (value === undefined || value === null || value >= 100) return;
  try { item.transparencySettings.blendingSettings.opacity = value; } catch (e) { PF.warn('Opacity not applied: ' + e.message); }
};

PF.corners = function (item, r) {
  if (!r) return;
  try {
    item.topLeftCornerOption = CornerOptions.ROUNDED_CORNER;
    item.topRightCornerOption = CornerOptions.ROUNDED_CORNER;
    item.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER;
    item.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER;
    item.topLeftCornerRadius = r;
    item.topRightCornerRadius = r;
    item.bottomLeftCornerRadius = r;
    item.bottomRightCornerRadius = r;
  } catch (e) {}
};

/* ----------------------------------------------------------- styles */

PF.justification = function (align) {
  if (align === 'center') return Justification.CENTER_ALIGN;
  if (align === 'right') return Justification.RIGHT_ALIGN;
  if (align === 'justify') return Justification.LEFT_JUSTIFIED;
  return Justification.LEFT_ALIGN;
};

PF.setFont = function (target, family, style) {
  try {
    target.appliedFont = family;
  } catch (e) {
    PF.missingFont(family + ' ' + style);
    return;
  }
  try {
    target.fontStyle = style;
  } catch (e2) {
    PF.missingFont(family + ' ' + style);
  }
};

PF.missingFont = function (name) {
  var list = PF.report.missingFonts;
  for (var i = 0; i < list.length; i++) if (list[i] === name) return;
  list.push(name);
};

PF.createStyles = function (defs) {
  var name, d, ps;
  for (name in defs) {
    if (!defs.hasOwnProperty(name)) continue;
    d = defs[name];
    ps = PF.doc.paragraphStyles.itemByName(name);
    if (!ps.isValid) ps = PF.doc.paragraphStyles.add({ name: name });
    PF.setFont(ps, d.family, d.fontStyle);
    PF.set(ps, 'pointSize', d.size);
    PF.set(ps, 'leading', d.leading);
    PF.set(ps, 'tracking', d.tracking || 0);
    PF.set(ps, 'justification', PF.justification(d.align));
    PF.set(ps, 'fillColor', PF.swatch(d.color));
    PF.set(ps, 'capitalization', d.caps ? Capitalization.ALL_CAPS : Capitalization.NORMAL);
    PF.set(ps, 'spaceBefore', d.spaceBefore || 0);
    PF.set(ps, 'spaceAfter', d.spaceAfter || 0);
    PF.set(ps, 'hyphenation', !!d.hyphenate);
    if (d.keepWithNext) PF.set(ps, 'keepWithNext', d.keepWithNext);
    if (d.dropCap) {
      PF.set(ps, 'dropCapCharacters', d.dropCap.chars);
      PF.set(ps, 'dropCapLines', d.dropCap.lines);
    }
    if (d.ruleBelow) {
      PF.set(ps, 'ruleBelow', true);
      PF.set(ps, 'ruleBelowLineWeight', d.ruleBelow.weight);
      PF.set(ps, 'ruleBelowColor', PF.swatch(d.ruleBelow.color));
      PF.set(ps, 'ruleBelowOffset', d.ruleBelow.offset);
    }
    PF.styles[name] = ps;
    PF.report.styles++;
  }
};

/* ----------------------------------------------------------- layers */

/** Named layers (bottom to top) so designers can lock furniture or hide images. */
PF.createLayers = function (names) {
  if (!names || !names.length) return;
  var doc = PF.doc;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    try {
      var layer = doc.layers.itemByName(name);
      if (!layer.isValid) layer = i === 0 ? doc.layers.item(0) : doc.layers.add({ name: name });
      if (i === 0) { try { layer.name = name; } catch (e0) {} }
      PF.layers[name] = layer;
      PF.report.layers.push(name);
    } catch (e) {
      PF.warn('Layer ' + name + ': ' + e.message);
    }
  }
};

PF.props = function (item, extra) {
  var p = { geometricBounds: item.bounds };
  if (item.layer && PF.layers[item.layer]) p.itemLayer = PF.layers[item.layer];
  for (var k in extra) if (extra.hasOwnProperty(k)) p[k] = extra[k];
  return p;
};

PF.name = function (obj, item) {
  try { obj.name = String(item.name || item.label || item.id); } catch (e) {}
};

PF.set = function (obj, prop, value) {
  try {
    obj[prop] = value;
  } catch (e) {
    PF.warn('Could not set ' + prop + ': ' + e.message);
  }
};

/* ------------------------------------------------------------- text */

PF.fillParagraphs = function (story, paragraphs) {
  var texts = [];
  var kept = [];
  var i, p;
  for (i = 0; i < paragraphs.length; i++) {
    p = paragraphs[i];
    if (p.text === undefined || p.text === null || p.text === '') continue;
    kept.push(p);
    // "\r" would split a paragraph; "\n" is a forced line break in InDesign.
    texts.push(String(p.text).replace(/\r/g, ' '));
  }
  story.contents = texts.join('\r');
  var paras = story.paragraphs;
  for (i = 0; i < kept.length && i < paras.length; i++) {
    p = kept[i];
    var target = paras.item(i);
    var ps = PF.styles[p.style];
    if (ps) {
      try { target.applyParagraphStyle(ps, true); } catch (e) { PF.warn('Style ' + p.style + ': ' + e.message); }
    }
    if (p.runs) PF.applyRuns(target, p.runs);
  }
};

PF.applyRuns = function (para, runs) {
  for (var i = 0; i < runs.length; i++) {
    var r = runs[i];
    if (!r.length) continue;
    try {
      var range = para.characters.itemByRange(r.start, r.start + r.length - 1);
      if (r.color) range.fillColor = PF.swatch(r.color);
      if (r.family) PF.setFont(range, r.family, r.fontStyle);
      if (r.size) range.pointSize = r.size;
    } catch (e) {
      PF.warn('Character formatting skipped: ' + e.message);
    }
  }
};

/** Shrink every text range by 4% steps until the frame stops overflowing (min 30%). */
PF.autoFit = function (tf, item, pageNumber) {
  var scale = 1;
  var guard = 0;
  while (tf.overflows && scale > 0.3 && guard < 40) {
    var ranges = tf.parentStory.textStyleRanges;
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges.item(i);
      r.pointSize = r.pointSize * 0.96;
      if (typeof r.leading === 'number') r.leading = r.leading * 0.96;
    }
    scale = scale * 0.96;
    guard++;
  }
  if (scale < 1) PF.report.autoFitted.push({ id: item.id, label: item.label, page: pageNumber, scale: Math.round(scale * 100) / 100 });
};

/* ------------------------------------------------------------ items */

PF.rect = function (page, item) {
  var r = page.rectangles.add(PF.props(item));
  r.strokeWeight = 0;
  PF.name(r, item);
  if (item.gradient) PF.applyGradient(r, item.gradient);
  else r.fillColor = PF.swatch(item.fill);
  if (item.stroke) {
    r.strokeWeight = item.stroke.weight;
    r.strokeColor = PF.swatch(item.stroke.color);
  }
  PF.opacity(r, item.opacity);
  PF.corners(r, item.radius);
  r.label = item.id;
  return r;
};

PF.image = function (page, item, pageNumber) {
  var r = page.rectangles.add(PF.props(item));
  r.strokeWeight = 0;
  r.label = item.id;
  PF.name(r, item);
  if (item.fill) r.fillColor = PF.swatch(item.fill);
  var entry = { id: item.id, page: pageNumber, link: item.link, status: 'placed' };
  if (!item.link) {
    entry.status = 'missing';
    r.fillColor = PF.swatch('#f1f2f5');
    PF.report.images.push(entry);
    return r;
  }
  try {
    r.place(new File(PF.path(item.link)));
    if (item.fit === 'fit') {
      r.fit(FitOptions.PROPORTIONALLY);
      r.fit(FitOptions.CENTER_CONTENT);
    } else {
      r.fit(FitOptions.FILL_PROPORTIONALLY);
      r.fit(FitOptions.CENTER_CONTENT);
      PF.focus(r, item.focusX, item.focusY);
    }
  } catch (e) {
    entry.status = 'failed';
    entry.message = e.message;
    r.fillColor = PF.swatch('#f1f2f5');
  }
  PF.report.images.push(entry);
  return r;
};

/** Shift a filled image so the crop keeps the requested focus point (0-100%). */
PF.focus = function (frame, fx, fy) {
  if (fx === 50 && fy === 50) return;
  var g = frame.allGraphics[0];
  if (!g) return;
  var fb = frame.geometricBounds;
  var gb = g.geometricBounds;
  var ox = (gb[3] - gb[1]) - (fb[3] - fb[1]);
  var oy = (gb[2] - gb[0]) - (fb[2] - fb[0]);
  g.move([fb[1] - ox * (fx / 100), fb[0] - oy * (fy / 100)]);
};

PF.text = function (page, item, pageNumber) {
  var tf = page.textFrames.add(PF.props(item));
  tf.label = item.id;
  PF.name(tf, item);
  tf.strokeWeight = 0;
  tf.fillColor = PF.swatch(item.fill);
  PF.opacity(tf, item.opacity);
  PF.corners(tf, item.radius);
  var prefs = tf.textFramePreferences;
  prefs.textColumnCount = item.columns || 1;
  if ((item.columns || 1) > 1) prefs.textColumnGutter = item.gutter;
  prefs.insetSpacing = item.inset || [0, 0, 0, 0];
  if (item.verticalAlign === 'center') prefs.verticalJustification = VerticalJustification.CENTER_ALIGN;
  if (item.verticalAlign === 'bottom') prefs.verticalJustification = VerticalJustification.BOTTOM_ALIGN;
  if (item.autoPageNumber) {
    // Parent-page folio: InDesign's automatic page number marker, in the folio style.
    tf.parentStory.contents = SpecialCharacters.AUTO_PAGE_NUMBER;
    var pnStyle = item.paragraphs && item.paragraphs[0] ? PF.styles[item.paragraphs[0].style] : null;
    if (pnStyle) { try { tf.parentStory.paragraphs.item(0).applyParagraphStyle(pnStyle, true); } catch (epn) { PF.warn('Page number style: ' + epn.message); } }
  } else if (item.paragraphs) {
    PF.fillParagraphs(tf.parentStory, item.paragraphs);
    if (item.autoFit) PF.autoFit(tf, item, pageNumber);
    if (item.reportOverset && tf.overflows) {
      PF.report.overset.push({ id: item.id, label: item.label, page: pageNumber, characters: PF.hiddenCharacters(tf.parentStory) });
    }
  }
  return tf;
};

PF.hiddenCharacters = function (story) {
  try {
    var containers = story.textContainers;
    var last = containers[containers.length - 1];
    var shown = last.characters.length ? last.characters.item(-1).index + 1 : 0;
    return Math.max(0, story.characters.length - shown);
  } catch (e) {
    return 0;
  }
};

/* ------------------------------------------------------------ build */

PF.build = function (manifest) {
  var t0 = (new Date()).getTime();
  var d = manifest.document;
  var doc = app.documents.add();
  PF.doc = doc;
  doc.viewPreferences.horizontalMeasurementUnits = MeasurementUnits.POINTS;
  doc.viewPreferences.verticalMeasurementUnits = MeasurementUnits.POINTS;
  doc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;
  doc.zeroPoint = [0, 0];

  var dp = doc.documentPreferences;
  dp.facingPages = d.facingPages;
  dp.pageWidth = d.widthPt;
  dp.pageHeight = d.heightPt;
  dp.documentBleedUniformSize = true;
  dp.documentBleedTopOffset = d.bleedPt;

  var margins = {
    top: d.margins.top,
    bottom: d.margins.bottom,
    left: d.margins.inside,
    right: d.margins.outside,
    columnCount: d.columns,
    columnGutter: d.gutterPt
  };
  doc.marginPreferences.properties = margins;
  var masterPages = doc.masterSpreads.item(0).pages;
  for (var mp = 0; mp < masterPages.length; mp++) masterPages.item(mp).marginPreferences.properties = margins;
  dp.pagesPerDocument = Math.max(1, manifest.pages.length);
  PF.time('documentSetup', t0);

  var t1 = (new Date()).getTime();
  PF.createLayers(manifest.layers);
  PF.createStyles(manifest.paragraphStyles);
  PF.time('styles', t1);

  // Parent pages carry the recurring furniture (running heads, folios, taglines).
  var tm = (new Date()).getTime();
  PF.createParents(manifest.parents || [], margins);
  PF.time('parents', tm);

  var t2 = (new Date()).getTime();
  var p, i, item, page, pageDef;
  for (p = 0; p < manifest.pages.length; p++) {
    pageDef = manifest.pages[p];
    page = doc.pages.item(p);
    page.marginPreferences.properties = margins;
    page.label = pageDef.pageId;
    PF.applyParent(page, pageDef);
    if (pageDef.background) {
      var bleed = d.bleedPt;
      try {
        var bg = PF.rect(page, { id: pageDef.pageId + ':background', bounds: [-bleed, -bleed, d.heightPt + bleed, d.widthPt + bleed], fill: pageDef.background });
        bg.locked = true;
      } catch (eb) {
        PF.warn('Page ' + pageDef.number + ' background: ' + eb.message);
      }
    }
    for (i = 0; i < pageDef.items.length; i++) {
      item = pageDef.items[i];
      try {
        if (item.type === 'rect') PF.items[item.id] = PF.rect(page, item);
        else if (item.type === 'image') PF.items[item.id] = PF.image(page, item, pageDef.number);
        else if (item.type === 'text') PF.items[item.id] = PF.text(page, item, pageDef.number);
      } catch (ei) {
        PF.warn('Page ' + pageDef.number + ' - ' + item.label + ': ' + ei.message);
      }
    }
  }
  PF.report.pages = manifest.pages.length;
  PF.time('pages', t2);

  // Threaded stories: link frames in reading order, then let InDesign flow the text.
  var t3 = (new Date()).getTime();
  for (var s = 0; s < manifest.stories.length; s++) {
    var st = manifest.stories[s];
    var frames = [];
    for (i = 0; i < st.frames.length; i++) if (PF.items[st.frames[i]]) frames.push(PF.items[st.frames[i]]);
    if (!frames.length) {
      PF.warn('Story "' + st.title + '" has no frames in this export.');
      continue;
    }
    try {
      for (i = 0; i < frames.length - 1; i++) frames[i].nextTextFrame = frames[i + 1];
      PF.fillParagraphs(frames[0].parentStory, st.paragraphs);
      var story = frames[0].parentStory;
      if (story.overflows) {
        var lastFrame = frames[frames.length - 1];
        PF.report.overset.push({ id: lastFrame.label, label: st.title, page: PF.pageNumberOf(lastFrame), characters: PF.hiddenCharacters(story) });
      }
    } catch (es) {
      PF.warn('Story "' + st.title + '": ' + es.message);
    }
  }
  PF.report.stories = manifest.stories.length;
  PF.time('stories', t3);
  return doc;
};

PF.createParents = function (parents, margins) {
  var doc = PF.doc;
  for (var i = 0; i < parents.length; i++) {
    var def = parents[i];
    try {
      var ms = doc.masterSpreads.add();
      try { ms.namePrefix = def.prefix; } catch (e1) {}
      try { ms.baseName = def.name; } catch (e2) {}
      var pages = ms.pages;
      for (var k = 0; k < pages.length; k++) {
        var mp = pages.item(k);
        try { mp.marginPreferences.properties = margins; } catch (e3) {}
        // Facing pages: the first master page is the left (verso), the second the right (recto).
        var items = (pages.length > 1 && k === 0) ? def.left : def.right;
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          try {
            if (it.type === 'rect') PF.rect(mp, it);
            else if (it.type === 'image') PF.image(mp, it, 0);
            else if (it.type === 'text') PF.text(mp, it, 0);
          } catch (ei) {
            PF.warn('Parent ' + def.name + ' - ' + it.label + ': ' + ei.message);
          }
        }
      }
      PF.masters[def.id] = ms;
      PF.report.parents++;
    } catch (e) {
      PF.warn('Parent page ' + def.name + ': ' + e.message);
    }
  }
};

PF.applyParent = function (page, pageDef) {
  try {
    if (pageDef.parent === null) page.appliedMaster = NothingEnum.NOTHING;
    else if (pageDef.parent && PF.masters[pageDef.parent]) page.appliedMaster = PF.masters[pageDef.parent];
  } catch (e) {
    PF.warn('Page ' + pageDef.number + ' parent: ' + e.message);
  }
};

PF.pageNumberOf = function (item) {
  try {
    return item.parentPage.documentOffset + 1;
  } catch (e) {
    return 0;
  }
};

PF.checkFonts = function (doc) {
  var fonts = doc.fonts;
  for (var i = 0; i < fonts.length; i++) {
    var f = fonts.item(i);
    try {
      if (f.status !== FontStatus.INSTALLED) PF.missingFont(String(f.name).replace('\t', ' '));
    } catch (e) {}
  }
};

PF.preflight = function (doc, profileName) {
  try {
    var profile = app.preflightProfiles.itemByName(profileName || '[Basic]');
    if (!profile.isValid) profile = app.preflightProfiles.item(0);
    var proc = app.preflightProcesses.add(doc, profile);
    proc.waitForProcess();
    var agg = proc.aggregatedResults;
    var rows = (agg && agg[2]) || [];
    var results = [];
    for (var i = 0; i < rows.length && i < 200; i++) {
      var row = rows[i];
      results.push(row instanceof Array ? row.join(' - ') : String(row));
    }
    PF.report.preflight = { profile: String(profile.name), errors: rows.length, results: results };
    proc.remove();
  } catch (e) {
    PF.warn('Preflight could not run: ' + e.message);
  }
};

PF.pdfPreset = function (baseName) {
  var base = app.pdfExportPresets.itemByName(baseName);
  if (!base.isValid) {
    PF.warn('PDF preset ' + baseName + ' not found; using [High Quality Print].');
    base = app.pdfExportPresets.itemByName('[High Quality Print]');
  }
  var existing = app.pdfExportPresets.itemByName('PressFlow Print');
  if (existing.isValid) existing.remove();
  var preset = app.pdfExportPresets.add({ name: 'PressFlow Print' });
  var props = base.properties;
  var skip = { name: 1, parent: 1, id: 1, index: 1, isValid: 1, properties: 1, events: 1, eventListeners: 1 };
  for (var k in props) {
    if (skip[k]) continue;
    try { preset[k] = props[k]; } catch (e) {}
  }
  try { preset.standardsCompliance = props.standardsCompliance; } catch (e2) {}
  // Printers need bleed and trim marks regardless of the base preset.
  PF.set(preset, 'useDocumentBleedWithPDF', true);
  PF.set(preset, 'cropMarks', true);
  PF.set(preset, 'pageInformationMarks', true);
  PF.set(preset, 'bleedMarks', false);
  PF.set(preset, 'registrationMarks', false);
  PF.set(preset, 'colorBars', false);
  return preset;
};

PF.exportAll = function (doc, name, options) {
  var outputs = options.outputs || {};
  var t;
  Folder(PF.path('output')).create();
  if (outputs.indd) {
    t = (new Date()).getTime();
    doc.save(new File(PF.path('output/' + name + '.indd')));
    PF.upload('output/' + name + '.indd');
    PF.time('saveIndd', t);
  }
  if (outputs.idml) {
    t = (new Date()).getTime();
    doc.exportFile(ExportFormat.INDESIGN_MARKUP, new File(PF.path('output/' + name + '.idml')));
    PF.upload('output/' + name + '.idml');
    PF.time('exportIdml', t);
  }
  if (outputs.pdf) {
    t = (new Date()).getTime();
    var preset = PF.pdfPreset(options.pdfPreset || '[PDF/X-4:2008]');
    doc.exportFile(ExportFormat.PDF_TYPE, new File(PF.path('output/' + name + '.pdf')), false, preset);
    PF.upload('output/' + name + '.pdf');
    PF.time('exportPdf', t);
  }
  if (outputs.jpeg) {
    t = (new Date()).getTime();
    var jp = app.jpegExportPreferences;
    jp.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;
    jp.exportResolution = options.jpegResolution || 72;
    jp.jpegQuality = JPEGOptionsQuality.HIGH;
    jp.antiAlias = true;
    for (var i = 0; i < doc.pages.length; i++) {
      var num = ('00' + (i + 1)).slice(-2);
      jp.pageString = String(i + 1);
      doc.exportFile(ExportFormat.JPG, new File(PF.path('output/page-' + num + '.jpg')));
      PF.upload('output/page-' + num + '.jpg');
    }
    PF.time('exportJpeg', t);
  }
};

/* ------------------------------------------------------------- main */

function main() {
  var start = (new Date()).getTime();
  var result;
  var previousUnit = app.scriptPreferences.measurementUnit;
  try {
    app.scriptPreferences.measurementUnit = MeasurementUnits.POINTS;
    try { app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT; } catch (eu) {}
    app.generalPreferences.pageNumbering = PageNumberingOptions.ABSOLUTE;
    while (app.documents.length) app.documents.item(0).close(SaveOptions.NO);

    var all = PF.parse(app.scriptArgs.get('parameters'));
    var params = all.params || (all.input && all.input.params);
    if (!params || !params.manifest) throw new Error('Missing params.manifest');
    var wf = String(all.workingFolder).replace(/\//g, '\\');
    if (wf.charAt(wf.length - 1) !== '\\') wf += '\\';
    PF.wf = wf;

    var manifest = PF.parse(PF.readText(params.manifest));
    if (manifest.schema !== 'pressflow.indesign-manifest/2') throw new Error('Unsupported manifest schema ' + manifest.schema);
    var options = params.options || {};
    try { PF.report.app = { version: String(app.version) }; } catch (ev) {}

    var doc = PF.build(manifest);
    PF.checkFonts(doc);
    var tp = (new Date()).getTime();
    PF.preflight(doc, options.preflightProfile);
    PF.time('preflight', tp);
    PF.exportAll(doc, manifest.document.name || 'issue', options);
    doc.close(SaveOptions.NO);

    PF.time('overall', start);
    PF.writeText('output/report.json', PF.stringify(PF.report));
    PF.upload('output/report.json');
    result = { status: 'SUCCESS', assetsToBeUploaded: PF.uploads, dataURL: 'output/report.json' };
  } catch (e) {
    result = { status: 'FAILURE', errorCode: 'pressflow_build_error', errorString: (e && e.message ? e.message : String(e)) + (e && e.line ? ' (line ' + e.line + ')' : '') };
    try {
      while (app.documents.length) app.documents.item(0).close(SaveOptions.NO);
    } catch (ec) {}
  } finally {
    app.scriptPreferences.measurementUnit = previousUnit;
  }
  return PF.stringify(result);
}

main();
