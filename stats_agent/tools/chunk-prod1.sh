#!/bin/zsh

. venv/bin/activate

for x in {0..11000..1000}; do
   tail +$x prod1.data | head -10000 | python3 import.py &
done
