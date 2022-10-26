from gen_dashboard import gen_dashboard

VERSION = '9'

data = {
    'ID': '14',
    'DESC': 'overview of product activity',
    'TITLE': 'Product Overview - CLAY',
    'UID': '_CRrny7Vk',
    'VERSION': VERSION,

    'PANELS': [
     { 'TITLE': 'Streams - Daily Unique',
       'DESC': 'Unique stream counts by day, vs week prior',
       'TARGETS': [ {
           'EXPR': 'last_over_time(sum(increase(agent_stream_uniq_da_total[1d] offset -1d)) without (job, instance) [1d:1d])',
           'LEGEND': 'this week'
          }, {
           'EXPR': 'last_over_time(sum(increase(agent_stream_uniq_da_total[1d] offset 1w)) without (job, instance) [1d:1d])',
           'LEGEND': 'last week'
          }]
     },
     { 'TITLE': 'Controllers - Daily Unique',
       'DESC': 'Unique controller counts by day, vs week prior',
       'TARGETS': [ {
           'EXPR': 'last_over_time(sum(increase(agent_controller_uniq_da_total[1d] offset -1d)) without (job, instance) [1d:1d])',
           'LEGEND': 'this week'
          }, {
           'EXPR': 'last_over_time(sum(increase(agent_controller_uniq_da_total[1d] offset 1w)) without (job, instance) [1d:1d])',
           'LEGEND': 'last week'
          }]
     },

     { 'TITLE': 'Apps (CACAO) Activity',
       'DESC': 'Total counts of CACAO domains seen on stream updates',
       'EXPR': 'last_over_time(increase(agent_cacao_total[1d])[1d:1d])',
       'LEGEND': '{{cacao}}'
     },
     { 'TITLE': 'Apps Family Activity',
       'DESC': 'Total counts of app Families seen',
       'EXPR': 'last_over_time(sum by (family) (increase(agent_stream_total[1d] offset -1d))[1d:1d])',
       'LEGEND': '{{family}}'
     },
     { 'TITLE': 'Models - Daily Unique',
       'DESC': 'Unique model counts by day, vs week prior',
       'TARGETS': [ {
           'EXPR': 'last_over_time(sum(increase(agent_model_uniq_da_total[1d] offset -1d)) without (job, instance) [1d:1d])',
           'LEGEND': 'this week'
          }, {
           'EXPR': 'last_over_time(sum(increase(agent_model_uniq_da_total[1d] offset 1w)) without (job, instance) [1d:1d])',
           'LEGEND': 'last week'
          }]
     },


     { 'TITLE': 'Nodes (peer ids) - Daily Unique',
       'DESC': 'Unique Node (peer id) counts by day, vs week prior',
       'TARGETS': [ {
           'EXPR': 'last_over_time(sum(increase(agent_peer_id_uniq_da_total[1d] offset -1d)) without (job, instance) [1d:1d])',
           'LEGEND': 'this week'
          }, {
           'EXPR': 'last_over_time(sum(increase(agent_peer_id_uniq_da_total[1d] offset 1w)) without (job, instance) [1d:1d])',
           'LEGEND': 'last week'
          }]
     },

    ]
}

gen_dashboard(data)

