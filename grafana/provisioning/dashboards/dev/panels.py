
template = """

    {
      "aliasColors": {},
      "bars": false,
      "dashLength": 10,
      "dashes": false,
      "datasource": "Prometheus",
      "description": "DESC",
      "fieldConfig": {
        "defaults": {},
        "overrides": []
      },
      "fill": 1,
      "fillGradient": 0,
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": XPOS,
        "y": YPOS 
      },
      "hiddenSeries": false,
      "id": 8,
      "legend": {
        "avg": false,
        "current": false,
        "max": false,
        "min": false,
        "show": true,
        "total": false,
        "values": false
      },
      "lines": true,
      "linewidth": 1,
      "nullPointMode": "null",
      "options": {
        "alertThreshold": true
      },
      "percentage": false,
      "pluginVersion": "7.5.7",
      "pointradius": 2,
      "points": false,
      "renderer": "flot",
      "seriesOverrides": [],
      "spaceLength": 10,
      "stack": false,
      "steppedLine": false,
      "targets": [
        {
          "exemplar": true,
          "expr": "EXPR",
          "interval": "",
          "legendFormat": "",
          "refId": "A"
        }
      ],
      "thresholds": [],
      "timeFrom": null,
      "timeRegions": [],
      "timeShift": null,
      "title": "TITLE",
      "tooltip": {
        "shared": true,
        "sort": 0,
        "value_type": "individual"
      },
      "type": "graph",
      "xaxis": {
        "buckets": null,
        "mode": "time",
        "name": null,
        "show": true,
        "values": []
      },
      "yaxes": [
        {
          "format": "short",
          "label": null,
          "logBase": 1,
          "max": null,
          "min": null,
          "show": true
        },
        {
          "format": "short",
          "label": null,
          "logBase": 1,
          "max": null,
          "min": null,
          "show": true
        }
      ],
      "yaxis": {
        "align": false,
        "alignLevel": null
      }
    },
"""

data = [
 { 'TITLE': 'Models: Total uniques past day',
   'DESC': 'unique model total in past day',
   'EXPR': 'increase(agent_model_uniq_da_total[1d])'
 },
 { 'TITLE': 'Models: Total uniques last month',
   'DESC': 'unique model total in past month',
   'EXPR': 'increase(agent_model_uniq_mo_total[30d])'
 },
 { 'TITLE': 'Models: Daily uniques/second',
   'DESC': 'Rate of appearance of new models not seen in last day',
   'EXPR': 'rate(agent_model_uniq_da_total[5m])'
 },
 { 'TITLE': 'Models: Monthly uniques/second',
   'DESC': 'Rate of appearance of new models not seen in last month',
   'EXPR': 'rate(agent_model_uniq_da_total[5m])'
 },
 { 'TITLE': 'Models: total rate/second',
   'DESC': 'Count velocity of streams with models (any model)',
   'EXPR': 'rate(agent_model_total[5m])'
 },


 { 'TITLE': 'Streams: Total uniques past day',
   'DESC': 'unique stream total in past day',
   'EXPR': 'increase(agent_stream_uniq_da_total[1d])'
 },
 { 'TITLE': 'Streams: Total uniques last month',
   'DESC': 'unique stream total in past month',
   'EXPR': 'increase(agent_stream_uniq_mo_total[30d])'
 },
 { 'TITLE': 'Streams: Daily uniques/second',
   'DESC': 'Rate of appearance of new streams not seen in last day',
   'EXPR': 'rate(agent_stream_uniq_da_total[5m])'
 },
 { 'TITLE': 'Streams: Monthly uniques/second',
   'DESC': 'Rate of appearance of new streams not seen in last month',
   'EXPR': 'rate(agent_stream_uniq_da_total[5m])'
 },
 { 'TITLE': 'Streams: total rate/second',
   'DESC': 'Count velocity of streams with streams (any stream)',
   'EXPR': 'rate(agent_stream_total[5m])'
 },

 { 'TITLE': 'Streams by Operation',
   'DESC': 'Create, Query, Update on Streams',
   'EXPR': 'sum by (oper) (rate(agent_stream_total[5m]))'
 },
 { 'TITLE': 'Streams by Family',
   'DESC': 'Stream family counts',
   'EXPR': 'sum by (family) (rate(agent_stream_total[5m]))'
 },
 { 'TITLE': 'Streams by Type',
   'DESC': 'Stream type counts',
   'EXPR': 'sum by (type) (rate(agent_stream_total[5m]))'
 },
 { 'TITLE': 'Streams by Version',
   'DESC': 'Stream version counts',
   'EXPR': 'sum by (version) (rate(agent_stream_total[5m]))'
 },


 { 'TITLE': 'Controllers: Total uniques past day',
   'DESC': 'unique controller total in past day',
   'EXPR': 'increase(agent_controller_uniq_da_total[1d])'
 },
 { 'TITLE': 'Controllers: Total uniques last month',
   'DESC': 'unique controller total in past month',
   'EXPR': 'increase(agent_controller_uniq_mo_total[30d])'
 },
 { 'TITLE': 'Controllers: Daily uniques/second',
   'DESC': 'Rate of appearance of new controllers not seen in last day',
   'EXPR': 'rate(agent_controller_uniq_da_total[5m])'
 },
 { 'TITLE': 'Controllers: Monthly uniques/second',
   'DESC': 'Rate of appearance of new controllers not seen in last month',
   'EXPR': 'rate(agent_controller_uniq_da_total[5m])'
 },
 { 'TITLE': 'Controllers: total rate/second',
   'DESC': 'Count velocity of streams with controllers (any controller)',
   'EXPR': 'rate(agent_controller_total[5m])'
 },

]

xpos = 0
ypos = 0
cols = 2
col = 0
for chart in data :
   if col % cols == 0 :
        xpos = 0
        ypos += 8
   else:
        xpos += 12
   col += 1
   chunk = template.copy()
   re.sub('TITLE', chart['TITLE'], chunk)
   re.sub('EXPR', chart['EXPR'], chunk)
   re.sub('DESC', chart['DESC'], chunk)
   re.sub('XPOS', xpos, chunk)
   re.sub('YPOS', ypos, chunk)
   print chunk
  
