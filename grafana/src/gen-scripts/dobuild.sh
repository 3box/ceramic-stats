export ENV=DEV
export DASH_UID=CAOz_5NVk
python product-insights.py > ../../provisioning/dashboards/dev/product-insights.json
export ENV=CLAY
export DASH_UID=r8bG_cHVk
python product-insights.py > ../../provisioning/dashboards/tnet/product-insights.json
export ENV=
export DASH_UID=Ggt4khSVz
python product-insights.py > ../../provisioning/dashboards/prod/product-insights.json

export ENV=DEV
export DASH_UID=sTm-ePn4k
python product-overview.py > ../../provisioning/dashboards/dev/product-overview.json
export ENV=CLAY
export DASH_UID=_CRrny7Vk
python product-overview.py > ../../provisioning/dashboards/tnet/product-overview.json
export ENV=
export DASH_UID=c1HGVy74z
python product-overview.py > ../../provisioning/dashboards/prod/product-overview.json
