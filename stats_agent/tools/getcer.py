import bs4 as bs

import requests

source = requests.get('https://cerscan.com', verify=False).content

soup = bs.BeautifulSoup(source)

import pdb; pdb.set_trace()
