# Example Dashboard Management Strategy

High-level checklist

    Do all graphs have a left Y with a useful and correct unit?
    Can you tell what a graph represents exactly? (e.g. how it is aggregated) Is it obvious?

Dashboard
Dashboard layout

Create a Text panel at the very top of the dashboard in its own (unnamed) row. For example, see ResourceLoader.

    Define in a short statement what the subject of the dashboard is (e.g. what does the service do for end-users?), consider linking to a documentation page.
    Summarise in a sentence or two the flow of the data from the source to your screen (e.g. from instrumentation to Statsd to Graphite; or from mtail to Prometheus), considering linking to the source code of the instrumentation.

Dashboard settings

General:

    Editable: Yes.
    Preferred timezone: UTC.
    Preferred range: Last N days for most dashboards. Last N hours for alert dashboards.
    Auto refresh: Provide options for 5min and 15min. If on by default, use 5min as the default interval. Avoid smaller intervals due to unexpected load (applies to both client and server).
    Graph tooltip: Enable the shared crosshair.

Annotations

If the dashboard should have an option to highlight major MediaWiki deployments (Train), create an annotation with the following settings:

    Name: Show Train deploys. Data source: graphite.
    Enabled: Off by default. Hidden: No. Color: Dark blue.
    Query: exclude(aliasByNode(deploy.sync-wikiversions.count,-2),"all")

Or, to show all MediaWiki deployments:

    Name: Show MW deploys. Data source: graphite.
    Enabled: Off by default. Hidden: No. Color: Dark blue.
    Query: exclude(aliasByNode(deploy.*.count,-2),"all")

Graph panels
Keep your graph focussed

When creating a graph, keep in mind what question you want the graph to answer. If possible, focus on a single metric only.

More than three metrics is usually a sign that a graph may be attempting to answer too many questions at once. This can be problematic as it may cause it to be unable to accurately answer any of the questions involved, for example due to axes having to span a wide range of values, or due to it being difficult to correlate the number of colors, lines, and labels.

One case where you do want to consider many metrics in one graph, is when wanting to understand the relationship between quantities and their distribution. See #Graph with many metrics below.
Draw mode

When plotting metrics that represent a quantity per interval, use a bar chart (e.g. rate counter, CPU usage percentage, bytes gauge for memory or disk).

For timing metrics, use a line chart.
Graph recommended settings

General:

    ...

Metrics:

    Remember to use .rate, when querying Statsd counters from Graphite. Never use count or sum. (Why: Graphite#Extended properties.)
    Preferred scale for counters is per second, and otherwise per minute.

    For timing metrics, prefer plotting the max (Statsd: upper). Otherwise, consider p99 or p75. Avoid lower percentiles, medians, or mean averages. (Why: Measuring load times.)
    Prefer minimal or no aggregations in queries. If aggregation is applied, be sure to clearly indicate this in the legend. You can use the alias function to describe how the value is produced. For example, frontend.navtiming2.responseStart.mobile.p75 | movingAverage (24h) | alias("responseStart.mobile.p75 | movingAverage (24h)"). Notice how the movingAverage is specified both as actual query function and as text for the alias function.

Axes:

    Always include a Left Y-axis on graph panels.

    Unit: Set this correctly for timing metrics and percentages. For counters, we typically use the "short" notation.
    Label: Use this to document the scale of counting metrics (e.g. "rate per minute"). The label is usually left blank for timing metrics.
    Min/Max: Usually left to auto. For percentage graphs that can't exceed 100%, do set a max of 100% to avoid the automatic margin expansion to 120%.

Legend:

    ..

Display:

    Draw Mode: Bars or Lines.
    Line width: 1. Line fill: 1.
    Tooltip: All series. If the graph contains more than a dozen metrics, use Single instead.
    Null value: null. (Setting this to Continuous or Zero almost always causes issues, eventually.)

Graph with alert rules

    .. (TODO: Info thing.)
    .. (TODO: threshold thing.)

Graph with many metrics

When plotting more than a dozen metrics with the intent to understand distribution, it is recommended to create a stacked bar chart (not a line graph). Like so:

    Display: Set Drawing mode to Bars, and enable Stacking mode. Ensure the hover value is stacked "individually".
    Legend: Hide the legend (its too growded). Alternatively, show as scrollable table to the right.

Alert rules

    Evaluate every: 15 min.
    Query condition: Range for last 15min or 1h, until now-5min.
    If no data or all nulls: Alerting. (This helps detect when the underlying service may be down or broken. We used to ignore this due to a bug in Graphite, but as of January 2019 we're trying it again.)
    If error or timeout: Keep Last State. (Graphite often times out; when using Prometheus consider Alerting on errors.)
