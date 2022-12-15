import os
import json

BOARDS =  {
    'partner-activity': {  'prod': "Ggt4khSVz",
                           'dev': 'UguLUccVz',
                           'clay': "Ggt4khSVz",
                           'qa': "Z3wUkt5Vz",
                          },
    'cas-performance': { 'prod': "2ufgfUKVz",
                         'dev': '_8tQe554z',
                         'clay': 'aouUzt54z',
                         'qa': 'gkrUkpc4z',
                       },
    'cas-errors-and-warnings': { 'prod': "Tqcpk_H4k",
                                 'dev': "UU2wec5Vz",
                                'clay': "mbC8ztcVk",
                                 'qa': None,
                                },
    'product-growth-daily': {'prod': "iUTyCdDVk",
                             'dev':'DsoQe5cVz',
                             'clay': 'iUTyCdDVk',
                             'qa': 'qGRwzt5Vz',
                            },

    'product-growth-monthly': {'prod': "YOf7nKv4k",
                             'dev':'7P0Q6ccVk',
                             'clay': 'GYkQkp54z',
                             'qa': 'enmQzpc4z',
                            },

    'product-insights-daily': {'prod': "94uYVKD4z",
                             'dev':'ZQJw65c4z',
                             'clay': '94uYVKD4z',
                             'qa': 'UAGQkt54z',
                            },

    'product-insights-monthly': {'prod': "74uYVKD8z",
                             'dev':'k9bwe554z',
                             'clay': 'LHVwktcVk',
                             'qa': 'i9Vwkt5Vk',
                            },

}

GET_CMD = 'curl -X GET --insecure -H "Authorization: Bearer ' + os.environ.get('CERAMIC_GRAFANA_API_KEY') + '" -H "Content-Type: application/json" https://ceramic-stats.3boxlabs.com/api/dashboards/uid/{}'

tokens = {
  'dev' : os.environ.get('CERAMIC_DEV_GRAFANA_API_KEY'),
  'clay': os.environ.get('CERAMIC_CLAY_GRAFANA_API_KEY'),
  'qa': os.environ.get('CERAMIC_QA_GRAFANA_API_KEY'),
}

POST_CMD = 'curl -X POST --insecure -H "Authorization: Bearer {}" -H "Content-Type: application/json" --data-binary "@/tmp/dash" https://ceramic-stats-{}.3boxlabs.com/api/dashboards/db'

for (name, envs) in BOARDS.items():
    print("On dashboard " + name)
    board = envs['prod']
    cmd = GET_CMD.format(board)
    b_src = os.popen(cmd).read() 
    b_data = json.loads(b_src)

    # to update git for reference
    with open("./dashboards/static/{}".format(name), 'w') as dashfile:
       json.dump(b_data, dashfile, indent=4)

    for env in envs.keys():
        if (env == 'prod'):
            continue
        print("Updating environment " + env)
        uid = envs[env]
        b_data['dashboard']['uid'] = uid 
        b_data['dashboard']['id'] = None
        b_data['overwrite'] = True
        with open("/tmp/dash", 'w') as dashfile:
           json.dump(b_data, dashfile, indent=4)
        print("complete")

        token = tokens[env]
        os.system(POST_CMD.format(token, env)) 

