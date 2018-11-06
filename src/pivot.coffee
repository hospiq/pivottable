callWithJQuery = (pivotModule) ->
    if typeof exports is "object" and typeof module is "object" # CommonJS
        pivotModule require("jquery")
    else if typeof define is "function" and define.amd # AMD
        define ["jquery"], pivotModule
    # Plain browser env
    else
        pivotModule jQuery

callWithJQuery ($) ->

    ###
    Utilities
    ###

    addSeparators = (nStr, thousandsSep, decimalSep) ->
        nStr += ''
        x = nStr.split('.')
        x1 = x[0]
        x2 = if x.length > 1 then  decimalSep + x[1] else ''
        rgx = /(\d+)(\d{3})/
        x1 = x1.replace(rgx, '$1' + thousandsSep + '$2') while rgx.test(x1)
        return x1 + x2

    numberFormat = (opts) ->
        defaults =
            digitsAfterDecimal: 2, scaler: 1,
            thousandsSep: ",", decimalSep: "."
            prefix: "", suffix: ""
        opts = $.extend({}, defaults, opts)
        (x) ->
            return "" if isNaN(x) or not isFinite(x)
            result = addSeparators (opts.scaler*x).toFixed(opts.digitsAfterDecimal), opts.thousandsSep, opts.decimalSep
            return ""+opts.prefix+result+opts.suffix

    #aggregator templates default to US number formatting but this is overrideable
    usFmt = numberFormat()
    usFmtInt = numberFormat(digitsAfterDecimal: 0)
    usFmtPct = numberFormat(digitsAfterDecimal:1, scaler: 100, suffix: "%")

    aggregatorTemplates =
        count: (formatter=usFmtInt) -> () -> (data, rowKey, colKey) ->
            count: 0
            push:  -> @count++
            value: -> @count
            format: formatter

        uniques: (fn, formatter=usFmtInt) -> ([attr]) -> (data, rowKey, colKey) ->
            uniq: []
            push: (record) -> @uniq.push(record[attr]) if record[attr] not in @uniq
            value: -> fn(@uniq)
            format: formatter
            numInputs: if attr? then 0 else 1

        sum: (formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            sum: 0
            push: (record) -> @sum += parseFloat(record[attr]) if not isNaN parseFloat(record[attr])
            value: -> @sum
            format: formatter
            numInputs: if attr? then 0 else 1

        extremes: (mode, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            val: null
            sorter: getSort(data?.sorters, attr)
            push: (record) ->
                x = record[attr]
                if mode in ["min", "max"]
                    x = parseFloat(x)
                    if not isNaN x then @val = Math[mode](x, @val ? x)
                if mode == "first" then @val = x if @sorter(x, @val ? x) <= 0
                if mode == "last"  then @val = x if @sorter(x, @val ? x) >= 0
            value: -> @val
            format: (x) -> if isNaN(x) then x else formatter(x)
            numInputs: if attr? then 0 else 1

        quantile: (q, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            vals: []
            push: (record) ->
                x = parseFloat(record[attr])
                @vals.push(x) if not isNaN(x)
            value: ->
                return null if @vals.length == 0
                @vals.sort((a,b) -> a-b)
                i = (@vals.length-1)*q
                return (@vals[Math.floor(i)] + @vals[Math.ceil(i)])/2.0
            format: formatter
            numInputs: if attr? then 0 else 1

        runningStat: (mode="mean", ddof=1, formatter=usFmt) -> ([attr]) -> (data, rowKey, colKey) ->
            n: 0.0, m: 0.0, s: 0.0
            push: (record) ->
                x = parseFloat(record[attr])
                return if isNaN(x)
                @n += 1.0
                if @n == 1.0
                    @m = x
                else
                    m_new = @m + (x - @m)/@n
                    @s = @s + (x - @m)*(x - m_new)
                    @m = m_new
            value: ->
                if mode == "mean"
                    return if @n == 0 then 0/0 else @m
                return 0 if @n <= ddof
                switch mode
                    when "var"   then @s/(@n-ddof)
                    when "stdev" then Math.sqrt(@s/(@n-ddof))
            format: formatter
            numInputs: if attr? then 0 else 1

        sumOverSum: (formatter=usFmt) -> ([num, denom]) -> (data, rowKey, colKey) ->
            sumNum: 0
            sumDenom: 0
            push: (record) ->
                @sumNum   += parseFloat(record[num])   if not isNaN parseFloat(record[num])
                @sumDenom += parseFloat(record[denom]) if not isNaN parseFloat(record[denom])
            value: -> @sumNum/@sumDenom
            format: formatter
            numInputs: if num? and denom? then 0 else 2

        sumOverSumBound80: (upper=true, formatter=usFmt) -> ([num, denom]) -> (data, rowKey, colKey) ->
            sumNum: 0
            sumDenom: 0
            push: (record) ->
                @sumNum   += parseFloat(record[num])   if not isNaN parseFloat(record[num])
                @sumDenom += parseFloat(record[denom]) if not isNaN parseFloat(record[denom])
            value: ->
                sign = if upper then 1 else -1
                (0.821187207574908/@sumDenom + @sumNum/@sumDenom + 1.2815515655446004*sign*
                    Math.sqrt(0.410593603787454/ (@sumDenom*@sumDenom) + (@sumNum*(1 - @sumNum/ @sumDenom))/ (@sumDenom*@sumDenom)))/
                    (1 + 1.642374415149816/@sumDenom)
            format: formatter
            numInputs: if num? and denom? then 0 else 2

        #To support multi-metrics mode, these aggregator factories must be
        #instantiated with the aggregator index, so that value() knows how
        # to find the corresponding fractionOf aggregator for the denominator.
        fractionOf: (wrapped, type="total", formatter=usFmtPct) -> (aggIdx, x...) -> (data, rowKey, colKey) ->
            selector: {total:[[],[]],row:[rowKey,[]],col:[[],colKey]}[type]
            inner: wrapped(x...)(data, rowKey, colKey)
            push: (record) -> @inner.push record
            format: formatter
            value: ->
                agg = data.getAggregator(@selector...)
                if $.isArray(agg)
                    agg = agg[aggIdx]
                return @inner.value() / agg.inner.value()
            numInputs: wrapped(x...)().numInputs

    aggregatorTemplates.countUnique = (f) -> aggregatorTemplates.uniques(((x) -> x.length), f)
    aggregatorTemplates.listUnique =  (s) -> aggregatorTemplates.uniques(((x) -> x.join(s)), ((x)->x))
    aggregatorTemplates.max =         (f) -> aggregatorTemplates.extremes('max', f)
    aggregatorTemplates.min =         (f) -> aggregatorTemplates.extremes('min', f)
    aggregatorTemplates.first =       (f) -> aggregatorTemplates.extremes('first', f)
    aggregatorTemplates.last =        (f) -> aggregatorTemplates.extremes('last', f)
    aggregatorTemplates.median =      (f) -> aggregatorTemplates.quantile(0.5, f)
    aggregatorTemplates.average =     (f) -> aggregatorTemplates.runningStat("mean", 1, f)
    aggregatorTemplates.var =         (ddof, f) -> aggregatorTemplates.runningStat("var", ddof, f)
    aggregatorTemplates.stdev =       (ddof, f) -> aggregatorTemplates.runningStat("stdev", ddof, f)

    #default aggregators & renderers use US naming and number formatting
    aggregators = do (tpl = aggregatorTemplates) ->
        "Count":                tpl.count(usFmtInt)
        "Count Unique Values":  tpl.countUnique(usFmtInt)
        "List Unique Values":   tpl.listUnique(", ")
        "Sum":                  tpl.sum(usFmt)
        "Integer Sum":          tpl.sum(usFmtInt)
        "Average":              tpl.average(usFmt)
        "Median":               tpl.median(usFmt)
        "Sample Variance":      tpl.var(1, usFmt)
        "Sample Standard Deviation": tpl.stdev(1, usFmt)
        "Minimum":              tpl.min(usFmt)
        "Maximum":              tpl.max(usFmt)
        "First":                tpl.first(usFmt)
        "Last":                 tpl.last(usFmt)
        "Sum over Sum":         tpl.sumOverSum(usFmt)
        "80% Upper Bound":      tpl.sumOverSumBound80(true, usFmt)
        "80% Lower Bound":      tpl.sumOverSumBound80(false, usFmt)
        "Sum as Fraction of Total":     tpl.fractionOf(tpl.sum(),   "total", usFmtPct)
        "Sum as Fraction of Rows":      tpl.fractionOf(tpl.sum(),   "row",   usFmtPct)
        "Sum as Fraction of Columns":   tpl.fractionOf(tpl.sum(),   "col",   usFmtPct)
        "Count as Fraction of Total":   tpl.fractionOf(tpl.count(), "total", usFmtPct)
        "Count as Fraction of Rows":    tpl.fractionOf(tpl.count(), "row",   usFmtPct)
        "Count as Fraction of Columns": tpl.fractionOf(tpl.count(), "col",   usFmtPct)

    renderers =
        "Table":          (data, opts) ->   pivotTableRenderer(data, opts)
        "Table Barchart": (data, opts) -> $(pivotTableRenderer(data, opts)).barchart()
        "Heatmap":        (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("heatmap",    opts)
        "Row Heatmap":    (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("rowheatmap", opts)
        "Col Heatmap":    (data, opts) -> $(pivotTableRenderer(data, opts)).heatmap("colheatmap", opts)

    locales =
        en:
            aggregators: aggregators
            renderers: renderers
            localeStrings:
                renderError: "An error occurred rendering the PivotTable results."
                computeError: "An error occurred computing the PivotTable results."
                uiRenderError: "An error occurred rendering the PivotTable UI."
                selectAll: "Select All"
                selectNone: "Select None"
                tooMany: "(too many to list)"
                filterResults: "Filter values"
                apply: "Apply"
                cancel: "Cancel"
                totals: "Totals" #for table renderer
                vs: "vs" #for gchart renderer
                by: "by" #for gchart renderer

    #dateFormat deriver l10n requires month and day names to be passed in directly
    mthNamesEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    dayNamesEn = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
    zeroPad = (number) -> ("0"+number).substr(-2,2)

    derivers =
        bin: (col, binWidth) -> (record) -> record[col] - record[col] % binWidth
        dateFormat: (col, formatString, utcOutput=false, mthNames=mthNamesEn, dayNames=dayNamesEn) ->
            utc = if utcOutput then "UTC" else ""
            (record) -> #thanks http://stackoverflow.com/a/12213072/112871
                date = new Date(Date.parse(record[col]))
                if isNaN(date) then return ""
                formatString.replace /%(.)/g, (m, p) ->
                    switch p
                        when "y" then date["get#{utc}FullYear"]()
                        when "m" then zeroPad(date["get#{utc}Month"]()+1)
                        when "n" then mthNames[date["get#{utc}Month"]()]
                        when "d" then zeroPad(date["get#{utc}Date"]())
                        when "w" then dayNames[date["get#{utc}Day"]()]
                        when "x" then date["get#{utc}Day"]()
                        when "H" then zeroPad(date["get#{utc}Hours"]())
                        when "M" then zeroPad(date["get#{utc}Minutes"]())
                        when "S" then zeroPad(date["get#{utc}Seconds"]())
                        else "%" + p

    rx = /(\d+)|(\D+)/g
    rd = /\d/
    rz = /^0/
    naturalSort = (as, bs) =>
        #nulls first
        return -1 if bs? and not as?
        return  1 if as? and not bs?

        #then raw NaNs
        return -1 if typeof as == "number" and isNaN(as)
        return  1 if typeof bs == "number" and isNaN(bs)

        #numbers and numbery strings group together
        nas = +as
        nbs = +bs
        return -1 if nas < nbs
        return  1 if nas > nbs

        #within that, true numbers before numbery strings
        return -1 if typeof as == "number" and typeof bs != "number"
        return  1 if typeof bs == "number" and typeof as != "number"
        return  0 if typeof as == "number" and typeof bs == "number"

        # 'Infinity' is a textual number, so less than 'A'
        return -1 if isNaN(nbs) and not isNaN(nas)
        return  1 if isNaN(nas) and not isNaN(nbs)

        #finally, "smart" string sorting per http://stackoverflow.com/a/4373421/112871
        a = String(as)
        b = String(bs)
        return 0 if a == b
        return (if a > b then 1 else -1) unless rd.test(a) and rd.test(b)

        #special treatment for strings containing digits
        a = a.match(rx) #create digits vs non-digit chunks and iterate through
        b = b.match(rx)
        while a.length and b.length
            a1 = a.shift()
            b1 = b.shift()
            if a1 != b1
                if rd.test(a1) and rd.test(b1) #both are digit chunks
                    return a1.replace(rz, ".0") - b1.replace(rz, ".0")
                else
                    return (if a1 > b1 then 1 else -1)
        return a.length - b.length

    sortAs = (order) ->
        mapping = {}
        l_mapping = {} # sort lowercased keys similarly
        for i, x of order
            mapping[x] = i
            l_mapping[x.toLowerCase()] = i if typeof x == "string"
        (a, b) ->
            if mapping[a]? and mapping[b]? then mapping[a] - mapping[b]
            else if mapping[a]? then -1
            else if mapping[b]? then 1
            else if l_mapping[a]? and l_mapping[b]? then l_mapping[a] - l_mapping[b]
            else if l_mapping[a]? then -1
            else if l_mapping[b]? then 1
            else naturalSort(a,b)

    getSort = (sorters, attr) ->
        if sorters?
            if $.isFunction(sorters)
                sort = sorters(attr)
                return sort if $.isFunction(sort)
            else if sorters[attr]?
                return sorters[attr]
        return naturalSort

    ###
    Data Model class
    ###

    class PivotData
        constructor: (input, opts = {}) ->
            @input = input

            #May be an array of aggregators.
            @aggregator = opts.aggregator ? aggregatorTemplates.count()()

            #Only used by pivotUI(). No multi-aggregator support.
            @aggregatorName = opts.aggregatorName ? "Count"

            #If there are multiple aggregators, this fake attribute is used to generate the extra cols/rows.
            @multiAggAttr = opts.multiAggAttr ? "_metrics"

            #Attributes are the record fields selected by the user. Value attributes are used to instantiate aggregators.
            @colAttrs = opts.cols ? []
            @rowAttrs = opts.rows ? []
            @valAttrs = opts.vals ? []  #Only used by plotly, gchart, and c3 renderers.

            #Insert the multi-agg attribute as the last column if not provided already.
            if $.isArray(@aggregator) and @multiAggAttr not in @colAttrs and @multiAggAttr not in @rowAttrs
                @colAttrs.push @multiAggAttr

            #Used when sorting keys by attribute value. See getSort().
            #Either an object or a fn, e.g.: sorters[attr]=sortFn, or sorters(attr)=sortFn.
            @sorters = opts.sorters ? {}

            #How keys are sorted. See @sortKeys() for possible values.
            @rowOrder = opts.rowOrder ? "key_a_to_z"
            @colOrder = opts.colOrder ? "key_a_to_z"

            #HIQ client derives its own attributes, and does not use this property.
            @derivedAttributes = opts.derivedAttributes ? {}

            @filter = opts.filter ? (-> true)
            @emptyValue = opts.emptyValue ? 'null'

            #Keys are generated tuples of attribute values.
            @rowKeys = []
            @colKeys = []

            #Aggregator instances, one per value cell in the table. Created in @processData().
            #Normal aggregators, at tree[rowKey][colKey].
            @tree = {}
            #Row/col total aggregators, at rowTotals[rowKey] and colTotals[colKey].
            #In multi-metric mode, the values are arrays.
            @rowTotals = {}
            @colTotals = {}
            #Grand total aggregator. In multi-metric mode, this is an array.
            @allTotal = if not $.isArray(@aggregator) then @aggregator(this, [], []) else @aggregator.map((agg) => agg(this, [], []))

            #Keys are not sorted on init, but when first accessed (e.g. in getRowKeys()).
            @sorted = false

            @opts = opts

            #Generate table cells and aggregators from records that pass the filter.
            PivotData.forEachRecord input, opts, (record) =>
                @processRecord(record) if opts.filter(record)

        #can handle arrays or jQuery selections of tables
        @forEachRecord = (input, opts, f) ->
            if $.isEmptyObject opts.derivedAttributes
                addRecord = f
            else
                addRecord = (record) -> 
                    record[k] = v(record) ? record[k] for k, v of opts.derivedAttributes
                    f(record)

            #if it's a function, have it call us back
            if $.isFunction(input)
                input(addRecord)
            else if $.isArray(input)
                if !opts.treatDataArrayAsRecords #array of arrays
                    for own i, compactRecord of input when i > 0
                        record = {}
                        record[k] = compactRecord[j] for own j, k of input[0]
                        addRecord(record)
                else #array of objects
                    addRecord(record) for record in input
            else if input instanceof $
                tblCols = []
                $("thead > tr > th", input).each (i) -> tblCols.push $(this).text()
                $("tbody > tr", input).each (i) ->
                    record = {}
                    $("td", this).each (j) -> record[tblCols[j]] = $(this).text()
                    addRecord(record)
            else
                throw new Error("unknown input format")

        #Only used by examples/mps_prepop.html. Covered in tests/pivot_spec.coffee.
        forEachMatchingRecord: (criteria, callback) ->
            PivotData.forEachRecord @input, @opts, (record) =>
                return if not @opts.filter(record)
                for own k, v of criteria
                    return if v != (record[k] ? @emptyValue)
                callback(record)

        #Create sort fn that sorts row/col keys by attribute value.
        #Sorts coarser attributes first, e.g.: ["A", 10] < ["B", 1] < ["B", 5].
        #`attrs`: Array of attributes on which to sort. Assumes keys are
        #  composed of these attributes.
        #`order`: Array of "+" or "-" values, one per attribute. "-"
        #  indicates a descending sort.
        arrSort: (attrs, order) =>
            sortersArr = (getSort(@sorters, a) for a in attrs)
            (keyA,keyB) ->
                for own attrIdx, sorter of sortersArr
                    comparison = sorter(keyA[attrIdx], keyB[attrIdx])
                    if order? and order[attrIdx] == "-"
                        comparison *= -1
                    return comparison if comparison != 0
                return 0

        #Sort row and col keys based on @rowOrder and @colOrder. Possible values:
        #  `key_[-]flatKey`: Sort based on the values for the given key, in "flat"
        #    form (\0-separated string). Optional "-" for descending sort.
        #  `totals_[-]aggIdx`: Sort based on the totals values. aggIdx is the index
        #    of the aggregator to use (ignored if not multi-metrics mode). Optional
        #    "-" for descending sort.
        #  `attr_[+|-]_...`: Sort based on attribute values. There is one asc/desc
        #    indicator per attribute.
        #  `value_[a_to_z|z_to_a]`: Legacy sort on totals values. Does not support
        #    multi-metrics mode.
        #  `key_[a_to_z]`: Legacy sort on attribute values, all ascending.
        sortKeys: () =>
            if @sorted
                return
            @sorted = true

            for [sortOrder, keys, attrs], idx in [
              [@rowOrder, @rowKeys, @rowAttrs],
              [@colOrder, @colKeys, @colAttrs]
            ]
                isRow = idx == 0

                #Sort keys by the value of the aggregator at `comparisonKey`.
                #If `isDesc` is true, does a descending sort. In multi-metrics
                #mode, `aggIdx` is the index of the totals aggregator to use.
                _sortByAggVal = (comparisonKey, isDesc, aggIdx) =>
                    _getVal = (sortKey) =>
                        row = if isRow then sortKey else comparisonKey
                        col = if not isRow then sortKey else comparisonKey
                        agg = @getAggregator(row, col)
                        if $.isArray(agg)
                            agg = agg[aggIdx or 0]
                        return agg.value()

                    keys.sort (a,b) => naturalSort(_getVal(a), _getVal(b)) * (if isDesc then -1 else 1)

                switch sortOrder
                    #Legacy sorts.
                    when "value_a_to_z" then _sortByAggVal([])
                    when "value_z_to_a" then _sortByAggVal([], true)
                    when "key_a_to_z" then keys.sort @arrSort(attrs)
                    else
                        sortParts = sortOrder.split("_")
                        sortType = sortParts[0]

                        switch sortType
                            when "attr"
                                attrsOrder = sortParts.slice(1)
                                keys.sort @arrSort(attrs, attrsOrder)
                            else
                                sortVal = sortParts[1]

                                #Check for descending sort.
                                isDesc = false
                                if sortVal.startsWith("-")
                                    sortVal = sortVal.slice(1)
                                    isDesc = true

                                if sortType == "key"
                                    key = sortVal.split(String.fromCharCode(0))
                                    _sortByAggVal(key, isDesc)
                                else  # sortType == "totals"
                                    aggIdx = parseInt(sortVal)
                                    _sortByAggVal([], isDesc, aggIdx)

        getColKeys: () =>
            @sortKeys()
            return @colKeys

        getRowKeys: () =>
            @sortKeys()
            return @rowKeys

        #Generate keys for the record, and update all corresponding aggregators
        #(i.e., the grand total, row/col total, and normal row+col aggregators).
        #:aggIdx: In multi-metrics mode, index into the @aggregator array.
        processRecord: (record, aggIdx) -> #this code is called in a tight loop

            #In multi-metric mode, process record once per aggregator.
            if $.isArray(@aggregator) and not aggIdx?
                for agg, aggIdx in @aggregator
                    record[@multiAggAttr] = aggIdx
                    @processRecord(record, aggIdx)
                delete record[@multiAggAttr]  # leave records unmodified
                return

            aggregator = if aggIdx? then @aggregator[aggIdx] else @aggregator

            colKey = []
            rowKey = []
            colKey.push record[x] ? @emptyValue for x in @colAttrs
            rowKey.push record[x] ? @emptyValue for x in @rowAttrs
            flatRowKey = rowKey.join(String.fromCharCode(0))
            flatColKey = colKey.join(String.fromCharCode(0))

            #Grand total cell.
            allTotal = if aggIdx? then @allTotal[aggIdx] else @allTotal
            allTotal.push record

            getTotalsAgg = (rowOrCol, key) =>  #fat arrow to get closure over PivotData object `this`
                r = if rowOrCol == "row" then key else []
                c = if rowOrCol == "row" then [] else key
                return aggregator(this, r, c)

            for [rowOrCol, attrs, keys, rawKey, flatKey, totals] in [
              ["row", @colAttrs, @rowKeys, rowKey, flatRowKey, @rowTotals],
              ["col", @rowAttrs, @colKeys, colKey, flatColKey, @colTotals]
            ]
                isMultiTotals = aggIdx? and @multiAggAttr in attrs
                if rawKey.length != 0
                    #First time we've seen this key: create totals aggregator.
                    if not totals[flatKey]
                        keys.push rawKey
                        totals[flatKey] = if isMultiTotals then [] else getTotalsAgg(rowOrCol, rawKey)
                    if isMultiTotals and not totals[flatKey][aggIdx]
                        totals[flatKey][aggIdx] = getTotalsAgg(rowOrCol, rawKey)
                    #Push record to the totals aggregator.
                    totalsAgg = totals[flatKey]
                    if isMultiTotals
                        totalsAgg = totalsAgg[aggIdx]
                    totalsAgg.push record

            if colKey.length != 0 and rowKey.length != 0
                if not @tree[flatRowKey]
                    @tree[flatRowKey] = {}
                if not @tree[flatRowKey][flatColKey]
                    @tree[flatRowKey][flatColKey] = aggregator(this, rowKey, colKey)
                @tree[flatRowKey][flatColKey].push record

        #In multi-metric mode, totals aggregators are arrays.
        getAggregator: (rowKey, colKey) =>
            flatRowKey = rowKey.join(String.fromCharCode(0))
            flatColKey = colKey.join(String.fromCharCode(0))
            if rowKey.length == 0 and colKey.length == 0
                agg = @allTotal
            else if rowKey.length == 0
                agg = @colTotals[flatColKey]
            else if colKey.length == 0
                agg = @rowTotals[flatRowKey]
            else
                agg = @tree[flatRowKey][flatColKey]
            #In multi-metric mode, don't bother creating default aggregators.
            return if $.isArray(agg) then agg else (agg ? {value: (-> null), format: -> ""})

    #expose these to the outside world
    $.pivotUtilities = {aggregatorTemplates, aggregators, renderers, derivers, locales,
        naturalSort, numberFormat, sortAs, PivotData}

    ###
    Default Renderer for hierarchical table layout
    ###

    pivotTableRenderer = (pivotData, opts) ->
        defaults =
            table: clickCallback: null
            localeStrings: totals: "Totals"
            treatDataArrayAsRecords: false

        opts = $.extend(true, {}, defaults, opts)

        colAttrs = pivotData.colAttrs
        rowAttrs = pivotData.rowAttrs
        rowKeys = pivotData.getRowKeys()
        colKeys = pivotData.getColKeys()

        if opts.table.clickCallback
            getClickHandler = (value, rowKey, colKey) ->
                filters = {}
                filters[attr] = colKey[i] for attr, i in colAttrs when colKey[i]?
                filters[attr] = rowKey[i] for attr, i in rowAttrs when rowKey[i]?
                return (e) -> opts.table.clickCallback(e, value, filters, pivotData)

        if opts.table.headerClickCallback
            getHeaderClickHandler = (rowOrCol, type, val) ->
                return (e) -> opts.table.headerClickCallback(e, rowOrCol, type, val)

        #now actually build the output
        result = document.createElement("table")
        result.className = "pvtTable"

        #helper function for setting row/col span size for all cells
        spanSize = (keys, keyIdx, maxAttrIdx) ->
            #check if cell should be drawn (e.g., if an attr is coarser than the next one, we only draw that attr cell once)
            if keyIdx != 0
                noDraw = true
                for attrIdx in [0..maxAttrIdx]
                    if keys[keyIdx-1][attrIdx] != keys[keyIdx][attrIdx]
                        noDraw = false
                if noDraw
                  return -1 #do not draw cell
            #calculate span
            len = 0
            while keyIdx+len < keys.length
                stop = false
                for attrIdx in [0..maxAttrIdx]
                    stop = true if keys[keyIdx][attrIdx] != keys[keyIdx+len][attrIdx]
                break if stop
                len++
            return len

        #the first few rows are for col headers
        thead = document.createElement("thead")
        for colAttr, colAttrIdx in colAttrs
            tr = document.createElement("tr")

            #create empty upper-left cell spanning both row and col attrs
            if parseInt(colAttrIdx) == 0 and rowAttrs.length != 0
                th = document.createElement("th")
                th.setAttribute("colspan", rowAttrs.length)
                th.setAttribute("rowspan", colAttrs.length)
                tr.appendChild th

            #create cell for this col attr
            th = document.createElement("th")
            th.className = "pvtAxisLabel"
            th.textContent = colAttr
            if getHeaderClickHandler?
                th.onclick = getHeaderClickHandler("col", "attr", colAttr)
            tr.appendChild th

            # create cell for each col key (of this attribute)
            for colKey, colKeyIdx in colKeys
                x = spanSize(colKeys, parseInt(colKeyIdx), parseInt(colAttrIdx))
                if x != -1
                    th = document.createElement("th")
                    th.className = "pvtColLabel"
                    if opts.formatHeader
                        th.textContent = opts.formatHeader(colKey[colAttrIdx], colAttrs[colAttrIdx]);
                    else
                        th.textContent = colKey[colAttrIdx]
                    th.setAttribute("colspan", x)

                    #Only allow clicking on the finest-grained attribute.
                    if getHeaderClickHandler? and colAttrIdx == (colAttrs.length - 1)
                        flatColKey = colKey.join(String.fromCharCode(0))
                        th.onclick = getHeaderClickHandler("col", "key", flatColKey)
                        #Add key to data-set for post-processing sort icons. CSS selectors
                        #don't work w/code point 0, but we don't need the separators anyway.
                        th.dataset.flatKey = colKey.join("")

                    #if this is the last col attr, each col key spans 2 rows (the 2nd being the row attr row)
                    if parseInt(colAttrIdx) == colAttrs.length-1 and rowAttrs.length != 0
                        th.setAttribute("rowspan", 2)

                    tr.appendChild th

            # create row totals column header
            if parseInt(colAttrIdx) == 0
                createHeader = (aggIdx) ->
                    th = document.createElement("th")
                    th.className = "pvtTotalLabel pvtRowTotalLabel"
                    th.innerHTML = opts.localeStrings.totals
                    if aggIdx?
                        th.dataset.aggIdx = aggIdx
                    th.setAttribute("rowspan", colAttrs.length + (if rowAttrs.length ==0 then 0 else 1))
                    if getHeaderClickHandler?
                        th.onclick = getHeaderClickHandler("col", "totals", aggIdx or 0)
                    tr.appendChild th

                #In multi-metric mode, if "Metrics" attr is a col, there is one row totals col per aggregator.
                if $.isArray(pivotData.aggregator) and pivotData.multiAggAttr in colAttrs
                    for agg, aggIdx in pivotData.aggregator
                        createHeader(aggIdx)
                else
                    createHeader()

            thead.appendChild tr

        #then a single row for all row attrs
        if rowAttrs.length !=0
            tr = document.createElement("tr")
            for rowAttr, i in rowAttrs
                th = document.createElement("th")
                th.className = "pvtAxisLabel"
                th.textContent = rowAttr
                if getHeaderClickHandler?
                    th.onclick = getHeaderClickHandler("row", "attr", rowAttr)
                tr.appendChild th
            th = document.createElement("th")  #empty cell below col attr cells
            if colAttrs.length ==0
                #use empty cell for the row totals if there are no col attrs
                th.className = "pvtTotalLabel pvtRowTotalLabel"
                th.innerHTML = opts.localeStrings.totals
                if getHeaderClickHandler?
                    #there is only one col totals aggregator
                    th.onclick = getHeaderClickHandler("col", "totals", 0)
            tr.appendChild th
            thead.appendChild tr

        result.appendChild thead

        #now the actual data rows, with their row headers and totals
        tbody = document.createElement("tbody")
        for rowKey, rowKeyIdx in rowKeys
            tr = document.createElement("tr")

            #create a header cell for each row attr
            for own rowAttrIdx, txt of rowKey
                x = spanSize(rowKeys, parseInt(rowKeyIdx), parseInt(rowAttrIdx))
                if x != -1
                    th = document.createElement("th")
                    th.className = "pvtRowLabel"
                    if opts.formatHeader
                        th.textContent = opts.formatHeader(txt, rowAttrs[rowAttrIdx]);
                    else
                        th.textContent = txt
                    th.setAttribute("rowspan", x)

                    #if this is the last row attr, the header cell spans 2 cols (the 2nd being the col attr col)
                    if parseInt(rowAttrIdx) == rowAttrs.length-1 and colAttrs.length !=0
                        th.setAttribute("colspan",2)

                    if getHeaderClickHandler? and parseInt(rowAttrIdx) == rowAttrs.length-1
                        flatRowKey = rowKey.join(String.fromCharCode(0))
                        th.onclick = getHeaderClickHandler("row", "key", flatRowKey)
                        #Add key to data-set for post-processing sort icons. CSS selectors
                        #don't work w/code point 0, but we don't need the separators anyway.
                        th.dataset.flatKey = rowKey.join("")

                    tr.appendChild th

            #create a value cell for each col key
            for colKey, colKeyIdx in colKeys #this is the tight loop
                aggregator = pivotData.getAggregator(rowKey, colKey)
                val = aggregator.value()
                td = document.createElement("td")
                td.className = "pvtVal row#{rowKeyIdx} col#{colKeyIdx}"
                td.textContent = aggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, colKey)
                tr.appendChild td

            #create rightmost row totals cell/s
            createTotalsCell = (totalAggregator) ->
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal rowTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, rowKey, [])
                td.setAttribute("data-for", "row"+rowKeyIdx)
                tr.appendChild td
            totalAggregator = pivotData.getAggregator(rowKey, [])
            #Multi-metric mode: one totals cell per aggregator.
            if $.isArray(totalAggregator)
                for agg in totalAggregator
                    createTotalsCell(agg)
            else
                createTotalsCell(totalAggregator)

            tbody.appendChild tr

        #finally, the row for col totals (which includes a grand total cell in the bottom-right)
        createTotalsRow = (aggIdx) ->
            tr = document.createElement("tr")

            #left-most header cell
            th = document.createElement("th")
            th.className = "pvtTotalLabel pvtColTotalLabel"
            th.innerHTML = opts.localeStrings.totals
            if aggIdx?
                th.dataset.aggIdx = aggIdx
            th.setAttribute("colspan", rowAttrs.length + (if colAttrs.length == 0 then 0 else 1))
            if getHeaderClickHandler?
                th.onclick = getHeaderClickHandler("row", "totals", aggIdx or 0)
            tr.appendChild th

            #value cells, one per col key
            for colKey, colKeyIdx in colKeys
                totalAggregator = pivotData.getAggregator([], colKey)
                if aggIdx?
                    totalAggregator = totalAggregator[aggIdx]
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtTotal colTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], colKey)
                td.setAttribute("data-for", "col"+colKeyIdx)
                tr.appendChild td

            #right-most grand total cell
            createGrandTotalCell = (totalAggregator) ->
                val = totalAggregator.value()
                td = document.createElement("td")
                td.className = "pvtGrandTotal"
                td.textContent = totalAggregator.format(val)
                td.setAttribute("data-value", val)
                if getClickHandler?
                    td.onclick = getClickHandler(val, [], [])
                tr.appendChild td

            #This is an array in multi-metrics mode.
            totalAggregator = pivotData.getAggregator([], [])
            if not $.isArray(totalAggregator)
                createGrandTotalCell(totalAggregator)
            #Multi-metrics mode, "metrics" attr in rows: each grand total cell is created per createTotalsRow() call.
            else if aggIdx?
                createGrandTotalCell(totalAggregator[aggIdx])
            #Multi-metrics mode, "metrics" attr in cols, only one totals row: one grand total cell per aggregator.
            else
                for agg in totalAggregator
                    createGrandTotalCell(agg)

            tbody.appendChild tr

        #In multi-metric mode, if the "Metrics" attr is a row, there is one
        #col totals row per aggregator.
        if $.isArray(pivotData.aggregator) and pivotData.multiAggAttr in rowAttrs
            for agg, aggIdx in pivotData.aggregator
                createTotalsRow(aggIdx)
        else
            createTotalsRow()

        result.appendChild tbody

        #squirrel this away for later
        result.setAttribute("data-numrows", rowKeys.length)
        result.setAttribute("data-numcols", colKeys.length)

        return result

    ###
    Pivot Table core: create PivotData object and call Renderer on it
    ###

    $.fn.pivot = (input, inputOpts, locale="en") ->
        locale = "en" if not locales[locale]?
        defaults =
            cols : [], rows: [], vals: []
            rowOrder: "key_a_to_z", colOrder: "key_a_to_z"
            dataClass: PivotData
            filter: -> true
            aggregator: aggregatorTemplates.count()()
            aggregatorName: "Count"
            sorters: {}
            derivedAttributes: {}
            renderer: pivotTableRenderer

        localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings)
        localeDefaults =
            rendererOptions: {localeStrings}
            localeStrings: localeStrings

        opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts))

        result = null
        try
            pivotData = new opts.dataClass(input, opts)
            try
                result = opts.renderer(pivotData, opts.rendererOptions)
            catch e
                console.error(e.stack) if console?
                result = $("<span>").html opts.localeStrings.renderError
        catch e
            console.error(e.stack) if console?
            result = $("<span>").html opts.localeStrings.computeError

        x = this[0]
        x.removeChild(x.lastChild) while x.hasChildNodes()
        return @append result


    ###
    Pivot Table UI: calls Pivot Table core above with options set by user
    ###

    $.fn.pivotUI = (input, inputOpts, overwrite = false, locale="en") ->
        locale = "en" if not locales[locale]?
        defaults =
            derivedAttributes: {}
            aggregators: locales[locale].aggregators
            renderers: locales[locale].renderers
            hiddenAttributes: []
            hiddenFromAggregators: []
            hiddenFromDragDrop: []
            menuLimit: 500
            cols: [], rows: [], vals: []
            rowOrder: "key_a_to_z", colOrder: "key_a_to_z"
            dataClass: PivotData
            exclusions: {}
            inclusions: {}
            unusedAttrsVertical: 85
            autoSortUnusedAttrs: false
            onRefresh: null
            filter: -> true
            sorters: {}
            treatDataArrayAsRecords: false

        localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings)
        localeDefaults =
            rendererOptions: {localeStrings}
            localeStrings: localeStrings

        existingOpts = @data "pivotUIOptions"
        if not existingOpts? or overwrite
            opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts))
        else
            opts = existingOpts

        try
            # do a first pass on the data to cache a materialized copy of any
            # function-valued inputs and to compute dimension cardinalities
            attrValues = {}
            materializedInput = []
            recordsProcessed = 0
            PivotData.forEachRecord input, opts, (record) ->
                return unless opts.filter(record)
                materializedInput.push(record)
                for own attr of record
                    if not attrValues[attr]?
                        attrValues[attr] = {}
                        if recordsProcessed > 0
                            attrValues[attr][@emptyValue] = recordsProcessed
                for attr of attrValues
                    value = record[attr] ? @emptyValue
                    attrValues[attr][value] ?= 0
                    attrValues[attr][value]++
                recordsProcessed++

            #start building the output
            uiTable = $("<table>", "class": "pvtUi").attr("cellpadding", 5)

            #renderer control
            rendererControl = $("<td>")

            renderer = $("<select>")
                .addClass('pvtRenderer')
                .appendTo(rendererControl)
                .bind "change", -> refresh() #capture reference
            for own x of opts.renderers
                $("<option>").val(x).html(x).appendTo(renderer)


            #axis list, including the double-click menu
            unused = $("<td>").addClass('pvtAxisContainer pvtUnused')
            shownAttributes = (a for a of attrValues when a not in opts.hiddenAttributes)
            shownInAggregators = (c for c in shownAttributes when c not in opts.hiddenFromAggregators)
            shownInDragDrop = (c for c in shownAttributes when c not in opts.hiddenFromDragDrop)


            unusedAttrsVerticalAutoOverride = false
            if opts.unusedAttrsVertical == "auto"
                unusedAttrsVerticalAutoCutoff = 120 # legacy support
            else
                unusedAttrsVerticalAutoCutoff = parseInt opts.unusedAttrsVertical

            if not isNaN(unusedAttrsVerticalAutoCutoff)
                attrLength = 0
                attrLength += a.length for a in shownInDragDrop
                unusedAttrsVerticalAutoOverride = attrLength > unusedAttrsVerticalAutoCutoff

            if opts.unusedAttrsVertical == true or unusedAttrsVerticalAutoOverride
                unused.addClass('pvtVertList')
            else
                unused.addClass('pvtHorizList')

            for own i, attr of shownInDragDrop
                do (attr) ->
                    values = (v for v of attrValues[attr])
                    hasExcludedItem = false
                    valueList = $("<div>").addClass('pvtFilterBox').hide()

                    valueList.append $("<h4>").append(
                        $("<span>").text(attr),
                        $("<span>").addClass("count").text("(#{values.length})"),
                        )
                    if values.length > opts.menuLimit
                        valueList.append $("<p>").html(opts.localeStrings.tooMany)
                    else
                        if values.length > 5
                            controls = $("<p>").appendTo(valueList)
                            sorter = getSort(opts.sorters, attr)
                            placeholder = opts.localeStrings.filterResults
                            $("<input>", {type: "text"}).appendTo(controls)
                                .attr({placeholder: placeholder, class: "pvtSearch"})
                                .bind "keyup", ->
                                    filter = $(this).val().toLowerCase().trim()
                                    accept_gen = (prefix, accepted) -> (v) ->
                                        real_filter = filter.substring(prefix.length).trim()
                                        return true if real_filter.length == 0
                                        return Math.sign(sorter(v.toLowerCase(), real_filter)) in accepted
                                    accept =
                                        if      filter.startsWith(">=") then accept_gen(">=", [1,0])
                                        else if filter.startsWith("<=") then accept_gen("<=", [-1,0])
                                        else if filter.startsWith(">")  then accept_gen(">",  [1])
                                        else if filter.startsWith("<")  then accept_gen("<",  [-1])
                                        else if filter.startsWith("~")  then (v) ->
                                                return true if filter.substring(1).trim().length == 0
                                                v.toLowerCase().match(filter.substring(1))
                                        else (v) -> v.toLowerCase().indexOf(filter) != -1

                                    valueList.find('.pvtCheckContainer p label span.value').each ->
                                        if accept($(this).text())
                                            $(this).parent().parent().show()
                                        else
                                            $(this).parent().parent().hide()
                            controls.append $("<br>")
                            $("<button>", {type:"button"}).appendTo(controls)
                                .html(opts.localeStrings.selectAll)
                                .bind "click", ->
                                    valueList.find("input:visible:not(:checked)")
                                        .prop("checked", true).toggleClass("changed")
                                    return false
                            $("<button>", {type:"button"}).appendTo(controls)
                                .html(opts.localeStrings.selectNone)
                                .bind "click", ->
                                    valueList.find("input:visible:checked")
                                        .prop("checked", false).toggleClass("changed")
                                    return false

                        checkContainer = $("<div>").addClass("pvtCheckContainer").appendTo(valueList)

                        for value in values.sort(getSort(opts.sorters, attr))
                             valueCount = attrValues[attr][value]
                             filterItem = $("<label>")
                             filterItemExcluded = false
                             if opts.inclusions[attr]
                                filterItemExcluded = (value not in opts.inclusions[attr])
                             else if opts.exclusions[attr]
                                filterItemExcluded = (value in opts.exclusions[attr])
                             hasExcludedItem ||= filterItemExcluded
                             $("<input>")
                                .attr("type", "checkbox").addClass('pvtFilter')
                                .attr("checked", !filterItemExcluded).data("filter", [attr,value])
                                .appendTo(filterItem)
                                .bind "change", -> $(this).toggleClass("changed")
                             filterItem.append $("<span>").addClass("value").text(value)
                             filterItem.append $("<span>").addClass("count").text("("+valueCount+")")
                             checkContainer.append $("<p>").append(filterItem)

                    closeFilterBox = ->
                        if valueList.find("[type='checkbox']").length >
                               valueList.find("[type='checkbox']:checked").length
                                attrElem.addClass "pvtFilteredAttribute"
                            else
                                attrElem.removeClass "pvtFilteredAttribute"

                            valueList.find('.pvtSearch').val('')
                            valueList.find('.pvtCheckContainer p').show()
                            valueList.hide()

                    finalButtons = $("<p>").appendTo(valueList)

                    if values.length <= opts.menuLimit
                        $("<button>", {type: "button"}).text(opts.localeStrings.apply)
                            .appendTo(finalButtons).bind "click", ->
                                if valueList.find(".changed").removeClass("changed").length
                                    refresh()
                                closeFilterBox()

                    $("<button>", {type: "button"}).text(opts.localeStrings.cancel)
                        .appendTo(finalButtons).bind "click", ->
                            valueList.find(".changed:checked")
                                .removeClass("changed").prop("checked", false)
                            valueList.find(".changed:not(:checked)")
                                .removeClass("changed").prop("checked", true)
                            closeFilterBox()

                    triangleLink = $("<span>").addClass('pvtTriangle')
                        .html(" &#x25BE;").bind "click", (e) ->
                            {left, top} = $(e.currentTarget).position()
                            valueList.css(left: left+10, top: top+10).show()

                    attrElem = $("<li>").addClass("axis_#{i}")
                        .append $("<span>").addClass('pvtAttr').text(attr).data("attrName", attr).append(triangleLink)

                    attrElem.addClass('pvtFilteredAttribute') if hasExcludedItem
                    unused.append(attrElem).append(valueList)

            tr1 = $("<tr>").appendTo(uiTable)

            #aggregator menu and value area

            aggregator = $("<select>").addClass('pvtAggregator')
                .bind "change", -> refresh() #capture reference
            for own x of opts.aggregators
                aggregator.append $("<option>").val(x).html(x)

            ordering =
                key_a_to_z:   {rowSymbol: "&varr;", colSymbol: "&harr;", next: "value_a_to_z"}
                value_a_to_z: {rowSymbol: "&darr;", colSymbol: "&rarr;", next: "value_z_to_a"}
                value_z_to_a: {rowSymbol: "&uarr;", colSymbol: "&larr;", next: "key_a_to_z"}

            rowOrderArrow = $("<a>", role: "button").addClass("pvtRowOrder")
                .data("order", opts.rowOrder).html(ordering[opts.rowOrder].rowSymbol)
                .bind "click", ->
                    $(this).data("order", ordering[$(this).data("order")].next)
                    $(this).html(ordering[$(this).data("order")].rowSymbol)
                    refresh()

            colOrderArrow = $("<a>", role: "button").addClass("pvtColOrder")
                .data("order", opts.colOrder).html(ordering[opts.colOrder].colSymbol)
                .bind "click", ->
                    $(this).data("order", ordering[$(this).data("order")].next)
                    $(this).html(ordering[$(this).data("order")].colSymbol)
                    refresh()

            $("<td>").addClass('pvtVals')
              .appendTo(tr1)
              .append(aggregator)
              .append(rowOrderArrow)
              .append(colOrderArrow)
              .append($("<br>"))

            #column axes
            $("<td>").addClass('pvtAxisContainer pvtHorizList pvtCols').appendTo(tr1)

            tr2 = $("<tr>").appendTo(uiTable)

            #row axes
            tr2.append $("<td>").addClass('pvtAxisContainer pvtRows').attr("valign", "top")

            #the actual pivot table container
            pivotTable = $("<td>")
                .attr("valign", "top")
                .addClass('pvtRendererArea')
                .appendTo(tr2)

            #finally the renderer dropdown and unused attribs are inserted at the requested location
            if opts.unusedAttrsVertical == true or unusedAttrsVerticalAutoOverride
                uiTable.find('tr:nth-child(1)').prepend rendererControl
                uiTable.find('tr:nth-child(2)').prepend unused
            else
                uiTable.prepend $("<tr>").append(rendererControl).append(unused)

            #render the UI in its default state
            @html uiTable

            #set up the UI initial state as requested by moving elements around

            for x in opts.cols
                @find(".pvtCols").append @find(".axis_#{$.inArray(x, shownInDragDrop)}")
            for x in opts.rows
                @find(".pvtRows").append @find(".axis_#{$.inArray(x, shownInDragDrop)}")
            if opts.aggregatorName?
                @find(".pvtAggregator").val opts.aggregatorName
            if opts.rendererName?
                @find(".pvtRenderer").val opts.rendererName

            initialRender = true

            #set up for refreshing
            refreshDelayed = =>
                subopts =
                    derivedAttributes: opts.derivedAttributes
                    localeStrings: opts.localeStrings
                    rendererOptions: opts.rendererOptions
                    sorters: opts.sorters
                    cols: [], rows: []
                    dataClass: opts.dataClass

                numInputsToProcess = opts.aggregators[aggregator.val()]([])().numInputs ? 0
                vals = []
                @find(".pvtRows li span.pvtAttr").each -> subopts.rows.push $(this).data("attrName")
                @find(".pvtCols li span.pvtAttr").each -> subopts.cols.push $(this).data("attrName")
                @find(".pvtVals select.pvtAttrDropdown").each ->
                    if numInputsToProcess == 0
                        $(this).remove()
                    else
                        numInputsToProcess--
                        vals.push $(this).val() if $(this).val() != ""

                if numInputsToProcess != 0
                    pvtVals = @find(".pvtVals")
                    for x in [0...numInputsToProcess]
                        newDropdown = $("<select>")
                            .addClass('pvtAttrDropdown')
                            .append($("<option>"))
                            .bind "change", -> refresh()
                        for attr in shownInAggregators
                            newDropdown.append($("<option>").val(attr).text(attr))
                        pvtVals.append(newDropdown)

                if initialRender
                    vals = opts.vals
                    i = 0
                    @find(".pvtVals select.pvtAttrDropdown").each ->
                        $(this).val vals[i]
                        i++
                    initialRender = false

                subopts.aggregatorName = aggregator.val()
                subopts.vals = vals
                subopts.aggregator = opts.aggregators[aggregator.val()](vals)
                subopts.renderer = opts.renderers[renderer.val()]
                subopts.rowOrder = rowOrderArrow.data("order")
                subopts.colOrder = colOrderArrow.data("order")
                #construct filter here
                exclusions = {}
                @find('input.pvtFilter').not(':checked').each ->
                    filter = $(this).data("filter")
                    if exclusions[filter[0]]?
                        exclusions[filter[0]].push( filter[1] )
                    else
                        exclusions[filter[0]] = [ filter[1] ]
                #include inclusions when exclusions present
                inclusions = {}
                @find('input.pvtFilter:checked').each ->
                    filter = $(this).data("filter")
                    if exclusions[filter[0]]?
                        if inclusions[filter[0]]?
                            inclusions[filter[0]].push( filter[1] )
                        else
                            inclusions[filter[0]] = [ filter[1] ]

                subopts.filter = (record) ->
                    return false if not opts.filter(record)
                    for k,excludedItems of exclusions
                        return false if ""+(record[k] ? 'null') in excludedItems
                    return true

                pivotTable.pivot(materializedInput,subopts)
                pivotUIOptions = $.extend {}, opts,
                    cols: subopts.cols
                    rows: subopts.rows
                    colOrder: subopts.colOrder
                    rowOrder: subopts.rowOrder
                    vals: vals
                    exclusions: exclusions
                    inclusions: inclusions
                    inclusionsInfo: inclusions #duplicated for backwards-compatibility
                    aggregatorName: aggregator.val()
                    rendererName: renderer.val()

                @data "pivotUIOptions", pivotUIOptions

                # if requested make sure unused columns are in alphabetical order
                if opts.autoSortUnusedAttrs
                    unusedAttrsContainer = @find("td.pvtUnused.pvtAxisContainer")
                    $(unusedAttrsContainer).children("li")
                        .sort((a, b) => naturalSort($(a).text(), $(b).text()))
                        .appendTo unusedAttrsContainer

                pivotTable.css("opacity", 1)
                opts.onRefresh(pivotUIOptions) if opts.onRefresh?

            refresh = =>
                pivotTable.css("opacity", 0.5)
                setTimeout refreshDelayed, 10

            #the very first refresh will actually display the table
            refresh()

            @find(".pvtAxisContainer").sortable
                    update: (e, ui) -> refresh() if not ui.sender?
                    connectWith: @find(".pvtAxisContainer")
                    items: 'li'
                    placeholder: 'pvtPlaceholder'
        catch e
            console.error(e.stack) if console?
            @html opts.localeStrings.uiRenderError
        return this

    ###
    Heatmap post-processing
    ###

    $.fn.heatmap = (scope = "heatmap", opts) ->
        numRows = @data "numrows"
        numCols = @data "numcols"

        # given a series of values
        # must return a function to map a given value to a CSS color
        colorScaleGenerator = opts?.heatmap?.colorScaleGenerator
        colorScaleGenerator ?= (values) ->
            min = Math.min(values...)
            max = Math.max(values...)
            return (x) ->
                nonRed = 255 - Math.round 255*(x-min)/(max-min)
                return "rgb(255,#{nonRed},#{nonRed})"

        heatmapper = (scope) =>
            forEachCell = (f) =>
                @find(scope).each ->
                    x = $(this).data("value")
                    f(x, $(this)) if x? and isFinite(x)

            values = []
            forEachCell (x) -> values.push x
            colorScale = colorScaleGenerator(values)
            forEachCell (x, elem) -> elem.css "background-color", colorScale(x)

        switch scope
            when "heatmap"    then heatmapper ".pvtVal"
            when "rowheatmap" then heatmapper ".pvtVal.row#{i}" for i in [0...numRows]
            when "colheatmap" then heatmapper ".pvtVal.col#{j}" for j in [0...numCols]

        heatmapper ".pvtTotal.rowTotal"
        heatmapper ".pvtTotal.colTotal"

        return this

    ###
    Barchart post-processing
    ###

    $.fn.barchart = (opts) ->
        numRows = @data "numrows"
        numCols = @data "numcols"

        barcharter = (scope) =>
            forEachCell = (f) =>
                @find(scope).each ->
                    x = $(this).data("value")
                    f(x, $(this)) if x? and isFinite(x)

            values = []
            forEachCell (x) -> values.push x
            max = Math.max(values...)
            if max < 0
                max = 0
            range = max;
            min = Math.min(values...)
            if min < 0
                range = max - min
            scaler = (x) -> 100*x/(1.4*range)
            forEachCell (x, elem) ->
                text = elem.text()
                wrapper = $("<div>").css
                    "position": "relative"
                    "height": "55px"
                bgColor = "gray"
                bBase = 0
                if min < 0
                    bBase = scaler(-min)
                if x < 0
                    bBase += scaler(x)
                    bgColor = "darkred"
                    x = -x
                wrapper.append $("<div>").css
                    "position": "absolute"
                    "bottom": bBase + "%"
                    "left": 0
                    "right": 0
                    "height": scaler(x) + "%"
                    "background-color": bgColor
                wrapper.append $("<div>").text(text).css
                    "position":"relative"
                    "padding-left":"5px"
                    "padding-right":"5px"

                elem.css("padding": 0,"padding-top": "5px", "text-align": "center").html wrapper

        barcharter ".pvtVal.row#{i}" for i in [0...numRows]
        barcharter ".pvtTotal.colTotal"

        return this
