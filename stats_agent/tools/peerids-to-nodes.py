import os

with open('peerids.txt', 'r') as f:
   for line in f:
     (peerid, vers) = line.strip().split(':')
     cmd = 'echo {}:{} >> outfil.txt '.format(peerid, vers)
     nextcmd = 'ipfs dht findpeer {} --timeout 4s >> outfil.txt'.format(peerid)
     nextcmd2 = ' echo "------------------">>outfil.txt'
     print(cmd)
     os.system(cmd)
     try:
        print(nextcmd)
        os.system(nextcmd)
     except:
        console.log("timeout")
        pass
     os.system(nextcmd2)
