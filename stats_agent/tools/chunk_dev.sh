#!/bin/zsh
. venv/bin/activate
for x in {0..14000..1000}; do
   tail +$x dev.data | head -1000 | python3 import.py &
done
