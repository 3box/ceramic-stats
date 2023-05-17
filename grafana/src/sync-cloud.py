import os
import json

FOLDERS = {
    'Adoption' : {'prod': (20, '6YHYZKvVk'),
                  'dev': (130,'3cfiaAD4k'),
                  'clay': (37,'fppmip5Vz'),
                  'qa': (50, '-E-Amt5Vz'),
                },
    'Product': {  'prod': (17, 'nHWxziD4k'),
                  'dev': (135,'7S9sC554k'),
                  'clay': (39,'dFjZmt54k'),
                  'qa': (51, '0oo1itc4k'),
                },
    'Performance': { 'prod': (31, 'JXA6aUKVk'), 
                  'dev': (136,'gNKUj55Vz'),
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

    'product-growth-monthly': {'prod': "YOf7nKv4k",
                             'dev':'7P0Q6ccVk',
                             'clay': 'GYkQkp54z',
                             'qa': 'enmQzpc4z',
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

cloud_token = os.environ.get('CLOUD_GRAFANA_API_KEY')

POST_CMD = 'curl -X POST --insecure -H "Authorization: Bearer {}" -H "Content-Type: application/json" --data-binary "@/tmp/dash" https://threebox.grafana.net/api/dashboards/db'

GET_CLOUD_FOLDER = 'curl -X GET --insecure -H "Authorization: Bearer ' + os.environ.get('CLOUD_GRAFANA_API_KEY') + '" -H "Content-Type: application/json" https://threebox.grafana.net/api/folders/{}'

POST_CLOUD_FOLDER = 'curl -X POST --insecure -H "Authorization: Bearer ' + os.environ.get('CLOUD_GRAFANA_API_KEY') + '" -H "Content-Type: application/json" --data \'{}\' https://threebox.grafana.net/api/folders' 

def fix_folder_stuff(b_data, cloud_folder, cloud_folder_uid):
    try:
      del b_data['meta']['folderId']
    except:
      print("No folder id for " + cloud_folder)
    b_data["meta"]["folderTitle"] = cloud_folder 
    b_data["meta"]["folderUrl"] = "/dashboards/f/{}/{}".format(cloud_folder_uid, cloud_folder.lower())
    b_data['folderUid'] = cloud_folder_uid 

    # check if folder exists, create if not
    cmd = GET_CLOUD_FOLDER.format(cloud_folder_uid)
    res = json.loads(os.popen(cmd).read())
    if res.get('status','') == 'not-found': 
       folder_data = {'uid': cloud_folder_uid, 'title': cloud_folder}
       create_cmd = POST_CLOUD_FOLDER.format(json.dumps(folder_data))
       os.system(create_cmd)


for (name, boards_data) in BOARDS.items():
    print("On dashboard " + name)
    board = boards_data['prod']
    cmd = GET_CMD.format(board)
    b_src = os.popen(cmd).read() 
    b_data = json.loads(b_src)

    # to update git for reference
    with open("./static-backup/{}".format(name), 'w') as dashfile:
       json.dump(b_data, dashfile, indent=4)

    b_folder = boards_data['folder']    


    for env in boards_data.keys():
        if (env == 'folder'):
            continue
        print("\nOn env " + env)
        cloud_folder = b_folder
        (f_id, f_uid) = FOLDERS[b_folder][env]

        if env != 'prod':
            cloud_folder += '-' + env

        fix_folder_stuff(b_data, cloud_folder, f_uid) 

        uid = boards_data[env]
        b_data['dashboard']['uid'] = uid 
        b_data['dashboard']['id'] = None
        b_data['overwrite'] = True
        b_data['message'] = "Updated to sync with prod"

        # prod alerts do not apply to other environments
        for panel in b_data['dashboard']['panels']:
           if ('alert' in panel):
              del panel['alert']

        with open("/tmp/dash", 'w') as dashfile:
           json.dump(b_data, dashfile, indent=4)
        print('---')
        os.system(POST_CMD.format(cloud_token, env)) 

