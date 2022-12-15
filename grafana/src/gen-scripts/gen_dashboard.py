import re
import json
import os

UID = os.getenv('DASH_UID')
ENV = os.getenv('ENV')

HEADER = """
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "-- Grafana --",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "description": "DESC",
  "editable": true,
  "gnetId": null,
  "graphTooltip": 0,
  "id": DASHBOARD_ID,
  "links": [],
  "panels": [
"""

FOOTER = """
],
  "schemaVersion": 27,
  "style": "dark",
  "tags": [],
  "templating": {
    "list": []
  },
  "time": {
    "from": "FROM",
    "to": "TO"
  },
  "timepicker": {},
  "timezone": "",
  "title": "TITLE",
  "uid": "UID",
  "version": VERSION
}
"""

TEMPLATE = """

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
      "id": IDNUM,
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
      "targets": TARGETS,
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
    }
"""

TARGET = { 
          "exemplar": True,
          "expr": "",
          "interval": "",
          "legendFormat": "",
          "refId": "A"
        }

REFIDS = 'ABCDEF'


def make_target(tdata, n=0):
    target = TARGET.copy()
    target['expr'] = tdata.get('EXPR', '')
    target['legendFormat'] = tdata.get('LEGEND', '')
    target['refId'] = REFIDS[n]
    return target


def gen_dashboard(data):
    xpos = 0
    ypos = 0
    cols = 2
    col = 0

    header = HEADER
    header = re.sub('DASHBOARD_ID', data.get('ID', '0'), header)
    header = re.sub('DESC', data.get('DESC', ''), header)
    
    footer = FOOTER
    title = data.get('TITLE', '')
    if ENV:
        title = title + '-' + ENV
    footer = re.sub('TITLE', title, footer)
    footer = re.sub('UID', UID, footer)
    footer = re.sub('VERSION', data.get('VERSION', '0'), footer)
    footer = re.sub('FROM', data.get('FROM', 'now-7d'), footer)  # or now/w
    footer = re.sub('TO', data.get('TO', 'now'), footer)      # or now/w
   
    print header

    for chart in data['PANELS'] :
       if col > 0:
           print ','
       if col % cols == 0 :
            xpos = 0
            ypos += 8
       else:
            xpos += 12
       col += 1
       chunk = TEMPLATE
       chunk = re.sub('TITLE', chart['TITLE'], chunk)
       chunk = re.sub('DESC', chart['DESC'], chunk)
       chunk = re.sub('XPOS', str(xpos), chunk)
       chunk = re.sub('YPOS', str(ypos), chunk)
       chunk = re.sub('IDNUM', str(col), chunk)
       targets = []
       if 'TARGETS' in chart:
           for n, tdata in enumerate(chart['TARGETS']):
               targets.append(make_target(tdata, n))
       else:
           targets.append(make_target(chart, 0))
       chunk = re.sub('TARGETS', json.dumps(targets), chunk)

       print chunk

    print footer 
