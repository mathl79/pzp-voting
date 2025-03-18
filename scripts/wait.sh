 #!/bin/bash

# Simple script to wait for a specified number of seconds
# Usage: ./wait.sh <seconds>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <seconds>"
    exit 1
fi

sleep $1