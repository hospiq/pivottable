(function() {
  var callWithJQuery,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; },
    slice = [].slice,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    hasProp = {}.hasOwnProperty;

  callWithJQuery = function(pivotModule) {
    if (typeof exports === "object" && typeof module === "object") {
      return pivotModule(require("jquery"));
    } else if (typeof define === "function" && define.amd) {
      return define(["jquery"], pivotModule);
    } else {
      return pivotModule(jQuery);
    }
  };

  callWithJQuery(function($) {

    /*
    Utilities
     */
    var FLAT_KEY_DELIM, PivotData, addSeparators, aggregatorTemplates, aggregators, calculateValueRanges, convertToBarchart, dayNamesEn, derivers, generateBarchartScalers, generateHeatmappers, getSort, locales, mthNamesEn, naturalSort, numberFormat, pivotTableRenderer, rd, renderers, rx, rz, sortAs, usFmt, usFmtInt, usFmtPct, zeroPad;
    addSeparators = function(nStr, thousandsSep, decimalSep) {
      var rgx, x, x1, x2;
      nStr += '';
      x = nStr.split('.');
      x1 = x[0];
      x2 = x.length > 1 ? decimalSep + x[1] : '';
      rgx = /(\d+)(\d{3})/;
      while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + thousandsSep + '$2');
      }
      return x1 + x2;
    };
    numberFormat = function(opts) {
      var defaults;
      defaults = {
        digitsAfterDecimal: 2,
        scaler: 1,
        thousandsSep: ",",
        decimalSep: ".",
        prefix: "",
        suffix: ""
      };
      opts = $.extend({}, defaults, opts);
      return function(x) {
        var result;
        if (isNaN(x) || !isFinite(x) || (x == null)) {
          return "";
        }
        result = addSeparators((opts.scaler * x).toFixed(opts.digitsAfterDecimal), opts.thousandsSep, opts.decimalSep);
        return "" + opts.prefix + result + opts.suffix;
      };
    };
    usFmt = numberFormat();
    usFmtInt = numberFormat({
      digitsAfterDecimal: 0
    });
    usFmtPct = numberFormat({
      digitsAfterDecimal: 1,
      scaler: 100,
      suffix: "%"
    });
    aggregatorTemplates = {
      count: function(formatter) {
        if (formatter == null) {
          formatter = usFmtInt;
        }
        return function() {
          return function(data, rowKey, colKey) {
            return {
              count: 0,
              push: function() {
                return this.count++;
              },
              value: function() {
                return this.count;
              },
              format: formatter
            };
          };
        };
      },
      uniques: function(fn, formatter) {
        if (formatter == null) {
          formatter = usFmtInt;
        }
        return function(arg) {
          var attr;
          attr = arg[0];
          return function(data, rowKey, colKey) {
            return {
              uniq: [],
              push: function(record) {
                var ref;
                if (ref = record[attr], indexOf.call(this.uniq, ref) < 0) {
                  return this.uniq.push(record[attr]);
                }
              },
              value: function() {
                return fn(this.uniq);
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      sum: function(formatter) {
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var attr;
          attr = arg[0];
          return function(data, rowKey, colKey) {
            return {
              sum: null,
              push: function(record) {
                var x;
                x = parseFloat(record[attr]);
                if (!isNaN(x)) {
                  if (this.sum == null) {
                    this.sum = 0;
                  }
                  return this.sum += x;
                }
              },
              value: function() {
                return this.sum;
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      extremes: function(mode, formatter) {
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var attr;
          attr = arg[0];
          return function(data, rowKey, colKey) {
            return {
              val: null,
              sorter: getSort(data != null ? data.sorters : void 0, attr),
              push: function(record) {
                var ref, ref1, ref2, x;
                x = record[attr];
                if (mode === "min" || mode === "max") {
                  x = parseFloat(x);
                  if (!isNaN(x)) {
                    this.val = Math[mode](x, (ref = this.val) != null ? ref : x);
                  }
                }
                if (mode === "first") {
                  if (this.sorter(x, (ref1 = this.val) != null ? ref1 : x) <= 0) {
                    this.val = x;
                  }
                }
                if (mode === "last") {
                  if (this.sorter(x, (ref2 = this.val) != null ? ref2 : x) >= 0) {
                    return this.val = x;
                  }
                }
              },
              value: function() {
                return this.val;
              },
              format: function(x) {
                if (isNaN(x)) {
                  return x;
                } else {
                  return formatter(x);
                }
              },
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      quantile: function(q, formatter) {
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var attr;
          attr = arg[0];
          return function(data, rowKey, colKey) {
            return {
              vals: [],
              push: function(record) {
                var x;
                x = parseFloat(record[attr]);
                if (!isNaN(x)) {
                  return this.vals.push(x);
                }
              },
              value: function() {
                var i;
                if (this.vals.length === 0) {
                  return null;
                }
                this.vals.sort(function(a, b) {
                  return a - b;
                });
                i = (this.vals.length - 1) * q;
                return (this.vals[Math.floor(i)] + this.vals[Math.ceil(i)]) / 2.0;
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      runningStat: function(mode, ddof, formatter) {
        if (mode == null) {
          mode = "mean";
        }
        if (ddof == null) {
          ddof = 1;
        }
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var attr;
          attr = arg[0];
          return function(data, rowKey, colKey) {
            return {
              n: 0.0,
              m: 0.0,
              s: 0.0,
              push: function(record) {
                var m_new, x;
                x = parseFloat(record[attr]);
                if (isNaN(x)) {
                  return;
                }
                this.n += 1.0;
                if (this.n === 1.0) {
                  return this.m = x;
                } else {
                  m_new = this.m + (x - this.m) / this.n;
                  this.s = this.s + (x - this.m) * (x - m_new);
                  return this.m = m_new;
                }
              },
              value: function() {
                if (mode === "mean") {
                  if (this.n === 0) {
                    return 0 / 0;
                  } else {
                    return this.m;
                  }
                }
                if (this.n <= ddof) {
                  return 0;
                }
                switch (mode) {
                  case "var":
                    return this.s / (this.n - ddof);
                  case "stdev":
                    return Math.sqrt(this.s / (this.n - ddof));
                }
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      sumOverSum: function(formatter) {
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var denom, num;
          num = arg[0], denom = arg[1];
          return function(data, rowKey, colKey) {
            return {
              sumNum: 0,
              sumDenom: 0,
              push: function(record) {
                if (!isNaN(parseFloat(record[num]))) {
                  this.sumNum += parseFloat(record[num]);
                }
                if (!isNaN(parseFloat(record[denom]))) {
                  return this.sumDenom += parseFloat(record[denom]);
                }
              },
              value: function() {
                return this.sumNum / this.sumDenom;
              },
              format: formatter,
              numInputs: (num != null) && (denom != null) ? 0 : 2
            };
          };
        };
      },
      sumOverSumBound80: function(upper, formatter) {
        if (upper == null) {
          upper = true;
        }
        if (formatter == null) {
          formatter = usFmt;
        }
        return function(arg) {
          var denom, num;
          num = arg[0], denom = arg[1];
          return function(data, rowKey, colKey) {
            return {
              sumNum: 0,
              sumDenom: 0,
              push: function(record) {
                if (!isNaN(parseFloat(record[num]))) {
                  this.sumNum += parseFloat(record[num]);
                }
                if (!isNaN(parseFloat(record[denom]))) {
                  return this.sumDenom += parseFloat(record[denom]);
                }
              },
              value: function() {
                var sign;
                sign = upper ? 1 : -1;
                return (0.821187207574908 / this.sumDenom + this.sumNum / this.sumDenom + 1.2815515655446004 * sign * Math.sqrt(0.410593603787454 / (this.sumDenom * this.sumDenom) + (this.sumNum * (1 - this.sumNum / this.sumDenom)) / (this.sumDenom * this.sumDenom))) / (1 + 1.642374415149816 / this.sumDenom);
              },
              format: formatter,
              numInputs: (num != null) && (denom != null) ? 0 : 2
            };
          };
        };
      },
      fractionOf: function(wrapped, type, formatter) {
        if (type == null) {
          type = "total";
        }
        if (formatter == null) {
          formatter = usFmtPct;
        }
        return function() {
          var aggIdx, x;
          aggIdx = arguments[0], x = 2 <= arguments.length ? slice.call(arguments, 1) : [];
          return function(data, rowKey, colKey) {
            return {
              selector: {
                total: [[], []],
                row: [rowKey, []],
                col: [[], colKey]
              }[type],
              inner: wrapped.apply(null, x)(data, rowKey, colKey),
              push: function(record) {
                return this.inner.push(record);
              },
              format: formatter,
              value: function() {
                var agg;
                agg = data.getAggregator.apply(data, this.selector);
                if ($.isArray(agg)) {
                  agg = agg[aggIdx];
                }
                return this.inner.value() / agg.inner.value();
              },
              numInputs: wrapped.apply(null, x)().numInputs
            };
          };
        };
      }
    };
    aggregatorTemplates.countUnique = function(f) {
      return aggregatorTemplates.uniques((function(x) {
        return x.length;
      }), f);
    };
    aggregatorTemplates.listUnique = function(s) {
      return aggregatorTemplates.uniques((function(x) {
        return x.join(s);
      }), (function(x) {
        return x;
      }));
    };
    aggregatorTemplates.max = function(f) {
      return aggregatorTemplates.extremes('max', f);
    };
    aggregatorTemplates.min = function(f) {
      return aggregatorTemplates.extremes('min', f);
    };
    aggregatorTemplates.first = function(f) {
      return aggregatorTemplates.extremes('first', f);
    };
    aggregatorTemplates.last = function(f) {
      return aggregatorTemplates.extremes('last', f);
    };
    aggregatorTemplates.median = function(f) {
      return aggregatorTemplates.quantile(0.5, f);
    };
    aggregatorTemplates.average = function(f) {
      return aggregatorTemplates.runningStat("mean", 1, f);
    };
    aggregatorTemplates["var"] = function(ddof, f) {
      return aggregatorTemplates.runningStat("var", ddof, f);
    };
    aggregatorTemplates.stdev = function(ddof, f) {
      return aggregatorTemplates.runningStat("stdev", ddof, f);
    };
    aggregators = (function(tpl) {
      return {
        "Count": tpl.count(usFmtInt),
        "Count Unique Values": tpl.countUnique(usFmtInt),
        "List Unique Values": tpl.listUnique(", "),
        "Sum": tpl.sum(usFmt),
        "Integer Sum": tpl.sum(usFmtInt),
        "Average": tpl.average(usFmt),
        "Median": tpl.median(usFmt),
        "Sample Variance": tpl["var"](1, usFmt),
        "Sample Standard Deviation": tpl.stdev(1, usFmt),
        "Minimum": tpl.min(usFmt),
        "Maximum": tpl.max(usFmt),
        "First": tpl.first(usFmt),
        "Last": tpl.last(usFmt),
        "Sum over Sum": tpl.sumOverSum(usFmt),
        "80% Upper Bound": tpl.sumOverSumBound80(true, usFmt),
        "80% Lower Bound": tpl.sumOverSumBound80(false, usFmt),
        "Sum as Fraction of Total": tpl.fractionOf(tpl.sum(), "total", usFmtPct),
        "Sum as Fraction of Rows": tpl.fractionOf(tpl.sum(), "row", usFmtPct),
        "Sum as Fraction of Columns": tpl.fractionOf(tpl.sum(), "col", usFmtPct),
        "Count as Fraction of Total": tpl.fractionOf(tpl.count(), "total", usFmtPct),
        "Count as Fraction of Rows": tpl.fractionOf(tpl.count(), "row", usFmtPct),
        "Count as Fraction of Columns": tpl.fractionOf(tpl.count(), "col", usFmtPct)
      };
    })(aggregatorTemplates);
    renderers = {
      "Table": function(data, opts) {
        return pivotTableRenderer(data, opts);
      },
      "Table Barchart": function(data, opts) {
        return pivotTableRenderer(data, opts, "barchart");
      },
      "Heatmap": function(data, opts) {
        return pivotTableRenderer(data, opts, "heatmap");
      },
      "Row Heatmap": function(data, opts) {
        return pivotTableRenderer(data, opts, "rowheatmap");
      },
      "Col Heatmap": function(data, opts) {
        return pivotTableRenderer(data, opts, "colheatmap");
      }
    };
    locales = {
      en: {
        aggregators: aggregators,
        renderers: renderers,
        localeStrings: {
          renderError: "An error occurred rendering the PivotTable results.",
          computeError: "An error occurred computing the PivotTable results.",
          uiRenderError: "An error occurred rendering the PivotTable UI.",
          selectAll: "Select All",
          selectNone: "Select None",
          tooMany: "(too many to list)",
          filterResults: "Filter values",
          apply: "Apply",
          cancel: "Cancel",
          totals: "Totals",
          vs: "vs",
          by: "by"
        }
      }
    };
    mthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    dayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    zeroPad = function(number) {
      return ("0" + number).substr(-2, 2);
    };
    derivers = {
      bin: function(col, binWidth) {
        return function(record) {
          return record[col] - record[col] % binWidth;
        };
      },
      dateFormat: function(col, formatString, utcOutput, mthNames, dayNames) {
        var utc;
        if (utcOutput == null) {
          utcOutput = false;
        }
        if (mthNames == null) {
          mthNames = mthNamesEn;
        }
        if (dayNames == null) {
          dayNames = dayNamesEn;
        }
        utc = utcOutput ? "UTC" : "";
        return function(record) {
          var date;
          date = new Date(Date.parse(record[col]));
          if (isNaN(date)) {
            return "";
          }
          return formatString.replace(/%(.)/g, function(m, p) {
            switch (p) {
              case "y":
                return date["get" + utc + "FullYear"]();
              case "m":
                return zeroPad(date["get" + utc + "Month"]() + 1);
              case "n":
                return mthNames[date["get" + utc + "Month"]()];
              case "d":
                return zeroPad(date["get" + utc + "Date"]());
              case "w":
                return dayNames[date["get" + utc + "Day"]()];
              case "x":
                return date["get" + utc + "Day"]();
              case "H":
                return zeroPad(date["get" + utc + "Hours"]());
              case "M":
                return zeroPad(date["get" + utc + "Minutes"]());
              case "S":
                return zeroPad(date["get" + utc + "Seconds"]());
              default:
                return "%" + p;
            }
          });
        };
      }
    };
    rx = /(\d+)|(\D+)/g;
    rd = /\d/;
    rz = /^0/;
    naturalSort = (function(_this) {
      return function(as, bs) {
        var a, a1, b, b1, nas, nbs;
        if ((bs != null) && (as == null)) {
          return -1;
        }
        if ((as != null) && (bs == null)) {
          return 1;
        }
        if (typeof as === "number" && isNaN(as)) {
          return -1;
        }
        if (typeof bs === "number" && isNaN(bs)) {
          return 1;
        }
        nas = +as;
        nbs = +bs;
        if (nas < nbs) {
          return -1;
        }
        if (nas > nbs) {
          return 1;
        }
        if (typeof as === "number" && typeof bs !== "number") {
          return -1;
        }
        if (typeof bs === "number" && typeof as !== "number") {
          return 1;
        }
        if (typeof as === "number" && typeof bs === "number") {
          return 0;
        }
        if (isNaN(nbs) && !isNaN(nas)) {
          return -1;
        }
        if (isNaN(nas) && !isNaN(nbs)) {
          return 1;
        }
        a = String(as);
        b = String(bs);
        if (a === b) {
          return 0;
        }
        if (!(rd.test(a) && rd.test(b))) {
          return (a > b ? 1 : -1);
        }
        a = a.match(rx);
        b = b.match(rx);
        while (a.length && b.length) {
          a1 = a.shift();
          b1 = b.shift();
          if (a1 !== b1) {
            if (rd.test(a1) && rd.test(b1)) {
              return a1.replace(rz, ".0") - b1.replace(rz, ".0");
            } else {
              return (a1 > b1 ? 1 : -1);
            }
          }
        }
        return a.length - b.length;
      };
    })(this);
    sortAs = function(order) {
      var i, l_mapping, mapping, x;
      mapping = {};
      l_mapping = {};
      for (i in order) {
        x = order[i];
        mapping[x] = i;
        if (typeof x === "string") {
          l_mapping[x.toLowerCase()] = i;
        }
      }
      return function(a, b) {
        if ((mapping[a] != null) && (mapping[b] != null)) {
          return mapping[a] - mapping[b];
        } else if (mapping[a] != null) {
          return -1;
        } else if (mapping[b] != null) {
          return 1;
        } else if ((l_mapping[a] != null) && (l_mapping[b] != null)) {
          return l_mapping[a] - l_mapping[b];
        } else if (l_mapping[a] != null) {
          return -1;
        } else if (l_mapping[b] != null) {
          return 1;
        } else {
          return naturalSort(a, b);
        }
      };
    };
    getSort = function(sorters, attr) {
      var sort;
      if (sorters != null) {
        if ($.isFunction(sorters)) {
          sort = sorters(attr);
          if ($.isFunction(sort)) {
            return sort;
          }
        } else if (sorters[attr] != null) {
          return sorters[attr];
        }
      }
      return naturalSort;
    };

    /*
    Data Model class
     */
    FLAT_KEY_DELIM = '\u0001';
    PivotData = (function() {
      function PivotData(input, opts) {
        var ref, ref1, ref10, ref11, ref12, ref13, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9;
        if (opts == null) {
          opts = {};
        }
        this.getAggregator = bind(this.getAggregator, this);
        this.getRowKeys = bind(this.getRowKeys, this);
        this.getColKeys = bind(this.getColKeys, this);
        this.sortKeys = bind(this.sortKeys, this);
        this.arrSort = bind(this.arrSort, this);
        this.input = input;
        this.aggregator = (ref = opts.aggregator) != null ? ref : aggregatorTemplates.count()();
        this.aggregatorName = (ref1 = opts.aggregatorName) != null ? ref1 : "Count";
        this.multiAggAttr = (ref2 = opts.multiAggAttr) != null ? ref2 : "_metrics";
        this.colAttrs = (ref3 = opts.cols) != null ? ref3 : [];
        this.rowAttrs = (ref4 = opts.rows) != null ? ref4 : [];
        this.valAttrs = (ref5 = opts.vals) != null ? ref5 : [];
        if ($.isArray(this.aggregator) && (ref6 = this.multiAggAttr, indexOf.call(this.colAttrs, ref6) < 0) && (ref7 = this.multiAggAttr, indexOf.call(this.rowAttrs, ref7) < 0)) {
          this.colAttrs.push(this.multiAggAttr);
        }
        this.sorters = (ref8 = opts.sorters) != null ? ref8 : {};
        this.rowOrder = (ref9 = opts.rowOrder) != null ? ref9 : "key_a_to_z";
        this.colOrder = (ref10 = opts.colOrder) != null ? ref10 : "key_a_to_z";
        this.derivedAttributes = (ref11 = opts.derivedAttributes) != null ? ref11 : {};
        this.filter = (ref12 = opts.filter) != null ? ref12 : (function() {
          return true;
        });
        this.emptyValue = (ref13 = opts.emptyValue) != null ? ref13 : 'null';
        this.rowKeys = [];
        this.colKeys = [];
        this.tree = {};
        this.rowTotals = {};
        this.colTotals = {};
        this.allTotal = !$.isArray(this.aggregator) ? this.aggregator(this, [], []) : this.aggregator.map((function(_this) {
          return function(agg) {
            return agg(_this, [], []);
          };
        })(this));
        this.sorted = false;
        this.opts = opts;
        PivotData.forEachRecord(input, opts, (function(_this) {
          return function(record) {
            if (opts.filter(record)) {
              return _this.processRecord(record);
            }
          };
        })(this));
      }

      PivotData.forEachRecord = function(input, opts, f) {
        var addRecord, compactRecord, i, j, k, l, len1, record, ref, results, results1, tblCols;
        if ($.isEmptyObject(opts.derivedAttributes)) {
          addRecord = f;
        } else {
          addRecord = function(record) {
            var k, ref, ref1, v;
            ref = opts.derivedAttributes;
            for (k in ref) {
              v = ref[k];
              record[k] = (ref1 = v(record)) != null ? ref1 : record[k];
            }
            return f(record);
          };
        }
        if ($.isFunction(input)) {
          return input(addRecord);
        } else if ($.isArray(input)) {
          if (!opts.treatDataArrayAsRecords) {
            results = [];
            for (i in input) {
              if (!hasProp.call(input, i)) continue;
              compactRecord = input[i];
              if (!(i > 0)) {
                continue;
              }
              record = {};
              ref = input[0];
              for (j in ref) {
                if (!hasProp.call(ref, j)) continue;
                k = ref[j];
                record[k] = compactRecord[j];
              }
              results.push(addRecord(record));
            }
            return results;
          } else {
            results1 = [];
            for (l = 0, len1 = input.length; l < len1; l++) {
              record = input[l];
              results1.push(addRecord(record));
            }
            return results1;
          }
        } else if (input instanceof $) {
          tblCols = [];
          $("thead > tr > th", input).each(function(i) {
            return tblCols.push($(this).text());
          });
          return $("tbody > tr", input).each(function(i) {
            record = {};
            $("td", this).each(function(j) {
              return record[tblCols[j]] = $(this).text();
            });
            return addRecord(record);
          });
        } else {
          throw new Error("unknown input format");
        }
      };

      PivotData.prototype.forEachMatchingRecord = function(criteria, callback) {
        return PivotData.forEachRecord(this.input, this.opts, (function(_this) {
          return function(record) {
            var k, ref, v;
            if (!_this.opts.filter(record)) {
              return;
            }
            for (k in criteria) {
              if (!hasProp.call(criteria, k)) continue;
              v = criteria[k];
              if (v !== ((ref = record[k]) != null ? ref : _this.emptyValue)) {
                return;
              }
            }
            return callback(record);
          };
        })(this));
      };

      PivotData.prototype.arrSort = function(attrs, order) {
        var a, sortersArr;
        sortersArr = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = attrs.length; l < len1; l++) {
            a = attrs[l];
            results.push(getSort(this.sorters, a));
          }
          return results;
        }).call(this);
        return function(keyA, keyB) {
          var attrIdx, comparison, sorter;
          for (attrIdx in sortersArr) {
            if (!hasProp.call(sortersArr, attrIdx)) continue;
            sorter = sortersArr[attrIdx];
            comparison = sorter(keyA[attrIdx], keyB[attrIdx]);
            if ((order != null) && order[attrIdx] === "-") {
              comparison *= -1;
            }
            if (comparison !== 0) {
              return comparison;
            }
          }
          return 0;
        };
      };

      PivotData.prototype.sortKeys = function() {
        var _sortByAggVal, aggIdx, attrs, attrsOrder, idx, isDesc, isRow, key, keys, l, len1, ref, ref1, results, sortOrder, sortParts, sortType, sortVal;
        if (this.sorted) {
          return;
        }
        this.sorted = true;
        ref = [[this.rowOrder, this.rowKeys, this.rowAttrs], [this.colOrder, this.colKeys, this.colAttrs]];
        results = [];
        for (idx = l = 0, len1 = ref.length; l < len1; idx = ++l) {
          ref1 = ref[idx], sortOrder = ref1[0], keys = ref1[1], attrs = ref1[2];
          isRow = idx === 0;
          _sortByAggVal = (function(_this) {
            return function(comparisonKey, isDesc, aggIdx) {
              var _getVal;
              _getVal = function(sortKey) {
                var agg, col, row;
                row = isRow ? sortKey : comparisonKey;
                col = !isRow ? sortKey : comparisonKey;
                agg = _this.getAggregator(row, col);
                if ($.isArray(agg)) {
                  agg = agg[aggIdx || 0];
                }
                return agg.value();
              };
              return keys.sort(function(a, b) {
                return naturalSort(_getVal(a), _getVal(b)) * (isDesc ? -1 : 1);
              });
            };
          })(this);
          switch (sortOrder) {
            case "value_a_to_z":
              results.push(_sortByAggVal([]));
              break;
            case "value_z_to_a":
              results.push(_sortByAggVal([], true));
              break;
            case "key_a_to_z":
              results.push(keys.sort(this.arrSort(attrs)));
              break;
            default:
              sortParts = sortOrder.split("_");
              sortType = sortParts[0];
              switch (sortType) {
                case "attr":
                  attrsOrder = sortParts.slice(1);
                  results.push(keys.sort(this.arrSort(attrs, attrsOrder)));
                  break;
                default:
                  sortVal = sortParts[1];
                  isDesc = false;
                  if (sortVal.startsWith("-")) {
                    sortVal = sortVal.slice(1);
                    isDesc = true;
                  }
                  if (sortType === "key") {
                    key = sortVal.split(FLAT_KEY_DELIM);
                    results.push(_sortByAggVal(key, isDesc));
                  } else {
                    aggIdx = parseInt(sortVal);
                    results.push(_sortByAggVal([], isDesc, aggIdx));
                  }
              }
          }
        }
        return results;
      };

      PivotData.prototype.getColKeys = function() {
        var e;
        try {
          this.sortKeys();
        } catch (error) {
          e = error;
        }
        return this.colKeys;
      };

      PivotData.prototype.getRowKeys = function() {
        var e;
        try {
          this.sortKeys();
        } catch (error) {
          e = error;
        }
        return this.rowKeys;
      };

      PivotData.prototype.processRecord = function(record, aggIdx) {
        var agg, aggregator, allTotal, attrs, colKey, flatColKey, flatKey, flatRowKey, getTotalsAgg, isMultiTotals, keys, l, len1, len2, len3, len4, n, o, rawKey, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, rowKey, rowOrCol, t, totals, totalsAgg, x;
        if ($.isArray(this.aggregator) && (aggIdx == null)) {
          ref = this.aggregator;
          for (aggIdx = l = 0, len1 = ref.length; l < len1; aggIdx = ++l) {
            agg = ref[aggIdx];
            record[this.multiAggAttr] = aggIdx;
            this.processRecord(record, aggIdx);
          }
          delete record[this.multiAggAttr];
          return;
        }
        aggregator = aggIdx != null ? this.aggregator[aggIdx] : this.aggregator;
        colKey = [];
        rowKey = [];
        ref1 = this.colAttrs;
        for (n = 0, len2 = ref1.length; n < len2; n++) {
          x = ref1[n];
          colKey.push((ref2 = record[x]) != null ? ref2 : this.emptyValue);
        }
        ref3 = this.rowAttrs;
        for (o = 0, len3 = ref3.length; o < len3; o++) {
          x = ref3[o];
          rowKey.push((ref4 = record[x]) != null ? ref4 : this.emptyValue);
        }
        flatRowKey = rowKey.join(FLAT_KEY_DELIM);
        flatColKey = colKey.join(FLAT_KEY_DELIM);
        allTotal = aggIdx != null ? this.allTotal[aggIdx] : this.allTotal;
        allTotal.push(record);
        getTotalsAgg = (function(_this) {
          return function(rowOrCol, key) {
            var c, r;
            r = rowOrCol === "row" ? key : [];
            c = rowOrCol === "row" ? [] : key;
            return aggregator(_this, r, c);
          };
        })(this);
        ref5 = [["row", this.colAttrs, this.rowKeys, rowKey, flatRowKey, this.rowTotals], ["col", this.rowAttrs, this.colKeys, colKey, flatColKey, this.colTotals]];
        for (t = 0, len4 = ref5.length; t < len4; t++) {
          ref6 = ref5[t], rowOrCol = ref6[0], attrs = ref6[1], keys = ref6[2], rawKey = ref6[3], flatKey = ref6[4], totals = ref6[5];
          isMultiTotals = (aggIdx != null) && (ref7 = this.multiAggAttr, indexOf.call(attrs, ref7) >= 0);
          if (rawKey.length !== 0) {
            if (!totals[flatKey]) {
              keys.push(rawKey);
              totals[flatKey] = isMultiTotals ? [] : getTotalsAgg(rowOrCol, rawKey);
            }
            if (isMultiTotals && !totals[flatKey][aggIdx]) {
              totals[flatKey][aggIdx] = getTotalsAgg(rowOrCol, rawKey);
            }
            totalsAgg = totals[flatKey];
            if (isMultiTotals) {
              totalsAgg = totalsAgg[aggIdx];
            }
            totalsAgg.push(record);
          }
        }
        if (colKey.length !== 0 && rowKey.length !== 0) {
          if (!this.tree[flatRowKey]) {
            this.tree[flatRowKey] = {};
          }
          if (!this.tree[flatRowKey][flatColKey]) {
            this.tree[flatRowKey][flatColKey] = aggregator(this, rowKey, colKey);
          }
          return this.tree[flatRowKey][flatColKey].push(record);
        }
      };

      PivotData.prototype.getAggregator = function(rowKey, colKey) {
        var agg, flatColKey, flatRowKey;
        flatRowKey = rowKey.join(FLAT_KEY_DELIM);
        flatColKey = colKey.join(FLAT_KEY_DELIM);
        if (rowKey.length === 0 && colKey.length === 0) {
          agg = this.allTotal;
        } else if (rowKey.length === 0) {
          agg = this.colTotals[flatColKey];
        } else if (colKey.length === 0) {
          agg = this.rowTotals[flatRowKey];
        } else {
          agg = this.tree[flatRowKey][flatColKey];
        }
        if ($.isArray(agg)) {
          return agg;
        } else {
          return agg != null ? agg : {
            value: (function() {
              return null;
            }),
            format: function() {
              return "";
            }
          };
        }
      };

      return PivotData;

    })();
    $.pivotUtilities = {
      aggregatorTemplates: aggregatorTemplates,
      aggregators: aggregators,
      renderers: renderers,
      derivers: derivers,
      locales: locales,
      naturalSort: naturalSort,
      numberFormat: numberFormat,
      sortAs: sortAs,
      PivotData: PivotData
    };

    /*
    Default Renderer for hierarchical table layout
     */
    pivotTableRenderer = function(pivotData, opts, rendererType) {
      var agg, aggIdx, aggregator, colAttr, colAttrIdx, colAttrs, colKey, colKeyIdx, colKeys, createHeader, createTotalsCell, createTotalsRow, defaults, flatColKey, flatRowKey, getClickHandler, getHeaderClickHandler, heatmappers, i, l, len1, len2, len3, len4, len5, len6, len7, len8, n, o, ref, ref1, ref2, ref3, result, rowAttr, rowAttrIdx, rowAttrs, rowKey, rowKeyIdx, rowKeys, scalers, spanSize, t, tbody, td, th, thead, totalAggregator, tr, txt, u, val, valueRanges, w, x, y, z;
      defaults = {
        table: {
          clickCallback: null
        },
        localeStrings: {
          totals: "Totals"
        },
        treatDataArrayAsRecords: false
      };
      opts = $.extend(true, {}, defaults, opts);
      colAttrs = pivotData.colAttrs;
      rowAttrs = pivotData.rowAttrs;
      rowKeys = pivotData.getRowKeys();
      colKeys = pivotData.getColKeys();
      if (opts.table.clickCallback) {
        getClickHandler = function(value, rowKey, colKey) {
          var attr, filters, i, l, len1, len2, n;
          filters = {};
          for (i = l = 0, len1 = colAttrs.length; l < len1; i = ++l) {
            attr = colAttrs[i];
            if (colKey[i] != null) {
              filters[attr] = colKey[i];
            }
          }
          for (i = n = 0, len2 = rowAttrs.length; n < len2; i = ++n) {
            attr = rowAttrs[i];
            if (rowKey[i] != null) {
              filters[attr] = rowKey[i];
            }
          }
          return function(e) {
            return opts.table.clickCallback(e, value, filters, pivotData);
          };
        };
      }
      if (opts.table.headerClickCallback) {
        getHeaderClickHandler = function(rowOrCol, type, val) {
          return function(e) {
            return opts.table.headerClickCallback(e, rowOrCol, type, val);
          };
        };
      }
      if (rendererType != null) {
        valueRanges = calculateValueRanges(rendererType, pivotData);
        if (rendererType === "heatmap" || rendererType === "rowheatmap" || rendererType === "colheatmap") {
          heatmappers = generateHeatmappers(valueRanges, opts);
        } else if (rendererType === "barchart") {
          scalers = generateBarchartScalers(valueRanges);
        }
      }
      result = document.createElement("table");
      result.className = "pvtTable";
      spanSize = function(keys, keyIdx, maxAttrIdx) {
        var attrIdx, l, len, n, noDraw, ref, ref1, stop;
        if (keyIdx !== 0) {
          noDraw = true;
          for (attrIdx = l = 0, ref = maxAttrIdx; 0 <= ref ? l <= ref : l >= ref; attrIdx = 0 <= ref ? ++l : --l) {
            if (keys[keyIdx - 1][attrIdx] !== keys[keyIdx][attrIdx]) {
              noDraw = false;
            }
          }
          if (noDraw) {
            return -1;
          }
        }
        len = 0;
        while (keyIdx + len < keys.length) {
          stop = false;
          for (attrIdx = n = 0, ref1 = maxAttrIdx; 0 <= ref1 ? n <= ref1 : n >= ref1; attrIdx = 0 <= ref1 ? ++n : --n) {
            if (keys[keyIdx][attrIdx] !== keys[keyIdx + len][attrIdx]) {
              stop = true;
            }
          }
          if (stop) {
            break;
          }
          len++;
        }
        return len;
      };
      thead = document.createElement("thead");
      for (colAttrIdx = l = 0, len1 = colAttrs.length; l < len1; colAttrIdx = ++l) {
        colAttr = colAttrs[colAttrIdx];
        tr = document.createElement("tr");
        if (parseInt(colAttrIdx) === 0 && rowAttrs.length !== 0) {
          th = document.createElement("th");
          th.setAttribute("colspan", rowAttrs.length);
          th.setAttribute("rowspan", colAttrs.length);
          tr.appendChild(th);
        }
        th = document.createElement("th");
        th.className = "pvtAxisLabel";
        th.textContent = colAttr;
        if (getHeaderClickHandler != null) {
          th.onclick = getHeaderClickHandler("col", "attr", colAttr);
        }
        tr.appendChild(th);
        for (colKeyIdx = n = 0, len2 = colKeys.length; n < len2; colKeyIdx = ++n) {
          colKey = colKeys[colKeyIdx];
          x = spanSize(colKeys, parseInt(colKeyIdx), parseInt(colAttrIdx));
          if (x !== -1) {
            th = document.createElement("th");
            th.className = "pvtColLabel";
            if (opts.formatHeader) {
              th.textContent = opts.formatHeader(colKey[colAttrIdx], colAttrs[colAttrIdx]);
            } else {
              th.textContent = colKey[colAttrIdx];
            }
            th.setAttribute("colspan", x);
            if ((getHeaderClickHandler != null) && colAttrIdx === (colAttrs.length - 1)) {
              flatColKey = colKey.join(FLAT_KEY_DELIM);
              th.onclick = getHeaderClickHandler("col", "key", flatColKey);
              th.setAttribute("data-flat-key", flatColKey);
            }
            if (parseInt(colAttrIdx) === colAttrs.length - 1 && rowAttrs.length !== 0) {
              th.setAttribute("rowspan", 2);
            }
            tr.appendChild(th);
          }
        }
        if (parseInt(colAttrIdx) === 0) {
          createHeader = function(aggIdx) {
            th = document.createElement("th");
            th.className = "pvtTotalLabel pvtRowTotalLabel";
            th.innerHTML = opts.localeStrings.totals;
            if (aggIdx != null) {
              th.setAttribute("data-agg-idx", aggIdx);
            }
            th.setAttribute("rowspan", colAttrs.length + (rowAttrs.length === 0 ? 0 : 1));
            if (getHeaderClickHandler != null) {
              th.onclick = getHeaderClickHandler("col", "totals", aggIdx || 0);
            }
            return tr.appendChild(th);
          };
          if ($.isArray(pivotData.aggregator) && (ref = pivotData.multiAggAttr, indexOf.call(colAttrs, ref) >= 0)) {
            if (colAttrs.length > 1) {
              ref1 = pivotData.aggregator;
              for (aggIdx = o = 0, len3 = ref1.length; o < len3; aggIdx = ++o) {
                agg = ref1[aggIdx];
                createHeader(aggIdx);
              }
            }
          } else {
            createHeader();
          }
        }
        thead.appendChild(tr);
      }
      if (rowAttrs.length !== 0) {
        tr = document.createElement("tr");
        for (i = t = 0, len4 = rowAttrs.length; t < len4; i = ++t) {
          rowAttr = rowAttrs[i];
          th = document.createElement("th");
          th.className = "pvtAxisLabel";
          th.textContent = rowAttr;
          if (getHeaderClickHandler != null) {
            th.onclick = getHeaderClickHandler("row", "attr", rowAttr);
          }
          tr.appendChild(th);
        }
        th = document.createElement("th");
        if (colAttrs.length === 0) {
          th.className = "pvtTotalLabel pvtRowTotalLabel";
          th.innerHTML = opts.localeStrings.totals;
          if (getHeaderClickHandler != null) {
            th.onclick = getHeaderClickHandler("col", "totals", 0);
          }
        }
        tr.appendChild(th);
        thead.appendChild(tr);
      }
      result.appendChild(thead);
      tbody = document.createElement("tbody");
      for (rowKeyIdx = u = 0, len5 = rowKeys.length; u < len5; rowKeyIdx = ++u) {
        rowKey = rowKeys[rowKeyIdx];
        tr = document.createElement("tr");
        for (rowAttrIdx in rowKey) {
          if (!hasProp.call(rowKey, rowAttrIdx)) continue;
          txt = rowKey[rowAttrIdx];
          x = spanSize(rowKeys, parseInt(rowKeyIdx), parseInt(rowAttrIdx));
          if (x !== -1) {
            th = document.createElement("th");
            th.className = "pvtRowLabel";
            if (opts.formatHeader) {
              th.textContent = opts.formatHeader(txt, rowAttrs[rowAttrIdx]);
            } else {
              th.textContent = txt;
            }
            th.setAttribute("rowspan", x);
            if (parseInt(rowAttrIdx) === rowAttrs.length - 1 && colAttrs.length !== 0) {
              th.setAttribute("colspan", 2);
            }
            if ((getHeaderClickHandler != null) && parseInt(rowAttrIdx) === rowAttrs.length - 1) {
              flatRowKey = rowKey.join(FLAT_KEY_DELIM);
              th.onclick = getHeaderClickHandler("row", "key", flatRowKey);
              th.setAttribute("data-flat-key", flatRowKey);
            }
            tr.appendChild(th);
          }
        }
        for (colKeyIdx = w = 0, len6 = colKeys.length; w < len6; colKeyIdx = ++w) {
          colKey = colKeys[colKeyIdx];
          aggregator = pivotData.getAggregator(rowKey, colKey);
          val = aggregator.value();
          td = document.createElement("td");
          td.className = "pvtVal row" + rowKeyIdx + " col" + colKeyIdx;
          td.textContent = aggregator.format(val);
          if (heatmappers != null) {
            td.style.backgroundColor = (function() {
              switch (rendererType) {
                case "heatmap":
                  return heatmappers.all(val);
                case "rowheatmap":
                  return heatmappers.rows[rowKeyIdx](val);
                case "colheatmap":
                  return heatmappers.cols[colKeyIdx](val);
              }
            })();
          } else if (scalers != null) {
            convertToBarchart(td, scalers.rows[rowKeyIdx](val));
          }
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, colKey);
          }
          tr.appendChild(td);
        }
        createTotalsCell = function(totalAggregator) {
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal rowTotal";
          td.textContent = totalAggregator.format(val);
          if (heatmappers != null) {
            td.style.backgroundColor = heatmappers.rowTotals(val);
          }
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, []);
          }
          td.setAttribute("data-for", "row" + rowKeyIdx);
          return tr.appendChild(td);
        };
        totalAggregator = pivotData.getAggregator(rowKey, []);
        if ($.isArray(totalAggregator)) {
          if (colAttrs.length > 1) {
            for (y = 0, len7 = totalAggregator.length; y < len7; y++) {
              agg = totalAggregator[y];
              createTotalsCell(agg);
            }
          }
        } else {
          createTotalsCell(totalAggregator);
        }
        tbody.appendChild(tr);
      }
      createTotalsRow = function(aggIdx) {
        var createGrandTotalCell, i1, len8, len9, z;
        tr = document.createElement("tr");
        th = document.createElement("th");
        th.className = "pvtTotalLabel pvtColTotalLabel";
        th.innerHTML = opts.localeStrings.totals;
        if (aggIdx != null) {
          th.setAttribute("data-agg-idx", aggIdx);
        }
        th.setAttribute("colspan", rowAttrs.length + (colAttrs.length === 0 ? 0 : 1));
        if (getHeaderClickHandler != null) {
          th.onclick = getHeaderClickHandler("row", "totals", aggIdx || 0);
        }
        tr.appendChild(th);
        for (colKeyIdx = z = 0, len8 = colKeys.length; z < len8; colKeyIdx = ++z) {
          colKey = colKeys[colKeyIdx];
          totalAggregator = pivotData.getAggregator([], colKey);
          if (aggIdx != null) {
            totalAggregator = totalAggregator[aggIdx];
          }
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal colTotal";
          td.textContent = totalAggregator.format(val);
          if (heatmappers != null) {
            td.style.backgroundColor = heatmappers.colTotals(val);
          } else if (scalers != null) {
            convertToBarchart(td, scalers.colTotals(val));
          }
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], colKey);
          }
          td.setAttribute("data-for", "col" + colKeyIdx);
          tr.appendChild(td);
        }
        createGrandTotalCell = function(totalAggregator) {
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtGrandTotal";
          td.textContent = totalAggregator.format(val);
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], []);
          }
          return tr.appendChild(td);
        };
        totalAggregator = pivotData.getAggregator([], []);
        if (!$.isArray(totalAggregator)) {
          createGrandTotalCell(totalAggregator);
        } else if (aggIdx != null) {
          createGrandTotalCell(totalAggregator[aggIdx]);
        } else {
          if (colAttrs.length > 1) {
            for (i1 = 0, len9 = totalAggregator.length; i1 < len9; i1++) {
              agg = totalAggregator[i1];
              createGrandTotalCell(agg);
            }
          }
        }
        return tbody.appendChild(tr);
      };
      if ($.isArray(pivotData.aggregator) && (ref2 = pivotData.multiAggAttr, indexOf.call(rowAttrs, ref2) >= 0)) {
        if (rowAttrs.length > 1) {
          ref3 = pivotData.aggregator;
          for (aggIdx = z = 0, len8 = ref3.length; z < len8; aggIdx = ++z) {
            agg = ref3[aggIdx];
            createTotalsRow(aggIdx);
          }
        }
      } else {
        createTotalsRow();
      }
      result.appendChild(tbody);
      return result;
    };
    calculateValueRanges = (function(_this) {
      return function(rendererType, pivotData) {
        var colKey, colKeyIdx, l, len1, len2, len3, len4, len5, n, o, rangeType, rangeTypes, ref, ref1, rowKey, rowKeyIdx, seedRange, t, totalAgg, totalAggs, u, updateRange, val, valueRanges;
        valueRanges = {};
        rangeTypes = (function() {
          switch (rendererType) {
            case "heatmap":
              return ["all", "rowTotals", "colTotals"];
            case "rowheatmap":
              return ["rows", "rowTotals", "colTotals"];
            case "colheatmap":
              return ["cols", "rowTotals", "colTotals"];
            case "barchart":
              return ["rows", "colTotals"];
          }
        })();
        seedRange = function(rangeType) {
          var key, keyIdx, keys, l, len1, results, seedDimRange;
          if (rangeType === "rows" || rangeType === "cols") {
            valueRanges[rangeType] = {};
            keys = rangeType === "rows" ? pivotData.rowKeys : pivotData.colKeys;
            seedDimRange = function(keyIdx) {
              return valueRanges[rangeType][keyIdx] = [2e308, -2e308];
            };
            results = [];
            for (keyIdx = l = 0, len1 = keys.length; l < len1; keyIdx = ++l) {
              key = keys[keyIdx];
              results.push(seedDimRange(keyIdx));
            }
            return results;
          } else {
            return valueRanges[rangeType] = [2e308, -2e308];
          }
        };
        for (l = 0, len1 = rangeTypes.length; l < len1; l++) {
          rangeType = rangeTypes[l];
          seedRange(rangeType);
        }
        updateRange = function(range, val) {
          if ((val != null) && isFinite(val)) {
            range[0] = Math.min(range[0], val);
            return range[1] = Math.max(range[1], val);
          }
        };
        ref = pivotData.rowKeys;
        for (rowKeyIdx = n = 0, len2 = ref.length; n < len2; rowKeyIdx = ++n) {
          rowKey = ref[rowKeyIdx];
          ref1 = pivotData.colKeys;
          for (colKeyIdx = o = 0, len3 = ref1.length; o < len3; colKeyIdx = ++o) {
            colKey = ref1[colKeyIdx];
            val = pivotData.getAggregator(rowKey, colKey).value();
            if (valueRanges.all != null) {
              updateRange(valueRanges.all, val);
            }
            if (valueRanges.rows != null) {
              updateRange(valueRanges.rows[rowKeyIdx], val);
            }
            if (valueRanges.cols != null) {
              updateRange(valueRanges.cols[colKeyIdx], val);
            }
            if (rowKeyIdx === 0 && (valueRanges.colTotals != null)) {
              totalAggs = $.makeArray(pivotData.getAggregator([], colKey));
              for (t = 0, len4 = totalAggs.length; t < len4; t++) {
                totalAgg = totalAggs[t];
                updateRange(valueRanges.colTotals, totalAgg.value());
              }
            }
          }
          if (valueRanges.rowTotals != null) {
            totalAggs = $.makeArray(pivotData.getAggregator(rowKey, []));
            for (u = 0, len5 = totalAggs.length; u < len5; u++) {
              totalAgg = totalAggs[u];
              updateRange(valueRanges.rowTotals, totalAgg.value());
            }
          }
        }
        return valueRanges;
      };
    })(this);
    generateHeatmappers = function(valueRanges, opts) {
      var colorScaleGenerator, heatmappers, keyIdx, range, rangeType, ref, ref1;
      heatmappers = {};
      colorScaleGenerator = opts != null ? (ref = opts.heatmap) != null ? ref.colorScaleGenerator : void 0 : void 0;
      if (colorScaleGenerator == null) {
        colorScaleGenerator = function(arg) {
          var max, min;
          min = arg[0], max = arg[1];
          return function(x) {
            var nonRed;
            nonRed = 255 - Math.round(255 * (x - min) / (max - min));
            return "rgb(255," + nonRed + "," + nonRed + ")";
          };
        };
      }
      for (rangeType in valueRanges) {
        if (rangeType === "rows" || rangeType === "cols") {
          heatmappers[rangeType] = {};
          ref1 = valueRanges[rangeType];
          for (keyIdx in ref1) {
            range = ref1[keyIdx];
            heatmappers[rangeType][keyIdx] = colorScaleGenerator(range);
          }
        } else {
          heatmappers[rangeType] = colorScaleGenerator(valueRanges[rangeType]);
        }
      }
      return heatmappers;
    };
    generateBarchartScalers = function(valueRanges) {
      var generateScaler, ref, rowKeyIdx, rowRange, scalers;
      scalers = {};
      generateScaler = function(arg) {
        var bottom, max, min, range, scaler;
        min = arg[0], max = arg[1];
        if (max < 0) {
          max = 0;
        }
        range = max;
        if (min < 0) {
          range = max - min;
        }
        scaler = function(x) {
          return 100 * x / (1.4 * range);
        };
        bottom = 0;
        if (min < 0) {
          bottom = scaler(-min);
        }
        return function(x) {
          if (x < 0) {
            return [bottom + scaler(x), scaler(-x), "gray"];
          } else {
            return [bottom, scaler(x), "darkred"];
          }
        };
      };
      scalers.colTotals = generateScaler(valueRanges.colTotals);
      scalers.rows = {};
      ref = valueRanges.rows;
      for (rowKeyIdx in ref) {
        rowRange = ref[rowKeyIdx];
        scalers.rows[rowKeyIdx] = generateScaler(rowRange);
      }
      return scalers;
    };
    convertToBarchart = function(td, arg) {
      var bgColor, bottom, height, text, wrapper;
      bottom = arg[0], height = arg[1], bgColor = arg[2];
      text = td.textContent;
      wrapper = $("<div>").css({
        "position": "relative",
        "height": "55px"
      });
      wrapper.append($("<div>").css({
        "position": "absolute",
        "bottom": bottom + "%",
        "left": 0,
        "right": 0,
        "height": height + "%",
        "background-color": bgColor
      }));
      wrapper.append($("<div>").text(text).css({
        "position": "relative",
        "padding-left": "5px",
        "padding-right": "5px"
      }));
      td.style.padding = 0;
      td.style.paddingTop = "5px";
      td.style.textAlign = "center";
      return td.innerHTML = wrapper[0];
    };

    /*
    Pivot Table core: create PivotData object and call Renderer on it
     */
    $.fn.pivot = function(input, inputOpts, locale) {
      var defaults, e, localeDefaults, localeStrings, opts, pivotData, result, x;
      if (locale == null) {
        locale = "en";
      }
      if (locales[locale] == null) {
        locale = "en";
      }
      defaults = {
        cols: [],
        rows: [],
        vals: [],
        rowOrder: "key_a_to_z",
        colOrder: "key_a_to_z",
        dataClass: PivotData,
        filter: function() {
          return true;
        },
        aggregator: aggregatorTemplates.count()(),
        aggregatorName: "Count",
        sorters: {},
        derivedAttributes: {},
        renderer: pivotTableRenderer
      };
      localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings);
      localeDefaults = {
        rendererOptions: {
          localeStrings: localeStrings
        },
        localeStrings: localeStrings
      };
      opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts));
      result = null;
      try {
        pivotData = input instanceof opts.dataClass ? input : new opts.dataClass(input, opts);
        try {
          result = opts.renderer(pivotData, opts.rendererOptions);
        } catch (error) {
          e = error;
          this.trigger("pivotTableError", e);
          if (typeof console !== "undefined" && console !== null) {
            console.error(e.stack);
          }
          result = $("<span>").html(opts.localeStrings.renderError);
        }
      } catch (error) {
        e = error;
        this.trigger("pivotTableError", e);
        if (typeof console !== "undefined" && console !== null) {
          console.error(e.stack);
        }
        result = $("<span>").html(opts.localeStrings.computeError);
      }
      x = this[0];
      while (x.hasChildNodes()) {
        x.removeChild(x.lastChild);
      }
      return this.append(result);
    };

    /*
    Pivot Table UI: calls Pivot Table core above with options set by user
     */
    return $.fn.pivotUI = function(input, inputOpts, overwrite, locale) {
      var a, aggregator, attr, attrLength, attrValues, c, colOrderArrow, defaults, e, existingOpts, fn1, i, initialRender, l, len1, len2, len3, localeDefaults, localeStrings, materializedInput, n, o, opts, ordering, pivotTable, recordsProcessed, ref, ref1, ref2, ref3, refresh, refreshDelayed, renderer, rendererControl, rowOrderArrow, shownAttributes, shownInAggregators, shownInDragDrop, tr1, tr2, uiTable, unused, unusedAttrsVerticalAutoCutoff, unusedAttrsVerticalAutoOverride, x;
      if (overwrite == null) {
        overwrite = false;
      }
      if (locale == null) {
        locale = "en";
      }
      if (locales[locale] == null) {
        locale = "en";
      }
      defaults = {
        derivedAttributes: {},
        aggregators: locales[locale].aggregators,
        renderers: locales[locale].renderers,
        hiddenAttributes: [],
        hiddenFromAggregators: [],
        hiddenFromDragDrop: [],
        menuLimit: 500,
        cols: [],
        rows: [],
        vals: [],
        rowOrder: "key_a_to_z",
        colOrder: "key_a_to_z",
        dataClass: PivotData,
        exclusions: {},
        inclusions: {},
        unusedAttrsVertical: 85,
        autoSortUnusedAttrs: false,
        onRefresh: null,
        filter: function() {
          return true;
        },
        sorters: {},
        treatDataArrayAsRecords: false
      };
      localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings);
      localeDefaults = {
        rendererOptions: {
          localeStrings: localeStrings
        },
        localeStrings: localeStrings
      };
      existingOpts = this.data("pivotUIOptions");
      if ((existingOpts == null) || overwrite) {
        opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts));
      } else {
        opts = existingOpts;
      }
      try {
        attrValues = {};
        materializedInput = [];
        recordsProcessed = 0;
        PivotData.forEachRecord(input, opts, function(record) {
          var attr, base, ref, value;
          if (!opts.filter(record)) {
            return;
          }
          materializedInput.push(record);
          for (attr in record) {
            if (!hasProp.call(record, attr)) continue;
            if (attrValues[attr] == null) {
              attrValues[attr] = {};
              if (recordsProcessed > 0) {
                attrValues[attr][this.emptyValue] = recordsProcessed;
              }
            }
          }
          for (attr in attrValues) {
            value = (ref = record[attr]) != null ? ref : this.emptyValue;
            if ((base = attrValues[attr])[value] == null) {
              base[value] = 0;
            }
            attrValues[attr][value]++;
          }
          return recordsProcessed++;
        });
        uiTable = $("<table>", {
          "class": "pvtUi"
        }).attr("cellpadding", 5);
        rendererControl = $("<td>");
        renderer = $("<select>").addClass('pvtRenderer').appendTo(rendererControl).bind("change", function() {
          return refresh();
        });
        ref = opts.renderers;
        for (x in ref) {
          if (!hasProp.call(ref, x)) continue;
          $("<option>").val(x).html(x).appendTo(renderer);
        }
        unused = $("<td>").addClass('pvtAxisContainer pvtUnused');
        shownAttributes = (function() {
          var results;
          results = [];
          for (a in attrValues) {
            if (indexOf.call(opts.hiddenAttributes, a) < 0) {
              results.push(a);
            }
          }
          return results;
        })();
        shownInAggregators = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = shownAttributes.length; l < len1; l++) {
            c = shownAttributes[l];
            if (indexOf.call(opts.hiddenFromAggregators, c) < 0) {
              results.push(c);
            }
          }
          return results;
        })();
        shownInDragDrop = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = shownAttributes.length; l < len1; l++) {
            c = shownAttributes[l];
            if (indexOf.call(opts.hiddenFromDragDrop, c) < 0) {
              results.push(c);
            }
          }
          return results;
        })();
        unusedAttrsVerticalAutoOverride = false;
        if (opts.unusedAttrsVertical === "auto") {
          unusedAttrsVerticalAutoCutoff = 120;
        } else {
          unusedAttrsVerticalAutoCutoff = parseInt(opts.unusedAttrsVertical);
        }
        if (!isNaN(unusedAttrsVerticalAutoCutoff)) {
          attrLength = 0;
          for (l = 0, len1 = shownInDragDrop.length; l < len1; l++) {
            a = shownInDragDrop[l];
            attrLength += a.length;
          }
          unusedAttrsVerticalAutoOverride = attrLength > unusedAttrsVerticalAutoCutoff;
        }
        if (opts.unusedAttrsVertical === true || unusedAttrsVerticalAutoOverride) {
          unused.addClass('pvtVertList');
        } else {
          unused.addClass('pvtHorizList');
        }
        fn1 = function(attr) {
          var attrElem, checkContainer, closeFilterBox, controls, filterItem, filterItemExcluded, finalButtons, hasExcludedItem, len2, n, placeholder, ref1, sorter, triangleLink, v, value, valueCount, valueList, values;
          values = (function() {
            var results;
            results = [];
            for (v in attrValues[attr]) {
              results.push(v);
            }
            return results;
          })();
          hasExcludedItem = false;
          valueList = $("<div>").addClass('pvtFilterBox').hide();
          valueList.append($("<h4>").append($("<span>").text(attr), $("<span>").addClass("count").text("(" + values.length + ")")));
          if (values.length > opts.menuLimit) {
            valueList.append($("<p>").html(opts.localeStrings.tooMany));
          } else {
            if (values.length > 5) {
              controls = $("<p>").appendTo(valueList);
              sorter = getSort(opts.sorters, attr);
              placeholder = opts.localeStrings.filterResults;
              $("<input>", {
                type: "text"
              }).appendTo(controls).attr({
                placeholder: placeholder,
                "class": "pvtSearch"
              }).bind("keyup", function() {
                var accept, accept_gen, filter;
                filter = $(this).val().toLowerCase().trim();
                accept_gen = function(prefix, accepted) {
                  return function(v) {
                    var real_filter, ref1;
                    real_filter = filter.substring(prefix.length).trim();
                    if (real_filter.length === 0) {
                      return true;
                    }
                    return ref1 = Math.sign(sorter(v.toLowerCase(), real_filter)), indexOf.call(accepted, ref1) >= 0;
                  };
                };
                accept = filter.startsWith(">=") ? accept_gen(">=", [1, 0]) : filter.startsWith("<=") ? accept_gen("<=", [-1, 0]) : filter.startsWith(">") ? accept_gen(">", [1]) : filter.startsWith("<") ? accept_gen("<", [-1]) : filter.startsWith("~") ? function(v) {
                  if (filter.substring(1).trim().length === 0) {
                    return true;
                  }
                  return v.toLowerCase().match(filter.substring(1));
                } : function(v) {
                  return v.toLowerCase().indexOf(filter) !== -1;
                };
                return valueList.find('.pvtCheckContainer p label span.value').each(function() {
                  if (accept($(this).text())) {
                    return $(this).parent().parent().show();
                  } else {
                    return $(this).parent().parent().hide();
                  }
                });
              });
              controls.append($("<br>"));
              $("<button>", {
                type: "button"
              }).appendTo(controls).html(opts.localeStrings.selectAll).bind("click", function() {
                valueList.find("input:visible:not(:checked)").prop("checked", true).toggleClass("changed");
                return false;
              });
              $("<button>", {
                type: "button"
              }).appendTo(controls).html(opts.localeStrings.selectNone).bind("click", function() {
                valueList.find("input:visible:checked").prop("checked", false).toggleClass("changed");
                return false;
              });
            }
            checkContainer = $("<div>").addClass("pvtCheckContainer").appendTo(valueList);
            ref1 = values.sort(getSort(opts.sorters, attr));
            for (n = 0, len2 = ref1.length; n < len2; n++) {
              value = ref1[n];
              valueCount = attrValues[attr][value];
              filterItem = $("<label>");
              filterItemExcluded = false;
              if (opts.inclusions[attr]) {
                filterItemExcluded = (indexOf.call(opts.inclusions[attr], value) < 0);
              } else if (opts.exclusions[attr]) {
                filterItemExcluded = (indexOf.call(opts.exclusions[attr], value) >= 0);
              }
              hasExcludedItem || (hasExcludedItem = filterItemExcluded);
              $("<input>").attr("type", "checkbox").addClass('pvtFilter').attr("checked", !filterItemExcluded).data("filter", [attr, value]).appendTo(filterItem).bind("change", function() {
                return $(this).toggleClass("changed");
              });
              filterItem.append($("<span>").addClass("value").text(value));
              filterItem.append($("<span>").addClass("count").text("(" + valueCount + ")"));
              checkContainer.append($("<p>").append(filterItem));
            }
          }
          closeFilterBox = function() {
            if (valueList.find("[type='checkbox']").length > valueList.find("[type='checkbox']:checked").length) {
              attrElem.addClass("pvtFilteredAttribute");
            } else {
              attrElem.removeClass("pvtFilteredAttribute");
            }
            valueList.find('.pvtSearch').val('');
            valueList.find('.pvtCheckContainer p').show();
            return valueList.hide();
          };
          finalButtons = $("<p>").appendTo(valueList);
          if (values.length <= opts.menuLimit) {
            $("<button>", {
              type: "button"
            }).text(opts.localeStrings.apply).appendTo(finalButtons).bind("click", function() {
              if (valueList.find(".changed").removeClass("changed").length) {
                refresh();
              }
              return closeFilterBox();
            });
          }
          $("<button>", {
            type: "button"
          }).text(opts.localeStrings.cancel).appendTo(finalButtons).bind("click", function() {
            valueList.find(".changed:checked").removeClass("changed").prop("checked", false);
            valueList.find(".changed:not(:checked)").removeClass("changed").prop("checked", true);
            return closeFilterBox();
          });
          triangleLink = $("<span>").addClass('pvtTriangle').html(" &#x25BE;").bind("click", function(e) {
            var left, ref2, top;
            ref2 = $(e.currentTarget).position(), left = ref2.left, top = ref2.top;
            return valueList.css({
              left: left + 10,
              top: top + 10
            }).show();
          });
          attrElem = $("<li>").addClass("axis_" + i).append($("<span>").addClass('pvtAttr').text(attr).data("attrName", attr).append(triangleLink));
          if (hasExcludedItem) {
            attrElem.addClass('pvtFilteredAttribute');
          }
          return unused.append(attrElem).append(valueList);
        };
        for (i in shownInDragDrop) {
          if (!hasProp.call(shownInDragDrop, i)) continue;
          attr = shownInDragDrop[i];
          fn1(attr);
        }
        tr1 = $("<tr>").appendTo(uiTable);
        aggregator = $("<select>").addClass('pvtAggregator').bind("change", function() {
          return refresh();
        });
        ref1 = opts.aggregators;
        for (x in ref1) {
          if (!hasProp.call(ref1, x)) continue;
          aggregator.append($("<option>").val(x).html(x));
        }
        ordering = {
          key_a_to_z: {
            rowSymbol: "&varr;",
            colSymbol: "&harr;",
            next: "value_a_to_z"
          },
          value_a_to_z: {
            rowSymbol: "&darr;",
            colSymbol: "&rarr;",
            next: "value_z_to_a"
          },
          value_z_to_a: {
            rowSymbol: "&uarr;",
            colSymbol: "&larr;",
            next: "key_a_to_z"
          }
        };
        rowOrderArrow = $("<a>", {
          role: "button"
        }).addClass("pvtRowOrder").data("order", opts.rowOrder).html(ordering[opts.rowOrder].rowSymbol).bind("click", function() {
          $(this).data("order", ordering[$(this).data("order")].next);
          $(this).html(ordering[$(this).data("order")].rowSymbol);
          return refresh();
        });
        colOrderArrow = $("<a>", {
          role: "button"
        }).addClass("pvtColOrder").data("order", opts.colOrder).html(ordering[opts.colOrder].colSymbol).bind("click", function() {
          $(this).data("order", ordering[$(this).data("order")].next);
          $(this).html(ordering[$(this).data("order")].colSymbol);
          return refresh();
        });
        $("<td>").addClass('pvtVals').appendTo(tr1).append(aggregator).append(rowOrderArrow).append(colOrderArrow).append($("<br>"));
        $("<td>").addClass('pvtAxisContainer pvtHorizList pvtCols').appendTo(tr1);
        tr2 = $("<tr>").appendTo(uiTable);
        tr2.append($("<td>").addClass('pvtAxisContainer pvtRows').attr("valign", "top"));
        pivotTable = $("<td>").attr("valign", "top").addClass('pvtRendererArea').appendTo(tr2);
        if (opts.unusedAttrsVertical === true || unusedAttrsVerticalAutoOverride) {
          uiTable.find('tr:nth-child(1)').prepend(rendererControl);
          uiTable.find('tr:nth-child(2)').prepend(unused);
        } else {
          uiTable.prepend($("<tr>").append(rendererControl).append(unused));
        }
        this.html(uiTable);
        ref2 = opts.cols;
        for (n = 0, len2 = ref2.length; n < len2; n++) {
          x = ref2[n];
          this.find(".pvtCols").append(this.find(".axis_" + ($.inArray(x, shownInDragDrop))));
        }
        ref3 = opts.rows;
        for (o = 0, len3 = ref3.length; o < len3; o++) {
          x = ref3[o];
          this.find(".pvtRows").append(this.find(".axis_" + ($.inArray(x, shownInDragDrop))));
        }
        if (opts.aggregatorName != null) {
          this.find(".pvtAggregator").val(opts.aggregatorName);
        }
        if (opts.rendererName != null) {
          this.find(".pvtRenderer").val(opts.rendererName);
        }
        initialRender = true;
        refreshDelayed = (function(_this) {
          return function() {
            var exclusions, inclusions, len4, newDropdown, numInputsToProcess, pivotUIOptions, pvtVals, ref4, ref5, subopts, t, u, unusedAttrsContainer, vals;
            subopts = {
              derivedAttributes: opts.derivedAttributes,
              localeStrings: opts.localeStrings,
              rendererOptions: opts.rendererOptions,
              sorters: opts.sorters,
              cols: [],
              rows: [],
              dataClass: opts.dataClass
            };
            numInputsToProcess = (ref4 = opts.aggregators[aggregator.val()]([])().numInputs) != null ? ref4 : 0;
            vals = [];
            _this.find(".pvtRows li span.pvtAttr").each(function() {
              return subopts.rows.push($(this).data("attrName"));
            });
            _this.find(".pvtCols li span.pvtAttr").each(function() {
              return subopts.cols.push($(this).data("attrName"));
            });
            _this.find(".pvtVals select.pvtAttrDropdown").each(function() {
              if (numInputsToProcess === 0) {
                return $(this).remove();
              } else {
                numInputsToProcess--;
                if ($(this).val() !== "") {
                  return vals.push($(this).val());
                }
              }
            });
            if (numInputsToProcess !== 0) {
              pvtVals = _this.find(".pvtVals");
              for (x = t = 0, ref5 = numInputsToProcess; 0 <= ref5 ? t < ref5 : t > ref5; x = 0 <= ref5 ? ++t : --t) {
                newDropdown = $("<select>").addClass('pvtAttrDropdown').append($("<option>")).bind("change", function() {
                  return refresh();
                });
                for (u = 0, len4 = shownInAggregators.length; u < len4; u++) {
                  attr = shownInAggregators[u];
                  newDropdown.append($("<option>").val(attr).text(attr));
                }
                pvtVals.append(newDropdown);
              }
            }
            if (initialRender) {
              vals = opts.vals;
              i = 0;
              _this.find(".pvtVals select.pvtAttrDropdown").each(function() {
                $(this).val(vals[i]);
                return i++;
              });
              initialRender = false;
            }
            subopts.aggregatorName = aggregator.val();
            subopts.vals = vals;
            subopts.aggregator = opts.aggregators[aggregator.val()](vals);
            subopts.renderer = opts.renderers[renderer.val()];
            subopts.rowOrder = rowOrderArrow.data("order");
            subopts.colOrder = colOrderArrow.data("order");
            exclusions = {};
            _this.find('input.pvtFilter').not(':checked').each(function() {
              var filter;
              filter = $(this).data("filter");
              if (exclusions[filter[0]] != null) {
                return exclusions[filter[0]].push(filter[1]);
              } else {
                return exclusions[filter[0]] = [filter[1]];
              }
            });
            inclusions = {};
            _this.find('input.pvtFilter:checked').each(function() {
              var filter;
              filter = $(this).data("filter");
              if (exclusions[filter[0]] != null) {
                if (inclusions[filter[0]] != null) {
                  return inclusions[filter[0]].push(filter[1]);
                } else {
                  return inclusions[filter[0]] = [filter[1]];
                }
              }
            });
            subopts.filter = function(record) {
              var excludedItems, k, ref6, ref7;
              if (!opts.filter(record)) {
                return false;
              }
              for (k in exclusions) {
                excludedItems = exclusions[k];
                if (ref6 = "" + ((ref7 = record[k]) != null ? ref7 : 'null'), indexOf.call(excludedItems, ref6) >= 0) {
                  return false;
                }
              }
              return true;
            };
            pivotTable.pivot(materializedInput, subopts);
            pivotUIOptions = $.extend({}, opts, {
              cols: subopts.cols,
              rows: subopts.rows,
              colOrder: subopts.colOrder,
              rowOrder: subopts.rowOrder,
              vals: vals,
              exclusions: exclusions,
              inclusions: inclusions,
              inclusionsInfo: inclusions,
              aggregatorName: aggregator.val(),
              rendererName: renderer.val()
            });
            _this.data("pivotUIOptions", pivotUIOptions);
            if (opts.autoSortUnusedAttrs) {
              unusedAttrsContainer = _this.find("td.pvtUnused.pvtAxisContainer");
              $(unusedAttrsContainer).children("li").sort(function(a, b) {
                return naturalSort($(a).text(), $(b).text());
              }).appendTo(unusedAttrsContainer);
            }
            pivotTable.css("opacity", 1);
            if (opts.onRefresh != null) {
              return opts.onRefresh(pivotUIOptions);
            }
          };
        })(this);
        refresh = (function(_this) {
          return function() {
            pivotTable.css("opacity", 0.5);
            return setTimeout(refreshDelayed, 10);
          };
        })(this);
        refresh();
        this.find(".pvtAxisContainer").sortable({
          update: function(e, ui) {
            if (ui.sender == null) {
              return refresh();
            }
          },
          connectWith: this.find(".pvtAxisContainer"),
          items: 'li',
          placeholder: 'pvtPlaceholder'
        });
      } catch (error) {
        e = error;
        this.trigger("pivotTableError", e);
        if (typeof console !== "undefined" && console !== null) {
          console.error(e.stack);
        }
        this.html(opts.localeStrings.uiRenderError);
      }
      return this;
    };
  });

}).call(this);

//# sourceMappingURL=pivot.js.map
