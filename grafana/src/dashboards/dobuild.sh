export ENV=DEV
export UID=CAOz_5NVk
python product-insights.py > ../../provisioning/dashboards/dev/product-insights.json
export ENV=CLAY
export UID=r8bG_cHVk
python product-insights.py > ../../provisioning/dashboards/tnet/product-insights.json
export ENV=
export UID=Ggt4khSVz
python product-insights.py > ../../provisioning/dashboards/prod/product-insights.json

export ENV=DEV
export UID=
python product-overview.py > ../../provisioning/dashboards/dev/product-overview.json
export ENV=CLAY
export UID=
python product-overview.py > ../../provisioning/dashboards/tnet/product-overview.json
export ENV=
export UID=
python product-overview.py > ../../provisioning/dashboards/prod/product-overview.json
