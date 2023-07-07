import os
import json

FOLDERS = {
    'Adoption' : {'dev': (130,'3cfiaAD4k'),
                  'clay': (37,'fppmip5Vz'),
                  'qa': (50, '-E-Amt5Vz'),
                },
    'Product': {'dev': (135,'7S9sC554k'),
                  'clay': (39,'dFjZmt54k'),
                  'qa': (51, '0oo1itc4k'),
                },
    'Performance': { 'dev': (136,'gNKUj55Vz'),
                  'clay': (38,'FFQiipc4z'),
                  'qa': (49, 'BXDAmt54k'),
                },
  }

BOARDS =  {
    'partner-activity': {  'prod': "Ggt4khSVz",
                           'dev': 'UguLUccVz',
                           'clay': "Ggt4khSVz",
                           'qa': "Z3wUkt5Vz",
        'folder':'Adoption'
                          },
    'cas-performance': { 'prod': "2ufgfUKVz",
                         'dev': '_8tQe554z',
                         'clay': 'aouUzt54z',
                         'qa': 'gkrUkpc4z',
          'folder': 'Performance',
                       },
    'cas-errors-and-warnings': { 'prod': "Tqcpk_H4k",
                                 'dev': "UU2wec5Vz",
                                'clay': "mbC8ztcVk",
                                 'qa': None,
           'folder': 'Performance',
                                },
    'product-growth-daily': {'prod': "iUTyCdDVk",
                             'dev':'DsoQe5cVz',
                             'clay': 'iUTyCdDVk',
                             'qa': 'qGRwzt5Vz',
             'folder': 'Product',
                            },

    'product-insights-daily': {'prod': "94uYVKD4z",
                             'dev':'ZQJw65c4z',
                             'clay': '94uYVKD4z',
                             'qa': 'UAGQkt54z',
             'folder': 'Product',
                            },

    'product-insights-monthly': {'prod': "74uYVKD8z",
                             'dev':'k9bwe554z',
                             'clay': 'LHVwktcVk',
                             'qa': 'i9Vwkt5Vk',
             'folder': 'Product',
                            },

}

GET_CMD = 'curl -X GET --insecure -H "Authorization: Bearer ' + os.environ.get('CERAMIC_GRAFANA_API_KEY') + '" -H "Content-Type: application/json" https://ceramic-stats.3boxlabs.com/api/dashboards/uid/{}'

tokens = {
  'dev' : os.environ.get('CERAMIC_DEV_GRAFANA_API_KEY'),
  'clay': os.environ.get('CERAMIC_CLAY_GRAFANA_API_KEY'),
  'qa': os.environ.get('CERAMIC_QA_GRAFANA_API_KEY'),
}

POST_CMD = 'curl -X POST --insecure -H "Authorization: Bearer {}" -H "Content-Type: application/json" --data-binary "@/tmp/dash" https://ceramic-stats-{}.3boxlabs.com/api/dashboards/db'

for (name, boards_data) in BOARDS.items():
    print("On dashboard " + name)
    board = boards_data['prod']
    cmd = GET_CMD.format(board)
    b_src = os.popen(cmd).read() 
    b_data = json.loads(b_src)

    # to update git for reference
    with open("./static-backup/{}".format(name), 'w') as dashfile:
       json.dump(b_data, dashfile, indent=4)

    for env in boards_data.keys():
        if (env == 'prod'):
            continue
        if (env == 'folder'):
            continue
        print("\nOn env " + env)
        uid = boards_data[env]
        b_data['dashboard']['uid'] = uid 
        b_data['dashboard']['id'] = None
        b_data['overwrite'] = True
        (f_id, f_uid) = FOLDERS[boards_data['folder']][env]
        b_data['folderUid'] = f_uid
        b_data['folderId'] = f_id
        b_data['message'] = "Updated to sync with prod"

        # prod alerts do not apply to other environments
        for panel in b_data['dashboard']['panels']:
           if ('alert' in panel):
              del panel['alert']

        with open("/tmp/dash", 'w') as dashfile:
           json.dump(b_data, dashfile, indent=4)
        print('---')
        token = tokens[env]
        os.system(POST_CMD.format(token, env)) 

