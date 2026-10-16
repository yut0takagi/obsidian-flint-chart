# Flint Chart

![Downloads](https://raw.githubusercontent.com/yut0takagi/obsidian-flint-chart/main/.github/stats/badge.svg)

![Download history](https://raw.githubusercontent.com/yut0takagi/obsidian-flint-chart/main/.github/stats/downloads.svg)

Write a chart in a note by saying what your data **means** and which chart you want. Scales, axes, aggregation, number formats, layout and colour are worked out for you.

This plugin embeds [Flint](https://github.com/microsoft/flint-chart), Microsoft's semantics-driven intermediate language for data visualisation, into Markdown code blocks and renders the result with [Apache ECharts](https://echarts.apache.org/). **37 chart types**, including the structural ones most Markdown charting plugins do not reach: sankey, treemap, sunburst, gauge, tree, network graph, parallel coordinates and calendar heatmap.

```flint
chartType: Bar Chart
title: Quarterly revenue
x: quarter
y: revenue
color: region
data:
  - { quarter: Q1, revenue: 1200, region: East }
  - { quarter: Q2, revenue: 1580, region: East }
  - { quarter: Q1, revenue: 800,  region: West }
  - { quarter: Q2, revenue: 1120, region: West }
```

That is the whole block. No axis configuration, no scale, no colour list, no number format.

Already have the numbers in a table? Put the cursor in it and run **Create chart from table or data file**. Flint suggests a few charts for that table, each drawn as a preview; pick one and its block is inserted under the table, linked to it so the chart follows your edits.

## Why semantics instead of a chart config

Declarative chart grammars start to fight you when what a column *means* differs from how it is *stored*: `202601` is a year-month, not a magnitude; temperatures should not be stacked; a rate of change belongs on a diverging ramp. Flint treats meaning as a first-class input, so it can derive the low-level decisions instead of asking you for them.

You can annotate columns yourself:

```flint
chartType: Line Chart
x: period
y: newUsers
color: plan
types:
  period: YearMonth
  newUsers: PercentageChange
  plan: Category
source: data/growth.csv
```

If you leave `types` out, the plugin infers them from the column names and values, so a column called `revenue` becomes a `Price` and `2026-Q3` becomes a `YearQuarter`. Explicit annotations always win.

## Installing

**From the community plugins browser** — search for *Flint Chart*, install, enable.

**Manually** — download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/flint-chart/`, then enable the plugin in Settings → Community plugins.

## Writing a block

Use a `flint` fenced code block. The body is YAML, and because YAML is a superset of JSON you can paste raw JSON in unchanged.

### Shorthand form

Encoding channels go at the top level:

| Key | Meaning |
| --- | --- |
| `chartType` (or `chart`, `type`) | Which chart. Matched loosely, so `sankey` finds `Sankey Diagram`. Omit it to have one chosen from your data. |
| `title`, `subtitle` | Headline and the line under it. |
| `x` `y` `x2` `y2` `color` `size` `opacity` `order` `detail` `group` `column` `row` `open` `high` `low` `close` `goal` | Encoding channels. A bare value binds a column (`x: quarter`); a mapping is passed to Flint as-is (`x: { field: quarter, sort: descending }`). |
| `types` | Column → semantic type. Accepts a name (`Price`) or a mapping (`{ semanticType: Rating, intrinsicDomain: [1, 5] }`). |
| `names` | Column → display label, for axis titles and legends. |
| `width`, `height` | Target size in pixels. Charts still shrink to fit the note. |
| `maxWidth`, `maxHeight` | Hard ceiling on how far the layout may stretch. |

Sizes are capped at 4096 px per side, and the block says so when one is; PNG export lowers its scale when the image would pass 8192 px a side or 4096 × 4096 in area.
| `properties` | Chart-specific options, e.g. `{ stackMode: normalize, cornerRadius: 4 }`. |
| `data`, `source`, `table` | Where the rows come from — see below. |

Each chart type accepts its own set of channels. Bind one it does not use and the block tells you which ones it does accept, rather than drawing nothing.

### Full Flint form

If a key called `chart_spec` is present, the block is read as a Flint `ChartAssemblyInput` verbatim:

```flint
data:
  values:
    - { quarter: Q1, revenue: 1200 }
    - { quarter: Q2, revenue: 1580 }
semantic_types: { quarter: Quarter, revenue: Price }
chart_spec:
  chartType: Line Chart
  encodings:
    x: { field: quarter }
    y: { field: revenue }
  baseSize: { width: 480, height: 320 }
```

This is what the Flint MCP server and Flint's own tooling emit, so generated specs can be pasted straight into a note without editing.

## Where the data comes from

**Inline rows**

```flint
chartType: Bar Chart
x: name
y: score
data:
  - { name: Ada,  score: 88 }
  - { name: Alan, score: 74 }
```

**Inline CSV or TSV** — the delimiter is detected, quoted fields and embedded newlines are handled:

```flint
chartType: Line Chart
x: month
y: users
data: |
  month,users
  2026-01,1200
  2026-02,1580
```

**A file in the vault** — `.csv`, `.tsv`, `.json`, or a Markdown note. Edit the file and the chart redraws.

```flint
chartType: Area Chart
x: month
y: users
source: data/growth.csv
```

**A Markdown table you already maintain** — point at a note and, optionally, a heading:

```flint
chartType: Bar Chart
x: Region
y: Revenue
source: "[[Sales notes#Q3]]"
```

The table under that heading becomes the rows. Cells are cleaned of bold, italics, inline code, wikilinks and Markdown links, and `1,580` and `42%` are read as numbers. This is the one that tends to change how people work: the table stays the thing you edit, and the chart follows it.

## Chart types

Bar Chart · Grouped Bar Chart · Stacked Bar Chart · Lollipop Chart · Pyramid Chart · Waterfall Chart · Bullet Chart · Line Chart · Area Chart · Streamgraph · Range Area Chart · Bump Chart · Slope Chart · Scatter Plot · Regression · Connected Scatter Plot · Ranged Dot Plot · Strip Plot · Bubble-style sizing on any of the above · Boxplot · Histogram · Density Plot · ECDF Plot · Heatmap · Calendar Heatmap · Pie Chart · Rose Chart · Funnel Chart · Radar Chart · Gauge Chart · Treemap · Sunburst Chart · Tree · Sankey Diagram · Network Graph · Parallel Coordinates · Candlestick Chart · Gantt Chart

Each one's channels and options are listed in Flint's [ECharts chart reference](https://github.com/microsoft/flint-chart/blob/main/docs/reference-echarts.md).

## Commands

| Command | What it does |
| --- | --- |
| Insert chart block | Drops a working starter block at the cursor. |
| Insert chart block reading a table | Starter block wired to a note and heading. |
| Create chart from table or data file | With the cursor in a Markdown table (or on the line just below it), shows the charts Flint suggests for that table as previews and inserts the one you pick. The block reads the table through a link, or carries the rows itself when the table cannot be linked to (a second table under the same heading, say). Anywhere else, pick a CSV, TSV or JSON file from the vault instead. Every suggestion is drawn once before it is shown, so what you insert renders. |
| Export charts in this note as PNG | Writes every chart in the note to an image. Existing files are never overwritten. |

Each chart also has its own menu — the image button in its top-right corner, or a right-click on the chart — with **Copy as PNG**, **Save as PNG** (named after the note and the chart's title) and the background to use for both.

## Settings

- **Renderer** — canvas (faster on large datasets) or SVG (stays crisp when zoomed). PNG export works the same with either: the image is drawn afresh on a canvas, after the entry animation.
- **Default width / height** — used when a block does not say.
- **Note automatic chart types** — show a line under the chart when the type was chosen for you.
- **Export folder** and **export scale** — where PNGs go and how sharp they are. Scale 2 or 3 suits slides.
- **Background** — what exported and copied images sit on: the note's theme (the default, so the image looks as it does in the note), white, or transparent. White also switches text and axes to dark ink, so a chart made in a dark theme stays readable on a white slide. Series colours are never changed.

## Theming

Charts read your vault's actual CSS variables — text, muted text, borders and surfaces — so they follow the active theme, including community themes, and update the moment you switch. The chart background stays transparent so the note shows through.

Flint's own `theme_spec` presets are not available here: Flint applies them to its Vega-Lite backend only, and this plugin renders with ECharts. A block containing `theme:` says so rather than ignoring it silently.

## Notes on scope

- Works on desktop and mobile. No Node APIs are used; files are read through the vault.
- `main.js` is around 1.3 MB, almost all of it ECharts. Narrowing ECharts to a few chart families saves roughly 500 KB but costs 31 of the 37 chart types, which is not a trade this plugin makes.

## Licence and attribution

This plugin is MIT — see [LICENSE](LICENSE). Bundled third-party components are listed in [NOTICE](NOTICE):

| Component | Licence |
| --- | --- |
| [Flint](https://github.com/microsoft/flint-chart) | MIT, © Microsoft Corporation |
| [Apache ECharts](https://github.com/apache/echarts) | Apache-2.0, © The Apache Software Foundation |

**Not affiliated with, endorsed by, or sponsored by Microsoft.** "Flint" appears in this plugin's name only to say which specification it reads. No Microsoft trademarks or logos are used, in keeping with [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Obsidian is a trademark of Dynalist Inc., likewise unaffiliated.
