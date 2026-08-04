#!/bin/bash
find android -name "*.gradle" -exec sed -i 's/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g' {} \;
echo "✓ Java version parcheado a 17"
