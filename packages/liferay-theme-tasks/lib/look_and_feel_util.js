'use strict';

var _ = require('lodash');
var fs = require('fs-extra');
var options = require('../lib/options')();
var path = require('path');
var util = require('util');
var xml2js = require('xml2js');

var pathSrc = options.pathSrc;

var STR_LOOK_AND_FEEL = 'look-and-feel';

var QUERY_ELEMENTS = {
	'color-scheme': 'id',
	'layout-templates.0.custom.0.layout-template': 'id',
	'layout-templates.0.standard.0.layout-template': 'id',
	'portlet-decorator': 'id',
	'roles.0.role-name': 'value',
	'settings.0.setting': 'key'
};

module.exports = {
	correctJSONIdentifiers: function(lookAndFeelJSON, id) {
		var themeAttrs = lookAndFeelJSON[STR_LOOK_AND_FEEL].theme[0].$;

		if (themeAttrs.id != id) {
			themeAttrs.id = id;
			themeAttrs.name = id;
		}

		return lookAndFeelJSON;
	},

	generateLookAndFeelXML: function(xmlString, doctypeElement) {
		return xmlString.replace(/(<\?xml.*>)/, '<?xml version="1.0"?>\n' + doctypeElement + '\n');
	},

	getLookAndFeelDoctype: function(themePath) {
		var xmlString = this.readLookAndFeelXML(themePath);

		var match;

		if (xmlString) {
			match = xmlString.match(/(<!DOCTYPE.*>)/);
		}

		return match ? match[0] : null;
	},

	getLookAndFeelDoctypeByVersion: function(version) {
		version += '.0';

		return util.format('<!DOCTYPE look-and-feel PUBLIC "-//Liferay//DTD Look and Feel %s//EN" "http://www.liferay.com/dtd/liferay-look-and-feel_%s.dtd">', version, version.replace('\.', '_'));
	},

	getLookAndFeelJSON: function(themePath, cb) {
		var xmlString = this.readLookAndFeelXML(themePath);

		if (!xmlString) {
			return cb();
		}

		xml2js.parseString(xmlString, function(err, result) {
			cb(result);
		});
	},

	mergeLookAndFeelJSON: function(themePath, lookAndFeelJSON, cb) {
		var instance = this;

		instance.getLookAndFeelJSON(themePath, function(json) {
			if (_.isEmpty(lookAndFeelJSON)) {
				lookAndFeelJSON = json;
			}
			else if (json) {
				lookAndFeelJSON = instance._mergeJSON(lookAndFeelJSON, json);
			}

			var themeInfo = require(path.join(themePath, 'package.json')).liferayTheme;

			var baseTheme = themeInfo.baseTheme;

			if (_.isObject(baseTheme)) {
				themePath = path.join(themePath, 'node_modules', baseTheme.name);

				instance.mergeLookAndFeelJSON(themePath, lookAndFeelJSON, cb);
			}
			else {
				cb(lookAndFeelJSON);
			}
		});
	},

	readLookAndFeelXML: function(themePath) {
		var xmlString = this._xmlCache[themePath];

		if (xmlString) {
			return xmlString;
		}

		var lookAndFeelDefaultPath = path.join(themePath, 'src/WEB-INF/liferay-look-and-feel.xml');
		var lookAndFeelPath = path.join(themePath, pathSrc, 'WEB-INF/liferay-look-and-feel.xml');

		try {
			fs.statSync(lookAndFeelPath);
		}
		catch (e) {
			lookAndFeelPath = lookAndFeelDefaultPath;
		}

		try {
			xmlString = fs.readFileSync(lookAndFeelPath, 'utf8');

			this._xmlCache[themePath] = xmlString;
		}
		catch (e) {
		}

		return xmlString;
	},

	_extractThemeElement: function(obj, key) {
		return obj[STR_LOOK_AND_FEEL].theme[0][key];
	},

	_mergeJSON: function(themeObj, baseThemeObj) {
		var instance = this;

		_.forEach(QUERY_ELEMENTS, function(item, index) {
			var queryString = 'look-and-feel.theme.0.' + index;
			var mergedElement;

			if (item == 'value') {
				mergedElement = instance._mergeThemeElementByValue(
					_.get(themeObj, queryString),
					_.get(baseThemeObj, queryString)
				);
			}
			else {
				mergedElement = instance._mergeThemeElementById(
					_.get(themeObj, queryString),
					_.get(baseThemeObj, queryString),
					item
				);
			}

			if (mergedElement) {
				_.set(themeObj, queryString, mergedElement);
			}
		});

		return themeObj;
	},

	_mergeThemeElementById: function(themeElements, baseThemeElements, identifier) {
		if (!themeElements || !baseThemeElements) {
			return themeElements ? themeElements : baseThemeElements;
		}

		identifier = identifier || 'id';

		var allElements = themeElements.concat(baseThemeElements);
		var elementIds = [];

		return _.reduce(allElements, function(result, item, index) {
			var id = item.$[identifier];

			if (elementIds.indexOf(id) < 0) {
				elementIds.push(id);

				result.push(item);
			}

			return result;
		}, []);
	},

	_mergeThemeElementByValue: function(themeElements, baseThemeElements) {
		if (!themeElements || !baseThemeElements) {
			return themeElements ? themeElements : baseThemeElements;
		}

		return _.uniq(themeElements.concat(baseThemeElements));
	},

	_xmlCache: {}
};