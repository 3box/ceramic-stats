#!/bin/zsh
. venv/bin/activate
for x in {0..110000..10000}; do
   tail +$x tnet.data | head -10000 | python3 import.py &
done
