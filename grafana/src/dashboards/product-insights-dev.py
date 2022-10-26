from gen_dashboard import gen_dashboard

VERSION = '19'

data = {
    'ID': '90',
    'DESC': 'metrics grouped by app',
    'TITLE': 'Product Insights',
    'UID': 'CAOz_5NVk',
    'VERSION': VERSION,

    'PANELS': [
     { 'TITLE': 'Total Streams by App (Cacao) by Day',
       'DESC': 'total stream updates, grouped by Cacao, in past day',
       'EXPR': 'last_over_time(sum by (cacao) (increase(agent_stream_total{cacao!=\'\'}[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{cacao}}'
     },
     { 'TITLE': 'Total Streams by App Family by Day',
       'DESC': 'total stream queries and updates by family in past day (top 10 families)',
       'EXPR': 'topk(10, last_over_time(sum by (family)(increase(agent_stream_total{family!=\'undefined\'}[1d]))[1d:1d]))',
       'LEGEND': '{{family}}'
     },
     { 'TITLE': 'Unique Streams by App (Cacao) by Day',
       'DESC': 'unique streams updated, grouped by Cacao, in past day',
       'EXPR': 'last_over_time(sum by (cacao) (increase(agent_stream_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{cacao}}'
     },
     { 'TITLE': 'Unique Streams by App Family by Day',
       'DESC': 'unique streams updated, grouped by Family, in past day',
       'EXPR': 'last_over_time(sum by (family) (increase(agent_stream_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{family}}'
     },
     { 'TITLE': 'Unique Controllers by App (Cacao) by Day',
       'DESC': 'unique controllers seen on updates, grouped by Cacao, in past day',
       'EXPR': 'last_over_time(sum by (cacao) (increase(agent_controller_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{cacao}}'
     },
     { 'TITLE': 'Unique Controllers by App Family by Day',
       'DESC': 'unique controllers, grouped by Family, in past day',
       'EXPR': 'last_over_time(sum by (family) (increase(agent_controller_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{family}}'
     },
     { 'TITLE': 'Unique Models by App (Cacao) by Day',
       'DESC': 'unique models seen on updates, grouped by Cacao, in past day',
       'EXPR': 'last_over_time(sum by (cacao) (increase(agent_model_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{cacao}}'
     },
     { 'TITLE': 'Unique Models by App Family by Day',
       'DESC': 'unique Models, grouped by Family, in past day',
       'EXPR': 'last_over_time(sum by (family) (increase(agent_model_uniq_da_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{family}}'
     },

    ]
}

gen_dashboard(data)

