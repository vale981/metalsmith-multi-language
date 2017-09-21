'use strict';
const deepmerge = require('deepmerge');

var extname = require('path').extname;

function Multilang(ops) {
    this.default = ops.default;
    this.locales = ops.locales;
    this.pattern = RegExp('.*_('+ ops.locales.join('|') +')(?=\\..*?$)');
    this.pathPattern = RegExp('(^(' + ops.locales.join('|') +')/|/(' + ops.locales.join('|') +')/)');
}

Multilang.prototype.getAltFilename = function (file, fromLocale, toLocale) {
    var ext = extname(file);

    // Locale in the path.
    if (this.pathPattern.test(file)) {
        var replacementString = file.match(this.pathPattern)[0].replace(fromLocale, toLocale);
        return file.replace(this.pathPattern, replacementString);
    }

    // Locale in the filename.
    return file.replace('_'+ fromLocale + ext, '_'+ toLocale + ext);
};

// Returns the name of the main filename
// It's usefull to know which file is the main when merging properties
//
// Given { default: 'es', locales: ['ca', 'es'] }
// And file_ca.md as argument
// Returns file_es.md
Multilang.prototype.getBaseFilename = function (file) {

    // Locale in the path.
    if (this.pathPattern.test(file)) {
        var replacementString = file.match(this.pathPattern)[0].replace(
            RegExp('(/?)('+ this.locales.join('|') +')(/)'),
            '$1' + this.default + '$3'
        );
        return file.replace(this.pathPattern, replacementString);
    }

    // Locale in the filename.
    var ext = extname(file);
    return file.replace(RegExp('_('+ this.locales.join('|') +')(?:'+ ext +')?$'), '_' + this.default + ext);
};

Multilang.prototype.getLocale = function (file) {
    // Locale in the path.
    if (this.pathPattern.test(file)) {
        return file.match(this.pathPattern)[0].replace(
            RegExp('(/?)('+ this.locales.join('|') +')(/)'),
            '$2'
        );
    }

    // Locale in the filename.
    return file.match(this.pattern)[1];
};

Multilang.prototype.getPlugin = function () {
    var self = this;

    function lang(locale) {
        if (locale in this.altFiles) {
            return this.altFiles[locale];
        } else {
            throw new Error('Unknown locale "'+ locale +'".');
        }
    }

    return function (files, ms, done) {
        ms.metadata().locales       = self.locales.reduce((locObj, locale) =>
                                                          Object.assign(locObj, {[locale]: {}}), {});
        ms.metadata().defaultLocale = self.default;

        for (var file in files) {
            if (self.pattern.test(file) || self.pathPattern.test(file)) {
                var base = self.getBaseFilename(file);

                files[file].locale = self.getLocale(file);

                // Add missing properties from base locale
                // This lets to have base some generic properties
                // applied only in the 'default' locale, e.g.: template
                if (base !== file) {
                    if(files[base] && files[file]){
                        var contents = files[file].contents;
                        files[file] = deepmerge(files[base], files[file], {clone:true});
                        files[file].contents = contents;
                    }
                }
            } else {
                files[file].locale = self.default;
            }

            // Generate altFiles map
            files[file].altFiles = {};

            self.locales.forEach(function (locale) {
                if (locale != files[file].locale) {
                    files[file].altFiles[locale] = files[self.getAltFilename(file, files[file].locale, locale)];
                }
            });

            // Bind lang()
            files[file].lang = lang.bind(files[file]);

            // Ad file to locale index.
            ms.metadata().locales[files[file].locale][file] = files[file];
        }

        // Index handling
        // Default locale will go in 'index.html'
        // Other index-es in '/:locale/index.html'
        for (file of Object.keys(files)) {
            if (files[file].index) {
                var name = file.replace(this.pattern, '');
                if (files[file].locale === self.default) {
                    files[file].path = '';
                    name = name.substr(name.lastIndexOf('/') + 1);1
                    files[name] = Object.assign({},files[file]);
                } else {
                    files[file].path = files[file].locale +'/';
                    files[files[file].locale + '/' + name] = files[file];
                }

                // Remove old entry
                if(name !== file)
                    delete files[file];
            }
        }

        done();
    };
};

module.exports = Multilang;
