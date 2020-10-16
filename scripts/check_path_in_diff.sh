#!/bin/sh

set -o nounset
set -o errexit
set -o pipefail

FILE=$1

LATEST_COMMIT=$(git rev-parse HEAD)

LATEST_FILE_COMMIT=$(git log -1 --format=format:%H --full-diff $FILE)

if [ $LATEST_FILE_COMMIT = $LATEST_COMMIT ];
    then
        echo 0
else
    echo 1
fi
